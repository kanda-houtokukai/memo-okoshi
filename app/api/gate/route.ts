import { NextRequest, NextResponse } from "next/server";
import { GATE_COOKIE, gateDigest } from "@/lib/gate";

export const runtime = "nodejs";

/** 合言葉の照合。合っていれば Cookie を発行して入口へ、違えば /gate?e=1 へ戻す */
export async function POST(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  const form = await req.formData();
  const given = String(form.get("code") ?? "").trim();
  const back = (ok: boolean) => NextResponse.redirect(new URL(ok ? "/" : "/gate?e=1", req.url), 303);

  if (!code) return back(true);
  if (given !== code) return back(false);

  const res = back(true);
  res.cookies.set(GATE_COOKIE, await gateDigest(code), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30日
  });
  return res;
}
