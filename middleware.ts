// 合言葉ゲート（任意）。
// [DECISION 2026-09-07] Vercel Hobby では本番ドメインを Deployment Protection で守れない
//   （Standard Protection はプレビューのみ・本番保護は Pro）。試験開発中は「URLを知る人だけ」に
//   したいので、環境変数 ACCESS_CODE を設定したときだけ働く薄いゲートをアプリ側に置く。
//   ACCESS_CODE 未設定なら何もしない（外したいときは環境変数を消すだけ）。
//   Cookie には合言葉そのものではなく SHA-256 を入れる。合言葉を変えれば全端末が自動で無効になる。

import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateDigest } from "@/lib/gate";

export async function middleware(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (path === "/gate" || path === "/api/gate") return NextResponse.next();

  const ok = req.cookies.get(GATE_COOKIE)?.value === (await gateDigest(code));
  if (ok) return NextResponse.next();

  if (path.startsWith("/api/")) return new NextResponse("unauthorized", { status: 401 });
  return NextResponse.redirect(new URL("/gate", req.url));
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt).*)"],
};
