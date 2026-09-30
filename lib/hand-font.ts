// 手書き風の字（Klee One）の読み込み先。**読みもののページ・ホームの棚の表紙・開発データの元メモの再現表示だけ**が読む（P17）。
//
// [DECISION 2026-09-30] 共通の `app/layout.tsx` から Klee One を外し、使う画面だけが `<link rel="stylesheet" precedence>` で読む。
//   React 19 はこの link を <head> へ移し、同じ href は1回だけ読む。字の本体はその字を描いたときにだけ届く。
//   作業画面（取り込み・伏せる・確認・出力・用紙）と使い方ページは、この字の定義も読まない。
//   next/font にしないのは、ビルドのたびに Google から字を取り寄せる手間と、既存の読み込み方（Google Fonts の CSS）との二重を避けるため。
export const HAND_FONT_HREF = "https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&display=swap";
