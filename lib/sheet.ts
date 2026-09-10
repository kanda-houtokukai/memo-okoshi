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
// [DECISION 2026-09-10] **選んだ項目が8個までは1枚、9個以上は2枚**（P7-g。書く余裕を優先する）。
//   以前は罫線を減らして13項目でも1枚に押し込んでいたが、13項目で罫線4本まで痩せて書けなかった。
//   **枠は途中で分割しない**（現行の方針を維持）。項目は枚数で均等に割る。
// [DECISION 2026-09-10] **「その他」の枠を常に最後に置く**（P7-g）。想定外の話が出たときの受け皿で、
//   枠外に書き込まれて読み取りが乱れるのを防ぐ。**用紙だけの欄で、記録の項目ライブラリには足さない**
//   （記録側には「こぼれ枠」という同じ役割の受け皿が既にある）。紙の「その他」に書かれた内容は、
//   AIが読み取って適切な項目かこぼれ枠へ振り分ける（`lib/prompt.ts` は選んだ id しか渡さない）。
//   **枚数の判定には数えない**（利用者が選んだ数と画面の「N項目」が食い違わないため）。
//   場所は取るので、**他の枠より低い横いっぱいの枠**（罫線3本ぶん）にして、項目の枠を痩せさせない。
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
  /** 「その他」の枠の罫線の本数（他の枠より低くする） */
  otherLines: 3,
  /** 選んだ項目がこの数までなら1枚（超えたら2枚） */
  onePageMax: 8,
} as const;

/** 用紙にいつも入る「その他」の枠。**記録の項目ライブラリには入れない**（用紙だけの欄） */
export const OTHER_BOX = { id: "__other", label: "その他" } as const;

export type SheetLayout = {
  /** 用紙の枚数 */
  pages: number;
  /** 1つの枠に引く罫線の本数（どの枚でも同じ） */
  lines: number;
  /** 各ページに載せる項目の数（「その他」は含まない） */
  perPage: number[];
};

/** 「その他」の枠が取る高さ（見出し＋余白＋罫線3本） */
const otherH = SHEET.boxHead + SHEET.boxPad + SHEET.otherLines * SHEET.line;

/** 1ページに count 個の枠を置いたときに引ける罫線の本数（hasOther ならその高さを先に引く） */
function linesOn(count: number, hasOther: boolean): number {
  if (count === 0) return SHEET.maxLines;
  const rows = Math.ceil(count / SHEET.cols);
  let usable = SHEET.pageH - SHEET.margin * 2 - SHEET.headH;
  if (hasOther) usable -= otherH + SHEET.gap;
  const boxH = (usable - SHEET.gap * (rows - 1)) / rows;
  return Math.floor((boxH - SHEET.boxHead - SHEET.boxPad) / SHEET.line);
}

/**
 * 項目の数から割り付けを決める。
 * 枚数は **8個までなら1枚・9個以上は2枚**（`SHEET.onePageMax`）。項目は枚数で均等に割る。
 * 罫線は**どの枠も同じ本数**にしたいので、いちばん詰まるページに合わせて決める
 * （「その他」が載る最後のページは、その枠のぶん狭い）。
 */
export function sheetLayout(n: number): SheetLayout {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return { pages: 1, lines: SHEET.maxLines, perPage: [0] };

  const pages = count <= SHEET.onePageMax ? 1 : 2;
  const perPage: number[] = [];
  let left = count;
  for (let i = 0; i < pages; i++) {
    const take = Math.ceil(left / (pages - i));
    perPage.push(take);
    left -= take;
  }
  // 「その他」は最後のページに載る
  const lines = Math.min(
    ...perPage.map((c, i) => linesOn(c, i === perPage.length - 1))
  );
  return {
    pages,
    lines: Math.max(SHEET.minLines, Math.min(SHEET.maxLines, lines)),
    perPage,
  };
}

/** 項目を1枚ぶんずつに切り分ける（`sheetLayout` が決めた各ページの数に従う） */
export function paginate<T>(items: T[], perPage: number[]): T[][] {
  const out: T[][] = [];
  let i = 0;
  for (const n of perPage) {
    out.push(items.slice(i, i + n));
    i += n;
  }
  return out.length ? out : [[]];
}

/** 保存するPDFの名前（日付ベース） */
export function sheetFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `面談用紙_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
