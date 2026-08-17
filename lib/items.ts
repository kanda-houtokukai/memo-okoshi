// 項目ライブラリ（決定事項: 基本6＋追加7）
// id はスキーマ・プロンプト・UIで共通に使う。表示順(ORDER)は定義順と分離する設計だが、
// P1の検証ページでは定義順をそのまま使う（並べ替えUIはP3）。

export type ItemDef = {
  id: string;
  label: string;
  hint: string; // AIに渡す「この項目に入る内容」の説明
  basic: boolean;
  closing?: boolean; // 申し送り=締めフラグ
};

export const ITEM_LIBRARY: ItemDef[] = [
  { id: "gaiyou", label: "面談概要", hint: "日時・場所・出席者・面談の種別や目的など、面談そのものの枠組み", basic: true },
  { id: "honnin", label: "本人の状況", hint: "本人の心身の状態・言動・生活の様子など本人について書かれたこと", basic: true },
  { id: "kazoku", label: "家族の状況", hint: "家族・保護者の状況、家族からの発言・意向", basic: true },
  { id: "shokan", label: "所感", hint: "面談者（記録者）の受け止め・見立て・印象", basic: true },
  { id: "kadai", label: "課題", hint: "把握された課題・懸念事項", basic: true },
  { id: "moushiokuri", label: "申し送り", hint: "次回予定・他職員への引き継ぎ・今後の対応", basic: true, closing: true },
  { id: "kenko", label: "健康・服薬", hint: "健康状態・受診・服薬に関すること", basic: false },
  { id: "seikatsu", label: "生活・住環境", hint: "住まい・生活環境・日常生活動作に関すること", basic: false },
  { id: "nicchu", label: "日中活動・就労", hint: "日中活動・通所・就労・学校/園での活動に関すること", basic: false },
  { id: "kinsen", label: "金銭管理", hint: "金銭の管理・収支・契約に関すること", basic: false },
  { id: "risk", label: "リスク・緊急性", hint: "安全・虐待・自傷他害・急を要する事柄", basic: false },
  { id: "kikan", label: "関係機関", hint: "他機関・他事業所との連携・調整に関すること", basic: false },
  { id: "kibou", label: "本人の希望・目標", hint: "本人（や家族）が望んでいること・目標", basic: false },
];

export function itemsByIds(ids: string[]): ItemDef[] {
  return ids
    .map((id) => ITEM_LIBRARY.find((d) => d.id === id))
    .filter((d): d is ItemDef => Boolean(d));
}
