// 利用状況の計測（Vercel Web Analytics）。**npm の依存を増やさず、script の読み込みで入れる**（P19）。
//
// [DECISION 2026-09-30・設計側] 社内でテスト配布しているが、使われているかを知る手段が無かった。何人が何回開いたかを、
//   個人を特定しない形で数える（変換の回数は Google AI Studio の使用量で見る）。Vercel は Hobby のまま。
// [DECISION 2026-09-30・設計側] **原則5との関係**: Web Analytics が送るのは、開いた画面の道・参照元・端末の種類などの集計だけで、
//   メモ・記録・辞書・画像・合言葉は送らない（送る中身は P19 の記録で実際の送信を抜き出して確かめた）。URL のクエリとハッシュは
//   送る前に落とす（下の beforeSend）。ブラウザが送信に付ける Referer もオリジンだけにする（app/layout.tsx の referrer: "strict-origin"）。
// [DECISION 2026-09-30] 読み込むのは **Vercel の production のビルドだけ**（next.config.mjs が VERCEL_ENV を見て ANALYTICS="1" を埋め込む）。
//   手元の開発・撮影用のビルド・プレビューでは読まない（`tests/analytics.test.mts`）。

/** 読み込む script（Vercel が配る。合言葉ゲートの外に出すのは /_vercel/insights/ だけ・middleware.ts の matcher） */
export const ANALYTICS_SRC = "/_vercel/insights/script.js";

/**
 * script より前に置く初期化。送る前に URL のクエリ（?…）とハッシュ（#…）を落とす。URL として読めなければ送らない。
 * （@vercel/analytics の inject() と同じ作法: window.va のキューに beforeSend を積む）
 */
export const ANALYTICS_INIT =
  'window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};' +
  'window.va("beforeSend",function(e){try{var u=new URL(e.url);u.search="";u.hash="";return Object.assign({},e,{url:u.toString()})}catch(_){return null}});';
