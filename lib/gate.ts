// 合言葉ゲートの共通部（middleware と /api/gate の両方から使う）
export const GATE_COOKIE = "mo_gate";

/** Cookie に入れるのは合言葉そのものではなく SHA-256。合言葉を変えれば全端末が自動で無効になる */
export async function gateDigest(code: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("memo-okoshi:" + code));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
