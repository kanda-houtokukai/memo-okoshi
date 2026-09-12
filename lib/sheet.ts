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
// [DECISION 2026-09-11] **2列組の最後の行に枠が1つしか入らないときは、横いっぱいに広げる**（P8-c）。
//   1項目だと左半分だけに枠ができて右が丸ごと空き、3・5・7項目でも最後の行の片側が空いていた。
//   行の高さは変わらないので、**罫線の本数も間隔も変わらない**（横に広がるだけ）。
//   2枚のときは**ページごとに**判定する（1ページ目は必ず偶数なので、効くのは最後のページ）。
// [DECISION 2026-09-11] **罫線の間隔は固定（6mm）**（P8-b）。書く字の大きさは項目数と関係ないので、
//   行間が項目数で変わるのはおかしい。枠の高さに**入るだけ**引く（項目が少なければ行数が増える）。
//   6mm は日本のノートの **B罫と同じ**で、大人が普段書いている間隔。
//   それまでは本数を先に決めて引き伸ばしていたため、実測で **2項目=15.1mm / 6項目=5.7mm** と3倍近く開いていた。
// [DECISION 2026-09-11] **自由形式の用紙**（P8-b）。上の記入欄はそのままで、下は**枠なしの罫線だけ**。
//   「その他」は出さず、**1枚固定**（複数欲しいときは印刷の部数で足りる）。
//   枠に収まらない人と、項目にとらわれず書きたい人のための逃げ道。
//   本数は実際に書ける高さに入るだけ（P8-f・`freeSheetLines`）。
// [DECISION 2026-09-10] **選んだ項目が8個までは1枚、9個以上は2枚**（P7-g。書く余裕を優先する）。
//   以前は罫線を減らして13項目でも1枚に押し込んでいたが、13項目で罫線4本まで痩せて書けなかった。
//   **枠は途中で分割しない**（現行の方針を維持）。
// [DECISION 2026-09-10] 2枚になるとき、**1ページ目は偶数個にする**（P7-h）。
//   用紙は2列組なので、奇数だと**最後の行が片側だけ埋まって1項目ぶんの空白**ができる。
//   均等割り（`ceil(n/2)`）を**偶数へ切り上げ**、1ページの上限（8個）と「2ページ目を空にしない」で頭打ちにする。
//   2ページ目が奇数になるのは許容する（最後のページで、横いっぱいの「その他」が下に来るので収まりが悪くない）。
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
  /** 罫線の間隔（mm）。**固定値**。B罫と同じで、大人が普段書いている間隔 */
  line: 6,
  minLines: 3,
  cols: 2,
  /** 「その他」の枠の罫線の本数（他の枠より低くする） */
  otherLines: 3,
  /** 選んだ項目がこの数までなら1枚（超えたら2枚） */
  onePageMax: 8,
} as const;

/** 用紙にいつも入る「その他」の枠。**記録の項目ライブラリには入れない**（用紙だけの欄） */
export const OTHER_BOX = { id: "__other", label: "その他", freeLabel: "自由形式" } as const;

export type SheetLayout = {
  /** 用紙の枚数 */
  pages: number;
  /** 各ページに載せる項目の数（「その他」は含まない） */
  perPage: number[];
  /** 各ページの枠に引く罫線の本数（枠の高さに入るだけ引く） */
  linesPerPage: number[];
  /** 罫線の間隔（mm・どの用紙でも同じ） */
  pitch: number;
};

/** 「その他」の枠が取る高さ（見出し＋余白＋罫線3本） */
const otherH = SHEET.boxHead + SHEET.boxPad + SHEET.otherLines * SHEET.line;

/** 記入欄より下に使える高さ（mm） */
function usableH(): number {
  return SHEET.pageH - SHEET.margin * 2 - SHEET.headH;
}

/** 1ページに count 個の枠を置いたときの、枠1つの高さ（mm）。hasOther ならその高さを先に引く */
export function boxHeight(count: number, hasOther: boolean): number {
  const rows = Math.ceil(count / SHEET.cols);
  const usable = usableH() - (hasOther ? otherH + SHEET.gap : 0);
  return (usable - SHEET.gap * (rows - 1)) / rows;
}

/** その高さの枠に**入るだけ**罫線を引く（間隔は固定なので、枠が高いほど本数が増える） */
function linesOn(count: number, hasOther: boolean): number {
  if (count === 0) return 0;
  const inner = boxHeight(count, hasOther) - SHEET.boxHead - SHEET.boxPad;
  return Math.max(0, Math.floor(inner / SHEET.line));
}

/**
 * そのページの**最後の枠を横いっぱいに広げるか**。2列組の最後の行に1つしか入らないとき＝奇数個。
 * 行の高さは変わらないので、罫線の本数にも間隔にも影響しない。
 */
export function wideLast(countOnPage: number): boolean {
  return countOnPage % SHEET.cols === 1;
}

