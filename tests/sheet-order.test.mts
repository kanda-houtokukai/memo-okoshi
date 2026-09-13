// P8-d: 面談用紙の項目の並べ替え。
//
// 並びは**用紙だけの設定**で、記録側の並び（確認画面のカード順・ORDER と締めフラグ）には反映しない。
// オン・オフは記録と共有したまま、並びだけを分ける。群（基本／追加項目）はまたがない。
// ここではその分離と、群をまたがないことを見張る。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEM_LIBRARY } from "../lib/items.ts";
import {
  defaultSettings,
  groupIds,
  loadSettings,
  loadSheetOrder,
  mergeSheetOrder,
  moveWithinGroup,
  saveSettings,
  saveSheetOrder,
  SETTINGS_KEY,
  SHEET_ORDER_KEY,
  sheetGroups,
  sheetIds,
} from "../lib/settings.ts";
import { dropIndexVertical, moveTo } from "../lib/reorder.ts";
import { normalizeOrder } from "../lib/record.ts";
import { mergeBackup } from "../lib/vocab.ts";

const LIB = ITEM_LIBRARY;
const ALL = LIB.map((l) => l.id);
const BASIC = LIB.filter((l) => l.group === "基本").map((l) => l.id);
const EXTRA = LIB.filter((l) => l.group === "追加項目").map((l) => l.id);
const groupOf = (id: string) => LIB.find((l) => l.id === id)!.group;

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

test("群は基本→追加項目の順で、並べ替えたことがなければ定義順（オフの項目も並びに含む）", () => {
  assert.deepEqual(sheetGroups(LIB), ["基本", "追加項目"]);
  assert.deepEqual(mergeSheetOrder(null, LIB), [...BASIC, ...EXTRA]);
  assert.equal(mergeSheetOrder(null, LIB).length, ALL.length, "オフの項目も並びに入っている");
});

test("群の中でだけ動く。どの動かし方でも群をまたがない（P8-d）", () => {
  const base = mergeSheetOrder(null, LIB);
  for (const g of sheetGroups(LIB)) {
    const ids = groupIds(base, LIB, g);
    for (let from = 0; from < ids.length; from++) {
      for (let at = -2; at <= ids.length + 2; at++) {
        const next = moveWithinGroup(base, LIB, g, from, at);
        // 並び全体は常に「基本の塊 → 追加項目の塊」
        const groups = next.map(groupOf);
        assert.deepEqual(groups, [...BASIC.map(() => "基本"), ...EXTRA.map(() => "追加項目")], `${g} ${from}→${at}`);
        // 動かした群は moveTo と同じ結果、もう一方の群は1つも動かない
        assert.deepEqual(groupIds(next, LIB, g), moveTo(ids, from, at));
        for (const other of sheetGroups(LIB).filter((x) => x !== g)) {
          assert.deepEqual(groupIds(next, LIB, other), groupIds(base, LIB, other), "他の群が動いた");
        }
      }
    }
  }
});

test("保存値で群が混ざっていても、読むときに必ず群ごとに分かれる（知らない id は捨て、増えた id は群の末尾）", () => {
  const saved = ["shokan", "kenko", "zzz_unknown", "gaiyou", "kibou", 42, "kenko"];
  const got = mergeSheetOrder(saved, LIB);
  assert.deepEqual(got.slice(0, BASIC.length), ["kenko", "gaiyou", ...BASIC.filter((id) => !["kenko", "gaiyou"].includes(id))]);
  assert.deepEqual(got.slice(BASIC.length), ["shokan", "kibou", ...EXTRA.filter((id) => !["shokan", "kibou"].includes(id))]);
  assert.ok(!got.includes("zzz_unknown"));
  assert.equal(new Set(got).size, ALL.length, "重複しない・欠けない");
});

