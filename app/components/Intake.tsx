"use client";

// 取り込み画面。端末に応じて入口を出し分ける（P6 項目5）。
// - iOS/Android: ＋ → 「カメラで撮影」（capture）／「写真から選ぶ」（画像のみ）／「ファイルを選ぶ」（画像・PDF）
// - PC（Windows/Mac）: ＋ → 直接ファイル選択（画像・PDF）。ドラッグ＆ドロップにも対応
// [DECISION 2026-09-08] PC ではカメラ経路を出さない（内蔵カメラで紙を撮る実用性が低く、
//   写真もファイルも同じエクスプローラーに落ちるため入口は1つにする）。
// [DECISION 2026-09-08] 端末判定は UA（iPhone/iPad/iPod/Android）＋ iPadOS の Mac 偽装対策
//   （MacIntel かつ maxTouchPoints>1）。判定が外れても「ファイルを選ぶ」は常に使える。

import { useEffect, useRef, useState } from "react";
import type { PageItem } from "@/lib/pages";
import StepHeader, { type Step } from "./StepHeader";
import VocabButton from "./VocabButton";

type Props = {
  pages: PageItem[];
  busy: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
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

export default function Intake({ pages, busy, onAdd, onRemove, onMove, onNext, onHome, toast }: Props) {
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMobile(isMobileDevice()), []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".pop") || t.closest(".page-add")) return;
      setMenu(null);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  const openMenu = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({
      left: Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - 320)),
      top: r.bottom + window.scrollY + 8,
    });
  };

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => {
    setMenu(null);
    ref.current?.click();
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (fs.length) onAdd(fs);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const fs = Array.from(e.dataTransfer.files ?? []).filter((f) => /^image\//.test(f.type) || /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (fs.length) onAdd(fs);
    else toast("画像かPDFを入れてください");
  };

  return (
    <>
      <StepHeader
        step="intake"
        onHome={onHome}
        right={
          <>
            <VocabButton toast={toast} />
            <button
              className={"done-btn" + (pages.length > 0 && !busy ? " ready" : "")}
              disabled={pages.length === 0 || busy}
              onClick={onNext}
            >
              黒塗りへ
            </button>
          </>
        }
      />

      <div
        className={"wrap single drop" + (dragOver ? " over" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="pages">
          {pages.map((p, i) => (
            <div className="page-card" key={p.id}>
              <span className="page-no">{i + 1}</span>
              <img src={p.thumb} alt="" />
              <div className="page-acts">
                <button className="mini ic" data-tip="前へ" onClick={() => onMove(p.id, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button className="mini ic" data-tip="後ろへ" onClick={() => onMove(p.id, 1)} disabled={i === pages.length - 1}>
                  ↓
                </button>
                <button className="mini ic" data-tip="外す" onClick={() => onRemove(p.id)}>
                  ×
                </button>
              </div>
            </div>
          ))}
          <button
            className="page-add"
            data-tip="メモを追加"
            disabled={busy}
            onClick={(e) => {
              if (!mobile) return pick(fileRef);
              return menu ? setMenu(null) : openMenu(e.currentTarget);
            }}
          >
            {busy ? "…" : "＋"}
          </button>
        </div>
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
