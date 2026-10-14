// 評価キット（P20）の採点。モデルの返答を本番と同じ後処理（lib/convert-core.ts）に通した「記録のデータ」を、正解（eval/cases/*.json）と比べる。
// 純関数だけ（API を呼ばない）。tests/eval.test.mts が、正解どおりの出力・作り話を混ぜた出力などで確かめている。
//
// [DECISION 2026-10-14] **「正しく読めた割合」は要点（キーワード）の一致率で測る**（文字単位の一致率は使わない）。
//   変換の出力は書き起こしではなく、項目ごとに書き直した文（「週3 で B型作業所」→「週3日、B型作業所に通っている」）なので、
//   文字を並べて比べると、正しい言い換えまで「読めていない」に数えてしまう。正解側に要点ごとの語（言い換えの候補つき）を持たせ、
//   1つの項目の中にすべて出ていれば「読めた」とする。読みにくくした箇所（印）はこの割合から外し、別に数える。
// [DECISION 2026-10-14] **作り話は機械で確かめられるものだけを数える**: ①正解に無い数（日付・回数・金額など）を、申告（黄・青）なしで書いた
//   ②塗った名前・正解側に挙げた作り話の語が出た。③印の箇所を申告なしで処理した（誤読か欠落）は「申告なし」として別に数え、
//   前後の文を残して人が読めるようにする（誤読か欠落かは機械では見分けられない）。

import type { Converted, Token } from "../lib/convert-core.ts";

export type Fact = { id: string; all: string[][]; items: string[] };
export type Mark = { id: string; answer: string[]; context: string[] };
export type Mask = { id: string; context: string[] };
export type EvalCase = {
  id: string;
  title: string;
  source: string;
  image: string;
  record_type: "interview" | "meeting";
  items: string[];
  text: string;
  facts: Fact[];
  marks: Mark[];
  masks: Mask[];
  maskedNames: string[];
  forbidden: string[];
};

/** 比べる前にそろえる: 全角・半角（NFKC）・空白を消す・波ダッシュをそろえる */
export function norm(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "").replace(/[～~]/g, "〜");
}

type Tok = { t: Token["t"]; s: string; raw: string; cands: string; start: number; end: number };
type Seg = { sec: string; text: string; toks: Tok[] };

/** 項目ごと（とこぼれ枠）の文。トークンの位置も持つ。AIの気づきは記録ではないので入れない */
export function segments(c: Converted): Seg[] {
  const segs: Seg[] = c.sections.map((sec) => {
    let text = "";
    const toks: Tok[] = [];
    for (const t of sec.tokens) {
      const s = norm(t.s ?? "");
      toks.push({ t: t.t, s, raw: t.s ?? "", cands: norm((t.cands ?? []).join("|")), start: text.length, end: text.length + s.length });
      text += s;
    }
    return { sec: sec.id, text, toks };
  });
  for (const sp of c.spill) {
    const s = norm(sp.text ?? "");
    segs.push({ sec: "spill", text: s, toks: [{ t: "p", s, raw: sp.text ?? "", cands: "", start: 0, end: s.length }] });
  }
  return segs;
}

const hasAny = (text: string, alts: string[]) => alts.some((a) => text.includes(norm(a)));
const factIn = (f: Fact, text: string) => f.all.every((g) => hasAny(text, g));

/** 数を取り出す（12,000 → 12000・09 → 9）。空白で区切られた数をくっつけないよう、空白は消さずに読む */
export function numbers(s: string): string[] {
  return (s.normalize("NFKC").match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => String(Number(n.replace(/,/g, ""))));
}

/** 文の中の語の位置（すべて） */
function positions(text: string, word: string): number[] {
  const w = norm(word);
  const out: number[] = [];
  if (!w) return out;
  for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + 1)) out.push(i);
  return out;
}

/** トークンと、印の前後の語との距離（同じ項目の中だけ。無ければ Infinity） */
function distance(seg: Seg, tok: Tok, mark: Mark): number {
  let best = Infinity;
  for (const c of mark.context) {
    for (const p of positions(seg.text, c)) {
      const e = p + norm(c).length;
      const d = e < tok.start ? tok.start - e : p > tok.end ? p - tok.end : 0;
      best = Math.min(best, d);
    }
  }
  return best;
}

/** 印のそばと見なす距離（字数） */
export const NEAR = 30;

export type MarkOutcome = "黄" | "青" | "正読" | "申告なし" | "抜け";
export type MarkResult = { id: string; outcome: MarkOutcome; token?: string; excerpt?: string };

/** 黄（または青）のトークンを印に割り当てる。答えの語が入っているものを先に、残りは前後の語に近いものへ。1つの印に1つまで */
function assign(segs: Seg[], marks: Mark[], kind: "y" | "b", taken: Map<string, string>): void {
  const toks = segs.flatMap((seg) => seg.toks.filter((t) => t.t === kind).map((t) => ({ seg, t })));
  const used = new Set<Tok>();
  for (const { t } of toks) {
    const m = marks.find((m) => !taken.has(m.id) && hasAny(t.s + "|" + t.cands, m.answer));
    if (m) {
      taken.set(m.id, t.s);
      used.add(t);
    }
  }
  for (const { seg, t } of toks) {
    if (used.has(t)) continue;
    let best: Mark | null = null;
    let bestD = Infinity;
    for (const m of marks) {
      if (taken.has(m.id)) continue;
      const d = distance(seg, t, m);
      if (d <= NEAR && d < bestD) {
        best = m;
        bestD = d;
      }
    }
    if (best) {
      taken.set(best.id, t.s);
      used.add(t);
    }
  }
}

