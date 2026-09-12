// P8-e: 用紙を作る画面の見本を、表示領域に収まる最大の大きさにする。
//
// 見本は基準の幅で作った A4 の縮尺模型を丸ごと拡大・縮小するだけ（中の比率も印刷も変えない）。
// ここでは「はみ出さない最大」「幅と高さの両方を見る」「2枚のときの並べ方」「印刷に持ち込まない」を見張る。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PREVIEW, previewFit } from "../lib/sheet.ts";

const W = PREVIEW.baseW;
const H = (PREVIEW.baseW * 297) / 210;
const GAP = 16;
/** 用紙の節（画面）と、その印刷の節。globals.css には他の画面の @media print もあるので、節の見出しで切る */
const sheetCss = (css: string) => css.slice(css.indexOf("/* ---------- 用紙を作る"), css.indexOf("/* ---------- 印刷（PDFで保存）"));
const printCss = (css: string) => css.slice(css.indexOf("/* ---------- 印刷（PDFで保存）"));

test("1枚: 幅と高さの両方を見て、はみ出さない最大の倍率（A4の縦横比のまま）", () => {
  for (const [w, h] of [[720, 780], [1400, 920], [351, 600], [700, 300], [200, 1000], [740, 180]]) {
    const { k, side } = previewFit(w, h, 1, GAP);
    assert.equal(side, false);
    assert.ok(W * k <= w && H * k <= h, `${w}×${h}: はみ出す（k=${k}）`);
    // 0.002 大きくすると、幅か高さのどちらかがはみ出す＝これが最大
    assert.ok(W * (k + 0.002) > w || H * (k + 0.002) > h, `${w}×${h}: まだ大きくできる（k=${k}）`);
  }
  // 横長の領域では高さで、縦長の領域では幅で決まる
  assert.equal(previewFit(1400, 551, 1, GAP).k, Math.floor((551 / H) * 1000) / 1000);
  assert.equal(previewFit(351, 900, 1, GAP).k, Math.floor((351 / W) * 1000) / 1000);
});

test("倍率は固定値ではなく、表示領域の寸法で変わる", () => {
  const ks = [300, 500, 700, 900].map((h) => previewFit(2000, h, 1, GAP).k);
  assert.deepEqual([...ks].sort((a, b) => a - b), ks);
  assert.equal(new Set(ks).size, ks.length, "高さを変えても倍率が変わらない");
  const kw = [200, 300, 360].map((w) => previewFit(w, 2000, 1, GAP).k);
  assert.equal(new Set(kw).size, kw.length, "幅を変えても倍率が変わらない");
});

test("2枚: 横に並べても縦に重ねるより大きくできるなら横並び、そうでなければ縦に重ねて2枚目の頭を覗かせる", () => {
  // 広い画面: 2枚とも一度に見える
  const wide = previewFit(1400, 920, 2, GAP);
  assert.equal(wide.side, true);
  assert.ok(2 * W * wide.k + GAP <= 1400 && H * wide.k <= 920, "横並びではみ出す");
  // ノートPC: 横に並べると小さくなりすぎるので縦。1枚目は収まり、2枚目の頭が覗く
  const laptop = previewFit(720, 780, 2, GAP);
  assert.equal(laptop.side, false);
  assert.ok(W * laptop.k <= 720);
  assert.ok(H * laptop.k + GAP + PREVIEW.peek <= 780, "2枚目の頭が見えない");
  assert.ok(laptop.k > previewFit(720, 780, 1, GAP).k * 0.9, "2枚目のために1枚目を小さくしすぎている");
  // スマホ（幅で決まる）: 縦に重ねる
  const phone = previewFit(351, 600, 2, GAP);
  assert.equal(phone.side, false);
  assert.ok(W * phone.k <= 351);
  // どちらを選んでも、選ばなかった並べ方より小さくはならない
  for (const [w, h] of [[1400, 920], [720, 780], [351, 600], [1000, 500], [900, 900]]) {
    const f = previewFit(w, h, 2, GAP);
    const side = Math.min((w - GAP) / (2 * W), h / H);
    const stack = Math.min(w / W, (h - GAP - PREVIEW.peek) / H);
    assert.ok(f.k >= Math.floor(Math.max(side, stack) * 1000) / 1000 - 1e-9, `${w}×${h}`);
  }
});

test("CSS: 見本は印刷と同じ mm の値で描き、倍率 --k を基準の幅に掛ける。紙は A4 の縦横比（P8-e）", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const screen = sheetCss(css);
  const paper = screen.match(/\.paper\{[^}]*\}/)?.[0] ?? "";
  assert.ok(paper.includes(`--pw:calc(${PREVIEW.baseW}px * var(--k,1))`), "基準の幅が PREVIEW.baseW と食い違う");
  assert.ok(paper.includes("height:calc(297 * var(--mm))") && paper.includes("aspect-ratio:210/297"), "A4の縦横比を保つ");
  assert.ok(paper.includes("padding:calc(9 * var(--mm))"), "余白は印刷の @page と同じ 9mm");
  assert.equal((css.match(/--pw:/g) ?? []).length, 1, "基準の幅を上書きしている所がある");
  assert.ok(!/zoom/.test(screen + printCss(css)), "見本も印刷も zoom は使わない（寸法は --mm で拡大・縮小する）");
});

