// P23 止まらない土台: 緊急時の予備（試験済み → 緊急用）・評価用の別の鍵・毎日の見張り
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { COOLDOWN_MS, FAIL_TEXT, MODEL_TIERS, failKind, resetGeminiState, tryTiers, type CallResult } from "../lib/gemini.ts";
import { ITEM_LIBRARY } from "../lib/items.ts";
import { EMERGENCY_TEXT, buildOutputText, fromApi, mergeReconvert, recordEntries, type ApiData } from "../lib/record.ts";
import { buildDocxParts } from "../lib/docx.ts";
import { PROVIDERS, keyFor } from "../eval/providers.ts";
import { BUSY_DAYS, congestionRow, issuesFor, newFlashModels, nextBusyDays, openIssues, type Probe } from "../eval/watch.mts";

const TIERS = { tested: ["t1"], emergency: ["e1", "e2"] };
/** 呼ばれた順を残す偽の呼び出し。status が 200 なら成功 */
function fakeCaller(statuses: Record<string, number | [number, string]>) {
  const calls: string[] = [];
  const call = async (model: string): Promise<CallResult> => {
    calls.push(model);
    const s = statuses[model] ?? 200;
    const [code, body] = Array.isArray(s) ? s : [s, ""];
    return code === 200 ? { ok: true, text: "{}" } : { ok: false, status: code, error: `HTTP ${code} (${model}): ${body}` };
  };
  return { calls, call };
}

beforeEach(() => resetGeminiState());

/* ---------- 1. 試験済み → 緊急用 ---------- */

test("試験済みが使えれば、緊急用は呼ばない", async () => {
  const f = fakeCaller({});
  const r = await tryTiers(TIERS, "p", [], f.call);
  assert.ok(r.ok && r.tier === "tested" && r.model === "t1");
  assert.deepEqual(f.calls, ["t1"], "緊急用を1回も呼ばない");
});

test("試験済みが混雑・上限・使えない（無くなった・課金が要る）ときだけ緊急用へ回り、印が付く", async () => {
  const cases: [string, number | [number, string]][] = [
    ["混雑 503", 503],
    ["混雑 500", 500],
    ["上限 429", 429],
    ["課金 429（枠 0）", [429, "Quota exceeded for metric: generate_content_free_tier_requests, limit: 0"]],
    ["課金 403", 403],
    ["課金 400", [400, "FAILED_PRECONDITION: User location is not supported"]],
    ["無くなった 404", 404],
  ];
  for (const [name, s] of cases) {
    resetGeminiState();
    const f = fakeCaller({ t1: s });
    const r = await tryTiers(TIERS, "p", [], f.call);
    assert.ok(r.ok && r.tier === "emergency" && r.model === "e1", `${name} → 緊急用`);
    assert.deepEqual(f.calls, ["t1", "e1"], `${name}: 試験済みを1回・緊急用を先頭から`);
  }
  // 試験済みが一覧から消えた（2段に入っていない）ときも緊急用
  const f = fakeCaller({});
  const r = await tryTiers({ tested: [], emergency: ["e1"] }, "p", [], f.call);
  assert.ok(r.ok && r.tier === "emergency");
});

test("それ以外の失敗（送った中身の問題など）では緊急用へ回らずに止まる", async () => {
  for (const s of [400, 0, 401] as const) {
    resetGeminiState();
    const f = fakeCaller({ t1: s });
    const r = await tryTiers(TIERS, "p", [], f.call);
    assert.ok(!r.ok && r.reason === "error", `${s} → 止まる`);
    assert.deepEqual(f.calls, ["t1"], `${s}: 緊急用を呼ばない`);
  }
});

