"use client";

// 取り込み画面。＋から3経路（カメラ／写真ライブラリ／ファイル）で追加、並べ替え・削除。
// 説明文は置かない。ボタンはアイコン＋ツールチップ（引き算原則）。
// [DECISION 2026-09-07] 並べ替えはドラッグでなく ↑↓（確認画面の項目カードと同じ作法に揃える）

import { useEffect, useRef, useState } from "react";
import type { PageItem } from "@/lib/pages";
import StepHeader from "./StepHeader";
import VocabDrawer from "./VocabDrawer";
import { loadVocab } from "@/lib/vocab";

type Props = {
  pages: PageItem[];
  busy: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onNext: () => void;
  toast: (m: string) => void;
};

export default function Intake({ pages, busy, onAdd, onRemove, onMove, onNext, toast }: Props) {
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const [vocabOpen, setVocabOpen] = useState(false);
  const [vocabN, setVocabN] = useState(0);
  useEffect(() => setVocabN(loadVocab().length), [vocabOpen]);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    e.target.value = ""; // 同じファイルを続けて選べるように
    if (fs.length) onAdd(fs);
  };

  return (
    <>
      <StepHeader
        step="intake"
        right={
          <>
            <button className="tool-btn" onClick={() => setVocabOpen(true)}>
              辞書{vocabN > 0 && <span className="ins-count">{vocabN}</span>}
            </button>
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

      <VocabDrawer open={vocabOpen} onClose={() => setVocabOpen(false)} toast={toast} />

      <div className="wrap single">
        <div className="pages">
          {pages.map((p, i) => (
            <div className="page-card" key={p.id}>
              <span className="page-no">{i + 1}</span>
              <img src={p.thumb} alt="" />
              <div className="page-acts">
                <button className="mini ic" data-tip="前へ" onClick={() => onMove(p.id, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button
                  className="mini ic"
                  data-tip="後ろへ"
                  onClick={() => onMove(p.id, 1)}
                  disabled={i === pages.length - 1}
                >
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
            onClick={(e) => (menu ? setMenu(null) : openMenu(e.currentTarget))}
          >
            {busy ? "…" : "＋"}
          </button>
        </div>
      </div>

      {menu && (
        <div className="pop on" style={{ left: menu.left, top: menu.top }}>
          <button className="close" onClick={() => setMenu(null)}>
            ×
          </button>
          <button onClick={() => pick(camRef)}>カメラで撮影</button>
          <button onClick={() => pick(libRef)}>写真から選ぶ</button>
          <button onClick={() => pick(fileRef)}>ファイルを選ぶ（画像・PDF）</button>
        </div>
      )}

      {/* 3経路の実体。capture 付きはスマホでカメラを直接開く */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
      <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf,.heic,.heif"
        multiple
        hidden
        onChange={onFiles}
      />
    </>
  );
}
