// Gemini REST クライアント。
//
// [DECISION 2026-09-09] **再現性を優先する**（2026-08-17「モデル名を固定しない」の条件変更。廃止ではない）。
//   同じメモを2回変換して振り分けが変わると、どちらが正しいか利用者が判断できず記録の道具にならない。
//   経緯: 一覧を新しい順に試す設計だと、上位のモデルが混雑（HTTP 503）で落ちるたびに別のモデルが当たり、
//   実測5回で 3.6 / 3.7 / 3.6 / 3.6 / 3.5 と3種類に散らばっていた（2026-09-09・ダミーメモ01で実測）。
//   → **優先順位のリスト（PREFERRED）を先に試し、使えなければ従来どおり一覧を新しい順に試す**。
//   モデル名のハードコードではなく「優先順位」であり、リストは見直す前提（新しい版が安定したら入れ替える）。
// [DECISION 2026-09-09] 生成パラメータは構造化タスク向けに **temperature: 0**（決め打ちの復号）。
//   0.2 では同じ画像でも振り分けが揺れた。
// APIキーは URL に載せず x-goog-api-key ヘッダで送る（ログ・履歴への漏れ防止）。

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * 優先して使うモデル（この順に試す）。一覧に無い／呼んで失敗したら次へ進み、
 * すべて駄目なら従来どおり一覧を新しい順に試す。
 *
 * [DECISION 2026-09-10] 先頭を **gemini-3.5-flash** にした（2026-09-09は 3.6-flash が先頭だった）。
 *   判読しにくい手書き（`docs/samples/dummy-memo-04-hard.png`・わざと5か所を潰した素材）で比較した実測:
 *   - **3.6-flash は潰した「訪看」を「姉から声かけ」と読み替え、黄で申告せずに通した**（2回とも）。
 *     書かれていない事実を作る誤読で、黄0件の回もあった（0/1/2件）。
 *   - **3.5-flash は潰した5か所すべてを正しく読み、黄または青で申告した**（黄 2/2/4件・0件の回なし）。
 *   優先順位は「速さ」ではなく **「読めない箇所を申告するか」** で決める（設計の核）。
 *   3.5-flash は 1変換 24〜31秒（3.6-flash は 15〜20秒）だが、60秒の許容内。
 *   経緯と数値は台帳「P7-c の比較」を読むこと。並びを変えるときも同じ観点で測ってから変える。
 */
const PREFERRED = ["gemini-3.5-flash", "gemini-3.6-flash"];

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
 * 試す候補＝**優先リストのうち一覧にあるものだけ**（優先リストの順）。
 *
 * [DECISION 2026-09-10] **枠切れ・エラーのときに一覧の他のモデルへ流さない。**
 *   2026-09-09（P7）の「優先→なければ新しい順」から、**フォールバックの範囲を優先リスト内に限定**した
 *   （廃止ではなく範囲の変更）。理由: 無料枠は1日20リクエスト/モデルで、21回目から別のモデルに流れる。
 *   流れ先の 3.6-flash は**読めない箇所を申告せず、書かれていない事実を作る**ことが P7-c の実測で分かっている。
 *   **静かに品質が落ちるより、使えないと分かるほうが安全**（設計の核を守る）。
 * 一覧取得は維持する（耐更改。優先リストのモデルが廃止されたら、ここが空になって気づける）。
 */
export function preferredOnly(ordered: string[], preferred: string[] = PREFERRED): string[] {
  return preferred.filter((m) => ordered.includes(m));
}

/** 失敗の理由。画面の案内を変えるために 429（枠切れ）と 503（混雑）を分ける */
export type FailReason = "quota" | "busy" | "error";

/**
 * 試したときの HTTP ステータスから、利用者に伝える理由を決める。
 * すべて 429 なら枠切れ。1つでも 503 が混じれば「待てば直るかもしれない」なので混雑を優先する。
 */
export function reasonOf(statuses: number[]): FailReason {
  if (statuses.length === 0) return "error";
  if (statuses.includes(503)) return "busy";
  if (statuses.every((s) => s === 429)) return "quota";
  return "error";
}

/**
 * 画面に出す文言の正本（`tests/p6.test.mts` が検査する）。
 * 2文目で「入力は残っている」ことを伝える（作業が消えたのかどうかが最初の不安だから）。
 */
export const FAIL_TEXT: Record<FailReason, string> = {
  quota: "本日の利用上限に達しました。明日また試してください。メモと伏せた箇所はそのまま残っています。",
  busy: "いま混み合っています。少し待ってから、もう一度試してください。メモと伏せた箇所はそのまま残っています。",
  error: "変換できませんでした。もう一度試してください。メモと伏せた箇所はそのまま残っています。",
};

async function listCandidates(): Promise<string[]> {
  const res = await fetch(`${BASE}/models?pageSize=1000`, {
    headers: { "x-goog-api-key": apiKey() },
  });
  if (!res.ok) {
    throw new Error(`モデル一覧の取得に失敗: HTTP ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { models?: ModelInfo[] };
  const ordered = preferredOnly(orderCandidates(json.models ?? []));
  if (ordered.length === 0) {
    // 優先リストのモデルが1つも一覧に無い＝廃止された。ここで止める（他のモデルへは流さない）
    throw new Error("優先モデルが一覧にありません（PREFERRED の見直しが必要です）");
  }
  return ordered;
}

export type ImagePart = { mimeType: string; base64: string };

export type GeminiResult =
  | { ok: true; model: string; text: string; tried: string[] }
  | { ok: false; reason: FailReason; error: string; tried: string[] };

let workingModel: string | null = null; // 最初に成功したモデルを使い続ける
let workingList: string[] | null = null; // 一覧はプロセス内でキャッシュする（毎回引かない）

/** 優先リストの中だけを、直近で成功したものから順に試す。**リストの外へは出ない** */
export function orderForTry(list: string[], last: string | null): string[] {
  if (!last || !list.includes(last)) return list;
  return [last, ...list.filter((m) => m !== last)];
}

export async function generateWithFallback(
  prompt: string,
  images: ImagePart[]
): Promise<GeminiResult> {
  workingList ??= await listCandidates();
  const candidates = orderForTry(workingList, workingModel);
  const tried: string[] = [];
  const statuses: number[] = [];
  let lastError = "";

  for (const model of candidates) {
    tried.push(model);
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
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
      statuses.push(res.status);
      lastError = `HTTP ${res.status} (${model}): ${(await res.text()).slice(0, 500)}`;
      // 優先リストの次へ進む（リストの外へは出ない）。キャッシュは無効化
      if (workingModel === model) workingModel = null;
      continue;
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("");
    if (!text) {
      statuses.push(0); // HTTPは成功だが中身が無い＝一時的な失敗として扱う
      lastError = `${model}: 応答にテキストがありません (finishReason=${json.candidates?.[0]?.finishReason})`;
      continue;
    }
    workingModel = model;
    return { ok: true, model, text, tried };
  }

  // 全滅したら一覧のキャッシュも捨てる（優先モデルが増減していたら次回に拾えるように）
  workingList = null;
  return { ok: false, reason: reasonOf(statuses), error: `優先モデルがすべて使えません。最後のエラー: ${lastError}`, tried };
}
