// P6 のテスト: 再変換マージ（項目6）・Word生成（項目9）・辞書バックアップ（項目9-b）

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEM_LIBRARY } from "../lib/items.ts";
import { buildOutputText, fromApi, mergeReconvert, pendingReconvertIds, recordEntries, resolveToken, saveEdit, toggleItem, type ApiData, type RecordState } from "../lib/record.ts";
import { buildDocxParts, cleanText, extractText } from "../lib/docx.ts";
import { mergeBackup } from "../lib/vocab.ts";

const INSIGHT_CANARY = "INSIGHT_LEAK_CANARY";
const SPILL_CANARY = "SPILL_LEAK_CANARY";

function base(): RecordState {
  const enabled: Record<string, boolean> = {};
  ITEM_LIBRARY.forEach((l) => (enabled[l.id] = l.defaultOn));
  const data: ApiData = {
    sections: [
      { id: "gaiyou", tokens: [{ t: "p", s: "初回の概要" }] },
      { id: "honnin", tokens: [{ t: "y", s: "作業所", cands: ["作業書"] }] },
      { id: "kazoku", tokens: [] },
      { id: "shokan", tokens: [] },
      { id: "kadai", tokens: [] },
      { id: "moushiokuri", tokens: [{ t: "r", s: "田中W" }] },
    ],
    spill: [{ text: "服薬の飲み忘れの話", suggest: "kenko" }, { text: "受け皿のない内容", suggest: null }],
    insights: [{ text: INSIGHT_CANARY, why: "w", refs: [] }],
  };
  return fromApi(data, ITEM_LIBRARY, enabled, ITEM_LIBRARY.map((l) => l.id));
}

/* ---------- 項目6: 再変換 ---------- */

test("再変換: 追加してオンにした空の項目だけが pending になる", () => {
  let s = base();
  assert.deepEqual(pendingReconvertIds(s), []);
  s = toggleItem(s, "kenko", ITEM_LIBRARY).state;
  assert.deepEqual(pendingReconvertIds(s), ["kenko"]);
});

test("再変換: 人が直した項目・解決済みマーカーは上書きされず、新しい項目だけ埋まる", () => {
  let s = base();
  s = resolveToken(s, "honnin", 0, "作業書"); // 黄を解決
  s = saveEdit(s, "gaiyou", "手で直した概要"); // 手直し
  s = toggleItem(s, "kenko", ITEM_LIBRARY).state;
  const again: ApiData = {
    sections: [
      { id: "gaiyou", tokens: [{ t: "p", s: "AIが出し直した概要（無視されるべき）" }] },
      { id: "honnin", tokens: [{ t: "y", s: "作業所", cands: ["作業書"] }] },
      { id: "kenko", tokens: [{ t: "p", s: "服薬の飲み忘れの話" }] },
      { id: "moushiokuri", tokens: [{ t: "r", s: "田中W" }] },
    ],
    spill: [{ text: "服薬の飲み忘れの話", suggest: "kenko" }, { text: "受け皿のない内容", suggest: null }, { text: "新しいこぼれ", suggest: null }],
    insights: [{ text: "新しい気づき", why: "w", refs: [] }],
  };
  const m = mergeReconvert(s, again, ITEM_LIBRARY);
  assert.equal(m.tokens.gaiyou[0].s, "手で直した概要", "手直しが上書きされた");
  assert.equal(m.tokens.honnin[0].resolved, true, "解決済みマーカーが戻された");
  assert.equal(m.tokens.honnin[0].s, "作業書");
  assert.equal(m.tokens.kenko[0].s, "服薬の飲み忘れの話", "追加項目が埋まっていない");
  assert.deepEqual(pendingReconvertIds(m), []);
  assert.ok(m.converted?.includes("kenko"));
});

test("再変換: こぼれは二重化しない（埋まった項目へ移った分は取り下げ・既存/本文と同じ新規は足さない）", () => {
  let s = toggleItem(base(), "kenko", ITEM_LIBRARY).state;
  const again: ApiData = {
    sections: [{ id: "kenko", tokens: [{ t: "p", s: "服薬の飲み忘れの話" }] }],
    spill: [{ text: "服薬の飲み忘れの話", suggest: "kenko" }, { text: "受け皿のない内容", suggest: null }, { text: "新しいこぼれ", suggest: null }],
    insights: [],
  };
  const m = mergeReconvert(s, again, ITEM_LIBRARY);
  const texts = m.spill.map((x) => x.text);
  assert.ok(!texts.includes("服薬の飲み忘れの話"), "項目に入った内容がこぼれに残った");
  assert.equal(texts.filter((t) => t === "受け皿のない内容").length, 1, "既存のこぼれが二重化した");
  assert.ok(texts.includes("新しいこぼれ"));
});

test("再変換: 転記テキストに気づきは混入しない（不変条件1は再変換後も維持）", () => {
  const s = toggleItem(base(), "kenko", ITEM_LIBRARY).state;
  const m = mergeReconvert(s, { sections: [{ id: "kenko", tokens: [{ t: "p", s: "x" }] }], spill: [{ text: SPILL_CANARY, suggest: null }], insights: [{ text: INSIGHT_CANARY, why: "w", refs: [] }] }, ITEM_LIBRARY);
  const out = buildOutputText(m, ITEM_LIBRARY);
  assert.ok(!out.includes(INSIGHT_CANARY) && !out.includes(SPILL_CANARY));
});

