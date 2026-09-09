"use client";

// ホーム画面。正本は `docs/mock/home-mock-v3.html`（凍結・参照のみ）。
//
// [DECISION 2026-09-10] **アプリの起点をホームにする**（従来はいきなり取り込み画面だった）。
//   機能が「メモをおこす」だけではなくなったため、入口で選ばせる。`/` はこれまでどおり合言葉ゲートの内側。
// [DECISION 2026-09-10] カードは**同じ大きさの縦長を3枚**、**文字の大きさも同じ**にする。
//   「メモをおこす」を大きくする案（v2）は採らない。用紙も使い方も、その日その人にとっては主目的になりうるため。
// [DECISION 2026-09-10] **説明文は置かない**（原則4）。何をする画面かは絵と題だけで示す。
//   絵はモックのSVGをそのまま使う（走り書き→整った紙／枠のある用紙＋印刷の矢印／インデックス付きの冊子）。
// [DECISION 2026-09-10] 狭い画面（≤620px）では**横長の一列**に切り替える（縦長3枚だと1枚も収まらない）。
// [DECISION 2026-09-10] ホームでは**ヘッダーに使い方の入口を出さない**（カードと二重になるため）。
//   作業画面（取り込み・伏せる・確認・用紙）では従来どおりヘッダー右に固定する。

import StepHeader from "./StepHeader";
import VocabButton from "./VocabButton";

type Props = {
  onMemo: () => void;
  onSheet: () => void;
  toast: (m: string) => void;
};

export default function Home({ onMemo, onSheet, toast }: Props) {
  return (
    <div className="home-root">
      <StepHeader right={<VocabButton toast={toast} />} about={false} />

      <div className="home">
        <div className="home-in">
          <div className="hero">メモおこし</div>
          <div className="cards">
            <button className="hcard" style={{ ["--c" as string]: "var(--t1)" }} onClick={onMemo}>
              <div className="art" aria-hidden>
                {/* 走り書きの紙 → 整った紙 */}
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="8" y="14" width="34" height="46" rx="3" fill="#FDFCF9" stroke="#B8B2A6" strokeWidth="1.6" />
                  <rect x="6.5" y="20" width="4" height="11" rx="1.5" fill="#8FAE9D" />
                  <path
                    d="M15 26 q3 -3 6 0 t6 0 M15 33 q4 -3 7 0 t6 -1 M15 40 q3 -3 6 0 t5 0 M15 47 q4 -2 6 0"
                    stroke="#9A948A"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <rect x="34" y="22" width="38" height="50" rx="3" fill="#FFFFFF" stroke="#33566B" strokeWidth="1.8" />
                  <rect x="32.5" y="29" width="4" height="12" rx="1.5" fill="#93A9C0" />
                  <path d="M42 36 H64 M42 44 H64 M42 52 H58" stroke="#33566B" strokeWidth="2" strokeLinecap="round" />
                  <path d="M42 60 H52" stroke="#B8B2A6" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="ttl">メモをおこす</div>
            </button>

            <button className="hcard" style={{ ["--c" as string]: "var(--t3)" }} onClick={onSheet}>
              <div className="art" aria-hidden>
                {/* 枠のある用紙＋印刷して出てくる矢印 */}
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="15" y="8" width="50" height="56" rx="3" fill="#FFFFFF" stroke="#33566B" strokeWidth="1.8" />
                  <rect x="13.5" y="15" width="4" height="12" rx="1.5" fill="#CBB478" />
                  <path d="M22 17 H58" stroke="#33566B" strokeWidth="1.8" strokeLinecap="round" />
                  <rect x="22" y="24" width="17" height="16" rx="1.5" stroke="#9A948A" strokeWidth="1.3" />
                  <rect x="41" y="24" width="17" height="16" rx="1.5" stroke="#9A948A" strokeWidth="1.3" />
                  <rect x="22" y="43" width="17" height="16" rx="1.5" stroke="#9A948A" strokeWidth="1.3" />
                  <rect x="41" y="43" width="17" height="16" rx="1.5" stroke="#9A948A" strokeWidth="1.3" />
                  <path d="M25 31 H36 M25 35 H33" stroke="#D5D0C4" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M44 31 H55 M44 35 H52" stroke="#D5D0C4" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M25 50 H36 M25 54 H33" stroke="#D5D0C4" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M44 50 H55 M44 54 H52" stroke="#D5D0C4" strokeWidth="1.2" strokeLinecap="round" />
                  <path
                    d="M40 64 V74 M35 69 L40 74 L45 69"
                    stroke="#CBB478"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="ttl">面談用紙を印刷</div>
            </button>

            <a className="hcard" style={{ ["--c" as string]: "var(--t2)" }} href="/about" target="_blank" rel="noopener">
              <div className="art" aria-hidden>
                {/* インデックスタブ付きの冊子 */}
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M40 20 C34 15, 22 14, 14 16 V62 C22 60, 34 61, 40 66 Z"
                    fill="#FDFCF9"
                    stroke="#33566B"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M40 20 C46 15, 58 14, 66 16 V62 C58 60, 46 61, 40 66 Z"
                    fill="#FFFFFF"
                    stroke="#33566B"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path d="M40 20 V66" stroke="#33566B" strokeWidth="1.8" />
                  <rect x="64.5" y="22" width="5" height="13" rx="1.5" fill="#93A9C0" />
                  <rect x="64.5" y="38" width="5" height="13" rx="1.5" fill="#8FAE9D" />
                  <path d="M20 26 H33 M20 33 H31 M20 40 H33" stroke="#B8B2A6" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M47 26 H60 M47 33 H58 M47 40 H60" stroke="#B8B2A6" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="ttl">使い方</div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
