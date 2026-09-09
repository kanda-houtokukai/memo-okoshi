// 不変条件の機械テスト（依存追加なし: node --test / Node標準の型ストリップで実行）
//
//   不変条件1: 転記用テキスト・項目コピーは insights / spill に一切触れない
//              （記録と助言を混ぜない = 公式文書への混入防止）
//   不変条件2: 未解決の赤（人名）が1つでもあれば、完成も項目コピーもブロックされる
//
// 実行: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEM_LIBRARY } from "../lib/items.ts";
import {
  acceptSpill,
  buildOutputText,
  counts,
  fromApi,
  isDoneBlocked,
  isSectionCopyBlocked,
  moveSpillTo,
  outputWarnings,
  resolveToken,
  sectionCopyText,
  toggleItem,
  type ApiData,
  type RecordState,
} from "../lib/record.ts";

const INSIGHT_CANARY = "INSIGHT_LEAK_CANARY_気づきが混入している";
const SPILL_CANARY = "SPILL_LEAK_CANARY_こぼれが混入している";
const WHY_CANARY = "WHY_LEAK_CANARY_なぜそう見るか";

function baseState(): RecordState {
  const enabled: Record<string, boolean> = {};
  ITEM_LIBRARY.forEach((l) => (enabled[l.id] = l.defaultOn));
  return {
    tokens: {
      gaiyou: [{ t: "p", s: "8月17日、自宅にてモニタリング面談を実施。" }],
      honnin: [
        { t: "p", s: "「夜眠れない」との発言あり。" },
        { t: "y", s: "作業所", cands: ["作業所", "作業書"] },
      ],
      kazoku: [{ t: "b", s: "母", note: "位置から推定" }],
      shokan: [],
      kadai: [{ t: "p", s: "昼食を食べられていない日がある。" }],
      moushiokuri: [
        { t: "p", s: "次回日程を調整する。" },
        { t: "r", s: "田中" },
        { t: "p", s: "ワーカーへ共有する。" },
      ],
    },
    enabled,
    order: ITEM_LIBRARY.map((l) => l.id),
    spill: [{ text: SPILL_CANARY, sug: "kenko" }],
    insights: [{ s: INSIGHT_CANARY, why: WHY_CANARY, refs: ["kenko", "honnin"] }],
  };
}

/* ============ 不変条件1: 記録と助言を混ぜない ============ */

test("不変条件1: 転記用テキストに insights / spill が混入しない", () => {
  const s = baseState();
  const out = buildOutputText(s, ITEM_LIBRARY);
  assert.ok(!out.includes(INSIGHT_CANARY), "気づきの本文が混入した");
  assert.ok(!out.includes(WHY_CANARY), "気づきのwhyが混入した");
  assert.ok(!out.includes(SPILL_CANARY), "こぼれの本文が混入した");
  // 記録側は確かに出ていること（空振りテストでないことの担保）
  assert.ok(out.includes("8月17日、自宅にてモニタリング面談を実施。"));
  assert.ok(out.includes("■ 次回への申し送り"));
});

test("不変条件1: 項目コピーにも insights / spill が混入しない", () => {
  const s = baseState();
  for (const id of Object.keys(s.tokens)) {
    const text = sectionCopyText(s, id);
    if (text === null) continue;
    assert.ok(!text.includes(INSIGHT_CANARY), `${id} に気づきが混入した`);
    assert.ok(!text.includes(WHY_CANARY), `${id} にwhyが混入した`);
    assert.ok(!text.includes(SPILL_CANARY), `${id} にこぼれが混入した`);
  }
});

test("不変条件1: 項目をオフにして降格した内容は転記テキストから消える", () => {
  const s = baseState();
  const { state, demoted } = toggleItem(s, "kadai", ITEM_LIBRARY);
  assert.equal(demoted, true, "内容のある項目をオフにしたら降格するはず");
  const out = buildOutputText(state, ITEM_LIBRARY);
  assert.ok(!out.includes("昼食を食べられていない日がある。"), "オフ項目の内容が転記に残った");
  assert.ok(!out.includes("■ 課題・変化"), "オフ項目の見出しが残った");
  // 降格先（こぼれ枠）には残っている = 黙って捨てていない
  assert.ok(state.spill.some((sp) => sp.text.includes("昼食を食べられていない日がある。")));
});

test("不変条件1: こぼれを項目へ移した後は記録扱いになり、こぼれ枠からは消える", () => {
  const s = baseState();
  const moved = acceptSpill(s, 0, ITEM_LIBRARY);
  assert.equal(moved.spill.length, 0);
  const out = buildOutputText(moved, ITEM_LIBRARY);
  assert.ok(out.includes(SPILL_CANARY), "項目へ移した内容は記録として出るはず");
  // 気づきは移動後も一切混入しない
  assert.ok(!out.includes(INSIGHT_CANARY));
  assert.ok(!out.includes(WHY_CANARY));
});

