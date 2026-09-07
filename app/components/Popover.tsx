"use client";

// マーカーのポップオーバー。中身・文言・並びは正本（モックv6の openPop）どおり。
// 唯一の一般化: 赤の「イニシャル」候補はモックが 田中→"T" と決め打ちしていたため、
// 検知語の先頭1文字から作る（報告に明記して確認を仰ぐ箇所）。

import { useState } from "react";
import type { Token } from "@/lib/record";

type Props = {
  token: Token;
  pos: { left: number; top: number };
  onResolve: (val: string | null) => void;
  onClose: () => void;
};

export default function Popover({ token, pos, onResolve, onClose }: Props) {
  const [val, setVal] = useState("");
  const submit = () => {
    const v = val.trim();
    if (!v) return;
    onResolve(v);
  };

  return (
    <div className="pop on" style={{ left: pos.left, top: pos.top }}>
      <button className="close" onClick={onClose}>
        ×
      </button>

      {token.t === "y" && (
        <>
          <div className="pt y">読み取りに自信なし</div>
          {(token.cands ?? []).map((c, i) => (
            <button key={i} onClick={() => onResolve(c)}>
              {c}
            </button>
          ))}
          <input
            placeholder="自分で入力して直す"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <button className="pri" onClick={submit}>
            この内容で確定
          </button>
        </>
      )}

      {token.t === "b" && (
        <>
          <div className="pt b">AIの推定</div>
          {token.note && <div className="pd">{token.note}</div>}
          <button className="pri" onClick={() => onResolve(null)}>
            この内容で確定する
          </button>
          <input placeholder="書き換える" value={val} onChange={(e) => setVal(e.target.value)} />
          <button onClick={submit}>書き換えて確定</button>
          <button onClick={() => onResolve("")}>この推定は削除する</button>
        </>
      )}

      {token.t === "r" && (
        <>
          <div className="pt r">人名を検知 — 置き換えが必要</div>
          <button className="pri" onClick={() => onResolve("担当")}>
            「担当」に置き換える
          </button>
          <button onClick={() => onResolve(token.s.slice(0, 1))}>
            イニシャル「{token.s.slice(0, 1)}」に置き換える
          </button>
          <input
            placeholder="自分で入力して置き換える"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <button onClick={submit}>この内容で置き換え</button>
        </>
      )}
    </div>
  );
}
