// Gemini REST クライアント。
//
// [DECISION 2026-09-09] **再現性を優先する**（2026-08-17「モデル名を固定しない」の条件変更。廃止ではない）。
//   同じメモを2回変換して振り分けが変わると、どちらが正しいか利用者が判断できず記録の道具にならない。
//   経緯: 一覧を新しい順に試す設計だと、上位のモデルが混雑（HTTP 503）で落ちるたびに別のモデルが当たり、
//   実測5回で 3.6 / 3.7 / 3.6 / 3.6 / 3.5 と3種類に散らばっていた（2026-09-09・ダミーメモ01で実測）。
//   → **優先順位のリストの中だけを順に試し、すべて使えなければそこで止める**
//   （2026-09-10 P7-d で、一覧の他のモデルへ流さないよう範囲を限定した）。
//   → [DECISION 2026-10-14・設計側] **リストを「試験済み」と「緊急用」の2段にした**（P23・下の `MODEL_TIERS`）。緊急用は試験済みが
//   すべて混雑・枠切れ・使えないときだけ使い、読んだ記録に印を付ける。2段の外のモデルへは流さない（P7-d のまま）。
//   モデル名のハードコードではなく「段ごとの優先順位」であり、評価キットで測って見直す前提。
// [DECISION 2026-09-09] 生成パラメータは構造化タスク向けに **temperature: 0**（決め打ちの復号）。
//   0.2 では同じ画像でも振り分けが揺れた。
// APIキーは URL に載せず x-goog-api-key ヘッダで送る（ログ・履歴への漏れ防止）。

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * モデルの一覧は**2段**（P23・設計側の決定）。**定義はここ1か所**（評価キット・毎日の見張りもここを読む）。
 *   - tested（試験済み）: 試験を通ったモデルだけ。この順に試す
 *   - emergency（緊急用）: **試験済みがすべて混雑・枠切れ・使えない（無くなった・課金が要る）のときだけ**この順に試す
 *     （2026-10-06 のユーザー決定「緊急時は流す」）。緊急用で読んだ記録には印が付き、確認画面の上に注意を出す
 *
 * [DECISION 2026-10-14・設計側] **試験済みは gemini-3.5-flash だけ**（P7-c の実績。評価キットでの測定は後で行う）。
 *   **gemini-3.6-flash と gemini-3.5-flash-lite は緊急用**。P22 まで 3.6 を優先リストの2番手に置いていたため、3.5 が混雑すると
 *   試験を通っていない 3.6 に黙って回っていた（2026-10-14 12:30 の実例）。
 * [DECISION 2026-10-14] 緊急用の順は **3.5-flash-lite → 3.6-flash**（判断は委ねられた）。3.6 は P7-c で書かれていない事実を作り申告しなかった
 *   （分かっている悪いふるまい）。3.5-flash-lite は試験済みと同じ世代で、Lite は1日の枠と混み具合が別なので混雑の日に通りやすい。
 *   分かっている悪さより、未知を先にする。どちらも評価キットで測れたら並びを見直す。
 * [DECISION 2026-09-10]（P7-c・経緯）先頭を gemini-3.5-flash にした。判読しにくい手書き（`docs/samples/dummy-memo-04-hard.png`）で
 *   3.6-flash は潰した「訪看」を「姉から声かけ」と読み替えて黄で申告せず、3.5-flash は5か所すべてを黄または青で申告した。
 *   **並びは「速さ」ではなく「読めない箇所を申告するか」で決める**（設計の核）。変えるときは評価キット（`node eval/run.mts`）で測ってから。
 */
export const MODEL_TIERS = {
  tested: ["gemini-3.5-flash"],
  emergency: ["gemini-3.5-flash-lite", "gemini-3.6-flash"],
} as const;

/** 試験済み＋緊急用（この順）。一覧に無いものは使わない */
export const ALL_TIER_MODELS: readonly string[] = [...MODEL_TIERS.tested, ...MODEL_TIERS.emergency];

type ModelInfo = { name: string; supportedGenerationMethods?: string[] };

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY が .env.local に設定されていません");
  return key;
}

// 画像入力（マルチモーダル）を想定しないモデルを名前で除外する
const EXCLUDE = /embedding|embed|tts|audio|live|imagen|veo|gemma|learnlm|aqa|-image(-|$)|image-generation/i;

