// 毎日の見張り（P23・2026-10-14）: Gemini の無料枠のモデルが消えた・課金が要るようになった・新しく出た、を毎晩確かめる。
// GitHub Actions（.github/workflows/watch.yml）が毎日 22:00（日本時間）に1回呼ぶ。手元でも動く:
//   node eval/watch.mts --state <置き場所>        … 置き場所に state.json・congestion.md・eval/ を書く（既定は watch-state）
//
// [DECISION 2026-10-14・設計側] **評価用の鍵（GEMINI_EVAL_API_KEY）だけで動く**。鍵が無ければ何もせず静かに終わる
//   （終了コード 0・Issue も立てない・失敗の通知を出さない）。本番の鍵（GEMINI_API_KEY）には決して切り替えない（eval/providers.ts の keyFor）。
// やること（1日1回。どれも再試行しない・呼ぶ間は空ける）:
//   1. 評価用の鍵でモデルの一覧を引き、前回（state.json）と比べる
//   2. 試験済み・緊急用（lib/gemini.ts の MODEL_TIERS）の各モデルで、評価用のメモ1件（WATCH_CASE）を1回だけ変換する
//   3. Issue を立てる（**同じ題の Issue が開いていれば立てない**）:
//      - 試験済みのモデルが一覧から消えた／課金が要る／使えない（404）／変換に失敗した（混雑・上限以外の失敗・返答を読めない）
//      - 試験済みのモデルが BUSY_DAYS 日続けて混雑した
//        [DECISION 2026-10-14] 委任された判断: 1晩の混雑は Issue にしない（混雑の記録に残すだけ）。続くときだけ「失敗した」とみなす
//      - 新しい Flash 系のモデルが一覧に出た（評価キット eval/run.mts を 3件×1回 走らせ、結果を本文に付ける）
//      ※ 緊急用のモデルの異常は Issue にしない（設計側の指示が試験済みだけ）。混雑の記録には残る
//   4. 混雑の記録（congestion.md: 時刻・モデル・結果）に1行ずつ足し、state.json を書く
// 置き場所は GitHub の watch-log ブランチ（main とは別の、記録だけの枝。ワークフローがコミットする）。

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ALL_TIER_MODELS, MODEL_TIERS, callModel, failKind, listCandidates, type FailKind } from "../lib/gemini.ts";
import { finishConversion } from "../lib/convert-core.ts";
import { inputs, loadCases } from "./cases.ts";
import { scoreRun } from "./score.ts";
import { judgeRun } from "./criteria.ts";
import { PROVIDERS, keyFor, loadEnvLocal } from "./providers.ts";

/** 毎晩の小さな変換に使うメモ（eval/cases の id） */
export const WATCH_CASE = "hard";
/** 試験済みのモデルが何日続けて混雑したら Issue にするか */
export const BUSY_DAYS = 3;

export type WatchState = {
  /** 前回の見張りの時刻（ISO） */
  checkedAt: string;
  /** 前回の一覧（画像を読めるモデル・lib/gemini.ts の orderCandidates） */
  models: string[];
  /** モデルごとの、続けて混雑した日数 */
  busyDays: Record<string, number>;
};

/** 1つのモデルを1回試した結果。unlisted＝一覧に無いので呼んでいない／unreadable＝返答を記録の形に読めない */
export type Probe = {
  at: string;
  model: string;
  tier: "tested" | "emergency";
  result: "ok" | FailKind | "unlisted" | "unreadable";
  status: number;
  ms: number;
  pass?: boolean;
  reasons?: string[];
  error?: string;
};

export type IssueSpec = { title: string; body: string };

/** 日本時間の「YYYY-MM-DD HH:MM」 */
export const jstStamp = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");

/** 新しく一覧に出た Flash 系のモデル（2段に入っているものは除く）。初回（前回が無い）は比べようがないので空 */
export function newFlashModels(prev: string[] | null, now: string[], known: readonly string[] = ALL_TIER_MODELS): string[] {
  if (!prev) return [];
  return now.filter((m) => /flash/i.test(m) && !prev.includes(m) && !known.includes(m));
}

