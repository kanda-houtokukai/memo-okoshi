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
//   枠の高さは印刷の実測から出す（P8-g・`PRINT`）。
//   6mm は日本のノートの **B罫と同じ**で、大人が普段書いている間隔。
//   それまでは本数を先に決めて引き伸ばしていたため、実測で **2項目=15.1mm / 6項目=5.7mm** と3倍近く開いていた。
// [DECISION 2026-09-11] **自由形式の用紙**（P8-b）。上の記入欄はそのままで、下は**枠なしの罫線だけ**。
//   「その他」は出さず、**1枚固定**（複数欲しいときは印刷の部数で足りる）。
//   枠に収まらない人と、項目にとらわれず書きたい人のための逃げ道。
//   本数は実際に書ける高さに入るだけ（P8-f・`freeSheetLines`。高さは `PRINT`）。
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
  /** 枠のあいだの隙間（「その他」の上の余白も同じ） */
  gap: 2.4,
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

/**
 * 印刷を実測した寸法（mm）。割り付けは**枠ありも自由形式もこの値で**決める（P8-f・P8-g）。
 *
 * [DECISION 2026-09-12] 罫線の本数は**印刷の実際の高さに入るだけ**引く（間隔 6mm は固定）。
 *   以前は見出し・記入欄を 29mm と見積もり、下の行（メモおこし）を数えない高さ（250mm）で割り付けていた。
 *   実際に罫線を引ける高さはそれより 6〜10mm 低く、自由形式は最後の線が下の行に重なり（P8-f で直した）、
 *   枠ありは最後の罫線が枠の外に出て印刷されない回があった（1〜2項目で下の約2本・9〜12項目の1枚目で1本）。
 * [DECISION 2026-09-12] **最後の罫線は枠の下の余白に入れない**（`boxBottom`＝下の余白 1.2＋枠線 0.25）。
 *   枠の縁ぎりぎり（3〜4項目で 0.03mm・5〜6項目で 0.48mm）になっていたのを、ここで無くす。
 * 実測は画面で 2倍の細かさで測った値で、細い線（0.25mm）が実際より薄く描かれるぶん小さく出る。
 *   **少し大きめに丸めて**、本数が多すぎる側に倒れないようにしてある。
 * ⚠️ 印刷の見出し・記入欄・枠の見出し帯・下の行の CSS を変えたら、ここを測り直す。
 * （記入欄の寸法そのものの決定は、このファイル冒頭の [DECISION 2026-09-10] を参照）
 */
export const PRINT = {
  /** 見出し・記入欄（下の余白 2.4mm を含む）。実測 32.8 */
  head: 33,
  /** 下の行「メモおこし」（上の余白 1.2mm を含む）。実測 5.84 */
  foot: 6,
  /** 枠の上端から1本目の罫線まで（枠線＋見出し帯＋上の余白 1mm）。実測 8.11・線の太さどおりなら 8.35 */
  boxTop: 8.4,
  /** 最後の罫線の下端から枠の下端まで、最低これだけ空ける（下の余白 1.2＋枠線 0.25） */
  boxBottom: 1.45,
  /** 自由形式の罫線の欄の上の余白 */
  freePad: 0.5,
} as const;

/** 「その他」の枠（罫線3本）と、その上の余白 */
const otherH = PRINT.boxTop + SHEET.otherLines * SHEET.line + PRINT.boxBottom + SHEET.gap;

/** 見出し・記入欄と下の行を除いた、枠を並べられる高さ（mm）。hasOther なら「その他」のぶんも引く */
function gridH(hasOther: boolean): number {
  return SHEET.pageH - SHEET.margin * 2 - PRINT.head - PRINT.foot - (hasOther ? otherH : 0);
}

/** 1ページに count 個の枠を置いたときの、枠1つの高さ（mm） */
export function boxHeight(count: number, hasOther: boolean): number {
  const rows = Math.ceil(count / SHEET.cols);
  return (gridH(hasOther) - SHEET.gap * (rows - 1)) / rows;
}

/** 高さ boxH の枠に**入るだけ**罫線を引く（1本目は `boxTop` から・最後の線は `boxBottom` より上） */
export function linesIn(boxH: number): number {
  return Math.max(0, Math.floor((boxH - PRINT.boxTop - PRINT.boxBottom) / SHEET.line));
}

/** その高さの枠に入る本数（間隔は固定なので、枠が高いほど本数が増える） */
function linesOn(count: number, hasOther: boolean): number {
  if (count === 0) return 0;
  return linesIn(boxHeight(count, hasOther));
}

/**
 * そのページの**最後の枠を横いっぱいに広げるか**。2列組の最後の行に1つしか入らないとき＝奇数個。
 * 行の高さは変わらないので、罫線の本数にも間隔にも影響しない。
 */
export function wideLast(countOnPage: number): boolean {
  return countOnPage % SHEET.cols === 1;
}

/**
 * 自由形式の罫線の欄の高さ（mm）。`PRINT` の見出し・記入欄と下の行、欄の上の余白を引く（P8-f）。
 * → 39本（234mm）。下の行との間に約 5.5mm の余裕が残る。
 */
export function freeAreaH(): number {
  return SHEET.pageH - SHEET.margin * 2 - PRINT.head - PRINT.foot - PRINT.freePad;
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
