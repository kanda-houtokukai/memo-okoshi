// 見学記録（P21・2026-10-14）の機械テスト。
//   - 項目は設計側が決めた7つ・この順・この名前（コロン無し）。選ぶ・並べ替える操作は無い
//   - 用紙は A4 1枚: 題の下に2列の表（項目名と書く欄は別のセル）・1〜6 は1行ぶん・内容の行は下の余白の手前まで・押印欄やページ番号は無い
//   - 完成形（Word・PDF）は同じ2列の表・押印欄は「記録者」の1枠／転記用テキストは項目名と中身を1行ずつ
//   - 赤・黄・青・こぼれ枠は面談・会議と同じに働く／プロンプトは同じ規則（〇〇・作り話をしない）＋見学の決まり

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEM_LIBRARY, MEETING_LIBRARY, VISIT_LIBRARY, isFixedType, isRecordType, libraryFor } from "../lib/items.ts";
import { buildPrompt } from "../lib/prompt.ts";
import { SHEET, VISIT_SHEET, sheetFileName, visitBodyLines } from "../lib/sheet.ts";
import { STAMP, stampLabels } from "../lib/stamp.ts";
import { buildDocxParts, extractText } from "../lib/docx.ts";
import { keyFor, SETTINGS_KEY } from "../lib/settings.ts";
import {
  buildOutputText,
  counts,
  fromApi,
  isDoneBlocked,
  moveSpillTo,
  outputTitle,
  recordEntries,
  resolveToken,
  type ApiData,
} from "../lib/record.ts";

const LABELS = ["名前", "日時", "来所者", "通園、通所先", "住所", "事前情報", "内容"];
const ids = VISIT_LIBRARY.map((l) => l.id);
const allOn = Object.fromEntries(ids.map((id) => [id, true]));

test("見学の項目は7つ・この順・この名前（コロン無し）。追加項目・オンオフ・並べ替えは無い", () => {
  assert.deepEqual(VISIT_LIBRARY.map((l) => l.label), LABELS);
  for (const l of VISIT_LIBRARY) {
    assert.ok(!/[：:]/.test(l.label), `項目名にコロン → ${l.label}`);
    assert.ok(l.group === "基本" && l.defaultOn && !l.closing && l.sheet === undefined);
  }
  // 1〜6 は1行の欄、7「内容」が本文
  assert.deepEqual(VISIT_LIBRARY.map((l) => Boolean(l.oneLine)), [true, true, true, true, true, true, false]);
  // id は面談・会議と重ならない
  const others = new Set([...ITEM_LIBRARY, ...MEETING_LIBRARY].map((l) => l.id));
  assert.ok(ids.every((id) => !others.has(id) && id.startsWith("v_")));
  assert.equal(libraryFor("visit"), VISIT_LIBRARY);
  assert.ok(isRecordType("visit") && isFixedType("visit") && !isFixedType("interview") && !isFixedType("meeting"));
  assert.equal(keyFor(SETTINGS_KEY, "visit"), "memo-okoshi:items:visit");
  // 選ぶ・並べ替える操作を出さない（用紙の一覧・確認画面の項目のドロワーと矢印）
  const sm = readFileSync("app/components/SheetMaker.tsx", "utf8");
  assert.ok(sm.includes("{!fixed && sheetGroups(sheetLib).map((g) => {") && sm.includes("{!fixed && <h2>用紙に入れる項目</h2>}"));
  const rv = readFileSync("app/components/Review.tsx", "utf8");
  assert.ok(rv.includes("const fixed = isFixedType(type);") && rv.includes("{!fixed && (\n                <button className=\"tool-btn\" onClick={() => setDrawerOpen(true)}>"));
  assert.ok(rv.includes("onMove={fixed ? undefined : (dir) => setRec((s) => moveSection(s, id, dir))}"));
  assert.ok(readFileSync("app/components/SectionCard.tsx", "utf8").includes("{onMove && ("), "矢印は onMove があるときだけ");
});

