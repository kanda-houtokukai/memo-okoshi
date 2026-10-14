// 項目ライブラリ（基本6＋追加項目7）
//
// [DECISION 2026-09-10] **分類を見直した**（2026-08-17の「基本＝概要/本人/家族/所感/課題/申し送り」から変更）。
//   基本＝**面談の中で必ず聞き取る内容**（概要・本人・家族・課題・健康・生活）。
//   追加項目＝**書く人の判断で足すもの**（所感・申し送り・就労・金銭・リスク・連携・希望）。
//   支援者の所感と次回への申し送りは、**面談中に聞き取るものではなく、書くときに整えるもの**なので追加項目へ。
//   ただし**使う場面は多い**ので既定はオンのままにする（下の defaultOn）。
//   **記録側と用紙側は同じこの分類・同じ選択を使う**（用紙と出力が食い違わないため）。
// [DECISION 2026-09-10] **既定でオンは基本6項目だけ**（追加項目はすべてオフ）。
//   「基本＝面談の中で必ず聞き取る内容／追加項目＝書く人の判断で足すもの」という分類と、既定値を一致させる。
//   ※ 同日いったん「基本6＋所感＋申し送り」の8項目にしたが、**分類と既定がずれていて分かりにくい**ため戻した。
//   所感・申し送りを使う人は追加項目から自分でオンにする（用紙の画面でも記録の項目ドロワーでも1タップ）。
//
// - id: P1で確定したAPI契約の id（プロンプト・スキーマ・localStorageの正本）
// - label / tab / color / group / defaultOn / closing:
//   UI仕様の正本 docs/mock/memo-okoshi-mock-v6.html の LIB を移したもの。
//   表示文言・タブ名・色は正本どおり。勝手に変えないこと。
// - hint: AIプロンプトへ渡す「この項目に入る内容」の説明（P1から継承）
//
// 表示順は定義順と分離する（ORDER）。既定の ORDER はこの定義順。
//
// [DECISION 2026-09-17] **記録の種類を2つにする（P9）**: 面談（interview）と会議（meeting）。
//   項目ライブラリは種類ごとに別に持つ（`ITEM_LIBRARY`＝面談・`MEETING_LIBRARY`＝会議）。
//   面談の項目・id・分類・既定値は**1つも変えない**（面談側の動作を変えないため）。
//   会議は4項目だけ（会議概要・内容・決定事項・今後の対応）で追加項目は設けない。id は面談と重ならない。
//   どちらを使うかは `libraryFor(type)` で引く。`record_type` の予約枠（P1〜）をここで初めて使う。
// [DECISION 2026-10-14・設計側] **3つ目の種類「見学」（visit）を足す**（P21）。事業所の見学対応の記録を、面談・会議と同じ流れで作る。
//   項目は設計側が決めた7つ（名前・日時・来所者・通園、通所先・住所・事前情報・内容）で、この順・この名前。
//   **項目を選ぶ・並べ替える操作は無い**（`isFixedType`）。用紙は1枚・「その他」の欄も無い（「内容」が受け皿）。
//   1〜6 は1行の欄（`oneLine`）、7「内容」が本文。id は面談・会議と重ねない（`v_` で始める）。

/** 記録の種類。スキーマ・API・状態に予約してあった `record_type` の値 */
export type RecordType = "interview" | "meeting" | "visit";

export const RECORD_TYPES: readonly RecordType[] = ["interview", "meeting", "visit"] as const;

export function isRecordType(v: unknown): v is RecordType {
  return v === "interview" || v === "meeting" || v === "visit";
}

/** 項目が決まっている種類（項目のオン・オフ・並べ替えの操作を出さない）。いまは見学だけ（P21） */
export function isFixedType(type: RecordType | undefined): boolean {
  return type === "visit";
}

