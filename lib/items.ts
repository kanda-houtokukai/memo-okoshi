// 項目ライブラリ（決定事項: 基本6＋追加7）
//
// - id: P1で確定したAPI契約の id（プロンプト・スキーマ・localStorageの正本）
// - label / tab / color / group / defaultOn / closing:
//   UI仕様の正本 docs/mock/memo-okoshi-mock-v6.html の LIB を移したもの。
//   表示文言・タブ名・色は正本どおり。勝手に変えないこと。
// - hint: AIプロンプトへ渡す「この項目に入る内容」の説明（P1から継承）
//
// 表示順は定義順と分離する（ORDER）。既定の ORDER はこの定義順。

export type ItemDef = {
  id: string;
  label: string;
  tab: string;
  group: "基本" | "追加項目";
  color: string;
  defaultOn: boolean;
  closing?: boolean; // 申し送り=締めフラグ（追加・復帰はこの手前に入る）
  hint: string;
};

export const ITEM_LIBRARY: ItemDef[] = [
  { id: "gaiyou", label: "面談概要", tab: "概要", group: "基本", color: "var(--t1)", defaultOn: true,
    hint: "日時・場所・出席者・面談の種別や目的など、面談そのものの枠組み" },
  { id: "honnin", label: "本人の発言・様子", tab: "本人", group: "基本", color: "var(--t2)", defaultOn: true,
    hint: "本人の発言・心身の状態・言動・生活の様子など本人について書かれたこと" },
  { id: "kazoku", label: "家族等の発言", tab: "家族", group: "基本", color: "var(--t3)", defaultOn: true,
    hint: "家族・保護者の状況、家族等からの発言・意向" },
  { id: "shokan", label: "支援者の所感", tab: "所感", group: "基本", color: "var(--t4)", defaultOn: true,
    hint: "面談者（記録者）の受け止め・見立て・印象" },
  { id: "kadai", label: "課題・変化", tab: "課題", group: "基本", color: "var(--t5)", defaultOn: true,
    hint: "把握された課題・懸念事項・前回からの変化" },
  { id: "moushiokuri", label: "次回への申し送り", tab: "申送", group: "基本", color: "var(--t6)", defaultOn: true, closing: true,
    hint: "次回予定・他職員への引き継ぎ・今後の対応" },
  { id: "kenko", label: "健康・服薬", tab: "健康", group: "追加項目", color: "var(--t7)", defaultOn: false,
    hint: "健康状態・受診・服薬に関すること" },
  { id: "seikatsu", label: "生活・住環境", tab: "生活", group: "追加項目", color: "var(--t8)", defaultOn: false,
    hint: "住まい・生活環境・日常生活動作に関すること" },
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

export function itemsByIds(ids: string[]): ItemDef[] {
  return ids
    .map((id) => ITEM_LIBRARY.find((d) => d.id === id))
    .filter((d): d is ItemDef => Boolean(d));
}

export function itemById(id: string): ItemDef | undefined {
  return ITEM_LIBRARY.find((d) => d.id === id);
}