/* ---------- 項目9: Word ---------- */

test("Word: 生成物に insights / spill が含まれない（不変条件1をファイル出力にも適用）", () => {
  const s = base();
  const parts = buildDocxParts(recordEntries(s, ITEM_LIBRARY), new Date(2026, 8, 8));
  const all = Object.values(parts).join("\n");
  assert.ok(!all.includes(INSIGHT_CANARY));
  assert.ok(!all.includes("服薬の飲み忘れの話"), "こぼれの内容が混入した");
  assert.ok(!all.includes("受け皿のない内容"));
  assert.ok(all.includes("初回の概要"));
  assert.ok(all.includes("面談概要"));
});

test("Word: 本文に不可視文字が無く、改行は段落分割で表される（コピペ耐性）", () => {
  const entries = [
    { label: "本人の発言・様子", text: "【家での様子】\n・朝は不安​\n・園の話をする­\tタブ" },
    { label: "課題・変化", text: "行1\r\n行2" },
  ];
  const parts = buildDocxParts(entries, new Date(2026, 8, 8));
  const doc = parts["word/document.xml"];
  assert.ok(!/[​-‍⁠﻿­]/.test(doc), "不可視文字が残っている");
  assert.ok(!/\t/.test(extractText(doc)), "タブが残っている");
  assert.ok(!/<w:br\/>/.test(doc), "ソフト改行を使っている");
  const text = extractText(doc);
  assert.ok(text.includes("【家での様子】\n・朝は不安\n・園の話をする"), "改行が段落として残っていない\n" + text);
  assert.ok(text.includes("行1\n行2"));
  // 段落は <w:p><w:r>[<w:rPr>]<w:t> の素直な構造だけ
  const paras = doc.match(/<w:p>[\s\S]*?<\/w:p>/g) ?? [];
  assert.ok(paras.length >= 6);
  for (const p of paras) assert.ok(/^<w:p><w:r>(<w:rPr><w:b\/><\/w:rPr>)?<w:t xml:space="preserve">[\s\S]*<\/w:t><\/w:r><\/w:p>$/.test(p), "複雑な段落構造: " + p.slice(0, 80));
});

test("Word: XML の特殊文字はエスケープされ、フォントは游ゴシック・サイズ指定なし", () => {
  const parts = buildDocxParts([{ label: "A<B", text: "x & y \"z\"" }], new Date(2026, 8, 8));
  assert.ok(parts["word/document.xml"].includes("A&lt;B"));
  assert.ok(parts["word/document.xml"].includes("x &amp; y &quot;z&quot;"));
  assert.ok(parts["word/styles.xml"].includes('w:eastAsia="游ゴシック"'));
  assert.ok(!/<w:sz /.test(parts["word/document.xml"] + parts["word/styles.xml"]), "文字サイズを指定している（Word既定に任せる）");
  assert.equal(cleanText("a​b﻿c"), "abc");
});

/* ---------- 項目9-b: 辞書バックアップ ---------- */

test("バックアップ読み込み: 追記・重複除外・人名ガード・項目設定", () => {
  const cur = [{ term: "GH", gloss: "グループホーム" }];
  const ids = ITEM_LIBRARY.map((l) => l.id);
  const r = mergeBackup({ app: "memo-okoshi", version: 1, exported: "x", vocab: [{ term: "GH" }, { term: "相支", gloss: "相談支援" }, { term: "山田さん" }], items: { enabled: ["gaiyou", "kenko", "存在しない"], order: ["kenko", "gaiyou"] } }, cur, ids);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.vocab.map((v) => v.term), ["GH", "相支"]);
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 2);
  assert.deepEqual(r.items, { enabled: ["gaiyou", "kenko"], order: ["kenko", "gaiyou"] });
  assert.equal(mergeBackup({ foo: 1 }, cur, ids).ok, false);
  assert.equal(mergeBackup("x", cur, ids).ok, false);
});

test("編集欄は内容に合わせて伸びる（上限と下限がある）", () => {
  // 元のメモと突き合わせて直す作業なので、開いた時点で全文が見えている必要がある。
  const css = readFileSync("app/globals.css", "utf8");
  const rule = css.slice(css.indexOf(".sec-body textarea{max-height"));
  assert.ok(/max-height:60vh/.test(rule), "上限（画面の高さの6割）がある");
  assert.ok(/overflow:auto/.test(rule), "上限を超えたときだけ中がスクロールする");
  assert.ok(/min-height:5\.5em/.test(css), "下限がある（短い内容で潰れない）");

  const src = readFileSync("app/components/SectionCard.tsx", "utf8");
  assert.ok(src.includes("el.scrollHeight"), "高さは内容の高さに合わせる");
  assert.ok(src.includes("useLayoutEffect"), "開いた直後（描画前）に合わせる");
  assert.ok(/onChange=\{\(e\) => \{[\s\S]*?fitHeight\(\);/.test(src), "入力中も伸びる");
});
