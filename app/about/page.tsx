// 使い方ページ（/about）。**文面の正本は lib/about-copy.ts**。
//   体裁の正本は docs/mock/tsukaikata-mock-v3.html（凍結。v1・v2 は旧版として凍結）。文面が食い違ったら実装が正しい。
//   このファイルは器（構造・クラス名）だけを持ち、文字は持たない。
//
// [DECISION 2026-09-09] **作業画面の外の独立したページ**（/about）。作業の流れに説明を差し込まない（引き算原則）。
// [DECISION 2026-09-09] **合言葉ゲートの外側**に置く。理由は台帳「いま守る制約 → 使い方ページ」を参照。
//   検索避けは維持（robots.txt の Disallow と、この画面の noindex）。
// [DECISION 2026-09-11] 画面写真は **押すと原寸が別タブで開く**（`<a target="_blank">` で包むだけ）。
//   ページ幅では細部（印のポップオーバー・こぼれの一覧）が読めないため。部品もJSも増やさない。
// [DECISION 2026-09-11] 写真は **`loading="lazy"` ＋ 寸法指定**。12枚あるので見えている分だけ読み、
//   読み込み中に文章の位置がずれないようにする。
// [DECISION 2026-09-12] **体裁を v3 に作り直した**（P8-h）。手順は縦の一本線でつなぎ（番号が左端に一列）、
//   カードをやめて幅を揃える。章の頭は番号の四角＋見出し＋右に一行の説明、下に章の色の太線。
//   画像は本文より控えめ（最大520px・縦長は330px）。ラベルと説明は表組み（dl）。
// [DECISION 2026-09-12] ⚠️ 手順の入れ物は **`ab-steps`**（モックは `steps`）。`steps` は作業画面の工程表示の
//   規則（`.steps span{white-space:nowrap}` など）とぶつかり、説明文が折り返さずに横へはみ出していた。

import { Fragment } from "react";
import type { Metadata } from "next";
import { ABOUT, type Shot } from "@/lib/about-copy";
import CloseButton from "./CloseButton";

export const metadata: Metadata = {
  title: ABOUT.pageTitle,
  robots: { index: false, follow: false },
};

/** 番号の無い章の頭に置く印（番号のある章は見出しの数字を四角に出す） */
const MARK: Record<string, string> = { prep: "▢", dict: "▤", caution: "!", trouble: "?" };

/** 導入を見出しの右に一行で出さず、見出しの下に段落で出す章（導入が長い） */
const LEAD_BELOW = new Set(["prep"]);

/** 縦長（高さ÷幅がこれ以上）の写真は幅を狭くする（最大330px） */
const NARROW = 0.9;

/** 「1 取り込み」→ 四角に出す番号と、見出しの文字に分ける */
function splitHead(id: string, h: string): { no: string; title: string; numbered: boolean } {
  const m = h.match(/^(\d+)\s+(.+)$/);
  return m ? { no: m[1], title: m[2], numbered: true } : { no: MARK[id] ?? "", title: h, numbered: false };
}

/** 章の頭: 番号の四角＋見出し＋右に一行の説明。下に章の色の太線（CSS） */
function SecHead({ id, h, sub }: { id: string; h: string; sub?: string }) {
  const { no, title, numbered } = splitHead(id, h);
  return (
    <div className="sec-head">
      <div className="sec-no" aria-hidden={!numbered}>
        {no}
      </div>
      <h2>{title}</h2>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

/** 画面写真。本文より控えめに置き、押すと原寸が別タブで開く（拡大の代わり。部品を増やさない） */
function Shots({ shots }: { shots?: readonly Shot[] }) {
  if (!shots?.length) return null;
  return (
    <>
      {shots.map((s) => (
        <div key={s.src} className={"shot" + (s.h / s.w >= NARROW ? " narrow" : "")}>
          <a href={s.src} target="_blank" rel="noopener">
            {/* 寸法の属性は読み込み中の位置ずれ防止に残し、はみ出しは CSS（max-width:100%・height:auto）で抑える */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt={s.alt} loading="lazy" decoding="async" width={s.w} height={s.h} />
          </a>
        </div>
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
        <h1>{ABOUT.h1}</h1>
        <p className="lead">{ABOUT.lead}</p>
        <div className="dummy">{ABOUT.note}</div>

        <nav className="toc">
          {ABOUT.toc.map((t) => (
            <a key={t.id} href={"#" + t.id} style={{ ["--c" as string]: t.c }}>
              {t.label}
            </a>
          ))}
        </nav>

        {ABOUT.chapters.map((ch) => (
          <section key={ch.id} id={ch.id} style={{ ["--c" as string]: ch.c }}>
            <SecHead id={ch.id} h={ch.h} sub={LEAD_BELOW.has(ch.id) ? undefined : ch.lead} />
            {LEAD_BELOW.has(ch.id) && ch.lead && <p className="sec-lead">{ch.lead}</p>}
            <div className="ab-steps">
              {ch.steps.map((st) => (
                <div className="step" key={st.n}>
                  <span className="n">{st.n}</span>
                  <h3>{st.h}</h3>
                  {st.ps?.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                  {st.pairs && (
                    <dl className="pairs">
                      {st.pairs.map((pr) => (
                        <Fragment key={pr.lb}>
                          <dt className={pr.mk}>{pr.lb}</dt>
                          <dd>{pr.tx}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  )}
                  {st.tip && <div className={"tip" + (st.warn ? " warn" : "")}>{st.tip}</div>}
                  <Shots shots={st.shots} />
                </div>
              ))}
            </div>
          </section>
        ))}

        <section id="caution" style={{ ["--c" as string]: "var(--t4)" }}>
          <SecHead id="caution" h={ABOUT.toc[7].label} />
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
          <SecHead id="trouble" h={ABOUT.toc[8].label} />
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
