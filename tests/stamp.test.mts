// P12: 押印欄は用紙から外し、完成形（Word・PDF）の1ページ目の右上に置く。
//
// 見張ること:
//   - Word と PDF で、押印欄のラベル・枠の数・寸法が一致する（定義は lib/stamp.ts の1か所だけ）
//   - 頭は「左に題と作成日、右に押印欄」。Word は枠線の無い配置用の表に押印の表を入れ子にし、回り込みを使わない
//   - 押印欄のラベルは記録ではない＝転記用テキスト（コピー）に入らない
//   - 用紙には押印欄が無い（旧定義も残さない）
//   - PDF はブラウザの日付・URL・ページ番号を消して自前のページ番号、Word はフッターに PAGE / NUMPAGES
// ※ 実際の枠の実寸・ページ番号の見え方はブラウザで印刷して測る（台帳の記録 P12）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STAMP, stampCss, stampLabels, stampTwips, mmToTwips } from "../lib/stamp.ts";
import { buildDocxParts, PAGE_NUMBER } from "../lib/docx.ts";
import { buildOutputText, fromApi, type ApiData } from "../lib/record.ts";
import { ITEM_LIBRARY, MEETING_LIBRARY } from "../lib/items.ts";
import * as sheet from "../lib/sheet.ts";

const exportSrc = readFileSync("lib/export.ts", "utf8");
const doc = (type: "interview" | "meeting") =>
  buildDocxParts([{ label: "面談概要", text: "一行目\n二行目" }], new Date(2026, 8, 23), "記録", type);

/** Word の押印の表（頭の表の中に入れ子になっている2つ目の <w:tbl>）を取り出す */
function wordStamp(xml: string) {
  const start = xml.indexOf("<w:tbl>", xml.indexOf("<w:tbl>") + 1);
  const t = xml.slice(start, xml.indexOf("</w:tbl>", start) + "</w:tbl>".length);
  return {
    xml: t,
    cols: [...t.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1])),
    labels: [...t.matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>/g)].map((m) => m[1]),
    rowH: t.match(/<w:trHeight w:val="(\d+)" w:hRule="(\w+)"\/>/),
    border: [...t.matchAll(/w:val="single" w:sz="(\d+)" w:space="0" w:color="(\w+)"/g)].map((m) => [m[1], m[2]].join(":")),
    labelSz: [...t.matchAll(/<w:sz w:val="(\d+)"\/>/g)].map((m) => Number(m[1])),
    fill: [...t.matchAll(/w:fill="(\w+)"/g)].map((m) => m[1]),
  };
}

test("ラベルは用紙のときと同じ（面談＝記録者の1枠・会議＝作成者／署名の2枠）。寸法は 15mm 角・0.25mm #444・7pt・#efece6", () => {
  assert.deepEqual(stampLabels("interview"), ["記録者"]);
  assert.deepEqual(stampLabels("meeting"), ["作成者", "署名"]);
  assert.deepEqual(stampLabels(undefined), ["記録者"], "知らない種類は面談として扱う");
  assert.equal(STAMP.cellMm, 15);
  // 認印の直径の上限 12mm を入れて、枠線まで 1.5mm ずつ余白が残る
  assert.ok(STAMP.cellMm - 12 >= 3);
  assert.equal(STAMP.borderMm, 0.25);
  assert.equal(STAMP.borderColor, "#444444");
  assert.equal(STAMP.labelPt, 7);
  assert.equal(STAMP.labelBg, "#efece6");
});

