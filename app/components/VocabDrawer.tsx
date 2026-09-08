"use client";

// 組織語彙のドロワー。項目ドロワー（Drawer.tsx）と同じ器・同じ作法（説明文なし・脚注1行）。
// 状態はこの部品が localStorage と直接やり取りする（開くたびに読み、変えるたびに保存）。

import { useEffect, useRef, useState } from "react";
import {
  addEntry,
  loadVocab,
  REASON_TEXT,
  removeEntry,
  saveVocab,
  updateEntry,
  type VocabEntry,
} from "@/lib/vocab";
import { exportBackup, importBackup } from "@/lib/backup";
import { ITEM_LIBRARY } from "@/lib/items";
import { VOCAB_CHANGED } from "./VocabButton";

type Props = { open: boolean; onClose: () => void; toast: (m: string) => void };

export default function VocabDrawer({ open, onClose, toast }: Props) {
  const [list, setList] = useState<VocabEntry[]>([]);
  const [term, setTerm] = useState("");
  const [gloss, setGloss] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [eTerm, setETerm] = useState("");
  const [eGloss, setEGloss] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setList(loadVocab());
      setEditing(null);
    }
  }, [open]);

  const commit = (next: VocabEntry[]) => {
    setList(next);
    saveVocab(next);
    window.dispatchEvent(new Event(VOCAB_CHANGED));
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const r = importBackup(JSON.parse(await f.text()), list, ITEM_LIBRARY.map((l) => l.id));
      if (!r.ok) {
        toast("辞書のファイルではありません");
        return;
      }
      commit(r.vocab);
      toast(`${r.added}語を追加${r.skipped ? `（${r.skipped}語は既にあり・除外）` : ""}${r.itemsApplied ? "・項目設定も読み込み" : ""}`);
    } catch {
      toast("読み込めませんでした");
    }
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
        <div className="dr-f dr-f-row">
          <span>この端末内のみ・人名は入れない</span>
          <span className="dr-f-btns">
            <button className="mini" onClick={() => exportBackup(list)} disabled={list.length === 0}>
              書き出し
            </button>
            <button className="mini" onClick={() => fileRef.current?.click()}>
              読み込み
            </button>
          </span>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />
        </div>
      </div>
    </>
  );
}