/**
 * 自由形式の罫線の欄（P8-f）。**印刷を実測した寸法**から、罫線を引ける高さを出す。
 *
 * [DECISION 2026-09-12] 自由形式の本数は**実際に書ける高さに入るだけ**引く（間隔 6mm は固定のまま。枠ありと同じ考え方）。
 *   以前は見出しを 29mm と見積もった高さ（250mm・`usableH`）で 41本（246mm）を引いていたが、実際に書ける高さは
 *   約 240mm で、最後の線が下の行（メモおこし）に重なり、印字できる範囲も 0.24mm 越えていた。
 *   見出し・記入欄は下の余白を含めて 32.8mm、下の行は上の余白を含めて 5.84mm（どちらも印刷の実測）、
 *   罫線の欄の上の余白 0.5mm を引く。→ 39本（234mm）。下の行との間に 5.9mm の余裕が残る。
 * ⚠️ 枠ありの割り付け（`usableH`・`sheetLayout`）には使わない。使うと枠ありの本数が変わる。
 * ⚠️ 印刷の見出し・記入欄・下の行の CSS を変えたら、ここを測り直す。
 */
export const FREE_AREA = { head: 32.8, foot: 5.84, pad: 0.5 } as const;

/** 自由形式の罫線の欄の高さ（mm） */
export function freeAreaH(): number {
  return SHEET.pageH - SHEET.margin * 2 - FREE_AREA.head - FREE_AREA.foot - FREE_AREA.pad;
}

/** 自由形式（枠なし・罫線だけ）の用紙に引く本数。書ける高さに同じ間隔で入るだけ引く */
export function freeSheetLines(): number {
  return Math.floor(freeAreaH() / SHEET.line);
}

/**
 * 項目の数から割り付けを決める。
 * 枚数は **8個までなら1枚・9個以上は2枚**（`SHEET.onePageMax`）。項目は枚数で均等に割る。
 * 罫線は**どの枠も同じ本数**にしたいので、いちばん詰まるページに合わせて決める
 * （「その他」が載る最後のページは、その枠のぶん狭い）。
 */
export function sheetLayout(n: number): SheetLayout {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return { pages: 1, perPage: [0], linesPerPage: [0], pitch: SHEET.line };

  const pages = count <= SHEET.onePageMax ? 1 : 2;
  let perPage: number[];
  if (pages === 1) {
    perPage = [count];
  } else {
    // 均等割りを偶数へ切り上げ（2列組なので偶数なら行が埋まる）→ 上限と「2ページ目を空にしない」で抑える
    const half = Math.ceil(count / 2);
    let first = half % 2 === 0 ? half : half + 1;
    first = Math.min(first, SHEET.onePageMax, count - 1);
    if (first % 2 !== 0) first -= 1; // 頭打ちで奇数になったら1つ戻す
    perPage = [first, count - first];
  }
  // 罫線は**ページごとに**入るだけ引く（間隔は固定なので、枠が高いページほど行数が多くなる）
  const linesPerPage = perPage.map((c, i) => linesOn(c, i === perPage.length - 1));
  return { pages, perPage, linesPerPage, pitch: SHEET.line };
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

/**
 * 画面の見本の大きさ（P8-e）。見本は基準の幅 `baseW` で作った A4 の縮尺模型で、**それを丸ごと拡大・縮小する**
 * （中の文字・マス・罫線どうしの比率は一切変えない＝印刷との見え方の関係を崩さない）。
 * `baseW` は globals.css の `.paper{--pw:390px}` と同じ値にしておく（`tests/preview.test.mts` が見張る）。
 *
 * [DECISION 2026-09-12] **表示領域に収まる最大の倍率**にする。幅と高さの両方を見て、はみ出さない側で決める。
 *   固定値ではなく、表示領域の寸法から毎回計算する（画面の大きさ・向きが変われば倍率も変わる）。
 * [DECISION 2026-09-12] **2枚のとき**: 2枚を横に並べても、縦に重ねた場合と同じか大きくできるなら**横並び**
 *   （2枚とも一度に見える）。そうでなければ**縦に重ね、2枚目の頭が少し覗く大きさ**にする（スクロールで見る）。
 *   2枚目のために1枚あたりを常に小さくすると、見出しや罫線が読めないという元の問題に戻るため。
 *   覗かせるのは、下にもう1枚あることを説明文なしで伝えるため。
 */
export const PREVIEW = {
  baseW: 390,
  /** 2枚を縦に重ねるとき、2枚目の頭を覗かせる高さ（px・ページのあいだの隙間は別） */
  peek: 36,
} as const;

export type PreviewFit = { k: number; side: boolean };

/**
 * 表示領域（余白を除いた幅 w・高さ h・ページのあいだの隙間 gap）に収まる最大の倍率 k を返す。
 * side は2枚を横に並べるか。k は小数3桁で切り捨てる（丸めで1pxはみ出してスクロールが出ないように）。
 */
export function previewFit(w: number, h: number, pages: number, gap: number): PreviewFit {
  if (!(w > 0 && h > 0)) return { k: 1, side: false };
  const baseH = (PREVIEW.baseW * 297) / 210;
  const down = (k: number) => Math.max(0.1, Math.floor(k * 1000) / 1000);
  const one = Math.min(w / PREVIEW.baseW, h / baseH);
  if (pages < 2) return { k: down(one), side: false };
  const side = Math.min((w - gap) / (2 * PREVIEW.baseW), h / baseH);
  const stack = Math.min(w / PREVIEW.baseW, (h - gap - PREVIEW.peek) / baseH);
  return side >= stack ? { k: down(side), side: true } : { k: down(stack), side: false };
}
