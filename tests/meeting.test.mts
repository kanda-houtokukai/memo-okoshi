// P9（2026-09-17）: 会議メモへの対応。
//
// 見張ること:
//  - 記録の種類（面談／会議）で項目・プロンプト・保存の鍵・出力の題が切り替わる
//  - **会議は赤（人名）を持たない**（原則3は面談にのみ適用。設計側の決定・承認済み）
//  - **面談側は一切変わらない**（ライブラリ・プロンプト・赤の扱い・用紙の割り付け）
//  - 会議の用紙（内容が横いっぱい・決定事項と宿題が2列・会議概要はその他に相乗り）と押印欄が A4 に収まる

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRecordType, ITEM_LIBRARY, itemsByIds, libraryFor, MEETING_LIBRARY, RECORD_TYPES } from "../lib/items.ts";
import {
  keyFor,
  loadSettings,
  loadSheetFree,
  loadSheetOrder,
  saveSettings,
  saveSheetFree,
  saveSheetOrder,
  SETTINGS_KEY,
  SHEET_FREE_KEY,
  SHEET_ORDER_KEY,
} from "../lib/settings.ts";
import { buildPrompt } from "../lib/prompt.ts";
import {
  buildOutputText,
  counts,
  fromApi,
  isDoneBlocked,
  isSectionCopyBlocked,
  mergeReconvert,
  outputTitle,
  recordEntries,
  sectionCopyText,
  withoutRed,
  type ApiData,
} from "../lib/record.ts";
import { buildDocxParts } from "../lib/docx.ts";
import { enforceNames } from "../lib/names.ts";
import {
  freeAreaH,
  gridRowsStyle,
  linesIn,
  paginate,
  PRINT,
  SHEET,
  SHEET_HEAD,
  sheetFileName,
  sheetLayout,
  sheetRows,
  STAMP,
  wideLast,
} from "../lib/sheet.ts";

const INSIGHT_CANARY = "INSIGHT_LEAK_CANARY_気づき";
const SPILL_CANARY = "SPILL_LEAK_CANARY_こぼれ";
const MEETING_IDS = ["kaigi", "naiyou", "kettei", "shukudai"];

/** Node には localStorage が無いので、同じ形の入れ物を置く */
function useFakeStorage() {
  const m = new Map<string, string>();
  const fake = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true, writable: true });
  return m;
}

/** 会議のAPI応答（AIが人名を "r" で返してしまった場合も含める） */
function meetingApi(): ApiData {
  return {
    record_type: "meeting",
    sections: [
      { id: "kaigi", tokens: [{ t: "p", s: "運営会議 9/14 本部会議室 出席: 施設長・" }, { t: "r", s: "佐藤" }, { t: "p", s: "相談員" }] },
      { id: "naiyou", tokens: [{ t: "p", s: "【送迎】\n・朝の便が集中し、到着が" }, { t: "y", s: "遅れる", cands: ["送れる"] }, { t: "p", s: "日がある" }] },
      { id: "kettei", tokens: [{ t: "p", s: "・送迎ルートを10月から2系統に分ける" }] },
      { id: "shukudai", tokens: [{ t: "p", s: "・新ルート案の作成（担当：" }, { t: "r", s: "佐藤" }, { t: "p", s: "／9月末まで）\n・案内図の作成（担当未定）" }] },
    ],
    spill: [{ text: SPILL_CANARY, suggest: "naiyou" }],
    insights: [{ text: INSIGHT_CANARY, why: "宿題に担当がない", refs: ["shukudai"] }],
  };
}

const meetingEnabled = Object.fromEntries(MEETING_IDS.map((id) => [id, true]));

/* ---------- 項目ライブラリ ---------- */

