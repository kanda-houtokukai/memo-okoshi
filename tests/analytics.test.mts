// 利用状況の計測（Vercel Web Analytics）についての機械テスト（P19・2026-09-30）。
//
//   - 読み込むのは Vercel の production のビルドだけ（手元・撮影用・プレビューのビルドには入らない）
//   - 合言葉ゲートの外に出すのは /_vercel/insights/ の道だけ（ほかの道は開けない）
//   - 送る前に URL のクエリとハッシュを落とす
// 手元に .next（ビルドの出力）があれば、その中身も調べる（どちらのビルドかは .next/required-server-files.json の env で見分ける）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ANALYTICS_INIT, ANALYTICS_SRC } from "../lib/analytics.ts";

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

test("解析の読み込みは本番のビルドの旗の内側だけ（npm の依存は増やさない）", () => {
  const cfg = readFileSync("next.config.mjs", "utf8");
  assert.ok(cfg.includes('ANALYTICS: process.env.VERCEL_ENV === "production" ? "1" : "0"'), "旗が production 以外でも立つ");
  const layout = readFileSync("app/layout.tsx", "utf8");
  const start = layout.indexOf('{process.env.ANALYTICS === "1" && (');
  assert.ok(start > 0, "旗の分岐が無い");
  const branch = layout.slice(start, layout.indexOf(")}", start));
  assert.ok(branch.includes("__html: ANALYTICS_INIT") && branch.includes("<script defer src={ANALYTICS_SRC} />"));
  // 初期化は script より前（beforeSend を先に積む）
  assert.ok(branch.indexOf("ANALYTICS_INIT") < branch.indexOf("ANALYTICS_SRC"));
  assert.equal(layout.split("ANALYTICS_SRC").length, 3, "旗の外でも読み込んでいる（import と分岐の中の2か所だけ）");
  assert.equal(ANALYTICS_SRC, "/_vercel/insights/script.js");
  // npm の依存を増やさない（@vercel/analytics を入れない）
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["next", "react", "react-dom"]);
});

test("送る前に URL のクエリとハッシュを落とす（読めない URL は送らない）", () => {
  const w: Record<string, unknown> = {};
  new Function("window", ANALYTICS_INIT)(w);
  const q = w.vaq as unknown[][];
  assert.equal(q.length, 1);
  assert.equal(q[0][0], "beforeSend");
  const send = q[0][1] as (e: { type: string; url: string }) => { type: string; url: string } | null;
  assert.deepEqual(send({ type: "pageview", url: "https://memookoshi.fknd.jp/?fixture=1#x" }), { type: "pageview", url: "https://memookoshi.fknd.jp/" });
  assert.deepEqual(send({ type: "pageview", url: "https://memookoshi.fknd.jp/about?a=1&b=2" }), { type: "pageview", url: "https://memookoshi.fknd.jp/about" });
  assert.deepEqual(send({ type: "pageview", url: "https://memookoshi.fknd.jp/yomimono/memo" }), { type: "pageview", url: "https://memookoshi.fknd.jp/yomimono/memo" });
  assert.equal(send({ type: "pageview", url: "not a url" }), null);
});

test("送信に付く Referer もオリジンだけ（ページの URL のクエリを渡さない）", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.ok(layout.includes('referrer: "strict-origin",'), "参照元の扱いがオリジンだけになっていない");
});

test("ゲートの外に開けた道は /_vercel/insights/ だけ（ミドルウェアを通さない道の一覧）", () => {
  const mw = readFileSync("middleware.ts", "utf8");
  assert.ok(mw.includes('matcher: ["/((?!_next/|_vercel/insights/|favicon.ico|robots.txt).*)"]'));
  const m = mw.match(/matcher: \["\/\(\(\?!([^)]*)\)\.\*\)"\]/);
  assert.ok(m, "matcher を読めない");
  assert.deepEqual(m![1].split("|"), ["_next/", "_vercel/insights/", "favicon.ico", "robots.txt"]);
  // 完全一致の一覧（PUBLIC）には足していない
  const block = mw.slice(mw.indexOf("const PUBLIC"), mw.indexOf("]);", mw.indexOf("const PUBLIC")));
  assert.ok(!block.includes("_vercel"));
});

test("手元のビルドの出力: 本番以外のビルドには解析の読み込みが入っていない", (t) => {
  const rsf = ".next/required-server-files.json";
  if (!existsSync(rsf)) {
    t.skip("手元にビルドの出力（.next）が無い");
    return;
  }
  const flag = JSON.parse(readFileSync(rsf, "utf8")).config?.env?.ANALYTICS;
  assert.ok(flag === "0" || flag === "1", `どちらのビルドか分からない（ANALYTICS=${flag}）`);
  const html = filesUnder(".next/server/app").filter((f) => f.endsWith(".html"));
  assert.ok(html.length > 0, "組み立て済みのページが無い");
  const withScript = html.filter((f) => readFileSync(f, "utf8").includes(ANALYTICS_SRC));
  if (flag === "0") assert.deepEqual(withScript, [], "本番以外のビルドに解析の読み込みが入っている");
  else assert.equal(withScript.length, html.length, "本番のビルドなのに解析の読み込みが無いページがある");
});
