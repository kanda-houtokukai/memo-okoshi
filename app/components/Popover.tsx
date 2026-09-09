"use client";

// マーカーのポップオーバー。中身・文言・並びは正本（モックv6の openPop）どおり。
// 一般化した点:
//  - 赤の候補は「アルファベット＋元の敬称」を既定にする（2026-09-09）。記号は Review が持つ対応表で決まり、
//    同じ名前には同じ記号が返る。モックの「イニシャル（先頭1文字）」は元の名前が透けるためやめた。
//  - picker モード: こぼれの移動先を選ぶ一覧。モックにない導線だが、部品は作らず .pop を流用する
//  - 黄（読取に自信なし）に「辞書に追加」のチェック: 確定した語を組織語彙へ入れる学習導線。
//    赤（人名）には出さない（人名を辞書に入れさせない配慮）。

import { useState } from "react";
import type { Token } from "@/lib/record";

type Pos = { left: number; top: number };

type Props =
  | {
      mode?: "token";
      token: Token;
      pos: Pos;
      /** 赤のときの置き換え記号（例: A君）。Review が対応表から作って渡す */
      alias?: string;
      onResolve: (val: string | null, learn?: boolean) => void;
      onClose: () => void;
    }
  | { mode: "picker"; options: { id: string; label: string }[]; pos: Pos; onPick: (id: string) => void; onClose: () => void };

export default function Popover(props: Props) {
  const [val, setVal] = useState("");
  const [learn, setLearn] = useState(false);

  if (props.mode === "picker") {
    return (
      <div className="pop on" style={{ left: props.pos.left, top: props.pos.top }}>
        <button className="close" onClick={props.onClose}>
          ×
        </button>
        {props.options.map((o) => (
          <button key={o.id} onClick={() => props.onPick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  const { token, pos, alias, onResolve, onClose } = props;
  const submit = () => {
    const v = val.trim();
    if (!v) return;
    onResolve(v, token.t === "y" ? learn : undefined);
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
            <button key={i} onClick={() => onResolve(c, learn)}>
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
          <label className="pop-chk">
            <input type="checkbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
            辞書に追加
          </label>
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
          {alias && (
            <button className="pri" onClick={() => onResolve(alias)}>
              「{alias}」に置き換える
            </button>
          )}
          <button onClick={() => onResolve("担当")}>「担当」に置き換える</button>
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
