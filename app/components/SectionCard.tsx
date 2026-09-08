"use client";

// 項目カード（紙ファイル＋インデックスシール）
// DOM構造・クラス名・文言は docs/mock/memo-okoshi-mock-v6.html の render() に対応。

import { useState } from "react";
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
          <button className="mini ic arrow" data-tip="上へ" onClick={() => onMove(-1)}>
            ↑
          </button>
          <button className="mini ic arrow" data-tip="下へ" onClick={() => onMove(1)}>
            ↓
          </button>
          <button
            className={"mini ic copy" + (copied ? " copied" : "")}
            data-tip="この項目をコピー"
            onClick={onCopy}
          >
            {copied ? "✓" : "⧉"}
          </button>
          <button className="mini ic" data-tip="文章を直す" onClick={() => { setDraft(text); onStartEdit(); }}>
            ✎
          </button>
        </div>
      </div>

      {editing ? (
        <>
          <div className="sec-body">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
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
