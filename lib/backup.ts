// 辞書（＋項目設定）の書き出し・読み込み — ブラウザ側（P6 項目9-b）。純関数部分は lib/vocab.ts の mergeBackup。
// localStorage は端末・ブラウザごとに別で消えることもあるため、サーバーを持たずに共有と復旧を可能にする。
//
// [DECISION 2026-09-08]
// - 1ファイルに 辞書 と 項目設定（オン/表示順）を同梱する（復旧の手間を1回で済ませる）
// - 読み込みは 辞書=追記（既存は残し、重複は飛ばす）／項目設定=置換（順序は丸ごと差し替え）
// - 人名ガード（敬称）は読み込み時にも働く（addEntry を通す）
// [DECISION 2026-09-12] **面談用紙での並び（P8-d）も同じファイルに入れる**。
//   このファイルはすでに項目設定（オン/表示順）を運んでおり、端末の入れ替えや消失からの復旧を1回で済ませるのが目的。
//   用紙の並びだけ戻らないと、復旧が半分で終わる。扱いは項目設定と同じく**置換**。
//   並べ替えたことがない端末からの書き出しには入れない（読み込む側の並びに触れないため）。
//   それ以前のファイル（並びが入っていない）も、そのまま読める。

import { mergeBackup, type Backup, type VocabEntry } from "./vocab";
import { readSavedSheetOrder, saveSheetOrder } from "./settings";

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

export function buildBackup(vocab: VocabEntry[], items = readItems(), sheetOrder = readSavedSheetOrder()): Backup {
  return {
    app: "memo-okoshi",
    version: 1,
    exported: new Date().toISOString(),
    vocab,
    ...(items ? { items } : {}),
    ...(sheetOrder ? { sheetOrder } : {}),
  };
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
  if (r.sheetOrder) {
    // 読むときに今のライブラリへ重ねて群ごとに並べ直すので、ここでは受け取ったまま置く
    saveSheetOrder(r.sheetOrder);
    itemsApplied = true;
  }
  return { ok: true, vocab: r.vocab, added: r.added, skipped: r.skipped, itemsApplied };
}
