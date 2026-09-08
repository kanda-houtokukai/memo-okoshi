import { NextRequest, NextResponse } from "next/server";
import { itemsByIds } from "@/lib/items";
import { buildPrompt } from "@/lib/prompt";
import { generateWithFallback, ImagePart } from "@/lib/gemini";
import { sanitizeForPrompt } from "@/lib/vocab";
import { enforceNames } from "@/lib/names";

export const runtime = "nodejs";
export const maxDuration = 120;

// 受け取り: multipart/form-data
//   images: File（複数可・1件の記録として統合）
//   items:  JSON文字列（選択された項目idの配列・表示順）
//   vocab:  JSON文字列（端末内の組織語彙。プロンプトに差し込むだけで保存しない）
// 返却: { ok, model, tried, data } または { ok:false, error, raw? }

type Token = { t: "p" | "y" | "b" | "r"; s: string; cands?: string[]; note?: string };
type Converted = {
  record_type: string;
  sections: { id: string; tokens: Token[] }[];
  spill: { text: string; suggest: string | null }[];
  insights: { text: string; why: string; refs: string[] }[];
};

function parseModelJson(text: string): Converted | null {
  const tryParse = (s: string): Converted | null => {
    try {
      const v = JSON.parse(s);
      if (v && Array.isArray(v.sections)) {
        v.record_type = typeof v.record_type === "string" ? v.record_type : "interview";
        v.spill = Array.isArray(v.spill) ? v.spill : [];
        v.insights = Array.isArray(v.insights) ? v.insights : [];
        return v as Converted;
      }
      return null;
    } catch {
      return null;
    }
  };
  // response_mime_type: application/json を指定しているが、保険として
  // コードフェンス剥がし→最初の { から最後の } までの切り出し、の順で救済する
  const direct = tryParse(text);
  if (direct) return direct;
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const fenced = tryParse(unfenced);
  if (fenced) return fenced;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(text.slice(start, end + 1));
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ ok: false, error: "画像がありません" }, { status: 400 });
    }

    let ids: string[] = [];
    try {
      ids = JSON.parse(String(form.get("items") ?? "[]"));
    } catch {
      /* 下の空チェックで弾く */
    }
    const items = itemsByIds(ids);
    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: "項目が選択されていません" }, { status: 400 });
    }

    const images: ImagePart[] = [];
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      images.push({ mimeType: f.type || "image/png", base64: buf.toString("base64") });
    }

    let vocab: ReturnType<typeof sanitizeForPrompt> = [];
    try {
      vocab = sanitizeForPrompt(JSON.parse(String(form.get("vocab") ?? "[]")));
    } catch {
      vocab = [];
    }

    const result = await generateWithFallback(buildPrompt(items, vocab), images);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, tried: result.tried }, { status: 502 });
    }

    const parsed = parseModelJson(result.text);
    // 原則3の保険: AIが人名を p/y/b に紛れ込ませても、敬称付き氏名は機械的に r へ切り出す
    const data = parsed ? enforceNames(parsed) : null;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "モデル出力をJSONとして解釈できませんでした", model: result.model, raw: result.text },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, model: result.model, tried: result.tried, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
