// 評価キット（eval/・P20）の機械テスト。API は呼ばない（採点・正解・作りの形だけを見る）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ITEM_LIBRARY, MEETING_LIBRARY, libraryFor } from "../lib/items.ts";
import type { Converted } from "../lib/convert-core.ts";
import { finishConversion } from "../lib/convert-core.ts";
import { norm, numbers, scoreRun, type EvalCase } from "../eval/score.ts";
import { CRITERIA, judgeRun } from "../eval/criteria.ts";
import { parseModelSpec, PROVIDERS } from "../eval/providers.ts";

const cases: EvalCase[] = readdirSync("eval/cases")
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join("eval/cases", f), "utf8")));
const byId = (id: string) => cases.find((c) => c.id === id)!;

/** 正解の要点を、それぞれ最初の候補の語で、正解の最初の項目に書いた出力（読みにくい箇所は黄で申告する） */
function idealOutput(c: EvalCase): Converted {
  const sec = new Map<string, Converted["sections"][number]>();
  for (const id of c.items) sec.set(id, { id, tokens: [] });
  for (const f of c.facts) sec.get(f.items[0])!.tokens.push({ t: "p", s: f.all.map((g) => g[0]).join(" ") + "。" });
  for (const m of c.marks) sec.get(c.items[0])!.tokens.push({ t: "p", s: m.context[0] }, { t: "y", s: m.answer[0], cands: [m.answer[0]] }, { t: "p", s: "。" });
  for (const mk of c.masks) sec.get(c.items[0])!.tokens.push({ t: "p", s: `${mk.context[0]}〇〇。` });
  return { record_type: c.record_type, sections: [...sec.values()], spill: [], insights: [] };
}

test("v2 のメモ（P26）は3件: 本当に読めない箇所を各4か所以上・読みにくいが読める箇所を分けて持ち・塗った四角の無いメモを含む", async () => {
  const { loadCases } = await import("../eval/cases.ts");
  const v2 = loadCases([], "v2");
  assert.equal(v2.length, 3);
  assert.ok(v2.some((c) => c.masks.length === 0), "塗った四角の無いメモ（〇〇の保険を測る）");
  assert.ok(v2.some((c) => c.masks.length > 0 && c.maskedNames.length > 0), "名前を塗ったメモ");
  for (const c of v2) {
    assert.ok(c.marks.length >= 4, `${c.id}: 本当に読めない箇所が4か所未満`);
    assert.ok((c.legible ?? []).length >= 1, `${c.id}: 読みにくいが読める箇所を分けて持つ`);
    assert.ok(existsSync(c.source) && existsSync(c.image) && c.image.startsWith("eval/cases/v2/"), `${c.id}: 画像`);
    assert.ok(c.source.startsWith("docs/samples/dummy-memo-"), "架空のダミーだけ");
    for (const m of [...c.marks, ...(c.legible ?? [])]) assert.ok(norm(c.text).includes(norm(m.answer[0])) && m.context.some((x) => norm(c.text).includes(norm(x))), `${c.id}.${m.id}: 答えと前後の語が正解の文にある`);
    for (const nm of c.maskedNames) assert.ok(!c.text.includes(nm));
    // 正解どおり（読めない箇所は黄・読める箇所は正しく読む）なら満点で合格
    const sec = new Map<string, Converted["sections"][number]>();
    for (const id of c.items) sec.set(id, { id, tokens: [] });
    for (const f of c.facts) sec.get(f.items[0])!.tokens.push({ t: "p", s: f.all.map((g) => g[0]).join(" ") + "。" });
    for (const m of c.marks) sec.get(c.items[0])!.tokens.push({ t: "p", s: m.context[0] }, { t: "y", s: m.answer[0] }, { t: "p", s: "。" });
    for (const m of c.legible ?? []) sec.get(c.items[0])!.tokens.push({ t: "p", s: `${m.context[0]}${m.answer[0]}。` });
    for (const mk of c.masks) sec.get(c.items[0])!.tokens.push({ t: "p", s: `${mk.context[0]}〇〇。` });
    const s = scoreRun(c, { record_type: c.record_type, sections: [...sec.values()], spill: [], insights: [] });
    assert.equal(s.recall, 1, `${c.id}: 要点 ${s.facts.missing.join(",")}`);
    assert.deepEqual(s.unreadable, { total: c.marks.length, yellow: c.marks.length });
    assert.ok(s.marks.filter((m) => m.legible).every((m) => m.outcome === "正読"), `${c.id}: 読める箇所は正読`);
    assert.ok(judgeRun(c, s).pass, `${c.id}: ${judgeRun(c, s).reasons.join("・")}`);
  }
  // v1 は今日までの結果と比べるために残す（既定の組は v1）
  assert.deepEqual(loadCases().map((c) => c.id), ["hard", "names", "symbols"]);
});

