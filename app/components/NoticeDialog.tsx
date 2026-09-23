"use client";

// ホームの「利用上の注意」を開いたときの本文。文面の正本は `lib/notice-copy.ts`。
//
// [DECISION 2026-09-23] **確認ダイアログと同じ作法（.dlg）で画面の中央に開く**（P14）。
//   3段落の文章を落ち着いて読ませる場で、送信前の確認（何が送られるか）と同じ見え方にそろう。
//   ポップオーバー（.pop）は印の横に出る小さな操作用で幅が狭く（最大305px）、段落を読むには向かない。
//   ドロワーは辞書・項目のような「操作する道具」を右から出すもので、ホームの下にあるリンクと場所がつながらない。
// [DECISION 2026-09-23] **閉じ方は3通り**: 「閉じる」・Esc・外側（暗い所）を押す。どれでも閉じ、押しても何も起きない状態を作らない。
//   開いたら「閉じる」に焦点を置き、閉じたらリンクへ焦点を戻す（キーボードで迷わない）。
//   閉じているあいだは何も描かない（本文は画面に無い＝原則4。`tests/notice.test.mts`）。

import { useEffect, useRef } from "react";
import { NOTICE } from "@/lib/notice-copy";

type Props = { open: boolean; onClose: () => void };

export default function NoticeDialog({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dlg-ovl on" onClick={onClose}>
      <div className="dlg notice" role="dialog" aria-modal="true" aria-labelledby="notice-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="notice-title">{NOTICE.title}</h2>
        {NOTICE.paras.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <div className="dlg-btns">
          <button ref={closeRef} className="go" onClick={onClose}>
            {NOTICE.close}
          </button>
        </div>
      </div>
    </div>
  );
}
