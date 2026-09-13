// 確認・出力画面の状態ロジック（純関数のみ・Reactに依存しない）。
// UIから切り離してあるのは、下記の不変条件を機械テストで保証するため。
//
//  不変条件1: 転記用テキスト・項目コピーは insights / spill に一切触れない
//             （記録と助言を混ぜない = 公式文書への混入防止）
//  不変条件2: 未解決の赤（人名）が1つでもあれば、完成も項目コピーもブロックされる
//
// ※ ランタイム依存を持たない（import type のみ）。tests から node --test で直接読める。

import type { ItemDef } from "./items";

export type TokenKind = "p" | "y" | "b" | "r";

export type Token = {
  t: TokenKind;
  s: string;
  cands?: string[];
  note?: string;
  /** 将来: 元メモの該当箇所への参照。P3時点ではAPIが返さず、連動はスコープ外（フックのみ） */
  ref?: string | null;
  resolved?: boolean;
};

export type SpillItem = {
  text: string;
  sug: string | null;
  ref?: string | null;
  /** 項目をオフにして降格した分。復帰時に元のトークンを保つ */
  keepTokens?: boolean;
};

export type Insight = { s: string; why: string; refs: string[] };

export type RecordState = {
  tokens: Record<string, Token[]>;
  enabled: Record<string, boolean>;
  order: string[];
  spill: SpillItem[];
  insights: Insight[];
  /** これまでの変換（初回＋再変換）でAIに渡した項目 id。未変換の項目に「再変換」を出す判定に使う */
  converted?: string[];
};

/* ---------- API応答 → 状態 ---------- */

export type ApiData = {
  record_type?: string;
  sections: { id: string; tokens: Token[] }[];
  spill: { text: string; suggest: string | null }[];
  insights: { text: string; why: string; refs: string[] }[];
};

export function fromApi(
  data: ApiData,
  lib: ItemDef[],
  enabled: Record<string, boolean>,
  order: string[]
): RecordState {
  const tokens: Record<string, Token[]> = {};
  lib.forEach((l) => {
    tokens[l.id] = [];
  });
  // [DECISION 2026-09-10] **知らない id の節が来ても黙って捨てない**（原則2）。
  //   プロンプトは選んだ id しか渡していないが、用紙に「その他」の枠を常設した（P7-g）ので、
  //   AIが勝手な id（"sonota" など）を作る可能性がゼロではない。落とさずこぼれ枠へ回す。
  const strays: { text: string; sug: string | null }[] = [];
  data.sections.forEach((s) => {
    if (s.id in tokens) {
      tokens[s.id] = s.tokens ?? [];
      return;
    }
    const text = flatten(s.tokens ?? []).trim();
    if (text) strays.push({ text, sug: null });
  });
  return {
    tokens,
    enabled,
    // 並びは受け取った時点で整える。**AIの返答の順序（data.sections の並び）は使わない**（P8-k）
    order: normalizeOrder(order, lib),
    spill: [...(data.spill ?? []).map((s) => ({ text: s.text, sug: s.suggest })), ...strays],
    insights: (data.insights ?? []).map((i) => ({ s: i.text, why: i.why, refs: i.refs ?? [] })),
    converted: data.sections.map((s) => s.id),
  };
}

/** 表示中で、まだAIに渡していない（内容が空の）項目 = 再変換で埋められる項目 */
export function pendingReconvertIds(state: RecordState): string[] {
  const done = new Set(state.converted ?? []);
  return activeIds(state).filter((id) => !done.has(id) && !flatten(state.tokens[id] ?? []).trim());
}

const norm = (s: string) => s.replace(/\s+/g, "").trim();

/**
 * 再変換の結果を取り込む（P6 項目6）。
 * [DECISION 2026-09-08]
 * - 埋めるのは「表示中で未変換かつ空」の項目だけ。人が直した項目・解決済みマーカーは一切触らない
 * - こぼれ枠: 新しく埋めた項目に移ったはずの旧こぼれ（suggest がその項目）は取り下げる。
 *   新しいこぼれは、既存のこぼれ・どこかの項目本文と同じ内容なら足さない（二重化しない）
 * - 気づきは新しい結果で置き換える（記録ではなく参考表示のため）
 */
