// 使い方ページ（/about）。**文面の正本は lib/about-copy.ts**。
//   体裁の正本は docs/mock/tsukaikata-mock-v2.html（凍結）。文面が食い違ったら実装が正しい。
//   このファイルは器（構造・クラス名）だけを持ち、文字は持たない。
//
// [DECISION 2026-09-09] **作業画面の外の独立したページ**（/about）。作業の流れに説明を差し込まない（引き算原則）。
// [DECISION 2026-09-09] **合言葉ゲートの外側**に置く。理由は台帳「いま守る制約 → 使い方ページ」を参照。
//   検索避けは維持（robots.txt の Disallow と、この画面の noindex）。
// [DECISION 2026-09-11] 画面写真は **押すと原寸が別タブで開く**（`<a target="_blank">` で包むだけ）。
//   ページ幅では細部（印のポップオーバー・こぼれの一覧）が読めないため。部品もJSも増やさない。
// [DECISION 2026-09-11] 写真は **`loading="lazy"` ＋ 寸法指定**。12枚あるので見えている分だけ読み、
//   読み込み中に文章の位置がずれないようにする。

import type { Metadata } from "next";
import { ABOUT, type Shot } from "@/lib/about-copy";
import CloseButton from "./CloseButton";

export const metadata: Metadata = {
  title: ABOUT.pageTitle,
  robots: { index: false, follow: false },
};

/** 画面写真。押すと原寸が別タブで開く（拡大の代わり。部品を増やさない） */
function Shots({ shots }: { shots?: readonly Shot[] }) {
  if (!shots?.length) return null;
  return (
    <>
      {shots.map((s) => (
        <a key={s.src} className="shot" href={s.src} target="_blank" rel="noopener">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.src} alt={s.alt} loading="lazy" decoding="async" width={s.w} height={s.h} />
        </a>
      ))}
    </>
  );
}

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
          <p className="note">{ABOUT.note}</p>
        </div>

        <nav className="toc">
          {ABOUT.toc.map((t) => (
            <a key={t.id} href={"#" + t.id} style={{ ["--c" as string]: t.c }}>
              {t.label}
            </a>
          ))}
        </nav>

        {ABOUT.chapters.map((ch) => (
          <section key={ch.id} id={ch.id} style={{ ["--c" as string]: ch.c }}>
            <h2>{ch.h}</h2>
            {ch.lead && <p className="sec-lead">{ch.lead}</p>}
            <div className="steps">
              {ch.steps.map((st) => (
                <div className="step" key={st.n}>
                  <span className="n">{st.n}</span>
                  <div className="body">
                    <h3>{st.h}</h3>
                    {st.ps?.map((p) => (
                      <p key={p}>{p}</p>
                    ))}
                    {st.pairs && (
                      <div className="pairs">
                        {st.pairs.map((pr) => (
                          <div className="pair" key={pr.lb}>
                            <span className={pr.mk ? "mk " + pr.mk : "lb"}>{pr.lb}</span>
                            <span className="tx">{pr.tx}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {st.tip && <div className={"tip" + (st.warn ? " warn" : "")}>{st.tip}</div>}
                    <Shots shots={st.shots} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section id="caution" style={{ ["--c" as string]: "var(--t4)" }}>
          <h2>{ABOUT.toc[7].label}</h2>
          <div className="cautions">
            {ABOUT.cautions.map((c) => (
              <div className="item" key={c.b}>
                <b>{c.b}</b>
                <span>{c.s}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="trouble" style={{ ["--c" as string]: "var(--t2)" }}>
          <h2>{ABOUT.toc[8].label}</h2>
          <div className="qa">
            {ABOUT.troubles.map((t) => (
              <div className="q" key={t.b}>
                <b>{t.b}</b>
                <span>{t.s}</span>
              </div>
            ))}
          </div>
        </section>

        <footer>{ABOUT.footer}</footer>
      </main>
    </div>
  );
}