test("不変条件1: 気づきが何件あっても転記テキストは変わらない", () => {
  const s = baseState();
  const before = buildOutputText(s, ITEM_LIBRARY);
  const many: RecordState = {
    ...s,
    insights: [
      { s: INSIGHT_CANARY, why: WHY_CANARY, refs: ["honnin"] },
      { s: "別の気づき", why: "別のwhy", refs: [] },
      { s: "さらに別の気づき", why: "さらに別のwhy", refs: ["kadai", "moushiokuri"] },
    ],
  };
  assert.equal(buildOutputText(many, ITEM_LIBRARY), before);
});

/* ============ 不変条件2: 赤（人名）が残る間はブロック ============ */

test("不変条件2: 未解決の赤があると完成がブロックされる", () => {
  const s = baseState();
  assert.equal(counts(s).r, 1);
  assert.equal(isDoneBlocked(s), true);
});

test("不変条件2: 未解決の赤がある項目はコピーできない", () => {
  const s = baseState();
  assert.equal(isSectionCopyBlocked(s.tokens.moushiokuri), true);
  assert.equal(sectionCopyText(s, "moushiokuri"), null, "赤が残る項目のコピーが通ってしまった");
});

test("不変条件2: 赤を解消すると完成・コピーの両方が解ける", () => {
  const s = resolveToken(baseState(), "moushiokuri", 1, "担当");
  assert.equal(counts(s).r, 0);
  assert.equal(isDoneBlocked(s), false);
  assert.equal(sectionCopyText(s, "moushiokuri"), "次回日程を調整する。担当ワーカーへ共有する。");
});

test("不変条件2: 他項目の赤は完成をブロックするが、赤のない項目のコピーは妨げない", () => {
  const s = baseState();
  assert.equal(isDoneBlocked(s), true, "どこかに赤があれば完成はブロック");
  assert.equal(sectionCopyText(s, "gaiyou"), "8月17日、自宅にてモニタリング面談を実施。");
});

test("不変条件2: 黄・青だけなら完成はブロックされない（警告のみ）", () => {
  const s = resolveToken(baseState(), "moushiokuri", 1, "担当");
  assert.equal(isDoneBlocked(s), false);
  assert.ok(counts(s).y + counts(s).b > 0);
  assert.ok(outputWarnings(s).some((w) => w.startsWith("未確認")));
});

test("不変条件2: 表示していない（オフの）項目に残る赤は完成をブロックしない", () => {
  const s = baseState();
  const { state } = toggleItem(s, "moushiokuri", ITEM_LIBRARY);
  assert.equal(counts(state).r, 0);
  assert.equal(isDoneBlocked(state), false);
});

/* ============ こぼれの拾い上げ（suggest が null の場合を含む） ============ */

function nullSpillState(): RecordState {
  const enabled: Record<string, boolean> = {};
  ITEM_LIBRARY.forEach((l) => (enabled[l.id] = l.defaultOn));
  return {
    tokens: { gaiyou: [{ t: "p", s: "8月17日、自宅にてモニタリング面談を実施。" }], shokan: [] },
    enabled,
    order: ITEM_LIBRARY.map((l) => l.id),
    spill: [{ text: "受け皿のない内容。", sug: null }],
    insights: [{ s: INSIGHT_CANARY, why: WHY_CANARY, refs: [] }],
  };
}

test("こぼれ: suggest が null でも任意の項目へ移せる", () => {
  const s = nullSpillState();
  const moved = moveSpillTo(s, 0, "shokan", ITEM_LIBRARY);
  assert.equal(moved.spill.length, 0, "移動後はこぼれ枠から消えるはず");
  assert.equal(moved.enabled.shokan, true);
  assert.equal(moved.tokens.shokan.map((t) => t.s).join(""), "受け皿のない内容。");
});

test("こぼれ: 移動後は転記テキストに含まれ、気づきは混入しない", () => {
  const moved = moveSpillTo(nullSpillState(), 0, "shokan", ITEM_LIBRARY);
  const out = buildOutputText(moved, ITEM_LIBRARY);
  assert.ok(out.includes("受け皿のない内容。"), "移動先の項目に記録として出るはず");
  assert.ok(!out.includes(INSIGHT_CANARY));
  assert.ok(!out.includes(WHY_CANARY));
});

test("こぼれ: 内容のある項目へ移しても既存の記録を上書きしない", () => {
  const s = nullSpillState();
  const moved = moveSpillTo(s, 0, "gaiyou", ITEM_LIBRARY);
  const text = moved.tokens.gaiyou.map((t) => t.s).join("");
  assert.ok(text.startsWith("8月17日、自宅にてモニタリング面談を実施。"), "既存の記録が消えた");
  assert.ok(text.endsWith("受け皿のない内容。"), "移した内容が末尾に足されていない");
});

