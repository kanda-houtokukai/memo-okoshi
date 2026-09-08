"use client";

// 「辞書」ボタン＋ドロワー。全工程のヘッダー右側（主ボタンの左）に同じ位置で出す。
// [DECISION 2026-09-08] 辞書の入口は工程によらずヘッダー固定（位置が変わらないように）。

import { useEffect, useState } from "react";
import VocabDrawer from "./VocabDrawer";
import { loadVocab } from "@/lib/vocab";

export const VOCAB_CHANGED = "memo-okoshi:vocab-changed";

export default function VocabButton({ toast }: { toast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    const refresh = () => setN(loadVocab().length);
    refresh();
    window.addEventListener(VOCAB_CHANGED, refresh);
    return () => window.removeEventListener(VOCAB_CHANGED, refresh);
  }, [open]);
  return (
    <>
      <button className="tool-btn" onClick={() => setOpen(true)}>
        辞書{n > 0 && <span className="ins-count">{n}</span>}
      </button>
      <VocabDrawer open={open} onClose={() => setOpen(false)} toast={toast} />
    </>
  );
}
