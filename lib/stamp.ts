// 押印欄（完成形の Word と PDF の1ページ目の右上）。**ラベルと寸法の定義はここだけ**。
//
// [DECISION 2026-09-23] **押印欄は用紙から外し、完成形（Word・PDF）に移す**（P12・設計側の指示）。
//   押印は完成した記録を承認するために押すもので、白紙の用紙を書く段階では要らない（P9 で用紙に付けたのは設計側の誤解）。
//   ラベルと寸法は用紙のときと同じ: 面談は「記録者」の1枠、会議は「作成者」「署名」の2枠。
//   押印の枠は **15mm 角**（認印の直径 10.5〜12mm＋周りに 1.5mm ずつの余白。枠線に印影が触れると読めない）。
//   枠線 0.25mm #444、ラベルは 7pt・背景 #efece6、ラベルの行の高さは文字に合わせる（固定しない）。
// [DECISION 2026-09-23] **Word と PDF は同じ定義から作る**: PDF は `stampCss()` の CSS を印刷のあいだだけ差し込み
//   （lib/export.ts）、Word は `stampTwips()` の twips で表を組む（lib/docx.ts）。`tests/stamp.test.mts` が両方の一致を見張る。
// ⚠️ **押印欄のラベルは記録ではない**。転記用テキスト（コピー）には入れない（`buildOutputText` はここを読まない）。

import type { RecordType } from "./items.ts";

export const STAMP = {
  /** 種類ごとのラベル（左から。枠の数＝ラベルの数） */
  labels: { interview: ["記録者"], meeting: ["作成者", "署名"] } as Record<RecordType, readonly string[]>,
  /** 押印の枠（正方形の一辺・mm） */
  cellMm: 15,
  /** 枠線（mm） */
  borderMm: 0.25,
  borderColor: "#444444",
  /** ラベルの文字（pt）と背景 */
  labelPt: 7,
  labelBg: "#efece6",
  /** ラベルの上下・左右の余白（mm） */
  labelPadMm: { v: 0.6, h: 1 },
} as const;

/** その種類のラベル。知らない値は面談として扱う（API の record_type と同じ扱い） */
export function stampLabels(type: RecordType | undefined): readonly string[] {
  return type === "meeting" ? STAMP.labels.meeting : STAMP.labels.interview;
}

/** mm → Word の twips（1440 twips = 1インチ = 25.4mm） */
export const mmToTwips = (mm: number) => Math.round((mm / 25.4) * 1440);

/**
 * Word の寸法。枠線は 1/8pt 単位（w:sz）なので 0.25mm（0.709pt）に最も近い 6（0.75pt ≒ 0.265mm）にする。
 * 文字は半ポイント単位（w:sz）。
 */
export function stampTwips() {
  return {
    cell: mmToTwips(STAMP.cellMm),
    borderSz: Math.round((STAMP.borderMm / 25.4) * 72 * 8),
    labelSz: STAMP.labelPt * 2,
    padV: mmToTwips(STAMP.labelPadMm.v),
    padH: mmToTwips(STAMP.labelPadMm.h),
    color: STAMP.borderColor.slice(1).toUpperCase(),
    fill: STAMP.labelBg.slice(1).toUpperCase(),
  };
}

/** PDF（印刷用 DOM）の押印欄の CSS。`.print-doc` の下に置く（記録の表の規則より詳しい指定で上書きする） */
export function stampCss(): string {
  const { cellMm: c, borderMm: b, borderColor: col, labelPt, labelBg, labelPadMm: p } = STAMP;
  const line = `${b}mm solid ${col}`;
  return (
    `.print-doc .pd-stamp{width:auto;border-collapse:collapse;table-layout:fixed;flex:0 0 auto;font-size:${labelPt}pt;line-height:1.3;color:#000}` +
    `.print-doc .pd-stamp th{width:${c}mm;padding:${p.v}mm ${p.h}mm;border:${line};background:${labelBg};font-weight:700;text-align:center;white-space:nowrap;` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.print-doc .pd-stamp td{width:${c}mm;height:${c}mm;padding:0;border:${line}}`
  );
}
