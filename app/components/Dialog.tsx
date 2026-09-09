"use client";

// 確認ダイアログ（kuronuri-mock-v1 の .dlg）。戻る・やり直し・送信前の確認・再変換の同意に使う。
// 説明は「いま何が失われるか／何が起きるか」だけを書く（常時表示の説明文ではない）。
// [DECISION 2026-09-09] ボタンは左が「戻る側」・右が「進む側」（既定の位置）。焦点は既定で進む側だが、
//   送信のように取り返しがつかないものは focus:"cancel" にして、慎重な側から始める。

import type { ReactNode } from "react";

export type DialogSpec = {
  title: string;
  body: ReactNode;
  warn?: string;
  go: string;
  cancel: string;
  /** 既定の焦点。危ない側（送信・破棄）を選ばせたくないときは "cancel"（既定は "go"） */
  focus?: "go" | "cancel";
  onGo: () => void;
  onCancel: () => void;
};

export default function Dialog({ spec }: { spec: DialogSpec | null }) {
  if (!spec) return null;
  return (
    <div className="dlg-ovl on" onClick={spec.onCancel}>
      <div className="dlg" onClick={(e) => e.stopPropagation()}>
        <h2>{spec.title}</h2>
        <p>{spec.body}</p>
        {spec.warn && <div className="warn">{spec.warn}</div>}
        <div className="dlg-btns">
          <button className="cancel" onClick={spec.onCancel} autoFocus={spec.focus === "cancel"}>
            {spec.cancel}
          </button>
          <button className="go" onClick={spec.onGo} autoFocus={spec.focus !== "cancel"}>
            {spec.go}
          </button>
        </div>
      </div>
    </div>
  );
}