/** 続けて混雑した日数を数え直す（混雑でない日は 0 に戻す） */
export function nextBusyDays(prev: Record<string, number>, probes: Probe[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of probes) out[p.model] = p.result === "busy" ? (prev[p.model] ?? 0) + 1 : 0;
  return out;
}

const RESULT_TEXT: Record<Probe["result"], string> = {
  ok: "変換できた",
  busy: "混雑",
  quota: "1日の上限",
  paid: "課金が要る",
  gone: "使えない（404）",
  error: "失敗",
  unlisted: "一覧に無い（呼んでいない）",
  unreadable: "返答を記録の形に読めない",
};

export const CONGESTION_HEAD = "# 混雑の記録（毎日の見張り・eval/watch.mts）\n\n| 日時（日本時間） | モデル | 段 | 結果 | HTTP | 秒 |\n|---|---|---|---|---|---|\n";

/** 混雑の記録の1行 */
export function congestionRow(p: Probe): string {
  const res = p.result === "ok" ? `${RESULT_TEXT.ok}（${p.pass ? "合" : `否: ${(p.reasons ?? []).join("・")}`}）` : RESULT_TEXT[p.result];
  return `| ${jstStamp(p.at)} | ${p.model} | ${p.tier === "tested" ? "試験済み" : "緊急用"} | ${res} | ${p.status || "—"} | ${p.result === "unlisted" ? "—" : (p.ms / 1000).toFixed(1)} |`;
}

/** 立てる Issue（題は日付を含めない＝同じ異常が続いても重ねて立てない） */
export function issuesFor(a: { at: string; probes: Probe[]; busyDays: Record<string, number>; newModels: { model: string; report: string }[] }): IssueSpec[] {
  const out: IssueSpec[] = [];
  const foot = (p: Probe) =>
    [
      "",
      `- 見張りの日時: ${jstStamp(a.at)}（日本時間）`,
      `- 結果: ${RESULT_TEXT[p.result]}（HTTP ${p.status || "—"}）`,
      p.error ? `- 返ってきた中身（先頭）: ${p.error.replace(/\s+/g, " ").slice(0, 600)}` : "",
      "- 試験済み・緊急用の正本: `lib/gemini.ts` の `MODEL_TIERS`。入れ替えは評価キット（`eval/`）で測ってから設計側が決める。",
      "- 混雑の記録: `watch-log` ブランチの `congestion.md`",
    ]
      .filter(Boolean)
      .join("\n");
  for (const p of a.probes.filter((x) => x.tier === "tested")) {
    const m = p.model;
    let title = "";
    let what = "";
    if (p.result === "unlisted") {
      title = `見張り: 試験済みのモデル ${m} が一覧から消えた`;
      what = "評価用の鍵で引いたモデルの一覧に、試験済みのモデルがありません。本番は緊急用で読みます（緊急用も無ければ変換できません）。";
    } else if (p.result === "paid") {
      title = `見張り: 試験済みのモデル ${m} に課金が要る`;
      what = "無料枠で呼べなくなった可能性があります（429 で枠が 0、または課金・地域の制限）。本番は緊急用で読みます。";
    } else if (p.result === "gone") {
      title = `見張り: 試験済みのモデル ${m} が使えない`;
      what = "一覧にはありますが、呼ぶと 404 が返りました。本番は緊急用で読みます。";
    } else if (p.result === "error" || p.result === "unreadable") {
      title = `見張り: 試験済みのモデル ${m} で変換に失敗した`;
      what = "混雑・上限以外の理由で、評価用のメモを変換できませんでした。本番では緊急用に回さずに止まる種類の失敗です。";
    } else if (p.result === "busy" && (a.busyDays[m] ?? 0) >= BUSY_DAYS) {
      title = `見張り: 試験済みのモデル ${m} が${BUSY_DAYS}日続けて混雑`;
      what = `${a.busyDays[m]}晩続けて、22時の小さな変換が混雑（503 など）で失敗しました。本番では緊急用で読む回が増えている可能性があります。`;
    }
    if (title) out.push({ title, body: what + "\n" + foot(p) });
  }
  for (const n of a.newModels) {
    out.push({
      title: `見張り: 新しい Flash 系のモデル ${n.model} が一覧に出た`,
      body: [
        "評価用の鍵で引いた一覧に、前回は無かった Flash 系のモデルが出ました。評価キットを 3件×1回 走らせた結果を下に付けます。",
        "試験済みへ入れるかどうかは設計側が決めます（`lib/gemini.ts` の `MODEL_TIERS`）。",
        "",
        `- 見張りの日時: ${jstStamp(a.at)}（日本時間）`,
        "",
        "---",
        "",
        n.report.slice(0, 50_000),
      ].join("\n"),
    });
  }
  return out;
}

