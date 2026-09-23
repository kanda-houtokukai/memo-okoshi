// P15（2026-09-23）: 原則3を「赤は伏せ忘れの知らせ（面談・会議とも）」に改めた。
//   送った画像に残った人名を赤で知らせる。置き換えは求めない。赤は1件ずつ確認するまで完成できない。
//
// 見張ること:
//   - 赤は「確認した」（語はそのまま）か「書き換える」で1件ずつ外れる
//   - 確認していない赤が残る間は、完成・その項目のコピー・✎（文章を直す）を押せない
//   - 抜け道（✎ を開いて何も変えずに確定すると赤が消える）が塞がっている
//   - 塗りつぶした箇所の「〇〇」は赤にならない（面談・会議とも）・会議でも赤が付く
//   - 「辞書に追加」から、その記録で赤になった語（人名）が入らない
//   - 記号・「担当」への置き換えが画面に無い

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  counts,
  fromApi,
  isDoneBlocked,
  isEditBlocked,
  isSectionCopyBlocked,
  redTerms,
  resolveToken,
  saveEdit,
  sectionCopyText,
  type ApiData,
  type RecordState,
} from "../lib/record.ts";
import { enforceNames } from "../lib/names.ts";
import { buildPrompt } from "../lib/prompt.ts";
import { ITEM_LIBRARY, MEETING_LIBRARY } from "../lib/items.ts";
import { addEntry, nameBlockedBy } from "../lib/vocab.ts";

const en = (lib: typeof ITEM_LIBRARY) => Object.fromEntries(lib.map((l) => [l.id, true]));
const ids = (lib: typeof ITEM_LIBRARY) => lib.map((l) => l.id);

/** 面談の記録: 「申し送り」に赤「田中」、「概要」に赤「山田 花子さん」 */
function interview(): RecordState {
  const data: ApiData = {
    sections: [
      { id: "gaiyou", tokens: [{ t: "p", s: "同席：母（" }, { t: "r", s: "山田 花子さん" }, { t: "p", s: "）" }] },
      { id: "moushiokuri", tokens: [{ t: "p", s: "次回は" }, { t: "r", s: "田中" }, { t: "p", s: "ワーカーへ共有する。" }] },
      { id: "honnin", tokens: [{ t: "p", s: "朝は少し不安。" }] },
    ],
    spill: [],
    insights: [],
  };
  return fromApi(data, ITEM_LIBRARY, en(ITEM_LIBRARY), ids(ITEM_LIBRARY));
}

test("赤は「確認した」（語はそのまま）で1件ずつ外れ、残る間は完成・項目コピー・✎ を止める", () => {
  let s = interview();
  assert.equal(counts(s).r, 2);
  assert.equal(isDoneBlocked(s), true);
  assert.equal(isSectionCopyBlocked(s.tokens.moushiokuri), true);
  assert.equal(sectionCopyText(s, "moushiokuri"), null);
  assert.equal(isEditBlocked(s.tokens.moushiokuri), true, "未確認の赤がある項目は ✎ を押せない");
  assert.equal(isEditBlocked(s.tokens.honnin), false, "赤の無い項目は直せる");
  // 1件目を「確認した」→ まだ1件残るので完成は止まったまま
  s = resolveToken(s, "moushiokuri", 1, null);
  assert.equal(counts(s).r, 1);
  assert.equal(isDoneBlocked(s), true);
  assert.equal(isEditBlocked(s.tokens.moushiokuri), false, "確認した項目は直せる");
  assert.ok(sectionCopyText(s, "moushiokuri")!.includes("田中ワーカー"), "確認した語はそのまま残る");
  // 2件目を「書き換える」→ 赤が無くなり完成できる
  s = resolveToken(s, "gaiyou", 1, "山田 花子さん（母）");
  assert.equal(counts(s).r, 0);
  assert.equal(isDoneBlocked(s), false);
});

test("抜け道の再現: 未確認の赤がある項目を ✎ で開き、何も変えずに確定しても赤は消えない", () => {
  const s = interview();
  const before = s.tokens.moushiokuri;
  const after = saveEdit(s, "moushiokuri", "次回は田中ワーカーへ共有する。");
  assert.equal(after.tokens.moushiokuri, before, "確定を受け付けて赤を普通の文に溶かした");
  assert.equal(counts(after).r, 2);
  assert.equal(isDoneBlocked(after), true);
  // 赤の無い項目・確認したあとの項目は直せる
  assert.deepEqual(saveEdit(s, "honnin", "朝は不安そう。").tokens.honnin, [{ t: "p", s: "朝は不安そう。" }]);
  const ok = resolveToken(s, "moushiokuri", 1, null);
  assert.deepEqual(saveEdit(ok, "moushiokuri", "直した").tokens.moushiokuri, [{ t: "p", s: "直した" }]);
  // 画面: ✎ は未確認の赤がある間は押せない（SectionCard が isEditBlocked を見る）
  const card = readFileSync("app/components/SectionCard.tsx", "utf8");
  assert.ok(card.includes("const editBlocked = isEditBlocked(tokens)") && card.includes("disabled={editBlocked}"));
});

