"use client";

// 元メモペイン（確認画面）。黒塗り済みの実画像を、黒塗り画面と同じ拡大・移動で見られる。
// ドラッグ=移動・ホイール=拡大・ピンチ／−・全体・＋（P6 項目4）。
// lines を持つページは開発用フィクスチャ（?fixture=1）専用の再現表示（拡大なし）。
// ? の説明は位置連動が未実装のため「伏せたあとの画像を表示」まで。連動実装時に
// 「伏せたあとの画像を表示。マーカーを押すと該当行が光ります」へ戻す（2026-09-09に工程名を改称）。

import { useCallback, useEffect, useRef, useState } from "react";
import { useZoomPan } from "./useZoomPan";

export type MemoSeg = { s: string; m?: boolean };
export type MemoPage = { src?: string; lines?: MemoSeg[][] };

type Props = {
  pages: MemoPage[];
  page: number;
  onPage: (i: number) => void;
};

function ImageStage({ src }: { src: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(src)
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b))
      .then((b) => {
        if (alive) setBmp(b);
        else b.close();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [src]);

  const zp = useZoomPan({ stageRef, width: bmp?.width ?? 1, height: bmp?.height ?? 1, drawEnabled: false, panMode: true });

  const render = useCallback(() => {
    const c = viewRef.current;
    const st = stageRef.current;
    if (!c || !st || !bmp) return;
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
    ctx.drawImage(bmp, 0, 0);
  }, [bmp, zp.t]);

  useEffect(render, [render]);
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(st);
    return () => ro.disconnect();
  }, [render]);

  return (
    <>
      <div
        className="memo-stage"
        ref={stageRef}
        onPointerDown={zp.onPointerDown}
        onPointerMove={zp.onPointerMove}
        onPointerUp={zp.onPointerUp}
        onPointerCancel={zp.onPointerUp}
      >
        <canvas ref={viewRef} className="view" />
        <div className={"zoom-badge" + (zp.zoomShown ? " on" : "")}>{Math.round(zp.t.scale * 100)}%</div>
      </div>
      <div className="memo-zoom">
        <button className="mini ic" data-tip="縮小" aria-label="縮小" onClick={() => zp.zoomBy(1 / 1.5)}>
          −
        </button>
        <button className="mini" data-tip="全体表示" onClick={zp.fit}>
          全体
        </button>
        <button className="mini ic" data-tip="拡大" aria-label="拡大" onClick={() => zp.zoomBy(1.5)}>
          ＋
        </button>
      </div>
    </>
  );
}

export default function MemoPane({ pages, page, onPage }: Props) {
  const cur = pages[page];
  return (
    <>
      <div className="pane-h">
        <h2>元メモ</h2>
        <span className="info" data-tip="伏せたあとの画像を表示" tabIndex={0}>
          ?
        </span>
      </div>
      <div className="memo-card">
        {pages.length > 1 && (
          <div className="memo-toolbar">
            {pages.map((_, i) => (
              <button key={i} className={"pg" + (i === page ? " on" : "")} onClick={() => onPage(i)}>
                {i + 1}
              </button>
            ))}
          </div>
        )}
        {cur?.src ? (
          <ImageStage key={cur.src} src={cur.src} />
        ) : (
          pages.map((p, i) => (
            <div key={i} className={"memo-page" + (i === page ? " on" : "")} id={"page" + i}>
              {(p.lines ?? []).map((segs, li) => (
                <div key={li} className={"m-line" + (segs.some((s) => s.m) ? " masked" : "")}>
                  {segs.map((sg, si) => (sg.m ? <b key={si}>{sg.s}</b> : <span key={si}>{sg.s}</span>))}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
