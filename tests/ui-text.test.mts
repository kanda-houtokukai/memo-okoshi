// P6-b（2026-09-09）の文言についての機械テスト。
// - 画面に出る文字列に「黒塗り」が残っていないこと（コード内の識別子・コメントは対象外）
// - 辞書の例示（VOCAB_EXAMPLES）が「登録できる正しい語」であり、人名ガードに触れないこと

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { addEntry, looksLikePersonName, MAX_GLOSS, MAX_TERM, VOCAB_EXAMPLES } from "../lib/vocab.ts";

/** // 行コメントと /* *​/ ブロックコメントを落とす（文字列中の // は含まないので単純除去で足りる） */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("画面の文言に「黒塗り」を残さない（工程名は「伏せる」）", () => {
  for (const f of sources("app")) {
    const body = stripComments(readFileSync(f, "utf8"));
    assert.ok(!body.includes("黒塗り"), `${f} に画面文言としての「黒塗り」が残っている`);
  }
  const header = readFileSync("app/components/StepHeader.tsx", "utf8");
  assert.ok(header.includes('label: "伏せる"'), "ステップ表示が「伏せる」になっていること");
  // 識別子は据え置き（無用な差分を増やさないという判断が守られていること）
  assert.ok(header.includes('key: "mask"'), "Step の識別子 mask は変えない");
});

test("辞書の例示は表示専用だが、登録できる正しい語であること", () => {
  assert.ok(VOCAB_EXAMPLES.length >= 2 && VOCAB_EXAMPLES.length <= 3, "例示は2〜3件");
  let list = [] as { term: string; gloss?: string }[];
  for (const e of VOCAB_EXAMPLES) {
    assert.equal(looksLikePersonName(e.term), false, e.term);
    assert.ok(e.term.length <= MAX_TERM && (e.gloss ?? "").length <= MAX_GLOSS, e.term);
    const r = addEntry(list, e);
    assert.equal(r.ok, true, `${e.term} は辞書に登録できる形であること（重複も不可）`);
    list = r.list;
  }
});

test("辞書ドロワーは空のときだけ例示を出す（登録が1件でもあれば出さない）", () => {
  const src = readFileSync("app/components/VocabDrawer.tsx", "utf8");
  assert.ok(src.includes("list.length === 0 && ("), "例示の出し分けは list.length === 0 の条件で行う");
  assert.ok(/placeholder="サビ管"/.test(src), "プレースホルダーは具体例");
});
