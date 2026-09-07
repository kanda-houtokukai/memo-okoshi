"use client";

// 組織語彙のドロワー。項目ドロワー（Drawer.tsx）と同じ器・同じ作法（説明文なし・脚注1行）。
// 状態はこの部品が localStorage と直接やり取りする（開くたびに読み、変えるたびに保存）。

import { useEffect, useState } from "react";
import {
  addEntry,
  loadVocab,
  REASON_TEXT,
  removeEntry,
  saveVocab,
  updateEntry,
  type VocabEntry,
} from "@/lib/vocab";

type Props = { open: boolean; onClose: () => void; toast: (m: string) => void };

export default function VocabDrawer({ open, onClose, toast }: Props) {
  const [list, setList] = useState<VocabEntry[]>([]);
  const [term, setTerm] = useState("");
  const [gloss, setGloss] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [eTerm, setETerm] = useState("");
  const [eGloss, setEGloss] = useState("");

  useEffect(() => {
    if (open) {
      setList(loadVocab());
      setEditing(null);
    }
  }, [open]);

  const commit = (next: VocabEntry[]) => {
    setList(next);
    saveVocab(next);
  };

  const add = () => {
    const r = addEntry(list, { term, gloss });
    if (!r.ok) {
      if (r.reason !== "empty") toast(REASON_TEXT[r.reason!]);
      return;
    }
    commit(r.list);
    setTerm("");
    setGloss("");
  };

  const startEdit = (i: number) => {
    setEditing(i);
    setETerm(list[i].term);
    setEGloss(list[i].gloss ?? "");
  };

  const saveEdit = () => {
    if (editing === null) return;
    const r = updateEntry(list, editing, { term: eTerm, gloss: eGloss });
    if (!r.ok) {
      toast(REASON_TEXT[r.reason!]);
      return;
    }
    commit(r.list);
    setEditing(null);
  };

  const onKey = (e: React.KeyboardEvent, fn: () => void) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fn();
    }
  };

  return (
    <>
      <div className={"drawer-ovl" + (open ? " on" : "")} onClick={onClose} />
      <div className={"drawer" + (open ? " on" : "")}>
        <div className="dr-h">
          <h2>組織の語彙</h2>
          <p>次の変換からAIの読み取りに反映されます。</p>
        </div>
        <div className="dr-body">
          <div className="vc-add">
            <input
              value={term}
              placeholder="語"
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => onKey(e, add)}
            />
            <input
              value={gloss}
              placeholder="意味（任意）"
              onChange={(e) => setGloss(e.target.value)}
              onKeyDown={(e) => onKey(e, add)}
            />
            <button className="mini ic" data-tip="追加" onClick={add}>
              ＋
            </button>
          </div>

          {list.map((v, i) =>
            editing === i ? (
              <div className="vc-row editing" key={i}>
                <input value={eTerm} onChange={(e) => setETerm(e.target.value)} onKeyDown={(e) => onKey(e, saveEdit)} autoFocus />
                <input value={eGloss} placeholder="意味（任意）" onChange={(e) => setEGloss(e.target.value)} onKeyDown={(e) => onKey(e, saveEdit)} />
                <button className="mini ic" data-tip="保存" onClick={saveEdit}>
                  ✓
                </button>
                <button className="mini ic" data-tip="取消" onClick={() => setEditing(null)}>
                  ×
                </button>
              </div>
            ) : (
              <div className="vc-row" key={i}>
                <span className="vc-term">{v.term}</span>
                <span className="vc-gloss">{v.gloss ?? ""}</span>
                <button className="mini ic" data-tip="直す" onClick={() => startEdit(i)}>
                  ✎
                </button>
                <button className="mini ic" data-tip="外す" onClick={() => commit(removeEntry(list, i))}>
                  ×
                </button>
              </div>
            )
          )}
        </div>
        <div className="dr-f">この端末内のみ・人名は入れない</div>
      </div>
    </>
  );
}
