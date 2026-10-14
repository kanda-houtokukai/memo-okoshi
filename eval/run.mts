// 評価キット（P20）: モデルを同じ物差しで測る。Node の標準機能だけ（npm の依存なし）。
//
// 使い方（リポジトリの直下で）:
//   node eval/run.mts                                   … 本番の優先リスト（lib/gemini.ts の PREFERRED）を、3件×3回
//   node eval/run.mts --models gemini:gemini-3.7-flash --runs 2
//   node eval/run.mts --models gemini:gemini-3.5-flash --cases hard --runs 1
//   node eval/run.mts --dry                             … API を呼ばず、組み立て（プロンプト・画像・正解）だけ確かめる
// 結果は docs/eval/YYYY-MM-DD-HHMM.md（表）と .json（各回の採点と変換の結果）。画像と鍵は残さない。
//
// [DECISION 2026-10-14] **本番と同じプロンプトと読み取りの経路を使う**: プロンプトは lib/prompt.ts の buildPrompt（辞書は空＝モデルそのものの力を測る）、
//   呼び出しは lib/gemini.ts の callModel（本番の generateWithFallback が使うのと同じ1回の呼び出し・temperature 0）、
//   返答の読み取りと人名の機械検出は lib/convert-core.ts の finishConversion（変換API と同じ）。画像はアプリが送る形（JPEG 0.92）。
//   違うのは「優先リストの順に試す」ことだけ（評価はモデルを名指しする）。
// [DECISION 2026-10-14] **無料枠を無理に使わない**: 失敗しても重ねて呼ばない（再試行しない）。そのモデルで 429（枠切れ）が出たら、
//   そのモデルはそこで止める。503（混雑）が2回続いても止める。呼ぶ間は数秒空ける。
// 「毎日の見張り」（次の指示）からも、このファイルを同じ引数で呼ぶ。

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPrompt } from "../lib/prompt.ts";
import { itemsByIds, libraryFor } from "../lib/items.ts";
import { PREFERRED } from "../lib/gemini.ts";
import { finishConversion } from "../lib/convert-core.ts";
import { parseModelSpec } from "./providers.ts";
import { scoreRun, type EvalCase, type RunScore } from "./score.ts";
import { CRITERIA, judgeRun } from "./criteria.ts";

/* ---------- 引数 ---------- */
const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const MODELS = opt("--models", PREFERRED.map((m) => `gemini:${m}`).join(",")).split(",").filter(Boolean);
const RUNS = Number(opt("--runs", "3"));
const CASES = opt("--cases", "").split(",").filter(Boolean);
const OUT = opt("--out", "docs/eval");
const GAP_MS = Number(opt("--gap", "4000"));
const DRY = args.includes("--dry");

/* ---------- 鍵（.env.local。値は表示しない・結果にも書かない） ---------- */
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/* ---------- 正解 ---------- */
const cases: EvalCase[] = readdirSync("eval/cases")
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join("eval/cases", f), "utf8")) as EvalCase)
  .filter((c) => CASES.length === 0 || CASES.includes(c.id));
if (cases.length === 0) throw new Error("評価するメモがありません");

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function inputs(c: EvalCase) {
  const items = itemsByIds(c.items, libraryFor(c.record_type));
  if (items.length !== c.items.length) throw new Error(`${c.id}: 知らない項目 id がある`);
  const prompt = buildPrompt(items, [], c.record_type);
  const image = { mimeType: "image/jpeg", base64: readFileSync(c.image).toString("base64") };
  return { prompt, image };
}

type RunRecord = {
  model: string;
  case: string;
  run: number;
  ok: boolean;
  ms: number;
  status?: number;
  error?: string;
  score?: RunScore;
  pass?: boolean;
  reasons?: string[];
  output?: unknown;
};

if (DRY) {
  for (const c of cases) {
    const { prompt, image } = inputs(c);
    console.log(`${c.id}: 項目 ${c.items.length}・要点 ${c.facts.length}・印 ${c.marks.length}・塗り ${c.masks.length}・プロンプト ${prompt.length}字（${sha(prompt)}）・画像 ${image.base64.length}字`);
  }
  for (const m of MODELS) {
    const { provider, model } = parseModelSpec(m);
    console.log(`${provider.id}:${model} 鍵 ${provider.keyEnv} ${process.env[provider.keyEnv] ? "あり" : "なし"}`);
  }
  process.exit(0);
}

