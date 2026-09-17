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
//   会議は4項目だけ（会議概要・内容・決定事項・宿題）で追加項目は設けない。id は面談と重ならない。
//   どちらを使うかは `libraryFor(type)` で引く。`record_type` の予約枠（P1〜）をここで初めて使う。

/** 記録の種類。スキーマ・API・状態に予約してあった `record_type` の値 */
export type RecordType = "interview" | "meeting";

export const RECORD_TYPES: readonly RecordType[] = ["interview", "meeting"] as const;

export function isRecordType(v: unknown): v is RecordType {
  return v === "interview" || v === "meeting";
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
   *   "wide"  = 横いっぱいの大きな枠（1行を占め、高さの取り分も大きい。`lib/sheet.ts` の `SHEET.wideWeight`）
   *   "other" = 枠を作らず、用紙の最後の「その他」の枠に相乗りする（見出しは「会議概要・その他」）。
   *             日時・場所・出席者は記入欄の頭にあるので、用紙の上では概要の枠が要らないため
   */
  sheet?: "wide" | "other";
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
 * 走り書きでは内容・決定事項・宿題が混ざって書かれる前提で、AIが読み取って振り分ける（`lib/prompt.ts`）。
 * 色・タブ名は `docs/mock/kaigi-mock-v1.html` のとおり。
 */
export const MEETING_LIBRARY: ItemDef[] = [
  { id: "kaigi", label: "会議概要", tab: "概要", group: "基本", color: "var(--t1)", defaultOn: true, sheet: "other",
    hint: "会議名・日時・場所・出席者（欠席者）・議題など、会議そのものの枠組み" },
  { id: "naiyou", label: "内容", tab: "内容", group: "基本", color: "var(--t2)", defaultOn: true, sheet: "wide",
    hint: "議題ごとに話し合われた内容・報告・出た意見・検討中の事柄（決定にも宿題にも当たらないもの）" },
  { id: "kettei", label: "決定事項", tab: "決定", group: "基本", color: "var(--t3)", defaultOn: true,
    hint: "この会議で決まったこと（検討中・保留のものは入れない）" },
  { id: "shukudai", label: "宿題", tab: "宿題", group: "基本", color: "var(--t4)", defaultOn: true,
    hint: "誰かが持ち帰る作業・次回までにやること（誰が・いつまでに・何を）" },
];

/** 種類に応じた項目ライブラリ */
export function libraryFor(type: RecordType): ItemDef[] {
  return type === "meeting" ? MEETING_LIBRARY : ITEM_LIBRARY;
}

export function itemsByIds(ids: string[], lib: ItemDef[] = ITEM_LIBRARY): ItemDef[] {
  return ids
    .map((id) => lib.find((d) => d.id === id))
    .filter((d): d is ItemDef => Boolean(d));
}

export function itemById(id: string, lib: ItemDef[] = ITEM_LIBRARY): ItemDef | undefined {
  return lib.find((d) => d.id === id);
}
