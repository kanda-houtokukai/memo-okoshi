// 評価キット（P20）が呼ぶモデルの提供元。モデルは「提供元:モデル名」で指定する（例: gemini:gemini-3.5-flash）。
//
// [DECISION 2026-10-14] **Gemini は本番と同じ呼び出し（lib/gemini.ts の callModel）を使う**。評価のための別の作りにしない。
// [DECISION 2026-10-14] 他社や有料枠は、ここに1件足し、鍵を環境変数（.env.local）に置けば測れる作りにする。**今回は足さない**（鍵も作らない）。
//   足し方:
//   - Gemini の有料枠: { id: "gemini-paid", keyEnv: "GEMINI_PAID_API_KEY", call: (m, p, i, k) => callModel(m, p, i, k) }
//     （呼び方は本番と同じで、鍵だけが違う）
//   - Anthropic・OpenAI など: keyEnv にその社の鍵の名前、call に「プロンプト（lib/prompt.ts の buildPrompt のまま）と画像（base64・JPEG）を送り、
//     返答の本文（JSON のはずの文字列）を返す」関数を書く。返答は本番と同じ lib/convert-core.ts の finishConversion に通るので、
//     採点（eval/score.ts）はそのまま使える。HTTP の失敗は { ok:false, status } で返す（429＝枠切れ・503＝混雑として数える）。
//   ⚠️ 本番で他社のモデルを使うには、その社の規約（送った内容の扱い）を規程整理で確かめる必要がある。評価で測れることと、本番で使えることは別。

import { callModel, type CallResult, type ImagePart } from "../lib/gemini.ts";

export type Provider = {
  id: string;
  /** 鍵を置く環境変数の名前 */
  keyEnv: string;
  call: (model: string, prompt: string, images: ImagePart[], key: string) => Promise<CallResult>;
};

export const PROVIDERS: Record<string, Provider> = {
  gemini: { id: "gemini", keyEnv: "GEMINI_API_KEY", call: (m, p, i, k) => callModel(m, p, i, k) },
};

/** 「提供元:モデル名」を分ける。提供元を省いたら gemini */
export function parseModelSpec(spec: string): { provider: Provider; model: string } {
  const i = spec.indexOf(":");
  const pid = i > 0 ? spec.slice(0, i) : "gemini";
  const model = i > 0 ? spec.slice(i + 1) : spec;
  const provider = PROVIDERS[pid];
  if (!provider) throw new Error(`知らない提供元: ${pid}（使えるのは ${Object.keys(PROVIDERS).join(", ")}。足し方は eval/providers.ts の先頭）`);
  if (!model) throw new Error(`モデル名がありません: ${spec}`);
  return { provider, model };
}