test("緊急用も全滅したら、理由ごとの文言で止まる（混雑があれば混雑・上限だけなら上限・使えないだけなら使えない）", async () => {
  const f1 = fakeCaller({ t1: 503, e1: 429, e2: 429 });
  const r1 = await tryTiers(TIERS, "p", [], f1.call);
  assert.ok(!r1.ok && r1.reason === "busy");
  assert.deepEqual(f1.calls, ["t1", "e1", "e2"]);
  resetGeminiState();
  const r2 = await tryTiers(TIERS, "p", [], fakeCaller({ t1: 429, e1: 429, e2: 429 }).call);
  assert.ok(!r2.ok && r2.reason === "quota");
  resetGeminiState();
  const r3 = await tryTiers(TIERS, "p", [], fakeCaller({ t1: 404, e1: 403, e2: [429, "limit: 0"] }).call);
  assert.ok(!r3.ok && r3.reason === "unavailable");
  // 「使えない」の文言は P24 で設計側が承認した専用のもの（tests/p6.test.mts が文面を見張る）
  assert.notEqual(FAIL_TEXT.unavailable, FAIL_TEXT.error);
  assert.ok(FAIL_TEXT.busy.startsWith("いま混み合っています。") && FAIL_TEXT.quota.startsWith("本日の利用上限に達しました。"));
});

test("失敗の種類の見分け（緊急用に回すのは busy・quota・paid・gone だけ）", () => {
  assert.equal(failKind(503), "busy");
  assert.equal(failKind(504), "busy");
  assert.equal(failKind(429, "limit: 20"), "quota");
  assert.equal(failKind(429, "free_tier_requests, limit: 0"), "paid");
  assert.equal(failKind(403), "paid");
  assert.equal(failKind(400, "billing account"), "paid");
  assert.equal(failKind(404), "gone");
  assert.equal(failKind(400, "INVALID_ARGUMENT"), "error");
  assert.equal(failKind(0), "error");
});

test("503 のあと、同じモデルを短い間隔で呼び直さない（混雑 60秒・上限 15分・使えない 10分）", async () => {
  assert.deepEqual({ ...COOLDOWN_MS }, { busy: 60_000, quota: 900_000, gone: 600_000, paid: 600_000 });
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const f = fakeCaller({ t1: 503 });
    await tryTiers(TIERS, "p", [], f.call); // t1 混雑 → e1
    now += 30_000; // 30秒後にもう一度
    await tryTiers(TIERS, "p", [], f.call);
    assert.deepEqual(f.calls, ["t1", "e1", "e1"], "30秒後は混雑した試験済みを呼ばずに緊急用へ");
    now += 31_000; // 61秒後
    await tryTiers(TIERS, "p", [], f.call);
    assert.deepEqual(f.calls, ["t1", "e1", "e1", "t1", "e1"], "60秒を過ぎたら試験済みからやり直す");
  } finally {
    Date.now = realNow;
  }
  // 自動のやり直しは無い（1回の変換で同じモデルは1回まで）
  resetGeminiState();
  const g = fakeCaller({ t1: 503, e1: 503, e2: 503 });
  await tryTiers(TIERS, "p", [], g.call);
  assert.deepEqual(g.calls, ["t1", "e1", "e2"]);
});

test("2段は1か所（lib/gemini.ts の MODEL_TIERS）で定義し、変換API は段（tier）を返す", () => {
  assert.deepEqual(MODEL_TIERS, { tested: ["gemini-3.5-flash"], emergency: ["gemini-3.5-flash-lite", "gemini-3.6-flash"] });
  const route = readFileSync("app/api/convert/route.ts", "utf8");
  assert.ok(route.includes("tier: result.tier"));
  const page = readFileSync("app/page.tsx", "utf8");
  assert.ok(page.includes('emergency: json.tier === "emergency"'));
  // モデル名を他の場所に書かない
  for (const f of ["app/api/convert/route.ts", "app/page.tsx", "app/components/Review.tsx", "lib/record.ts"]) {
    assert.ok(!/gemini-\d/.test(readFileSync(f, "utf8")), `${f} にモデル名を書かない`);
  }
});

