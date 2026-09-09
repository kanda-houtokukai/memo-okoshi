"use client";

// 取り込み画面（P6-cで作り直し。動作仕様の正本: docs/mock/torikomi-mock-v1.html）
//
// 設計の核: **画面全体が机**。取り込んだページは机に並べた白い紙で、わずかに傾いている。
// 紙にカーソルを載せたときだけ操作が現れる（引き算原則）。列の末尾に次を置く空きスロット。
// ドラッグ＆ドロップの受け皿は机全体（面が沈んで受け皿であることを示す）。
//
// [DECISION 2026-09-09] **並べ替えはモックと変える**。モックは ↑↓ だが、紙は横に並ぶので
//   **←→** にする（動く方向と矢印を一致させる）。複数ページは渡された順にAIが読み1件の記録へ
//   統合するため、並び順は読み取り内容の正しさに直結する。
// [DECISION 2026-09-09] **ドラッグでの並べ替えを主・←→ を副**とする。掴む場所は紙の右上の
//   「つまみ」（⠿）。マウスは紙の本体からも掴める（4px 動いたらドラッグ開始＝ただの押下と区別）。
//   タッチは**つまみからのみ**（touch-action:none）。長押し待ちを入れず、机のスクロールとも競合しない。
// [DECISION 2026-09-09] 端末別の取り込み経路・PDFのページ画像化・読み込み失敗のトーストは現行のまま。
//
// 端末に応じた入口の出し分け（P6 項目5・変更なし）:
// - iOS/Android: 「カメラで撮影」（capture）／「写真から選ぶ」（画像のみ）／「ファイルを選ぶ」（画像・PDF）
// - PC（Windows/Mac）: 直接ファイル選択（画像・PDF）。ドラッグ＆ドロップにも対応

import { useEffect, useRef, useState } from "react";
import type { PageItem } from "@/lib/pages";
import StepHeader, { type Step } from "./StepHeader";
import VocabButton from "./VocabButton";
import { dropIndex, type Rect } from "@/lib/reorder";

/** 紙の左肩のインデックスタブ（記録カードと同じモチーフ・順に色を変える） */
const TAB = ["var(--t1)", "var(--t2)", "var(--t3)", "var(--t4)", "var(--t5)", "var(--t6)"];

/** マウスで紙の本体を掴むときの遊び（これ未満はドラッグにしない） */
const DRAG_SLOP = 4;
/** 机の端でドラッグしたときの自動スクロール */
const EDGE = 70;
const EDGE_STEP = 16;

type Props = {
  pages: PageItem[];
  busy: boolean;
  error?: string;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  /** from 番目の紙を insertAt の手前へ置き直す（0..pages.length） */
  onReorder: (from: number, insertAt: number) => void;
  onNext: () => void;
  onHome: () => void;
  toast: (m: string) => void;
};

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  // iPadOS 13+ は Mac を名乗る
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

type Drag = { id: string; from: number; dx: number; dy: number; over: number };

