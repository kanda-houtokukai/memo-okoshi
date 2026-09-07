// 黒塗りのストロークモデル（lib/mask.ts）のテスト
// 「一度塗ったものを取り消せない状態にしない」を機械的に保証する。

import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_MASK, addStroke, canUndo, clearAll, hasPaint, undo, type Stroke } from "../lib/mask.ts";

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
