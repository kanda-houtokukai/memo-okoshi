"use client";

// 面談用紙を作る画面。正本は `docs/mock/home-youshi-mock-v2.html` の「2. 用紙を作る」「3. 用紙の見本」（凍結）。
//
// なぜ紙を配るのか: 面談中に項目に沿って書いてもらえれば、AIは**位置でも振り分けられる**ので読み取りが安定する。
// 聞き取る側にとっても、枠が並んでいること自体が聞き漏らしの防止になる。
//
// [DECISION 2026-09-10] 左で項目をトグルし、右の見本が**その場で変わる**（押した結果がすぐ見える）。
// [DECISION 2026-09-10] 項目は**記録と同じライブラリ・同じ選択**を使う（`lib/settings.ts`）。
//   ここでトグルすると次の変換の項目構成も変わる。用紙と出力を食い違わせないため。
// [DECISION 2026-09-10] PDFは**ブラウザの印刷（PDFとして保存）**で作る。日本語フォントを積まずに済み、
//   出力（Word/PDF）でも同じ手を使っている。ファイル名は `面談用紙_YYYYMMDD`。
// [DECISION 2026-09-10] **説明文は置かない**（原則4）。見本そのものが説明になっている。
// [DECISION 2026-09-10] ボタンは「PDFで保存」→**「印刷」**（P7-g）。押すと印刷ダイアログが開くので、
//   保存されると思って押した人が戸惑う。印刷ダイアログからPDF保存も選べるので、文言としてもこちらが正確。
// [DECISION 2026-09-10] **狭い画面（≤900px）は「項目」と「見本」をタブで切り替える**（P7-g）。
//   トグルの一覧が画面をほぼ占めて見本に辿り着けなかった。作法・閾値は確認画面（元メモ／記録）と同じ `.mobile-tabs`。
//   ⚠️ **「印刷」はタブの外側に置く**（どちらを表示していても押せる。P6-k の「次へ」が押し出された件と同種の問題を作らない）。

import { useEffect, useMemo, useState } from "react";
import { ITEM_LIBRARY, type ItemDef } from "@/lib/items";
import {
  loadSettings,
  loadSheetFree,
  saveSettings,
  saveSheetFree,
  selectedIds,
  type Settings,
} from "@/lib/settings";
import {
  freeSheetLines,
  OTHER_BOX,
  paginate,
  sheetFileName,
  sheetLayout,
  SHEET,
  wideLast,
} from "@/lib/sheet";
import StepHeader from "./StepHeader";
import VocabButton from "./VocabButton";

type Props = { onHome: () => void; toast: (m: string) => void };

/** 用紙1枚ぶん。画面の見本と印刷で同じものを使う（食い違わせない）。
 *  `other` は最後のページだけ true（「その他」の枠は常に最後）。
 *  `free` は自由形式（枠なしの罫線だけ・「その他」も出さない）。 */
