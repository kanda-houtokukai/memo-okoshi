// 評価キット（P20）が呼ぶモデルの提供元。モデルは「提供元:モデル名」で指定する（例: gemini:gemini-3.5-flash）。
//
// [DECISION 2026-10-14] **Gemini は本番と同じ呼び出し（lib/gemini.ts の callModel）を使う**。評価のための別の作りにしない。
// [DECISION 2026-10-14・設計側] **評価と見張りは、本番と別のプロジェクトの鍵（GEMINI_EVAL_API_KEY）だけで動く**（P23）。
//   P22 で評価が本番の1日の枠（約10回/モデル）を使い切ったため。評価用の鍵が無ければ、本番の鍵があっても呼ばずに止まる（`keyFor`）。
//   ⚠️ 無料枠の上限は鍵ごとではなく**プロジェクトごと**。本番と同じプロジェクトで作った鍵は値が違っても同じ枠を食う（値では見分けられない）。
// [DECISION 2026-10-14] 他社や有料枠は、ここに1件足し、鍵を環境変数（.env.local）に置けば測れる作りにする。**今回は足さない**（鍵も作らない）。
//   足し方:
//   - Gemini の有料枠: { id: "gemini-paid", keyEnv: "GEMINI_PAID_API_KEY", call: (m, p, i, k) => callModel(m, p, i, k) }
//     （呼び方は本番と同じで、鍵だけが違う）
//   - Anthropic・OpenAI など: keyEnv にその社の鍵の名前、call に「プロンプト（lib/prompt.ts の buildPrompt のまま）と画像（base64・JPEG）を送り、
//     返答の本文（JSON のはずの文字列）を返す」関数を書く。返答は本番と同じ lib/convert-core.ts の finishConversion に通るので、
//     採点（eval/score.ts）はそのまま使える。HTTP の失敗は { ok:false, status } で返す（429＝枠切れ・503＝混雑として数える）。
//   ⚠️ 本番で他社のモデルを使うには、その社の規約（送った内容の扱い）を規程整理で確かめる必要がある。評価で測れることと、本番で使えることは別。

import { existsSync, readFileSync } from "node:fs";
import { callModel, type CallResult, type ImagePart } from "../lib/gemini.ts";

/** .env.local を読む（すでに環境変数にあるものは上書きしない。値は表示しない） */
export function loadEnvLocal(path = ".env.local"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export type Provider = {
  id: string;
  /** 鍵を置く環境変数の名前（評価用） */
  keyEnv: string;
  /** 本番が使っている鍵の環境変数の名前。評価用の鍵がこれと同じ値なら呼ばない */
  prodKeyEnv?: string;
  call: (model: string, prompt: string, images: ImagePart[], key: string) => Promise<CallResult>;
};

export const EVAL_KEY_ENV = "GEMINI_EVAL_API_KEY";
export const PROD_KEY_ENV = "GEMINI_API_KEY";

export const PROVIDERS: Record<string, Provider> = {
  gemini: { id: "gemini", keyEnv: EVAL_KEY_ENV, prodKeyEnv: PROD_KEY_ENV, call: (m, p, i, k) => callModel(m, p, i, k) },
};

export type KeyCheck = { ok: true; key: string } | { ok: false; missing: boolean; message: string };

/**
 * 評価に使う鍵を取り出す。**評価用の鍵が無い・本番の鍵と同じなら使わない**（本番の鍵へは決して切り替えない）。
 * missing: 鍵がまだ置かれていない（見張りはこのとき何もせず静かに終わる）。
 */
export function keyFor(provider: Provider, env: Record<string, string | undefined> = process.env): KeyCheck {
  const key = (env[provider.keyEnv] ?? "").trim();
  const prod = provider.prodKeyEnv ? (env[provider.prodKeyEnv] ?? "").trim() : "";
  if (!key) {
    const why = prod
      ? `本番の鍵（${provider.prodKeyEnv}）はありますが、本番の1日の枠を使ってしまうので評価には使いません。`
      : "";
    return {
      ok: false,
      missing: true,
      message: `評価用の鍵（${provider.keyEnv}）がありません。${why}本番と別のプロジェクトで鍵を作り、.env.local に ${provider.keyEnv}=… の形で置いてください（手順は eval/README.md）。`,
    };
  }
  if (prod && key === prod) {
    return {
      ok: false,
      missing: false,
      message: `評価用の鍵（${provider.keyEnv}）が本番の鍵（${provider.prodKeyEnv}）と同じです。本番の1日の枠を使ってしまうので評価しません。本番と別のプロジェクトで作った鍵を置いてください。`,
    };
  }
  return { ok: true, key };
}

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
