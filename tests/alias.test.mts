// 人名の置き換え記号（lib/alias.ts）と、まとめ置き換え（lib/record.ts の resolveRedWhere）のテスト。
//
// 記録として使えるためには「同じ名前＝同じ記号／違う名前＝違う記号」が絶対条件なので、ここで固定する。
// 対応表は画面の中だけに持つ（原則5）ことも、ソースの機械検査で守る。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aliasFor, aliasOf, letterAt, nameKey, seedAliases, splitHonorific, type AliasMap } from "../lib/alias.ts";
import { resolveRedWhere, type RecordState, type Token } from "../lib/record.ts";

test("敬称を切り出す（無ければ空）", () => {
  assert.deepEqual(splitHonorific("そうたくん"), { core: "そうた", honorific: "くん" });
  assert.deepEqual(splitHonorific("田中さん"), { core: "田中", honorific: "さん" });
  assert.deepEqual(splitHonorific("田中先生"), { core: "田中", honorific: "先生" });
  assert.deepEqual(splitHonorific("山田課長"), { core: "山田", honorific: "課長" });
  assert.deepEqual(splitHonorific("佐藤ちゃん"), { core: "佐藤", honorific: "ちゃん" });
  assert.deepEqual(splitHonorific("鈴木さま"), { core: "鈴木", honorific: "さま" });
  assert.deepEqual(splitHonorific("Y君"), { core: "Y", honorific: "君" });
  assert.deepEqual(splitHonorific("田中"), { core: "田中", honorific: "" });
});

test("敬称が引き継がれる", () => {
  let m: AliasMap = {};
  const a = aliasFor(m, "そうたくん");
  assert.equal(a.alias, "A君");
  m = a.map;
  assert.equal(aliasFor(m, "田中さん").alias, "Bさん");
  assert.equal(aliasFor(aliasFor(m, "田中さん").map, "山田課長").alias, "C課長");
  // 敬称が無ければ記号だけ（元に無い敬称を足さない）
  assert.equal(aliasFor({}, "田中").alias, "A");
});

test("同じ名前には常に同じ記号／違う名前には違う記号", () => {
  let m: AliasMap = {};
  const a1 = aliasFor(m, "そうたくん");
  m = a1.map;
  const a2 = aliasFor(m, "そうたくん"); // 2回目
  assert.equal(a2.alias, a1.alias);
  assert.equal(a2.map, m, "同じ名前では対応表を増やさない");
  // 敬称が違っても同じ人（芯が同じ）なら同じ記号。敬称は元の語のものが付く
  assert.equal(aliasFor(m, "そうた君").alias, "A君");
  assert.equal(aliasFor({}, "鈴木さま").alias, "A様", "敬称の表記は記録の形に揃える");
  assert.equal(aliasFor(m, "そうた").alias, "A");
  // 違う名前は違う記号
  const b = aliasFor(m, "田中さん");
  assert.equal(b.alias, "Bさん");
  const c = aliasFor(b.map, "佐藤さん");
  assert.equal(c.alias, "Cさん");
  assert.deepEqual(Object.values(c.map).sort(), ["A", "B", "C"]);
});

test("空白の違いは同じ人として扱う／27人目からは AA", () => {
  assert.equal(nameKey("田中 由美さん"), "田中由美");
  assert.equal(nameKey("田中由美"), "田中由美");
  assert.equal(letterAt(0), "A");
  assert.equal(letterAt(25), "Z");
  assert.equal(letterAt(26), "AA");
  assert.equal(letterAt(27), "AB");
  let m: AliasMap = {};
  for (let i = 0; i < 27; i++) m = aliasFor(m, `名前${i}さん`).map;
  assert.equal(aliasOf(m, "名前26さん"), "AAさん");
});

/** 赤トークンだけの最小の状態 */
function stateWith(names: string[][]): RecordState {
  const tokens: Record<string, Token[]> = {};
  names.forEach((list, i) => {
    tokens["s" + i] = list.map((s) => ({ t: "r", s }) as Token);
  });
  return { tokens, enabled: {}, order: Object.keys(tokens), spill: [], insights: [] };
}

test("まとめ置き換え: 同じ名前の赤だけが同じ記号になる", () => {
  const st = stateWith([["そうたくん", "田中さん"], ["そうた君", "そうたくん"]]);
  const m = aliasFor({}, "そうたくん").map;
  const r = resolveRedWhere(
    st,
    (tk) => nameKey(tk.s) === "そうた",
    (tk) => aliasFor(m, tk.s).alias
  );
  assert.equal(r.count, 3);
  assert.deepEqual(r.state.tokens.s0.map((t) => [t.s, !!t.resolved]), [["A君", true], ["田中さん", false]]);
  assert.deepEqual(r.state.tokens.s1.map((t) => [t.s, !!t.resolved]), [["A君", true], ["A君", true]]);
  // 元の状態は変えない
  assert.equal(st.tokens.s0[0].s, "そうたくん");
});

test("まとめ置き換えは未解決の赤だけに効く（解決済み・黄青は触らない）", () => {
  const st: RecordState = {
    tokens: {
      a: [
        { t: "r", s: "田中さん", resolved: true },
        { t: "y", s: "田中さん" },
        { t: "b", s: "田中さん" },
        { t: "p", s: "田中さん" },
        { t: "r", s: "田中さん" },
      ],
    },
    enabled: {},
    order: ["a"],
    spill: [],
    insights: [],
  };
  const r = resolveRedWhere(st, () => true, () => "Aさん");
  assert.equal(r.count, 1);
  assert.deepEqual(r.state.tokens.a.map((t) => t.s), ["田中さん", "田中さん", "田中さん", "田中さん", "Aさん"]);
});

test("記号は記録に出てくる順に振る（押した順ではない）", () => {
  const m = seedAliases(["田中", "そうたくん", "山田先生", "そうた君"]);
  assert.deepEqual(m, { 田中: "A", そうた: "B", 山田: "C" });
  assert.equal(aliasOf(m, "そうたくん"), "B君");
  assert.equal(aliasOf(m, "山田先生"), "C先生");
  assert.equal(aliasOf(m, "鈴木さん"), null, "まだ出てきていない名前は空");
});

test("対応表は画面の中だけ — 保存も通信もしない", () => {
  const src = readFileSync("lib/alias.ts", "utf8");
  for (const bad of ["fetch(", "localStorage", "sessionStorage", "document.cookie", "XMLHttpRequest", "navigator.send"]) {
    assert.ok(!src.includes(bad), `lib/alias.ts に ${bad} があってはいけない`);
  }
  // 送信を組み立てる場所（変換API呼び出し）が対応表に触れていないこと
  const page = readFileSync("app/page.tsx", "utf8");
  assert.ok(!page.includes("alias"), "app/page.tsx（送信を組み立てる場所）は対応表を知らない");
  const api = readFileSync("app/api/convert/route.ts", "utf8");
  assert.ok(!api.includes("alias"), "変換APIは対応表を受け取らない");
  // 対応表を持つのは Review だけ（画面の状態）
  const review = readFileSync("app/components/Review.tsx", "utf8");
  assert.ok(review.includes("useState<AliasMap>"), "対応表は Review の state として持つ");
  // 保存・送信を行う行に対応表が混ざっていないこと（辞書の保存や通信に流し込まない）
  for (const line of review.split("\n")) {
    if (!/alias/i.test(line)) continue;
    for (const sink of ["saveVocab(", "localStorage", "fetch(", "FormData", "addEntry("]) {
      assert.ok(!line.includes(sink), `対応表を ${sink} に渡している行がある → ${line.trim()}`);
    }
  }
});