export function mergeReconvert(state: RecordState, data: ApiData, lib: ItemDef[]): RecordState {
  const targets = new Set(pendingReconvertIds(state));
  const tokens = { ...state.tokens };
  data.sections.forEach((s) => {
    if (targets.has(s.id) && lib.some((l) => l.id === s.id)) tokens[s.id] = s.tokens ?? [];
  });
  const filled = [...targets].filter((id) => flatten(tokens[id] ?? []).trim());

  // 既存のこぼれ: 埋まった項目へ移ったもの（suggest 一致・降格分は除く）は取り下げる
  let spill = state.spill.filter((sp) => !(sp.sug && filled.includes(sp.sug) && !sp.keepTokens));
  const bodies = Object.values(tokens).map((t) => norm(flatten(t)));
  for (const s of data.spill ?? []) {
    const n = norm(s.text);
    if (!n) continue;
    if (spill.some((sp) => norm(sp.text) === n)) continue; // 既にある
    if (bodies.some((b) => b.includes(n))) continue; // どこかの項目に入っている
    spill = [...spill, { text: s.text, sug: s.suggest }];
  }

  return {
    ...state,
    tokens,
    spill,
    insights: (data.insights ?? []).map((i) => ({ s: i.text, why: i.why, refs: i.refs ?? [] })),
    converted: [...new Set([...(state.converted ?? []), ...data.sections.map((s) => s.id)])],
  };
}

/** 転記対象（記録だけ）。テキスト出力・Word・PDF はすべてここを通る（insights / spill には触れない） */
export function recordEntries(state: RecordState, lib: ItemDef[]): { id: string; label: string; text: string }[] {
  return activeIds(state)
    .map((id) => {
      const def = lib.find((l) => l.id === id);
      if (!def) return null;
      const t = flatten(state.tokens[id] ?? []);
      return { id, label: def.label, text: t.trim() ? t : "（記載なし）" };
    })
    .filter((x): x is { id: string; label: string; text: string } => x !== null);
}

/* ---------- 選択・表示順 ---------- */

export function activeIds(state: RecordState): string[] {
  return state.order.filter((id) => state.enabled[id]);
}

/**
 * 表示順（ORDER）を整える（P8-k）。確認画面のカード・転記用テキスト・Word・PDF はすべてこの並びに従う。
 *
 * [DECISION 2026-09-13] **AIの返答の順序は使わない**（sections は中身を入れるだけ）。土台は保存された並び
 *   （定義順＋利用者が↑↓で動かした順）で、次の2つだけを直す:
 *   ① 並びに抜けている項目は**定義順の位置**へ入れる（末尾に足さない）
 *   ② 締めの項目（申し送り）は**最後**へ
 *   重複と知らない id は落とす。利用者が↑↓で動かした順はそのまま残る。
 * [DECISION 2026-09-13] 以前は、項目をオフ→オンすると「締めの手前（無ければ末尾）」へ動かしていたため、
 *   面談概要が一番下へ移り、その並びが保存されて次の変換でも一番下に出ていた。**オンに戻した項目は動かさない**
 *   （並びの中の自分の場所に戻る）。追加した項目も定義順の位置に入り、締めより前に来る。
 */
export function normalizeOrder(order: readonly string[], lib: ItemDef[]): string[] {
  const known = new Set(lib.map((l) => l.id));
  const out: string[] = [];
  for (const id of order) if (known.has(id) && !out.includes(id)) out.push(id);
  lib.forEach((l, i) => {
    if (out.includes(l.id)) return;
    // 定義順で自分より前にある項目のうち、並びの中にある最も近いものの直後へ入れる（無ければ先頭）
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.indexOf(lib[j].id);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, l.id);
  });
  const closing = new Set(lib.filter((l) => l.closing).map((l) => l.id));
  return [...out.filter((id) => !closing.has(id)), ...out.filter((id) => closing.has(id))];
}

