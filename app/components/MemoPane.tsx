"use client";

// 元メモペイン。モックは手書きを .m-line で擬似再現しているが、
// 本実装は黒塗り済みの実画像を表示する（カード・ページ切替の構造は正本どおり）。
// lines を持つページは開発用フィクスチャ（?fixture=1）専用の再現表示。

export type MemoSeg = { s: string; m?: boolean };
export type MemoPage = { src?: string; lines?: MemoSeg[][] };

type Props = {
  pages: MemoPage[];
  page: number;
  onPage: (i: number) => void;
};

export default function MemoPane({ pages, page, onPage }: Props) {
  return (
    <>
      <div className="pane-h">
        <h2>元メモ</h2>
        <span className="info" data-tip="黒塗り済みの画像を表示。マーカーを押すと該当行が光ります" tabIndex={0}>
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
        {pages.map((p, i) => (
          <div
            key={i}
            className={"memo-page" + (i === page ? " on" : "") + (p.src ? " img-page" : "")}
            id={"page" + i}
          >
            {p.src ? (
              <img className="memo-img" src={p.src} alt="" />
            ) : (
              (p.lines ?? []).map((segs, li) => (
                <div key={li} className={"m-line" + (segs.some((s) => s.m) ? " masked" : "")}>
                  {segs.map((sg, si) => (sg.m ? <b key={si}>{sg.s}</b> : <span key={si}>{sg.s}</span>))}
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </>
  );
}
