// 組織語彙の辞書（lib/vocab.ts）とプロンプト差し込み（lib/prompt.ts）のテスト

import { test } from "node:test";
import assert from "node:assert/strict";
import { addEntry, looksLikePersonName, removeEntry, sanitizeForPrompt, updateEntry, MAX_ENTRIES } from "../lib/vocab.ts";
import { buildPrompt } from "../lib/prompt.ts";
import { ITEM_LIBRARY } from "../lib/items.ts";

test("敬称で終わる語は人名とみなして登録しない", () => {
  for (const t of ["田中さん", "山田 様", "佐藤くん", "鈴木ちゃん", "高橋氏", "伊藤さま"]) {
    assert.equal(looksLikePersonName(t), true, t);
    assert.equal(addEntry([], { term: t }).ok, false, t);
    assert.equal(addEntry([], { term: t }).reason, "name");
  }
  assert.equal(looksLikePersonName("GH"), false);
  assert.equal(looksLikePersonName("相支"), false);
});

test("追加・重複・空・上限", () => {
  let r = addEntry([], { term: " GH ", gloss: " グループホーム " });
  assert.equal(r.ok, true);
  assert.deepEqual(r.list, [{ term: "GH", gloss: "グループホーム" }]);
  r = addEntry(r.list, { term: "GH" });
  assert.equal(r.reason, "dup");
  r = addEntry(r.list, { term: "   " });
  assert.equal(r.reason, "empty");
  const full = Array.from({ length: MAX_ENTRIES }, (_, i) => ({ term: "t" + i }));
  assert.equal(addEntry(full, { term: "x" }).reason, "full");
});

test("編集は自分以外との重複だけを弾き、削除は index で外す", () => {
  const list = [{ term: "GH" }, { term: "相支" }];
  assert.equal(updateEntry(list, 0, { term: "GH", gloss: "グループホーム" }).ok, true);
  assert.equal(updateEntry(list, 0, { term: "相支" }).reason, "dup");
  assert.equal(updateEntry(list, 1, { term: "山田さん" }).reason, "name");
  assert.deepEqual(removeEntry(list, 0), [{ term: "相支" }]);
});

test("サーバー側の sanitize: 型崩れ・人名・重複・上限を落とし、保存はしない純関数", () => {
  const out = sanitizeForPrompt([
    { term: "GH", gloss: "グループホーム" },
    { term: "GH" },
    { term: "田中さん" },
    "文字列",
    null,
    { term: "  " },
    { term: "x".repeat(100), gloss: "y".repeat(100) },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { term: "GH", gloss: "グループホーム" });
  assert.equal(out[1].term.length, 40);
  assert.deepEqual(sanitizeForPrompt("not array"), []);
});

test("プロンプト: 辞書が空なら語彙の節を出さず、あれば語と『補わない』指示を含む", () => {
  const items = ITEM_LIBRARY.filter((l) => l.defaultOn);
  const empty = buildPrompt(items, []);
  assert.ok(!empty.includes("組織の語彙"));
  const withVocab = buildPrompt(items, [{ term: "GH", gloss: "グループホーム" }, { term: "相支" }]);
  assert.ok(withVocab.includes("組織の語彙"));
  assert.ok(withVocab.includes("「GH」＝ グループホーム"));
  assert.ok(withVocab.includes("「相支」"));
  assert.ok(withVocab.includes("補ってはいけない"), "書かれていない語を辞書から補わない指示が要る");
  assert.ok(withVocab.includes("人名は含まれていない"));
});
