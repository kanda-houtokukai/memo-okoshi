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
  data.sections.forEach((s) => {
    if (s.id in tokens) tokens[s.id] = s.tokens ?? [];
  });
  return {
    tokens,
    enabled,
    order,
    spill: (data.spill ?? []).map((s) => ({ text: s.text, sug: s.suggest })),
    insights: (data.insights ?? []).map((i) => ({ s: i.text, why: i.why, refs: i.refs ?? [] })),
  };
}

/* ---------- 選択・表示順 ---------- */

export function activeIds(state: RecordState): string[] {
  return state.order.filter((id) => state.enabled[id]);
}

export function flatten(tokens: Token[]): string {
  return tokens.map((t) => t.s).join("");
}

export function hasOpen(tokens: Token[]): boolean {
  return tokens.some((t) => !t.resolved && t.t !== "p");
}

/** 追加・復帰は「締め」項目（申し送り）の手前へ入れる */
function placeInOrder(order: string[], enabled: Record<string, boolean>, lib: ItemDef[], id: string): string[] {
  const next = order.filter((x) => x !== id);
  const idx = next.findIndex((x) => {
    const def = lib.find((l) => l.id === x);
    return Boolean(def?.closing) && enabled[x];
  });
  if (idx < 0) next.push(id);
  else next.splice(idx, 0, id);
  return next;
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
  const order = placeInOrder(state.order, enabled, lib, id);
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
  const order = placeInOrder(state.order, enabled, lib, targetId);
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

export function resolveToken(state: RecordState, sid: string, ti: number, val: string | null): RecordState {
  const list = state.tokens[sid];
  if (!list || !list[ti]) return state;
  const next = list.map((tk, i) =>
    i === ti ? { ...tk, s: val !== null ? val : tk.s, resolved: true } : tk
  );
  return { ...state, tokens: { ...state.tokens, [sid]: next } };
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
  activeIds(state).forEach((id) => {
    const def = lib.find((l) => l.id === id);
    if (!def) return;
    const t = flatten(state.tokens[id] ?? []);
    out += "\n■ " + def.label + "\n";
    out += (t.trim() ? t : "（記載なし）") + "\n";
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
