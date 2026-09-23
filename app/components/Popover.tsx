"use client";

// マーカーのポップオーバー。中身・文言・並びは正本（モックv6の openPop）どおり。
// 一般化した点:
//  - [DECISION 2026-09-23・設計側] 赤は**伏せ忘れの知らせ**（原則3を改めた・P15）。選択肢は「確認した」（主・語はそのまま残す）と
//    「書き換える」の2つ。記号（A君）・「担当」への置き換えはやめた（記録には本名が要り、置き換えてもAIへの保護にならない）。
//    押したときの一文だけで、塗り忘れていればその語はAIに届いていることを伝える（常時表示の説明は足さない）。
//  - picker モード: こぼれの移動先を選ぶ一覧。モックにない導線だが、部品は作らず .pop を流用する
//  - 黄（読取に自信なし）に「辞書に追加」のチェック: 確定した語を組織語彙へ入れる学習導線。
//    赤（人名）には出さない（人名を辞書に入れさせない配慮）。
//  - 黄の主ボタン「このままで確定する」（2026-09-09）。**黄と青を同じ骨格にする**:
//    ①そのまま確定（主ボタン）→ ②選び直す／書き直す → ③消す（青のみ）。
//    黄には「読みは合っていた」を選ぶ道が無く、最も多い結末に出口が無かった。
//    候補は `candidatesFor` が現在の語を外して返す（主ボタンと同じ語を二重に出さない）。

import { useState } from "react";
import { candidatesFor, type Token } from "@/lib/record";

type Pos = { left: number; top: number };

type Props =
  | {
      mode?: "token";
      token: Token;
      pos: Pos;
      onResolve: (val: string | null, learn?: boolean) => void;
      onClose: () => void;
    }
  | {
      mode: "picker";
      /** off=いま表示していない項目（選ぶとオンになる）。頭に「＋」を付けて区別する */
      options: { id: string; label: string; off?: boolean }[];
      pos: Pos;
      onPick: (id: string) => void;
      onClose: () => void;
    };

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
          <button key={o.id} className={o.off ? "pk-off" : undefined} onClick={() => props.onPick(o.id)}>
            {o.off ? "＋ " : ""}
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  const { token, pos, onResolve, onClose } = props;
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
          <button className="pri" onClick={() => onResolve(null, learn)}>
            このままで確定する
          </button>
          {candidatesFor(token).map((c, i) => (
            <button key={i} onClick={() => onResolve(c, learn)}>
              {c}
            </button>
          ))}
          <input
            placeholder="自分で入力して直す"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <button onClick={submit}>直して確定</button>
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
          <div className="pt r">人名かもしれない語です。塗り忘れていれば、この語はAIに届いています。</div>
          <button className="pri" onClick={() => onResolve(null)}>
            確認した
          </button>
          <input placeholder="書き換える" value={val} onChange={(e) => setVal(e.target.value)} />
          <button onClick={submit}>書き換える</button>
        </>
      )}
    </div>
  );
}
