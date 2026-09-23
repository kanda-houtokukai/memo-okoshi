// Word（.docx）の中身を組み立てる純関数（P6 項目9）。zip 化はブラウザ側（lib/export.ts）。
//
// [DECISION 2026-09-08]
// - 体裁: 各項目を罫線の表（1項目=1行。左に項目名、右に本文）に収める。余白は狭め（1.5cm）
// - 文字サイズ・行間は Word の既定値に任せる（sz / spacing を書かない）
// - フォントは Windows 標準の「游ゴシック」（Yu Gothic）を指定。無い環境では Word が代替する
// - コピペ耐性: 段落は <w:p><w:r><w:t> の素直な構造だけ。改行は段落分割で表し、
//   タブ・ソフト改行・ゼロ幅文字・ソフトハイフンは一切使わない
// - 記録（recordEntries）だけを書く。insights / spill はここに渡ってこない（不変条件1）
// [DECISION 2026-09-23] **1ページ目の右上に押印欄**（P12）。頭は枠線の無い2列の配置用の表（左に題と作成日、右に押印の表を入れ子）。
//   押印の枠は列幅と行の高さの**固定指定**で 15mm 角にする（ラベルと寸法は lib/stamp.ts・PDF と共通）。
//   ヘッダー部分（全ページに出る）には置かず本文に置く＝1ページ目だけ。回り込みの表（floating）は使わない
//   （Google ドキュメント・LibreOffice で崩れやすい）。表が続く箇所には空の段落をはさむ（Word が表をくっつけて見せないように）。
//   ⚠️ 「文字サイズは Word の既定に任せる」（2026-09-08）は**記録の表と題に限る**。押印欄のラベル（7pt）とページ番号（8pt）だけは指定する。
// [DECISION 2026-09-23] **フッターの中央にページ番号「1 / 2」**（PAGE / NUMPAGES・8pt・#7b766c。P12）。PDF と同じ位置・同じ形。

import type { RecordType } from "./items.ts";
import { stampLabels, stampTwips } from "./stamp.ts";

/** ページ番号（Word のフッターと PDF の余白の箱で共通。P12） */
export const PAGE_NUMBER = { pt: 8, color: "#7b766c" } as const;

export type DocEntry = { label: string; text: string };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 不可視文字（ゼロ幅・ソフトハイフン・BOM・単語結合子）を落とす。タブは全角空白に */
export function cleanText(s: string): string {
  return s.replace(/[​-‍⁠﻿­]/g, "").replace(/\t/g, "　").replace(/\r\n?/g, "\n");
}

function para(text: string, opts: { bold?: boolean; size?: number } = {}): string {
  const rpr = opts.bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:p><w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function cellParas(text: string): string {
  const lines = cleanText(text).split("\n");
  return lines.map((l) => para(l)).join("");
}

const BORDERS = `<w:tblBorders>
<w:top w:val="single" w:sz="4" w:space="0" w:color="8A8A8A"/>
<w:left w:val="single" w:sz="4" w:space="0" w:color="8A8A8A"/>
<w:bottom w:val="single" w:sz="4" w:space="0" w:color="8A8A8A"/>
<w:right w:val="single" w:sz="4" w:space="0" w:color="8A8A8A"/>
<w:insideH w:val="single" w:sz="4" w:space="0" w:color="8A8A8A"/>
<w:insideV w:val="single" w:sz="4" w:space="0" w:color="8A8A8A"/>
</w:tblBorders>`;

/** 押印の表（上の行＝ラベル・下の行＝押印の枠）。枠の数＝ラベルの数 */
function stampTableXml(type: RecordType | undefined): string {
  const t = stampTwips();
  const labels = stampLabels(type);
  const line = (side: string) => `<w:${side} w:val="single" w:sz="${t.borderSz}" w:space="0" w:color="${t.color}"/>`;
  const borders = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(line).join("")}</w:tblBorders>`;
  const label = (l: string) =>
    `<w:tc><w:tcPr><w:tcW w:w="${t.cell}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${t.fill}"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${t.labelSz}"/><w:szCs w:val="${t.labelSz}"/></w:rPr>` +
    `<w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p></w:tc>`;
  const box = `<w:tc><w:tcPr><w:tcW w:w="${t.cell}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${t.cell * labels.length}" w:type="dxa"/><w:jc w:val="right"/>${borders}<w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:top w:w="${t.padV}" w:type="dxa"/><w:left w:w="${t.padH}" w:type="dxa"/><w:bottom w:w="${t.padV}" w:type="dxa"/><w:right w:w="${t.padH}" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${labels.map(() => `<w:gridCol w:w="${t.cell}"/>`).join("")}</w:tblGrid>` +
    `<w:tr>${labels.map(label).join("")}</w:tr>` +
    `<w:tr><w:trPr><w:trHeight w:val="${t.cell}" w:hRule="exact"/></w:trPr>${labels.map(() => box).join("")}</w:tr>` +
    `</w:tbl>`
  );
}

