"use client";

// 章の目次（**小口のインデックス**）。使い方ページ（/about）と読みもののページ（/yomimono/…）で使い回す（作りを2つ持たない）。
// 設計意図は docs/mock/tsukaikata-index-mock.html の**案B**（凍結・参照のみ。案Aと差し込みの紙から開くシートは採らない）。
//
// [DECISION 2026-09-30・設計側] 目次を案Bにした（P17）。章が多く、スクロールすると今どの章にいるかが分からなかった。
//   - 幅880px以上: 本文の紙の右端に縦のインデックスを並べ、スクロールに貼り付ける。いまの章のタブだけが長く飛び出し、濃い色になる
//   - 880px未満: 上に貼り付く帯に、いまの章の名前だけを出す（下の章へ進むと下から、戻ると上から入れ替わる）。
//     帯の下の細い線で読んだ位置を示す。帯を押すと章の一覧が開き、外側を押す・Esc・章を選ぶ、のいずれでも閉じる
//   - タブを押すとその章へ滑らかに移る。**移っている間は途中の章に表示を揺らさない**（移り終わるまで表示を行き先に留める）
//   - 端末の「視差効果を減らす」がオンなら動かさない（スクロールも名前の入れ替えも）
// [DECISION 2026-09-30] ⚠️ **縦の文字は writing-mode を使わず、1字ずつ改行して並べる**（ボタンの中の縦書きが Chromium で潰れた）。
// [DECISION 2026-09-30] 移り終えたあとは、利用者が次にスクロールするまで行き先の章を出し続ける。ページの最後の章が短いと
//   行き先まで上がりきらず、スクロール位置だけで判定すると「いちばん下＝最後の章」に表示が変わってしまうため。
// [DECISION 2026-09-30] タブと一覧は `<a href="#章の id">`（押しても何も起きない部品にしない。JS が効かなくても章へ飛ぶ）。
//   貼り付く見出し（`data-ix-head` を付けた header が sticky のとき）の高さだけ、帯とインデックスを下げる。

