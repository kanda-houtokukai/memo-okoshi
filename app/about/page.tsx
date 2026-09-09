// 使い方ページ（P6-d）。**文面の正本は lib/about-copy.ts**（2026-09-09に移管）。
//   docs/mock/tsukaikata-mock-v1.html は**体裁の記録**として凍結。文面が食い違ったら実装が正しい。
//   このファイルは器（構造・クラス名）だけを持ち、文字は持たない。
//
// [DECISION 2026-09-09] **作業画面の外の独立したページ**（/about）。作業の流れに説明を差し込まない（引き算原則）。
// [DECISION 2026-09-09] **合言葉ゲートの外側**に置く。理由は台帳「P6-d の決定」を参照。
//   検索避けは維持（robots.txt の Disallow と、この画面の noindex）。

import type { Metadata } from "next";
import { ABOUT } from "@/lib/about-copy";
import CloseButton from "./CloseButton";

export const metadata: Metadata = {
  title: ABOUT.pageTitle,
  robots: { index: false, follow: false },
};

export default function AboutPage() {
  return (
    <div className="about">
      <header>
        <div className="h-in">
          <div className="brand">{ABOUT.brand}</div>
          <CloseButton />
        </div>
      </header>

      <main>
        <div className="lead">
          <h1>{ABOUT.h1}</h1>
          <p>{ABOUT.lead}</p>
        </div>

        <section>
          <h2 style={{ ["--c" as string]: "var(--t2)" }}>{ABOUT.headings.who}</h2>
          <div className="who">
            <p>{ABOUT.who}</p>
            <p className="also">{ABOUT.whoAlso}</p>
          </div>
        </section>

        <section>
          <h2 style={{ ["--c" as string]: "var(--t1)" }}>{ABOUT.headings.flow}</h2>
          <div className="flow">
            {ABOUT.steps.map((s) => (
              <div className="step" key={s.n} style={{ ["--c" as string]: s.c }}>
                <span className="n">{s.n}</span>
                <div className="tx">
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ ["--c" as string]: "var(--t3)" }}>{ABOUT.headings.marks}</h2>
          <div className="marks">
            {ABOUT.marks.map((m) => (
              <div className="mk-row" key={m.k}>
                <span className={"mk " + m.k}>{m.label}</span>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ ["--c" as string]: "var(--t4)" }}>{ABOUT.headings.cautions}</h2>
          <div className="caution">
            <ul>
              {ABOUT.cautions.map((c) => (
                <li key={c.b}>
                  <b>{c.b}</b>
                  <span>{c.s}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <footer>{ABOUT.footer}</footer>
      </main>
    </div>
  );
}