/* ---------- 実行（回ごとに全メモ→次の回。呼ぶ間は空ける） ---------- */
const records: RunRecord[] = [];
const stopped = new Map<string, string>();
const busyStreak = new Map<string, number>();
const started = new Date();
for (let run = 1; run <= RUNS; run++) {
  for (const spec of MODELS) {
    const { provider, model } = parseModelSpec(spec);
    const key = process.env[provider.keyEnv];
    if (!key) throw new Error(`${spec}: 鍵（${provider.keyEnv}）がありません`);
    for (const c of cases) {
      if (stopped.has(spec)) break;
      const { prompt, image } = inputs(c);
      const t0 = Date.now();
      const r = await provider.call(model, prompt, [image], key);
      const ms = Date.now() - t0;
      const rec: RunRecord = { model: spec, case: c.id, run, ok: false, ms };
      if (!r.ok) {
        rec.status = r.status;
        rec.error = r.error.replace(/AIza[0-9A-Za-z_-]{20,}/g, "（鍵）").slice(0, 300);
        if (r.status === 429) stopped.set(spec, "枠切れ（429）");
        busyStreak.set(spec, r.status === 503 ? (busyStreak.get(spec) ?? 0) + 1 : 0);
        if ((busyStreak.get(spec) ?? 0) >= 2) stopped.set(spec, "混雑（503）が2回続いた");
      } else {
        busyStreak.set(spec, 0);
        const data = finishConversion(r.text, c.record_type);
        if (!data) {
          rec.status = 200;
          rec.error = "返答を記録の形に読めない";
        } else {
          rec.ok = true;
          rec.score = scoreRun(c, data);
          const j = judgeRun(c, rec.score);
          rec.pass = j.pass;
          rec.reasons = j.reasons;
          rec.output = data;
        }
      }
      records.push(rec);
      const tag = rec.ok ? (rec.pass ? "合" : `否（${rec.reasons!.join("・")}）`) : `失敗 ${rec.status}`;
      console.log(`${spec} ${c.id} #${run}  ${(ms / 1000).toFixed(1)}秒  ${tag}`);
      await sleep(GAP_MS);
    }
  }
}

/* ---------- まとめ ---------- */
const pct = (x: number) => `${Math.round(x * 100)}%`;
const range = (xs: number[]) => (xs.length ? (Math.min(...xs) === Math.max(...xs) ? `${xs[0]}` : `${Math.min(...xs)}〜${Math.max(...xs)}`) : "—");
const lines: string[] = [];
const stamp = started.toISOString();
let commit = "";
try {
  commit = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}
