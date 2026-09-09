"use client";

// 使い方ページの「閉じる」。
// [DECISION 2026-09-09] 作業画面からは**別タブ**で開く（作業中の画像・記録を失わせないため）。
//   別タブなら閉じる、直接開かれていたら作業画面へ移る。どちらの入り方でも詰まらない。

export default function CloseButton() {
  const close = () => {
    // 別タブで開かれた場合だけ window.close() が効く。効かなければ作業画面へ。
    window.close();
    setTimeout(() => {
      if (!window.closed) window.location.href = "/";
    }, 120);
  };
  return (
    <button className="back" onClick={close}>
      閉じる
    </button>
  );
}
