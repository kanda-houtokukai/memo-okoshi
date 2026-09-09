// アプリアイコンとマニフェストの機械テスト。
// 原本（docs/assets/*.png）は設計側が生成したもので**加工しない**。public/ の各サイズは原本を縮めただけ。
//
// [DECISION 2026-09-09] **大小で別デザイン**を使う:
//   - 16px・32px … memo-okoshi-icon-small-src.png（橙地・白い紙・濃紺の線。小さくても判別できる）
//   - 48px以上（48/180/192/512）… memo-okoshi-icon-src.png（紙の質感のある本来のデザイン）
//   原本の md5 をここに控える。差し替えるときはこの表と一緒に直すこと（＝どちらから作ったかを見失わない）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

/** PNG の IHDR から寸法を読む（依存を増やさない） */
function pngSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  assert.equal(b.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${path} は PNG でない`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const md5 = (path: string) => createHash("md5").update(readFileSync(path)).digest("hex");

test("原本は2枚あり、どちらも無加工のまま（md5を控えてある）", () => {
  const SRC = {
    "docs/assets/memo-okoshi-icon-src.png": "8619619d9f593137a6eaf9ca6d0bb3c6", // 48px以上のもと
    "docs/assets/memo-okoshi-icon-small-src.png": "e9118a891deebd5529a73ebeabb21826", // 16/32px のもと
  };
  for (const [f, hash] of Object.entries(SRC)) {
    assert.equal(md5(f), hash, `${f} が差し替わっている（加工したか、別の画像になっている）`);
    const { w, h } = pngSize(f);
    assert.equal(w, h, `${f} は正方形`);
    assert.ok(w >= 512, `${f} は512px以上`);
  }
});

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
