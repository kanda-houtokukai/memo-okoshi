// 「〇〇」の保険（P26・設計側の決定・ユーザー承認）: 利用者が塗っていないのに出た「〇〇」を、機械で黄にする。
// 人名の機械検出（lib/names.ts）と同じ考え方で、モデルの癖に頼らない。
//
// [DECISION 2026-10-14・設計側] 変換の返答に出た〇〇の数が、伏せる工程で塗ったまとまりの数（lib/pages.ts の maskClusters の合計）より多ければ、
//   **その返答の〇〇をすべて黄にする**（塗っていないメモなら、〇〇が1つでも出れば黄）。どの〇〇が塗った箇所かは返答からは分からないので、
//   多めに黄が付くのは許す（黄は確かめれば外せる）。見逃すほうを避ける。
//   - P25 で、Flash-Lite が黒い四角の無いメモでにじんだ字を〇〇と書いた。〇〇は塗った箇所の印（P15）なので黄にならず、そのまま完成できていた。
//   - 面談・会議・見学のすべてに、試験済み・緊急用のどちらのモデルの返答にも効かせる（返答ごと＝初回も再変換も）。
//   - 黄を押したときの一文は OO_TEXT（設計側の文面）。候補は出さない。確定・書き換えは既存の黄と同じ。
// ⚠️ 塗りのまとまりの数は**送らない・保存しない**（原則5）。画面のメモリの中で比べるだけ。
// 数えるのは記録の項目（sections）とこぼれ（spill）の〇〇。気づき（insights）は記録の読み取りではないので数えない。
// 黄にするのは項目の中の〇〇だけ（こぼれは文で持つので印を付けられない）。赤の中の〇〇は赤のまま（赤は確認するまで完成できず、黄より強い）。

import type { ApiData, Token } from "./record";

/** 黄を押したときの一文（設計側の文面） */
export const OO_TEXT = "塗っていない箇所が「〇〇」になっている可能性があります。元のメモを確かめてください。";

const OO = /[〇○◯]{2,}/g;

/** 返答の中の〇〇の数（項目とこぼれ） */
export function countOO(data: ApiData): number {
  const n = (s: string | undefined) => (s ?? "").match(OO)?.length ?? 0;
  let total = 0;
  for (const sec of data.sections) for (const t of sec.tokens ?? []) total += n(t.s);
  for (const sp of data.spill ?? []) total += n(sp.text);
  return total;
}

/** p・b の文の中の〇〇を切り出して黄（oo）にする。y の中の〇〇は oo の印だけ付ける。r はそのまま */
function splitToken(t: Token): Token[] {
  if (!new RegExp(OO.source).test(t.s ?? "")) return [t];
  if (t.t === "r") return [t];
  if (t.t === "y") return [{ ...t, oo: true }];
  const out: Token[] = [];
  let last = 0;
  for (const m of t.s.matchAll(OO)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ ...t, s: t.s.slice(last, i) });
    out.push({ t: "y", s: m[0], cands: [], oo: true });
    last = i + m[0].length;
  }
  if (last < t.s.length) out.push({ ...t, s: t.s.slice(last) });
  return out;
}

/**
 * 塗りのまとまりの数（clusters）と比べて、〇〇が多ければ項目の中の〇〇をすべて黄にした返答を返す。多くなければそのまま返す。
 * 文字は1字も変えない（印の種類が変わるだけ。転記用テキスト・Word・PDF の文は同じ）。
 */
export function guardOO(data: ApiData, clusters: number): ApiData {
  if (countOO(data) <= clusters) return data;
  return { ...data, sections: data.sections.map((sec) => ({ ...sec, tokens: (sec.tokens ?? []).flatMap(splitToken) })) };
}
