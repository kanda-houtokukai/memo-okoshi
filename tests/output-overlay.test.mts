// P8-j: 転記用テキストの画面（OutputOverlay）。
//
// ここですることは、貼り付ける前に中身を通して確かめる・コピーする・ファイルで保存するの3つ。
// 全文が見えているほうが確実なので、画面いっぱいに近い大きさにし、テキストだけがスクロールする。
// ここでは「テキスト欄が高さのほとんどを占める」「ボタンは下に固定」「文言も出力も変えない」を見張る。
// ※ 実際の大きさ・横あふれはブラウザで測る（Node では描画できない）。ここで守るのは、それを支える指定。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync("app/components/OutputOverlay.tsx", "utf8");
const cssAll = readFileSync("app/globals.css", "utf8");
const css = cssAll
  .slice(cssAll.indexOf("/* ---------- 転記用テキスト（P8-j"), cssAll.indexOf(".out-note{"))
  .replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sel: string) => {
  const m = css.match(new RegExp("(?:^|\\n)\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}"));
  assert.ok(m, `${sel} の規則が無い`);
  return m![1];
};

test("文言を足さない・変えない（見出しと「閉じるとデータは残りません」は残す・P8-j）", () => {
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const shown = [...body.matchAll(/>\s*([^<>{}]*[ぁ-んァ-ヶ一-龥A-Za-z][^<>{}]*?)\s*</g)].map((m) => m[1].trim()).filter(Boolean);
  assert.deepEqual(shown.sort(), [
    "PDF",
    "Word",
    "コピーしました",
    "全文をコピー",
    "新しい変換を始める",
    "転記用テキスト",
    "閉じるとデータは残りません（サーバー保存なし）",
    "確認に戻る",
  ].sort());
});

test("並びは 見出し → 一行 → テキスト → ボタン（ボタンは下）。動作と出力はそのまま（P8-j）", () => {
  const i = (s: string) => src.indexOf(s);
  assert.ok(i("<h2>") < i('className="od"') && i('className="od"') < i("<pre>") && i("<pre>") < i('className="out-btns"'));
  // テキスト欄に出すのは受け取った text だけ（出力の中身には触れない）
  assert.ok(src.includes("<pre>{text}</pre>"));
  // コピー・Word・PDF・確認に戻る は同じ受け手を呼ぶ
  for (const h of ["onClick={onCopy}", "onClick={onWord}", "onClick={onPdf}", "onClick={onClose}"]) {
    assert.ok(src.includes(h), `${h} が無い`);
  }
});

test("画面いっぱいに近い大きさで、テキストだけがスクロールし、ボタンは下に固定（P8-j）", () => {
  const card = rule(".out-card");
  assert.ok(/display:flex/.test(card) && /flex-direction:column/.test(card), "カードは縦に積む");
  assert.ok(/height:100%/.test(card) && /max-width:1200px/.test(card), "高さはいっぱい・幅の上限はアプリの内容の幅");
  const pre = rule(".out-card pre");
  assert.ok(/flex:1 1 auto/.test(pre) && /min-height:0/.test(pre) && /overflow:auto/.test(pre), "テキスト欄が残りを占めてスクロールする");
  assert.ok(!/max-height/.test(pre), "テキスト欄の高さを画面の一部に制限しない（以前は 44vh）");
  assert.ok(/overflow-wrap:anywhere/.test(pre), "長い英数字も折り返して横にはみ出さない");
  assert.ok(/flex:0 0 auto/.test(rule(".out-btns")), "ボタンの帯は縮まず下に残る");
  const ovl = rule(".ovl");
  assert.ok(/overflow:hidden/.test(ovl), "外側はスクロールしない（テキストだけがスクロールする）");
  const alpha = Number(ovl.match(/rgba\(43,42,37,\.?(\d+)\)/)?.[1].padEnd(2, "0")) / 100;
  assert.ok(alpha >= 0.6, `背後が明るすぎる（${alpha}）`);
  assert.ok(css.includes("@supports (height:100dvh){.ovl{bottom:auto;height:100dvh}}"), "スマホの帯にボタンが隠れない");
  const narrow = css.slice(css.indexOf("@media (max-width:620px){"));
  assert.ok(narrow.includes(".ovl{padding:8px 8px max(8px,env(safe-area-inset-bottom))}"), "スマホは画面のほぼ全面");
  // 縦の低い画面では、見出し・注意・ボタンのまわりの余白を詰めてテキスト欄に高さを回す（文言は隠さない）
  const low = css.slice(css.indexOf("@media (max-height:520px){"));
  assert.ok(low.includes(".out-card .warnline{padding:5px 11px"), "縦の低い画面で余白を詰める");
  assert.ok(!/display:none/.test(low), "縦の低い画面でも見出し・注意は隠さない");
});
