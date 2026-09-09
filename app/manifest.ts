import type { MetadataRoute } from "next";

// Web App Manifest（/manifest.webmanifest として配信される）。
//
// [DECISION 2026-09-09・設計側承認] **display: standalone**（ホーム画面から起動するとブラウザUIなし）。
//   理由: 伏せる画面が固定ビューポートなので、URLバーが無い分だけ塗れる面積が増える。
//   ブラウザの戻るが無くなるが、アプリ内の戻り道が全画面で揃っている
//   （伏せる→ステップ「取り込み」／確認→「取り込み」「伏せる」／全画面でブランド押下＝最初から／
//    出力は閉じる／使い方は別タブなので作業は残る）。
// [DECISION 2026-09-09] **Service Worker は入れない**（オフライン対応は今回やらない）。
//   キャッシュを持たないので、デプロイした内容がそのまま次の起動に反映される。
// [DECISION 2026-09-09] purpose は "any" のみ。元画像はタイルが画面いっぱいに近く、
//   maskable の安全領域（中央80%）に収まらないため maskable は宣言しない（勝手に切り抜かない）。

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "メモおこし",
    short_name: "メモおこし",
    description: "手書きの面談メモを記録の下書きに変換します",
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f1eb", // 起動時の下地（アプリの地の色）
    theme_color: "#ffffff", // ヘッダーが白なので、上端の色を合わせる
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
