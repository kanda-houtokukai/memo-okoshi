"use client";

// 黒塗り画面（P6で作り直し。動作仕様の正本: docs/mock/kuronuri-mock-v1.html）
//
// 設計の核:
// - 描画は「元解像度のマスクcanvas」に対して行い、表示は view canvas に倍率で合成するだけ
//   → 何倍に拡大しても線・画像は鮮明（表示用の縮小画像に描かない）
// - 固定ビューポート内に収める（ページはスクロールしない）。ヘッダー／ステージ／下部ツールバー
// - 初期表示は画面に収まる最大。ピンチ・ホイール・＋−・全体・移動
// - マスクは lib/pages.ts の exportMasked() で画像に焼き込んでから送る（現行維持）
//
// [DECISION 2026-09-08] 「移動」ボタンは全端末で残す（タッチは2本指でも動くが、マウスでは
//   ホイール以外の移動手段が必要。Space+ドラッグ／中ボタンドラッグも併用可）。
// [DECISION 2026-09-08] 初回だけ「氏名や固有名詞を指でなぞって隠します」を数秒出し、以後は出さない
//   （引き算原則の「初回のみ」に当たる）。
// [DECISION 2026-09-09] 道具ごとにカーソルを変える。移動モードは手のひら（掴む前 grab／掴んでいる間 grabbing）、
//   ペンと消しゴムは**これから塗る／消える範囲と同じ大きさの輪**を出す（ペン＝塗りつぶし・消しゴム＝輪郭のみ）。
//   ブラウザのカーソル画像は大きさに上限があり拡大に追従できないので、**画面に重ねた div を動かす**方式にした
//   （canvasを描き直さないので描画の邪魔をしない・npm依存も増やさない）。輪を出している間だけ `cursor:none`。
//   タッチでは出さない（pointerType==="touch" は無視）。ステージの外へ出たら消す。

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageItem } from "@/lib/pages";
import { addStroke, canUndo, clearAll, drawSegment, hasPaint, renderStrokes, undo, type MaskState, type Point, type Stroke } from "@/lib/mask";
import { useZoomPan } from "./useZoomPan";
import StepHeader, { type Step } from "./StepHeader";
import Dialog, { type DialogSpec } from "./Dialog";
import VocabButton from "./VocabButton";

/** ペンの太さ（画像幅に対する比率）。実機で調整が必要な値 */
const PEN: Record<"s" | "m" | "l", number> = { s: 0.012, m: 0.025, l: 0.045 };
/** 消しゴムはペンの何倍か。実機で調整が必要な値 */
const ERASER_RATIO = 1.6;
const HINT_KEY = "memo-okoshi:hint-mask-seen";

type Props = {
  pages: PageItem[];
  index: number;
  onIndex: (i: number) => void;
  onMask: (id: string, mask: MaskState) => void;
  onConvert: () => void;
  onStep: (s: Step) => void;
  onHome: () => void;
  converting: boolean;
  error: string;
  toast: (m: string) => void;
};