export default function Intake({ pages, busy, error, onAdd, onRemove, onMove, onReorder, onNext, onHome, toast }: Props) {
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** 「置かれる動き」は取り込んだ回だけ。並べ替え・削除では出さない（DOMの並び替えで再生されるのを止める） */
  const seen = useRef<Set<string>>(new Set());
  const deskRef = useRef<HTMLDivElement>(null);
  const sheetsRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMobile(isMobileDevice()), []);
  useEffect(() => {
    pages.forEach((p) => seen.current.add(p.id));
  });

  /* 机は固定ビューポート（伏せる画面と同じ作法）。ページ自体はスクロールさせない */
  useEffect(() => {
    document.documentElement.classList.add("lock");
    return () => document.documentElement.classList.remove("lock");
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".pop") || t.closest(".add") || t.closest(".slot")) return;
      setMenu(null);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  const openMenu = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 320)),
      top: Math.min(r.bottom + 8, window.innerHeight - 190),
    });
  };

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => {
    setMenu(null);
    ref.current?.click();
  };

  /** ＋（空のときの紙／末尾の空きスロット）を押したとき */
  const openIntake = (e: React.MouseEvent<HTMLElement>) => {
    if (busy) return;
    if (!mobile) return pick(fileRef);
    return menu ? setMenu(null) : openMenu(e.currentTarget);
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (fs.length) onAdd(fs);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const fs = Array.from(e.dataTransfer.files ?? []).filter(
      (f) => /^image\//.test(f.type) || /\.pdf$/i.test(f.name) || f.type === "application/pdf"
    );
    if (fs.length) onAdd(fs);
    else toast("画像かPDFを入れてください");
  };

  /* ---------- 紙を掴んで置き直す ---------- */

  const rectsNow = (): Rect[] =>
    Array.from(sheetsRef.current?.querySelectorAll<HTMLElement>(".sheet") ?? []).map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });

  /** 掴んでいる紙を除いた並びで落とし先を測り、元の並びでの挿入位置に直す */
  const insertAtFor = (from: number, x: number, y: number): number => {
    const rects = rectsNow().filter((_, i) => i !== from);
    const k = dropIndex(rects, x, y);
    return k < from ? k : k + 1;
  };

  const edgeScroll = (y: number) => {
    const d = deskRef.current;
    if (!d) return;
    const r = d.getBoundingClientRect();
    if (y < r.top + EDGE) d.scrollTop -= EDGE_STEP;
    else if (y > r.bottom - EDGE) d.scrollTop += EDGE_STEP;
  };

  const startDrag = (e: React.PointerEvent, from: number, id: string, slop: number) => {
    if (busy || pages.length < 2) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let live = slop === 0;
    if (live) setDrag({ id, from, dx: 0, dy: 0, over: from });

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!live) {
        if (Math.hypot(dx, dy) < slop) return;
        live = true;
      }
      edgeScroll(ev.clientY);
      setDrag({ id, from, dx, dy, over: insertAtFor(from, ev.clientX, ev.clientY) });
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (live) {
        const at = insertAtFor(from, ev.clientX, ev.clientY);
        if (at !== from && at !== from + 1) onReorder(from, at);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  /** 紙の本体はマウスでだけ掴める（タッチは机のスクロールを優先し、つまみから掴む） */
  const onSheetDown = (e: React.PointerEvent, from: number, id: string) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    startDrag(e, from, id, DRAG_SLOP);
  };

  const onGripDown = (e: React.PointerEvent, from: number, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    startDrag(e, from, id, 0);
  };

  /** 落ちる位置の線を出すか（動かない位置なら出さない） */
  const marker = drag && drag.over !== drag.from && drag.over !== drag.from + 1 ? drag.over : -1;

  return (
    <>
      <div className="ik-root">
        <StepHeader
          step="intake"
          onHome={onHome}
          right={<VocabButton toast={toast} />}
        />

        <div
          className={"desk" + (dragOver ? " over" : "") + (drag ? " lifting" : "")}
          ref={deskRef}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragOver) setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (e.relatedTarget && deskRef.current?.contains(e.relatedTarget as Node)) return;
            setDragOver(false);
          }}
          onDrop={onDrop}
        >
          <div className="sheets" ref={sheetsRef}>
            {/* [DECISION 2026-09-09] 空のときも**机の左上**（最初の紙の定位置）に置く。
                中央に置くと紙を入れた瞬間に位置が飛ぶため。寸法は紙と同じ 228×314。 */}
            {pages.length === 0 && (
              <button className="slot" onClick={openIntake} disabled={busy} aria-label="メモを取り込む">
                <span className="plus">{busy ? "…" : "＋"}</span>
              </button>
            )}

            {pages.map((p, i) => (
              <div
                key={p.id}
                className={
                  "sheet" +
                  (seen.current.has(p.id) ? "" : " lay") +
                  (drag?.id === p.id ? " lifted" : "") +
                  (marker === i ? " drop-here" : "")
                }
                style={{
                  ["--nc" as string]: TAB[i % TAB.length],
                  animationDelay: `${Math.min(i, 8) * 0.05}s`,
                  ...(drag?.id === p.id
                    ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(-1.2deg) scale(1.03)` }
                    : null),
                }}
                onPointerDown={(e) => onSheetDown(e, i, p.id)}
              >
                <img src={p.thumb} alt="" draggable={false} />
                <div className="foot">
                  <span className="no">{i + 1}</span>
                  <span className="nm">{p.name}</span>
                </div>
                <div className="tools">
                  <button
                    className="grip"
                    data-tip="つまんで並べ替え"
                    aria-label="つまんで並べ替え"
                    disabled={pages.length < 2}
                    onPointerDown={(e) => onGripDown(e, i, p.id)}
                    onClick={(e) => e.preventDefault()}
                  >
                    ⠿
                  </button>
                  <button data-tip="前へ" aria-label="前へ" disabled={i === 0} onClick={() => onMove(p.id, -1)}>
                    ←
                  </button>
                  <button
                    data-tip="後ろへ"
                    aria-label="後ろへ"
                    disabled={i === pages.length - 1}
                    onClick={() => onMove(p.id, 1)}
                  >
                    →
                  </button>
                  <button className="del" data-tip="外す" aria-label="このページを外す" onClick={() => onRemove(p.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}

            {pages.length > 0 && (
              <button
                className={"add" + (marker === pages.length ? " drop-here" : "")}
                data-tip="メモを追加"
                aria-label="メモを追加"
                disabled={busy}
                onClick={openIntake}
              >
                {busy ? "…" : "＋"}
              </button>
            )}

            {/* [DECISION 2026-09-09] 「次の次」の置き場所を薄い枠で2つ控えさせ、**何枚でも足せる**ことを
                形で伝える（説明文を足さない）。押すと＋と同じ取り込みメニューが開く（押して無反応にしない）。
                読み上げには出さない（＋と同じ役目が3つ並んで聞こえるのを避ける）。 */}
            <button className="ghost" aria-hidden tabIndex={-1} disabled={busy} onClick={openIntake} />
            <button className="ghost ghost2" aria-hidden tabIndex={-1} disabled={busy} onClick={openIntake} />
          </div>

          {error && <div className="errline desk-err">{error}</div>}
        </div>

        {/* [DECISION 2026-09-09] 紙が1枚以上あるときだけ、画面の下に操作の帯を出す。
            実機で「右上の次工程ボタンが次の操作だと気づかれない」ことが分かったため、
            作業している場所（紙）から視線がそのまま落ちる位置へ移した。同じものを2つ置かないよう
            ヘッダーの「伏せるへ」は外した。文言は行き先ではなく「次へ」（行き先はステップ表示が示す）。 */}
        {pages.length > 0 && (
          <div className="actionbar">
            <span className="count">
              <b>{pages.length}</b>枚
            </span>
            <button className="go" disabled={busy} onClick={onNext}>
              次へ<span className="ar">›</span>
            </button>
          </div>
        )}
      </div>

      {menu && mobile && (
        <div className="pop on" style={{ left: menu.left, top: menu.top }}>
          <button className="close" onClick={() => setMenu(null)}>
            ×
          </button>
          <button onClick={() => pick(camRef)}>カメラで撮影</button>
          <button onClick={() => pick(libRef)}>写真から選ぶ</button>
          <button onClick={() => pick(fileRef)}>ファイルを選ぶ（画像・PDF）</button>
        </div>
      )}

      {/* 経路の実体。capture 付きはスマホでカメラを直接開く。PC は fileRef だけを使う */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
      <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf,.heic,.heif" multiple hidden onChange={onFiles} />
    </>
  );
}