function versionOf(name: string): number {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/i);
  return m ? parseFloat(m[1]) : 0;
}

function isPreview(name: string): boolean {
  return /preview|exp|latest/i.test(name);
}

export function orderCandidates(models: ModelInfo[]): string[] {
  return models
    .filter(
      (m) =>
        /gemini/i.test(m.name) &&
        !EXCLUDE.test(m.name) &&
        (m.supportedGenerationMethods ?? []).includes("generateContent")
    )
    .map((m) => m.name.replace(/^models\//, ""))
    .sort((a, b) => {
      const v = versionOf(b) - versionOf(a); // 版数降順
      if (v !== 0) return v;
      const p = Number(isPreview(a)) - Number(isPreview(b)); // 安定版を先に
      if (p !== 0) return p;
      const f = Number(/flash/i.test(b)) - Number(/flash/i.test(a)); // flash 優先
      if (f !== 0) return f;
      return a.localeCompare(b);
    });
}

/**
 * 一覧（`orderCandidates` の結果）にある分だけを2段に分ける（定義の順のまま）。一覧に無いモデルは使わない。
 * [DECISION 2026-09-10]（P7-d）**一覧の他のモデルへは流さない**（2段の外のモデルは使わない）。一覧取得は耐更改のため維持する。
 */
export function tiersIn(ordered: string[], tiers: { tested: readonly string[]; emergency: readonly string[] } = MODEL_TIERS) {
  return {
    tested: tiers.tested.filter((m) => ordered.includes(m)),
    emergency: tiers.emergency.filter((m) => ordered.includes(m)),
  };
}

/** 失敗の理由（利用者への案内を変える）。unavailable＝モデルが無くなった・課金が要る・鍵が通らない */
export type FailReason = "quota" | "busy" | "unavailable" | "error";

/**
 * 1回の呼び出しの失敗の種類。**緊急用に回してよいのは busy・quota・gone・paid だけ**（P23・設計側）。
 *   busy＝混雑（503・500・502・504）／quota＝1日の上限（429）／paid＝課金が要る（429 で枠が 0・400 の課金や地域の制限・403）／
 *   gone＝無くなった（404・一覧に無い）／error＝それ以外（送った中身の問題などで、別のモデルに回しても直らない）
 */
export type FailKind = "busy" | "quota" | "paid" | "gone" | "error";

export function failKind(status: number, body = ""): FailKind {
  if ([500, 502, 503, 504].includes(status)) return "busy";
  if (status === 429) return /limit:\s*0\b|free_tier[^"]*limit:\s*0/i.test(body) ? "paid" : "quota";
  if (status === 404) return "gone";
  if (status === 403) return "paid";
  if (status === 400 && /FAILED_PRECONDITION|billing|not supported|free tier/i.test(body)) return "paid";
  return "error";
}

/** 緊急用に回してよい失敗か */
export const fallsBack = (k: FailKind) => k !== "error";

/**
 * 試した結果から、利用者に伝える理由を決める。1つでも混雑があれば混雑（待てば直るかもしれない）。
 * 次に上限、次に使えない（無くなった・課金が要る）。
 */
export function reasonOfKinds(kinds: FailKind[]): FailReason {
  if (kinds.length === 0) return "error";
  if (kinds.includes("busy")) return "busy";
  if (kinds.includes("quota")) return "quota";
  if (kinds.every((k) => k === "gone" || k === "paid")) return "unavailable";
  return "error";
}

/**
 * 画面に出す文言の正本（`tests/p6.test.mts` が検査する）。
 * 2文目で「入力は残っている」ことを伝える（作業が消えたのかどうかが最初の不安だから）。
 */
const ERROR_TEXT = "変換できませんでした。もう一度試してください。メモと伏せた箇所はそのまま残っています。";
export const FAIL_TEXT: Record<FailReason, string> = {
  quota: "本日の利用上限に達しました。明日また試してください。メモと伏せた箇所はそのまま残っています。",
  busy: "いま混み合っています。少し待ってから、もう一度試してください。メモと伏せた箇所はそのまま残っています。",
  // [DECISION 2026-10-14] 使えない（無くなった・課金が要る）ときの専用の文言は設計側の承認待ち（P23 の報告で提案）。
  //   それまでは既存の「変換できませんでした」を使う（新しい文言を勝手に足さない）
  unavailable: ERROR_TEXT,
  error: ERROR_TEXT,
};

/**
 * 一覧を引き、画像を読めるモデルの名前を並べて返す（`orderCandidates`）。
 * key を渡さなければ本番の鍵。毎日の見張り（eval/watch.mts）は評価用の鍵を渡す（P23）。
 */
export async function listCandidates(key: string = apiKey()): Promise<string[]> {
  const res = await fetch(`${BASE}/models?pageSize=1000`, {
    headers: { "x-goog-api-key": key },
  });
  if (!res.ok) {
    throw new Error(`モデル一覧の取得に失敗: HTTP ${res.status} ${(await res.text()).slice(0, 2000)}`);
  }
  const json = (await res.json()) as { models?: ModelInfo[] };
  return orderCandidates(json.models ?? []);
}

/** 一覧を引いて2段に分ける（一覧にあるものだけ）。どちらも空なら止める（2段の外へは流さない） */
async function listTiers(): Promise<{ tested: string[]; emergency: string[] }> {
  const t = tiersIn(await listCandidates());
  if (t.tested.length + t.emergency.length === 0) {
    throw new Error("試験済みも緊急用も一覧にありません（MODEL_TIERS の見直しが必要です）");
  }
  return t;
}

export type ImagePart = { mimeType: string; base64: string };

/** tier: 読んだモデルの段。"emergency" なら記録に印を付け、確認画面の上に注意を出す（P23） */
export type GeminiResult =
  | { ok: true; model: string; text: string; tried: string[]; tier: "tested" | "emergency" }
  | { ok: false; reason: FailReason; error: string; tried: string[] };

/** 1つのモデルを1回呼んだ結果。status は HTTP（中身が無い成功は 0） */
export type CallResult = { ok: true; text: string } | { ok: false; status: number; error: string };

/**
 * **指定した1つのモデルを1回だけ呼ぶ**（フォールバックしない）。本番の `generateWithFallback` も評価キット（eval/）もこれを使う。
 * [DECISION 2026-10-14] 評価キット（P20）がモデルを名指しで測れるよう、試す順の外に切り出した（送る中身・生成パラメータは変えていない）。
 * key を渡さなければ GEMINI_API_KEY（本番と同じ）。有料枠など別の鍵で測るときだけ評価キットが渡す。
 */
export async function callModel(model: string, prompt: string, images: ImagePart[], key: string = apiKey()): Promise<CallResult> {
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            ...images.map((im) => ({
              inline_data: { mime_type: im.mimeType, data: im.base64 },
            })),
          ],
        },
      ],
      generationConfig: {
        // 構造化タスクなので決め打ちの復号にする（同じメモは同じ振り分けになってほしい）
        temperature: 0,
        response_mime_type: "application/json",
        maxOutputTokens: 16384,
      },
    }),
  });

  if (!res.ok) {
    // 中身は 2000字まで残す（429 のどの枠に当たったか・課金が要るか＝枠が 0 かを見分けるため。P22 では 500字で切れて読めなかった）
    return { ok: false, status: res.status, error: `HTTP ${res.status} (${model}): ${(await res.text()).slice(0, 2000)}` };
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  if (!text) {
    // HTTPは成功だが中身が無い＝一時的な失敗として扱う
    return { ok: false, status: 0, error: `${model}: 応答にテキストがありません (finishReason=${json.candidates?.[0]?.finishReason})` };
  }
  return { ok: true, text };
}