test("会議の項目は4つだけ（会議概要・内容・決定事項・宿題）。すべて基本・既定オン・追加項目なし", () => {
  assert.deepEqual(MEETING_LIBRARY.map((l) => l.id), MEETING_IDS);
  assert.deepEqual(MEETING_LIBRARY.map((l) => l.label), ["会議概要", "内容", "決定事項", "宿題"]);
  assert.ok(MEETING_LIBRARY.every((l) => l.group === "基本" && l.defaultOn && !l.closing));
  assert.deepEqual(RECORD_TYPES, ["interview", "meeting"]);
  assert.equal(libraryFor("meeting"), MEETING_LIBRARY);
  assert.equal(libraryFor("interview"), ITEM_LIBRARY);
  assert.ok(isRecordType("meeting") && isRecordType("interview") && !isRecordType("kaigi") && !isRecordType(undefined));
  // id は面談と重ならない（保存値・API契約が混ざらない）
  const iv = new Set(ITEM_LIBRARY.map((l) => l.id));
  assert.ok(MEETING_IDS.every((id) => !iv.has(id)));
  assert.deepEqual(itemsByIds(["naiyou", "gaiyou", "kettei"], MEETING_LIBRARY).map((l) => l.id), ["naiyou", "kettei"], "会議のライブラリから引く");
  assert.deepEqual(itemsByIds(["naiyou", "gaiyou"]).map((l) => l.id), ["gaiyou"], "既定は面談のまま");
});

test("面談の項目ライブラリは変えていない（13項目・基本6・用紙の扱いの印なし）", () => {
  assert.equal(ITEM_LIBRARY.length, 13);
  assert.deepEqual(
    ITEM_LIBRARY.map((l) => l.id),
    ["gaiyou", "honnin", "kazoku", "kadai", "kenko", "seikatsu", "shokan", "moushiokuri", "nicchu", "kinsen", "risk", "kikan", "kibou"]
  );
  assert.ok(ITEM_LIBRARY.every((l) => l.sheet === undefined), "面談の項目に用紙の扱い（wide/other）を付けない");
  // 会議は「内容」が横いっぱい、「会議概要」が「その他」に相乗り
  assert.equal(MEETING_LIBRARY.find((l) => l.id === "naiyou")?.sheet, "wide");
  assert.equal(MEETING_LIBRARY.find((l) => l.id === "kaigi")?.sheet, "other");
});

/* ---------- 保存の鍵（面談と会議で別） ---------- */