export function flatten(tokens: Token[]): string {
  return tokens.map((t) => t.s).join("");
}

export function hasOpen(tokens: Token[]): boolean {
  return tokens.some((t) => !t.resolved && t.t !== "p");
}


export function moveSection(state: RecordState, id: string, dir: -1 | 1): RecordState {
  const act = activeIds(state);
  const p = act.indexOf(id);
  const q = p + dir;
  if (p < 0 || q < 0 || q >= act.length) return state;
  const order = [...state.order];
  const a = order.indexOf(id);
  const b = order.indexOf(act[q]);
  order[a] = act[q];
  order[b] = id;
  return { ...state, order };
}

/** 項目のオン/オフ。オフ時に内容があれば「黙って捨てず」こぼれ枠へ降格する */
export function toggleItem(
  state: RecordState,
  id: string,
  lib: ItemDef[]
): { state: RecordState; demoted: boolean } {
  if (state.enabled[id]) {
    const text = flatten(state.tokens[id] ?? []);
    const demoted = Boolean(text.trim());
    const spill = demoted
      ? [...state.spill, { text, sug: id, keepTokens: true } as SpillItem]
      : state.spill;
    return {
      state: { ...state, enabled: { ...state.enabled, [id]: false }, spill },
      demoted,
    };
  }
  const enabled = { ...state.enabled, [id]: true };
  // オンに戻した・足した項目は動かさない（並びの中の自分の場所に戻る）。締めは最後（P8-k）
  const order = normalizeOrder(state.order, lib);
  // 降格していた分が残っていれば、そのまま元の内容へ戻す
  const i = state.spill.findIndex((sp) => sp.sug === id && sp.keepTokens);
  const spill = i >= 0 ? state.spill.filter((_, n) => n !== i) : state.spill;
  return { state: { ...state, enabled, order, spill }, demoted: false };
}

/** こぼれ枠から項目へ移す（再変換なし・端末内操作）。移動先は既定で suggest の項目 */
export function acceptSpill(state: RecordState, index: number, lib: ItemDef[]): RecordState {
  const it = state.spill[index];
  if (!it || !it.sug) return state;
  return moveSpillTo(state, index, it.sug, lib);
}

/**
 * こぼれ枠の1件を任意の項目へ移す。
 * [DECISION] suggest が null のこぼれにも拾い上げ導線を用意するための一般化。
 * - 移動先が空: そのまま入れる（モックの挙動）
 * - 移動先に内容あり: **上書きせず末尾に足す**（黙って捨てない原則。既存の記録を壊さない）
 * - 降格（項目オフ）由来の分を別項目へ移すときは、元項目のトークンを空にして二重化を防ぐ
 */
export function moveSpillTo(
  state: RecordState,
  index: number,
  targetId: string,
  lib: ItemDef[]
): RecordState {
  const it = state.spill[index];
  if (!it || !lib.some((l) => l.id === targetId)) return state;

  const enabled = { ...state.enabled, [targetId]: true };
  const order = normalizeOrder(state.order, lib);
  const spill = state.spill.filter((_, n) => n !== index);

  // 元の項目へ戻すだけの復帰（降格分）は、保持してあるトークンをそのまま生かす
  if (it.keepTokens && it.sug === targetId) {
    return { ...state, enabled, order, spill };
  }

  const tokens = { ...state.tokens };
  if (it.keepTokens && it.sug && it.sug !== targetId) tokens[it.sug] = [];
  const cur = tokens[targetId] ?? [];
  tokens[targetId] = flatten(cur).trim()
    ? [...cur, { t: "p" as TokenKind, s: it.text }]
    : [{ t: "p" as TokenKind, s: it.text }];

  return { ...state, enabled, order, tokens, spill };
}

/* ---------- マーカーの解消・編集 ---------- */

/**
 * 黄（読み取りに自信なし）の候補一覧。**いま表示されている語と同じものは外す**。
 *
 * [DECISION 2026-09-09] 黄のポップオーバーは「このままで確定する」を主ボタンに持つので、
 *   同じ語が候補にも並ぶと同じ選択肢が2か所に出て迷う。プロンプトは「語彙で確定できなければ
 *   cands にこの表記を含める」と指示していて、実際に s と同じ語が cands に入ってくる。
 */
