// 辞書（＋項目設定）の書き出し・読み込み — ブラウザ側（P6 項目9-b）。純関数部分は lib/vocab.ts の mergeBackup。
// localStorage は端末・ブラウザごとに別で消えることもあるため、サーバーを持たずに共有と復旧を可能にする。
//
// [DECISION 2026-09-08]
// - 1ファイルに 辞書 と 項目設定（オン/表示順）を同梱する（復旧の手間を1回で済ませる）
// - 読み込みは 辞書=追記（既存は残し、重複は飛ばす）／項目設定=置換（順序は丸ごと差し替え）
// - 人名ガード（敬称）は読み込み時にも働く（addEntry を通す）

import { mergeBackup, type Backup, type VocabEntry } from "./vocab";

const SETTINGS_KEY = "memo-okoshi:items";

function readItems(): Backup["items"] | undefined {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return undefined;
    const s = JSON.parse(raw) as { enabled?: string[]; order?: string[] };
    return { enabled: s.enabled ?? [], order: s.order ?? [] };
  } catch {
    return undefined;
  }
}

export function buildBackup(vocab: VocabEntry[], items = readItems()): Backup {
  return { app: "memo-okoshi", version: 1, exported: new Date().toISOString(), vocab, ...(items ? { items } : {}) };
}

export function backupFilename(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `メモおこし_辞書_${y}${m}${day}.json`;
}

export function exportBackup(vocab: VocabEntry[]): void {
  const blob = new Blob([JSON.stringify(buildBackup(vocab), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFilename();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ImportResult =
  | { ok: true; vocab: VocabEntry[]; added: number; skipped: number; itemsApplied: boolean }
  | { ok: false };

export function importBackup(input: unknown, current: VocabEntry[], validItemIds: string[]): ImportResult {
  const r = mergeBackup(input, current, validItemIds);
  if (!r.ok) return { ok: false };
  let itemsApplied = false;
  if (r.items) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(r.items));
      itemsApplied = true;
    } catch {
      /* 保存不可 */
    }
  }
  return { ok: true, vocab: r.vocab, added: r.added, skipped: r.skipped, itemsApplied };
}
