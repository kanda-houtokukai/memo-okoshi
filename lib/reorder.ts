// 並べ替えの純関数（取り込み画面のページ順）。
//
// なぜ純関数に切り出すか: 複数ページは**渡された順に**AIが読み、1件の記録として統合する。
// つまり並び順は読み取り内容の正しさに直接効くので、機械テストできる形にしておく。
//
// [DECISION 2026-09-09] 並べ替えはドラッグを主・←→ を副とし、**どちらも同じ結果になる**ことを
//   テストで保証する（moveBy は moveTo の隣接特殊形として書く）。

/** 落とし先の判定に使う矩形（DOMRect の必要な分だけ） */
export type Rect = { left: number; top: number; right: number; bottom: number };

/**
 * from の要素を「insertAt の手前」に入れ直した新しい配列を返す。
 * insertAt は 0..list.length（末尾に置くときは list.length）。
 */
export function moveTo<T>(list: readonly T[], from: number, insertAt: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const out = [...list];
  const [item] = out.splice(from, 1);
  // from を抜いた分、後ろへ入れるときは 1 つ詰まる
  const to = Math.max(0, Math.min(out.length, insertAt > from ? insertAt - 1 : insertAt));
  out.splice(to, 0, item);
  return out;
}

/** ←→ ボタン。隣と入れ替える（＝隣の位置へ移す。moveTo と同じ結果になる） */
export function moveBy<T>(list: readonly T[], from: number, dir: -1 | 1): T[] {
  const j = from + dir;
  if (from < 0 || from >= list.length || j < 0 || j >= list.length) return [...list];
  return moveTo(list, from, dir === 1 ? j + 1 : j);
}

/**
 * ポインタ位置から「何番目の手前に落とすか」を返す（0..rects.length）。
 * 紙は横に並び、幅が足りなければ折り返す。まず同じ段（y が上下に入る段）を探し、
 * その段の中で「中心より左なら手前・右なら後ろ」で決める。段が見つからなければ
 * 一番近い段で同じ判定をする（画面の上下端に外れたときも詰まらないように）。
 */
export function dropIndex(rects: readonly Rect[], x: number, y: number): number {
  if (rects.length === 0) return 0;
  const inRow = rects.map((r, i) => ({ r, i })).filter((o) => y >= o.r.top && y <= o.r.bottom);
  const row = inRow.length ? inRow : nearestRow(rects, y);
  for (const o of row) {
    if (x < (o.r.left + o.r.right) / 2) return o.i;
  }
  return row[row.length - 1].i + 1;
}

function nearestRow(rects: readonly Rect[], y: number): { r: Rect; i: number }[] {
  let best = Infinity;
  let bestTop = 0;
  rects.forEach((r) => {
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (d < best) {
      best = d;
      bestTop = r.top;
    }
  });
  return rects.map((r, i) => ({ r, i })).filter((o) => o.r.top === bestTop);
}

/**
 * 縦に1列で並ぶ行（面談用紙の項目の一覧）で「何番目の手前に落とすか」を返す（0..rects.length）。
 * 行の中心より上なら手前・下なら後ろ。横位置は見ない（1列なので）。
 * `dropIndex` は紙が横に並ぶ取り込み画面用で、段の中を左右で判定するため縦の一覧には使えない。
 */
export function dropIndexVertical(rects: readonly Rect[], y: number): number {
  let k = 0;
  for (const r of rects) if (y > (r.top + r.bottom) / 2) k++;
  return k;
}
