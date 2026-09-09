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
 * 2026-09-09時点の実測: 3.8/3.7-flash は混雑で 503 が出やすく、3.6-flash が安定していた。
 */
const PREFERRED = ["gemini-3.6-flash", "gemini-3.5-flash"];

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

/** 優先リスト（一覧にあるものだけ）→ 従来の並び、の順につないだ候補列 */
export function withPreferred(ordered: string[], preferred: string[] = PREFERRED): string[] {
  const head = preferred.filter((m) => ordered.includes(m));
  return [...head, ...ordered.filter((m) => !head.includes(m))];
}

async function listCandidates(): Promise<string[]> {
  const res = await fetch(`${BASE}/models?pageSize=1000`, {
    headers: { "x-goog-api-key": apiKey() },
  });
  if (!res.ok) {
    throw new Error(`モデル一覧の取得に失敗: HTTP ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { models?: ModelInfo[] };
  const ordered = withPreferred(orderCandidates(json.models ?? []));
  if (ordered.length === 0) throw new Error("試行できるGeminiモデルが一覧にありません");
  return ordered;
}

export type ImagePart = { mimeType: string; base64: string };

export type GeminiResult =
  | { ok: true; model: string; text: string; tried: string[] }
  | { ok: false; error: string; tried: string[] };

let workingModel: string | null = null; // 最初に成功したモデルを使い続ける

const MAX_TRIALS = 6;

export async function generateWithFallback(
  prompt: string,
  images: ImagePart[]
): Promise<GeminiResult> {
  const candidates = workingModel ? [workingModel] : await listCandidates();
  const tried: string[] = [];
  let lastError = "";

  for (const model of candidates.slice(0, MAX_TRIALS)) {
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
      lastError = `HTTP ${res.status} (${model}): ${(await res.text()).slice(0, 500)}`;
      // このモデル固有の失敗（404/400/429等）→ 次の候補へ。キャッシュは無効化
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
      lastError = `${model}: 応答にテキストがありません (finishReason=${json.candidates?.[0]?.finishReason})`;
      continue;
    }
    workingModel = model;
    return { ok: true, model, text, tried };
  }

  return { ok: false, error: `全候補で失敗。最後のエラー: ${lastError}`, tried };
}