/** 記録の表と同じ幅（twips） */
const TABLE_W = 9700;

/** 頭: 枠線の無い2列の配置用の表。左に題と作成日、右に押印の表（入れ子）。セルの最後は段落で閉じる（Word の決まり） */
function headXml(title: string, dateLabel: string, type: RecordType | undefined): string {
  const right = stampTwips().cell * stampLabels(type).length;
  const left = TABLE_W - right;
  const none = ["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="nil"/>`).join("");
  const zero = ["top", "left", "bottom", "right"].map((s) => `<w:${s} w:w="0" w:type="dxa"/>`).join("");
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${TABLE_W}" w:type="dxa"/><w:tblBorders>${none}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar>${zero}</w:tblCellMar></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${left}"/><w:gridCol w:w="${right}"/></w:tblGrid>` +
    `<w:tr><w:tc><w:tcPr><w:tcW w:w="${left}" w:type="dxa"/></w:tcPr>${para(cleanText(title), { bold: true })}${para(cleanText(dateLabel))}</w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="${right}" w:type="dxa"/></w:tcPr>${stampTableXml(type)}` +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p></w:tc></w:tr></w:tbl>`
  );
}

export function buildDocumentXml(entries: DocEntry[], title: string, dateLabel: string, type?: RecordType): string {
  const rows = entries
    .map(
      (e) => `<w:tr>
<w:tc><w:tcPr><w:tcW w:w="1900" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F3F1EB"/></w:tcPr>${para(cleanText(e.label), { bold: true })}</w:tc>
<w:tc><w:tcPr><w:tcW w:w="7800" w:type="dxa"/></w:tcPr>${cellParas(e.text)}</w:tc>
</w:tr>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${headXml(title, dateLabel, type)}
<w:p/>
<w:tbl>
<w:tblPr><w:tblW w:w="9700" w:type="dxa"/>${BORDERS}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tblGrid><w:gridCol w:w="1900"/><w:gridCol w:w="7800"/></w:tblGrid>
${rows}
</w:tbl>
<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="400" w:footer="${FOOTER_DIST}" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;
}

export const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Yu Gothic" w:hAnsi="Yu Gothic" w:eastAsia="游ゴシック" w:cs="Yu Gothic"/><w:lang w:val="ja-JP" w:eastAsia="ja-JP"/></w:rPr></w:rPrDefault>
<w:pPrDefault/>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

export const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

/**
 * フッターの位置（紙の下端からフッターの下端まで・twips）。PDF のページ番号は下の余白（15mm）の上下中央
 * ＝下端から 7.5mm に字の中心が来る。Word の 8pt 游ゴシックの1行は約 4.9mm なので、下端を約 5.05mm にすると中心がほぼ揃う。
 * ⚠️ この Mac では Word で描画して確かめていない（計算による目安）。
 */
const FOOTER_DIST = 286;

/** フッター: 中央にページ番号「1 / 2」（PAGE / NUMPAGES） */
export function footerXml(): string {
  const rpr = `<w:rPr><w:color w:val="${PAGE_NUMBER.color.slice(1).toUpperCase()}"/><w:sz w:val="${PAGE_NUMBER.pt * 2}"/><w:szCs w:val="${PAGE_NUMBER.pt * 2}"/></w:rPr>`;
  const field = (instr: string) => `<w:fldSimple w:instr=" ${instr} "><w:r>${rpr}<w:t>1</w:t></w:r></w:fldSimple>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>${field("PAGE")}<w:r>${rpr}<w:t xml:space="preserve"> / </w:t></w:r>${field("NUMPAGES")}</w:p>
</w:ftr>`;
}

export const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

export const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

export function dateStamp(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function dateLabel(d = new Date()): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 作成（メモおこし下書き）`;
}

/** .docx を構成するファイル一式（パス → 中身）。テストはこの出力を検査する。title・type は種類ごと（P9・P12。既定は面談） */
export function buildDocxParts(
  entries: DocEntry[],
  now = new Date(),
  title = "面談・モニタリング記録",
  type: RecordType = "interview"
): Record<string, string> {
  return {
    "[Content_Types].xml": CONTENT_TYPES_XML,
    "_rels/.rels": RELS_XML,
    "word/_rels/document.xml.rels": DOC_RELS_XML,
    "word/styles.xml": STYLES_XML,
    "word/document.xml": buildDocumentXml(entries, title, dateLabel(now), type),
    "word/footer1.xml": footerXml(),
  };
}

/** 生成物から本文だけを取り出す（コピペ耐性の検査用）。<w:t> の中身を段落ごとに改行で連結 */
export function extractText(documentXml: string): string {
  const paras = documentXml.match(/<w:p>[\s\S]*?<\/w:p>/g) ?? [];
  return paras
    .map((p) => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join(""))
    .join("\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}
