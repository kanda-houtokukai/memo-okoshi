// 開発データ（?fixture=1）の入口についての機械テスト（P18・2026-09-30）。
//
// 開発データは画面写真を撮るためのもので、本番の利用者には見せない。
//   - 撮影用のビルド（`npm run build:shoot`＝MEMO_OKOSHI_FIXTURE=1）だけが ?fixture=1 を読み、開発データを組み込む
//   - 本番のビルド（Vercel・`npm run build`）の出力には、開発データのファイルも ?fixture=1 の入口も入らない
// 手元に .next（ビルドの出力）があれば、その中身を実際に調べる（どちらのビルドかは .next/required-server-files.json の env で見分ける）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** 開発データにしか無い文字（入っていれば、開発データが出力に入っている） */
const DATA_MARK = "開発用フィクスチャ";
/** ?fixture=1 の入口のコード */
const ENTRY_MARK = 'get("fixture")';

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

test("開発データは配る場所（public/）に置かず、撮影用のビルドの旗の内側でだけ読み込む", () => {
  assert.ok(!existsSync("public/dev-fixture.json"), "public/ に置くと本番でも配られる");
  assert.ok(existsSync("lib/dev-fixture.json"));
  assert.ok(!filesUnder("public").some((f) => readFileSync(f).includes(DATA_MARK)), "public/ に開発データがある");
  // 旗: ビルド時に "1"/"0" の文字として埋め込む（MEMO_OKOSHI_FIXTURE=1 のときだけ "1"）
  const cfg = readFileSync("next.config.mjs", "utf8");
  assert.ok(cfg.includes('DEV_FIXTURE: process.env.MEMO_OKOSHI_FIXTURE === "1" ? "1" : "0",'));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts["build:shoot"], "MEMO_OKOSHI_FIXTURE=1 next build");
  assert.equal(pkg.scripts.build, "next build", "本番のビルドに旗を立てない");
  // 入口と読み込みは、旗の分岐の中だけ（分岐ごと出力から消えるように）
  const page = readFileSync("app/page.tsx", "utf8");
  const start = page.indexOf('if (process.env.DEV_FIXTURE === "1") {');
  assert.ok(start > 0, "旗の分岐が無い");
  const branch = page.slice(start, page.indexOf("  }, []);", start));
  assert.ok(branch.includes(ENTRY_MARK) && branch.includes('import("@/lib/dev-fixture.json")'));
  assert.equal(page.split(ENTRY_MARK).length, 2, "?fixture=1 を旗の外でも読んでいる");
  assert.ok(!page.includes('fetch("/dev-fixture.json")'), "配られる場所から読んでいる");
  // 開発データを読むのは page.tsx だけ（ほかの画面・API に入口を作らない）
  for (const f of [...filesUnder("app"), "middleware.ts"].filter((f) => /\.(tsx?|mjs)$/.test(f) && f !== join("app", "page.tsx"))) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!src.includes("dev-fixture") && !src.includes("DEV_FIXTURE"), `${f} が開発データに触れている`);
  }
});

test("手元のビルドの出力: 本番のビルドなら開発データと ?fixture=1 の入口が入っていない", (t) => {
  const rsf = ".next/required-server-files.json";
  if (!existsSync(rsf)) {
    t.skip("手元にビルドの出力（.next）が無い");
    return;
  }
  const flag = JSON.parse(readFileSync(rsf, "utf8")).config?.env?.DEV_FIXTURE;
  assert.ok(flag === "0" || flag === "1", `どちらのビルドか分からない（DEV_FIXTURE=${flag}）`);
  // 配られるもの（static）と、画面を組み立てるもの（server/app）
  const files = [...filesUnder(".next/static"), ...filesUnder(".next/server/app"), ...filesUnder(".next/server/chunks")].filter(
    (f) => /\.(js|json|html|rsc)$/.test(f) && statSync(f).size < 5_000_000
  );
  const withData = files.filter((f) => readFileSync(f, "utf8").includes(DATA_MARK));
  const withEntry = files.filter((f) => readFileSync(f, "utf8").includes(ENTRY_MARK));
  if (flag === "0") {
    assert.deepEqual(withData, [], "本番のビルドに開発データが入っている");
    assert.deepEqual(withEntry, [], "本番のビルドに ?fixture=1 の入口が入っている");
  } else {
    // 撮影用のビルド: 入っていること（この検査が実際に見つけられることの確かめにもなる）
    assert.ok(withData.length > 0 && withEntry.length > 0, "撮影用のビルドに開発データか入口が無い");
  }
});
