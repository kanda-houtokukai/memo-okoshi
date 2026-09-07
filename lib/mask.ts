// 黒塗り（マスク）のストロークモデル。
// 状態遷移は純関数（Node の test から直接読める）。描画だけが Canvas に依存する。
//
// 原則5「サーバーに保存しない／マスク前の画像を端末外に出さない」の要:
//   マスクは座標情報として送るのではなく、送信前に画像へ焼き込む（lib/pages.ts の exportMasked）。
// 「一度塗ったものを取り消せない状態にしない」の要:
//   undo 用の履歴を必ず積む。全消去も履歴に積むので取り消せる。

export type Point = { x: number; y: number }; // 画像ピクセル座標

export type Stroke = {
  points: Point[];
  width: number; // 画像ピクセル
  erase: boolean; // 消しゴム（塗りを取り除く）
};

export type MaskState = {
  strokes: Stroke[];
  history: Stroke[][]; // undo 用: 直前までの strokes のスナップショット
};

export const EMPTY_MASK: MaskState = { strokes: [], history: [] };

export function addStroke(m: MaskState, s: Stroke): MaskState {
  if (s.points.length === 0) return m;
  return { strokes: [...m.strokes, s], history: [...m.history, m.strokes] };
}

export function undo(m: MaskState): MaskState {
  if (m.history.length === 0) return m;
  const history = m.history.slice(0, -1);
  return { strokes: m.history[m.history.length - 1], history };
}

export function clearAll(m: MaskState): MaskState {
  if (m.strokes.length === 0) return m;
  return { strokes: [], history: [...m.history, m.strokes] };
}

export function canUndo(m: MaskState): boolean {
  return m.history.length > 0;
}

/** 塗りが1つでも残っているか（消しゴムだけの状態は「塗りなし」扱い） */
export function hasPaint(m: MaskState): boolean {
  return m.strokes.some((s) => !s.erase);
}

/**
 * ストロークを Canvas に描く。scale = 表示px / 画像px（書き出し時は 1）。
 * 消しゴムは destination-out で「塗りを抜く」ので、マスクは画像とは別レイヤーに描くこと。
 */
export function renderStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  for (const s of strokes) drawStroke(ctx, s, scale);
  ctx.restore();
}

export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, scale: number): void {
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.lineWidth = s.width * scale;
  const p0 = s.points[0];
  if (s.points.length === 1) {
    ctx.beginPath();
    ctx.arc(p0.x * scale, p0.y * scale, (s.width * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p0.x * scale, p0.y * scale);
  for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * scale, s.points[i].y * scale);
  ctx.stroke();
}

/** 描画途中の1区間だけを足す（ポインタ移動ごとの差分描画用） */
export function drawSegment(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  width: number,
  erase: boolean,
  scale: number
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000";
  ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  ctx.lineWidth = width * scale;
  ctx.beginPath();
  ctx.moveTo(from.x * scale, from.y * scale);
  ctx.lineTo(to.x * scale, to.y * scale);
  ctx.stroke();
  ctx.restore();
}
