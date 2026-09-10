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

import { useEffect, useMemo, useState } from "react";
import { ITEM_LIBRARY, type ItemDef } from "@/lib/items";
import { loadSettings, saveSettings, selectedIds, type Settings } from "@/lib/settings";
import { paginate, sheetFileName, sheetLayout } from "@/lib/sheet";
import StepHeader from "./StepHeader";
import VocabButton from "./VocabButton";

type Props = { onHome: () => void; toast: (m: string) => void };

/** 用紙1枚ぶん。画面の見本と印刷で同じものを使う（食い違わせない） */
function Paper({ items, lines }: { items: ItemDef[]; lines: number }) {
  return (
    <div className="paper">
      <div className="p-head">
        <div className="p-title">面談記録メモ</div>
        {/* 記入欄。日時は数字だけを書くマス（表記の揺れを作らない）、参加者は3人ぶん並べる */}
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
            <span className="wr" />
            <span className="wr" />
          </div>
        </div>
      </div>
      <div className="p-grid">
        {items.map((it) => (
          <div className="p-box" key={it.id} style={{ ["--c" as string]: it.color }}>
            <h4>{it.label}</h4>
            <div className="p-lines">
              {Array.from({ length: lines }, (_, i) => (
                <div key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="p-foot">メモおこし</div>
    </div>
  );
}

export default function SheetMaker({ onHome, toast }: Props) {
  const [set, setSet] = useState<Settings | null>(null);
  useEffect(() => setSet(loadSettings(ITEM_LIBRARY)), []);

  const ids = set ? selectedIds(set) : [];
  const items = useMemo(
    () => ids.map((id) => ITEM_LIBRARY.find((l) => l.id === id)!).filter(Boolean),
    [ids.join(",")]
  );
  const layout = sheetLayout(items.length);
  const pages = paginate(items, layout.perPage || items.length);

  const toggle = (id: string) => {
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
        <div className="cfg">
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
          <div className="cfg-foot">
            <span className="cnt">
              {items.length}項目・{layout.pages}枚
            </span>
            <button className="dl" onClick={print} disabled={items.length === 0}>
              PDFで保存
            </button>
          </div>
        </div>

        <div className="pv">
          <div className="pv-inner">
            {pages.map((p, i) => (
              <Paper key={i} items={p} lines={layout.lines} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
