"use client";

// 項目カード（紙ファイル＋インデックスシール）
// DOM構造・クラス名・文言は docs/mock/memo-okoshi-mock-v6.html の render() に対応。
//
// [DECISION 2026-09-09] 文章を直す欄は**内容の量に合わせて高さが伸びる**。元のメモと突き合わせて直す作業なので、
//   開いた時点で全文が見えている必要がある。入力中も伸びる。上限は画面の高さの6割（`max-height:60vh`）で、
//   そこを超えたときだけ欄の中がスクロールする。下限は従来どおり 5.5em。
//   高さはJSで内容の高さ（scrollHeight）に合わせ、上限・下限はCSSに任せる。

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ItemDef } from "@/lib/items";
import { flatten, hasOpen, type Token } from "@/lib/record";

type Props = {
  def: ItemDef;
  tokens: Token[];
  editing: boolean;
  copied: boolean;
  highlighted: boolean;
  onStartEdit: () => void;
  onSaveEdit: (text: string) => void;
  onCancelEdit: () => void;
  onCopy: () => void;
  onMove: (dir: -1 | 1) => void;
  onTokenClick: (ti: number, el: HTMLElement) => void;
};

export default function SectionCard({
  def,
  tokens,
  editing,
  copied,
  highlighted,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onCopy,
  onMove,
  onTokenClick,
}: Props) {
  const [draft, setDraft] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  /** 内容の高さに合わせる（上限・下限はCSSが決める） */
  const fitHeight = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    // box-sizing:border-box なので、指定する高さには枠線ぶんも要る（足さないと最後の行が数px欠ける）
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = el.scrollHeight + border + "px";
  }, []);

  // 開いた直後（描画前）に合わせる。窓の幅が変わると折り返しも変わるので測り直す
  useLayoutEffect(() => {
    if (!editing) return;
    fitHeight();
    window.addEventListener("resize", fitHeight);
    return () => window.removeEventListener("resize", fitHeight);
  }, [editing, fitHeight]);
  const complete = !hasOpen(tokens);
  const text = flatten(tokens);

  const cls = ["sec", complete ? "complete" : "", highlighted ? "hl" : ""].filter(Boolean).join(" ");

  return (
    <div className={cls} id={"sec-" + def.id} style={{ "--tabc": def.color } as React.CSSProperties}>
      <div className="tab" />
      <div className="sec-h">
        <h3>
          <span className="tabchip">{def.tab}</span>
          {def.label}
          <span className="okmark">✓</span>
        </h3>
        <div className="sec-actions">
          <button className="mini ic arrow" data-tip="上へ" aria-label="上へ" onClick={() => onMove(-1)}>
            ↑
          </button>
          <button className="mini ic arrow" data-tip="下へ" aria-label="下へ" onClick={() => onMove(1)}>
            ↓
          </button>
          <button
            className={"mini ic copy" + (copied ? " copied" : "")}
            data-tip="この項目をコピー"
            aria-label="この項目をコピー"
            onClick={onCopy}
          >
            {copied ? "✓" : "⧉"}
          </button>
          <button className="mini ic" data-tip="文章を直す" aria-label="文章を直す" onClick={() => { setDraft(text); onStartEdit(); }}>
            ✎
          </button>
        </div>
      </div>

      {editing ? (
        <>
          <div className="sec-body">
            <textarea
              ref={taRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                fitHeight();
              }}
            />
          </div>
          <div className="ta-btns">
            <button className="save" onClick={() => onSaveEdit(draft)}>
              保存
            </button>
            <button onClick={onCancelEdit}>取消</button>
          </div>
        </>
      ) : !text.trim() ? (
        <div className="sec-body empty" data-tip="メモに該当がない項目をAIは埋めません">
          記載なし
        </div>
      ) : (
        <div className="sec-body">
          {tokens.map((tk, ti) =>
            tk.t === "p" || tk.resolved ? (
              <span key={ti} className={tk.resolved ? "mk done" : undefined}>
                {tk.s}
              </span>
            ) : (
              <span
                key={ti}
                className={"mk " + tk.t}
                onClick={(e) => onTokenClick(ti, e.currentTarget)}
              >
                {tk.t === "b" ? tk.s + "（推定）" : tk.s}
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}
