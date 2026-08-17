import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "メモおこし P1 検証",
  description: "画像→構造化JSON 疎通検証（開発用）",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: "sans-serif", margin: "2rem", maxWidth: 900 }}>{children}</body>
    </html>
  );
}