test("採点（P26）: 前後の語との距離で黄を割り当てるのは、正しく読めていない印だけ（近くの正読の印に黄を取られない）", async () => {
  const { loadCases } = await import("../eval/cases.ts");
  const c = loadCases(["v2-meeting"], "v2")[0];
  const s = scoreRun(c, {
    record_type: "meeting",
    sections: [{ id: "shukudai", tokens: [{ t: "p", s: "・主治医へ連絡：看護師／期限：" }, { t: "y", s: "〇〇" }, { t: "p", s: "まで\n・" }, { t: "y", s: "〇〇" }, { t: "p", s: "と調整：担当未定\n・次回：11/21" }] }],
    spill: [],
    insights: [],
  });
  const o = Object.fromEntries(s.marks.map((m) => [m.id, m.outcome]));
  assert.equal(o["11/7"], "黄");
  assert.equal(o["計画相談"], "黄");
  assert.equal(o["11/21"], "正読", "正しく読めた印は黄を取らない");
});

test("評価のメモは3件: 名前を塗った1件・記号（→↑↓？！）の1件を含み、どれにも読みにくくした箇所（印）がある", () => {
  assert.equal(cases.length, 3);
  assert.ok(cases.some((c) => c.masks.length > 0 && c.maskedNames.length > 0), "名前を塗ったメモがない");
  assert.ok(cases.some((c) => ["→", "↑", "↓", "？", "！"].every((s) => c.text.includes(s))), "記号を含むメモがない");
  for (const c of cases) {
    assert.ok(c.marks.length >= 2, `${c.id}: 印が少ない`);
    assert.ok(existsSync(c.source) && existsSync(c.image), `${c.id}: 画像が無い`);
    assert.ok(c.image.endsWith(".jpg"), "アプリが送る形（JPEG）");
    // 項目は本番の項目ライブラリにあるもの・要点の行き先は選んだ項目の中
    const lib = libraryFor(c.record_type).map((l) => l.id);
    for (const id of c.items) assert.ok(lib.includes(id), `${c.id}: 知らない項目 ${id}`);
    for (const f of c.facts) for (const id of f.items) assert.ok(c.items.includes(id), `${c.id}.${f.id}: 選んでいない項目 ${id}`);
    // 塗った名前は正解の書き起こしに出てこない（〇〇 になっている）
    for (const nm of c.maskedNames) assert.ok(!c.text.includes(nm), `${c.id}: 正解に塗った名前がある`);
    // 実データを使わない（架空と書いてある元の画像だけ）
    assert.ok(c.source.startsWith("docs/samples/dummy-memo-"));
  }
  assert.ok(ITEM_LIBRARY.length && MEETING_LIBRARY.length);
});

test("採点: 正解どおりの出力は満点・作り話0・申告なし0・合格", () => {
  for (const c of cases) {
    const s = scoreRun(c, idealOutput(c));
    assert.equal(s.recall, 1, `${c.id}: 要点 ${s.facts.missing.join(",")}`);
    assert.equal(s.placement, 1, `${c.id}: 振り分け ${s.facts.misplaced.join(",")}`);
    assert.equal(s.yellowOnMarks, c.marks.length, `${c.id}: 黄∩印`);
    assert.equal(s.undeclared, 0);
    assert.deepEqual(s.fabrications, []);
    assert.equal(s.masks.ok, c.masks.length);
    assert.ok(judgeRun(c, s).pass, `${c.id}: ${judgeRun(c, s).reasons.join("・")}`);
  }
});