function Paper({
  items,
  lines,
  other,
  free,
}: {
  items: ItemDef[];
  lines: number;
  other?: boolean;
  free?: boolean;
}) {
  return (
    <div className="paper">
      <div className="p-head">
        <div className="p-title">面談記録メモ</div>
        {/* 記入欄。日時は数字だけを書くマス（表記の揺れを作らない）、参加者は1行ぶんの長い下線 */}
        <div className="p-fields">
          <div className="f f-date">
            <span className="lb">日時</span>
            <span className="cel y" />
            <span className="u">年</span>
            <span className="cel" />
            <span className="u">月</span>
            <span className="cel" />
            <span className="u">日</span>
            <span className="cel" />
            <span className="u">時</span>
            <span className="cel" />
            <span className="u">分</span>
            <span className="u wave">〜</span>
            <span className="cel" />
            <span className="u">時</span>
            <span className="cel" />
            <span className="u">分</span>
          </div>
          <div className="f f-place">
            <span className="lb">場所</span>
            <span className="wr" />
          </div>
          <div className="f f-people">
            <span className="lb">参加者</span>
            <span className="wr" />
          </div>
        </div>
      </div>
      {free ? (
        // 枠なし・罫線だけ。間隔は枠のときと同じ
        <div className="p-free">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className="p-grid">
            {items.map((it, i) => (
              <div
                // 最後の行に1つしか入らないときは横いっぱいに広げる（右半分を空けない）
                className={"p-box" + (wideLast(items.length) && i === items.length - 1 ? " wide" : "")}
                key={it.id}
                style={{ ["--c" as string]: it.color }}
              >
                <h4>{it.label}</h4>
                <div className="p-lines">
                  {Array.from({ length: lines }, (_, i) => (
                    <div key={i} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {other && (
            // 想定外の話の受け皿。横いっぱい・他の枠より低くして、項目の枠を痩せさせない
            <div
              className="p-box other"
              style={{ ["--c" as string]: "var(--sub)" }}
            >
              <h4>{OTHER_BOX.label}</h4>
              <div className="p-lines">
                {Array.from({ length: SHEET.otherLines }, (_, i) => (
                  <div key={i} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <div className="p-foot">メモおこし</div>
    </div>
  );
}

export default function SheetMaker({ onHome, toast }: Props) {
  const [set, setSet] = useState<Settings | null>(null);
  /** 狭い画面でどちらを見せるか。選択の状態はここでは持たないので、切り替えても中身は保たれる */
  const [tab, setTab] = useState<"items" | "paper">("items");
  /** 自由形式。**用紙の見た目だけ**を切り替える（記録側の選択には触れない） */
  const [free, setFree] = useState(false);
  useEffect(() => {
    setSet(loadSettings(ITEM_LIBRARY));
    setFree(loadSheetFree());
  }, []);

  const ids = set ? selectedIds(set) : [];
  const items = useMemo(
    () =>
      ids.map((id) => ITEM_LIBRARY.find((l) => l.id === id)!).filter(Boolean),
    [ids.join(",")],
  );
  const layout = sheetLayout(items.length);
  const pages = free ? [[]] : paginate(items, layout.perPage);
  const freeLines = freeSheetLines();

  const toggleFree = () => {
    setFree((f) => {
      saveSheetFree(!f);
      return !f;
    });
  };

  const toggle = (id: string) => {
    if (free) return; // 自由形式のあいだは項目を触らせない（用紙に出ないため）
    setSet((s) => {
      if (!s) return s;
      const next = { ...s, enabled: { ...s.enabled, [id]: !s.enabled[id] } };
      saveSettings(next);
      return next;
    });
  };

  /** 見本をそのまま印刷に回す（印刷用のCSSがA4の実寸で描き直す） */
  const print = () => {
    if (items.length === 0) {
      toast("項目を1つ以上選んでください");
      return;
    }
    const src = document.querySelector(".pv-inner");
    if (!src) return;
    const root = document.createElement("div");
    root.className = "print-sheet";
    root.appendChild(src.cloneNode(true));
    document.body.appendChild(root);
    const prevTitle = document.title;
    document.title = sheetFileName();
    const cleanup = () => {
      document.title = prevTitle;
      root.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(() => {
      if (document.body.contains(root)) cleanup();
    }, 60000);
  };

  const groups: ItemDef["group"][] = ["基本", "追加項目"];

  return (
    <div className="sheet-root">
      <StepHeader right={<VocabButton toast={toast} />} onHome={onHome} />

      <div className="sheet-cfg">
        {/* 狭い画面だけ出る切り替え（確認画面と同じ .mobile-tabs） */}
        <div className="mobile-tabs">
          <button
            className={tab === "items" ? "on" : ""}
            onClick={() => setTab("items")}
          >
            項目
          </button>
          <button
            className={tab === "paper" ? "on" : ""}
            onClick={() => setTab("paper")}
          >
            見本
          </button>
        </div>

        <div className={"cfg" + (tab === "items" ? " on" : "")}>
          <h2>用紙に入れる項目</h2>
          {groups.map((g) => (
            <div key={g}>
              <div className="grp-t">{g}</div>
              {ITEM_LIBRARY.filter((l) => l.group === g).map((l) => {
                const on = Boolean(set?.enabled[l.id]);
                return (
                  <button
                    key={l.id}
                    className={"row" + (on ? " on" : "")}
                    style={{ ["--c" as string]: l.color }}
                    role="switch"
                    aria-checked={on}
                    disabled={free}
                    onClick={() => toggle(l.id)}
                  >
                    <span className="sw" aria-hidden />
                    <span className="tg" aria-hidden />
                    <span className="nm">{l.label}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {/* 第3の群。選ぶと上のトグルが押せなくなる（用紙に出ないため） */}
          <div className="grp-t free">{OTHER_BOX.freeLabel}</div>
          <button
            className={"row" + (free ? " on" : "")}
            style={{ ["--c" as string]: "var(--sub)" }}
            role="switch"
            aria-checked={free}
            onClick={toggleFree}
          >
            <span className="sw" aria-hidden />
            <span className="tg" aria-hidden />
            <span className="nm">{OTHER_BOX.freeLabel}</span>
          </button>
        </div>

        <div className={"pv" + (tab === "paper" ? " on" : "")}>
          <div className="pv-inner">
            {pages.map((p, i) => (
              <Paper
                key={i}
                items={p}
                lines={free ? freeLines : layout.linesPerPage[i]}
                other={!free && i === pages.length - 1}
                free={free}
              />
            ))}
          </div>
        </div>

        {/* 「印刷」はタブの外側。どちらを表示していても、画面が低くても押せる */}
        <div className="cfg-foot">
          <span className="cnt">
            {free
              ? `${OTHER_BOX.freeLabel}・1枚`
              : `${items.length}項目・${layout.pages}枚`}
          </span>
          <button
            className="dl"
            onClick={print}
            disabled={!free && items.length === 0}
          >
            印刷
          </button>
        </div>
      </div>
    </div>
  );
}
