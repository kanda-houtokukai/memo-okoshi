// P9（2026-09-17）: 会議メモへの対応。
//
// 見張ること:
//  - 記録の種類（面談／会議）で項目・プロンプト・保存の鍵・出力の題が切り替わる
//  - 赤（伏せ忘れの知らせ）は**面談・会議とも**働く（P15 で原則3を改め、P9 の「会議は赤を持たない」は改めた）
//  - 面談側のライブラリ・用紙の割り付けは変わらない
//  - 会議の用紙（内容が横いっぱい・決定事項と今後の対応が2列・最後は「その他」だけ・会議名は題の右）が A4 に収まる
//    （押印欄は P12 で用紙から外し、完成形へ移した。tests/stamp.test.mts）
//  - 会議概要は記録だけの項目（用紙の一覧・並べ替え・見本に出さない。P9-c）

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecordType, ITEM_LIBRARY, itemsByIds, libraryFor, MEETING_LIBRARY, RECORD_TYPES, sheetLibrary } from "../lib/items.ts";
import {
  groupIds,
  keyFor,
  loadSettings,
  mergeSheetOrder,
  moveWithinGroup,
  sheetIds,
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
  resolveToken,
  sectionCopyText,
  type ApiData,
} from "../lib/record.ts";
import { buildDocxParts } from "../lib/docx.ts";
import { mergeBackup } from "../lib/vocab.ts";
import { buildBackup, importBackup } from "../lib/backup.ts";
import { enforceNames } from "../lib/names.ts";
import { moveTo } from "../lib/reorder.ts";
import {
  boxHeight,
  lastPageCap,
  pageLabel,
  freeAreaH,
  gridRowsStyle,
  OTHER_BOX,
  linesIn,
  paginate,
  PRINT,
  SHEET,
  SHEET_HEAD,
  sheetFileName,
  sheetLayout,
  sheetRows,
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
    insights: [{ text: INSIGHT_CANARY, why: "今後の対応に担当がない", refs: ["shukudai"] }],
  };
}

const meetingEnabled = Object.fromEntries(MEETING_IDS.map((id) => [id, true]));

/* ---------- 項目ライブラリ ---------- */

