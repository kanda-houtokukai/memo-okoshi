// 読みもののページ（/yomimono/…）。**文面の正本は lib/yomimono-copy.ts**。このファイルは器だけで文字を持たない。
//   設計意図は docs/mock/memo-kotsu-mock.html（凍結・参照のみ）。**正本は実装**。
//
// [DECISION 2026-09-30・設計側] **合言葉ゲートの外**に置く（P17。middleware の PUBLIC に完全一致で足す）。検索避けは使い方ページと同じ
//   （robots.txt の Disallow と、この画面の noindex）。載るのは記録の作法だけで、法人名・施設名・個人情報・合言葉は書かない。
// [DECISION 2026-09-30] 道は読みものの一覧（READINGS）から作る。一覧に無い道は 404（dynamicParams=false）。
// [DECISION 2026-09-30] 目次は使い方ページと同じ `ChapterIndex`（案B）を使い回す。
// [DECISION 2026-09-30] 上の「ホーム」と最後の「ホームへ戻る」は `/` へのリンク。ゲートを通っていない人は、ゲートの既存の動き（/gate へ）に任せる。
// [DECISION 2026-09-30] 手書き風の字（Klee One）は**このページとホームの棚だけ**が読む（lib/hand-font.ts）。

import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ChapterIndex from "@/app/components/ChapterIndex";
import { HAND_FONT_HREF } from "@/lib/hand-font";
import { READINGS, YOMIMONO_UI, type ReadingTip } from "@/lib/yomimono-copy";

export const dynamicParams = false;

export function generateStaticParams() {
  return READINGS.map((r) => ({ slug: r.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const r = READINGS.find((x) => x.slug === slug);
  return { title: r?.pageTitle, robots: { index: false, follow: false } };
}

/** 手書き風の例（罫線の紙に1行ずつ） */
function Memo({ lines, off }: { lines: readonly string[]; off?: boolean }) {
  return (
    <div className={"ym-memo" + (off ? " off" : "")}>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

function Tip({ t }: { t: ReadingTip }) {
  return (
    <li>
      <h3>{t.h}</h3>
      <p>{t.p}</p>
      {t.memo && <Memo lines={t.memo} />}
      {t.cmp && (
        <div className="ym-cmp">
          <Memo lines={[t.cmp[0]]} off />
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M3 9h11M10 5l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <Memo lines={[t.cmp[1]]} />
        </div>
      )}
      {t.legend && (
        <dl className="ym-legend">
          {t.legend.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </li>
  );
}

export default async function ReadingPage({ params }: Params) {
  const { slug } = await params;
  const r = READINGS.find((x) => x.slug === slug);
  if (!r) notFound();
  return (
    <div className="ym">
      <link rel="stylesheet" href={HAND_FONT_HREF} precedence="default" />
      <header data-ix-head>
        <div className="ym-h">
          <a className="ym-home" href="/" aria-label={YOMIMONO_UI.homeLabel}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M8.5 2.5 4 7l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {YOMIMONO_UI.home}
          </a>
          <span className="brand">{YOMIMONO_UI.brand}</span>
          <span className="ym-sp" aria-hidden />
        </div>
      </header>
      <main className="ym-page">
        <div className="ym-intro">
          <h1>{r.title}</h1>
          <p>{r.lead}</p>
        </div>
        <ChapterIndex label={YOMIMONO_UI.toc} chapters={r.chapters.map((c) => ({ id: c.id, h: c.h, rail: c.rail, c: c.c }))}>
          {r.chapters.map((ch) => (
            <section key={ch.id} id={ch.id} className="ym-ch" style={{ ["--c" as string]: ch.c }}>
              <h2>{ch.h}</h2>
              <ul className="ym-tips">
                {ch.tips.map((t) => (
                  <Tip key={t.h} t={t} />
                ))}
              </ul>
            </section>
          ))}
        </ChapterIndex>
        <div className="ym-end">
          <a className="ym-back" href="/">
            {YOMIMONO_UI.back}
          </a>
        </div>
      </main>
    </div>
  );
}
