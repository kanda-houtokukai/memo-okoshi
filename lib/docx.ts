// Word（.docx）の中身を組み立てる純関数（P6 項目9）。zip 化はブラウザ側（lib/export.ts）。
//
// [DECISION 2026-09-08]
// - 体裁: 各項目を罫線の表（1項目=1行。左に項目名、右に本文）に収める。余白は狭め（1.5cm）
// - 文字サイズ・行間は Word の既定値に任せる（sz / spacing を書かない）
// - フォントは Windows 標準の「游ゴシック」（Yu Gothic）を指定。無い環境では Word が代替する
// - コピペ耐性: 段落は <w:p><w:r><w:t> の素直な構造だけ。改行は段落分割で表し、
//   タブ・ソフト改行・ゼロ幅文字・ソフトハイフンは一切使わない
// - 記録（recordEntries）だけを書く。insights / spill はここに渡ってこない（不変条件1）

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

export function buildDocumentXml(entries: DocEntry[], title: string, dateLabel: string): string {
  const rows = entries
    .map(
      (e) => `<w:tr>
<w:tc><w:tcPr><w:tcW w:w="1900" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F3F1EB"/></w:tcPr>${para(cleanText(e.label), { bold: true })}</w:tc>
<w:tc><w:tcPr><w:tcW w:w="7800" w:type="dxa"/></w:tcPr>${cellParas(e.text)}</w:tc>
</w:tr>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${para(cleanText(title), { bold: true })}
${para(cleanText(dateLabel))}
<w:tbl>
<w:tblPr><w:tblW w:w="9700" w:type="dxa"/>${BORDERS}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>
<w:tblGrid><w:gridCol w:w="1900"/><w:gridCol w:w="7800"/></w:tblGrid>
${rows}
</w:tbl>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr>
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
</Types>`;

export const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

export const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

export function dateStamp(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function dateLabel(d = new Date()): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 作成（メモおこし下書き）`;
}

/** .docx を構成するファイル一式（パス → 中身）。テストはこの出力を検査する */
export function buildDocxParts(entries: DocEntry[], now = new Date()): Record<string, string> {
  return {
    "[Content_Types].xml": CONTENT_TYPES_XML,
    "_rels/.rels": RELS_XML,
    "word/_rels/document.xml.rels": DOC_RELS_XML,
    "word/styles.xml": STYLES_XML,
    "word/document.xml": buildDocumentXml(entries, "面談・モニタリング記録", dateLabel(now)),
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
