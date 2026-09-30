import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ANALYTICS_INIT, ANALYTICS_SRC } from "@/lib/analytics";

export const metadata: Metadata = {
  title: "メモおこし",
  // [DECISION 2026-09-18] 面談だけを指す文だったので会議も含める（P10。app/manifest.ts と同じ文にする）
  description: "手書きの面談メモや会議メモを記録の下書きに変換します",
  // 試験開発中は検索に載せない（app/robots.ts と対）
  robots: { index: false, follow: false },
  // [DECISION 2026-09-09] アイコンは docs/assets/memo-okoshi-icon-src.png（設計側が生成した原本）を
  //   sips で縮めただけ。原本は加工しない。小サイズ用の作り分けが要るなら画像から作り直す。
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // ホーム画面に追加したときの名前と、iOS でのブラウザUIなし起動（display:standalone と対）
  appleWebApp: { capable: true, title: "メモおこし", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/* Next は標準名の mobile-web-app-capable しか出さない。古い iOS 向けに旧名も自分で置く
            （ホーム画面から開いたときブラウザUIなしで起動させるため。manifest の display と対） */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* [DECISION 2026-09-30] 手書き風の字（Klee One）はここで読まない（P17）。使う画面（読みもの・ホームの棚・
            開発データの元メモ）だけが lib/hand-font.ts の link を置く。他の画面の読み込みを重くしないため */}
        <link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&display=swap" rel="stylesheet" />
        {/* [DECISION 2026-09-30] 利用状況の計測は本番のビルドだけ（P19・lib/analytics.ts）。送る前にクエリとハッシュを落とす */}
        {process.env.ANALYTICS === "1" && (
          <>
            <script dangerouslySetInnerHTML={{ __html: ANALYTICS_INIT }} />
            <script defer src={ANALYTICS_SRC} />
          </>
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