test("項目の選択・並び・自由形式は面談と会議で別に保存する（面談の鍵はそのまま）", () => {
  assert.equal(keyFor(SETTINGS_KEY), SETTINGS_KEY);
  assert.equal(keyFor(SETTINGS_KEY, "interview"), "memo-okoshi:items");
  assert.equal(keyFor(SETTINGS_KEY, "meeting"), "memo-okoshi:items:meeting");
  assert.equal(keyFor(SHEET_FREE_KEY, "meeting"), "memo-okoshi:sheet-free:meeting");
  assert.equal(keyFor(SHEET_ORDER_KEY, "meeting"), "memo-okoshi:sheet-order:meeting");

  const m = useFakeStorage();
  // 会議側で選択・並び・自由形式を変えても、面談側の保存値は現れない・変わらない
  const ms = loadSettings(MEETING_LIBRARY, "meeting");
  ms.enabled.shukudai = false;
  saveSettings(ms, "meeting");
  saveSheetFree(true, "meeting");
  saveSheetOrder(["kettei", "naiyou", "kaigi", "shukudai"], "meeting");
  assert.ok(!m.has(SETTINGS_KEY) && !m.has(SHEET_FREE_KEY) && !m.has(SHEET_ORDER_KEY), "面談の鍵に書いていない");
  assert.equal(loadSettings(ITEM_LIBRARY).enabled.gaiyou, true, "面談の既定はそのまま");
  assert.equal(loadSheetFree(), false);
  assert.equal(loadSettings(MEETING_LIBRARY, "meeting").enabled.shukudai, false);
  assert.equal(loadSheetFree("meeting"), true);
  assert.deepEqual(loadSheetOrder(MEETING_LIBRARY, "meeting"), ["kettei", "naiyou", "kaigi", "shukudai"]);
  // 逆向き: 面談側を変えても会議側は動かない
  const is = loadSettings(ITEM_LIBRARY);
  is.enabled.gaiyou = false;
  saveSettings(is);
  assert.equal(loadSettings(MEETING_LIBRARY, "meeting").enabled.kaigi, true);
  assert.equal(loadSettings(ITEM_LIBRARY).enabled.gaiyou, false);
  // 鍵の定義は settings.ts だけ（会議の鍵は面談の鍵から作る＝文字列を増やさない）
  const src = readFileSync("lib/settings.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal((src.match(/:meeting/g) ?? []).length, 1, "会議の接尾辞は keyFor の1か所だけ");
});

/* ---------- プロンプト ---------- */

test("会議のプロンプト: 人名を r にしない・混ざった走り書きを振り分ける・宿題は補わない・決定と検討を分ける", () => {
  const p = buildPrompt(MEETING_LIBRARY, [], "meeting");
  assert.ok(p.includes("会議記録"));
  assert.ok(!/"r"/.test(p), "会議のプロンプトに r の種別がある");
  assert.ok(p.includes('種別は "p" "y" "b" の3つだけ'));
  assert.ok(p.includes("人名は種別を分けず、そのまま本文に書く"));
  assert.ok(p.includes("内容・決定事項・宿題が混ざって書かれている"));
  assert.ok(p.includes("誰が・いつまでに・何を") && p.includes("担当未定") && p.includes("期限未定"));
  assert.ok(p.includes("書かれていない要素は補わない"));
  assert.ok(p.includes("決定事項と検討事項を混ぜない"));
  // 既存の原則: 黄・青・こぼれ・気づき・書かれていないことは書かない
  for (const s of ['迷ったら必ず "y" にする', '"b" = メモに明示されておらず', "spill（拾いきれなかった内容）", "insights（気づき）", "書かれていないことを補完・創作しない"]) {
    assert.ok(p.includes(s), `会議のプロンプトに無い: ${s}`);
  }
  // 気づきは会議の観点
  assert.ok(p.includes("宿題に期限がない") && p.includes("担当者が決まっていない") && p.includes("前回の宿題"));
  assert.ok(p.includes('"record_type": "meeting"'));
  assert.ok(p.includes("sections はこの id のみ") && MEETING_IDS.every((id) => p.includes(`id:"${id}"`)));
  assert.ok(!p.includes("その他"), "プロンプトに「その他」を持ち込まない");
  assert.ok(!p.includes("面談"), "会議のプロンプトに面談の語が残っている");
  // 辞書は共通で差し込まれる
  assert.ok(buildPrompt(MEETING_LIBRARY, [{ term: "サビ管", gloss: "サービス管理責任者" }], "meeting").includes("# 組織の語彙"));
});

test("面談のプロンプトは変えていない（種類を省いても・明示しても同じ文面。人名は r のまま）", () => {
  const items = ITEM_LIBRARY.filter((l) => l.defaultOn);
  const a = buildPrompt(items);
  assert.equal(buildPrompt(items, [], "interview"), a);
  assert.ok(a.includes('"r" = 人名') && a.includes('"record_type": "interview"') && a.includes("面談記録の清書"));
  assert.ok(!a.includes("会議"));
});

/* ---------- 状態（赤を持たない） ---------- */

test("会議: AIが r を返しても p に落ち、赤は0件・完成も項目コピーも止まらない（原則3は面談にのみ適用）", () => {
  const s = fromApi(meetingApi(), MEETING_LIBRARY, meetingEnabled, MEETING_IDS, "meeting");
  assert.equal(s.type, "meeting");
  assert.equal(counts(s).r, 0);
  assert.equal(counts(s).y, 1, "黄は面談と同じく働く");
  assert.equal(isDoneBlocked(s), false);
  for (const id of MEETING_IDS) {
    assert.equal(isSectionCopyBlocked(s.tokens[id]), false);
    assert.notEqual(sectionCopyText(s, id), null);
  }
  // 人名は本文に残る（伏せない・置き換えない）
  assert.ok(sectionCopyText(s, "shukudai")!.includes("担当：佐藤／9月末まで"));
  assert.ok(!Object.values(s.tokens).flat().some((t) => t.t === "r"));
  // 再変換で r が来ても同じ
  const m = mergeReconvert({ ...s, tokens: { ...s.tokens, kettei: [] }, converted: ["kaigi", "naiyou", "shukudai"] }, { sections: [{ id: "kettei", tokens: [{ t: "r", s: "田中" }] }], spill: [], insights: [] }, MEETING_LIBRARY);
  assert.ok(m.tokens.kettei.every((t) => t.t !== "r"));
  // withoutRed は純関数で、r 以外は触らない
  const w = withoutRed(meetingApi());
  assert.deepEqual(w.sections[1].tokens[1], { t: "y", s: "遅れる", cands: ["送れる"] });
});

test("会議: 出力の題は「会議記録」。転記テキスト・Word に気づき・こぼれは混入しない（不変条件1は会議でも維持）", () => {
  const s = fromApi(meetingApi(), MEETING_LIBRARY, meetingEnabled, MEETING_IDS, "meeting");
  const out = buildOutputText(s, MEETING_LIBRARY);
  assert.ok(out.startsWith("【会議記録】（メモおこし下書き）"));
  assert.ok(out.includes("■ 決定事項") && out.includes("■ 宿題"));
  assert.ok(!out.includes(INSIGHT_CANARY) && !out.includes(SPILL_CANARY) && !out.includes("宿題に担当がない"));
  assert.equal(outputTitle("meeting"), "会議記録");
  assert.equal(outputTitle(), "面談・モニタリング記録");
  const parts = buildDocxParts(recordEntries(s, MEETING_LIBRARY), new Date(2026, 8, 17), outputTitle("meeting"));
  const all = Object.values(parts).join("\n");
  assert.ok(all.includes("会議記録") && !all.includes("面談・モニタリング記録"));
  assert.ok(!all.includes(INSIGHT_CANARY) && !all.includes(SPILL_CANARY));
  // 既定（面談）の題はそのまま
  assert.ok(Object.values(buildDocxParts([{ label: "x", text: "y" }])).join("").includes("面談・モニタリング記録"));
});

test("面談: 種類を省いても従来どおり（type は interview・赤は残って完成を止める・人名の機械検出も効く）", () => {
  const data: ApiData = {
    sections: [{ id: "gaiyou", tokens: [{ t: "p", s: "同席: 田中 由美さん。" }, { t: "r", s: "佐藤" }] }],
    spill: [],
    insights: [],
  };
  const en = Object.fromEntries(ITEM_LIBRARY.map((l) => [l.id, l.defaultOn]));
  const s = fromApi(data, ITEM_LIBRARY, en, ITEM_LIBRARY.map((l) => l.id));
  assert.equal(s.type, "interview");
  assert.equal(counts(s).r, 1);
  assert.equal(isDoneBlocked(s), true);
  assert.equal(buildOutputText(s, ITEM_LIBRARY).split("\n")[0], "【面談・モニタリング記録】（メモおこし下書き）");
  assert.equal(enforceNames(data).sections[0].tokens.filter((t) => t.t === "r").length, 2, "機械検出は面談で変わらない");
});

/* ---------- API・画面（実装の形を見張る） ---------- */

test("変換API: 種類を受け取り、会議では人名の機械検出を通さず r を落とす。面談は従来どおり", () => {
  const api = readFileSync("app/api/convert/route.ts", "utf8");
  assert.ok(api.includes('form.get("record_type")') && api.includes("isRecordType(rt) ? rt : \"interview\""), "知らない値は面談");
  assert.ok(api.includes("itemsByIds(ids, libraryFor(type))"), "種類のライブラリで項目を引く");
  assert.ok(api.includes("buildPrompt(items, vocab, type)"));
  assert.ok(api.includes('type === "meeting" ? withoutRed(parsed) : enforceNames(parsed)'), "会議は lib/names.ts を通さない・面談は通す");
  const page = readFileSync("app/page.tsx", "utf8");
  assert.ok(page.includes('fd.append("record_type", type)'), "画面が種類を送る");
  assert.ok(page.includes("useState<RecordType>(\"interview\")"), "既定は面談");
  assert.ok(page.includes("fromApi(r.data, lib, s.enabled, s.order, type)") && page.includes("loadSettings(lib, type)"));
  // 種類は変換の最後（確認画面）まで同じ state で保たれ、再変換にも同じ種類を渡す
  assert.ok(page.includes("callConvert(blobs.current, itemIds, type)"));
});

test("確認画面: 会議では人名の札を出さず、項目・保存の鍵・出力の題は種類に従う", () => {
  const rv = readFileSync("app/components/Review.tsx", "utf8");
  assert.ok(rv.includes('const type = rec.type ?? "interview"') && rv.includes("const lib = libraryFor(type)"));
  assert.ok(rv.includes('{type !== "meeting" && (') && rv.includes("人名 <b>{c.r}</b>"), "会議では人名の札を出さない");
  assert.ok(rv.includes("keyFor(SETTINGS_KEY, type)"), "保存の鍵は種類ごと");
  assert.ok(!rv.includes("ITEM_LIBRARY"), "面談のライブラリを決め打ちしない");
  assert.ok(rv.includes("lib={lib}"), "項目ドロワーにも種類のライブラリを渡す");
  assert.ok(rv.includes('"黄=読取に自信なし ／ 青=AIの推定"'), "会議の凡例に赤を出さない");
  // 黄と青のポップオーバーは共通（Popover は変えていない）
  const pop = readFileSync("app/components/Popover.tsx", "utf8");
  assert.ok(pop.includes("このままで確定する") && pop.includes("この内容で確定する"));
});

test("ホーム: 面談と会議の入口が分かれ、用紙のカードは1枚のまま。用紙の画面の上部で切り替える", () => {
  const home = readFileSync("app/components/Home.tsx", "utf8");
  assert.equal((home.match(/onMemo\("interview"\)/g) ?? []).length, 1);
  assert.equal((home.match(/onMemo\("meeting"\)/g) ?? []).length, 1);
  assert.equal((home.match(/onClick=\{onSheet\}/g) ?? []).length, 1, "用紙のカードは1枚");
  const sm = readFileSync("app/components/SheetMaker.tsx", "utf8");
  const seg = sm.slice(sm.indexOf('className="seg"'), sm.indexOf("<h2>用紙に入れる項目</h2>"));
  assert.ok(seg.includes('switchType("interview")') && seg.includes('switchType("meeting")'));
  assert.ok(seg.includes(">\n              面談\n") && seg.includes(">\n              会議\n"));
  // 切り替えは用紙の画面の中で、記録側（page.tsx）の種類には触れない
  assert.ok(sm.includes('useState<RecordType>("interview")'));
  assert.ok(sm.includes("saveSettings(next, type)") && sm.includes("loadSettings(lib, type)") && sm.includes("loadSheetOrder(lib, type)"));
  assert.ok(sm.includes("saveSheetFree(!f, type)") && sm.includes("saveSheetOrder(next, type)"));
  assert.ok(sm.includes("sheetFileName(new Date(), type)"));
  const css = readFileSync("app/globals.css", "utf8");
  assert.ok(css.includes(".cards{display:grid;grid-template-columns:repeat(4,1fr)"), "カードは4列");
  assert.ok(css.includes("@media (max-width:760px){\n  .cards{grid-template-columns:1fr 1fr}"), "760px 以下は2列");
});

/* ---------- 用紙 ---------- */

test("面談の用紙の割り付けは変わらない（行の割り付けの本数＝これまでの本数・重みはすべて1）", () => {
  for (let n = 1; n <= ITEM_LIBRARY.length; n++) {
    const l = sheetLayout(n);
    paginate(ITEM_LIBRARY.slice(0, n), l.perPage).forEach((page, i) => {
      const rows = sheetRows(page, i === l.perPage.length - 1);
      assert.equal(rows.length, Math.ceil(page.length / SHEET.cols), `n=${n} p${i + 1}: 行数`);
      assert.ok(rows.every((r) => r.weight === 1 && r.lines === l.linesPerPage[i]), `n=${n} p${i + 1}: 本数が変わった`);
      assert.deepEqual(rows.flatMap((r) => r.ids), page.map((it) => it.id), "順番も落ちも無い");
      assert.equal(gridRowsStyle(rows), undefined, "面談では行の高さを指定しない（これまでどおり均等）");
      assert.equal(rows[rows.length - 1].wide, wideLast(page.length));
    });
  }
});

test("会議の用紙: 内容は横いっぱいの大きな枠、決定事項と宿題は2列、会議概要はその他に相乗り。罫線は6mm固定で入るだけ", () => {
  const rows = sheetRows(MEETING_LIBRARY, true);
  assert.deepEqual(rows.map((r) => r.ids), [["naiyou"], ["kettei", "shukudai"]]);
  assert.deepEqual(rows.map((r) => r.wide), [true, false]);
  assert.deepEqual(rows.map((r) => r.weight), [SHEET.wideWeight, 1]);
  assert.equal(gridRowsStyle(rows), `minmax(0,${SHEET.wideWeight}fr) minmax(0,1fr)`);
  // 本数は高さに入るだけ（間隔 6mm）。内容 23 本・決定事項/宿題 8 本
  assert.deepEqual(rows.map((r) => r.lines), [23, 8]);
  const gridH = SHEET.pageH - SHEET.margin * 2 - PRINT.head - PRINT.foot - (PRINT.boxTop + SHEET.otherLines * SHEET.line + PRINT.boxBottom + SHEET.gap);
  const usable = gridH - SHEET.gap;
  const total = SHEET.wideWeight + 1;
  assert.equal(rows[0].lines, linesIn((usable * SHEET.wideWeight) / total));
  assert.equal(rows[1].lines, linesIn(usable / total));
  for (const r of rows) {
    const h = (usable * r.weight) / total;
    assert.ok(h - PRINT.boxTop - r.lines * SHEET.line >= PRINT.boxBottom - 1e-9, "最後の罫線が枠の下の余白に入る");
    assert.ok(h - PRINT.boxTop - (r.lines + 1) * SHEET.line < PRINT.boxBottom, "まだ1本入る");
    assert.ok(r.lines >= SHEET.minLines);
  }
  // 会議概要は枠を作らない（相乗り）。オフなら「その他」だけ
  assert.ok(!rows.flatMap((r) => r.ids).includes("kaigi"));
  const noOverview = sheetRows(MEETING_LIBRARY.filter((l) => l.id !== "kaigi"), true);
  assert.deepEqual(noOverview.map((r) => r.ids), [["naiyou"], ["kettei", "shukudai"]]);
  // 内容を外すと残りは2列1行で、面談と同じ規則（全高に入るだけ）
  const noBody = sheetRows(MEETING_LIBRARY.filter((l) => l.id !== "naiyou"), true);
  assert.deepEqual(noBody.map((r) => r.ids), [["kettei", "shukudai"]]);
  assert.equal(noBody[0].lines, sheetLayout(2).linesPerPage[0]);
  // 宿題だけ外すと決定事項は1つ余るので横いっぱい
  const noHw = sheetRows(MEETING_LIBRARY.filter((l) => l.id !== "shukudai"), true);
  assert.deepEqual(noHw.map((r) => [r.ids.join(","), r.wide]), [["naiyou", true], ["kettei", true]]);
  // 並べ替え（P8-d）も効く: 決定事項を内容より上に
  const reordered = sheetRows([MEETING_LIBRARY[2], MEETING_LIBRARY[3], MEETING_LIBRARY[1], MEETING_LIBRARY[0]], true);
  assert.deepEqual(reordered.map((r) => r.ids), [["kettei", "shukudai"], ["naiyou"]]);
  assert.equal(gridRowsStyle(reordered), `minmax(0,1fr) minmax(0,${SHEET.wideWeight}fr)`);
  // 4項目は常に1枚。ファイル名は種類ごと
  assert.equal(sheetLayout(MEETING_LIBRARY.length).pages, 1);
  assert.equal(sheetFileName(new Date(2026, 8, 17), "meeting"), "会議用紙_20260917");
  assert.equal(sheetFileName(new Date(2026, 8, 17)), "面談用紙_20260917");
});

test("会議の用紙が A4 に収まる（見出し・記入欄＋枠＋その他＋下の行 ≤ 印字できる範囲）。自由形式も同じ", () => {
  const printable = SHEET.pageH - SHEET.margin * 2;
  const rows = sheetRows(MEETING_LIBRARY, true);
  const boxes = rows.map((r) => PRINT.boxTop + r.lines * SHEET.line + PRINT.boxBottom);
  const other = PRINT.boxTop + SHEET.otherLines * SHEET.line + PRINT.boxBottom + SHEET.gap;
  const used = PRINT.head + boxes.reduce((a, b) => a + b, 0) + SHEET.gap * (rows.length - 1) + other + PRINT.foot;
  assert.ok(used <= printable, `印字できる範囲を越える（${used.toFixed(1)}mm）`);
  // 自由形式は面談と同じ本数（記入欄の頭が同じ高さ）
  assert.equal(Math.floor(freeAreaH() / SHEET.line), 39);
});

test("押印欄: 15mm 角（認印 10.5〜12mm＋余白）。会議は作成者／署名の2列、面談は記録者の1列。頭の高さより低い", () => {
  assert.equal(STAMP.cell, 15);
  // 認印の直径の上限 12mm を入れて、枠線まで 1.5mm ずつ余白が残る
  assert.ok(STAMP.cell - 12 >= 3, "12mm の印影を入れると枠線に触れる");
  assert.deepEqual(SHEET_HEAD.meeting.stamps, ["作成者", "署名"]);
  assert.deepEqual(SHEET_HEAD.interview.stamps, ["記録者"]);
  assert.equal(SHEET_HEAD.meeting.title, "会議記録メモ");
  assert.equal(SHEET_HEAD.meeting.people, "出席者");
  assert.equal(SHEET_HEAD.interview.title, "面談記録メモ");
  assert.equal(SHEET_HEAD.interview.people, "参加者");
  // ラベルの行（7pt＋上下 0.6mm）＋押印 15mm＋枠線は、記入欄の頭（実測 32.8mm）より低い＝頭の高さを変えない
  const labelRow = (STAMP.labelPt * 25.4) / 72 * 1.3 + 0.6 * 2;
  assert.ok(labelRow + STAMP.cell + 0.25 * 3 < PRINT.head - 2.4, "押印欄が記入欄の頭より高い");

  const sm = readFileSync("app/components/SheetMaker.tsx", "utf8");
  const paper = sm.slice(sm.indexOf("function Paper("), sm.indexOf("export default function"));
  assert.ok(paper.includes('className="p-stamp"') && paper.includes("head.stamps.map"), "押印欄はラベルの数だけ列を作る");
  assert.ok(paper.indexOf('className="p-stamp"') < paper.indexOf("free ?"), "自由形式でも押印欄を出す（頭の中にある）");
  assert.ok(paper.indexOf('className="p-main"') < paper.indexOf('className="p-stamp"'), "記入欄の右に置く（重ねない）");

  const css = readFileSync("app/globals.css", "utf8");
  const screen = css.slice(css.indexOf("/* ---------- 用紙を作る"), css.indexOf("/* ---------- 印刷（PDFで保存）"));
  const print = css.slice(css.indexOf("/* ---------- 印刷（PDFで保存）"));
  assert.ok(/\.p-head\{[^}]*display:flex[^}]*align-items:flex-start/.test(screen), "頭は横並び（記入欄＋押印欄）");
  assert.ok(/\.p-stamp td\{[^}]*width:calc\(15 \* var\(--mm\)\)[^}]*height:calc\(15 \* var\(--mm\)\)/.test(screen), "見本の押印は 15mm 角");
  assert.ok(print.includes(".print-sheet .p-stamp td{width:15mm;height:15mm;border:0.25mm solid #444}"), "印刷の押印は 15mm 角・濃い実線");
  assert.ok(print.includes(".print-sheet .p-stamp th{padding:0.6mm 1mm;border:0.25mm solid #444;"), "ラベルの行は文字に合わせた高さ（固定しない）");
  assert.ok(!/\.p-stamp th\{[^}]*[^-]height:/.test(screen + print), "ラベルの行の高さを固定しない");
  // 罫線（0.2mm 点線 #bdbdbd）より濃い
  assert.ok(print.includes("border-bottom:0.2mm dotted #bdbdbd"));
});
