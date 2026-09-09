// 黒塗りのストロークモデル（lib/mask.ts）のテスト
// 「一度塗ったものを取り消せない状態にしない」を機械的に保証する。

import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_MASK, addStroke, canUndo, clearAll, hasPaint, rectOf, undo, type Stroke } from "../lib/mask.ts";

const pen = (n: number): Stroke => ({ points: [{ x: n, y: n }, { x: n + 10, y: n + 10 }], width: 20, erase: false });
const eraser = (n: number): Stroke => ({ ...pen(n), erase: true });

test("塗ると strokes に積まれ、undo で直前の状態に戻る", () => {
  let m = addStroke(EMPTY_MASK, pen(1));
  m = addStroke(m, pen(2));
  assert.equal(m.strokes.length, 2);
  assert.equal(canUndo(m), true);
  m = undo(m);
  assert.equal(m.strokes.length, 1);
  m = undo(m);
  assert.equal(m.strokes.length, 0);
  assert.equal(canUndo(m), false);
  assert.equal(undo(m), m, "履歴が空なら何もしない");
});

test("全て消すも undo で戻せる（取り消せない状態にしない）", () => {
  let m = addStroke(addStroke(EMPTY_MASK, pen(1)), pen(2));
  m = clearAll(m);
  assert.equal(m.strokes.length, 0);
  assert.equal(hasPaint(m), false);
  m = undo(m);
  assert.equal(m.strokes.length, 2, "全消去の直前の塗りが戻っていない");
  assert.equal(hasPaint(m), true);
});

test("消しゴムも1ストロークとして積まれ、undo で消しゴム前に戻る", () => {
  let m = addStroke(EMPTY_MASK, pen(1));
  m = addStroke(m, eraser(1));
  assert.equal(m.strokes.length, 2);
  m = undo(m);
  assert.equal(m.strokes.length, 1);
  assert.equal(m.strokes[0].erase, false);
});

test("消しゴムだけの状態は「塗りなし」扱い", () => {
  const m = addStroke(EMPTY_MASK, eraser(1));
  assert.equal(hasPaint(m), false);
});

test("空のストロークは積まない・空の状態で全消去しても履歴を汚さない", () => {
  const m = addStroke(EMPTY_MASK, { points: [], width: 10, erase: false });
  assert.equal(m, EMPTY_MASK);
  assert.equal(clearAll(EMPTY_MASK), EMPTY_MASK);
});

test("状態は不変（元のオブジェクトを書き換えない）", () => {
  const a = addStroke(EMPTY_MASK, pen(1));
  const b = addStroke(a, pen(2));
  assert.equal(a.strokes.length, 1);
  assert.equal(b.strokes.length, 2);
  assert.notEqual(a.strokes, b.strokes);
});

test("四角: 1ストロークとして積み、戻すで1手で消える", () => {
  const r: Stroke = { points: [{ x: 10, y: 20 }, { x: 110, y: 220 }], width: 0, erase: false, shape: "rect" };
  const m = addStroke(EMPTY_MASK, r);
  assert.equal(m.strokes.length, 1);
  assert.equal(m.strokes[0].shape, "rect");
  assert.equal(hasPaint(m), true, "四角も塗り（未塗りページ警告の対象外）");
  assert.deepEqual(undo(m), EMPTY_MASK, "戻すで1手で消える");
});

test("四角: 対角どちらの向きに引いても同じ範囲になる", () => {
  const a = { x: 10, y: 20 };
  const b = { x: 110, y: 220 };
  const want = { x: 10, y: 20, w: 100, h: 200 };
  assert.deepEqual(rectOf({ points: [a, b] }), want);
  assert.deepEqual(rectOf({ points: [b, a] }), want, "右下→左上でも同じ");
  assert.deepEqual(rectOf({ points: [{ x: b.x, y: a.y }, { x: a.x, y: b.y }] }), want, "右上→左下でも同じ");
  assert.equal(rectOf({ points: [a] }), null, "点が足りなければ null");
});

test("四角と線が混ざっても、戻すは1手ずつ戻る", () => {
  let m = addStroke(EMPTY_MASK, { points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], width: 8, erase: false });
  m = addStroke(m, { points: [{ x: 10, y: 10 }, { x: 60, y: 60 }], width: 0, erase: false, shape: "rect" });
  m = addStroke(m, { points: [{ x: 20, y: 20 }], width: 8, erase: true });
  assert.equal(m.strokes.length, 3);
  m = undo(m);
  assert.deepEqual(m.strokes.map((s) => s.shape ?? "line"), ["line", "rect"]);
  m = undo(m);
  assert.deepEqual(m.strokes.map((s) => s.shape ?? "line"), ["line"]);
  assert.equal(hasPaint(undo(m)), false);
});
