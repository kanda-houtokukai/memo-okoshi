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
// [DECISION 2026-09-17] **会議の用紙**（P9）。同じ A4・同じ記入欄の頭・同じ罫線の規則（6mm固定・入るだけ）で、
//   割り付けだけ**行の重み**で決める（`sheetRows`）。「内容」は横いっぱいの大きな枠（重み `wideWeight`）、
//   決定事項と今後の対応は2列、最後は面談と同じ「その他」だけ。
//   [DECISION 2026-09-17] **会議概要の枠は用紙から外す**（P9-c）。用紙の項目は内容・決定事項・今後の対応の3つで、
//   会議名・日時・場所・出席者は頭の記入欄に書く（AIがそこから記録の「会議概要」を組み立てる）。
//   面談の「その他」が記録の項目でないのと同じ扱い（用紙の項目と記録の項目は一致しなくてよい）。
// [DECISION 2026-09-17] **会議名の欄は題の右**（会議だけ・P9-c）。題の行は押印欄の左にあり、横が空いている。
//   新しい行を足すと頭が約10mm高くなって罫線が減り、日時と場所を同じ行に戻すと場所が狭くなる（P9-b で直した問題）。
//   題の行に入れれば頭の高さは変わらない。下線は日時のマスと同じ 7mm 高（題の行の高さに収まる）。
//   面談の用紙は全部の行が重み1なので、これまでの割り付け（`sheetLayout`）と**同じ本数**になる
//   （`tests/meeting.test.mts` が全項目数で一致を見張る）。
// [DECISION 2026-09-17] **押印欄**（P9・6-b）。用紙の右上に、上の行＝ラベル・下の行＝押印の正方形。
//   会議は2列（作成者／署名）、面談は1列（記録者）。自由形式にも同じ欄を置く。
//   押印の枠は **15mm 角**: 認印の直径は 10.5〜12mm で、12mm の印影の周りに 1.5mm ずつ余白が要る
//   （枠線に印影が触れると読めない）。回覧・稟議の押印欄で一般的な寸法でもある。
//   欄は題・日時・場所の右に置き、その2行は押印欄のぶん狭くなる（重ねない）。
// [DECISION 2026-09-17] **記入欄は1項目1行**（日時／場所／参加者・出席者。P9-b・設計側の指示）。
//   押印欄が入って「場所」の下線が面談 約64mm・会議 約49mm まで狭くなり、施設名の長い場所や出席者の多い会議で足りなかった。
//   **面談も同じ3行にする**（判断は委ねられた）: 面談と会議で用紙の頭が同じ形になり、印刷の実測値（`PRINT.head`）も1つで済む。
//   面談の既定（基本6項目）は罫線が減らない（9本のまま）。減るのは1〜4項目と2枚のとき（各1本）と自由形式（1本）。
//   参加者・出席者の行は押印欄より下に来るので、**押印欄の下まで横いっぱい**に使う（重ならない）。
//   → 場所 約167mm（面談）／約152mm（会議）、参加者・出席者 約182mm（どちらも）。頭は 32.8→42.4mm（実測）。

import type { RecordType } from "./items";

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
  /**
   * 横いっぱいの大きな枠（`ItemDef.sheet === "wide"`）の行の高さの重み。ほかの行は 1（P9）。
   * [DECISION 2026-09-17] 2.5 → 2.3（P9-b）。記入欄を3行にしたとき、決定事項と右隣の枠の 8本を残すため。
   * [DECISION 2026-09-17] 2.3 → **3.15**（P9-d・設計側の指示）。実際の会議では内容が最も長くなるので、
   *   **決定事項と今後の対応を 8→6本に減らし、そのぶん内容を 21→23本に**する。罫線 6mm 固定・入るだけの規則はそのまま。
   *   重みで 6本/23本 になる範囲は約 2.96〜3.31。3 だと内容が 23本ぎりぎり（あと 0.5mm で 22本）なので、
   *   両側の余裕が同じくらいになる 3.15 にした（内容はあと約2.3mm・決定事項/今後の対応はあと約1.8mm まで崩れない）。
   */
  wideWeight: 3.15,
} as const;

