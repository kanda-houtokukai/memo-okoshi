// 合言葉ゲート（任意）。
// [DECISION 2026-09-07] Vercel Hobby では本番ドメインを Deployment Protection で守れない
//   （Standard Protection はプレビューのみ・本番保護は Pro）。試験開発中は「URLを知る人だけ」に
//   したいので、環境変数 ACCESS_CODE を設定したときだけ働く薄いゲートをアプリ側に置く。
//   ACCESS_CODE 未設定なら何もしない（外したいときは環境変数を消すだけ）。
//   Cookie には合言葉そのものではなく SHA-256 を入れる。合言葉を変えれば全端末が自動で無効になる。

import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateDigest } from "@/lib/gate";

/**
 * 使い方ページに載せる画面写真（`public/help/`）。
 * [DECISION 2026-09-11] ⚠️ **`/help/` の前方一致にはしない**。前方一致にすると、あとから
 *   `public/help/` に置いたものが黙って公開される。**1枚ずつ完全一致で並べる**。
 *   ここと `lib/about-copy.ts` の食い違いは `tests/about.test.mts` が捕まえる。
 */
const HELP_SHOTS = [
  "01-home.png",
  "02-sheet-maker.png",
  "03-intake-empty.png",
  "04-intake-loaded.png",
  "05-mask.png",
  "06-mask-confirm.png",
  "07-converting.png",
  "08-review.png",
  "09-review-popover.png",
  "10-spill-picker.png",
  "11-output.png",
  "12-vocab.png",
];

/** 合言葉なしで見せる道（完全一致のみ） */
const PUBLIC = new Set([
  "/gate",
  "/api/gate",
  "/about",
  "/manifest.webmanifest",
  "/icon-16.png",
  "/icon-32.png",
  "/icon-48.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  ...HELP_SHOTS.map((f) => `/help/${f}`),
]);

export async function middleware(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();

  const path = req.nextUrl.pathname;
  // [DECISION 2026-09-09] ゲートの外に出すのは **この完全一致のリストだけ**（前方一致にしない）。
  //   /about は使い方ページ（仕様と運用ルールのみ。委員会・他施設への紹介に合言葉を渡さず使えるように）。
  //   アイコンとマニフェストは合言葉画面でも要るので通す。中身は静的で、いずれも秘密を含まない。
  //   使い方ページの画面写真も同じ（写っているのは生成したダミーのメモで、実在の利用者情報を含まない）。
  if (PUBLIC.has(path)) return NextResponse.next();

  const ok = req.cookies.get(GATE_COOKIE)?.value === (await gateDigest(code));
  if (ok) return NextResponse.next();

  if (path.startsWith("/api/")) return new NextResponse("unauthorized", { status: 401 });
  return NextResponse.redirect(new URL("/gate", req.url));
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt).*)"],
};