export function candidatesFor(tok: Token): string[] {
  const cur = tok.s.trim();
  return (tok.cands ?? []).filter((c) => c.trim() !== cur);
}

export function resolveToken(state: RecordState, sid: string, ti: number, val: string | null): RecordState {
  const list = state.tokens[sid];
  if (!list || !list[ti]) return state;
  const next = list.map((tk, i) =>
    i === ti ? { ...tk, s: val !== null ? val : tk.s, resolved: true } : tk
  );
  return { ...state, tokens: { ...state.tokens, [sid]: next } };
}

/**
 * 条件に合う**未解決の赤**をまとめて置き換える（同じ名前を1か所ずつ直す手間を省く）。
 * [DECISION 2026-09-09] まとめ置き換えは「アルファベットの候補」を選んだときだけ使う。
 *   同じ名前には同じ記号を割り当てる決まりなので、1つずつ直しても結果は同じになる。
 *   「担当」や自由入力はその場かぎりの判断なので、押した1か所だけに効かせる。
 */
export function resolveRedWhere(
  state: RecordState,
  match: (tok: Token) => boolean,
  make: (tok: Token) => string
): { state: RecordState; count: number } {
  let count = 0;
  const tokens: Record<string, Token[]> = {};
  for (const [sid, list] of Object.entries(state.tokens)) {
    tokens[sid] = list.map((tk) => {
      if (tk.t !== "r" || tk.resolved || !match(tk)) return tk;
      count++;
      return { ...tk, s: make(tk), resolved: true };
    });
  }
  return { state: { ...state, tokens }, count };
}

export function saveEdit(state: RecordState, sid: string, text: string): RecordState {
  return { ...state, tokens: { ...state.tokens, [sid]: [{ t: "p", s: text }] } };
}

/* ---------- カウンタ・ブロック判定 ---------- */

export type Counts = { y: number; b: number; r: number };

export function counts(state: RecordState): Counts {
  const c: Counts = { y: 0, b: 0, r: 0 };
  activeIds(state).forEach((id) => {
    (state.tokens[id] ?? []).forEach((t) => {
      if (t.resolved) return;
      if (t.t === "y") c.y++;
      else if (t.t === "b") c.b++;
      else if (t.t === "r") c.r++;
    });
  });
  return c;
}

/** [DECISION] 赤（人名）が残る間は完成できない */
export function isDoneBlocked(state: RecordState): boolean {
  return counts(state).r > 0;
}

/** [DECISION] 赤（人名）が残る項目はコピーできない */
export function isSectionCopyBlocked(tokens: Token[]): boolean {
  return tokens.some((t) => t.t === "r" && !t.resolved);
}

export function sectionHasWarn(tokens: Token[]): boolean {
  return tokens.some((t) => !t.resolved && (t.t === "y" || t.t === "b"));
}

/* ---------- 出力（記録のみ。insights / spill には触れない） ---------- */

export function buildOutputText(state: RecordState, lib: ItemDef[]): string {
  let out = "【面談・モニタリング記録】（メモおこし下書き）\n";
  recordEntries(state, lib).forEach((e) => {
    out += "\n■ " + e.label + "\n" + e.text + "\n";
  });
  return out;
}

/** 項目ごとのコピー本文。赤が残る場合は null（=コピー不可） */
export function sectionCopyText(state: RecordState, id: string): string | null {
  const tokens = state.tokens[id] ?? [];
  if (isSectionCopyBlocked(tokens)) return null;
  return flatten(tokens);
}

/** 出力時の警告（未確認・こぼれ残数の併記） */
export function outputWarnings(state: RecordState): string[] {
  const { y, b } = counts(state);
  const w: string[] = [];
  if (y + b > 0) w.push(`未確認 ${y + b} 件`);
  if (state.spill.length > 0) w.push(`こぼれ枠 ${state.spill.length} 件`);
  return w;
}