/* ---------- 緊急用の印と、確認画面の上の注意 ---------- */

const DATA: ApiData = {
  sections: [{ id: "gaiyou", tokens: [{ t: "p", s: "初回の概要" }] }],
  spill: [],
  insights: [],
};
const enabled = Object.fromEntries(ITEM_LIBRARY.map((l) => [l.id, l.defaultOn]));
const order = ITEM_LIBRARY.map((l) => l.id);

test("緊急用で読んだ記録には印が付き、再変換だけが緊急用でも印が付く（外れない）", () => {
  assert.equal(fromApi(DATA, ITEM_LIBRARY, enabled, order).emergency, false);
  const em = fromApi({ ...DATA, emergency: true }, ITEM_LIBRARY, enabled, order);
  assert.equal(em.emergency, true);
  const plain = fromApi(DATA, ITEM_LIBRARY, { ...enabled, kinsen: true }, order);
  assert.equal(mergeReconvert(plain, { ...DATA, emergency: true }, ITEM_LIBRARY).emergency, true);
  assert.equal(mergeReconvert(em, DATA, ITEM_LIBRARY).emergency, true, "あとの再変換が試験済みでも外さない");
});

test("印は転記用テキスト・Word・PDF に入らない（原則1）", () => {
  const a = fromApi(DATA, ITEM_LIBRARY, enabled, order);
  const b = fromApi({ ...DATA, emergency: true }, ITEM_LIBRARY, enabled, order);
  assert.equal(buildOutputText(b, ITEM_LIBRARY), buildOutputText(a, ITEM_LIBRARY));
  assert.deepEqual(recordEntries(b, ITEM_LIBRARY), recordEntries(a, ITEM_LIBRARY));
  const d = new Date(2026, 9, 14);
  assert.deepEqual(buildDocxParts(recordEntries(b, ITEM_LIBRARY), d), buildDocxParts(recordEntries(a, ITEM_LIBRARY), d));
  assert.ok(!buildOutputText(b, ITEM_LIBRARY).includes("予備"));
  // Word・PDF は recordEntries だけを渡す（印を読む道が無い）
  const review = readFileSync("app/components/Review.tsx", "utf8");
  assert.ok(review.includes("exportDocx(recordEntries(rec, lib)") && review.includes("printRecord(recordEntries(rec, lib)"));
  for (const f of ["lib/docx.ts", "lib/export.ts"]) assert.ok(!readFileSync(f, "utf8").includes("emergency"), `${f} は印を読まない`);
});

test("印は保存しない（端末に残すのは項目の構成と並びだけ・サーバーには送らない）", () => {
  const review = readFileSync("app/components/Review.tsx", "utf8");
  const save = review.slice(review.indexOf("localStorage.setItem("), review.indexOf("} catch", review.indexOf("localStorage.setItem(")));
  assert.ok(save.includes("{ enabled: activeIds(rec), order: rec.order }") && !save.includes("emergency"));
  for (const f of ["lib/settings.ts", "lib/backup.ts", "lib/vocab.ts"]) assert.ok(!readFileSync(f, "utf8").includes("emergency"), `${f} は印を扱わない`);
  // 送る側（callConvert の FormData）に印は無い
  const page = readFileSync("app/page.tsx", "utf8");
  const send = page.slice(page.indexOf("async function callConvert"), page.indexOf('await fetch("/api/convert"'));
  assert.ok(!send.includes("emergency"));
});