export default function Redact({ pages, index, onIndex, onMask, onConvert, onStep, onHome, converting, error, toast }: Props) {
  const page = pages[index];
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null); // 元解像度のマスク
  const [size, setSize] = useState<"s" | "m" | "l">("m");
  const [eraser, setEraser] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [hint, setHint] = useState(false);
  const [dlg, setDlg] = useState<DialogSpec | null>(null);
  const drawing = useRef<{ pts: Point[]; width: number; erase: boolean } | null>(null);
  const raf = useRef<number | null>(null);
  /** 道具の輪（ペン＝塗る範囲・消しゴム＝消える範囲）。マウス/ペンのときだけ出す */
  const [ringOn, setRingOn] = useState(false);
  const ringRef = useRef<HTMLDivElement>(null);

  /* ページ全体をスクロールさせない */
  useEffect(() => {
    document.documentElement.classList.add("lock");
    return () => document.documentElement.classList.remove("lock");
  }, []);

  /* 初回だけの案内 */
  useEffect(() => {
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      setHint(true);
      const t = setTimeout(() => setHint(false), 5200);
      localStorage.setItem(HINT_KEY, "1");
      return () => clearTimeout(t);
    } catch {
      /* 保存不可でも動作は続ける */
    }
  }, []);

  /* 元解像度のマスクcanvasをストロークから作る（ページ切替・undo・全消しで作り直し） */
  const rebuildMask = useCallback(() => {
    if (!page) return;
    let m = maskRef.current;
    if (!m || m.width !== page.width || m.height !== page.height) {
      m = document.createElement("canvas");
      m.width = page.width;
      m.height = page.height;
      maskRef.current = m;
    }
    const ctx = m.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, m.width, m.height);
    renderStrokes(ctx, page.mask.strokes, 1);
  }, [page]);

  /* 表示: view canvas に 画像→マスク を倍率付きで合成 */
  const zp = useZoomPan({
    stageRef,
    width: page?.width ?? 1,
    height: page?.height ?? 1,
    drawEnabled: !converting,
    panMode,
    onDrawStart: (p) => {
      if (!page) return;
      const width = page.width * PEN[size] * (eraser ? ERASER_RATIO : 1);
      drawing.current = { pts: [p], width, erase: eraser };
      drawSegment(maskRef.current!.getContext("2d")!, p, p, width, eraser, 1);
      setHint(false);
      scheduleRender();
    },
    onDrawMove: (p) => {
      const d = drawing.current;
      if (!d) return;
      const last = d.pts[d.pts.length - 1];
      d.pts.push(p);
      drawSegment(maskRef.current!.getContext("2d")!, last, p, d.width, d.erase, 1);
      scheduleRender();
    },
    onDrawEnd: () => {
      const d = drawing.current;
      if (!d || !page) return;
      drawing.current = null;
      const s: Stroke = { points: d.pts, width: d.width, erase: d.erase };
      onMask(page.id, addStroke(page.mask, s));
    },
  });

  const render = useCallback(() => {
    const c = viewRef.current;
    const st = stageRef.current;
    if (!c || !st || !page || !maskRef.current) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = st.clientWidth;
    const H = st.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = W + "px";
      c.style.height = H + "px";
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingQuality = "high";
    ctx.translate(zp.t.tx, zp.t.ty);
    ctx.scale(zp.t.scale, zp.t.scale);
    ctx.drawImage(page.bitmap, 0, 0);
    ctx.drawImage(maskRef.current, 0, 0);
  }, [page, zp.t]);

  const scheduleRender = useCallback(() => {
    if (raf.current !== null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      render();
    });
  }, [render]);

  useEffect(() => {
    rebuildMask();
    render();
  }, [rebuildMask, render]);

  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(st);
    return () => ro.disconnect();
  }, [render]);

  if (!page) return null;

  const setPen = (k: "s" | "m" | "l") => {
    setSize(k);
    setEraser(false);
  };

  const tryConvert = () => {
    const unpainted = pages.map((p, i) => ({ p, i })).filter((o) => !hasPaint(o.p.mask));
    if (unpainted.length) {
      setDlg({
        title: "伏せていないページがあります",
        body: `${unpainted.map((o) => `${o.i + 1}枚目`).join("・")} は何も伏せていません。氏名などが写っている場合は、伏せてから変換してください。`,
        warn: "変換すると、この画像がAIに送られます。",
        go: "このまま変換する",
        cancel: "戻って伏せる",
        onGo: () => {
          setDlg(null);
          onConvert();
        },
        onCancel: () => setDlg(null),
      });
      return;
    }
    onConvert();
  };

  /** いま塗れる/消せる範囲の直径（画面上のpx）。拡大率と太さに追従する */
  const ringSize = Math.max(4, page.width * PEN[size] * (eraser ? ERASER_RATIO : 1) * zp.t.scale);
  /** 輪を出す条件: マウス等がステージ上にあり、移動モードでも変換中でもないこと */
  const brushRing = ringOn && !panMode && !converting;

  /** 位置は state ではなく直接 style に書く（1フレームごとの再描画を起こさないため） */
  const moveRing = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      if (ringOn) setRingOn(false);
      return;
    }
    const el = ringRef.current;
    if (el) {
      const r = stageRef.current!.getBoundingClientRect();
      el.style.left = e.clientX - r.left + "px";
      el.style.top = e.clientY - r.top + "px";
    }
    if (!ringOn) setRingOn(true);
  };

  const T = (props: { on?: boolean; tip: string; disabled?: boolean; onClick: () => void; children: React.ReactNode; wide?: boolean }) => (
    <button
      className={"tool" + (props.on ? " on" : "") + (props.wide ? " wide" : "")}
      data-tip={props.tip}
      aria-label={props.tip}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );

  return (
    <div className="rd-root">
      <StepHeader
        step={converting ? "convert" : "mask"}
        done={["intake"]}
        onStep={onStep}
        onHome={onHome}
        right={
          <>
            {pages.length > 1 && (
              <div className="pages-nav">
                {pages.map((_, i) => (
                  <button key={i} className={"pg" + (i === index ? " on" : "")} onClick={() => onIndex(i)} disabled={converting}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            <VocabButton toast={toast} />
          </>
        }
      />
      {converting && <div className="progress fill" />}

      {/* [DECISION 2026-09-09] 道具は画面左の縦帯にまとめる（編集ソフトの作法）。次へ進むボタンも同じ帯の
          一番下に置き、道具と行き先を一箇所に集める。狭い画面では帯が場所を取りすぎるので下へ回す
          （CSS の flex-direction を変えるだけ。DOMは1つ）。 */}
      <div className="rd-main">
        <div className="ltool">
          <div className="grp">
            <T on={!eraser && size === "s"} tip="細く塗る" onClick={() => setPen("s")}>
              <span className="dot" style={{ ["--d" as string]: "7px" }} />
              <span className="lb">細</span>
            </T>
            <T on={!eraser && size === "m"} tip="塗る" onClick={() => setPen("m")}>
              <span className="dot" style={{ ["--d" as string]: "11px" }} />
              <span className="lb">中</span>
            </T>
            <T on={!eraser && size === "l"} tip="太く塗る" onClick={() => setPen("l")}>
              <span className="dot" style={{ ["--d" as string]: "16px" }} />
              <span className="lb">太</span>
            </T>
            <T on={eraser} tip="消しゴム" onClick={() => setEraser((v) => !v)}>
              <span className="er" />
              <span className="lb">消す</span>
            </T>
          </div>
          <div className="hr" />
          <div className="grp">
            <T tip="元に戻す" disabled={!canUndo(page.mask)} onClick={() => onMask(page.id, undo(page.mask))}>
              <span className="glyph">↶</span>
              <span className="lb">戻す</span>
            </T>
            <T tip="全部消す" disabled={page.mask.strokes.length === 0} onClick={() => onMask(page.id, clearAll(page.mask))}>
              <span className="glyph">✕</span>
              <span className="lb">全消し</span>
            </T>
          </div>
          <div className="hr" />
          <div className="grp">
            <T tip="拡大" onClick={() => zp.zoomBy(1.5)}>
              <span className="glyph big">＋</span>
            </T>
            <T tip="縮小" onClick={() => zp.zoomBy(1 / 1.5)}>
              <span className="glyph big">−</span>
            </T>
            <T tip="全体表示" onClick={zp.fit}>
              <span className="lb mid">全体</span>
            </T>
            <T on={panMode} tip="移動モード" onClick={() => setPanMode((v) => !v)}>
              <span className="glyph">✥</span>
              <span className="lb">移動</span>
            </T>
          </div>
          <div className="spacer" />
          <button
            className={"fin" + (converting ? " busy" : "")}
            disabled={converting}
            onClick={tryConvert}
            data-tip={converting ? "変換中" : "変換する"}
            aria-label={converting ? "変換中" : "変換する"}
          >
            <span className="ar">›</span>
            <span className="lb">{converting ? "変換中" : "次へ"}</span>
          </button>
        </div>

        <div
          className={
            "stage" + (panMode ? " pan" : "") + (zp.panning ? " grabbing" : "") + (brushRing ? " brush" : "")
          }
          ref={stageRef}
          onPointerDown={zp.onPointerDown}
          onPointerMove={(e) => {
            zp.onPointerMove(e);
            moveRing(e);
          }}
          onPointerUp={zp.onPointerUp}
          onPointerCancel={(e) => {
            zp.onPointerUp(e);
            setRingOn(false);
          }}
          onPointerEnter={moveRing}
          onPointerLeave={() => setRingOn(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <canvas ref={viewRef} className="view" />
          <div
            ref={ringRef}
            className={"brush-ring" + (brushRing ? " on" : "") + (eraser ? " eraser" : " pen")}
            style={{ width: ringSize, height: ringSize }}
          />
          <div className={"zoom-badge" + (zp.zoomShown ? " on" : "")}>{Math.round(zp.t.scale * 100)}%</div>
          {panMode && <div className="mode-pill on">移動モード</div>}
          {hint && <div className="first-hint">氏名や固有名詞を指でなぞって隠します</div>}
          {error && <div className="errline stage-err">{error}</div>}
        </div>
      </div>

      <Dialog spec={dlg} />
    </div>
  );
}
