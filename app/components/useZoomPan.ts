"use client";

// 拡大・移動のジェスチャー（黒塗り画面・確認画面の元メモで共用）。
// - タッチ: 2本指でピンチ拡大＋移動、1本指は draw（黒塗り）または移動モードなら pan
// - マウス: ホイール=拡大縮小（カーソル中心）、移動モード／中ボタン／Space+ドラッグ=移動
// - トラックパッド: ピンチ（ctrl+wheel）=拡大縮小、2本指スクロール（横成分あり）=移動
//   [DECISION 2026-09-08] マウスのホイールは「拡大」に割り当て（モック kuronuri-mock-v1 どおり）。
//   トラックパッドの2本指スクロールは deltaX の有無で見分けて「移動」にする（Windows実機で要確認）。

import { useCallback, useEffect, useRef, useState } from "react";
import { fitTransform, panBy, toImage, zoomAt, type Transform } from "@/lib/stage";

type Pt = { x: number; y: number };

export type ZoomPanOptions = {
  stageRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  /** 1本指/左ボタンのドラッグを描画として扱うか（確認画面では false → 移動） */
  drawEnabled: boolean;
  panMode: boolean;
  onDrawStart?: (p: Pt) => void;
  onDrawMove?: (p: Pt) => void;
  onDrawEnd?: () => void;
};

export function useZoomPan(o: ZoomPanOptions) {
  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const tRef = useRef(t);
  tRef.current = t;
  const [zoomShown, setZoomShown] = useState(false);
  /** 掴んで動かしている最中か（カーソルを grabbing にするため） */
  const [panning, setPanning] = useState(false);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pts = useRef(new Map<number, Pt>());
  const gesture = useRef<
    | { kind: "pinch"; d: number; t0: Transform; cx: number; cy: number }
    | { kind: "pan"; x: number; y: number; t0: Transform }
    | { kind: "draw" }
    | null
  >(null);
  const space = useRef(false);

  const flashZoom = useCallback(() => {
    setZoomShown(true);
    if (zoomTimer.current) clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => setZoomShown(false), 900);
  }, []);

  const stageSize = useCallback(() => {
    const el = o.stageRef.current;
    return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 1, h: 1 };
  }, [o.stageRef]);

  const fit = useCallback(() => {
    const { w, h } = stageSize();
    const nt = fitTransform(w, h, o.width, o.height);
    tRef.current = nt;
    setT(nt);
    flashZoom();
  }, [o.width, o.height, stageSize, flashZoom]);

  const zoomBy = useCallback(
    (f: number, cx?: number, cy?: number) => {
      const { w, h } = stageSize();
      const nt = zoomAt(tRef.current, f, cx ?? w / 2, cy ?? h / 2);
      tRef.current = nt;
      setT(nt);
      flashZoom();
    },
    [stageSize, flashZoom]
  );

  /* 画像が変わったら・画面サイズが変わったら全体表示 */
  useEffect(() => {
    fit();
    const el = o.stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, o.stageRef]);

  /* Space+ドラッグ（PC） */
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement)?.matches?.("input,textarea")) space.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const local = (e: React.PointerEvent | PointerEvent) => {
    const r = o.stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button === 2) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 合成イベント等 */
    }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      // ピンチ開始（描画中なら中断）
      if (gesture.current?.kind === "draw") o.onDrawEnd?.();
      const [a, b] = [...pts.current.values()];
      const r = o.stageRef.current!.getBoundingClientRect();
      gesture.current = {
        kind: "pinch",
        d: Math.hypot(a.x - b.x, a.y - b.y),
        t0: tRef.current,
        cx: (a.x + b.x) / 2 - r.left,
        cy: (a.y + b.y) / 2 - r.top,
      };
      return;
    }
    const wantPan =
      o.panMode || !o.drawEnabled || (e.pointerType === "mouse" && (e.button === 1 || space.current));
    if (wantPan) {
      gesture.current = { kind: "pan", x: e.clientX, y: e.clientY, t0: tRef.current };
      setPanning(true);
      return;
    }
    gesture.current = { kind: "draw" };
    const p = local(e);
    o.onDrawStart?.(toImage(tRef.current, p.x, p.y));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = o.stageRef.current!.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      let nt = zoomAt(g.t0, d / g.d, g.cx, g.cy);
      nt = panBy(nt, mx - g.cx, my - g.cy);
      tRef.current = nt;
      setT(nt);
      flashZoom();
      return;
    }
    if (g.kind === "pan") {
      const nt = panBy(g.t0, e.clientX - g.x, e.clientY - g.y);
      tRef.current = nt;
      setT(nt);
      return;
    }
    if (g.kind === "draw") {
      const p = local(e);
      o.onDrawMove?.(toImage(tRef.current, p.x, p.y));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "draw") o.onDrawEnd?.();
    if (g?.kind === "pan") setPanning(false);
    if (pts.current.size === 0) gesture.current = null;
    else if (g?.kind === "pinch" && pts.current.size < 2) gesture.current = null;
  };

  /* ホイール（passive:false で登録して既定のスクロールを止める） */
  useEffect(() => {
    const el = o.stageRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      if (!e.ctrlKey && Math.abs(e.deltaX) > 0) {
        // トラックパッドの2本指スクロール → 移動
        const nt = panBy(tRef.current, -e.deltaX, -e.deltaY);
        tRef.current = nt;
        setT(nt);
        return;
      }
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nt = zoomAt(tRef.current, e.ctrlKey ? Math.pow(f, 1.6) : f, cx, cy);
      tRef.current = nt;
      setT(nt);
      flashZoom();
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [o.stageRef, flashZoom]);

  return { t, fit, zoomBy, zoomShown, panning, onPointerDown, onPointerMove, onPointerUp };
}