test("見本の寸法は印刷の規則と1対1（mm の値が同じ）。印刷の側は変えない（P8-e）", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const screen = sheetCss(css);
  const print = printCss(css);
  const rule = (src: string, sel: string) => {
    const m = src.match(new RegExp("(?:^|\\n)\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}"));
    assert.ok(m, `${sel} の規則が無い`);
    return m![1];
  };
  // [セレクタ, 性質, mm の値…]
  const same: [string, string, ...string[]][] = [
    [".p-head", "padding-bottom", "2"],
    [".p-head", "margin-bottom", "2.4"],
    [".p-title", "margin-bottom", "2"],
    [".p-fields", "gap", "2.6", "6"],
    [".p-fields .lb", "padding-bottom", "1"],
    [".p-fields .cel", "width", "7"],
    [".p-fields .cel", "height", "7"],
    [".p-fields .cel.y", "width", "13"],
    [".p-fields .u", "padding-bottom", "1"],
    [".p-fields .wr", "height", "8"],
    [".p-grid", "gap", "2.4"],
    [".p-box h4", "padding", "0.8", "1.6"],
    [".p-lines", "padding", "1", "1.6", "1.2"],
    [".p-lines div", "height", "6"],
    [".p-box.other", "margin-top", "2.4"],
    [".p-foot", "margin-top", "1.2"],
    [".p-foot", "padding-top", "0.8"],
  ];
  for (const [sel, prop, ...mm] of same) {
    const want = mm.map((v) => `calc(${v} * var(--mm))`).join(" ");
    assert.ok(rule(screen, sel).includes(`${prop}:${want}`), `見本 ${sel} ${prop} が ${want} でない`);
    const printed = mm.map((v) => `${v}mm`).join(" ");
    assert.ok(rule(print, ".print-sheet " + sel).includes(`${prop}:${printed}`), `印刷 ${sel} ${prop} が ${printed} でない`);
  }
  // 文字の大きさ: 印刷の pt を mm に直した値（1pt = 25.4/72 mm）
  for (const [sel, pt] of [[".p-title", 12], [".p-fields", 8], [".p-box h4", 8.5], [".p-foot", 6]] as const) {
    const m = rule(screen, sel).match(/font-size:calc\(([\d.]+) \* var\(--mm\)\)/);
    assert.ok(m && Math.abs(Number(m[1]) - (pt * 25.4) / 72) < 0.002, `見本 ${sel} の文字が印刷の ${pt}pt と違う`);
    assert.ok(rule(print, ".print-sheet " + sel).includes(`font-size:${pt}pt`), `印刷 ${sel} の文字が変わった`);
  }
  // 印刷の用紙そのものは現行のまま
  assert.ok(print.includes("height:279mm") && print.includes("@page{size:A4 portrait;margin:9mm}"));
  assert.ok(print.includes(".print-sheet .p-lines div{height:6mm;border-bottom:0.2mm dotted #bdbdbd}"));
  // 印刷が上書きしない値は px に --k を掛ける（印刷の複製には --k が無いので元の px のまま）
  assert.ok(rule(screen, ".p-fields .f").includes("gap:calc(3px * var(--k,1))"));
  assert.ok(rule(screen, ".p-box h4").includes("gap:calc(5px * var(--k,1))"));
  // 画面の見本だけ、枠と見出しの線は場所を取らない（最低1pxの線が罫線を押し出さない）。印刷は .pv の外なので従来の線
  assert.ok(rule(screen, ".pv .p-box").includes("border:none") && rule(screen, ".pv .p-box").includes("outline:"));
  assert.ok(rule(screen, ".pv .p-box h4").includes("border-bottom:none"));
  assert.ok(rule(print, ".print-sheet .p-box").includes("border:0.25mm solid #444"));
  // 余白は影が見える程度・スクロールバーで幅が揺れない
  const pv = rule(screen, ".pv");
  assert.ok(pv.includes("padding:12px") && pv.includes("scrollbar-gutter:stable"));
});

test("画面側: 表示領域の寸法から倍率を出し、印刷の複製には持ち込まない（P8-e）", () => {
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  assert.ok(src.includes("new ResizeObserver(measure)"), "領域の寸法が変わるたびに測り直す");
  assert.ok(src.includes("previewFit("), "倍率の決め方は lib/sheet.ts に置く");
  assert.ok(/ref=\{pvRef\}[\s\S]{0,200}\["--k" as string\]: fit\.k/.test(src), "倍率は .pv に置く");
  assert.ok(!/className="pv-inner"[^>]*style/.test(src), "印刷が複製する .pv-inner に倍率を置かない");
});