function excerptAround(segs: Seg[], words: string[]): string | undefined {
  for (const seg of segs) {
    for (const w of words) {
      const p = positions(seg.text, w)[0];
      if (p !== undefined) return seg.text.slice(Math.max(0, p - NEAR), p + norm(w).length + NEAR);
    }
  }
  return undefined;
}

export type Fabrication = { kind: "数" | "名前" | "作り話の語"; text: string; excerpt: string };

export type RunScore = {
  facts: { total: number; found: number; placed: number; missing: string[]; misplaced: string[] };
  /** 要点の一致率（印の箇所を除く） */
  recall: number;
  /** 振り分けの一致率（読めた要点のうち、正解の項目に入ったもの） */
  placement: number;
  yellow: number;
  blue: number;
  red: number;
  marks: MarkResult[];
  yellowOnMarks: number;
  undeclared: number;
  fabrications: Fabrication[];
  masks: { total: number; ok: number; oo: number };
};

export function scoreRun(c: EvalCase, out: Converted): RunScore {
  const segs = segments(out);
  // 要点と振り分け
  const missing: string[] = [];
  const misplaced: string[] = [];
  let found = 0;
  let placed = 0;
  for (const f of c.facts) {
    const where = segs.filter((s) => factIn(f, s.text));
    if (where.length === 0) {
      missing.push(f.id);
      continue;
    }
    found++;
    if (where.some((s) => f.items.includes(s.sec))) placed++;
    else misplaced.push(`${f.id}→${where.map((s) => s.sec).join("/")}`);
  }
  const all = segs.flatMap((s) => s.toks);
  // 印（読みにくくした箇所）
  const yTaken = new Map<string, string>();
  assign(segs, c.marks, "y", yTaken);
  const bTaken = new Map<string, string>();
  assign(
    segs,
    c.marks.filter((m) => !yTaken.has(m.id)),
    "b",
    bTaken
  );
  const marks: MarkResult[] = c.marks.map((m) => {
    if (yTaken.has(m.id)) return { id: m.id, outcome: "黄", token: yTaken.get(m.id) };
    if (bTaken.has(m.id)) return { id: m.id, outcome: "青", token: bTaken.get(m.id) };
    // 申告なし: 前後の語のそばに答えがあれば正読、前後の語だけあれば誤読か欠落、前後の語も無ければ抜け
    for (const seg of segs) {
      for (const cx of m.context) {
        for (const p of positions(seg.text, cx)) {
          const win = seg.text.slice(Math.max(0, p - NEAR), p + norm(cx).length + NEAR);
          if (hasAny(win, m.answer)) return { id: m.id, outcome: "正読" };
        }
      }
    }
    const ex = excerptAround(segs, m.context);
    return ex ? { id: m.id, outcome: "申告なし", excerpt: ex } : { id: m.id, outcome: "抜け" };
  });
  // 作り話: ①正解に無い数（申告なし） ②塗った名前 ③作り話の語
  const truthNums = new Set(numbers(c.text));
  const fabrications: Fabrication[] = [];
  for (const seg of segs) {
    for (const t of seg.toks) {
      if (t.t === "y" || t.t === "b") continue;
      for (const n of numbers(t.raw)) {
        if (!truthNums.has(n)) {
          const p = seg.text.indexOf(n, t.start);
          fabrications.push({ kind: "数", text: n, excerpt: seg.text.slice(Math.max(0, p - 15), p + n.length + 15) });
        }
      }
    }
  }
  const full = segs.map((s) => s.text).join("\n");
  for (const nm of c.maskedNames) if (full.includes(norm(nm))) fabrications.push({ kind: "名前", text: nm, excerpt: excerptAround(segs, [nm]) ?? "" });
  for (const fw of c.forbidden) if (full.includes(norm(fw))) fabrications.push({ kind: "作り話の語", text: fw, excerpt: excerptAround(segs, [fw]) ?? "" });
  // 塗った箇所: 「〇〇」の数と、塗った箇所の前後に「〇〇」があるか
  const OO = /[〇○◯]{2,}/;
  const oo = (full.match(/[〇○◯]{2,}/g) ?? []).length;
  let maskOk = 0;
  for (const mk of c.masks) {
    const ok = segs.some((seg) =>
      mk.context.some((cx) =>
        positions(seg.text, cx).some((p) => OO.test(seg.text.slice(Math.max(0, p - 20), p + norm(cx).length + 20)))
      )
    );
    if (ok) maskOk++;
  }
  const yellowOnMarks = marks.filter((m) => m.outcome === "黄").length;
  return {
    facts: { total: c.facts.length, found, placed, missing, misplaced },
    recall: c.facts.length ? found / c.facts.length : 1,
    placement: found ? placed / found : 0,
    yellow: all.filter((t) => t.t === "y").length,
    blue: all.filter((t) => t.t === "b").length,
    red: all.filter((t) => t.t === "r").length,
    marks,
    yellowOnMarks,
    undeclared: marks.filter((m) => m.outcome === "申告なし" || m.outcome === "抜け").length,
    fabrications,
    masks: { total: c.masks.length, ok: maskOk, oo },
  };
}
