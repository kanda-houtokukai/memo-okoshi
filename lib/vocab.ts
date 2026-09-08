// 組織語彙の辞書（事業所ごとの略語・固有語）。
//
// 原則5: 端末内（localStorage）にだけ保存する。変換リクエストにプロンプト材料として乗るが、
//        サーバーは保存しない（app/api/convert は受け取ってプロンプトに差し込むだけ）。
//
// [DECISION 2026-09-07] 分類は設けず単純なリスト（語＋任意の意味）。数十語規模なら一覧で足り、
//   項目ドロワーと同じ作法（説明文なし・トグル/一覧）を崩さないため。
// [DECISION 2026-09-07] 初期セットは入れない。汎用の福祉略語はモデルが既知で、辞書の価値は
//   「その事業所でしか通じない語」にある。誤った初期値が組織の表記を上書きする害を避ける。
// [DECISION 2026-09-07] 人名を入れさせない配慮は三重: (1) 敬称で終わる語は登録拒否（さん/様/くん/ちゃん/氏）、
//   (2) 黄マーカーからの学習導線は赤（人名検知）には出さない、(3) プロンプトで「人名は含まれていない
//   語彙」と明示しモデルが人名を補完しない。ドロワーの脚注にも「人名は入れない」。
//   ※ 敬称なしの姓名は機械では見分けられない。運用（AI委員会の申し合わせ）で補う前提。

export type VocabEntry = { term: string; gloss?: string };

export const VOCAB_KEY = "memo-okoshi:vocab";
export const MAX_ENTRIES = 200;
export const MAX_TERM = 40;
export const MAX_GLOSS = 60;

const NAME_SUFFIX = /(さん|様|さま|くん|君|ちゃん|氏)$/;

export function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** 敬称で終わる語は人名とみなす（単純だが取りこぼしより誤検知を許容） */
export function looksLikePersonName(term: string): boolean {
  return NAME_SUFFIX.test(normalize(term));
}

/** ドロワーが空のときだけ淡く出す例示（**表示専用**）。
 *  [DECISION 2026-09-09] 初期セットを入れない決定（2026-09-07）は維持したまま、
 *  「何を登録する場所か」を説明文なしで伝えるために例示だけを見せる。
 *  ここに置いた語は保存もプロンプト送信もしない（登録済みの一覧とは見た目を分ける）。
 */
export const VOCAB_EXAMPLES: readonly VocabEntry[] = [
  { term: "個支計", gloss: "個別支援計画" },
  { term: "ケース会", gloss: "ケース会議" },
  { term: "日中一", gloss: "日中一時支援" },
];

export type Reason = "empty" | "dup" | "name" | "full" | "long";
export type EditResult = { list: VocabEntry[]; ok: boolean; reason?: Reason };

function clean(e: VocabEntry): VocabEntry {
  const term = normalize(e.term);
  const gloss = normalize(e.gloss ?? "");
  return gloss ? { term, gloss } : { term };
}

function validate(list: VocabEntry[], e: VocabEntry, skipIndex: number): Reason | null {
  if (!e.term) return "empty";
  if (e.term.length > MAX_TERM || (e.gloss ?? "").length > MAX_GLOSS) return "long";
  if (looksLikePersonName(e.term)) return "name";
  if (list.some((x, i) => i !== skipIndex && x.term === e.term)) return "dup";
  if (skipIndex < 0 && list.length >= MAX_ENTRIES) return "full";
  return null;
}

export function addEntry(list: VocabEntry[], entry: VocabEntry): EditResult {
  const e = clean(entry);
  const reason = validate(list, e, -1);
  if (reason) return { list, ok: false, reason };
  return { list: [...list, e], ok: true };
}

export function updateEntry(list: VocabEntry[], index: number, entry: VocabEntry): EditResult {
  if (index < 0 || index >= list.length) return { list, ok: false, reason: "empty" };
  const e = clean(entry);
  const reason = validate(list, e, index);
  if (reason) return { list, ok: false, reason };
  return { list: list.map((x, i) => (i === index ? e : x)), ok: true };
}

export function removeEntry(list: VocabEntry[], index: number): VocabEntry[] {
  return list.filter((_, i) => i !== index);
}

export const REASON_TEXT: Record<Reason, string> = {
  empty: "語を入力してください",
  dup: "すでにあります",
  name: "人名らしき語は辞書に入れません",
  full: `辞書がいっぱいです（${MAX_ENTRIES}語）`,
  long: "長すぎます",
};

/** サーバー側: 受け取った JSON を型と上限で絞る（保存はしない） */
export function sanitizeForPrompt(input: unknown): VocabEntry[] {
  if (!Array.isArray(input)) return [];
  const out: VocabEntry[] = [];
  for (const x of input) {
    if (!x || typeof x !== "object") continue;
    const term = normalize(String((x as { term?: unknown }).term ?? "")).slice(0, MAX_TERM);
    const gloss = normalize(String((x as { gloss?: unknown }).gloss ?? "")).slice(0, MAX_GLOSS);
    if (!term || looksLikePersonName(term)) continue;
    if (out.some((o) => o.term === term)) continue;
    out.push(gloss ? { term, gloss } : { term });
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

/* ---------- ブラウザ側の保存（端末内のみ） ---------- */

export function loadVocab(): VocabEntry[] {
  try {
    const raw = localStorage.getItem(VOCAB_KEY);
    return raw ? sanitizeForPrompt(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveVocab(list: VocabEntry[]): void {
  try {
    localStorage.setItem(VOCAB_KEY, JSON.stringify(list));
  } catch {
    /* プライベートブラウズ等では保存できないが動作は続ける */
  }
}


/* ---------- 辞書バックアップ（純関数部分。ブラウザ側の書き出し/読み込みは lib/backup.ts） ---------- */

export type Backup = {
  app: "memo-okoshi";
  version: 1;
  exported: string;
  vocab: VocabEntry[];
  items?: { enabled: string[]; order: string[] };
};

/** 純関数部分（テスト対象）: 既存の辞書へ追記し、項目設定があれば返す */
export function mergeBackup(
  input: unknown,
  current: VocabEntry[],
  validItemIds: string[]
): { ok: true; vocab: VocabEntry[]; added: number; skipped: number; items?: Backup["items"] } | { ok: false } {
  if (!input || typeof input !== "object") return { ok: false };
  const b = input as Partial<Backup>;
  if (b.app !== "memo-okoshi" || !Array.isArray(b.vocab)) return { ok: false };
  let vocab = current;
  let added = 0;
  let skipped = 0;
  for (const e of sanitizeForPrompt(b.vocab)) {
    const r = addEntry(vocab, e);
    if (r.ok) {
      vocab = r.list;
      added++;
    } else skipped++;
  }
  // sanitize で落ちた分（人名・型崩れ）も除外として数える
  skipped += Array.isArray(b.vocab) ? b.vocab.length - sanitizeForPrompt(b.vocab).length : 0;
  const items =
    b.items && Array.isArray(b.items.enabled) && Array.isArray(b.items.order)
      ? {
          enabled: b.items.enabled.filter((id) => validItemIds.includes(id)),
          order: b.items.order.filter((id) => validItemIds.includes(id)),
        }
      : undefined;
  return { ok: true, vocab, added, skipped, items };
}
