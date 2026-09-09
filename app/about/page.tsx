// 使い方ページ（P6-d。内容と体裁の正本: docs/mock/tsukaikata-mock-v1.html。文面は確定済みで変えない）
//
// [DECISION 2026-09-09] **作業画面の外の独立したページ**（/about）。作業の流れに説明を差し込まない（引き算原則）。
// [DECISION 2026-09-09] **合言葉ゲートの外側**に置く。理由は台帳「P6-d の決定」を参照。
//   ページに載るのは仕様と運用ルールだけで、法人名・施設名・個人情報・合言葉は含まない（機械テストで保証）。
//   検索避けは維持（robots.txt の Disallow と、この画面の noindex）。

import type { Metadata } from "next";
import CloseButton from "./CloseButton";

export const metadata: Metadata = {
  title: "メモおこし — このアプリについて",
  robots: { index: false, follow: false },
};

/** 5つの工程（モックの並びと文面のまま） */
const STEPS: { n: string; c: string; h: string; p: string }[] = [
  {
    n: "1",
    c: "var(--t1)",
    h: "取り込み",
    p: "メモを撮影するか、写真・PDFから選びます。複数枚を1件の記録としてまとめられます。読む順番は並べ替えで調整できます。",
  },
  {
    n: "2",
    c: "var(--t4)",
    h: "伏せる",
    p: "氏名などを指でなぞって隠します。隠した状態の画像だけが送られ、隠す前の画像はこの端末から出ません。",
  },
  {
    n: "3",
    c: "var(--t3)",
    h: "変換",
    p: "選んだ項目にそって、メモの内容を振り分けます。書かれていないことは空欄のままにします。どの項目にも入らなかった内容は捨てずに残します。",
  },
  {
    n: "4",
    c: "var(--t2)",
    h: "確認",
    p: "元のメモと見比べて直します。読み取りに自信がない箇所や推測した箇所には印が付きます。ここが一番大事な工程です。",
  },
  {
    n: "5",
    c: "var(--t6)",
    h: "出力",
    p: "項目ごと、または全文をコピーして、普段の記録システムに貼り付けます。Word・PDFでの書き出しもできます。",
  },
];

const MARKS: { k: "y" | "b" | "r"; label: string; text: string }[] = [
  { k: "y", label: "黄", text: "読み取りに自信がない箇所。候補から選ぶか、自分で直します。" },
  { k: "b", label: "青", text: "メモに書かれておらず、前後から推測した箇所。採用するかを判断します。" },
  { k: "r", label: "赤", text: "人名らしき語。隠し忘れの保険です。置き換えるまで完成できません。" },
];

const CAUTIONS: { b: string; s: string }[] = [
  {
    b: "出てくるのは下書きです",
    s: "記録そのものではありません。内容を確かめ、必要なら書き直したうえで、普段の記録として仕上げてください。記録の責任は書いた人にあります。",
  },
  {
    b: "伏せ忘れは自分の目で確かめてください",
    s: "赤い印は保険であって、完全ではありません。送る前に、隠すべき箇所が残っていないか必ず見てください。",
  },
  {
    b: "AIの気づきは参考です",
    s: "支援の方針を示すものではありません。見落としがないか考えるきっかけとして使ってください。記録には含まれません。",
  },
  {
    b: "閉じると消えます",
    s: "このアプリは内容を保存しません。作業の途中で閉じたり戻ったりすると、それまでの内容は失われます。",
  },
  {
    b: "辞書に人名は入れないでください",
    s: "事業所でよく使う言葉を登録すると読み取りが良くなりますが、人の名前は登録しないでください。",
  },
];

export default function AboutPage() {
  return (
    <div className="about">
      <header>
        <div className="h-in">
          <div className="brand">メモおこし</div>
          <CloseButton />
        </div>
      </header>

      <main>
        <div className="lead">
          <h1>手書きのメモを、記録の下書きに</h1>
          <p>
            面談中に走り書きしたメモを撮って、記録の形に整えます。清書に取られる時間を減らし、聞くことに集中できるようにするための道具です。
          </p>
        </div>

        <section>
          <h2 style={{ ["--c" as string]: "var(--t2)" }}>使う場面</h2>
          <div className="who">
            <p>
              相談支援、ケアマネジメント、サービス管理、生活相談など、面談やモニタリングの記録を書く仕事を想定しています。断片的な走り書きから、面談の様子・家族の話・課題・申し送りといった形に起こします。
            </p>
            <p className="also">
              教育相談や三者面談、退院支援の面談など、対面で話を聞いて決まった書式に記録する仕事であれば、同じ形で使えます。記録の項目は事業所ごとに選べます。
            </p>
          </div>
        </section>

        <section>
          <h2 style={{ ["--c" as string]: "var(--t1)" }}>5つの工程</h2>
          <div className="flow">
            {STEPS.map((s) => (
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
          <h2 style={{ ["--c" as string]: "var(--t3)" }}>確認画面の印</h2>
          <div className="marks">
            {MARKS.map((m) => (
              <div className="mk-row" key={m.k}>
                <span className={"mk " + m.k}>{m.label}</span>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ ["--c" as string]: "var(--t4)" }}>このアプリで完結しないこと</h2>
          <div className="caution">
            <ul>
              {CAUTIONS.map((c) => (
                <li key={c.b}>
                  <b>{c.b}</b>
                  <span>{c.s}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <footer>試験運用中です。うまくいかない点や気づいたことがあれば教えてください。</footer>
      </main>
    </div>
  );
}