export type ItemDef = {
  id: string;
  label: string;
  tab: string;
  group: "基本" | "追加項目";
  color: string;
  defaultOn: boolean;
  closing?: boolean; // 申し送り=締めフラグ（締めは常に最後。追加・復帰した項目はこれより前・定義順の位置に入る）
  hint: string;
  /**
   * 用紙での扱い（P9・会議の用紙だけが使う。面談の項目には付けない）:
   *   "wide" = 横いっぱいの大きな枠（1行を占め、高さの取り分も大きい。`lib/sheet.ts` の `SHEET.wideWeight`）
   *   "none" = **用紙に載せない記録だけの項目**（枠を作らず、用紙の画面のトグルと並べ替えの一覧にも出さない）。
   *            会議概要がこれ: 会議名・日時・場所・出席者は用紙の頭の記入欄に書き、AIがそこから会議概要を組み立てる。
   *            [DECISION 2026-09-17] P9 では「その他」に相乗り（"other"）させたが、何を書く枠か伝わらず、
   *            一覧では動かせるのに用紙では下に固定される＝操作が嘘になっていたのでやめた（P9-c・設計側の指示）
   */
  sheet?: "wide" | "none";
  /** 1行の欄（見学の1〜6・P21）。用紙では1行ぶんの高さ、転記用テキストでは「項目名　中身」の1行にする */
  oneLine?: boolean;
};

export const ITEM_LIBRARY: ItemDef[] = [
  // ---- 基本（面談の中で必ず聞き取る内容）----
  { id: "gaiyou", label: "面談概要", tab: "概要", group: "基本", color: "var(--t1)", defaultOn: true,
    hint: "日時・場所・出席者・面談の種別や目的など、面談そのものの枠組み" },
  { id: "honnin", label: "本人の発言・様子", tab: "本人", group: "基本", color: "var(--t2)", defaultOn: true,
    hint: "本人の発言・心身の状態・言動・生活の様子など本人について書かれたこと" },
  { id: "kazoku", label: "家族等の発言", tab: "家族", group: "基本", color: "var(--t3)", defaultOn: true,
    hint: "家族・保護者の状況、家族等からの発言・意向" },
  { id: "kadai", label: "課題・変化", tab: "課題", group: "基本", color: "var(--t5)", defaultOn: true,
    hint: "把握された課題・懸念事項・前回からの変化" },
  { id: "kenko", label: "健康・服薬", tab: "健康", group: "基本", color: "var(--t7)", defaultOn: true,
    hint: "健康状態・受診・服薬に関すること" },
  { id: "seikatsu", label: "生活・住環境", tab: "生活", group: "基本", color: "var(--t8)", defaultOn: true,
    hint: "住まい・生活環境・日常生活動作に関すること" },
  // ---- 追加項目（書く人の判断で足す。既定はすべてオフ）----
  { id: "shokan", label: "支援者の所感", tab: "所感", group: "追加項目", color: "var(--t4)", defaultOn: false,
    hint: "面談者（記録者）の受け止め・見立て・印象" },
  { id: "moushiokuri", label: "次回への申し送り", tab: "申送", group: "追加項目", color: "var(--t6)", defaultOn: false, closing: true,
    hint: "次回予定・他職員への引き継ぎ・今後の対応" },
  { id: "nicchu", label: "日中活動・就労", tab: "就労", group: "追加項目", color: "var(--t1)", defaultOn: false,
    hint: "日中活動・通所・就労・学校/園での活動に関すること" },
  { id: "kinsen", label: "金銭管理", tab: "金銭", group: "追加項目", color: "var(--t3)", defaultOn: false,
    hint: "金銭の管理・収支・契約に関すること" },
  { id: "risk", label: "リスク・緊急性", tab: "急", group: "追加項目", color: "var(--t4)", defaultOn: false,
    hint: "安全・虐待・自傷他害・急を要する事柄" },
  { id: "kikan", label: "関係機関との連携", tab: "連携", group: "追加項目", color: "var(--t2)", defaultOn: false,
    hint: "他機関・他事業所との連携・調整に関すること" },
  { id: "kibou", label: "本人の希望・目標", tab: "希望", group: "追加項目", color: "var(--t5)", defaultOn: false,
    hint: "本人（や家族）が望んでいること・目標" },
];

/**
 * 会議の項目（P9）。**4項目だけ・すべて基本・すべて既定オン**。追加項目は設けない。
 * 用紙に載るのは内容・決定事項・今後の対応の3つ（会議概要は用紙に枠を作らない記録だけの項目。P9-c）。
 * 走り書きでは内容・決定事項・今後の対応が混ざって書かれる前提で、AIが読み取って振り分ける（`lib/prompt.ts`）。
 * [DECISION 2026-09-17] **「宿題」→「今後の対応」に改称**（P9-d・設計側の指示）。「宿題」は会議録の用語として一般的でなく、
 *   誰が何をするかを書く欄として自然で、面談の「次回への申し送り」とも系統が揃う。**id（shukudai）は変えない**
 *   （保存済みの項目の選択・並び・書き出しファイルが読めなくなるため）。タブ名は「対応」。
 * 色・タブ名は `docs/mock/kaigi-mock-v1.html` のとおり。
 */