let workingModel: string | null = null; // 最後に成功した試験済みのモデルを先に試す
let workingTiers: { tested: string[]; emergency: string[] } | null = null; // 一覧はプロセス内でキャッシュする（毎回引かない）

/**
 * [DECISION 2026-10-14] **失敗したモデルを、しばらく呼び直さない**（P23）。失敗した呼び出しも1日の枠に数えられ、P22 では約10回で 429 になった。
 *   混雑（503 など）は 60秒、上限（429）は 15分、無くなった・課金が要るは 10分。その間は呼ばずに同じ失敗として扱う（試験済みなら緊急用へ進む）。
 *   以前（P22 まで）は自動のやり直しは0回で、1回の変換で優先リストを間をあけずに1回ずつ試していた（いまも1回の変換で同じモデルは1回まで）。
 *   利用者が「もう一度試す」を続けて押しても、同じモデルを短い間隔で重ねて呼ばない。プロセスごとの記憶なので、別のプロセスでは数え直す。
 */
export const COOLDOWN_MS: Record<Exclude<FailKind, "error">, number> = { busy: 60_000, quota: 15 * 60_000, gone: 10 * 60_000, paid: 10 * 60_000 };
const cooling = new Map<string, { until: number; kind: FailKind }>();

/** いま呼ばないでおくモデルか（あれば、その失敗の種類） */
export function coolingKind(model: string, now = Date.now()): FailKind | null {
  const c = cooling.get(model);
  if (!c) return null;
  if (now >= c.until) {
    cooling.delete(model);
    return null;
  }
  return c.kind;
}
export function coolDown(model: string, kind: FailKind, now = Date.now()): void {
  if (kind === "error") return;
  cooling.set(model, { until: now + COOLDOWN_MS[kind], kind });
}
/** テスト用: 記憶を消す */
export function resetGeminiState(): void {
  cooling.clear();
  workingModel = null;
  workingTiers = null;
}

