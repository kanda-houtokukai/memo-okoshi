// P8-k: 項目の表示順（ORDER）。
//
// 確認画面のカード・転記用テキスト・Word・PDF は、すべて同じ並び（state.order の中のオンの項目）に従う。
// その並びは **AIの返答の順序（sections の並び）を使わない**。保存された並び（定義順＋利用者が↑↓で動かした順）を
// 土台に、抜けを定義順の位置へ入れ、締め（申し送り）を最後にする（normalizeOrder）。
// 2026-09-13: 項目をオフ→オンすると末尾へ動かしていたため、面談概要が一番下に来て、それが保存され次の変換にも出ていた。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEM_LIBRARY as L } from "../lib/items.ts";
import {
  activeIds,
  buildOutputText,
  fromApi,
  mergeReconvert,
  moveSection,
  moveSpillTo,
  normalizeOrder,
  recordEntries,
  toggleItem,
  type ApiData,
} from "../lib/record.ts";
import { defaultSettings, mergeSettings } from "../lib/settings.ts";
import { buildDocxParts } from "../lib/docx.ts";

const BASIC = ["gaiyou", "honnin", "kazoku", "kadai", "kenko", "seikatsu"];
const sec = (id: string) => ({ id, tokens: [{ t: "p" as const, s: `${id}の内容。` }] });
const api = (ids: string[]): ApiData => ({ sections: ids.map(sec), spill: [], insights: [] });
const set0 = defaultSettings(L);
const heads = (text: string) => text.split("\n").filter((l) => l.startsWith("■ ")).map((l) => l.slice(2));
const labels = (ids: string[]) => ids.map((id) => L.find((l) => l.id === id)!.label);

test("AIの返答の順序を入れ替えても、表示順は変わらない（逆順・回転・入れ替え・P8-k）", () => {
  const en = { ...set0.enabled, kinsen: true, moushiokuri: true };
  const base = [...BASIC, "kinsen", "moushiokuri"];
  const perms = [
    base,
    [...base].reverse(),
    [...base.slice(3), ...base.slice(0, 3)],
    ["moushiokuri", "kenko", "gaiyou", "kinsen", "kazoku", "seikatsu", "honnin", "kadai"],
  ];
  const got = perms.map((p) => {
    const st = fromApi(api(p), L, en, set0.order);
    return { act: activeIds(st), text: heads(buildOutputText(st, L)), entries: recordEntries(st, L).map((e) => e.label) };
  });
  for (const g of got) assert.deepEqual(g, got[0], "AIの順序で表示順が変わった");
  assert.deepEqual(got[0].act, base, "定義順＋締めは最後");
});

test("確認画面のカード・転記用テキスト・Word・PDF の順序が一致する（P8-k）", () => {
  const en = { ...set0.enabled, kinsen: true, moushiokuri: true };
  const st = fromApi(api([...BASIC, "kinsen", "moushiokuri"].reverse()), L, en, set0.order);
  const want = labels(activeIds(st));
  assert.deepEqual(heads(buildOutputText(st, L)), want, "転記用テキスト");
  const entries = recordEntries(st, L);
  assert.deepEqual(entries.map((e) => e.label), want, "Word・PDF に渡す並び");
  const doc = Object.entries(buildDocxParts(entries)).find(([k]) => k.endsWith("document.xml"))![1];
  const pos = want.map((l) => doc.indexOf(l));
  assert.ok(pos.every((p) => p >= 0) && pos.every((p, i) => i === 0 || p > pos[i - 1]), "Word の中の並びが違う");
  // 画面のカードも同じ並び、Word と PDF は同じ recordEntries を順に使う
  const rv = readFileSync("app/components/Review.tsx", "utf8");
  assert.ok(rv.includes("const acts = activeIds(rec)"));
  assert.ok(rv.includes("exportDocx(recordEntries(rec, ITEM_LIBRARY))") && rv.includes("printRecord(recordEntries(rec, ITEM_LIBRARY))"));
  const ex = readFileSync("lib/export.ts", "utf8");
  assert.ok(ex.slice(ex.indexOf("export function printRecord")).includes("for (const e of entries)"));
});

test("項目をオフ→オンしても元の場所に戻る（面談概要が一番下へ移らない）・次の変換でも同じ（P8-k）", () => {
  let st = fromApi(api(BASIC), L, set0.enabled, set0.order);
  const before = activeIds(st);
  st = toggleItem(st, "gaiyou", L).state;
  st = toggleItem(st, "gaiyou", L).state;
  assert.deepEqual(activeIds(st), before, "オフ→オンで並びが変わった");
  assert.equal(st.tokens.gaiyou[0].s, "gaiyouの内容。", "中身も戻る");
  // その並びが保存され、次の変換（AIの順序は逆）で使われても同じ
  assert.deepEqual(activeIds(fromApi(api([...BASIC].reverse()), L, st.enabled, st.order)), before);
});

