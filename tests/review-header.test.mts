// P8-i: 確認画面のヘッダー右（件数の札と「完成」）。
//
// 375px で札・ボタンの文字が1文字ずつ縦に潰れ、それでも完成が画面の端から 4px 出ていた。
// ここでは「札と完成が1つのまとまり」「縮めて潰さない」「入りきらないときは次の行へ送る」を見張る。
// ※ 実際の横あふれ（scrollWidth − clientWidth）はブラウザで測る（Node では描画できず、依存も増やせない）。
//   2026-09-13 の実測は台帳の記録とアーカイブを参照。ここで守るのは、その結果を支えている指定。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const review = readFileSync("app/components/Review.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const narrow = (() => {
  const i = css.indexOf(".done-group{");
  const m = css.indexOf("@media (max-width:620px){", i);
  return css.slice(m, css.indexOf("\n}\n", m));
})();

test("件数の札と「完成」は1つのまとまりで、辞書はその左（札と完成が隣り合う・P8-i）", () => {
  const start = review.indexOf("right={");
  const right = review.slice(start, review.indexOf("</>", start));
  const vocab = right.indexOf("<VocabButton");
  const group = right.indexOf('<div className="done-group">');
  const chips = right.indexOf('<div className="chips">');
  const done = right.indexOf('className={"done-btn"');
  assert.ok(vocab >= 0 && group > vocab, "辞書はまとまりの左に置く");
  assert.ok(chips > group && done > chips, "札と完成はまとまりの中で、札→完成の順");
  // まとまりの中に札と完成以外を挟まない
  const inner = right.slice(group);
  assert.ok(!inner.includes("<VocabButton"), "札と完成のあいだに別の部品を挟まない");
});

test("札とボタンの文字は縮めて縦に潰さない（375px で1文字ずつ折り返していた・P8-i）", () => {
  assert.ok(css.includes(".done-group > *,.chips > *{flex:0 0 auto;white-space:nowrap}"));
  assert.ok(/\.done-group\{display:flex;align-items:center;gap:12px\}/.test(css));
});

test("狭い画面（≤620px）は入りきらない分を次の行へ送り、横にはみ出さない（P8-i）", () => {
  // 右の塊とまとまりは折り返す（縮めずに行を増やす）。完成はまとまりの中で右端に揃う
  assert.ok(narrow.includes(".h-right{flex-wrap:wrap;justify-content:flex-end"), "右の塊が折り返さない");
  assert.ok(narrow.includes(".done-group{gap:8px;flex-wrap:wrap;justify-content:flex-end"), "まとまりが折り返さない");
  // 確認画面だけ: 使い方・辞書をブランドの行へ、札と完成を次の行の右端へ（見出しを2行に収める）
  assert.ok(narrow.includes(".h-in:has(.done-group) .h-right{display:contents}"));
  assert.ok(narrow.includes(".h-in:has(.done-group) .done-group{margin-left:auto;max-width:100%}"));
  // 余白と隙間を詰めて、375px（使える幅 347px）で札と完成が1行に入る
  assert.ok(narrow.includes(".h-in{padding-left:14px;padding-right:14px}"));
  assert.ok(narrow.includes(".chip{padding:3px 8px}"));
  // ヘッダーの行は折り返せる（ここが nowrap だと、送る先の行が無い）
  assert.ok(/\.h-in\{[^}]*flex-wrap:wrap/.test(css));
});

test("完成ボタンに固定の幅や、画面の外へ押し出す指定をしない（P8-i）", () => {
  // 疑似要素（左肩の色帯・変換中の「…」）は除く。ボタン本体の指定だけを見る
  for (const m of css.matchAll(/\.done-btn[^{:]*\{([^}]*)\}/g)) {
    assert.ok(!/(^|;)\s*(min-)?width:\s*\d/.test(m[1]), `完成ボタンに固定の幅 → ${m[0]}`);
    assert.ok(!/position:\s*absolute/.test(m[1]), `完成ボタンを浮かせている → ${m[0]}`);
  }
});
