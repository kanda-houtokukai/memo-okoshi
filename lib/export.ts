// Word / PDF の書き出し（ブラウザ側・端末内生成・サーバーを介さない）。
//
// [DECISION 2026-09-08]
// - Word: lib/docx.ts の XML を JSZip（cdnjs・版固定）で zip 化して .docx にする。npm 依存を増やさない
//   （この環境は npm install が禁止。pdf.js と同じ方針）
// - PDF: フォント埋め込みライブラリ（数MBの日本語フォントを毎回読み込む）は使わず、
//   印刷用レイアウトを組んでブラウザの印刷（PDFとして保存）に渡す。Windows の Edge/Chrome は
//   「PDF として保存」を標準で持ち、OS のフォントで文字化けせず、文字も選択できる PDF になる。
//   ファイル名は document.title を一時的に差し替えて日付ベースにする

import { buildDocxParts, cleanText, dateStamp, type DocEntry } from "./docx";

const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

type JSZipLike = { file: (p: string, c: string) => void; generateAsync: (o: { type: "blob"; compression?: string }) => Promise<Blob> };
type JSZipCtor = new () => JSZipLike;

let zipPromise: Promise<JSZipCtor> | null = null;
function loadJSZip(): Promise<JSZipCtor> {
  if (!zipPromise) {
    zipPromise = new Promise((res, rej) => {
      const w = window as unknown as { JSZip?: JSZipCtor };
      if (w.JSZip) return res(w.JSZip);
      const s = document.createElement("script");
      s.src = JSZIP_URL;
      s.onload = () => (w.JSZip ? res(w.JSZip) : rej(new Error("JSZip missing")));
      s.onerror = () => rej(new Error("JSZip load failed"));
      document.head.appendChild(s);
    });
    zipPromise.catch(() => (zipPromise = null));
  }
  return zipPromise;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportDocx(entries: DocEntry[], title?: string): Promise<void> {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  for (const [p, c] of Object.entries(buildDocxParts(entries, new Date(), title))) zip.file(p, c);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  download(
    new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    `メモおこし_${dateStamp()}.docx`
  );
}

/**
 * 完成形の PDF のページ（A4・余白 15mm＝Word の `pgMar` 850 twips と同じ。`lib/docx.ts`）。
 * [DECISION 2026-09-18] **印刷のあいだだけ差し込む**（P11）。`@page` は要素ごとに分けられないので、globals.css に置くと
 *   用紙の `@page{margin:9mm}` と同じ場所で競い、ファイルの後ろにある用紙のほうが勝つ（P7-e から完成形も 9mm になっていた）。
 *   印刷用 DOM の中に置けば、文書の順で globals.css より後ろになって完成形のほうが勝ち、片付けと一緒に消える。
 *   用紙の印刷（`SheetMaker`）はこれを差し込まないので 9mm のまま。`tests/print-doc.test.mts`。
 */
export const RECORD_PAGE_CSS = "@page{size:A4;margin:15mm}";

/** 印刷用DOMを組んで window.print()。印刷後に片付ける */
export function printRecord(entries: DocEntry[], title = "面談・モニタリング記録"): void {
  const root = document.createElement("div");
  root.className = "print-doc";
  const page = document.createElement("style");
  page.textContent = RECORD_PAGE_CSS;
  root.appendChild(page);
  const h = document.createElement("h1");
  h.textContent = title;
  const d = document.createElement("div");
  d.className = "pd-date";
  d.textContent = `${new Date().getFullYear()}年${new Date().getMonth() + 1}月${new Date().getDate()}日 作成（メモおこし下書き）`;
  root.appendChild(h);
  root.appendChild(d);
  const table = document.createElement("table");
  for (const e of entries) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = cleanText(e.label);
    const td = document.createElement("td");
    cleanText(e.text)
      .split("\n")
      .forEach((line) => {
        const p = document.createElement("p");
        p.textContent = line;
        td.appendChild(p);
      });
    tr.appendChild(th);
    tr.appendChild(td);
    table.appendChild(tr);
  }
  root.appendChild(table);
  document.body.appendChild(root);
  const prevTitle = document.title;
  document.title = `メモおこし_${dateStamp()}`;
  const cleanup = () => {
    document.title = prevTitle;
    root.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // afterprint が来ない環境の保険
  setTimeout(() => {
    if (document.body.contains(root)) cleanup();
  }, 60000);
}