test("用紙に載るのはオンの項目だけで、用紙の並びの順（基本→追加項目）", () => {
  const enabled = Object.fromEntries(ALL.map((id) => [id, ["kadai", "gaiyou", "kinsen", "shokan"].includes(id)]));
  let order = mergeSheetOrder(null, LIB);
  order = moveWithinGroup(order, LIB, "基本", BASIC.indexOf("kadai"), 0); // 課題・変化を先頭へ
  order = moveWithinGroup(order, LIB, "追加項目", EXTRA.indexOf("kinsen"), 0); // 金銭管理を先頭へ
  assert.deepEqual(sheetIds(order, enabled, LIB), ["kadai", "gaiyou", "kinsen", "shokan"]);
});

test("並べ替えても記録側の選択と並びは変わらない／リロード後も並びが残る（P8-d）", () => {
  const m = useFakeStorage();
  const rec = defaultSettings(LIB);
  rec.enabled.kinsen = true;
  rec.order = ["kinsen", ...rec.order.filter((id) => id !== "kinsen")]; // 記録側は独自の並び（群も混ざりうる）
  saveSettings(rec);
  const before = m.get(SETTINGS_KEY);

  const moved = moveWithinGroup(loadSheetOrder(LIB), LIB, "基本", 0, BASIC.length);
  saveSheetOrder(moved);
  assert.equal(m.get(SETTINGS_KEY), before, "用紙を並べ替えたら記録側の保存値が変わった");
  // 読むときは記録の並びとして整える（P8-k: 抜けは定義順の位置へ・締めは最後）。用紙の操作では変わらない
  assert.deepEqual(loadSettings(LIB).order, normalizeOrder(rec.order, LIB), "記録側の並びが動いた");
  // 読み直しても用紙の並びは残っている（端末内に保存）
  assert.deepEqual(loadSheetOrder(LIB), moved);
  assert.deepEqual(JSON.parse(m.get(SHEET_ORDER_KEY)!), moved);
  // 逆向き: 記録側の並びを変えても用紙の並びは動かない
  saveSettings({ ...rec, order: [...rec.order].reverse() });
  assert.deepEqual(loadSheetOrder(LIB), moved, "記録側の並びが用紙に漏れた");
});

test("画面側: 並べ替えは用紙の鍵だけを書き、オン・オフは記録と共有したまま（P8-d）", () => {
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  const move = src.slice(src.indexOf("const moveItem ="), src.indexOf("const cfgRef ="));
  assert.ok(move.includes("saveSheetOrder") && move.includes("moveWithinGroup"), "用紙の並びとして保存する");
  assert.ok(!move.includes("saveSettings") && !move.includes("setSet"), "並べ替えで記録側の設定を書かない");
  // 用紙に載る項目＝記録と共有のオン・オフ × 用紙だけの並び
  assert.ok(src.includes("sheetIds(order, set.enabled, ITEM_LIBRARY)"));
  const toggle = src.slice(src.indexOf("const toggle ="), src.indexOf("const print ="));
  assert.ok(toggle.includes("saveSettings"), "オン・オフは引き続き記録と共有の鍵に書く");
  // 印刷は見本をそのまま複製する（見本と印刷で並びが食い違わない）
  assert.ok(src.includes('document.querySelector(".pv-inner")') && src.includes("cloneNode(true)"));
  // 記録側（確認画面・変換）は用紙の並びを読まない
  for (const f of ["app/components/Review.tsx", "app/page.tsx", "lib/record.ts", "lib/prompt.ts"]) {
    const t = readFileSync(f, "utf8");
    assert.ok(!/SheetOrder|sheetIds|sheet-order/.test(t), `${f} が用紙の並びを参照している`);
  }
});

