"use client";

// 確認ダイアログ（kuronuri-mock-v1 の .dlg）。戻る・やり直し・未塗りの警告・再変換の同意に使う。
// 説明は「いま何が失われるか／何が起きるか」だけを書く（常時表示の説明文ではない）。

import type { ReactNode } from "react";

export type DialogSpec = {
  title: string;
  body: ReactNode;
  warn?: string;
  go: string;
  cancel: string;
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
          <button className="cancel" onClick={spec.onCancel}>
            {spec.cancel}
          </button>
          <button className="go" onClick={spec.onGo} autoFocus>
            {spec.go}
          </button>
        </div>
      </div>
    </div>
  );
}