/** 記入欄の頭の文言（種類ごと）。題・参加者の欄の見出し・押印欄のラベル（列の数＝ラベルの数） */
export const SHEET_HEAD: Record<RecordType, { title: string; people: string; stamps: readonly string[]; name?: string }> = {
  interview: { title: "面談記録メモ", people: "参加者", stamps: ["記録者"] },
  /** name: 題の右に置く欄の見出し（会議だけ。P9-c） */
  meeting: { title: "会議記録メモ", people: "出席者", stamps: ["作成者", "署名"], name: "会議名" },
};

/** 押印欄の寸法（mm・pt）。理由はこのファイル冒頭の [DECISION 2026-09-17] */
export const STAMP = {
  /** 押印の枠（正方形の一辺・mm） */
  cell: 15,
  /** ラベルの文字（pt）。ラベルの行の高さは文字に合わせる（固定しない） */
  labelPt: 7,
  /** 記入欄との間（mm） */
  gap: 3,
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
  /** 見出し・記入欄（下の余白 2.4mm を含む）。実測 42.4（2026-09-17・記入欄を3行に。それまでは 2行で 32.8→33） */
  head: 42.5,
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
 * → 38本（228mm）。下の行との間に 2mm の余裕が残る（実測では 2.77mm。2026-09-17 に記入欄を3行にして 39→38本）。
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

/** 保存するPDFの名前（日付ベース・種類ごと） */
export function sheetFileName(d = new Date(), type: RecordType = "interview"): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${type === "meeting" ? "会議用紙" : "面談用紙"}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/* ---------- 行の割り付け（P9・面談と会議で共通） ---------- */

export type SheetRow = {
  /** その行に置く項目の id（2列に詰めるので最大2つ。wide の項目は1つ） */
  ids: string[];
  /** 横いっぱいにする行（wide の項目・1つしか入らなかった最後の行） */
  wide: boolean;
  /** 高さの取り分（1 か `SHEET.wideWeight`） */
  weight: number;
  /** その行の枠に引く罫線の本数（間隔は固定。高さに入るだけ） */
  lines: number;
};

/**
 * 1ページぶんの項目を行に割り付ける。`sheet:"none"` の項目は枠を作らない（用紙に載せない。P9-c）。
 * `sheet:"wide"` の項目は1行を占め、それ以外は2列に詰める。最後に1つ余れば横いっぱい（`wideLast` と同じ結論）。
 * 行の高さは重みで按分し、罫線はその高さに**入るだけ**引く（P8-g の規則そのまま）。
 * 面談（重みがすべて1）では `sheetLayout` の本数と一致する。
 */
export function sheetRows(items: { id: string; sheet?: "wide" | "none" }[], hasOther: boolean): SheetRow[] {
  const rows: { ids: string[]; wide: boolean; weight: number }[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (pending.length) rows.push({ ids: pending, wide: pending.length === 1, weight: 1 });
    pending = [];
  };
  for (const it of items) {
    if (it.sheet === "none") continue;
    if (it.sheet === "wide") {
      flush();
      rows.push({ ids: [it.id], wide: true, weight: SHEET.wideWeight });
      continue;
    }
    pending.push(it.id);
    if (pending.length === SHEET.cols) flush();
  }
  flush();
  const total = rows.reduce((a, r) => a + r.weight, 0);
  const h = gridH(hasOther) - SHEET.gap * (rows.length - 1);
  return rows.map((r) => ({ ...r, lines: linesIn((h * r.weight) / total) }));
}

/** CSS grid の行の高さ（`grid-template-rows`）。重みがすべて1なら undefined（既定の均等割り＝面談はこれまでどおり） */
export function gridRowsStyle(rows: SheetRow[]): string | undefined {
  if (rows.every((r) => r.weight === 1)) return undefined;
  return rows.map((r) => `minmax(0,${r.weight}fr)`).join(" ");
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
