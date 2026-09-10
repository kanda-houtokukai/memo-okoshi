// 面談用紙（印刷）の割り付け。純関数だけを置く（画面も印刷もここの数値に従う）。
//
// [DECISION 2026-09-10] 用紙は **A4縦・2列・余白は狭め（9mm）**。項目ごとに枠を作り、中に薄い罫線を引く。
//   枠の見出しの左に項目色の帯を置き、アプリ内の項目カードと呼応させる（同じ色＝同じ項目）。
// [DECISION 2026-09-10] **日時は数字だけを書くマスにする**（年・月・日・時・分）。
//   自由記述だと「9/10」「9月10日」「R8.9.10」と揺れて読み取りが不安定になる。
//   時刻は**開始と終了の両方**を置く（面談記録では「14:00〜15:00」の範囲を書くのが通常）。
//   年は和暦・西暦のどちらでも書けるよう、印字は「年」だけにして数字を強制しない。
// [DECISION 2026-09-10] **参加者は1本の長い下線**（行いっぱい）。
//   はじめ3人ぶんの欄を横に並べたが、**欄の数がそのまま「3人まで」という制約になる**。
//   1本にしておけば、書ける範囲で何人でも書ける。柔軟性を優先する。
//   幅は行を丸ごと使うので、場所の欄（82mm）の倍以上ある。
// [DECISION 2026-09-10] **収まらないときは罫線の本数を減らして1枚に収める**（枠は必ず全部載せる）。
//   面談中に使う紙なので、**項目が抜けるより行が短いほうがまし**。
//   罫線が下限（3本）を割るときだけ2枚目に送る。枠は途中で分割しない。
//   いまの項目ライブラリ（13項目）は**全部オンでも1枚に収まる**（`sheetLayout(13).pages === 1`）。
// [DECISION 2026-09-10] 用紙に**氏名をイニシャルにする注記は入れない**。面談中は正確な内容が必要で、
//   伏せるのは撮影後の工程（原則5はそこで守る）。紙そのものの扱いは各事業所の規程に従う。

/** 用紙の寸法（mm）。印刷CSSと `sheetLayout` はこの値を共有する */
export const SHEET = {
  pageH: 297,
  margin: 9,
  /**
   * 見出し（面談記録メモ）＋記入欄（日時・場所・参加者）の高さ。
   * [DECISION 2026-09-10] 記入欄は**手で書ける高さ**を確保する（下線1本では狭くて書けなかった）。
   *   題1行（約7mm）＋日時と場所の行（9mm）＋参加者の行（10mm）＋区切りと余白（約3mm）。
   */
  headH: 29,
  /** 枠のあいだの隙間 */
  gap: 2.4,
  /** 枠の見出し帯の高さ */
  boxHead: 6.2,
  /** 枠の内側の余白（上下あわせて） */
  boxPad: 3.4,
  /** 罫線1本ぶんの高さ */
  line: 5.6,
  minLines: 3,
  maxLines: 14,
  cols: 2,
} as const;

export type SheetLayout = {
  /** 用紙の枚数 */
  pages: number;
  /** 1枚あたりの枠の段数 */
  rows: number;
  /** 1つの枠に引く罫線の本数 */
  lines: number;
  /** 1枚に載せる枠の数 */
  perPage: number;
};

/** 枠1つに使える高さ（mm）から、引ける罫線の本数を出す */
function linesFor(boxH: number): number {
  const usable = boxH - SHEET.boxHead - SHEET.boxPad;
  return Math.floor(usable / SHEET.line);
}

/**
 * 項目の数から割り付けを決める。
 * 段数は `ceil(n / 2)`。1枚に使える高さを段数で割り、その高さに入る本数だけ罫線を引く。
 * 下限（3本）を割るときは、下限を満たす段数まで戻して2枚目へ送る。
 */
export function sheetLayout(n: number): SheetLayout {
  const count = Math.max(0, Math.floor(n));
  const usableH = SHEET.pageH - SHEET.margin * 2 - SHEET.headH;
  /** 段数 r のときの枠の高さ */
  const boxH = (r: number) => (usableH - SHEET.gap * (r - 1)) / r;
  /** 罫線が下限を満たす最大の段数 */
  let maxRows = 1;
  while (linesFor(boxH(maxRows + 1)) >= SHEET.minLines) maxRows++;

  if (count === 0) return { pages: 1, rows: 1, lines: SHEET.maxLines, perPage: 0 };

  const rows = Math.ceil(count / SHEET.cols);
  if (rows <= maxRows) {
    return {
      pages: 1,
      rows,
      lines: Math.min(SHEET.maxLines, linesFor(boxH(rows))),
      perPage: count,
    };
  }
  // 1枚に収まらない: 下限を満たす段数で切って次の枚へ送る（枠は分割しない）
  const perPage = maxRows * SHEET.cols;
  return {
    pages: Math.ceil(count / perPage),
    rows: maxRows,
    lines: Math.max(SHEET.minLines, linesFor(boxH(maxRows))),
    perPage,
  };
}

/** 項目を1枚ぶんずつに切り分ける */
export function paginate<T>(items: T[], perPage: number): T[][] {
  if (perPage <= 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) out.push(items.slice(i, i + perPage));
  return out.length ? out : [[]];
}

/** 保存するPDFの名前（日付ベース） */
export function sheetFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `面談用紙_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
