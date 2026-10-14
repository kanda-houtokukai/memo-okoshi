// P26 「〇〇」の保険: 利用者が塗っていないのに出た〇〇を、機械で黄にする（lib/oo-guard.ts・lib/mask.ts の countClusters）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OO_TEXT, countOO, guardOO } from "../lib/oo-guard.ts";
import { countClusters } from "../lib/mask.ts";
import { ITEM_LIBRARY } from "../lib/items.ts";
import { buildOutputText, counts, fromApi, mergeReconvert, recordEntries, type ApiData } from "../lib/record.ts";

const data = (tokens: ApiData["sections"][number]["tokens"], extra: Partial<ApiData> = {}): ApiData => ({
  sections: [{ id: "honnin", tokens }],
  spill: [],
  insights: [],
  ...extra,
});
const enabled = Object.fromEntries(ITEM_LIBRARY.map((l) => [l.id, l.defaultOn]));
const order = ITEM_LIBRARY.map((l) => l.id);

test("塗りが0のメモで〇〇が出たら黄になる（文字は変えない・候補は出さない）", () => {
  const d = data([{ t: "p", s: "〇〇は自己管理、飲み忘れ週1〜2" }]);
  const g = guardOO(d, 0);
  assert.deepEqual(g.sections[0].tokens, [
    { t: "y", s: "〇〇", cands: [], oo: true },
    { t: "p", s: "は自己管理、飲み忘れ週1〜2" },
  ]);
  const a = fromApi(d, ITEM_LIBRARY, enabled, order);
  const b = fromApi(g, ITEM_LIBRARY, enabled, order);
  assert.equal(counts(b).y, counts(a).y + 1, "要確認の読取が1つ増える（完成の前に気づける）");
  assert.equal(buildOutputText(b, ITEM_LIBRARY), buildOutputText(a, ITEM_LIBRARY), "転記用テキストの文は同じ");
  assert.deepEqual(recordEntries(b, ITEM_LIBRARY), recordEntries(a, ITEM_LIBRARY), "Word・PDF の文も同じ");
});

test("塗りのまとまりの数と〇〇の数が同じなら黄にしない（少なくても）", () => {
  const d = data([{ t: "p", s: "本人＋母（〇〇さん）同席。担当：〇〇" }]);
  assert.equal(countOO(d), 2);
  assert.equal(guardOO(d, 2), d, "同じ数ならそのまま");
  assert.equal(guardOO(d, 3), d, "塗りのほうが多くてもそのまま");
  assert.equal(guardOO(data([{ t: "p", s: "〇のない文" }]), 0).sections[0].tokens.length, 1);
});

test("〇〇の数が塗りより多いとき、その返答の〇〇をすべて黄にする（p・b の中は切り出す・y は印だけ・r は赤のまま）", () => {
  const d = data([
    { t: "p", s: "職員〇〇さんと相性が良い。出発を〇〇分早める" },
    { t: "b", s: "期限〇〇/〇〇まで", note: "推定" },
    { t: "y", s: "〇〇日", cands: ["10日"] },
    { t: "r", s: "〇〇W" },
  ]);
  assert.equal(countOO(d), 6);
  const g = guardOO(d, 2);
  const ys = g.sections[0].tokens.filter((t) => t.t === "y");
  assert.deepEqual(
    ys.map((t) => [t.s, t.oo]),
    [["〇〇", true], ["〇〇", true], ["〇〇", true], ["〇〇", true], ["〇〇日", true]]
  );
  assert.deepEqual(g.sections[0].tokens.find((t) => t.t === "r"), { t: "r", s: "〇〇W" }, "赤は黄より強いので赤のまま");
  assert.ok(g.sections[0].tokens.filter((t) => t.t === "b").every((t) => t.note === "推定"), "青の注は残す");
  const join = (x: ApiData) => x.sections[0].tokens.map((t) => t.s).join("");
  assert.equal(join(g), join(d), "文字は1字も変えない");
});

test("数えるのは項目とこぼれ。気づきの〇〇は数えない", () => {
  const d = data([{ t: "p", s: "〇〇さん同席" }], { spill: [{ text: "〇〇分早める", suggest: null }], insights: [{ text: "〇〇さんとの関係", why: "w", refs: [] }] });
  assert.equal(countOO(d), 2);
  assert.ok(guardOO(d, 1).sections[0].tokens.some((t) => t.oo), "こぼれの〇〇も数に入る");
});