lines.push(`# 評価キットの結果 ${stamp.slice(0, 10)}`, "");
lines.push(`- 実行: ${stamp}（commit ${commit}）・各メモ ${RUNS}回・モデル: ${MODELS.join("、")}`);
lines.push(`- 合否の目安（eval/criteria.ts）: 作り話 ${CRITERIA.maxFabrications}・印の箇所を申告なし ${CRITERIA.maxUndeclared}・黄が印の ${CRITERIA.minYellowOnMarksRatio * 100}%以上と重なる・要点の一致率 ${CRITERIA.minRecall * 100}%以上・塗った箇所はすべて「〇〇」`);
lines.push(`- プロンプト: ${cases.map((c) => `${c.id}=${sha(inputs(c).prompt)}`).join("・")}（lib/prompt.ts の buildPrompt・辞書なし）`, "");
lines.push("| モデル | メモ | 成功/試行 | 要点の一致率 | 振り分け | 黄（件） | 黄∩印 | 申告なし | 作り話 | 〇〇 | 時間（秒） | 失敗 | 合否 |");
lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
/** 合格／不合格／判定できない（成功していないメモがある＝混雑・枠切れで測れなかった） */
const verdict = new Map<string, "合格" | "不合格" | "判定できない">();
for (const spec of MODELS) {
  let anyFail = false;
  let anyUntested = false;
  for (const c of cases) {
    const rs = records.filter((r) => r.model === spec && r.case === c.id);
    const ok = rs.filter((r) => r.ok);
    const fails = rs.filter((r) => !r.ok).map((r) => r.status);
    if (ok.some((r) => !r.pass)) anyFail = true;
    if (ok.length === 0) anyUntested = true;
    const s = ok.map((r) => r.score!);
    lines.push(
      `| ${spec} | ${c.id} | ${ok.length}/${rs.length} | ${s.length ? s.map((x) => pct(x.recall)).join("・") : "—"} | ${s.length ? s.map((x) => pct(x.placement)).join("・") : "—"} | ${range(s.map((x) => x.yellow))} | ${s.length ? s.map((x) => `${x.yellowOnMarks}/${c.marks.length}`).join("・") : "—"} | ${s.length ? s.map((x) => x.undeclared).join("・") : "—"} | ${s.length ? s.map((x) => x.fabrications.length).join("・") : "—"} | ${c.masks.length ? (s.length ? s.map((x) => `${x.masks.ok}/${x.masks.total}`).join("・") : "—") : "—"} | ${ok.length ? (ok.reduce((a, r) => a + r.ms, 0) / ok.length / 1000).toFixed(1) : "—"} | ${fails.length ? fails.join("・") : "0"} | ${ok.length === 0 ? "—" : ok.every((r) => r.pass) ? "合" : "否"} |`
    );
  }
  // 1回でも否があれば不合格（測れなかったメモがあっても）。否が無く、測れなかったメモがあれば判定できない
  verdict.set(spec, anyFail ? "不合格" : anyUntested ? "判定できない" : "合格");
}
lines.push("");
for (const spec of MODELS) lines.push(`- **${spec}: ${verdict.get(spec)}**${stopped.has(spec) ? `（途中で止めた: ${stopped.get(spec)}）` : ""}`);
lines.push("", "## 回ごとの中身", "");
for (const r of records) {
  if (!r.ok) {
    lines.push(`- ${r.model} ${r.case} #${r.run}: 失敗（${r.status}）${(r.error ?? "").split("\n")[0].slice(0, 120)}`);
    continue;
  }
  const s = r.score!;
  const marks = s.marks.map((m) => `${m.id}=${m.outcome}${m.token ? `「${m.token}」` : ""}${m.excerpt ? `（…${m.excerpt}…）` : ""}`).join("、");
  const fab = s.fabrications.map((f) => `${f.kind}「${f.text}」（…${f.excerpt}…）`).join("、");
  lines.push(
    `- ${r.model} ${r.case} #${r.run}: 印 ${marks || "なし"}${fab ? `／作り話 ${fab}` : ""}${s.facts.missing.length ? `／読めなかった要点 ${s.facts.missing.join("・")}` : ""}${s.facts.misplaced.length ? `／別の項目 ${s.facts.misplaced.join("・")}` : ""}${r.reasons?.length ? `／否の理由 ${r.reasons.join("・")}` : ""}`
  );
}
const calls = records.length;
lines.push("", `- API の呼び出し: ${calls}回（${MODELS.map((m) => `${m} ${records.filter((r) => r.model === m).length}回`).join("・")}）`);

mkdirSync(OUT, { recursive: true });
const name = `${stamp.slice(0, 10)}-${stamp.slice(11, 16).replace(":", "")}`;
writeFileSync(join(OUT, `${name}.md`), lines.join("\n") + "\n");
writeFileSync(
  join(OUT, `${name}.json`),
  JSON.stringify({ started: stamp, commit, models: MODELS, runs: RUNS, criteria: CRITERIA, prompts: Object.fromEntries(cases.map((c) => [c.id, sha(inputs(c).prompt)])), records }, null, 1) + "\n"
);
console.log(`\n${join(OUT, name)}.md / .json に残した（API ${calls}回）`);
for (const spec of MODELS) console.log(`${spec}: ${verdict.get(spec)}`);