test("会議の項目は4つだけ（会議概要・内容・決定事項・今後の対応）。すべて基本・既定オン・追加項目なし", () => {
  assert.deepEqual(MEETING_LIBRARY.map((l) => l.id), MEETING_IDS);
  assert.deepEqual(MEETING_LIBRARY.map((l) => l.label), ["会議概要", "内容", "決定事項", "今後の対応"]);
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
  // 会議は「内容」が横いっぱい、「会議概要」は用紙に載せない記録だけの項目（P9-c）
  assert.equal(MEETING_LIBRARY.find((l) => l.id === "naiyou")?.sheet, "wide");
  assert.equal(MEETING_LIBRARY.find((l) => l.id === "kaigi")?.sheet, "none");
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

test("会議のプロンプト: 人名は面談と同じ赤の規則・塗った箇所は〇〇・混ざった走り書きを振り分ける・今後の対応は補わない", () => {
  const p = buildPrompt(MEETING_LIBRARY, [], "meeting");
  assert.ok(p.includes("会議記録"));
  // P15: 人名（赤）の規則と塗りつぶしの規則は面談と同じ文（RED_RULE・MASK_RULE）
  const iv = buildPrompt(ITEM_LIBRARY.filter((l) => l.defaultOn));
  const rule = (x: string) => x.slice(x.indexOf('   - "r" = 人名'), x.indexOf("5. 整形の都合で"));
  assert.equal(rule(p), rule(iv), "会議と面談で赤の規則が違う");
  assert.ok(p.includes('{"t":"r","s":"人名（敬称込み）"}'), "会議の出力の形に r がない");
  assert.ok(!p.includes("人名は種別を分けず"), "旧い「人名はそのまま本文に書く」が残っている");
  assert.ok(p.includes("内容・決定事項・今後の対応が混ざって書かれている"));
  assert.ok(p.includes("誰が・いつまでに・何を") && p.includes("担当未定") && p.includes("期限未定"));
  assert.ok(p.includes("書かれていない要素は補わない"));
  assert.ok(p.includes("決定事項と検討事項を混ぜない"));
  // 既存の原則: 黄・青・こぼれ・気づき・書かれていないことは書かない
  for (const s of ['迷ったら必ず "y" にする', '"b" = メモに明示されておらず', "spill（拾いきれなかった内容）", "insights（気づき）", "書かれていないことを補完・創作しない"]) {
    assert.ok(p.includes(s), `会議のプロンプトに無い: ${s}`);
  }
  // 気づきは会議の観点
  assert.ok(p.includes("今後の対応に期限がない") && p.includes("担当者が決まっていない") && p.includes("前回の会議で決まった対応"));
  assert.ok(p.includes('"record_type": "meeting"'));
  assert.ok(p.includes("sections はこの id のみ") && MEETING_IDS.every((id) => p.includes(`id:"${id}"`)));
  assert.ok(!p.includes("その他"), "プロンプトに「その他」を持ち込まない");
  assert.ok(!p.includes("面談"), "会議のプロンプトに面談の語が残っている");
  // 辞書は共通で差し込まれる
  assert.ok(buildPrompt(MEETING_LIBRARY, [{ term: "サビ管", gloss: "サービス管理責任者" }], "meeting").includes("# 組織の語彙"));
});

test("面談のプロンプト: 種類を省いても・明示しても同じ文面。人名は r（会議の語を含まない）", () => {
  const items = ITEM_LIBRARY.filter((l) => l.defaultOn);
  const a = buildPrompt(items);
  assert.equal(buildPrompt(items, [], "interview"), a);
  assert.ok(a.includes('"r" = 人名') && a.includes('"record_type": "interview"') && a.includes("面談記録の清書"));
  assert.ok(!a.includes("会議"));
});

/* ---------- 状態（赤は面談・会議とも。P15） ---------- */

test("会議でも赤が付き、確認するまで完成・項目コピー・✎ が止まる。確認すると語はそのまま残る（P15）", () => {
  const s = fromApi(meetingApi(), MEETING_LIBRARY, meetingEnabled, MEETING_IDS, "meeting");
  assert.equal(s.type, "meeting");
  assert.equal(counts(s).r, 2, "会議でも AI の r は赤のまま");
  assert.equal(counts(s).y, 1, "黄は面談と同じく働く");
  assert.equal(isDoneBlocked(s), true);
  assert.equal(isSectionCopyBlocked(s.tokens.shukudai), true);
  assert.equal(sectionCopyText(s, "shukudai"), null);
  // 1件ずつ「確認した」（語はそのまま）で外れる
  let t = s;
  for (const sid of ["kaigi", "shukudai"]) {
    const ti = t.tokens[sid].findIndex((x) => x.t === "r" && !x.resolved);
    t = resolveToken(t, sid, ti, null);
  }
  assert.equal(counts(t).r, 0);
  assert.equal(isDoneBlocked(t), false);
  assert.ok(sectionCopyText(t, "shukudai")!.includes("担当：佐藤／9月末まで"), "確認した語はそのまま残る");
  // 再変換で来た r も赤のまま（会議で落とさない）
  const m = mergeReconvert({ ...t, tokens: { ...t.tokens, kettei: [] }, converted: ["kaigi", "naiyou", "shukudai"] }, { sections: [{ id: "kettei", tokens: [{ t: "r", s: "田中" }] }], spill: [], insights: [] }, MEETING_LIBRARY);
  assert.ok(m.tokens.kettei.some((x) => x.t === "r" && !x.resolved));
});

test("会議: 出力の題は「会議記録」。転記テキスト・Word に気づき・こぼれは混入しない（不変条件1は会議でも維持）", () => {
  const s = fromApi(meetingApi(), MEETING_LIBRARY, meetingEnabled, MEETING_IDS, "meeting");
  const out = buildOutputText(s, MEETING_LIBRARY);
  assert.ok(out.startsWith("【会議記録】（メモおこし下書き）"));
  assert.ok(out.includes("■ 決定事項") && out.includes("■ 今後の対応"));
  assert.ok(!out.includes(INSIGHT_CANARY) && !out.includes(SPILL_CANARY) && !out.includes("今後の対応に担当がない"));
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

test("変換API: 種類を受け取り、面談・会議とも人名の機械検出を通す（P15）", () => {
  const api = readFileSync("app/api/convert/route.ts", "utf8");
  assert.ok(api.includes('form.get("record_type")') && api.includes("isRecordType(rt) ? rt : \"interview\""), "知らない値は面談");
  assert.ok(api.includes("itemsByIds(ids, libraryFor(type))"), "種類のライブラリで項目を引く");
  assert.ok(api.includes("buildPrompt(items, vocab, type)"));
  const apiCode = api.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(apiCode.includes("const data = parsed ? enforceNames(parsed) : null;") && !apiCode.includes("withoutRed"), "面談・会議とも lib/names.ts を通す（P15）");
  const page = readFileSync("app/page.tsx", "utf8");
  assert.ok(page.includes('fd.append("record_type", type)'), "画面が種類を送る");
  assert.ok(page.includes("useState<RecordType>(\"interview\")"), "既定は面談");
  assert.ok(page.includes("fromApi(r.data, lib, s.enabled, s.order, type)") && page.includes("loadSettings(lib, type)"));
  // 種類は変換の最後（確認画面）まで同じ state で保たれ、再変換にも同じ種類を渡す
  assert.ok(page.includes("callConvert(blobs.current, itemIds, type)"));
});

test("確認画面: 人名の札は面談・会議とも出す（P15）。項目・保存の鍵・出力の題は種類に従う", () => {
  const rv = readFileSync("app/components/Review.tsx", "utf8");
  assert.ok(rv.includes('const type = rec.type ?? "interview"') && rv.includes("const lib = libraryFor(type)"));
  assert.ok(!rv.includes('{type !== "meeting" && (') && rv.includes("人名 <b>{c.r}</b>"), "会議でも人名の札を出す");
  assert.ok(rv.includes("keyFor(SETTINGS_KEY, type)"), "保存の鍵は種類ごと");
  assert.ok(!rv.includes("ITEM_LIBRARY"), "面談のライブラリを決め打ちしない");
  assert.ok(rv.includes("lib={lib}"), "項目ドロワーにも種類のライブラリを渡す");
  assert.ok(rv.includes('data-tip="黄=読取に自信なし ／ 青=AIの推定 ／ 赤=人名・対応必須"'), "凡例は面談・会議とも同じ");
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
  assert.ok(sm.includes("saveSettings(next, type)") && sm.includes("loadSettings(lib, type)") && sm.includes("loadSheetOrder(sheetLib, type)"));
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
      const rows = sheetRows(page, i === l.perPage.length - 1, lastPageCap(l.pages, i), i > 0);
      assert.equal(rows.length, Math.ceil(page.length / SHEET.cols), `n=${n} p${i + 1}: 行数`);
      assert.ok(rows.every((r) => r.weight === 1 && r.lines === l.linesPerPage[i]), `n=${n} p${i + 1}: 本数が変わった`);
      assert.deepEqual(rows.flatMap((r) => r.ids), page.map((it) => it.id), "順番も落ちも無い");
      assert.equal(gridRowsStyle(rows), undefined, "面談では行の高さを指定しない（これまでどおり均等）");
      assert.equal(rows[rows.length - 1].wide, wideLast(page.length));
    });
  }
});

test("会議の用紙: 内容は横いっぱいの大きな枠、決定事項と今後の対応は2列、会議概要は枠を作らない。罫線は6mm固定で入るだけ", () => {
  const rows = sheetRows(MEETING_LIBRARY, true);
  assert.deepEqual(rows.map((r) => r.ids), [["naiyou"], ["kettei", "shukudai"]]);
  assert.deepEqual(rows.map((r) => r.wide), [true, false]);
  assert.deepEqual(rows.map((r) => r.weight), [SHEET.wideWeight, 1]);
  assert.equal(gridRowsStyle(rows), `minmax(0,${SHEET.wideWeight}fr) minmax(0,1fr)`);
  // 本数は高さに入るだけ（間隔 6mm）。内容 23 本・決定事項/今後の対応 6 本（P9-d: 重み 2.3→3.15。P9-b では 21/8）
  assert.deepEqual(rows.map((r) => r.lines), [23, 6]);
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
  // 会議概要は枠を作らない（用紙に載せない・P9-c）
  assert.ok(!rows.flatMap((r) => r.ids).includes("kaigi"));
  const noOverview = sheetRows(MEETING_LIBRARY.filter((l) => l.id !== "kaigi"), true);
  assert.deepEqual(noOverview.map((r) => r.ids), [["naiyou"], ["kettei", "shukudai"]]);
  // 内容を外すと残りは2列1行で、面談と同じ規則（全高に入るだけ）
  const noBody = sheetRows(MEETING_LIBRARY.filter((l) => l.id !== "naiyou"), true);
  assert.deepEqual(noBody.map((r) => r.ids), [["kettei", "shukudai"]]);
  assert.equal(noBody[0].lines, sheetLayout(2).linesPerPage[0]);
  // 今後の対応だけ外すと決定事項は1つ余るので横いっぱい
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
  assert.equal(Math.floor(freeAreaH() / SHEET.line), 38);
});

test("用紙に押印欄は無い（P12 で完成形へ移した）。頭の文言は種類ごと（題・参加者／出席者）", () => {
  assert.deepEqual(SHEET_HEAD.meeting, { title: "会議記録メモ", people: "出席者", name: "会議名" });
  assert.deepEqual(SHEET_HEAD.interview, { title: "面談記録メモ", people: "参加者" });
  const sm = readFileSync("app/components/SheetMaker.tsx", "utf8");
  const paper = sm.slice(sm.indexOf("function Paper("), sm.indexOf("export default function"));
  assert.ok(!/p-stamp|stamps|<table/.test(paper), "用紙に押印欄がある");
  // 罫線（0.2mm 点線 #bdbdbd）はそのまま
  const css = readFileSync("app/globals.css", "utf8");
  assert.ok(css.slice(css.indexOf("/* ---------- 印刷（PDFで保存）")).includes("border-bottom:0.2mm dotted #bdbdbd"));
});

test("記入欄は1項目1行（日時／場所／参加者・出席者）＋会議だけ題の右に会議名。どの行も右端まで使う（P9-b・P9-c・P12）", () => {
  const sm = readFileSync("app/components/SheetMaker.tsx", "utf8");
  const paper = sm.slice(sm.indexOf("function Paper("), sm.indexOf("export default function"));
  const main = paper.slice(paper.indexOf('className="p-main"'), paper.indexOf('className="p-fields p-people"'));
  // 題・日時・場所は頭の1段目、参加者・出席者は2段目（どちらも横いっぱい）
  assert.ok(main.includes('className="f f-date"') && main.includes('className="f f-place"'));
  assert.ok(!main.includes("f-people"), "参加者・出席者を1段目に置かない");
  assert.equal((paper.match(/className="f f-/g) ?? []).length, 4, "記入欄は日時・場所・参加者/出席者の3行＋会議名（題の行）");
  // 面談と会議で同じ形（見出しの文言だけが違う）
  assert.ok(paper.includes("{head.people}") && !/type === "meeting"/.test(paper), "頭の形を種類で分けない");

  const css = readFileSync("app/globals.css", "utf8");
  const screen = css.slice(css.indexOf("/* ---------- 用紙を作る"), css.indexOf("/* ---------- 印刷（PDFで保存）"));
  assert.ok(/\.p-head\{[^}]*display:grid;grid-template-columns:minmax\(0,1fr\);/.test(screen), "頭は1列（押印欄を外した。P12）");
  assert.ok(screen.includes(".p-people{grid-column:1 / -1;grid-row:2"), "参加者・出席者は横いっぱいの2段目");
  assert.ok(screen.includes(".p-fields{display:grid;grid-template-columns:minmax(0,1fr);"), "記入欄は1列（1項目1行）");
  assert.ok(!screen.includes(".f-people{grid-column"), "旧: 1行目に日時と場所を並べていた指定が残っていない");

  // 印刷の実測（2026-09-23・P12。印刷の規則を当てて 192mm 幅で測った値。mm）。押印欄を外しても頭の高さは同じ（42.26）
  const MEASURED = { head: 42.26, placeW: { interview: 185.4, meeting: 185.4 }, nameW: 151.1, peopleW: 182.5 };
  assert.ok(PRINT.head >= MEASURED.head, "割り付けの見積もりが実測より小さい");
  // 場所は押印欄があったころ（面談 167mm・会議 152mm）より広く、会議名の下線も右端まで（117.8→151.1mm）
  assert.ok(MEASURED.placeW.meeting > 152 && MEASURED.placeW.interview > 167 && MEASURED.nameW > 117.8);
});

test("面談の用紙の本数（P9-b の変更後）: 既定の基本6項目は 9本のまま。減るのは 1〜4項目・2枚・自由形式で各1本", () => {
  assert.deepEqual(sheetLayout(6).linesPerPage, [9]);
  assert.deepEqual(sheetLayout(8).linesPerPage, [10, 15]); // P9-e で 1ページ6項目まで・P9-f で最後のページは15本まで（P9-b では [6]）
  assert.deepEqual([1, 2, 3, 4].map((n) => sheetLayout(n).linesPerPage[0]), [31, 31, 14, 14]);
  assert.deepEqual(sheetLayout(9).linesPerPage, [10, 15]); // P9-g で2ページ目 14→15（上限）
  assert.deepEqual(sheetLayout(13).linesPerPage, [10, 12, 15]); // P9-e・P9-f・P9-g（P9-b では [7, 9]）
  assert.equal(Math.floor(freeAreaH() / SHEET.line), 38);
});

/* ---------- 辞書の書き出し（P9-b: 会議の設定も運ぶ） ---------- */

const IV_IDS = ITEM_LIBRARY.map((l) => l.id);

test("書き出しの読み込み（純関数）: 会議の設定は meeting の中・会議の id で絞る。古いファイルは会議に触れない", () => {
  const r = mergeBackup(
    {
      app: "memo-okoshi",
      version: 1,
      vocab: [],
      items: { enabled: ["gaiyou", "naiyou"], order: ["gaiyou", "naiyou"] },
      sheetFree: true,
      meeting: {
        items: { enabled: ["naiyou", "gaiyou", "zzz"], order: ["kettei", "naiyou", "gaiyou"] },
        sheetOrder: ["shukudai", "honnin", "kaigi", 3],
        sheetFree: "yes",
      },
    },
    [],
    IV_IDS,
    MEETING_IDS
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.items, { enabled: ["gaiyou"], order: ["gaiyou"] }, "面談の設定は面談の id で絞る");
  assert.equal(r.sheetFree, true);
  assert.deepEqual(r.meeting?.items, { enabled: ["naiyou"], order: ["kettei", "naiyou"] }, "会議の設定は会議の id で絞る");
  assert.deepEqual(r.meeting?.sheetOrder, ["shukudai", "kaigi"]);
  assert.equal(r.meeting?.sheetFree, undefined, "真偽値でなければ読まない");
  // 会議の設定が入っていない古いファイル
  const old = mergeBackup({ app: "memo-okoshi", version: 1, vocab: [], items: { enabled: ["gaiyou"], order: ["gaiyou"] } }, [], IV_IDS, MEETING_IDS);
  assert.ok(old.ok && old.meeting === undefined && old.sheetFree === undefined && old.items?.enabled[0] === "gaiyou");
});

test("書き出し→読み込みで、面談と会議の 項目の選択・並び・自由形式 がすべて戻る（置換）", () => {
  const m = useFakeStorage();
  const iv = loadSettings(ITEM_LIBRARY);
  iv.enabled.kinsen = true;
  saveSettings(iv);
  saveSheetOrder(["kadai", "gaiyou"]);
  saveSheetFree(true);
  const mt = loadSettings(MEETING_LIBRARY, "meeting");
  mt.enabled.kaigi = false;
  saveSettings(mt, "meeting");
  saveSheetOrder(["kettei", "shukudai", "naiyou", "kaigi"], "meeting");
  saveSheetFree(true, "meeting");
  const before = new Map(m);

  const file = JSON.parse(JSON.stringify(buildBackup([{ term: "個支計" }])));
  assert.ok(file.meeting && file.meeting.items && file.meeting.sheetOrder && file.meeting.sheetFree === true, "会議の設定が入る");
  assert.equal(file.sheetFree, true, "面談の自由形式も入る");

  // 空の端末へ読み込む（復旧）
  m.clear();
  const r = importBackup(file, []);
  assert.ok(r.ok && r.itemsApplied);
  for (const [k, v] of before) assert.equal(m.get(k), v, `${k} が戻っていない`);
  assert.equal(loadSettings(MEETING_LIBRARY, "meeting").enabled.kaigi, false);
  assert.deepEqual(loadSheetOrder(MEETING_LIBRARY, "meeting"), ["kettei", "shukudai", "naiyou", "kaigi"]);
  assert.equal(loadSheetFree("meeting"), true);
  assert.equal(loadSheetFree(), true);
});

test("読み込み: 会議の設定が無い古いファイルは会議の設定に触れない／会議を触ったことがない端末の書き出しには meeting を入れない", () => {
  const m = useFakeStorage();
  const mt = loadSettings(MEETING_LIBRARY, "meeting");
  mt.enabled.naiyou = false;
  saveSettings(mt, "meeting");
  saveSheetFree(true, "meeting");
  const keep = [keyFor(SETTINGS_KEY, "meeting"), keyFor(SHEET_FREE_KEY, "meeting")].map((k) => [k, m.get(k)] as const);
  const r = importBackup({ app: "memo-okoshi", version: 1, vocab: [], items: { enabled: ["gaiyou"], order: ["gaiyou"] }, sheetOrder: ["gaiyou"] }, []);
  assert.ok(r.ok && r.itemsApplied);
  for (const [k, v] of keep) assert.equal(m.get(k), v, `${k} が変わった`);
  assert.equal(m.get(SETTINGS_KEY), JSON.stringify({ enabled: ["gaiyou"], order: ["gaiyou"] }), "面談は置き換わる");
  assert.ok(!m.has(SHEET_FREE_KEY), "ファイルに無い面談の自由形式は触らない");

  const fresh = useFakeStorage();
  assert.equal(fresh.size, 0);
  const b = buildBackup([]);
  assert.ok(!("meeting" in b) && !("sheetFree" in b) && !("items" in b) && !("sheetOrder" in b), "設定したことがないものは入れない");
  // 画面側は会議の id も渡す
  const drawer = readFileSync("app/components/VocabDrawer.tsx", "utf8");
  assert.ok(drawer.includes("MEETING_LIBRARY.map((l) => l.id)"));
  // 会議の鍵は settings.ts から作る（backup.ts に鍵の文字列を書かない）
  const backup = readFileSync("lib/backup.ts", "utf8");
  assert.ok(!backup.includes('"memo-okoshi:') && backup.includes('keyFor(SETTINGS_KEY, type)'));
});

/* ---------- P9-c: 会議の用紙の項目は3つ・会議名は頭・会議概要は記録だけ ---------- */

const SHEET_MT = sheetLibrary(MEETING_LIBRARY);

test("用紙に載る会議の項目は 内容・決定事項・今後の対応 の3つ（会議概要は記録だけ）。面談は13項目すべて載る", () => {
  assert.deepEqual(SHEET_MT.map((l) => l.id), ["naiyou", "kettei", "shukudai"]);
  assert.deepEqual(sheetLibrary(ITEM_LIBRARY), ITEM_LIBRARY, "面談の用紙の項目は変わらない");
  // 記録の項目としての会議概要は残る（確認画面のカード・プロンプトの項目構成）
  assert.ok(MEETING_LIBRARY.some((l) => l.id === "kaigi" && l.label === "会議概要" && l.defaultOn));
  // 会議概要がオンでも用紙には出ない。保存された並びに会議概要が入っていても読むときに落ちる
  const enabled = Object.fromEntries(MEETING_IDS.map((id) => [id, true]));
  assert.deepEqual(sheetIds(["kaigi", "kettei", "naiyou", "shukudai"], enabled, SHEET_MT), ["kettei", "naiyou", "shukudai"]);
  assert.deepEqual(mergeSheetOrder(["shukudai", "kaigi"], SHEET_MT), ["shukudai", "naiyou", "kettei"]);
});

test("会議の用紙の並べ替えは3項目の中で自由に効き、どの並びでも罫線は枠に収まる（P9-c）", () => {
  const base = mergeSheetOrder(null, SHEET_MT);
  assert.deepEqual(base, ["naiyou", "kettei", "shukudai"]);
  const ids = groupIds(base, SHEET_MT, "基本");
  for (let from = 0; from < ids.length; from++) {
    for (let at = 0; at <= ids.length; at++) {
      assert.deepEqual(moveWithinGroup(base, SHEET_MT, "基本", from, at), moveTo(ids, from, at), `${from}→${at}`);
    }
  }
  // 6通りの並びすべてで、割り付けが用紙の並びに従い、罫線が枠に入る（入るだけ・下の余白に入れない）
  const perms = [
    ["naiyou", "kettei", "shukudai"],
    ["naiyou", "shukudai", "kettei"],
    ["kettei", "naiyou", "shukudai"],
    ["kettei", "shukudai", "naiyou"],
    ["shukudai", "naiyou", "kettei"],
    ["shukudai", "kettei", "naiyou"],
  ];
  const got: Record<string, string> = {};
  for (const p of perms) {
    const items = p.map((id) => SHEET_MT.find((l) => l.id === id)!);
    const rows = sheetRows(items, true);
    assert.deepEqual(rows.flatMap((r) => r.ids), p, "用紙の並びどおりに置く");
    const total = rows.reduce((a, r) => a + r.weight, 0);
    const usable = boxHeight(1, true) - SHEET.gap * (rows.length - 1);
    for (const r of rows) {
      const h = (usable * r.weight) / total;
      assert.ok(r.lines >= SHEET.minLines, `${p}: 罫線が少なすぎる`);
      assert.ok(h - PRINT.boxTop - r.lines * SHEET.line >= PRINT.boxBottom - 1e-9, `${p}: 縁ぎりぎり`);
      assert.ok(h - PRINT.boxTop - (r.lines + 1) * SHEET.line < PRINT.boxBottom, `${p}: まだ1本入る`);
    }
    got[p.join(",")] = rows.map((r) => r.ids.join("+") + ":" + r.lines).join(" / ");
  }
  // 既定の並び（内容が上）は 内容23・決定事項/今後の対応6（P9-d）
  assert.equal(got["naiyou,kettei,shukudai"], "naiyou:23 / kettei+shukudai:6");
  assert.equal(got["kettei,shukudai,naiyou"], "kettei+shukudai:6 / naiyou:23");
  // 内容を真ん中に挟むと、決定事項・今後の対応はそれぞれ1つで横いっぱい
  assert.equal(got["kettei,naiyou,shukudai"], "kettei:4 / naiyou:18 / shukudai:4");
});

test("用紙の画面: 一覧・並べ替え・見本は用紙の項目だけ、オン・オフの保存は種類のライブラリ全体（記録の会議概要を消さない）", () => {
  const sm = readFileSync("app/components/SheetMaker.tsx", "utf8");
  assert.ok(sm.includes("const sheetLib = useMemo(() => sheetLibrary(lib), [lib])"));
  for (const s of [
    "sheetGroups(sheetLib)",
    "groupIds(order, sheetLib, g)",
    "moveWithinGroup(o, sheetLib, g, from, insertAt)",
    "sheetIds(order, set.enabled, sheetLib)",
    "loadSheetOrder(sheetLib, type)",
  ]) {
    assert.ok(sm.includes(s), `用紙の項目だけで扱っていない: ${s}`);
  }
  assert.ok(sm.includes("setSet(loadSettings(lib, type))") && !sm.includes("loadSettings(sheetLib"), "オン・オフは全体で読む");
  // 実際に: 用紙の画面で内容をオフにして保存しても、記録の会議概要はオンのまま
  useFakeStorage();
  const s = loadSettings(MEETING_LIBRARY, "meeting");
  saveSettings({ ...s, enabled: { ...s.enabled, naiyou: false } }, "meeting");
  const after = loadSettings(MEETING_LIBRARY, "meeting");
  assert.equal(after.enabled.kaigi, true, "記録の会議概要が消えた");
  assert.equal(after.enabled.naiyou, false);
  // 下部は面談と同じ「その他」だけ（会議概要を相乗りさせない）
  const paper = sm.slice(sm.indexOf("function Paper("), sm.indexOf("export default function"));
  assert.ok(paper.includes("<h4>{OTHER_BOX.label}</h4>") && paper.includes('["--c" as string]: "var(--sub)"'));
  assert.ok(!/merged|otherLabel/.test(paper), "旧: 会議概要を「その他」に相乗りさせる処理が残っている");
  assert.equal(OTHER_BOX.label, "その他");
});

test("会議名の欄は会議だけ・題の右。題の行の高さに収まる 7mm の下線で、頭の高さを変えない（P9-c）", () => {
  assert.equal(SHEET_HEAD.meeting.name, "会議名");
  assert.equal(SHEET_HEAD.interview.name, undefined, "面談には会議名の欄を置かない");
  const sm = readFileSync("app/components/SheetMaker.tsx", "utf8");
  const paper = sm.slice(sm.indexOf("function Paper("), sm.indexOf("export default function"));
  const bar = paper.slice(paper.indexOf('className="p-titlebar"'), paper.indexOf(") : (", paper.indexOf('className="p-titlebar"')));
  assert.ok(paper.includes("{head.name ? ("), "会議名の欄は SHEET_HEAD の name があるときだけ");
  assert.ok(bar.includes('className="p-title"') && bar.includes('className="p-fields p-name"') && bar.includes("{head.name}"));
  assert.ok(bar.indexOf('className="p-title"') < bar.indexOf("p-name"), "題の右");
  const css = readFileSync("app/globals.css", "utf8");
  const screen = css.slice(css.indexOf("/* ---------- 用紙を作る"), css.indexOf("/* ---------- 印刷（PDFで保存）"));
  const print = css.slice(css.indexOf("/* ---------- 印刷（PDFで保存）"));
  assert.ok(screen.includes(".p-titlebar .p-title{flex:0 0 auto;margin-bottom:0}") && print.includes(".print-sheet .p-titlebar .p-title{margin-bottom:0}"));
  // 画面も印刷も、会議名の下線（7mm）は .p-fields .wr（8mm）の規則より後ろにあって上書きする
  assert.ok(screen.indexOf(".p-name .wr{height:calc(7 * var(--mm))}") > screen.indexOf(".p-fields .wr{"));
  assert.ok(print.indexOf(".print-sheet .p-name .wr{height:7mm}") > print.indexOf(".print-sheet .p-fields .wr{"));
  // 印刷の実測（2026-09-17・192mm 幅）: 頭の高さは面談も会議も 42.4mm のまま（PRINT.head 42.5 に収まる）
  const MEASURED = { interviewHead: 42.4, meetingHead: 42.4 };
  assert.ok(PRINT.head >= MEASURED.interviewHead && PRINT.head >= MEASURED.meetingHead);
});

test("会議のプロンプト: 会議名・日時・場所・出席者は用紙の頭の記入欄から読み、会議概要に行を分けてまとめる（P9-c）", () => {
  const p = buildPrompt(MEETING_LIBRARY, [], "meeting");
  for (const s of [
    '会議概要（id:"kaigi"）にまとめる',
    "最上部の記入欄",
    "「会議名」",
    "この記入欄を必ず読み",
    "「会議名：」「日時：」「場所：」「出席者：」",
    "空欄の行は書かない",
    "押印欄は記録の対象ではない",
  ]) {
    assert.ok(p.includes(s), `会議のプロンプトに無い: ${s}`);
  }
  assert.ok(!p.includes("その他") && !p.includes("面談"));
});

/* ---------- P9-d: 「宿題」→「今後の対応」・内容の枠を大きく ---------- */

/** // 行コメントと /* *​/ ブロックコメントを落とす（ui-text.test と同じ単純な除去） */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourcesUnder(p));
    else if (/\.(tsx|ts|json|webmanifest)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("「宿題」という語が画面・プロンプト・出力のどこにも残っていない（項目名は「今後の対応」・id は shukudai のまま）", () => {
  // 画面とプロンプトと出力を作るコード（コメントは除く）と、配信する public の文字のファイル
  for (const f of [...sourcesUnder("app"), ...sourcesUnder("lib"), ...sourcesUnder("public")]) {
    const body = f.endsWith(".json") || f.endsWith(".webmanifest") ? readFileSync(f, "utf8") : stripComments(readFileSync(f, "utf8"));
    assert.ok(!body.includes("宿題"), `${f} に「宿題」が残っている`);
  }
  // 項目の定義: 名前とタブは変わり、id は変わらない
  const def = MEETING_LIBRARY.find((l) => l.id === "shukudai")!;
  assert.equal(def.label, "今後の対応");
  assert.equal(def.tab, "対応");
  // プロンプト（会議・面談とも）
  const mp = buildPrompt(MEETING_LIBRARY, [{ term: "サビ管" }], "meeting");
  assert.ok(!mp.includes("宿題") && mp.includes('id:"shukudai" 名称「今後の対応」'));
  assert.ok(!buildPrompt(ITEM_LIBRARY, [], "interview").includes("宿題"));
  // 出力（転記用テキスト・Word）
  const s = fromApi(meetingApi(), MEETING_LIBRARY, meetingEnabled, MEETING_IDS, "meeting");
  const out = buildOutputText(s, MEETING_LIBRARY);
  assert.ok(out.includes("■ 今後の対応") && !out.includes("宿題"));
  const docx = Object.values(buildDocxParts(recordEntries(s, MEETING_LIBRARY), new Date(2026, 8, 17), outputTitle("meeting"))).join("");
  assert.ok(docx.includes("今後の対応") && !docx.includes("宿題"));
});

test("id を変えていないので、保存済みの会議の設定（選択・並び）はそのまま読める（P9-d）", () => {
  useFakeStorage();
  // 改称前に保存された値（id は同じ）
  localStorage.setItem(keyFor(SETTINGS_KEY, "meeting"), JSON.stringify({ enabled: ["kaigi", "naiyou", "shukudai"], order: ["kaigi", "shukudai", "naiyou", "kettei"] }));
  saveSheetOrder(["shukudai", "naiyou", "kettei"], "meeting");
  const st = loadSettings(MEETING_LIBRARY, "meeting");
  assert.deepEqual(MEETING_IDS.filter((id) => st.enabled[id]), ["kaigi", "naiyou", "shukudai"]);
  assert.deepEqual(loadSheetOrder(SHEET_MT, "meeting"), ["shukudai", "naiyou", "kettei"]);
  assert.deepEqual(sheetIds(loadSheetOrder(SHEET_MT, "meeting"), st.enabled, SHEET_MT).map((id) => MEETING_LIBRARY.find((l) => l.id === id)!.label), ["今後の対応", "内容"]);
});

test("会議の用紙の配分（P9-d）: 決定事項・今後の対応は 8→6本、内容は 21→23本。6mm 固定・入るだけ・A4 に収まる。面談は変わらない", () => {
  assert.equal(SHEET.wideWeight, 3.15);
  const rows = sheetRows(SHEET_MT, true);
  assert.deepEqual(rows.map((r) => [r.ids.join("+"), r.lines]), [["naiyou", 23], ["kettei+shukudai", 6]]);
  // 印刷で実測した枠の並びの高さ（その他あり 200.93mm・1本目 8.35mm）でも、最後の線から枠の下端まで下限 1.45mm 以上あく
  const usableReal = 200.93 - SHEET.gap;
  const tot = rows.reduce((a, r) => a + r.weight, 0);
  for (const r of rows) {
    const clear = (usableReal * r.weight) / tot - 8.35 - r.lines * SHEET.line;
    assert.ok(clear >= PRINT.boxBottom, `${r.ids}: 実測では ${clear.toFixed(2)}mm`);
  }
  // A4: 頭＋枠2行＋隙間＋その他＋下の行 ≤ 279mm
  const used = PRINT.head + rows.reduce((a, r) => a + PRINT.boxTop + r.lines * SHEET.line + PRINT.boxBottom, 0) + SHEET.gap +
    (PRINT.boxTop + SHEET.otherLines * SHEET.line + PRINT.boxBottom + SHEET.gap) + PRINT.foot;
  assert.ok(used <= SHEET.pageH - SHEET.margin * 2, `A4 を越える（${used.toFixed(1)}mm）`);
  // 面談は wide の項目が無いので重みの影響を受けない（本数は P9-e の1ページ6項目までの割り付けどおり）
  assert.deepEqual([1, 3, 5, 7, 9, 13].map((n) => sheetLayout(n).linesPerPage.join("+")), ["31", "14", "9", "10+15", "10+15", "10+12+15"]);
  assert.ok(ITEM_LIBRARY.every((l) => l.sheet === undefined));
});

test("会議の用紙は1ページ6項目までの改ページの影響を受けない（3項目で1枚・内容23/決定事項と今後の対応6のまま・P9-e）", () => {
  const n = SHEET_MT.length;
  assert.equal(n, 3);
  assert.deepEqual(sheetLayout(n).perPage, [3]);
  assert.deepEqual(sheetRows(SHEET_MT, true).map((r) => r.lines), [23, 6]);
});

test("会議の用紙は最後のページの上限の影響を受けない（3項目で1枚＝上限なし・内容23/決定事項と今後の対応6のまま・P9-f）", () => {
  const l = sheetLayout(SHEET_MT.length);
  assert.equal(l.pages, 1);
  assert.equal(lastPageCap(l.pages, 0), undefined);
  const rows = sheetRows(SHEET_MT, true, lastPageCap(l.pages, 0));
  assert.deepEqual(rows.map((r) => [r.lines, r.capped]), [[23, false], [6, false]]);
});

test("会議の用紙は1枚なので2ページ目以降の規則（題だけ・ページ番号）は現れない。頭は会議名つきのまま（P9-g）", () => {
  const l = sheetLayout(SHEET_MT.length);
  assert.equal(l.pages, 1);
  assert.equal(pageLabel(0, l.pages), undefined);
  assert.deepEqual(sheetRows(SHEET_MT, true, lastPageCap(l.pages, 0), false).map((r) => r.lines), [23, 6]);
});
