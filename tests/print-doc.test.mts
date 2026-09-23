// P11: 完成形の PDF（ブラウザの印刷）が Word と同じ体裁で出ること。
//
// 2026-09-18 の実機で、PDF だけが全体に縮み、1ページ目の下が空いたまま2ページ目へ送られた。原因は3つ:
//   ① 用紙の `@page{margin:9mm}`（P7-e）が完成形にも効き、余白が Word（15mm）と違っていた
//   ② 折り返せない長い文字列が表の幅を超えると、ブラウザが全体を縮めてページに収める
//   ③ `tr{break-inside:avoid}`（と既定の orphans:2）で、長い項目が項目ごと次のページへ送られていた
// ここでは、それを防ぐ指定が残っていることと、用紙の印刷（9mm・1枚ずつ改ページ）を巻き込んでいないことを見張る。
// ※ 実際のページ数・余白・字の大きさはブラウザで印刷して測る（Node では描画できない。測り方は台帳の記録 P11）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const exportSrc = readFileSync("lib/export.ts", "utf8");
const docxSrc = readFileSync("lib/docx.ts", "utf8");
const cssAll = readFileSync("app/globals.css", "utf8");
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

/** 完成形の印刷の規則（`.print-doc{display:none}` の後ろの @media print ひとかたまり） */
const docPrint = (() => {
  const start = cssAll.indexOf(".print-doc{display:none}");
  const m = noComments(cssAll.slice(start)).match(/@media print\{([\s\S]*?)\n\}/);
  assert.ok(m, "完成形の印刷の規則が無い");
  return m![1];
})();
/** 用紙の印刷の規則 */
const sheetPrint = noComments(cssAll.slice(cssAll.indexOf("/* ---------- 印刷（PDFで保存） ---------- */")));

test("完成形のページの余白は Word と同じ 15mm（用紙の 9mm を巻き込まない・P11）", () => {
  const m = exportSrc.match(/export const RECORD_PAGE_CSS = "([^"]+)"/);
  assert.ok(m, "RECORD_PAGE_CSS が無い");
  const css = m![1];
  assert.match(css, /^@page\{size:A4;margin:(\d+)mm\}$/);
  const mm = Number(css.match(/margin:(\d+)mm/)![1]);
  // Word の余白（twips。1440 twips = 1インチ）と同じ値であること
  const pgMar = docxSrc.match(/<w:pgMar w:top="(\d+)" w:right="(\d+)" w:bottom="(\d+)" w:left="(\d+)"/);
  assert.ok(pgMar, "Word の余白が読めない");
  for (const tw of pgMar!.slice(1).map(Number)) assert.equal(Math.round((tw / 1440) * 25.4), mm, "PDF と Word で余白が違う");
});

test("完成形の @page は印刷のあいだだけ、印刷用 DOM の中に差し込む（globals.css に置かない・P11）", () => {
  // globals.css に置くと、ファイルの後ろにある用紙の @page（9mm）が勝つ
  assert.ok(!docPrint.includes("@page"), "完成形の @page を globals.css に置いている");
  // 印刷用 DOM（片付けで消える）の中に <style> として置き、それを body に足す前に組んでいる
  const body = exportSrc.slice(exportSrc.indexOf("export function printRecord"));
  const i = (s: string) => body.indexOf(s);
  assert.ok(i('createElement("style")') > 0 && i("RECORD_PAGE_CSS") > 0, "@page を差し込んでいない");
  assert.ok(i("root.appendChild(page)") > 0 && i("root.appendChild(page)") < i("document.body.appendChild(root)"));
  assert.ok(body.includes("root.remove()"), "片付けで印刷用 DOM ごと消す");
});

test("用紙の印刷は変えない（9mm・1枚ずつ改ページ・高さ 279mm）", () => {
  assert.ok(sheetPrint.includes("@page{size:A4 portrait;margin:9mm}"));
  assert.ok(/\.print-sheet \.paper\{[^}]*height:279mm[^}]*break-after:page/.test(sheetPrint));
  // 用紙の印刷は完成形の @page を差し込まない
  const sheet = readFileSync("app/components/SheetMaker.tsx", "utf8");
  assert.ok(!sheet.includes("RECORD_PAGE_CSS"));
});

test("横にはみ出さない（はみ出すとブラウザが全体を縮める）・行はページをまたいでよい（P11）", () => {
  assert.ok(/\.print-doc\{[^}]*overflow-wrap:anywhere/.test(docPrint), "長い文字列が折り返さない");
  assert.ok(!/break-inside:avoid/.test(docPrint), "行を割らない指定がある（長い項目が次のページへ送られ、1ページ目の下が空く）");
  // orphans が既定の2だと、Chrome は項目の1行目だけをページの下に残す割り方を避け、項目ごと次へ送る
  assert.ok(/\.print-doc td\{[^}]*orphans:1/.test(docPrint), "項目ごと次のページへ送られる（orphans）");
  // 表は用紙の幅いっぱい・列の幅は固定（ラベル 20%）。Word も固定幅の表（1900:7800 ≒ 20%）
  assert.ok(/\.print-doc table\{[^}]*width:100%[^}]*table-layout:fixed/.test(docPrint));
  assert.ok(/<w:tblLayout w:type="fixed"\/>/.test(docxSrc));
});

test("完成形の印刷のあいだ、画面の要素（出力の画面を含む）はすべて隠れる", () => {
  assert.ok(docPrint.includes("body > *:not(.print-doc):not(.print-sheet){display:none !important}"));
});
