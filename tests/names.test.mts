// 人名検知の保険（lib/names.ts）のテスト — 原則3「赤マーカーは強制」の二重防御

import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceNames, findNames, splitNameTokens } from "../lib/names.ts";

test("敬称付きの氏名を検出する（境界あり）", () => {
  assert.deepEqual(findNames("同席：母（山田 花子さん）").map((h) => h.name), ["山田 花子さん"]);
  assert.deepEqual(findNames("担当 佐藤氏 と共有").map((h) => h.name), ["佐藤氏"]);
  assert.deepEqual(findNames("鈴木様より電話").map((h) => h.name), ["鈴木様"]);
  assert.deepEqual(findNames("・田中くんが").map((h) => h.name), ["田中くん"]);
});

test("続柄・役割語・伏せ字は検出しない（誤検知の抑制）", () => {
  for (const s of ["お母さんより", "利用者さんの様子", "お子さんの発言", "皆さんで確認", "〇〇さん（年中）", "職員さんに相談", "先生に伝える"]) {
    assert.deepEqual(findNames(s), [], s);
  }
});

test("p トークンの中の氏名を独立した r トークンに切り出す", () => {
  const out = splitNameTokens({ t: "p", s: "同席：母（山田 花子さん）。本人は" });
  assert.deepEqual(out.map((t) => [t.t, t.s]), [
    ["p", "同席：母（"],
    ["r", "山田 花子さん"],
    ["p", "）。本人は"],
  ]);
});

test("既に r のトークン・解決済みトークンは触らない", () => {
  const r = { t: "r" as const, s: "田中 由美さん" };
  assert.deepEqual(splitNameTokens(r), [r]);
  const done = { t: "p" as const, s: "山田 花子さん", resolved: true };
  assert.deepEqual(splitNameTokens(done), [done]);
});

test("enforceNames は sections 全体に適用され、赤が 0 件のまま通らない", () => {
  const data = { sections: [{ id: "gaiyou", tokens: [{ t: "p" as const, s: "同席：母（山田 花子さん）" }] }], spill: [], insights: [] };
  const out = enforceNames(data);
  assert.equal(out.sections[0].tokens.filter((t) => t.t === "r").length, 1);
});