test("確認画面の上の注意: 設計側の文面のまま・印があるときだけ・閉じるボタンなし・赤を使わない", () => {
  assert.equal(EMERGENCY_TEXT, "混雑のため、予備の読み取りを使いました。読み違いの印が付きにくいことがあります。元のメモとよく見比べてください。");
  const review = readFileSync("app/components/Review.tsx", "utf8");
  const start = review.indexOf("{rec.emergency && (");
  assert.ok(start > 0, "印があるときだけ出す");
  const block = review.slice(start, review.indexOf(")}", start));
  assert.ok(block.includes("{EMERGENCY_TEXT}"));
  assert.ok(!/button|onClick/.test(block), "閉じるボタンを付けない");
  assert.ok(start < review.indexOf('<div className="mobile-tabs">'), "確認画面の上（元メモ・記録の切り替えより上）");
  const css = readFileSync("app/globals.css", "utf8");
  const rule = css.slice(css.indexOf(".emergency-note{"), css.indexOf("}", css.indexOf(".emergency-note{")));
  assert.ok(rule.includes("grid-column:1/-1"), "両方の列にまたがる");
  assert.ok(!rule.includes("--r-"), "赤（伏せ忘れの知らせ・原則3）を使わない");
});

/* ---------- 3. 評価用の別の鍵 ---------- */

test("評価用の鍵: 無い・本番の鍵と同じなら使わない（本番の鍵へは切り替えない）", () => {
  const p = PROVIDERS.gemini;
  const none = keyFor(p, {});
  assert.ok(!none.ok && none.missing);
  const prodOnly = keyFor(p, { GEMINI_API_KEY: "prod-x" });
  assert.ok(!prodOnly.ok && prodOnly.missing && prodOnly.message.includes("本番の鍵（GEMINI_API_KEY）はありますが"));
  const same = keyFor(p, { GEMINI_API_KEY: "same", GEMINI_EVAL_API_KEY: "same" });
  assert.ok(!same.ok && !same.missing && same.message.includes("同じです"));
  const ok = keyFor(p, { GEMINI_API_KEY: "prod-x", GEMINI_EVAL_API_KEY: "eval-y" });
  assert.ok(ok.ok && ok.key === "eval-y");
});

const NO_NET = pathToFileURL(resolve("tests/no-net.mjs")).href;
const MOCK = pathToFileURL(resolve("tests/watch-mock.mjs")).href;
/** .env.local の値を拾わないよう、鍵の変数は必ず明示する（空文字＝無し） */
function runScript(file: string, args: string[], env: Record<string, string>, preload = NO_NET) {
  return spawnSync(process.execPath, ["--no-warnings", "--import", preload, file, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", GITHUB_REPOSITORY: "", GITHUB_TOKEN: "", ...env },
  });
}

test("評価キットは本番の鍵しか無いと、1回も呼ばずに分かる言葉で止まる", () => {
  const r = runScript("eval/run.mts", ["--cases", "hard", "--runs", "1"], { GEMINI_API_KEY: "test-prod", GEMINI_EVAL_API_KEY: "" });
  assert.equal(r.status, 2, r.stderr);
  assert.ok(r.stderr.includes("評価用の鍵（GEMINI_EVAL_API_KEY）がありません") && r.stderr.includes("評価には使いません"));
  assert.ok(!r.stderr.includes("NETWORK_CALLED"));
  const same = runScript("eval/run.mts", ["--cases", "hard", "--runs", "1"], { GEMINI_API_KEY: "test-same", GEMINI_EVAL_API_KEY: "test-same" });
  assert.equal(same.status, 2);
  assert.ok(same.stderr.includes("本番の鍵（GEMINI_API_KEY）と同じです"));
});

test("見張りは評価用の鍵が無ければ、何もせず静かに終わる（終了コード 0・何も書かない・呼ばない）", () => {
  const dir = join(mkdtempSync(join(tmpdir(), "watch-")), "state");
  for (const env of [{ GEMINI_EVAL_API_KEY: "" , GEMINI_API_KEY: "" }, { GEMINI_EVAL_API_KEY: "", GEMINI_API_KEY: "test-prod" }]) {
    const r = runScript("eval/watch.mts", ["--state", dir], env);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes("何もせずに終わる"));
    assert.ok(!r.stderr.includes("NETWORK_CALLED"));
    assert.ok(!existsSync(dir), "記録も書かない");
  }
});