type Fetch = typeof fetch;

/** 同じ題の Issue が開いていれば立てない。立てた題と見送った題を返す */
export async function openIssues(specs: IssueSpec[], repo: string, token: string, f: Fetch = fetch): Promise<{ opened: string[]; skipped: string[] }> {
  if (specs.length === 0) return { opened: [], skipped: [] };
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "memo-okoshi-watch",
  };
  const res = await f(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, { headers });
  if (!res.ok) throw new Error(`開いている Issue を読めない: HTTP ${res.status}`);
  const open = ((await res.json()) as { title: string; pull_request?: unknown }[]).filter((i) => !i.pull_request).map((i) => i.title);
  const opened: string[] = [];
  const skipped: string[] = [];
  for (const s of specs) {
    if (open.includes(s.title) || opened.includes(s.title)) {
      skipped.push(s.title);
      continue;
    }
    const r = await f(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ title: s.title, body: s.body }),
    });
    if (!r.ok) throw new Error(`Issue を立てられない: HTTP ${r.status}（${s.title}）`);
    opened.push(s.title);
  }
  return { opened, skipped };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const maskKey = (s: string) => s.replace(/AIza[0-9A-Za-z_-]{20,}/g, "（鍵）");

/** 1つのモデルで評価用のメモを1回だけ変換する（本番と同じ callModel・finishConversion） */
async function probe(model: string, tier: Probe["tier"], listed: string[], key: string): Promise<Probe> {
  const at = new Date().toISOString();
  if (!listed.includes(model)) return { at, model, tier, result: "unlisted", status: 0, ms: 0 };
  const c = loadCases([WATCH_CASE])[0];
  const { prompt, image } = inputs(c);
  const t0 = Date.now();
  const r = await callModel(model, prompt, [image], key);
  const ms = Date.now() - t0;
  if (!r.ok) return { at, model, tier, result: failKind(r.status, r.error), status: r.status, ms, error: maskKey(r.error).slice(0, 2000) };
  const data = finishConversion(r.text, c.record_type);
  if (!data) return { at, model, tier, result: "unreadable", status: 200, ms };
  const j = judgeRun(c, scoreRun(c, data));
  return { at, model, tier, result: "ok", status: 200, ms, pass: j.pass, reasons: j.reasons };
}