test("塗りつぶした箇所の「〇〇」は赤にならない（面談・会議とも）。会議でも人名は赤になる", () => {
  const data = (): ApiData => ({
    sections: [
      { id: "gaiyou", tokens: [{ t: "p", s: "同席：母（〇〇さん）担当：〇〇 次回 ○○君の件は◯◯Wと共有" }] },
      { id: "kaigi", tokens: [{ t: "p", s: "出席者：〇〇さん、〇〇W、" }, { t: "p", s: "佐藤 太郎さん" }] },
    ],
    spill: [],
    insights: [],
  });
  const out = enforceNames(data());
  const reds = out.sections.flatMap((s) => s.tokens.filter((t) => t.t === "r").map((t) => t.s));
  assert.deepEqual(reds, ["佐藤 太郎さん"], "〇〇 を赤にした／塗り残しの名前を拾わない");
  // 会議の記録でも、AIの r と機械検出の r は赤のまま（落とさない）
  const m = fromApi(out, MEETING_LIBRARY, en(MEETING_LIBRARY), ids(MEETING_LIBRARY), "meeting");
  assert.equal(counts(m).r, 1);
  // プロンプト: 面談・会議とも、塗った箇所は「〇〇」と書き、r にしない
  for (const type of ["interview", "meeting"] as const) {
    const p = buildPrompt(type === "meeting" ? MEETING_LIBRARY : ITEM_LIBRARY.filter((l) => l.defaultOn), [], type);
    assert.ok(p.includes("**塗りつぶした箇所**") && p.includes("中を推測せず「〇〇」と書く"), `${type}: 塗った箇所の規則がない`);
    assert.ok(p.includes('「〇〇」は "r" にも "y" にもせず "p" のまま'), `${type}: 〇〇 を赤にしない規則がない`);
    assert.ok(!p.includes("〇〇はまず人名を疑う"), `${type}: 〇〇 を人名と疑う旧い規則が残っている`);
  }
});

test("「辞書に追加」から、その記録で赤になった語（人名）が入らない", () => {
  const s = interview();
  const reds = redTerms(s);
  assert.deepEqual(reds.sort(), ["山田 花子さん", "田中"].sort());
  // 同じ語・姓や名だけ・それを含む語は弾く（既存の「人名らしき語は辞書に入れません」）
  for (const term of ["田中", "山田", "花子", "山田花子", "田中W"]) {
    const r = addEntry([], { term }, reds);
    assert.equal(r.ok, false, `${term} が辞書に入った`);
    assert.equal(r.reason, "name");
  }
  // 関係の無い語は入る
  assert.equal(addEntry([], { term: "個支計" }, reds).ok, true);
  // 書き換えたあとも、元の赤の語で弾く（最初の変換結果を渡す）
  const rewritten = resolveToken(s, "moushiokuri", 1, "担当ワーカー");
  assert.ok(nameBlockedBy("田中", redTerms(rewritten, s)));
  // 塗った箇所の「〇〇」は弾く対象にしない
  assert.ok(!redTerms({ ...s, tokens: { x: [{ t: "r", s: "〇〇さん" }] } }).length);
  // 画面: 黄の「辞書に追加」は、この記録の赤の語を渡して登録する
  const rv = readFileSync("app/components/Review.tsx", "utf8");
  assert.ok(rv.includes("addEntry(loadVocab(), { term: val ?? tk.s }, redTerms(rec, initial))"));
});

test("記号・「担当」への置き換えが画面に無い。完成の文言は「完成（赤の確認が必要）」", () => {
  const dir = "app/components";
  for (const f of readdirSync(dir)) {
    const src = readFileSync(join(dir, f), "utf8").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/に置き換える|「担当」|aliasFor|lib\/alias/.test(src), `${f} に旧い置き換えが残っている`);
  }
  const rv = readFileSync("app/components/Review.tsx", "utf8");
  assert.ok(rv.includes('"完成（赤の確認が必要）"') && !rv.includes("人名の対応が必要"));
});