/* ---------- 4. 毎日の見張り ---------- */

const at = "2026-10-14T13:00:05.000Z";
const P = (model: string, tier: Probe["tier"], result: Probe["result"], status = 0): Probe => ({ at, model, tier, result, status, ms: 1200 });

test("新しい Flash 系: 前回に無く、2段にも無いものだけ（初回は比べない）", () => {
  const prev = ["gemini-3.5-flash", "gemini-3.6-flash"];
  const now = ["gemini-3.7-flash", "gemini-3.7-pro", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"];
  assert.deepEqual(newFlashModels(prev, now), ["gemini-3.7-flash"], "pro は Flash 系でない・3.5-flash-lite は緊急用");
  assert.deepEqual(newFlashModels(null, now), []);
});

test("Issue にするのは: 試験済みが消えた・課金が要る・使えない・失敗した・3日続けて混雑・新しい Flash 系", () => {
  const T = MODEL_TIERS.tested[0];
  const titles = (probes: Probe[], busy: Record<string, number> = {}, newModels: { model: string; report: string }[] = []) =>
    issuesFor({ at, probes, busyDays: busy, newModels }).map((i) => i.title);
  assert.deepEqual(titles([P(T, "tested", "ok", 200), P("e1", "emergency", "gone", 404)]), [], "緊急用の異常は Issue にしない");
  assert.deepEqual(titles([P(T, "tested", "unlisted")]), [`見張り: 試験済みのモデル ${T} が一覧から消えた`]);
  assert.deepEqual(titles([P(T, "tested", "paid", 429)]), [`見張り: 試験済みのモデル ${T} に課金が要る`]);
  assert.deepEqual(titles([P(T, "tested", "gone", 404)]), [`見張り: 試験済みのモデル ${T} が使えない`]);
  assert.deepEqual(titles([P(T, "tested", "error", 400)]), [`見張り: 試験済みのモデル ${T} で変換に失敗した`]);
  assert.deepEqual(titles([P(T, "tested", "unreadable", 200)]), [`見張り: 試験済みのモデル ${T} で変換に失敗した`]);
  assert.deepEqual(titles([P(T, "tested", "quota", 429)]), [], "上限は Issue にしない（記録だけ）");
  assert.deepEqual(titles([P(T, "tested", "busy", 503)], { [T]: BUSY_DAYS - 1 }), [], "混雑が続いていなければ記録だけ");
  assert.deepEqual(titles([P(T, "tested", "busy", 503)], { [T]: BUSY_DAYS }), [`見張り: 試験済みのモデル ${T} が3日続けて混雑`]);
  const n = issuesFor({ at, probes: [], busyDays: {}, newModels: [{ model: "gemini-3.7-flash", report: "| 表 |" }] });
  assert.equal(n[0].title, "見張り: 新しい Flash 系のモデル gemini-3.7-flash が一覧に出た");
  assert.ok(n[0].body.includes("| 表 |"), "評価の結果を本文に付ける");
  // 題に日付を入れない（同じ異常が続いても同じ題＝重ねて立てない）
  assert.ok(!/2026/.test(titles([P(T, "tested", "unlisted")])[0]));
});

test("続けて混雑した日数は、混雑でない日に 0 へ戻る", () => {
  const T = "t";
  assert.deepEqual(nextBusyDays({ t: 2 }, [P(T, "tested", "busy", 503)]), { t: 3 });
  assert.deepEqual(nextBusyDays({ t: 2 }, [P(T, "tested", "ok", 200)]), { t: 0 });
  assert.deepEqual(nextBusyDays({}, [P(T, "tested", "busy", 503)]), { t: 1 });
});

test("混雑の記録は1行に時刻（日本時間）・モデル・段・結果", () => {
  assert.equal(congestionRow({ ...P("gemini-3.5-flash", "tested", "busy", 503), ms: 5300 }), "| 2026-10-14 22:00 | gemini-3.5-flash | 試験済み | 混雑 | 503 | 5.3 |");
  assert.equal(congestionRow({ ...P("x", "emergency", "ok", 200), pass: false, reasons: ["作り話 1"] }), "| 2026-10-14 22:00 | x | 緊急用 | 変換できた（否: 作り話 1） | 200 | 1.2 |");
});

test("Issue は同じ題が開いていれば立てない", async () => {
  const posted: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posted.push(JSON.parse(String(init.body)).title);
      return new Response("{}", { status: 201 });
    }
    return new Response(JSON.stringify([{ title: "A" }, { title: "PR", pull_request: {} }]), { status: 200 });
  }) as typeof fetch;
  const r = await openIssues(
    [
      { title: "A", body: "" },
      { title: "B", body: "" },
      { title: "B", body: "" },
    ],
    "o/r",
    "tok",
    f
  );
  assert.deepEqual(posted, ["B"]);
  assert.deepEqual(r, { opened: ["B"], skipped: ["A", "B"] });
});