import { Fragment, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

export type IndexChapter = { id: string; h: string; rail: string; c: string };

type Props = {
  chapters: readonly IndexChapter[];
  /** 「目次」（帯の右の文字・一覧とインデックスの名前） */
  label: string;
  children: ReactNode;
};

/**
 * ページの終わりで、頭が判定の線まで上がりきらない章に割り当てるスクロールの幅（px）。
 * [DECISION 2026-09-30] 最後の章を「最下端なら最後の章」で決めていた規則をやめた（P18）。768px の読みものでは最後の2章が同じ画面に収まり、
 *   「面談のあとに」の頭が上がりきる前に最下端に着いて、表示が「会議のメモ」に飛んでいた。各章が「いまの章」になる位置を
 *   min（頭が線に届く位置, 最下端 −（後ろに残る章の数）× この幅）にする。どの幅でも、すべての章がこの幅以上のスクロールのあいだ一度は「いまの章」になる。
 *   余白は足さない（ページの下に空白を作らず、上がりきる章はこれまでどおり頭が線に届いたときに切り替わる）。
 *   短いページでは（最下端 ÷ 章の数）まで縮める（先頭の章が最初から「いまの章」にならないように）。
 */
const MIN_DWELL = 80;

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shown = (el: Element | null) => !!el && getComputedStyle(el).display !== "none";

export default function ChapterIndex({ chapters, label, children }: Props) {
  const [active, setActive] = useState(-1);
  const [dir, setDir] = useState<"up" | "down">("up");
  const [open, setOpen] = useState(false);
  const [prog, setProg] = useState(0);
  const [top, setTop] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const activeRef = useRef(-1);
  /** 章へ移っている最中（null）か、移り終えて利用者のスクロールを待っている（"hold"）か */
  const jump = useRef<null | "moving" | "hold">(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listId = useId();

  const show = useCallback((i: number) => {
    if (i === activeRef.current) return;
    setDir(i > activeRef.current ? "up" : "down");
    activeRef.current = i;
    setActive(i);
  }, []);

  /** 章の先頭を合わせる位置（貼り付く見出し＋帯、または余白） */
  const offset = useCallback(() => (shown(barRef.current) ? top + barRef.current!.offsetHeight + 14 : top + 28), [top]);

  const compute = useCallback(() => {
    const th = offset() + 40;
    const y = window.scrollY;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const n = chapters.length;
    const dwell = Math.min(MIN_DWELL, max / Math.max(1, n));
    let idx = -1;
    chapters.forEach((ch, i) => {
      const el = document.getElementById(ch.id);
      if (!el) return;
      // その章の頭が判定の線に届くスクロール位置。ページの終わりまでに届かない章は、終わりの手前に dwell ずつ割り当てる
      const natural = y + el.getBoundingClientRect().top - th;
      const at = Math.min(natural, max - (n - 1 - i) * dwell);
      if (at <= y + 2) idx = i;
    });
    show(idx);
  }, [chapters, offset, show]);

  // 貼り付く見出しの高さを測る（字の読み込みや幅の変化で変わる）
  useEffect(() => {
    const head = document.querySelector<HTMLElement>("[data-ix-head]");
    if (!head) return;
    const measure = () => setTop(getComputedStyle(head).position === "sticky" ? head.offsetHeight : 0);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(head);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProg(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
      if (jump.current === "moving") {
        // 移っている間は表示を揺らさない。スクロールが止まったら移り終えたとみなす
        clearTimeout(timer.current);
        timer.current = setTimeout(() => (jump.current = "hold"), 140);
        return;
      }
      // 移り終えたあと（"hold"）の最初のスクロールは利用者のもの。ここから先はスクロール位置で判定する
      jump.current = null;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          compute();
        });
      }
    };
    const onResize = () => {
      jump.current = null;
      compute();
    };
    compute();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [compute]);

  // 小口のインデックスが画面より高いとき（章が多い・画面が低い）は、インデックスの中だけを送って、いまの章のタブを見せる
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || active < 0 || !shown(rail)) return;
    const tab = rail.children[active] as HTMLElement | undefined;
    if (!tab) return;
    const above = tab.offsetTop - rail.scrollTop;
    if (above < 0) rail.scrollTop = tab.offsetTop - 8;
    else if (above + tab.offsetHeight > rail.clientHeight) rail.scrollTop = tab.offsetTop + tab.offsetHeight - rail.clientHeight + 8;
  }, [active]);

  // 一覧は外側を押す・Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (i: number) => (e: MouseEvent) => {
    const el = document.getElementById(chapters[i].id);
    if (!el) return; // 章が無ければ、リンクとしてそのまま飛ばす
    e.preventDefault();
    setOpen(false);
    show(i);
    const y = window.scrollY + el.getBoundingClientRect().top - offset() + 2;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const to = Math.max(0, Math.min(max, y));
    if (Math.abs(to - window.scrollY) < 1) {
      jump.current = null;
      return;
    }
    jump.current = "moving";
    const smooth = !reduced();
    window.scrollTo({ top: to, behavior: smooth ? "smooth" : "auto" });
    // スクロールが1回も起きなかったときの保険
    clearTimeout(timer.current);
    timer.current = setTimeout(() => (jump.current = "hold"), smooth ? 1200 : 80);
  };

  const cur = active >= 0 ? chapters[active] : null;
  const stick = { ["--ix-top" as string]: `${top}px` } as CSSProperties;

  return (
    <>
      <div className="ix-bar" ref={barRef} style={{ ...stick, ["--c" as string]: cur ? cur.c : "var(--line)" }}>
        <button
          type="button"
          className="ix-bbtn"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="ix-chip" aria-hidden />
          <span className="ix-name">
            <span key={active} className={dir === "up" ? "in-up" : "in-down"}>
              {cur ? cur.h : label}
            </span>
          </span>
          <span className="ix-more">
            {label}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
        <nav className="ix-list" id={listId} aria-label={label} inert={!open}>
          {chapters.map((ch, i) => (
            <a
              key={ch.id}
              href={"#" + ch.id}
              aria-current={i === active ? "true" : undefined}
              style={{ ["--c" as string]: ch.c }}
              onClick={go(i)}
            >
              <i aria-hidden />
              {ch.h}
            </a>
          ))}
        </nav>
        <span className="ix-prog" style={{ width: `${prog}%` }} aria-hidden />
      </div>

      <div className="ix-wrap">
        <article className="ix-paper">{children}</article>
        <nav className="ix-rail" ref={railRef} style={stick} aria-label={label}>
          {chapters.map((ch, i) => (
            <a
              key={ch.id}
              className="ix-tab"
              href={"#" + ch.id}
              aria-label={ch.h}
              aria-current={i === active ? "true" : undefined}
              style={{ ["--c" as string]: ch.c }}
              onClick={go(i)}
            >
              <span className="v" aria-hidden>
                {[...ch.rail].map((c, k) => (
                  <Fragment key={k}>
                    {k > 0 && <br />}
                    {c}
                  </Fragment>
                ))}
              </span>
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
