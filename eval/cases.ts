// 評価のメモ（正解は eval/cases/*.json）を読み、本番と同じ形（プロンプト＋JPEG）に組み立てる。
// 評価キット（eval/run.mts）と毎日の見張り（eval/watch.mts）が同じものを使う。

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildPrompt } from "../lib/prompt.ts";
import { itemsByIds, libraryFor } from "../lib/items.ts";
import type { EvalCase } from "./score.ts";

/** メモの組。v1＝P20 の3件（hard・names・symbols）／v2＝P26 の3件（本当に読めない箇所を各4か所以上・塗りの無い会議と面談を含む） */
export type CaseSet = "v1" | "v2";
export const CASE_DIRS: Record<CaseSet, string> = { v1: "eval/cases", v2: "eval/cases/v2" };

/** only を渡せば、その id のメモだけ（並びは id の順）。set を省けば v1（今日までの結果と比べるため・P26） */
export function loadCases(only: string[] = [], set: CaseSet = "v1"): EvalCase[] {
  const dir = CASE_DIRS[set];
  if (!dir) throw new Error(`知らないメモの組: ${set}（使えるのは v1・v2）`);
  const cases = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as EvalCase)
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