test("再変換の返答にも効き、取り込んだあとも黄の印が残る", () => {
  const base = fromApi(data([{ t: "p", s: "本人の様子" }]), ITEM_LIBRARY, { ...enabled, kinsen: true }, order);
  const re: ApiData = { sections: [{ id: "kinsen", tokens: [{ t: "p", s: "小遣い月〇〇円" }] }], spill: [], insights: [] };
  const merged = mergeReconvert(base, guardOO(re, 0), ITEM_LIBRARY);
  assert.ok(merged.tokens.kinsen.some((t) => t.t === "y" && t.oo));
});

test("塗りのまとまりを数える（縦・横・斜めでつながる升は1つ・1升の太らせで2升までの隙間はつなぐ・消した升は数えない）", () => {
  const grid = (rows: string[]) => ({ g: rows.join("").split("").map((c) => (c === "#" ? 1 : 0)), w: rows[0].length, h: rows.length });
  const n = (rows: string[], r = 1) => {
    const { g, w, h } = grid(rows);
    return countClusters(g, w, h, r);
  };
  assert.equal(n(["......", "......"]), 0);
  assert.equal(n(["##.....", "##.....", ".......", ".......", ".....##"]), 2, "離れた塗りは別のまとまり");
  assert.equal(n(["##.##.", "......"]), 1, "1升の隙間はつなぐ（同じ名前を何筆かで塗った）");
  assert.equal(n(["##..##", "......"]), 1, "2升の隙間もつなぐ");
  assert.equal(n(["##...##", "......."]), 2, "3升あけば別");
  assert.equal(n(["#.....", ".#....", "..#..."], 0), 1, "斜めもつながる");
  assert.equal(n(["##...##"], 0), 2, "太らせなければ隙間で分かれる");
});

test("塗りのまとまりの数は送らない・保存しない（原則5）。面談・会議・見学のどれにも、初回と再変換の両方に効かせる", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const send = page.slice(page.indexOf("async function callConvert"), page.indexOf('await fetch("/api/convert"'));
  assert.ok(!/fd\.append\([^)]*clusters/.test(send), "FormData に入れない");
  assert.ok(!/clusters/.test(send.slice(send.indexOf("const fd"))), "送る中身を作る部分に出てこない");
  assert.ok(page.includes("guardOO({ ...(json.data as ApiData), emergency: json.tier === \"emergency\" }, clusters)"), "返答ごとに保険をかける（種類・段で分けない）");
  assert.ok(page.includes("callConvert(out, s.order.filter((id) => s.enabled[id]), type, nClusters)"), "初回");
  assert.ok(page.includes("callConvert(blobs.current, itemIds, type, clusters.current)"), "再変換");
  assert.ok(page.includes("clusters.current = 0;"), "結果を捨てたら数も捨てる");
  for (const f of ["app/page.tsx", "lib/pages.ts", "lib/oo-guard.ts", "lib/mask.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(src.replace(/\/\/.*$/gm, "")) || f === "app/page.tsx", `${f} は端末に保存しない`);
  }
  assert.ok(!/localStorage[^;]*cluster/i.test(page), "画面も数を保存しない");
  const route = readFileSync("app/api/convert/route.ts", "utf8");
  assert.ok(!/cluster|oo-guard/.test(route), "サーバーは塗りの数を知らない");
  assert.ok(!readFileSync("lib/pages.ts", "utf8").includes("fetch("), "数える部分はネットに出ない");
});

test("黄を押したときの一文は設計側の文面のまま・候補と「辞書に追加」は出さない", () => {
  assert.equal(OO_TEXT, "塗っていない箇所が「〇〇」になっている可能性があります。元のメモを確かめてください。");
  const pop = readFileSync("app/components/Popover.tsx", "utf8");
  assert.ok(pop.includes("{token.oo && <div className=\"pd\">{OO_TEXT}</div>}"));
  assert.ok(pop.includes("{!token.oo && candidatesFor(token).map("), "候補は出さない");
  assert.ok(pop.includes("{!token.oo && (\n            <label className=\"pop-chk\">"), "辞書に追加は出さない");
  assert.ok(pop.includes("直して確定") && pop.includes("このままで確定する"), "確定・書き直しは既存の黄と同じ");
  // 使い方ページの文面は変えない（黄の説明に含まれる）
  assert.ok(!readFileSync("lib/about-copy.ts", "utf8").includes("〇〇」になっている"));
});