test("見学の用紙: 題の下に2列の表（項目名と書く欄は別のセル）。押印欄・ページ番号・その他・下の行は無い", () => {
  const sm = readFileSync("app/components/SheetMaker.tsx", "utf8");
  const vp = sm.slice(sm.indexOf("function VisitPaper"), sm.indexOf("export default function SheetMaker"));
  assert.ok(vp.includes('<div className="v-title">{SHEET_HEAD.visit.title}</div>'));
  // 1行 = 項目名のセル（v-lb）と書く欄のセル（v-wr）。別の要素
  assert.ok(/<div className="v-lb">\{it\.label\}<\/div>\s*<div className="v-wr">/.test(vp), "項目名と書く欄が別のセルになっていない");
  for (const no of ["p-foot", "p-no", "pd-stamp", "OTHER_BOX", "p-box other", "pageLabel"]) assert.ok(!vp.includes(no), `見学の用紙に ${no}`);
  // 1枚だけ（割り付け・ページ分けをしない）
  assert.ok(sm.includes("const pages = fixed ? [sheetLib] :") && sm.includes("<VisitPaper items={sheetLib} />"));
  assert.ok(sm.includes('switchType("visit")'));
  assert.equal(sheetFileName(new Date(2026, 9, 14), "visit"), "見学用紙_20261014");
});