test("採点: 正解に無い数・塗った名前・作り話の語は作り話に数える（黄・青で申告した数は数えない）", () => {
  const c = byId("hard");
  const out = idealOutput(c);
  out.sections[0].tokens.push({ t: "p", s: "2026年の工賃は15,000円。" }, { t: "y", s: "週7" }, { t: "b", s: "8月" }, { t: "p", s: "姉から声かけがある。" });
  const s = scoreRun(c, out);
  const kinds = s.fabrications.map((f) => `${f.kind}:${f.text}`);
  assert.deepEqual(kinds.sort(), ["作り話の語:姉から声かけ", "数:15000", "数:2026"]);
  assert.ok(!judgeRun(c, s).pass);
  const n = byId("names");
  const o2 = idealOutput(n);
  o2.sections[0].tokens.push({ t: "r", s: "高橋" });
  assert.ok(scoreRun(n, o2).fabrications.some((f) => f.kind === "名前" && f.text === "高橋"), "塗った名前を作った");
});

test("採点: 印の箇所は 黄／青／正読（申告なし）／申告なし（誤読か欠落）／抜け に分ける", () => {
  const c = byId("names"); // 印: 半分（昼食・残す）・2kg（体重）
  const base = (tokens: Converted["sections"][number]["tokens"]): Converted => ({
    record_type: "interview",
    sections: [{ id: "kenko", tokens }],
    spill: [],
    insights: [],
  });
  const r1 = scoreRun(c, base([{ t: "p", s: "昼食を" }, { t: "y", s: "半分" }, { t: "p", s: "残す。体重が" }, { t: "b", s: "減っている" }]));
  assert.deepEqual(r1.marks.map((m) => m.outcome), ["黄", "青"]);
  const r2 = scoreRun(c, base([{ t: "p", s: "昼食を半分残す。体重が5kg減った。" }]));
  assert.deepEqual(r2.marks.map((m) => m.outcome), ["正読", "申告なし"]);
  assert.equal(r2.undeclared, 1);
  assert.ok(r2.fabrications.some((f) => f.text === "5"), "読めない箇所に作った数");
  const r3 = scoreRun(c, base([{ t: "p", s: "歯科を勧めた。" }]));
  assert.deepEqual(r3.marks.map((m) => m.outcome), ["抜け", "抜け"]);
  // 黄が印から離れていれば数えない
  const r4 = scoreRun(c, base([{ t: "y", s: "袋詰め" }, { t: "p", s: "の作業をしている。".repeat(5) + "昼食を半分残す。" }]));
  assert.equal(r4.marks[0].outcome, "正読");
  assert.equal(r4.yellow, 1);
  assert.equal(r4.yellowOnMarks, 0);
});

test("採点（P25）: 読みにくくした箇所を「〇〇」と書いたら内訳を〇〇に（申告なしに数える）。名前を伏せた〇〇さんは数えない", () => {
  const c = byId("names"); // 印: 半分（昼食・残す）・2kg（体重）
  const base = (s: string): Converted => ({ record_type: "interview", sections: [{ id: "kenko", tokens: [{ t: "p", s }] }], spill: [], insights: [] });
  const r1 = scoreRun(c, base("昼食を〇〇残す日あり\n体重が減った"));
  assert.equal(r1.marks[0].outcome, "〇〇");
  assert.equal(r1.undeclared, 2, "〇〇も申告なしに数える（黄にならず要確認の数に出ないため）");
  assert.ok(judgeRun(c, r1).reasons.some((r) => r.includes("うち〇〇にした 1件")));
  // 別の行の「職員〇〇さん」は名前を伏せた箇所なので、印の〇〇に数えない
  const r2 = scoreRun(c, base("・職員〇〇さんと相性が良い\n・昼食を残す日がある"));
  assert.equal(r2.marks[0].outcome, "申告なし");
  const h = byId("symbols"); // 印: 10分（出発・早め）・10/10（連絡・サビ管）
  const r3 = scoreRun(h, { record_type: "meeting", sections: [{ id: "shukudai", tokens: [{ t: "p", s: "・家族へ連絡：担当 サビ管／期限 〇〇/〇〇まで" }] }], spill: [], insights: [] });
  assert.equal(r3.marks.find((m) => m.id === "10/10")!.outcome, "〇〇");
});

