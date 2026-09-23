// 使い方ページ（/about）の画面写真を撮る。ヘッドレスの Chrome を DevTools の口で操作する（Node の標準機能だけ・npm 依存なし）。
//
// 使い方（本番と同じビルドで撮る。開発サーバーでは左下に Next の開発用の印が写るため）:
//   npm run build && npm run start -- -p 3211        … 別の窓で立ち上げておく
//   node docs/assets/help/shoot.mjs                  … 一覧（SHOTS）の写真をすべて撮る
//   node docs/assets/help/shoot.mjs 02-sheet-maker.png --base http://localhost:3211   … 名前を挙げたものだけ
//
// 撮った写真は docs/assets/help/（原本）に書き、同じ中身を public/help/（配信）にも置く（md5 を表示する）。
// ⚠️ /about は合言葉ゲートの外なので、写真は誰でも見られる。**実データが写っていないことを確かめてから**差し替える（README）。
// ⚠️ ファイル名を変えない（middleware.ts の HELP_SHOTS が1枚ずつ完全一致で通している）。寸法を変えたら lib/about-copy.ts の w/h も直す。
//
// [DECISION 2026-09-23] 撮り方をそろえる（P13）: 表示は 1345×775・倍率1（他の写真と大きさと鮮明さを合わせる）、
//   新しいプロファイル（保存済みの設定が無い既定の状態）、字の読み込みと動きが終わるのを待ち、ホバーとフォーカスを外して撮る。
//   撮り終えたら（失敗しても）Chrome を閉じ、閉じなければ止め、プロファイルを消す。

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "../../../public/help");
const VIEW = { width: 1345, height: 775 };
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * 撮る写真の一覧。**写真を足すときはここに1件足す**（名前＝ファイル名。値＝その画面までたどる手順）。
 * 手順の中では `p`（下の道具）だけを使う。画面をたどるのはボタンを押すなど**利用者と同じ操作**で行い、URL の細工はしない。
 */
const SHOTS = {
  /** ホーム: 4枚のカードと題の下の一文 */
  "01-home.png": async (p) => {
    await p.open("/");
    await p.waitFor(`document.querySelectorAll('.hcard').length === 4 && !!document.querySelector('.hero-sub')`);
  },
  /** 用紙を作る画面: ホームの「用紙を印刷」から。面談を選んだ既定の状態（切り替え・項目のスイッチとつまみ・見本） */
  "02-sheet-maker.png": async (p) => {
    await p.open("/");
    await p.clickUntil(
      `[...document.querySelectorAll('.hcard')].find((b) => b.textContent.includes('用紙を印刷'))`,
      `!!document.querySelector('.pv-inner .paper') && !!document.querySelector('.seg')`
    );
  },
};

/* ---------------- ここから下は道具（写真を足すだけなら触らない） ---------------- */

