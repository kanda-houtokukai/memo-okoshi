"use client";

// 共通ヘッダー。ステップ表示は「済んだ工程は押せる（戻れる）／未来の工程は薄い」。
// [DECISION 2026-09-08] 戻る導線はここに集約（kuronuri-mock-v1 の steps に合わせる）。
// [DECISION 2026-09-09] ステップ表示は**番号入りのタブ列**（docs/mock/steps-mock-v1.html の A案。B案=進捗バー型は不採用）。
//   丸い番号を添えて「全部で5工程」と「いまどこか」を形で示す。済んだ工程は押して戻れる。
// [DECISION 2026-09-09] 工程名の表示は「黒塗り」→**「伏せる」**。「黒塗り」は行政文書の
//   不開示処分を連想させるため。**変えるのは画面の文言だけ**で、コード内の識別子
//   （Step の "mask"／Redact／kuronuri-mock）は据え置く（無用な差分を増やさない）。

import type { ReactNode } from "react";

export type Step = "intake" | "mask" | "convert" | "review" | "output";

const STEPS: { key: Step; label: string }[] = [
  { key: "intake", label: "取り込み" },
  { key: "mask", label: "伏せる" },
  { key: "convert", label: "変換" },
  { key: "review", label: "確認" },
  { key: "output", label: "出力" },
];

type Props = {
  step: Step;
  /** 押せる（戻れる）工程 */
  done?: Step[];
  onStep?: (s: Step) => void;
  right: ReactNode;
  /** ブランドを押したとき（ホームへ戻る） */
  onHome?: () => void;
};

export default function StepHeader({ step, done = [], onStep, right, onHome }: Props) {
  const cur = STEPS.findIndex((s) => s.key === step);
  return (
    <header>
      <div className="h-in">
        {onHome ? (
          <button className="brand as-btn" onClick={onHome} data-tip="最初から">
            メモおこし
          </button>
        ) : (
          <div className="brand">メモおこし</div>
        )}
        <div className="steps">
          {STEPS.map((s, i) => {
            const isDone = done.includes(s.key);
            const n = <span className="n">{i + 1}</span>;
            return (
              <span key={s.key} style={{ display: "contents" }}>
                {i > 0 && <i>›</i>}
                {s.key === step ? (
                  <span className="s cur">
                    {n}
                    {s.label}
                  </span>
                ) : isDone && onStep ? (
                  <button className="s done" onClick={() => onStep(s.key)}>
                    {n}
                    {s.label}
                  </button>
                ) : (
                  // 済んだが戻れない工程（変換中の「伏せる」など）は、済んだ見た目のまま押せないだけにする
                  <span className={"s " + (i < cur ? "past" : "future")}>
                    {n}
                    {s.label}
                  </span>
                )}
              </span>
            );
          })}
        </div>
        <div className="h-right">
          {/* [DECISION 2026-09-09] 使い方の入口は全工程でここに固定（辞書の左）。
              作業中の画像・記録を失わせないため**別タブ**で開く。 */}
          <a
            className="about-link"
            href="/about"
            target="_blank"
            rel="noopener"
            data-tip="使い方"
            aria-label="使い方"
          >
            ?
          </a>
          {right}
        </div>
      </div>
    </header>
  );
}
