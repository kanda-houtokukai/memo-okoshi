// P14: ホームの「利用上の注意」（Gemini の無料枠の扱い）。
//
// 見張ること:
//   - 文面は設計側の承認どおり（1文字でも変われば落ちる）
//   - 常に出ているのはリンクの文字だけ。本文は押したときだけ開き、閉じているあいだは画面に無い（原則4）
//   - 初回の自動表示をしない
//   - 閉じ方は3通り（閉じる・Esc・外側を押す）
//   - 閉じている辞書・項目のドロワーは影を出さない（画面の右端に漏れていた）
// ※ 実際の開き閉じ・位置はブラウザで確かめる（台帳の記録 P14）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOTICE } from "../lib/notice-copy.ts";

/* ---------------- ゴールデン（2026-09-23・設計側の承認どおり） ---------------- */
const GOLDEN = {
  link: "利用上の注意",
  title: "利用上の注意",
  paras: [
    "読み取りと振り分けには、GoogleのAI（Gemini）の無料枠を使っています。無料枠に送った内容は、Googleのサービス改善に使われることがあります。Googleの担当者が、アカウントと切り離したうえで目を通す場合もあります。",
    "Googleの規約は、個人情報を無料枠に送らないよう定めています。送られるのは、塗りつぶしたあとの画像です。氏名など個人が分かる語は、送る前に必ず塗りつぶしてください。「伏せる」の画面で塗りつぶせます。",
    "メモや記録の内容は、このアプリのサーバーには保存されません。",
  ],
};

const home = readFileSync("app/components/Home.tsx", "utf8");
const dialog = readFileSync("app/components/NoticeDialog.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("利用上の注意の文面が承認済みのものと一致する", () => {
  assert.equal(NOTICE.link, GOLDEN.link);
  assert.equal(NOTICE.title, GOLDEN.title);
  assert.deepEqual([...NOTICE.paras], GOLDEN.paras);
});

test("常に出ているのはリンクの文字だけ。本文は押したときだけ開き、閉じているあいだは画面に無い（原則4）", () => {
  // ホームは本文を持たない（リンクの文字と、開く部品だけ）
  const h = code(home);
  assert.ok(h.includes("{NOTICE.link}") && !h.includes("NOTICE.paras"), "ホームに本文を置いている");
  for (const p of GOLDEN.paras) assert.ok(!home.includes(p.slice(0, 12)), "ホームに本文を直に書いている");
  // リンクはカードの後ろ（一番下）
  assert.ok(h.indexOf('className="home-notice"') > h.lastIndexOf('className="hcard"'), "リンクがカードより前にある");
  // 閉じているあいだは何も描かない
  assert.ok(/if \(!open\) return null;/.test(code(dialog)), "閉じているあいだも本文を描いている");
  // 初回の自動表示をしない（最初は閉じている・開くのはリンクを押したときだけ・「見た」を保存しない）
  assert.ok(h.includes("useState(false)") && h.includes("onClick={() => setNotice(true)}"));
  assert.equal((h.match(/setNotice\(true\)/g) ?? []).length, 1, "リンク以外から開いている");
  assert.ok(!/localStorage|sessionStorage/.test(h + code(dialog)), "初回だけ出すための記録をしている");
  // リンクは小さく控えめ（--sub）。カードより目立たせない
  const rule = css.match(/\.home-notice\{([^}]*)\}/)?.[1] ?? "";
  assert.ok(rule.includes("color:var(--sub)") && /font-size:\.7\d?rem/.test(rule), "リンクが目立ちすぎる");
});

test("閉じ方は3通り（閉じる・Esc・外側を押す）", () => {
  const d = code(dialog);
  assert.ok(d.includes('className="dlg-ovl on" onClick={onClose}'), "外側を押しても閉じない");
  assert.ok(d.includes("onClick={(e) => e.stopPropagation()}"), "本文を押すと閉じてしまう");
  assert.ok(d.includes('e.key === "Escape"') && d.includes("onClose()"), "Esc で閉じない");
  assert.ok(/<button[^>]*onClick=\{onClose\}[^>]*>\s*\{NOTICE\.close\}/.test(d), "閉じるボタンが無い");
  assert.equal(NOTICE.close, "閉じる");
  // 開いたら閉じるに焦点、閉じたらリンクへ戻す
  assert.ok(d.includes("closeRef.current?.focus()") && home.includes("linkRef.current?.focus()"));
  assert.ok(d.includes('role="dialog"') && d.includes('aria-modal="true"'));
});

test("閉じているドロワーは影を出さない（画面の右端に漏れない）", () => {
  const closed = css.match(/\n\.drawer\{([^}]*)\}/)?.[1] ?? "";
  const opened = css.match(/\n\.drawer\.on\{([^}]*)\}/)?.[1] ?? "";
  assert.ok(closed.includes("box-shadow:none"), "閉じたドロワーに影がある");
  assert.ok(opened.includes("box-shadow:-8px 0 28px"), "開いたドロワーに影が無い");
});
