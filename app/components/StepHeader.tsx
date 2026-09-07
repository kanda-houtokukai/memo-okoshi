"use client";

// 取り込み／黒塗り／変換中の画面で使うヘッダー。確認画面（Review）のヘッダーと同じ構造。

import type { ReactNode } from "react";

export type Step = "intake" | "mask" | "convert";

const STEPS: { key: Step | "review" | "output"; label: string }[] = [
  { key: "intake", label: "取り込み" },
  { key: "mask", label: "黒塗り" },
  { key: "convert", label: "変換" },
  { key: "review", label: "確認" },
  { key: "output", label: "出力" },
];

export default function StepHeader({ step, right }: { step: Step; right: ReactNode }) {
  return (
    <header>
      <div className="h-in">
        <div className="brand">メモおこし</div>
        <div className="steps">
          {STEPS.map((s, i) => (
            <span key={s.key} style={{ display: "contents" }}>
              {i > 0 && <i>›</i>}
              <span className={s.key === step ? "cur" : undefined}>{s.label}</span>
            </span>
          ))}
        </div>
        <div className="h-right">{right}</div>
      </div>
    </header>
  );
}