test("つまみ: マウスは即ドラッグ・タッチは長押し・キーボードは↑↓。スクロールを殺さない（P8-d）", () => {
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  assert.ok(src.includes('className="grip"') && src.includes('aria-label="つまんで並べ替え"'));
  assert.ok(!/className="grip"[^>]*data-tip/.test(src), "説明の吹き出しを足さない（原則4）");
  // タッチはポインタの処理から外し、長押しで掴む
  assert.ok(src.includes('e.pointerType === "touch"'), "タッチはポインタの処理で掴まない");
  assert.ok(/const HOLD_MS = \d+/.test(src) && src.includes("HOLD_SLOP"), "長押しの時間とぶれの許容がある");
  // スクロールを止めるのは掴んだあとだけ（受動的でない touchmove で、掴んでいるときだけ preventDefault）
  assert.ok(src.includes('addEventListener("touchmove", onMove, { passive: false })'));
  const onMove = src.slice(src.indexOf("const onMove ="), src.indexOf("const onEnd ="));
  assert.ok(onMove.indexOf("cancelHold()") < onMove.indexOf("ev.preventDefault()"), "掴む前に動いたら譲る");
  assert.ok(/if \(session\.current\) \{\s*ev\.preventDefault\(\)/.test(onMove), "掴んでいるときだけ止める");
  assert.ok(src.includes('"ArrowUp"') && src.includes('"ArrowDown"'), "キーボードでも並べ替えられる");
  // 自由形式のあいだは動かせない（用紙に出ないため）
  const grip = src.slice(src.indexOf('className="grip"'), src.indexOf("<i aria-hidden />"));
  assert.ok(grip.includes("disabled={free}"));

  const css = readFileSync("app/globals.css", "utf8");
  const gripCss = css.match(/\.cfg \.grip\{[^}]*\}/)?.[0] ?? "";
  assert.ok(gripCss.includes("touch-action:manipulation"), "つまみの上からでも一覧をスクロールできる");
  assert.ok(!gripCss.includes("touch-action:none"), "つまみでスクロールを殺さない");
  // 狭い画面（タブ切り替え）でもつまみは隠さない
  const narrow = css.slice(css.indexOf("@media (max-width:900px){", css.indexOf(".sheet-cfg")));
  assert.ok(!/\.grip\{[^}]*display:none/.test(narrow), "狭い画面でつまみが消える");
});

test("縦の一覧の落とし先: 行の中心より上なら手前・下なら後ろ", () => {
  const rows = [0, 1, 2].map((i) => ({ left: 0, right: 200, top: i * 30, bottom: i * 30 + 30 }));
  assert.equal(dropIndexVertical(rows, -50), 0);
  assert.equal(dropIndexVertical(rows, 14), 0);
  assert.equal(dropIndexVertical(rows, 16), 1);
  assert.equal(dropIndexVertical(rows, 50), 2);
  assert.equal(dropIndexVertical(rows, 76), 3);
  assert.equal(dropIndexVertical(rows, 999), 3);
  assert.equal(dropIndexVertical([], 10), 0);
});

test("辞書の書き出しに用紙の並びを含める（任意・置換。それ以前のファイルも読める）", () => {
  const valid = ALL;
  const withOrder = mergeBackup(
    { app: "memo-okoshi", version: 1, vocab: [], sheetOrder: ["kadai", "zzz", "gaiyou", 3] },
    [],
    valid
  );
  assert.ok(withOrder.ok);
  assert.deepEqual(withOrder.ok && withOrder.sheetOrder, ["kadai", "gaiyou"], "知らない id と型崩れを落とす");
  const old = mergeBackup({ app: "memo-okoshi", version: 1, vocab: [] }, [], valid);
  assert.ok(old.ok && old.sheetOrder === undefined, "並びの無い古いファイルは並びに触れない");

  const backup = readFileSync("lib/backup.ts", "utf8");
  assert.ok(backup.includes("sheetOrder = readSavedSheetOrder()"), "書き出しに入れる");
  assert.ok(backup.includes("saveSheetOrder(r.sheetOrder)"), "読み込みで置き換える");
  assert.ok(!backup.includes('"memo-okoshi:sheet-order"'), "鍵は settings.ts から使う");
});
