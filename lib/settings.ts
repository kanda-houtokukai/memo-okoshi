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

export const SETTINGS_KEY = "memo-okoshi:items";

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
