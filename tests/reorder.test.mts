// 並べ替え（lib/reorder.ts）のテスト。
// 複数ページは渡された順にAIが読み1件の記録へ統合するので、並び順は読み取り内容の正しさに直結する。
// ドラッグ（moveTo）と ←→（moveBy）が**同じ結果**になることをここで保証する。

import { test } from "node:test";
import assert from "node:assert/strict";
import { dropIndex, moveBy, moveTo, type Rect } from "../lib/reorder.ts";

const L = ["a", "b", "c", "d"];

test("moveTo: 手前へ・後ろへ・端・動かない位置", () => {
  assert.deepEqual(moveTo(L, 2, 0), ["c", "a", "b", "d"]); // c を先頭へ
  assert.deepEqual(moveTo(L, 0, 4), ["b", "c", "d", "a"]); // a を末尾へ
  assert.deepEqual(moveTo(L, 1, 3), ["a", "c", "b", "d"]); // b を c の後ろへ
  assert.deepEqual(moveTo(L, 1, 1), L); // 自分の手前＝動かない
  assert.deepEqual(moveTo(L, 1, 2), L); // 自分の後ろ＝動かない
  assert.deepEqual(moveTo(L, 9, 0), L); // 範囲外は何もしない
  assert.notEqual(moveTo(L, 1, 1), L, "元の配列は変更しない（新しい配列を返す）");
});

test("moveBy（←→）は moveTo の隣接特殊形と一致する", () => {
  for (let i = 0; i < L.length; i++) {
    assert.deepEqual(moveBy(L, i, -1), i === 0 ? L : moveTo(L, i, i - 1), `${i} を←`);
    assert.deepEqual(moveBy(L, i, 1), i === L.length - 1 ? L : moveTo(L, i, i + 2), `${i} を→`);
  }
  // 端では何も起きない
  assert.deepEqual(moveBy(L, 0, -1), L);
  assert.deepEqual(moveBy(L, 3, 1), L);
});

/** 190px の紙が 3枚ずつ 2段に並んでいる想定 */
const rects: Rect[] = [
  { left: 30, top: 40, right: 220, bottom: 328 },
  { left: 250, top: 40, right: 440, bottom: 328 },
  { left: 470, top: 40, right: 660, bottom: 328 },
  { left: 30, top: 354, right: 220, bottom: 642 },
  { left: 250, top: 354, right: 440, bottom: 642 },
];

test("dropIndex: 同じ段の中は中心の左右で決まる", () => {
  assert.equal(dropIndex(rects, 60, 180), 0); // 1枚目の左半分 → 手前
  assert.equal(dropIndex(rects, 200, 180), 1); // 1枚目の右半分 → 1枚目の後ろ
  assert.equal(dropIndex(rects, 300, 180), 1); // 2枚目の左半分
  assert.equal(dropIndex(rects, 700, 180), 3); // 段の右端より外 → 段の末尾
});

test("dropIndex: 段をまたいでも段の中で決まる／上下に外れたら一番近い段", () => {
  assert.equal(dropIndex(rects, 60, 500), 3); // 2段目の1枚目の左
  assert.equal(dropIndex(rects, 300, 500), 4); // 2段目の2枚目の左
  assert.equal(dropIndex(rects, 600, 500), 5); // 2段目の末尾
  assert.equal(dropIndex(rects, 60, 0), 0); // 紙より上 → 1段目で判定
  assert.equal(dropIndex(rects, 600, 900), 5); // 紙より下 → 2段目で判定
  assert.equal(dropIndex([], 10, 10), 0); // 紙が無ければ 0
});

test("掴んだ紙を除いて測り、元の並びの挿入位置に直す（Intake と同じ計算）", () => {
  // 3枚（a,b,c）で b を掴み、a の左に落とす
  const from = 1;
  const others = rects.slice(0, 3).filter((_, i) => i !== from);
  const k = dropIndex(others, 60, 180);
  const insertAt = k < from ? k : k + 1;
  assert.equal(insertAt, 0);
  assert.deepEqual(moveTo(["a", "b", "c"], from, insertAt), ["b", "a", "c"]);
  // 同じ3枚で b を c の右に落とす（除いた並びでは 2番目の後ろ＝k=2 → 3）
  const k2 = dropIndex(others, 700, 180);
  assert.deepEqual(moveTo(["a", "b", "c"], from, k2 < from ? k2 : k2 + 1), ["a", "c", "b"]);
});
