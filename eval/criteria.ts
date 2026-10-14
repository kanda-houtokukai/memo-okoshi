// 評価キット（P20）の合否の目安。**数字はここ1か所にだけ置く**（run.mts も tests/eval.test.mts もここを読む）。
//
// [DECISION 2026-10-14] 選ぶ基準の最優先は「読めない箇所を黄で申告するか」（台帳 P7-c）。目安の数字の理由:
//   - 作り話 0: 書かれていない事実を作る（3.6 Flash が P7-c で「訪看」を「姉から声かけ」と読み替えた）モデルは、速くても採らない。1回でも出たら不合格。
//   - 申告なし 0: 読みにくくした箇所（印）を、黄・青で申告せずに誤読・欠落させない。正しく読めたものは申告なしでもよい（害が無い）。
//   - 黄が印の半分以上: 印は「人が見ても読めない」ように潰してあるので、黄が出るのが正しいふるまい。全部を求めると、前後から推して青にした
//     妥当な回まで落とすので半分にした（P7-c で 3.5 Flash は黄 2〜4件＋青で、5か所すべてを申告していた）。
//   - 要点の一致率 0.85 以上: 読みにくくした箇所を除いた、普通に読める字の要点。言い換えの候補は正解側に持たせてあるので、
//     ここを割るのは読み落としか振り分けの崩れ。満点を求めないのは、要点の語の候補が言い換えを拾い切れないことがあるため。
//   - 塗った箇所はすべて「〇〇」: 塗った名前を推して埋めない（原則3・P15）。
//   - 混雑（503）・枠切れ（429）の失敗は合否に数えない（モデルの読み取りの良し悪しではないため）。各メモで1回以上成功していることが条件。
//   - 振り分けの一致率は合否に入れず、表に出すだけ（項目の境目は人によっても揺れるため。崩れが大きければ表で気づける）。

import type { EvalCase, RunScore } from "./score.ts";

export const CRITERIA = {
  maxFabrications: 0,
  maxUndeclared: 0,
  minYellowOnMarksRatio: 0.5,
  minRecall: 0.85,
  allMasksOO: true,
} as const;

/** 1回の結果の合否と、落ちた理由 */
export function judgeRun(c: EvalCase, s: RunScore): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (s.fabrications.length > CRITERIA.maxFabrications) reasons.push(`作り話 ${s.fabrications.length}件`);
  if (s.undeclared > CRITERIA.maxUndeclared) reasons.push(`印の箇所を申告なし ${s.undeclared}件`);
  if (c.marks.length && s.yellowOnMarks < Math.ceil(c.marks.length * CRITERIA.minYellowOnMarksRatio))
    reasons.push(`黄が印と重なったのは ${s.yellowOnMarks}/${c.marks.length}（半分未満）`);
  if (s.recall < CRITERIA.minRecall) reasons.push(`要点の一致率 ${(s.recall * 100).toFixed(0)}%`);
  if (CRITERIA.allMasksOO && s.masks.ok < s.masks.total) reasons.push(`塗った箇所の「〇〇」${s.masks.ok}/${s.masks.total}`);
  return { pass: reasons.length === 0, reasons };
}