test("Word と PDF で押印欄のラベル・枠の数・寸法が一致する（定義は lib/stamp.ts だけ）", () => {
  const css = stampCss();
  const t = stampTwips();
  for (const type of ["interview", "meeting"] as const) {
    const w = wordStamp(doc(type)["word/document.xml"]);
    const labels = stampLabels(type);
    // ラベル・枠の数
    assert.deepEqual(w.labels, [...labels], `${type}: Word のラベル`);
    assert.equal(w.cols.length, labels.length, `${type}: Word の枠の数`);
    // 15mm 角＝列幅と行の高さの固定指定（850 twips）
    assert.deepEqual(w.cols, labels.map(() => mmToTwips(15)));
    assert.ok(w.rowH && Number(w.rowH[1]) === mmToTwips(15) && w.rowH[2] === "exact", "押印の枠の高さが固定の 15mm でない");
    // 枠線 0.25mm（Word は 1/8pt 単位で最も近い 6＝0.75pt）・#444
    assert.ok(w.border.length === 6 && w.border.every((b) => b === `${t.borderSz}:444444`));
    assert.equal(t.borderSz, 6);
    // ラベル 7pt（半ポイント 14）・背景 #efece6
    assert.ok(w.labelSz.length === labels.length && w.labelSz.every((s) => s === STAMP.labelPt * 2));
    assert.deepEqual(w.fill, labels.map(() => "EFECE6"));
  }
  // PDF: 同じ値の CSS を印刷のあいだだけ差し込む（.print-doc の下）
  assert.ok(css.includes(".print-doc .pd-stamp td{width:15mm;height:15mm;padding:0;border:0.25mm solid #444444}"));
  assert.ok(css.includes("font-size:7pt") && css.includes("background:#efece6") && css.includes("border:0.25mm solid #444444"));
  assert.ok(!/\.pd-stamp th\{[^}]*[^-]height:/.test(css), "ラベルの行の高さを固定しない（文字に合わせる）");
  const body = exportSrc.slice(exportSrc.indexOf("export function printRecord"));
  assert.ok(body.includes("stampCss()") && exportSrc.includes("stampLabels(type)"), "PDF が lib/stamp.ts の定義を使っていない");
  // 押印欄の寸法やラベルを lib/export.ts に直に書かない（ページの余白 margin:15mm は別物）
  const code = exportSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/(width|height):15mm|#efece6|#444|7pt|記録者|作成者|署名/.test(code), "PDF に押印欄の寸法やラベルを直に書いている");
});