/** 試験済みの中だけを、直近で成功したものから順に試す。**2段の外へは出ない** */
export function orderForTry(list: string[], last: string | null): string[] {
  if (!last || !list.includes(last)) return list;
  return [last, ...list.filter((m) => m !== last)];
}

/** 1つのモデルを呼ぶ関数（テストで差し替える） */
export type Caller = (model: string, prompt: string, images: ImagePart[]) => Promise<CallResult>;

/**
 * 試験済み → （試験済みがすべて混雑・枠切れ・使えないときだけ）緊急用、の順に試す。
 * 試験済みで「それ以外の失敗（error）」が出たら、緊急用には回さずに止める（別のモデルでは直らない）。
 */
export async function tryTiers(
  tiers: { tested: string[]; emergency: string[] },
  prompt: string,
  images: ImagePart[],
  call: Caller = (m, p, i) => callModel(m, p, i)
): Promise<GeminiResult> {
  const tried: string[] = [];
  const kinds: FailKind[] = [];
  let lastError = "";
  const attempt = async (model: string): Promise<{ ok: true; text: string } | { ok: false; kind: FailKind }> => {
    const c = coolingKind(model);
    if (c) {
      lastError = `${model}: 少し前に失敗したので呼んでいない（${c}）`;
      return { ok: false, kind: c };
    }
    tried.push(model);
    const r = await call(model, prompt, images);
    if (r.ok) return r;
    const kind = failKind(r.status, r.error);
    coolDown(model, kind);
    lastError = r.error;
    return { ok: false, kind };
  };
  if (tiers.tested.length === 0) kinds.push("gone"); // 試験済みが一覧から消えた
  for (const model of orderForTry(tiers.tested, workingModel)) {
    const r = await attempt(model);
    if (r.ok) {
      workingModel = model;
      return { ok: true, model, text: r.text, tried, tier: "tested" };
    }
    kinds.push(r.kind);
    if (workingModel === model) workingModel = null;
    if (!fallsBack(r.kind)) {
      return { ok: false, reason: "error", error: `試験済みのモデルで変換できません（緊急用には回さない）。最後のエラー: ${lastError}`, tried };
    }
  }
  // 試験済みがすべて混雑・枠切れ・使えない → 緊急用（P23・設計側。2026-10-06 のユーザー決定「緊急時は流す」）
  for (const model of tiers.emergency) {
    const r = await attempt(model);
    if (r.ok) return { ok: true, model, text: r.text, tried, tier: "emergency" };
    kinds.push(r.kind);
  }
  return { ok: false, reason: reasonOfKinds(kinds), error: `試験済みも緊急用も使えません。最後のエラー: ${lastError}`, tried };
}

export async function generateWithFallback(prompt: string, images: ImagePart[]): Promise<GeminiResult> {
  workingTiers ??= await listTiers();
  const r = await tryTiers(workingTiers, prompt, images);
  // 全滅したら一覧のキャッシュも捨てる（モデルが増減していたら次回に拾えるように）
  if (!r.ok) workingTiers = null;
  return r;
}