test("合否（P25）: 黄の割合の分母は「正しく読めなかった印」（正読は除く）", () => {
  const c = byId("hard"); // 印5つ
  // 読める3か所を正しく読み、読めない2か所を黄にした → 黄 2/2 で合格（P24 までの分母 5 では 2/5 で落ちていた）
  const ok: Converted = {
    record_type: "interview",
    sections: [
      { id: "kenko", tokens: [{ t: "y", s: "眠剤" }, { t: "p", s: "は自己管理、飲み忘れ週1〜2。" }, { t: "y", s: "訪看" }, { t: "p", s: "から声かけ。" }] },
      { id: "kinsen", tokens: [{ t: "p", s: "工賃は月12,000円くらい。ケース会10/3。" }] },
    ],
    spill: [],
    insights: [],
  };
  const s = scoreRun(c, ok);
  assert.deepEqual(s.marks.map((m) => m.outcome), ["黄", "正読", "黄", "正読", "正読"]);
  assert.ok(!judgeRun(c, s).reasons.some((r) => r.includes("黄が")), judgeRun(c, s).reasons.join("・"));
  // 読めない2か所のうち黄が0なら落ちる（青だけで申告した回）
  const blue = structuredClone(ok);
  for (const t of blue.sections[0].tokens) if (t.t === "y") t.t = "b";
  assert.ok(judgeRun(c, scoreRun(c, blue)).reasons.some((r) => r.includes("黄が、読めなかった印と重なったのは 0/2")));
});

test("採点: 塗った箇所の「〇〇」を数え、名前の前後に無ければ落とす", () => {
  const c = byId("names");
  const out = idealOutput(c);
  // 「担当：〇〇」を消す
  for (const s of out.sections) s.tokens = s.tokens.filter((t) => !t.s.startsWith("担当"));
  const s = scoreRun(c, out);
  assert.equal(s.masks.ok, c.masks.length - 1);
  assert.ok(judgeRun(c, s).reasons.some((r) => r.includes("〇〇")));
});

test("採点の下ごしらえ: 全角半角・空白・数の形をそろえる", () => {
  assert.equal(norm("１０／３ （木）"), "10/3(木)");
  assert.deepEqual(numbers("工賃は12,000円、09:30〜"), ["12000", "9", "30"]);
});

test("合否の目安は eval/criteria.ts の1か所（作り話0・申告なし0・黄が印の半分以上・要点85%以上・〇〇すべて）", () => {
  assert.deepEqual({ ...CRITERIA }, { maxFabrications: 0, maxUndeclared: 0, minYellowOnMarksRatio: 0.5, minRecall: 0.85, allMasksOO: true });
  const run = readFileSync("eval/run.mts", "utf8");
  assert.ok(run.includes('from "./criteria.ts"') && !/maxFabrications\s*[:=]\s*\d/.test(run), "数字を run.mts に書かない");
});

test("本番と同じプロンプトと読み取りの経路を使う（評価のための別の作りにしない）", () => {
  const run = readFileSync("eval/run.mts", "utf8");
  // メモの組み立ては評価キットと見張りで共通（eval/cases.ts・P23）
  const cases = readFileSync("eval/cases.ts", "utf8");
  assert.ok(cases.includes('import { buildPrompt } from "../lib/prompt.ts"') && cases.includes("buildPrompt(items, [], c.record_type)"));
  assert.ok(run.includes('import { inputs as baseInputs, loadCases, type CaseSet } from "./cases.ts"'));
  // プロンプトの案（P25）は、本番の buildPrompt の出力に足すだけ（--variant を付けたときだけ。本番の lib/prompt.ts は変えない）
  assert.ok(run.includes("VARIANT ? { ...x, prompt: applyVariant(x.prompt, VARIANT) } : x"));
  assert.ok(run.includes('import { finishConversion } from "../lib/convert-core.ts"') && run.includes("finishConversion(r.text, c.record_type)"));
  const watch = readFileSync("eval/watch.mts", "utf8");
  assert.ok(watch.includes('import { inputs, loadCases } from "./cases.ts"') && watch.includes("finishConversion(r.text, c.record_type)"), "見張りも同じ経路");
  const prov = readFileSync("eval/providers.ts", "utf8");
  assert.ok(prov.includes('import { callModel, type CallResult, type ImagePart } from "../lib/gemini.ts"'));
  assert.ok(prov.includes("call: (m, p, i, k) => callModel(m, p, i, k)"));
  // 本番の変換API も同じ後処理と同じ1回の呼び出しを使う
  const route = readFileSync("app/api/convert/route.ts", "utf8");
  assert.ok(route.includes("finishConversion(result.text, type)"));
  const gem = readFileSync("lib/gemini.ts", "utf8");
  const tiers = gem.slice(gem.indexOf("export async function tryTiers"), gem.indexOf("export async function generateWithFallback"));
  assert.ok(tiers.includes("call: Caller = (m, p, i) => callModel(m, p, i)"), "本番の試す順も callModel を通る");
  const fallback = gem.slice(gem.indexOf("export async function generateWithFallback"));
  assert.ok(fallback.includes("tryTiers(workingTiers, prompt, images)"), "本番は呼び方を差し替えない");
  // 後処理は本番の読み取りそのもの（壊れた JSON の救済と人名の機械検出）
  const d = finishConversion('```json\n{"sections":[{"id":"gaiyou","tokens":[{"t":"p","s":"同席：山田花子さん"}]}]}\n```', "interview");
  assert.ok(d && d.sections[0].tokens.some((t) => t.t === "r"));
});

