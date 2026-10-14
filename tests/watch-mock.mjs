// テスト用の前読み（node --import）: 見張り（eval/watch.mts）が呼ぶ Gemini と GitHub を偽物に差し替える（tests/p23.test.mts）。
// 環境変数で場面を決める:
//   MOCK_MODELS  … 一覧に出すモデル（カンマ区切り）
//   MOCK_STATUS  … モデルごとの HTTP（JSON。無ければ 200）。"429:0" は枠が 0（課金が要る）
//   MOCK_OPEN    … 開いている Issue の題（JSON の配列）
//   MOCK_LOG     … 呼ばれた中身を1行ずつ書くファイル（使った鍵の名前・立てた Issue の題）
import { appendFileSync } from "node:fs";

const models = (process.env.MOCK_MODELS ?? "").split(",").filter(Boolean);
const status = JSON.parse(process.env.MOCK_STATUS ?? "{}");
const open = JSON.parse(process.env.MOCK_OPEN ?? "[]");
const log = (o) => appendFileSync(process.env.MOCK_LOG, JSON.stringify(o) + "\n");
const json = (body, s = 200) => new Response(JSON.stringify(body), { status: s, headers: { "content-type": "application/json" } });
/** どの鍵で呼んだか（値そのものは残さない） */
const whichKey = (init) => {
  const k = init?.headers?.["x-goog-api-key"];
  return k === process.env.GEMINI_EVAL_API_KEY ? "eval" : k === process.env.GEMINI_API_KEY ? "prod" : "other";
};

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.includes("generativelanguage.googleapis.com") && url.includes("/models?")) {
    log({ kind: "list", key: whichKey(init) });
    return json({ models: models.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ["generateContent"] })) });
  }
  const gen = url.match(/\/models\/([^:]+):generateContent/);
  if (gen) {
    const m = gen[1];
    log({ kind: "gen", model: m, key: whichKey(init) });
    const s = status[m] ?? 200;
    if (s === "429:0") return json({ error: { code: 429, message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 0" } }, 429);
    if (s !== 200) return json({ error: { code: s, message: "mock" } }, s);
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ sections: [{ id: "gaiyou", tokens: [{ t: "p", s: "偽の変換" }] }], spill: [], insights: [] }) }] } }] });
  }
  if (url.startsWith("https://api.github.com/") && (init.method ?? "GET") === "GET") {
    log({ kind: "gh-list" });
    return json(open.map((title, i) => ({ number: i + 1, title })));
  }
  if (url.startsWith("https://api.github.com/") && init.method === "POST") {
    const b = JSON.parse(init.body);
    log({ kind: "gh-post", title: b.title, body: b.body.slice(0, 4000) });
    return json({ number: 99 }, 201);
  }
  throw new Error(`想定していない呼び出し: ${url}`);
};