test("こぼれ: オフの項目へ移すと、その項目がオンになり締めの手前に入る", () => {
  const moved = moveSpillTo(nullSpillState(), 0, "kenko", ITEM_LIBRARY);
  const act = moved.order.filter((id) => moved.enabled[id]);
  assert.ok(act.includes("kenko"));
  assert.ok(act.indexOf("kenko") < act.indexOf("moushiokuri"), "締め（申し送り）より後ろに入った");
});

test("こぼれ: 降格分を別の項目へ移すと元項目に二重で残らない", () => {
  const base = baseState();
  const { state } = toggleItem(base, "kadai", ITEM_LIBRARY); // 内容ごと降格
  const idx = state.spill.findIndex((sp) => sp.sug === "kadai");
  const moved = moveSpillTo(state, idx, "shokan", ITEM_LIBRARY);
  assert.equal(moved.tokens.kadai.length, 0, "元項目にトークンが残っている（復帰時に二重化する）");
  const out = buildOutputText(moved, ITEM_LIBRARY);
  const hits = out.split("昼食を食べられていない日がある。").length - 1;
  assert.equal(hits, 1, "転記テキストに同じ内容が二重に出た");
});

test("こぼれ: 移動しても不変条件2（赤のブロック）は変わらない", () => {
  const base = baseState();
  const moved = moveSpillTo(base, 0, "shokan", ITEM_LIBRARY);
  assert.equal(isDoneBlocked(moved), true, "赤が残る限り完成はブロックされ続ける");
  assert.equal(sectionCopyText(moved, "moushiokuri"), null);
});

test("こぼれ: 存在しない項目へは移さない（状態を壊さない）", () => {
  const s = nullSpillState();
  assert.equal(moveSpillTo(s, 0, "存在しないid", ITEM_LIBRARY), s);
  assert.equal(moveSpillTo(s, 99, "shokan", ITEM_LIBRARY), s);
});

/* ============ API応答からの取り込み（実データ形状の担保） ============ */

test("不変条件: 人名の対応表（誰がどの記号か）はサーバーへ送らない", () => {
  // 置き換え記号は画面の中だけで決める。送信を組み立てる場所と変換APIは対応表を知らない。
  const page = readFileSync("app/page.tsx", "utf8");
  const api = readFileSync("app/api/convert/route.ts", "utf8");
  const prompt = readFileSync("lib/prompt.ts", "utf8");
  for (const [name, src] of [["app/page.tsx", page], ["app/api/convert/route.ts", api], ["lib/prompt.ts", prompt]]) {
    assert.ok(!/alias/i.test(src), `${name} が人名の対応表に触れている`);
  }
  const alias = readFileSync("lib/alias.ts", "utf8");
  for (const sink of ["fetch(", "localStorage", "sessionStorage", "document.cookie"]) {
    assert.ok(!alias.includes(sink), `lib/alias.ts に ${sink} があってはいけない（保存も通信もしない）`);
  }
});

test("fromApi: 実際のAPI応答（開発用フィクスチャ）を取り込める", () => {
  const raw = JSON.parse(readFileSync(new URL("../public/dev-fixture.json", import.meta.url), "utf8")) as ApiData;
  const enabled: Record<string, boolean> = {};
  ITEM_LIBRARY.forEach((l) => (enabled[l.id] = l.defaultOn));
  const s = fromApi(raw, ITEM_LIBRARY, enabled, ITEM_LIBRARY.map((l) => l.id));

  assert.equal(counts(s).r, 1, "人名（赤）が1件検知されているはず");
  assert.equal(s.spill.length, 1);
  assert.equal(s.insights.length, 4);
  assert.equal(isDoneBlocked(s), true);

  const out = buildOutputText(s, ITEM_LIBRARY);
  s.insights.forEach((i) => {
    assert.ok(!out.includes(i.s), "気づきが転記に混入した");
    assert.ok(!out.includes(i.why), "whyが転記に混入した");
  });
  s.spill.forEach((sp) => assert.ok(!out.includes(sp.text), "こぼれが転記に混入した"));
});

test("fromApi: suggest が null のこぼれも落とさずに保持する", () => {
  const data: ApiData = {
    sections: [{ id: "gaiyou", tokens: [{ t: "p", s: "本文" }] }],
    spill: [{ text: "受け皿のない内容", suggest: null }],
    insights: [],
  };
  const enabled: Record<string, boolean> = { gaiyou: true };
  const s = fromApi(data, ITEM_LIBRARY, enabled, ["gaiyou"]);
  assert.equal(s.spill.length, 1);
  assert.equal(s.spill[0].sug, null);
  // 完成時の警告には件数が出る（残っていることが見える）
  assert.ok(outputWarnings(s).some((w) => w.startsWith("こぼれ枠")));
});
