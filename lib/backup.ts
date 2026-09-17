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

import { mergeBackup, type Backup, type TypeSettings, type VocabEntry } from "./vocab.ts";
import {
  keyFor,
  loadSheetFree,
  readSavedSheetOrder,
  saveSheetFree,
  saveSheetOrder,
  SETTINGS_KEY,
} from "./settings.ts";
import { ITEM_LIBRARY, MEETING_LIBRARY, type RecordType } from "./items.ts";

// [DECISION 2026-09-17] **会議の設定（項目の選択・並び・自由形式）も同じファイルに入れる**（P9-b）。
//   面談はこれまでどおり最上位、会議は `meeting` の中に同じ形で置く。読み込みの扱いは面談と同じ（置換）。
//   書き出しに入れるのは**その端末で一度でも設定したものだけ**（並べ替えたことがない・自由形式がオフなら入れない。
//   読み込む側の設定に触れないため。P8-d と同じ考え）。面談の自由形式もここから運ぶ。

function readItems(type: RecordType = "interview"): TypeSettings["items"] {
  try {
    const raw = localStorage.getItem(keyFor(SETTINGS_KEY, type));
    if (!raw) return undefined;
    const s = JSON.parse(raw) as { enabled?: string[]; order?: string[] };
    return { enabled: s.enabled ?? [], order: s.order ?? [] };
  } catch {
    return undefined;
  }
}

/** その種類の設定のうち、書き出すもの（一度も設定していないものは入れない） */
function readTypeSettings(type: RecordType): TypeSettings {
  const out: TypeSettings = {};
  const items = readItems(type);
  const sheetOrder = readSavedSheetOrder(type);
  if (items) out.items = items;
  if (sheetOrder) out.sheetOrder = sheetOrder;
  if (loadSheetFree(type)) out.sheetFree = true;
  return out;
}

export function buildBackup(
  vocab: VocabEntry[],
  items = readItems(),
  sheetOrder = readSavedSheetOrder(),
  sheetFree = loadSheetFree() || undefined,
  meeting = readTypeSettings("meeting")
): Backup {
  return {
    app: "memo-okoshi",
    version: 1,
    exported: new Date().toISOString(),
    vocab,
    ...(items ? { items } : {}),
    ...(sheetOrder ? { sheetOrder } : {}),
    ...(sheetFree ? { sheetFree } : {}),
    ...(Object.keys(meeting).length ? { meeting } : {}),
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

/** その種類の設定を置き換える（入っているものだけ）。何か置き換えたら true */
function applyTypeSettings(t: TypeSettings | undefined, type: RecordType): boolean {
  if (!t) return false;
  let applied = false;
  if (t.items) {
    try {
      localStorage.setItem(keyFor(SETTINGS_KEY, type), JSON.stringify(t.items));
      applied = true;
    } catch {
      /* 保存不可 */
    }
  }
  if (t.sheetOrder) {
    // 読むときに今のライブラリへ重ねて群ごとに並べ直すので、ここでは受け取ったまま置く
    saveSheetOrder(t.sheetOrder, type);
    applied = true;
  }
  if (typeof t.sheetFree === "boolean") {
    saveSheetFree(t.sheetFree, type);
    applied = true;
  }
  return applied;
}

export function importBackup(
  input: unknown,
  current: VocabEntry[],
  validItemIds: string[] = ITEM_LIBRARY.map((l) => l.id),
  validMeetingIds: string[] = MEETING_LIBRARY.map((l) => l.id)
): ImportResult {
  const r = mergeBackup(input, current, validItemIds, validMeetingIds);
  if (!r.ok) return { ok: false };
  // 面談（最上位）と会議（meeting）を同じ扱いで置き換える。会議の設定が無い古いファイルは会議に触れない
  const a = applyTypeSettings({ items: r.items, sheetOrder: r.sheetOrder, sheetFree: r.sheetFree }, "interview");
  const b = applyTypeSettings(r.meeting, "meeting");
  return { ok: true, vocab: r.vocab, added: r.added, skipped: r.skipped, itemsApplied: a || b };
}
