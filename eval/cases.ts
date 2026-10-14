// 評価のメモ（正解は eval/cases/*.json）を読み、本番と同じ形（プロンプト＋JPEG）に組み立てる。
// 評価キット（eval/run.mts）と毎日の見張り（eval/watch.mts）が同じものを使う。

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildPrompt } from "../lib/prompt.ts";
import { itemsByIds, libraryFor } from "../lib/items.ts";
import type { EvalCase } from "./score.ts";

/** only を渡せば、その id のメモだけ（並びは id の順） */
export function loadCases(only: string[] = []): EvalCase[] {
  const cases = readdirSync("eval/cases")
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join("eval/cases", f), "utf8")) as EvalCase)
    .filter((c) => only.length === 0 || only.includes(c.id));
  if (cases.length === 0) throw new Error("評価するメモがありません");
  return cases;
}

/** プロンプトは lib/prompt.ts の buildPrompt（辞書は空＝モデルそのものの力を測る）・画像はアプリが送る形の JPEG */
export function inputs(c: EvalCase) {
  const items = itemsByIds(c.items, libraryFor(c.record_type));
  if (items.length !== c.items.length) throw new Error(`${c.id}: 知らない項目 id がある`);
  const prompt = buildPrompt(items, [], c.record_type);
  const image = { mimeType: "image/jpeg", base64: readFileSync(c.image).toString("base64") };
  return { prompt, image };
}
