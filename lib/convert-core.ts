// 変換の後半（モデルの返答 → 記録のデータ）。**変換API（app/api/convert/route.ts）と評価キット（eval/）が同じものを使う**。
//
// [DECISION 2026-10-14] 評価キット（P20）が本番と同じ読み取りの経路で測れるよう、route.ts の中にあった返答の読み取り（JSON の救済）と
//   人名の機械検出（enforceNames）をここへ移した（動きは変えていない）。評価のための別の作りにしない。

import { enforceNames } from "./names.ts";
import type { RecordType } from "./items.ts";

export type Token = { t: "p" | "y" | "b" | "r"; s: string; cands?: string[]; note?: string };
export type Converted = {
  record_type: string;
  sections: { id: string; tokens: Token[] }[];
  spill: { text: string; suggest: string | null }[];
  insights: { text: string; why: string; refs: string[] }[];
};

/** モデルの返答（JSON のはず）を読む。コードフェンス剥がし→最初の { から最後の } までの切り出し、の順で救済する */
export function parseModelJson(text: string): Converted | null {
  const tryParse = (s: string): Converted | null => {
    try {
      const v = JSON.parse(s);
      if (v && Array.isArray(v.sections)) {
        v.record_type = typeof v.record_type === "string" ? v.record_type : "interview";
        v.spill = Array.isArray(v.spill) ? v.spill : [];
        v.insights = Array.isArray(v.insights) ? v.insights : [];
        return v as Converted;
      }
      return null;
    } catch {
      return null;
    }
  };
  // response_mime_type: application/json を指定しているが、保険として
  // コードフェンス剥がし→最初の { から最後の } までの切り出し、の順で救済する
  const direct = tryParse(text);
  if (direct) return direct;
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const fenced = tryParse(unfenced);
  if (fenced) return fenced;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1));
  return null;
}

/**
 * モデルの返答を記録のデータにする。読めなければ null。
 * 原則3の保険: AIが人名を p/y/b に紛れ込ませても、敬称付き氏名は機械的に r へ切り出す。
 * [DECISION 2026-09-23・設計側] **面談・会議とも**通す（P15。原則3を「赤＝伏せ忘れの知らせ」に改め、会議も名前を塗って送る）。
 *   P9 の「会議では人名の検知を働かせず r を p に落とす（withoutRed）」は改めた。
 */
export function finishConversion(text: string, type: RecordType): Converted | null {
  const parsed = parseModelJson(text);
  const data = parsed ? enforceNames(parsed) : null;
  if (data) data.record_type = type;
  return data;
}
