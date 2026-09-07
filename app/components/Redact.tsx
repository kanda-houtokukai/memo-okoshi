"use client";

// 黒塗り画面。画像の上に別レイヤーのキャンバスを重ね、指/マウスでなぞって塗る。
// マスクは lib/pages.ts の exportMasked() で画像に焼き込んでから送る（座標だけ送らない）。
//
// [DECISION 2026-09-07] 道具はペン3段階・消しゴム・元に戻す・全て消す。
//   「一度塗ったものを取り消せない状態にしない」ため、消しゴムと undo の両方を用意した。
//   全て消すも undo で戻せる（lib/mask.ts が履歴に積む）。

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageItem } from "@/lib/pages";
import { addStroke, canUndo, clearAll, drawSegment, renderStrokes, undo, type MaskState, type Point, type Stroke } from "@/lib/mask";
import StepHeader from "./StepHeader";

/** ペンの太さ（画像幅に対する比率）。実機で調整が必要な値 */
const PEN: Record<"s" | "m" | "l", number> = { s: 0.012, m: 0.025, l: 0.045 };
/** 消しゴムはペンの何倍か。実機で調整が必要な値 */
const ERASER_RATIO = 1.6;
/** キャンバスの最大表示高さ（画面高さに対する比率）。実機で調整が必要な値 */
const MAX_VH = 0.72;

type Props = {
  pages: PageItem[];
  index: number;
  onIndex: (i: number) => void;
  onMask: (id: string, mask: MaskState) => void;
  onBack: () => void;
  onConvert: () => void;
  converting: boolean;
  error: string;
};

export default function Redact({ pages, index, onIndex, onMask, onBack, onConvert, converting, error }: Props) {
  const page = pages[index];
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<"s" | "m" | "l">("m");
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [disp, setDisp] = useState({ w: 0, h: 0, scale: 1 });
  const drawing = useRef<{ pts: Point[]; width: number; erase: boolean } | null>(null);

  /* 表示サイズ: 幅に合わせ、高すぎる場合は高さにも収める */
  useEffect(() => {
    if (!wrapRef.current || !page) return;
    const el = wrapRef.current;
    const calc = () => {
      const maxW = el.clientWidth;
      const maxH = Math.max(240, window.innerHeight * MAX_VH);
      const s = Math.min(maxW / page.width, maxH / page.height);
      setDisp({ w: Math.round(page.width * s), h: Math.round(page.height * s), scale: s });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page]);

  /* 画像レイヤー */
  useEffect(() => {
    const c = imgRef.current;
    if (!c || !page || !disp.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(disp.w * dpr);
    c.height = Math.round(disp.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(page.bitmap, 0, 0, disp.w, disp.h);
  }, [page, disp]);

  /* マスクレイヤー（ストロークが変わるたびに描き直す） */
  const paintMask = useCallback(() => {
    const c = maskRef.current;
    if (!c || !page || !disp.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(disp.w * dpr);
    c.height = Math.round(disp.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderStrokes(ctx, page.mask.strokes, disp.scale);
  }, [page, disp]);
  useEffect(paintMask, [paintMask]);

  const toImg = (e: React.PointerEvent): Point => {
    const r = maskRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / disp.scale, y: (e.clientY - r.top) / disp.scale };
  };

  const strokeWidth = () => page.width * PEN[size] * (tool === "eraser" ? ERASER_RATIO : 1);

  const onDown = (e: React.PointerEvent) => {
    if (converting || !page) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 一部環境（合成イベント等）では取得できないが、描画自体は続けられる */
    }
    const p = toImg(e);
    const width = strokeWidth();
    drawing.current = { pts: [p], width, erase: tool === "eraser" };
    const ctx = maskRef.current!.getContext("2d")!;
    drawSegment(ctx, p, p, width, tool === "eraser", disp.scale);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drawing.current;
    if (!d) return;
    const p = toImg(e);
    const last = d.pts[d.pts.length - 1];
    d.pts.push(p);
    drawSegment(maskRef.current!.getContext("2d")!, last, p, d.width, d.erase, disp.scale);
  };

  const onUp = () => {
    const d = drawing.current;
    if (!d || !page) return;
    drawing.current = null;
    const s: Stroke = { points: d.pts, width: d.width, erase: d.erase };
    onMask(page.id, addStroke(page.mask, s));
  };

  if (!page) return null;

  return (
    <>
      <StepHeader
        step={converting ? "convert" : "mask"}
        right={
          <button className={"done-btn" + (converting ? "" : " ready")} disabled={converting} onClick={onConvert}>
            {converting ? "変換中…" : "変換する"}
          </button>
        }
      />
      {converting && <div className="progress" />}

      <div className="wrap single">
        <div className="memo-card redact-card">
          <div className="memo-toolbar">
            <button className="tool-btn" onClick={onBack} disabled={converting}>
              ‹ 取り込み
            </button>
            {pages.length > 1 &&
              pages.map((_, i) => (
                <button key={i} className={"pg" + (i === index ? " on" : "")} onClick={() => onIndex(i)}>
                  {i + 1}
                </button>
              ))}
          </div>

          <div className="canvas-wrap" ref={wrapRef} style={{ height: disp.h || undefined }}>
            <canvas ref={imgRef} style={{ width: disp.w, height: disp.h }} />
            <canvas
              ref={maskRef}
              className="mask"
              style={{ width: disp.w, height: disp.h }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onLostPointerCapture={onUp}
            />
          </div>

          <div className="tools">
            {(["s", "m", "l"] as const).map((k) => (
              <button
                key={k}
                className={"mini ic" + (tool === "pen" && size === k ? " on" : "")}
                data-tip={k === "s" ? "細く塗る" : k === "m" ? "塗る" : "太く塗る"}
                onClick={() => {
                  setTool("pen");
                  setSize(k);
                }}
              >
                <span className={"dot " + k} />
              </button>
            ))}
            <span className="sep" />
            <button
              className={"mini ic" + (tool === "eraser" ? " on" : "")}
              data-tip="消しゴム"
              onClick={() => setTool("eraser")}
            >
              ○
            </button>
            <span className="sep" />
            <button
              className="mini ic"
              data-tip="元に戻す"
              disabled={!canUndo(page.mask)}
              onClick={() => onMask(page.id, undo(page.mask))}
            >
              ↶
            </button>
            <button
              className="mini ic"
              data-tip="全て消す"
              disabled={page.mask.strokes.length === 0}
              onClick={() => onMask(page.id, clearAll(page.mask))}
            >
              ✕
            </button>
          </div>
        </div>

        {error && <div className="errline">{error}</div>}
      </div>
    </>
  );
}