const args = process.argv.slice(2);
let base = "http://localhost:3211";
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base") base = args[++i];
  else names.push(args[i]);
}
const targets = names.length ? names : Object.keys(SHOTS);
const unknown = targets.filter((n) => !SHOTS[n]);
if (unknown.length) {
  console.error(`知らない写真: ${unknown.join(", ")}（撮れるのは ${Object.keys(SHOTS).join(", ")}）`);
  process.exit(2);
}
try {
  await fetch(base, { redirect: "manual" });
} catch {
  console.error(`${base} につながらない。先に npm run build && npm run start -- -p 3211 で立ち上げる`);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (file) => createHash("md5").update(readFileSync(file)).digest("hex");

/* ---- Chrome を立ち上げる（新しいプロファイル・番号の空いた口） ---- */
const profile = mkdtempSync(join(tmpdir(), "memo-okoshi-shoot-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    `--window-size=${VIEW.width},${VIEW.height}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);
let port = 0;
let stopped = false;
/** Chrome を止めてプロファイルを消す。**どの終わり方でも必ず通る**（成功・失敗・Ctrl+C） */
async function stop() {
  if (stopped) return;
  stopped = true;
  try {
    const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const bws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r, j) => { bws.onopen = r; bws.onerror = j; });
    bws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
  } catch {}
  for (let i = 0; i < 30 && chrome.exitCode === null && chrome.signalCode === null; i++) await sleep(100);
  if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill("SIGKILL");
  rmSync(profile, { recursive: true, force: true });
}
process.on("SIGINT", async () => { await stop(); process.exit(130); });

for (let i = 0; i < 100 && !port; i++) {
  const f = join(profile, "DevToolsActivePort");
  if (existsSync(f)) port = Number(readFileSync(f, "utf8").split("\n")[0]) || 0;
  if (!port) await sleep(100);
}

let ws;
let seq = 0;
const pend = new Map();
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

/** 手順の中で使う道具 */
const p = {
  /** その道を開き、読み込みが終わるまで待つ */
  async open(path) {
    await send("Page.navigate", { url: new URL(path, base).href });
    await p.waitFor(`document.readyState === 'complete'`);
  },
  /** 式が真になるまで待つ（既定 20 秒） */
  async waitFor(expr, ms = 20000) {
    const t = Date.now();
    while (Date.now() - t < ms) {
      if (await evaluate(`!!(${expr})`)) return;
      await sleep(150);
    }
    throw new Error(`待ちきれない: ${expr}`);
  },
  /** 要素を押し、画面が変わるまで押し直す（画面が組み上がる前に押しても効かないため） */
  async clickUntil(elExpr, doneExpr, ms = 20000) {
    const t = Date.now();
    while (Date.now() - t < ms) {
      if (await evaluate(`!!(${doneExpr})`)) return;
      await evaluate(`(${elExpr})?.click(); true`);
      await sleep(400);
    }
    throw new Error(`画面が変わらない: ${doneExpr}`);
  },
};

/** 撮る前に整える: 字の読み込み・動き（終わりのあるもの）を待ち、ホバーとフォーカスを外す */
async function settle() {
  await evaluate(`document.fonts.ready.then(() => true)`);
  await p.waitFor(`[...document.fonts].every((f) => f.status !== 'loading')`);
  await evaluate(`Promise.all(document.getAnimations().filter((a) => {
    const end = a.effect && a.effect.getComputedTiming().endTime; return end !== Infinity; }).map((a) => a.finished.catch(() => {}))).then(() => true)`);
  // 開発サーバーで撮ってしまったときの保険（開発用の印を隠す。本番のビルドには無い）
  await evaluate(`(() => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(s); return true; })()`);
  await evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur(); true`);
  // マウスは画面の右下の角（何も無い地）に置く
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: VIEW.width - 1, y: VIEW.height - 1 });
  await evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`);
  await sleep(300);
}

let failed = false;
try {
  if (!port) throw new Error("Chrome が立ち上がらない");
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const w = m.id && pend.get(m.id);
    if (!w) return;
    pend.delete(m.id);
    m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { ...VIEW, deviceScaleFactor: 1, mobile: false });
  // スクロールバーを写さない（縦に長い画面を撮るときのため）。
  // ※ 右端の約15px が少し暗いのは、画面の外に控えている辞書のドロワーの影で、画面そのものの見え方（2026-09-11 の写真にもある）
  await send("Emulation.setScrollbarsHidden", { hidden: true });

  for (const name of targets) {
    await SHOTS[name](p);
    await settle();
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const png = Buffer.from(shot.data, "base64");
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    if (w !== VIEW.width || h !== VIEW.height) throw new Error(`${name}: 寸法が ${w}×${h}（${VIEW.width}×${VIEW.height} のはず）`);
    const origin = join(HERE, name);
    const served = join(PUBLIC_DIR, name);
    writeFileSync(origin, png);
    copyFileSync(origin, served); // 配信は原本と同じ中身（無加工）
    console.log(`${name}  ${w}×${h}  原本 ${md5(origin)}  配信 ${md5(served)}`);
  }
} catch (e) {
  failed = true;
  console.error(String(e?.message ?? e));
} finally {
  try { ws?.close(); } catch {}
  await stop();
}
console.log(`Chrome: ${chrome.exitCode !== null || chrome.signalCode !== null ? "止めた" : "止まっていない"}・プロファイル: ${existsSync(profile) ? "残っている" : "消した"}`);
process.exit(failed ? 1 : 0);