test("プロンプトの案（P25）: 本番のプロンプトの1か所に足すだけ・案は2つまで・目印が無ければ止まる", async () => {
  const { ANCHOR, VARIANTS, applyVariant } = await import("../eval/prompt-variants.ts");
  const { buildPrompt } = await import("../lib/prompt.ts");
  assert.ok(Object.keys(VARIANTS).length <= 2);
  for (const type of ["interview", "meeting", "visit"] as const) {
    const base = buildPrompt(libraryFor(type).slice(0, 3), [], type);
    for (const k of Object.keys(VARIANTS)) {
      const v = applyVariant(base, k);
      assert.equal(v.replace(VARIANTS[k].text, ""), base, `${type}・案${k}: 足した文を除けば本番と同じ`);
    }
  }
  assert.throws(() => applyVariant("目印の無い文", "A"), /目印/);
  assert.ok(!readFileSync("lib/prompt.ts", "utf8").includes("黙って省かない"), "本番のプロンプトに案を入れていない");
  assert.ok(ANCHOR.endsWith("0個は疑わしい。"));
});

test("提供元は「提供元:モデル名」で選ぶ。今回は Gemini（評価用の鍵・P23）だけ", () => {
  assert.deepEqual(Object.keys(PROVIDERS), ["gemini"]);
  assert.equal(PROVIDERS.gemini.keyEnv, "GEMINI_EVAL_API_KEY", "本番の鍵（GEMINI_API_KEY）は評価に使わない");
  assert.equal(PROVIDERS.gemini.prodKeyEnv, "GEMINI_API_KEY");
  assert.equal(parseModelSpec("gemini:gemini-3.5-flash").model, "gemini-3.5-flash");
  assert.equal(parseModelSpec("gemini-3.6-flash").provider.id, "gemini");
  assert.throws(() => parseModelSpec("anthropic:claude"), /知らない提供元/);
});

test("結果（docs/eval/）に画像と鍵を残さない・npm の依存を増やさない", () => {
  if (existsSync("docs/eval")) {
    for (const f of readdirSync("docs/eval")) {
      assert.ok(/\.(md|json)$/.test(f), `画像などを残している → ${f}`);
      const s = readFileSync(join("docs/eval", f), "utf8");
      assert.ok(!/AIza[0-9A-Za-z_-]{20,}/.test(s), `鍵が入っている → ${f}`);
      assert.ok(!/"base64"|data:image/.test(s), `画像が入っている → ${f}`);
    }
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["next", "react", "react-dom"]);
  for (const f of ["eval/run.mts", "eval/score.ts", "eval/providers.ts", "eval/criteria.ts", "eval/cases.ts", "eval/watch.mts"]) {
    const imports = [...readFileSync(f, "utf8").matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    assert.ok(imports.every((m) => m.startsWith("node:") || m.startsWith("./") || m.startsWith("../lib/")), `${f} が外のものを読む`);
  }
});
