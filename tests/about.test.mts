// 使い方ページ（/about）についての機械テスト。
// 1) 文面は docs/mock/tsukaikata-mock-v1.html（凍結）にある文言だけでできていること
//    → 「勝手に書き換えない」を守り、同時に**モックに無い語（法人名・施設名など）が混ざらない**ことも守る。
//      /about は合言葉ゲートの外に出しているので、この2つは同じ1つの保証で担保する。
// 2) ゲートの外に出す道は完全一致のリストだけで、想定した6本から増えていないこと。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** 行コメントとブロックコメントを落とす（説明用の日本語は検査対象外） */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** タグを落として日本語の地の文だけにする（空白は全部落として比較用にする） */
function mockText(): string {
  const html = readFileSync("docs/mock/tsukaikata-mock-v1.html", "utf8");
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\s+/g, "");
}

const JP = /[ぁ-んァ-ヶ一-龥々ー、。「」・（）]{6,}/g;

test("使い方ページの文面はモックにある文言だけでできている", () => {
  const mock = mockText();
  for (const f of ["app/about/page.tsx", "app/about/CloseButton.tsx"]) {
    const src = stripComments(readFileSync(f, "utf8")).replace(/\s+/g, "");
    for (const run of src.match(JP) ?? []) {
      assert.ok(mock.includes(run), `${f}: モックに無い文言が入っている → ${run}`);
    }
  }
});

test("使い方ページはモックの見出しと注意書きを落としていない", () => {
  const src = readFileSync("app/about/page.tsx", "utf8");
  for (const must of [
    "手書きのメモを、記録の下書きに",
    "使う場面",
    "5つの工程",
    "確認画面の印",
    "このアプリで完結しないこと",
    "出てくるのは下書きです",
    "伏せ忘れは自分の目で確かめてください",
    "AIの気づきは参考です",
    "閉じると消えます",
    "辞書に人名は入れないでください",
  ]) {
    assert.ok(src.includes(must), `使い方ページに「${must}」が無い`);
  }
});

test("合言葉ゲートの外に出す道は、決めたものだけ（前方一致にしない）", () => {
  const src = readFileSync("middleware.ts", "utf8");
  const block = src.slice(src.indexOf("const PUBLIC"), src.indexOf("]);"));
  const paths = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  // 使い方ページ・マニフェスト・アイコンだけ。いずれも静的で秘密を含まない。
  assert.deepEqual(paths, [
    "/gate",
    "/api/gate",
    "/about",
    "/manifest.webmanifest",
    "/icon-16.png",
    "/icon-32.png",
    "/icon-48.png",
    "/icon-192.png",
    "/icon-512.png",
    "/apple-touch-icon.png",
  ]);
  assert.ok(src.includes("PUBLIC.has(path)"), "完全一致（Set.has）で判定していること");
  assert.ok(!src.includes('path.startsWith("/about'), "前方一致で開けない");
  // ゲート本体（未認証は /gate へ・API は 401）が生きていること
  assert.ok(src.includes('new NextResponse("unauthorized", { status: 401 })'));
  assert.ok(src.includes('NextResponse.redirect(new URL("/gate", req.url))'));
});