test("見学の用紙の寸法: 1〜6 は 10mm・内容の行は下の余白の手前まで・罫線は 6mm 固定で入るだけ・A4 1枚に収まる", () => {
  const v = VISIT_SHEET;
  assert.equal(v.rowMm, 10);
  assert.equal(v.labelPct, 20);
  const usable = SHEET.pageH - SHEET.margin * 2; // 279mm（用紙の印刷は余白 9mm）
  const body = usable - v.titleMm - v.borderMm * 2 - 6 * v.rowMm;
  const lines = visitBodyLines();
  assert.equal(lines, 34);
  assert.ok(v.padTop + lines * SHEET.line + v.padBottom <= body, "罫線が内容の行からはみ出す");
  assert.ok(v.padTop + (lines + 1) * SHEET.line + v.padBottom > body, "入るだけ引いていない");
  // 内容の行は残りを全部使う（flex:1）。表は題の下から紙の下端（下の余白の手前）まで
  const css = readFileSync("app/globals.css", "utf8");
  assert.ok(css.includes(".v-table{flex:1;") && css.includes(".v-row.body{flex:1;height:auto;"));
  assert.ok(css.includes(".v-row{display:flex;flex:0 0 auto;height:calc(10 * var(--mm));"));
  // 印刷: 用紙は1枚 279mm（余白 9mm の内側）・項目名の列は完成形の表と同じ見た目（20%・#f3f1eb・0.5pt #8a8a8a）
  assert.ok(css.includes(".print-sheet .paper{\n    width:auto;aspect-ratio:auto;height:279mm;"));
  assert.ok(css.includes(".print-sheet .v-row{height:10mm}") && css.includes(".print-sheet .v-table{border:0.5pt solid #8a8a8a}"));
  assert.ok(css.includes(".v-lb{flex:0 0 20%;") && css.includes("background:#f3f1eb;"));
  assert.ok(/\.print-doc th\{width:20%;background:#f3f1eb/.test(css), "完成形の表の見た目（比べる元）");
  // 内容の欄の罫線は既存の枠と同じ作法（6mm・0.2mm の点線 #bdbdbd）
  assert.ok(css.includes(".print-sheet .v-lines div{height:6mm;border-bottom:0.2mm dotted #bdbdbd}"));
  assert.ok(css.includes(".print-sheet .p-lines div{height:6mm;border-bottom:0.2mm dotted #bdbdbd}"));
});

const visitApi = (body: ApiData["sections"][0]["tokens"]): ApiData => ({
  sections: [
    { id: "v_name", tokens: [{ t: "p", s: "〇〇" }] },
    { id: "v_date", tokens: [{ t: "p", s: "R8. 10/9（木） 10:00〜11:00" }] },
    { id: "v_visitor", tokens: [{ t: "p", s: "母（〇〇）" }] },
    { id: "v_school", tokens: [] },
    { id: "v_address", tokens: [{ t: "p", s: "〇〇" }] },
    { id: "v_prior", tokens: [{ t: "p", s: "相談支援から紹介" }] },
    { id: "v_body", tokens: body },
  ],
  spill: [{ text: "見学と関係のない走り書き", suggest: "v_body" }],
  insights: [{ text: "体験利用の日程が決まっていない。", why: "次の連絡が流れやすい", refs: ["v_body"] }],
});

test("完成形: Word は同じ2列の表（7行・ラベルの列 1900/9700）で、押印欄は「記録者」の1枠。題は「見学記録」", () => {
  assert.deepEqual(STAMP.labels.visit, ["記録者"]);
  assert.deepEqual(stampLabels("visit"), ["記録者"]);
  assert.equal(outputTitle("visit"), "見学記録");
  const st = fromApi(visitApi([{ t: "p", s: "園の様子を見学した。" }]), VISIT_LIBRARY, allOn, ids, "visit");
  const entries = recordEntries(st, VISIT_LIBRARY);
  assert.deepEqual(entries.map((e) => e.label), LABELS, "7行・この順（空の欄も行を出す）");
  assert.equal(entries[3].text, "（記載なし）");
  const xml = buildDocxParts(entries, new Date(2026, 9, 14), outputTitle("visit"), "visit")["word/document.xml"];
  assert.ok(xml.includes('<w:tblGrid><w:gridCol w:w="1900"/><w:gridCol w:w="7800"/></w:tblGrid>'));
  assert.equal((xml.match(/<w:shd w:val="clear" w:color="auto" w:fill="F3F1EB"\/>/g) ?? []).length, 7);
  const stamp = xml.match(/<w:tbl><w:tblPr><w:tblW w:w="\d+" w:type="dxa"\/><w:jc w:val="right"\/>[\s\S]*?<\/w:tbl>/)![0];
  assert.equal((stamp.match(/<w:gridCol /g) ?? []).length, 1, "押印の枠は1つ");
  assert.ok(stamp.includes(">記録者<"));
  assert.ok(extractText(xml).startsWith("見学記録\n"));
  // PDF も同じ押印欄の定義（stampTable(type)）と同じ表を使う
  const ex = readFileSync("lib/export.ts", "utf8");
  assert.ok(ex.includes("head.appendChild(stampTable(type))") && ex.includes("const labels = stampLabels(type);"));
});

test("転記用テキスト: 項目名と中身を1行ずつ（1〜6 は「名前　〇〇」の1行・内容は見出しの下に本文）。押印欄のラベルは入れない", () => {
  const st = fromApi(visitApi([{ t: "p", s: "【見学の様子】\n・体操に参加した" }]), VISIT_LIBRARY, allOn, ids, "visit");
  const out = buildOutputText(st, VISIT_LIBRARY);
  assert.equal(
    out,
    "【見学記録】（メモおこし下書き）\n\n名前　〇〇\n日時　R8. 10/9（木） 10:00〜11:00\n来所者　母（〇〇）\n通園、通所先　（記載なし）\n住所　〇〇\n事前情報　相談支援から紹介\n\n■ 内容\n【見学の様子】\n・体操に参加した\n"
  );
  assert.ok(!out.includes("記録者"));
  assert.ok(!out.includes("：") && !out.includes("体験利用の日程"), "コロン・AIの気づきを入れない");
});

test("見学でも赤・黄・青・こぼれ枠が働く（赤を確認するまで完成できない・こぼれは捨てずに内容へ移せる）", () => {
  const st = fromApi(
    visitApi([
      { t: "p", s: "担当の" },
      { t: "r", s: "田村さん" },
      { t: "p", s: "が案内した。体験は" },
      { t: "y", s: "10/16", cands: ["10/23"] },
      { t: "p", s: "で調整。" },
      { t: "b", s: "母より", note: "位置から推定" },
    ]),
    VISIT_LIBRARY,
    allOn,
    ids,
    "visit"
  );
  assert.deepEqual(counts(st), { y: 1, b: 1, r: 1 });
  assert.ok(isDoneBlocked(st), "確認していない赤があるのに完成できる");
  const after = resolveToken(st, "v_body", 1, null);
  assert.equal(counts(after).r, 0);
  assert.ok(!isDoneBlocked(after));
  assert.ok(buildOutputText(after, VISIT_LIBRARY).includes("田村さん"), "確認した赤の語はそのまま残る（原則3）");
  // こぼれ枠は残り（原則2）、内容へ移せる
  assert.equal(st.spill.length, 1);
  const moved = moveSpillTo(st, 0, "v_body", VISIT_LIBRARY);
  assert.equal(moved.spill.length, 0);
  assert.ok(buildOutputText(moved, VISIT_LIBRARY).includes("見学と関係のない走り書き"));
  // 気づきは記録に入らない（原則1）
  assert.ok(!buildOutputText(moved, VISIT_LIBRARY).includes("体験利用の日程が決まっていない"));
});

test("見学のプロンプト: 面談・会議と同じ規則（黄・青・赤・〇〇・作り話をしない）＋1〜6 は欄から・空欄は空・日時は書かれたとおり・まず内容へ", () => {
  const p = buildPrompt(VISIT_LIBRARY, [], "visit");
  for (const l of VISIT_LIBRARY) assert.ok(p.includes(`id:"${l.id}" 名称「${l.label}」`));
  assert.ok(p.includes('"record_type": "visit"'));
  // 共通の規則（面談と同じ文）
  const iv = buildPrompt(ITEM_LIBRARY, [], "interview");
  for (const common of ["**塗りつぶした箇所**（黒く塗られた・黒い四角で隠された部分）は、中を推測せず「〇〇」と書く。", '**人名らしき語は、読み取りに迷っても "y" ではなく "r" にする**', "**迷ったら必ず \"y\" にする**", "書かれていないことを補完・創作しない。"]) {
    assert.ok(p.includes(common) && iv.includes(common), `共通の規則が無い → ${common}`);
  }
  // 見学の決まり
  assert.ok(p.includes("欄が空欄なら、その項目の tokens を空配列にする（推測で埋めない・他の欄から補わない）"));
  assert.ok(p.includes("**「日時」は書かれたとおりに起こす**（和暦と西暦の書き換え・曜日や年の補い・時刻の形の統一をしない）"));
  assert.ok(p.includes("名前・来所者・住所は個人情報なので、**塗りつぶされて読めない前提**で扱う"));
  assert.ok(p.includes('**まず "v_body"（内容）に入れる**'));
  // 面談・会議のプロンプトは変えていない（見学の文が混ざらない）
  assert.ok(!iv.includes("見学") && !buildPrompt(MEETING_LIBRARY, [], "meeting").includes("見学"));
});

test("ホームに「見学メモをおこす」（まだ使っていないインデックスの色）。変換API は見学を受け取る", () => {
  const home = readFileSync("app/components/Home.tsx", "utf8");
  const visit = home.slice(home.indexOf('onClick={() => onMemo("visit")}') - 120, home.indexOf('onClick={() => onMemo("visit")}'));
  const color = visit.match(/var\(--t(\d)\)/)![1];
  const others = [...home.matchAll(/className="hcard(?: sub)?" style=\{\{ \["--c" as string\]: "var\(--t(\d)\)" \}\}/g)].map((m) => m[1]);
  assert.equal(others.filter((c) => c === color).length, 1, "見学の色が他のカードと重なる");
  assert.ok(home.includes("見学メモを"));
  const route = readFileSync("app/api/convert/route.ts", "utf8");
  assert.ok(route.includes("isRecordType(rt) ? rt : \"interview\""), "知らない値だけ面談（見学はそのまま通る）");
});
