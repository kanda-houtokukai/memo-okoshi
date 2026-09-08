// 拡大・移動の座標計算（純関数）。黒塗り画面と確認画面の元メモペインで共用。
// 表示は「元解像度の画像/マスクを倍率で見せるだけ」なので、何倍にしても画質は落ちない。

export type Transform = { scale: number; tx: number; ty: number };

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 8;
export const FIT_PAD = 14; // 画面に収める時の余白（実機で調整が必要な値）

/** 画面に収まる最大（縦長・横長どちらも） */
export function fitTransform(stageW: number, stageH: number, w: number, h: number, pad = FIT_PAD): Transform {
  const availW = Math.max(1, stageW - pad * 2);
  const availH = Math.max(1, stageH - pad * 2);
  const scale = Math.min(availW / w, availH / h);
  return { scale, tx: (stageW - w * scale) / 2, ty: (stageH - h * scale) / 2 };
}

/** 画面上の点 (cx,cy) を中心に倍率を掛ける */
export function zoomAt(t: Transform, factor: number, cx: number, cy: number): Transform {
  const scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, t.scale * factor));
  const k = scale / t.scale;
  return { scale, tx: cx - (cx - t.tx) * k, ty: cy - (cy - t.ty) * k };
}

export function panBy(t: Transform, dx: number, dy: number): Transform {
  return { ...t, tx: t.tx + dx, ty: t.ty + dy };
}

/** 画面座標 → 画像ピクセル座標 */
export function toImage(t: Transform, x: number, y: number): { x: number; y: number } {
  return { x: (x - t.tx) / t.scale, y: (y - t.ty) / t.scale };
}
