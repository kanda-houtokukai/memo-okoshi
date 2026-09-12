// 項目の選択（オン/オフ）と表示順。**端末内（localStorage）にだけ持つ**（個人情報を含まない）。
//
// [DECISION 2026-09-10] **記録と面談用紙は同じ選択を共有する。**
//   「用紙と出力が必ず一致すること」が要件で、別々に持つと
//   「用紙には健康・服薬の枠があるのに、記録側では項目がオフでこぼれ枠に落ちる」が起きる。
//   用紙の画面でトグルすると、次の変換の項目構成もそれに従う（変換直前に読み直す仕組みは従来どおり）。
// [DECISION 2026-09-10] **すでに保存されている選択は移行しない**（そのまま尊重する）。
//   2026-09-10に分類（基本/追加項目）と既定値を変えたが、**id は1つも変えていない**ので保存値はそのまま読める。
//   触ったことのない人には新しい既定（8項目）が出て、自分で選んだ人の選択は勝手に変わらない。
//   ※ 分類だけが変わった項目（健康・服薬／生活・住環境）は、以前オフを選んだ人には**オフのまま**出る。
//     基本に上がったから自動でオンにする、はしない（AIに何を書かせるかが黙って変わるため）。

import type { ItemDef } from "./items";
import { moveTo } from "./reorder.ts";

export const SETTINGS_KEY = "memo-okoshi:items";

/**
 * 面談用紙を「自由形式」（枠なしの罫線だけ）にするか。**用紙の見た目だけ**の切り替え。
 *
 * [DECISION 2026-09-11] ⚠️ **記録側の項目選択（`SETTINGS_KEY`）には触れない**。
 *   用紙と記録は同じ選択を共有しているので、ここを書き換えると**変換時の項目構成まで消えてしまう**。
 *   自由形式は別の鍵に持ち、外せば元の選択がそのまま戻る。
 *   鍵の定義はこのファイルにだけ置く（散らかさない）。
 */
export const SHEET_FREE_KEY = "memo-okoshi:sheet-free";

export function loadSheetFree(): boolean {
  try {
    return localStorage.getItem(SHEET_FREE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSheetFree(free: boolean): void {
  try {
    if (free) localStorage.setItem(SHEET_FREE_KEY, "1");
    else localStorage.removeItem(SHEET_FREE_KEY);
  } catch {
    /* プライベートブラウズ等では保存できないが動作は続ける */
  }
}

export type Settings = { enabled: Record<string, boolean>; order: string[] };

export function defaultSettings(lib: ItemDef[]): Settings {
  const enabled: Record<string, boolean> = {};
  lib.forEach((l) => (enabled[l.id] = l.defaultOn));
  return { enabled, order: lib.map((l) => l.id) };
}

/** 保存値を今のライブラリに重ねて読む（知らない id は捨て、増えた id は末尾に足す） */
export function mergeSettings(saved: { enabled?: string[]; order?: string[] } | null, lib: ItemDef[]): Settings {
  if (!saved) return defaultSettings(lib);
  const enabled: Record<string, boolean> = {};
  lib.forEach((l) => (enabled[l.id] = (saved.enabled ?? []).includes(l.id)));
  const order = [
    ...(saved.order ?? []).filter((id) => lib.some((l) => l.id === id)),
    ...lib.map((l) => l.id).filter((id) => !(saved.order ?? []).includes(id)),
  ];
  return { enabled, order };
}

export function loadSettings(lib: ItemDef[]): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return mergeSettings(raw ? (JSON.parse(raw) as { enabled?: string[]; order?: string[] }) : null, lib);
  } catch {
    return defaultSettings(lib);
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ enabled: s.order.filter((id) => s.enabled[id]), order: s.order })
    );
  } catch {
    /* プライベートブラウズ等では保存できないが動作は続ける */
  }
}

/** 選んだ項目を表示順で返す */
export function selectedIds(s: Settings): string[] {
  return s.order.filter((id) => s.enabled[id]);
}

/* ---------- 面談用紙での並び（P8-d） ---------- */