test("頭は左に題と作成日・右に押印欄。Word は枠線の無い配置用の表に入れ子・回り込みなし・表のあいだに空の段落・本文に置く", () => {
  const xml = doc("meeting")["word/document.xml"];
  const body = xml.slice(xml.indexOf("<w:body>"));
  // 本文の最初は配置用の表（2列）。左の列＝題と作成日、右の列＝押印の表の幅
  assert.ok(body.startsWith("<w:body>\n<w:tbl>"));
  // 頭の表＝本文の最初から、記録の表の前の空の段落まで（入れ子の押印の表も同じ閉じ方なので、区切りの段落で切る）
  const head = body.slice(0, body.indexOf("\n<w:p/>\n<w:tbl>"));
  const grid = [...head.slice(0, head.indexOf("</w:tblGrid>")).matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
  assert.deepEqual(grid, [9700 - 850 * 2, 850 * 2], "配置用の表の列（左＝残り・右＝押印欄）");
  assert.ok(/<w:tblBorders>(<w:\w+ w:val="nil"\/>){6}<\/w:tblBorders>/.test(head), "配置用の表に枠線がある");
  const left = head.slice(head.indexOf("<w:tc>"), head.indexOf("</w:tc>"));
  assert.ok(left.includes(">記録<") && left.includes("作成（メモおこし下書き）"), "左の列に題と作成日");
  // 右の列は押印の表で始まり、段落で閉じる（Word の決まり）
  const right = head.slice(head.indexOf("</w:tc>") + 7);
  assert.ok(right.includes("<w:tbl>") && /<\/w:tbl><w:p>[\s\S]*<\/w:p><\/w:tc><\/w:tr><\/w:tbl>$/.test(right));
  // 回り込みの表を使わない・ヘッダー部分に置かない
  assert.ok(!/tblpPr|w:hdr|headerReference/.test(Object.values(doc("meeting")).join("")));
  // 頭の表と記録の表のあいだに空の段落
  assert.ok(body.includes("</w:tr></w:tbl>\n<w:p/>\n<w:tbl>"), "表が続く箇所に空の段落が無い");
  // PDF の頭も同じ並び（左に題と作成日・右に押印欄）
  const pr = exportSrc.slice(exportSrc.indexOf("export function printRecord"));
  assert.ok(pr.indexOf("left.appendChild(h)") < pr.indexOf("head.appendChild(stampTable(type))"));
  assert.ok(pr.indexOf("root.appendChild(head)") < pr.indexOf('createElement("table")'), "押印欄は記録の表より前（1ページ目だけ）");
});

test("押印欄のラベルは転記用テキスト（コピー）に入らない", () => {
  const api = (sections: [string, string][]): ApiData => ({
    sections: sections.map(([id, s]) => ({ id, tokens: [{ t: "p", s }] as ApiData["sections"][0]["tokens"] })),
    spill: [],
    insights: [],
  });
  const iv = fromApi(api([["gaiyou", "面談の概要"], ["honnin", "本人の様子"]]), ITEM_LIBRARY, { gaiyou: true, honnin: true }, ["gaiyou", "honnin"]);
  const mt = fromApi(api([["kaigi", "会議の概要"], ["kettei", "決まったこと"]]), MEETING_LIBRARY, { kaigi: true, kettei: true }, ["kaigi", "kettei"], "meeting");
  for (const out of [buildOutputText(iv, ITEM_LIBRARY), buildOutputText(mt, MEETING_LIBRARY)]) {
    for (const l of [...STAMP.labels.interview, ...STAMP.labels.meeting]) assert.ok(!out.includes(l), `転記用テキストに「${l}」`);
  }
  // 転記用テキストを作るところは押印欄の定義を読まない
  assert.ok(!readFileSync("lib/record.ts", "utf8").includes("stamp"));
  assert.ok(!readFileSync("app/components/OutputOverlay.tsx", "utf8").includes("stamp"));
});

test("用紙には押印欄が無い（見本・印刷・定義のどこにも）", () => {
  assert.ok(!("STAMP" in sheet), "lib/sheet.ts に押印欄の旧定義が残っている");
  for (const h of Object.values(sheet.SHEET_HEAD)) assert.ok(!("stamps" in h), "用紙の頭に押印欄のラベルが残っている");
  assert.ok(!/stamp/i.test(readFileSync("app/components/SheetMaker.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "")), "用紙の画面に押印欄がある");
  assert.ok(!readFileSync("app/globals.css", "utf8").includes(".p-stamp"), "用紙の押印欄の CSS が残っている");
});

test("PDF: ブラウザの日付・URL・ページ番号を消し、下の中央に自前のページ番号「1 / 2」（8pt・#7b766c）。余白 15mm・用紙には効かせない", () => {
  const marks = exportSrc.match(/export const RECORD_PAGE_MARKS_CSS = `([^`]+)`/)![1];
  assert.ok(marks.includes('@top-center{content:""}'), "上の余白の箱が無い（ブラウザのヘッダーが出る）");
  assert.ok(marks.includes('@bottom-center{content:counter(page) " / " counter(pages);font-size:${PAGE_NUMBER.pt}pt;color:${PAGE_NUMBER.color}}'));
  assert.deepEqual(PAGE_NUMBER, { pt: 8, color: "#7b766c" });
  assert.ok(exportSrc.includes('export const RECORD_PAGE_CSS = "@page{size:A4;margin:15mm}"'), "余白を変えた");
  assert.ok(exportSrc.slice(exportSrc.indexOf("export function printRecord")).includes("RECORD_PAGE_MARKS_CSS"));
  assert.ok(!readFileSync("app/components/SheetMaker.tsx", "utf8").includes("RECORD_PAGE"), "用紙の印刷に差し込んでいる");
});

test("Word: フッターの中央にページ番号（PAGE / NUMPAGES・8pt・#7b766c）。本文から参照する", () => {
  const p = doc("interview");
  const f = p["word/footer1.xml"];
  assert.ok(f.includes('<w:fldSimple w:instr=" PAGE ">') && f.includes('<w:fldSimple w:instr=" NUMPAGES ">'));
  assert.ok(f.indexOf(" PAGE ") < f.indexOf(" / ") && f.indexOf(" / ") < f.indexOf(" NUMPAGES "), "「1 / 2」の形でない");
  assert.ok(f.includes('<w:jc w:val="center"/>') && f.includes('<w:sz w:val="16"/>') && f.includes('<w:color w:val="7B766C"/>'));
  assert.ok(p["word/document.xml"].includes('<w:footerReference w:type="default" r:id="rId2"/>'));
  assert.ok(p["word/_rels/document.xml.rels"].includes('Id="rId2"') && p["word/_rels/document.xml.rels"].includes('Target="footer1.xml"'));
  assert.ok(p["[Content_Types].xml"].includes('PartName="/word/footer1.xml"'));
  // 余白は 15mm のまま（850 twips）
  assert.ok(p["word/document.xml"].includes('<w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850"'));
});

test("用紙の2枚組で白紙のページを作らない（ページ番号の行の高さを 1 にする）", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.ok(/\.p-foot \.p-no\{[^}]*line-height:1;/.test(css), "ページ番号の行が本文の行間を引き継ぎ、紙の下端からはみ出す");
});
