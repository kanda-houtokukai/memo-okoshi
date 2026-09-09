// アプリアイコンとマニフェストの機械テスト。
// 原本（docs/assets/memo-okoshi-icon-src.png）は設計側が生成したもので**加工しない**。
// public/ の各サイズは原本を縮めただけであること（＝正方形・宣言どおりの寸法）を確かめる。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

/** PNG の IHDR から寸法を読む（依存を増やさない） */
function pngSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  assert.equal(b.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${path} は PNG でない`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test("アイコンは宣言どおりの寸法で正方形", () => {
  const want: [string, number][] = [
    ["public/icon-16.png", 16],
    ["public/icon-32.png", 32],
    ["public/icon-48.png", 48],
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
    ["public/apple-touch-icon.png", 180],
  ];
  for (const [f, n] of want) {
    const { w, h } = pngSize(f);
    assert.equal(w, n, f);
    assert.equal(h, n, `${f} は正方形であること`);
  }
  const src = pngSize("docs/assets/memo-okoshi-icon-src.png");
  assert.equal(src.w, src.h, "原本も正方形");
  assert.ok(src.w >= 512, "原本は512px以上（各サイズはここから縮める）");
  assert.ok(statSync("docs/assets/memo-okoshi-icon-src.png").size > 0);
});

test("layout がすべてのアイコンとマニフェストを宣言している", () => {
  const s = readFileSync("app/layout.tsx", "utf8");
  for (const u of [
    "/icon-16.png",
    "/icon-32.png",
    "/icon-48.png",
    "/icon-192.png",
    "/icon-512.png",
    "/apple-touch-icon.png",
    "/manifest.webmanifest",
  ]) {
    assert.ok(s.includes(u), `layout に ${u} の宣言が無い`);
  }
  assert.ok(s.includes('title: "メモおこし"'), "ホーム画面のアプリ名");
});

test("マニフェストは standalone・アプリ名は「メモおこし」・Service Worker は使わない", () => {
  const s = readFileSync("app/manifest.ts", "utf8");
  assert.ok(s.includes('display: "standalone"'));
  assert.ok(s.includes('name: "メモおこし"'));
  assert.ok(s.includes('short_name: "メモおこし"'));
  assert.ok(s.includes('start_url: "/"'));
  assert.ok(!s.includes("serviceWorker") && !s.includes("sw.js"), "Service Worker は入れない");
});