/**
 * 面談用紙での項目の並び。**用紙だけの設定**。
 *
 * [DECISION 2026-09-12] ⚠️ **記録側の並び（`Settings.order`）には反映しない**（自由形式と同じ扱い・別の鍵）。
 *   記録側の並びは確認画面のカードの順で、ORDER と締めフラグ（申し送りは締めの位置）の規則で決まる。
 *   用紙の並びは**面談の流れ（聞く順番）**に合わせるもので、目的が違う。1つの並びを共有すると、
 *   用紙を並べ替えるたびに記録の順が動き、記録を並べ替えるたびに用紙が動く。
 *   **オン・オフは引き続き `SETTINGS_KEY` で記録と共有する**（分けるのは並びだけ）。
 * [DECISION 2026-09-12] **群の中でだけ動かせる**（基本の中・追加項目の中）。分類は項目の性質を示すもので、
 *   混ざると意味が失われる。用紙の並びは常に「基本（並べた順）→ 追加項目（並べた順）」。
 *   保存値の中で群が混ざっていても、読むときに必ず群ごとに並べ直す（`mergeSheetOrder`）。
 * [DECISION 2026-09-12] 並べ替えたことがなければ**項目ライブラリの定義順**。記録側の並びからは引き継がない
 *   （2つの並びが黙って影響し合わないように）。オフの項目も並びに含める（あとでオンにしたとき位置が決まっている）。
 */
export const SHEET_ORDER_KEY = "memo-okoshi:sheet-order";

type Group = ItemDef["group"];

/** 群の並び（項目ライブラリの定義順＝基本→追加項目） */
export function sheetGroups(lib: ItemDef[]): Group[] {
  return [...new Set(lib.map((l) => l.group))];
}

/** 保存値を今のライブラリに重ね、**群ごとに並べ直して**返す（知らない id は捨て、増えた id はその群の末尾に足す） */
export function mergeSheetOrder(saved: unknown, lib: ItemDef[]): string[] {
  const ids = Array.isArray(saved) ? saved.filter((x): x is string => typeof x === "string") : [];
  const known = [...new Set(ids)].filter((id) => lib.some((l) => l.id === id));
  const all = [...known, ...lib.map((l) => l.id).filter((id) => !known.includes(id))];
  const groupOf = new Map(lib.map((l) => [l.id, l.group]));
  return sheetGroups(lib).flatMap((g) => all.filter((id) => groupOf.get(id) === g));
}

/** その群の項目を、用紙の並びで返す */
export function groupIds(order: string[], lib: ItemDef[], group: Group): string[] {
  const groupOf = new Map(lib.map((l) => [l.id, l.group]));
  return mergeSheetOrder(order, lib).filter((id) => groupOf.get(id) === group);
}

/**
 * 群の中で from 番目を「insertAt 番目の手前」へ動かす（insertAt は 0..群の数。取り込み画面と同じ `moveTo`）。
 * **その群の中身だけを入れ替える**ので、群をまたぐ移動は起こりえない。
 */
export function moveWithinGroup(
  order: string[],
  lib: ItemDef[],
  group: Group,
  from: number,
  insertAt: number
): string[] {
  const base = mergeSheetOrder(order, lib);
  const groupOf = new Map(lib.map((l) => [l.id, l.group]));
  const moved = moveTo(groupIds(base, lib, group), from, insertAt);
  let k = 0;
  return base.map((id) => (groupOf.get(id) === group ? moved[k++] : id));
}

/** 用紙に載せる項目を、用紙の並びで返す（オン・オフは記録と共有の `enabled` に従う） */
export function sheetIds(order: string[], enabled: Record<string, boolean>, lib: ItemDef[]): string[] {
  return mergeSheetOrder(order, lib).filter((id) => enabled[id]);
}

export function loadSheetOrder(lib: ItemDef[]): string[] {
  try {
    const raw = localStorage.getItem(SHEET_ORDER_KEY);
    return mergeSheetOrder(raw ? JSON.parse(raw) : null, lib);
  } catch {
    return mergeSheetOrder(null, lib);
  }
}

export function saveSheetOrder(order: string[]): void {
  try {
    localStorage.setItem(SHEET_ORDER_KEY, JSON.stringify(order));
  } catch {
    /* プライベートブラウズ等では保存できないが動作は続ける */
  }
}

/** 書き出し用。**並べ替えたことがなければ undefined**（読み込む側の並びに触れないため） */
export function readSavedSheetOrder(): string[] | undefined {
  try {
    const raw = localStorage.getItem(SHEET_ORDER_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
  } catch {
    return undefined;
  }
}