test("保存された並びに抜けがあっても、末尾に足さず定義順の位置へ入れる（P8-k）", () => {
  const m = mergeSettings({ enabled: BASIC, order: ["honnin", "kazoku", "kadai", "kenko", "seikatsu"] }, L);
  assert.equal(m.order.filter((id) => m.enabled[id])[0], "gaiyou", "面談概要が先頭に戻らない");
  const n = normalizeOrder(["kazoku", "gaiyou"], L);
  // 並べた順（家族等の発言 → 面談概要）は残し、抜けは定義順で直前の項目のすぐ後ろへ入れる
  assert.ok(n.indexOf("kazoku") < n.indexOf("gaiyou"), "利用者が並べた順が崩れた");
  assert.equal(n.indexOf("honnin"), n.indexOf("gaiyou") + 1, "本人の発言は定義順で直前の面談概要の後ろ");
  assert.equal(n.indexOf("kadai"), n.indexOf("kazoku") + 1, "課題・変化は定義順で直前の家族等の発言の後ろ");
  assert.deepEqual([...n].sort(), L.map((l) => l.id).sort(), "重複も欠けもない");
  assert.deepEqual(normalizeOrder(["gaiyou", "gaiyou", "zzz", "honnin"], L).slice(0, 2), ["gaiyou", "honnin"], "重複と知らない id を落とす");
});

test("締め（申し送り）は常に最後（用紙の画面でオンにした場合も・P8-k）", () => {
  const en = { ...set0.enabled, moushiokuri: true, nicchu: true };
  const act = activeIds(fromApi(api(BASIC), L, en, set0.order));
  assert.equal(act[act.length - 1], "moushiokuri");
  assert.ok(act.indexOf("nicchu") < act.indexOf("moushiokuri"));
  // こぼれをオフの項目へ移しても、その項目は締めより前・定義順の位置に入る
  let st = fromApi({ sections: BASIC.map(sec), spill: [{ text: "年金の話", suggest: null }], insights: [] }, L, { ...set0.enabled, moushiokuri: true }, set0.order);
  st = moveSpillTo(st, 0, "kinsen", L);
  assert.deepEqual(activeIds(st), [...BASIC, "kinsen", "moushiokuri"]);
});

test("利用者が↑↓で動かした順は保たれ、転記用テキストにも出る（次の変換でもAIの順で上書きしない・P8-k）", () => {
  let st = fromApi(api(BASIC), L, set0.enabled, set0.order);
  st = moveSection(st, "kazoku", -1); // 家族等の発言を1つ上へ
  const moved = activeIds(st);
  assert.deepEqual(moved.slice(0, 3), ["gaiyou", "kazoku", "honnin"]);
  assert.deepEqual(heads(buildOutputText(st, L)), labels(moved), "転記用テキストに並べ替えが出ない");
  assert.deepEqual(recordEntries(st, L).map((e) => e.label), labels(moved), "Word・PDF に並べ替えが出ない");
  assert.deepEqual(activeIds(fromApi(api([...BASIC].reverse()), L, st.enabled, st.order)), moved, "次の変換で戻された");
});

test("項目を追加して再変換しても順序が崩れない（P8-k）", () => {
  let st = fromApi(api(BASIC), L, set0.enabled, set0.order);
  st = toggleItem(st, "kinsen", L).state;
  const want = activeIds(st);
  assert.deepEqual(want, [...BASIC, "kinsen"]);
  const m = mergeReconvert(st, { sections: [sec("kinsen"), sec("gaiyou")].reverse(), spill: [], insights: [] }, L);
  assert.deepEqual(activeIds(m), want);
  assert.deepEqual(heads(buildOutputText(m, L)), labels(want));
});

test("用紙の並びには触れない（別の設定・P8-k）", () => {
  const rec = readFileSync("lib/record.ts", "utf8");
  assert.ok(!/sheet-order|SheetOrder|SHEET_ORDER/.test(rec));
  const s = readFileSync("lib/settings.ts", "utf8");
  const ms = s.slice(s.indexOf("export function mergeSettings"), s.indexOf("export function loadSettings"));
  assert.ok(!ms.includes("SHEET_ORDER_KEY") && ms.includes("normalizeOrder(saved.order"));
});
