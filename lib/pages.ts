// 取り込みページの生成と、マスク焼き込み済み画像の書き出し（ブラウザ専用）。
//
// 原則5: 元画像・元PDFは端末内に留める。API へ渡すのは exportMasked() の出力だけ。
//        PDF のページ画像化も端末内（pdf.js を CDN から読み込んでブラウザ内で描画）。

import { EMPTY_MASK, renderStrokes, type MaskState } from "./mask";

/** 書き出し画像の最長辺（実機で調整が必要な値）。手書きの判読性と送信サイズの折り合い */
export const MAX_SIDE = 2200;
/** 書き出し JPEG 品質（実機で調整が必要な値） */
export const JPEG_QUALITY = 0.92;
/** 取り込み一覧のサムネイル最長辺 */
export const THUMB_SIDE = 320;

// [DECISION 2026-09-07] pdf.js は npm 依存にせず CDN（cdnjs・版固定）から遅延読み込みする。
//   理由: この環境では npm install が権限で禁止されており自走中に承認を求められない。
//   PDF を追加した時だけ読み込むので画像だけの利用者には影響しない。
//   バンドルに切り替える場合は `pdfjs-dist` を入れて loadPdfJs() を差し替えるだけでよい。
const PDFJS_VER = "5.4.149";
const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.mjs`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.mjs`;

export type PageItem = {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  width: number;
  height: number;
  thumb: string; // data URL（一覧表示用）
  mask: MaskState;
};

let seq = 0;
const newId = () => `pg${Date.now().toString(36)}${(seq++).toString(36)}`;

function isPdf(f: File): boolean {
  return f.type === "application/pdf" || /\.pdf$/i.test(f.name);
}

function fitScale(w: number, h: number, maxSide: number): number {
  const m = Math.max(w, h);
  return m > maxSide ? maxSide / m : 1;
}

async function bitmapFromCanvas(c: HTMLCanvasElement): Promise<ImageBitmap> {
  return createImageBitmap(c);
}

/** 最長辺を MAX_SIDE に収めた ImageBitmap を返す */
async function normalizeBitmap(src: ImageBitmap): Promise<ImageBitmap> {
  const s = fitScale(src.width, src.height, MAX_SIDE);
  if (s === 1) return src;
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * s);
  c.height = Math.round(src.height * s);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  const out = await bitmapFromCanvas(c);
  src.close();
  return out;
}

function thumbOf(bmp: ImageBitmap): string {
  const s = fitScale(bmp.width, bmp.height, THUMB_SIDE);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

async function makePage(name: string, bmp: ImageBitmap): Promise<PageItem> {
  const bitmap = await normalizeBitmap(bmp);
  return { id: newId(), name, bitmap, width: bitmap.width, height: bitmap.height, thumb: thumbOf(bitmap), mask: EMPTY_MASK };
}

/**
 * 画像のデコード。createImageBitmap は EXIF の向きを既定で反映する（iPhone写真の回転対策）。
 * HEIC はブラウザが復号できる場合のみ通る（iOS Safari は input 経由で JPEG に変換して渡してくる）。
 */
async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    // 一部ブラウザ向けの保険: <img> 経由で復号を試みる
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("decode failed"));
        i.src = url;
      });
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy?: () => void };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* webpackIgnore: true */ PDFJS_URL).then((m: PdfJs) => {
      m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return m;
    });
    pdfjsPromise.catch(() => (pdfjsPromise = null));
  }
  return pdfjsPromise;
}

async function pdfToPages(file: File): Promise<PageItem[]> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: PageItem[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const v1 = page.getViewport({ scale: 1 });
    const scale = MAX_SIDE / Math.max(v1.width, v1.height);
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push(await makePage(`${file.name} p${n}`, await bitmapFromCanvas(c)));
  }
  doc.destroy?.();
  return out;
}

/** ファイル群をページに変換する。読めなかったファイル名は failed に入れて呼び出し側に知らせる */
export async function filesToPages(files: File[]): Promise<{ pages: PageItem[]; failed: string[] }> {
  const pages: PageItem[] = [];
  const failed: string[] = [];
  for (const f of files) {
    try {
      if (isPdf(f)) pages.push(...(await pdfToPages(f)));
      else pages.push(await makePage(f.name, await decodeImage(f)));
    } catch {
      failed.push(f.name);
    }
  }
  return { pages, failed };
}

/**
 * マスクを画像に焼き込んで JPEG にする。API へ渡すのはこの出力だけ。
 * 画像と同じ解像度のキャンバスに元画像→ストロークの順で描くので、塗った部分の画素は残らない。
 */
export async function exportMasked(page: PageItem): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = page.width;
  c.height = page.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(page.bitmap, 0, 0);
  // マスクは別キャンバスに描いてから重ねる（消しゴムの destination-out が画像を抜かないように）
  const m = document.createElement("canvas");
  m.width = page.width;
  m.height = page.height;
  renderStrokes(m.getContext("2d")!, page.mask.strokes, 1);
  ctx.drawImage(m, 0, 0);
  return new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", JPEG_QUALITY)
  );
}

export function releasePage(p: PageItem): void {
  try {
    p.bitmap.close();
  } catch {
    /* 解放済みなら無視 */
  }
}
