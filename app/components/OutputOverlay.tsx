"use client";

// 転記用テキストのオーバーレイ。文言・構造は正本（モックv6）どおり。
// ここに渡ってくる text は lib/record.ts の buildOutputText の戻り値のみ
// （= 記録以外・AIの気づき・こぼれ枠には触れない）。
// [DECISION 2026-09-07] 決定事項「コピー後『新しい変換を始める』で次の1件へ」を実装。
//   モックv6には無いボタン。貼り付け前の誤操作で失わないよう、コピー成功後にだけ出す。

type Props = {
  open: boolean;
  text: string;
  warning: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
  onRestart?: () => void;
};

export default function OutputOverlay({ open, text, warning, copied, onCopy, onClose, onRestart }: Props) {
  return (
    <div className={"ovl" + (open ? " on" : "")}>
      <div className="out-card">
        <h2>転記用テキスト</h2>
        <div className="od">閉じるとデータは残りません（サーバー保存なし）</div>
        <div className={"warnline" + (warning ? " on" : "")}>{warning}</div>
        <pre>{text}</pre>
        <div className="out-btns">
          <button className="copy" onClick={onCopy}>
            全文をコピー
          </button>
          <button className="back" onClick={onClose}>
            確認に戻る
          </button>
          <span className={"copied" + (copied ? " on" : "")}>コピーしました</span>
          {copied && onRestart && (
            <button className="back" onClick={onRestart}>
              新しい変換を始める
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
