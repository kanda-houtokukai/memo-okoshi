/** @type {import('next').NextConfig} */
const nextConfig = {
  // [DECISION 2026-09-30] 撮影用のビルドの切り替え（P18）。`MEMO_OKOSHI_FIXTURE=1 next build`（= npm run build:shoot）のときだけ "1"。
  //   ビルド時に文字として埋め込まれ、"0" のビルド（本番・Vercel）では ?fixture=1 の入口と開発データが出力に入らない（app/page.tsx）。
  env: { DEV_FIXTURE: process.env.MEMO_OKOSHI_FIXTURE === "1" ? "1" : "0" },
};

export default nextConfig;