/** 新しいモデルを評価キットで 3件×1回 測り、結果の表（md）を返す。評価キットも評価用の鍵だけを使う */
function evalNewModel(model: string, stateDir: string, gap: number): string {
  const r = spawnSync(
    process.execPath,
    [...process.execArgv, "eval/run.mts", "--models", `gemini:${model}`, "--runs", "1", "--out", join(stateDir, "eval"), "--gap", String(gap)],
    { encoding: "utf8", env: process.env }
  );
  const m = (r.stdout ?? "").match(/^(.+)\.md \/ \.json に残した/m);
  if (r.status === 0 && m && existsSync(`${m[1]}.md`)) return readFileSync(`${m[1]}.md`, "utf8");
  return `評価キットが最後まで動きませんでした（終了コード ${r.status}）。\n\n\`\`\`\n${maskKey(((r.stdout ?? "") + (r.stderr ?? "")).slice(-3000))}\n\`\`\``;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string, def: string) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
  };
  const stateDir = opt("--state", "watch-state");
  const gap = Number(opt("--gap", "4000"));

  loadEnvLocal();
  const k = keyFor(PROVIDERS.gemini);
  if (!k.ok) {
    if (k.missing) {
      // 鍵が未登録: 何もせず静かに終わる（失敗の通知を出さない）
      console.log("評価用の鍵（GEMINI_EVAL_API_KEY）が登録されていないので、何もせずに終わる。");
      return;
    }
    console.error(k.message);
    process.exitCode = 2;
    return;
  }
  const key = k.key;
  const at = new Date().toISOString();
  const statePath = join(stateDir, "state.json");
  const prev: WatchState | null = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")) as WatchState) : null;
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const token = process.env.GITHUB_TOKEN ?? "";
  const report = async (specs: IssueSpec[]) => {
    if (!repo || !token) {
      for (const s of specs) console.log(`（手元なので Issue は立てない）${s.title}`);
      return;
    }
    const { opened, skipped } = await openIssues(specs, repo, token);
    for (const t of opened) console.log(`Issue を立てた: ${t}`);
    for (const t of skipped) console.log(`同じ題の Issue が開いているので立てない: ${t}`);
  };

  // 1. 一覧
  let listed: string[];
  try {
    listed = await listCandidates(key);
  } catch (e) {
    const msg = maskKey(String(e)).slice(0, 1500);
    console.log(`一覧を引けない: ${msg}`);
    await report([
      {
        title: "見張り: 評価用の鍵でモデルの一覧を引けない",
        body: `評価用の鍵（GEMINI_EVAL_API_KEY）でモデルの一覧を引けませんでした。鍵が無効になった・消された可能性があります。\n\n- 見張りの日時: ${jstStamp(at)}（日本時間）\n- 中身（先頭）: ${msg}`,
      },
    ]);
    return;
  }
  const fresh = newFlashModels(prev?.models ?? null, listed);
  const gone = (prev?.models ?? []).filter((m) => !listed.includes(m));
  console.log(`一覧: ${listed.length}件${prev ? `（前回から 増 ${listed.filter((m) => !prev.models.includes(m)).length}・減 ${gone.length}）` : "（初回なので比べない）"}`);

  // 2. 試験済み・緊急用で1回ずつ
  const probes: Probe[] = [];
  const order: [string, Probe["tier"]][] = [...MODEL_TIERS.tested.map((m) => [m, "tested"] as [string, Probe["tier"]]), ...MODEL_TIERS.emergency.map((m) => [m, "emergency"] as [string, Probe["tier"]])];
  let called = false;
  for (const [m, tier] of order) {
    if (called && listed.includes(m)) await sleep(gap); // 呼ぶ間は空ける
    const p = await probe(m, tier, listed, key);
    called ||= p.result !== "unlisted";
    probes.push(p);
    console.log(congestionRow(p));
  }
  const busyDays = nextBusyDays(prev?.busyDays ?? {}, probes);

  // 3. 新しい Flash 系は評価キットで 3件×1回
  const newModels = fresh.map((model) => {
    console.log(`新しい Flash 系のモデル: ${model}（評価キットで 3件×1回 測る）`);
    return { model, report: evalNewModel(model, stateDir, gap) };
  });
  await report(issuesFor({ at, probes, busyDays, newModels }));

  // 4. 記録
  mkdirSync(stateDir, { recursive: true });
  const logPath = join(stateDir, "congestion.md");
  const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : CONGESTION_HEAD;
  writeFileSync(logPath, log + probes.map(congestionRow).join("\n") + "\n");
  const next: WatchState = { checkedAt: at, models: listed, busyDays };
  writeFileSync(statePath, JSON.stringify(next, null, 1) + "\n");
  console.log(`${stateDir} に記録した（state.json・congestion.md）`);
}

// テストが関数だけを読み込むときは動かさない（node eval/watch.mts で直に呼ばれたときだけ動く）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