test("見張りを通しで（Gemini と GitHub は偽物）: 評価用の鍵だけで呼び、Issue・混雑の記録・前回の一覧・返答を残す", async () => {
  const root = mkdtempSync(join(tmpdir(), "watch-run-"));
  const dir = join(root, "state");
  const log = join(root, "calls.jsonl");
  writeFileSync(log, "");
  // 前回: 試験済みも緊急用もあった・試験済みは2晩続けて混雑
  const prev = { checkedAt: "2026-10-13T13:00:00.000Z", models: ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"], busyDays: { "gemini-3.5-flash": 2 } };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify(prev));
  const env = {
    GEMINI_EVAL_API_KEY: "test-eval",
    GEMINI_API_KEY: "test-prod",
    GITHUB_REPOSITORY: "o/r",
    GITHUB_TOKEN: "tok",
    MOCK_MODELS: "gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.6-flash",
    MOCK_STATUS: JSON.stringify({ "gemini-3.5-flash": 503, "gemini-3.6-flash": "429:0" }),
    MOCK_OPEN: JSON.stringify(["見張り: 新しい Flash 系のモデル gemini-9.9-flash が一覧に出た"]),
    MOCK_LOG: log,
  };
  const r = runScript("eval/watch.mts", ["--state", dir, "--gap", "0"], env, MOCK);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const calls = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  // 鍵はすべて評価用
  assert.ok(calls.filter((c) => c.key).every((c) => c.key === "eval"), "本番の鍵で呼ばない");
  // 試験済み・緊急用で1回ずつ＋新しいモデルを 3件×1回（評価キット）
  const gens = calls.filter((c) => c.kind === "gen").map((c) => c.model);
  assert.deepEqual(gens.slice(0, 3), ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"]);
  assert.deepEqual(gens.slice(3), ["gemini-3.7-flash", "gemini-3.7-flash", "gemini-3.7-flash"]);
  // Issue: 3晩続けて混雑・新しい Flash 系（評価の表つき）
  const posts = calls.filter((c) => c.kind === "gh-post");
  assert.deepEqual(posts.map((p) => p.title), ["見張り: 試験済みのモデル gemini-3.5-flash が3日続けて混雑", "見張り: 新しい Flash 系のモデル gemini-3.7-flash が一覧に出た"]);
  assert.ok(posts[1].body.includes("| モデル | メモ | 成功/試行 |"), "評価キットの表が付いている");
  // 記録
  const st = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  assert.deepEqual([...st.models].sort(), ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.7-flash"]);
  assert.equal(st.busyDays["gemini-3.5-flash"], 3);
  const cg = readFileSync(join(dir, "congestion.md"), "utf8");
  assert.ok(cg.includes("| gemini-3.5-flash | 試験済み | 混雑 | 503 |"));
  assert.ok(cg.includes("| gemini-3.6-flash | 緊急用 | 課金が要る | 429 |"));
  assert.ok(existsSync(join(dir, "eval")), "新しいモデルの評価結果も残す");
  assert.ok(!/test-eval|test-prod/.test(cg + JSON.stringify(st)), "鍵の値を記録に書かない");
  // P26: 小さな変換の返答を outputs/ に残す（画像と鍵は残さない）
  const { readdirSync } = await import("node:fs");
  const outs = readdirSync(join(dir, "outputs"));
  assert.equal(outs.length, 1);
  const saved = readFileSync(join(dir, "outputs", outs[0]), "utf8");
  const so = JSON.parse(saved);
  assert.equal(so.case, "hard");
  assert.ok(so.probes.find((p: any) => p.model === "gemini-3.5-flash-lite").output.sections, "変換できた返答が残る");
  assert.ok(!/test-eval|test-prod|base64|data:image/.test(saved), "鍵と画像を残さない");

  // 翌日: 同じ題の Issue が開いていれば立てない・新しいモデルはもう新しくない
  writeFileSync(log, "");
  const r2 = runScript("eval/watch.mts", ["--state", dir, "--gap", "0"], { ...env, MOCK_OPEN: JSON.stringify(["見張り: 試験済みのモデル gemini-3.5-flash が3日続けて混雑"]) }, MOCK);
  assert.equal(r2.status, 0, r2.stderr);
  const calls2 = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(calls2.filter((c) => c.kind === "gh-post").length, 0);
  assert.equal(calls2.filter((c) => c.kind === "gen").length, 3, "新しいモデルの評価は初めての日だけ");
  const rows = readFileSync(join(dir, "congestion.md"), "utf8").split("\n").filter((l) => /^\| \d{4}-\d{2}-\d{2} /.test(l));
  assert.equal(rows.length, 6, "混雑の記録は足していく（3モデル×2晩）");
});

test("ワークフロー: 毎日 22:00（日本時間）に1回・評価用の鍵だけ・未登録なら何もせず成功で終わる", () => {
  const y = readFileSync(".github/workflows/watch.yml", "utf8");
  assert.ok(y.includes('cron: "0 13 * * *"'), "13:00 UTC = 22:00 JST");
  assert.ok(y.includes("workflow_dispatch:"));
  assert.ok(y.includes("secrets.GEMINI_EVAL_API_KEY") && !y.includes("secrets.GEMINI_API_KEY"), "本番の鍵を渡さない");
  assert.ok(y.includes("issues: write") && y.includes("contents: write"));
  // 鍵が無いときは最初の段だけが動き、残りはすべて飛ばす（失敗にしない）
  const steps = y.slice(y.indexOf("steps:")).split(/\n      - /).slice(1);
  assert.ok(steps[0].includes('if [ -z "$GEMINI_EVAL_API_KEY" ]') && steps[0].includes("has=0"));
  for (const s of steps.slice(1)) assert.ok(s.includes("if: steps.key.outputs.has == '1'"), `鍵が無ければ飛ばす → ${s.split("\n")[0]}`);
  assert.ok(y.includes("node eval/watch.mts --state watch-state"));
  assert.ok(y.includes("watch-log"), "記録は main ではなく watch-log ブランチ");
  // P24: Node.js 24 で動く版の actions・環境は確かめた版に固定（ubuntu-latest の移行の途中で変わらないように）
  assert.deepEqual([...y.matchAll(/runs-on:\s*(\S+)/g)].map((m) => m[1]), ["ubuntu-26.04"]);
  assert.ok(y.includes("uses: actions/checkout@v7") && y.includes("uses: actions/setup-node@v7"));
  assert.ok(!/@v[1-6]\b/.test(y), "Node.js 20 向けの古い版を使わない");
});