export const MEETING_LIBRARY: ItemDef[] = [
  { id: "kaigi", label: "会議概要", tab: "概要", group: "基本", color: "var(--t1)", defaultOn: true, sheet: "none",
    hint: "会議名・日時・場所・出席者（欠席者）など、会議そのものの枠組み（用紙では頭の記入欄に書かれる）" },
  { id: "naiyou", label: "内容", tab: "内容", group: "基本", color: "var(--t2)", defaultOn: true, sheet: "wide",
    hint: "議題ごとに話し合われた内容・報告・出た意見・検討中の事柄（決定にも今後の対応にも当たらないもの）" },
  { id: "kettei", label: "決定事項", tab: "決定", group: "基本", color: "var(--t3)", defaultOn: true,
    hint: "この会議で決まったこと（検討中・保留のものは入れない）" },
  { id: "shukudai", label: "今後の対応", tab: "対応", group: "基本", color: "var(--t4)", defaultOn: true,
    hint: "誰かが持ち帰る作業・次回までにやること（誰が・いつまでに・何を）" },
];

/**
 * 見学の項目（P21・設計側の決定）。**7項目・この順・この名前**（項目名にコロンを付けない）。すべて既定オン・追加項目なし。
 * 1〜6 は1行の欄（`oneLine`）、7「内容」が本文。名前・来所者・住所は個人情報で、撮ったあと「伏せる」で塗る前提。
 */
export const VISIT_LIBRARY: ItemDef[] = [
  { id: "v_name", label: "名前", tab: "名前", group: "基本", color: "var(--t1)", defaultOn: true, oneLine: true,
    hint: "見学に来た本人（利用を考えている人）の名前。用紙の「名前」の欄" },
  { id: "v_date", label: "日時", tab: "日時", group: "基本", color: "var(--t2)", defaultOn: true, oneLine: true,
    hint: "見学の日時。用紙の「日時」の欄に書かれたとおり" },
  { id: "v_visitor", label: "来所者", tab: "来所", group: "基本", color: "var(--t3)", defaultOn: true, oneLine: true,
    hint: "一緒に来所した人（保護者・家族・関係機関の職員など）。用紙の「来所者」の欄" },
  { id: "v_school", label: "通園、通所先", tab: "通園", group: "基本", color: "var(--t5)", defaultOn: true, oneLine: true,
    hint: "いま通っている園・学校・事業所など。用紙の「通園、通所先」の欄" },
  { id: "v_address", label: "住所", tab: "住所", group: "基本", color: "var(--t8)", defaultOn: true, oneLine: true,
    hint: "住所。用紙の「住所」の欄" },
  { id: "v_prior", label: "事前情報", tab: "事前", group: "基本", color: "var(--t7)", defaultOn: true, oneLine: true,
    hint: "見学の前に分かっていたこと（紹介元・相談の経緯・状況など）。用紙の「事前情報」の欄" },
  { id: "v_body", label: "内容", tab: "内容", group: "基本", color: "var(--t6)", defaultOn: true,
    hint: "見学の中で話したこと・見たこと・質問と答え・本人の様子・今後の予定など。1〜6 の欄に入らない話もここに入れる" },
];

/** 用紙に載せる項目（`sheet:"none"` を除く）。用紙の画面のトグル・並べ替え・見本はこれを使う（P9-c） */
export function sheetLibrary(lib: ItemDef[]): ItemDef[] {
  return lib.filter((l) => l.sheet !== "none");
}

/** 種類に応じた項目ライブラリ */
export function libraryFor(type: RecordType): ItemDef[] {
  return type === "meeting" ? MEETING_LIBRARY : type === "visit" ? VISIT_LIBRARY : ITEM_LIBRARY;
}

export function itemsByIds(ids: string[], lib: ItemDef[] = ITEM_LIBRARY): ItemDef[] {
  return ids
    .map((id) => lib.find((d) => d.id === id))
    .filter((d): d is ItemDef => Boolean(d));
}

export function itemById(id: string, lib: ItemDef[] = ITEM_LIBRARY): ItemDef | undefined {
  return lib.find((d) => d.id === id);
}
