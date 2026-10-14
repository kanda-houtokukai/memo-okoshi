import { NextRequest, NextResponse } from "next/server";
import { isRecordType, itemsByIds, libraryFor, type RecordType } from "@/lib/items";
import { buildPrompt } from "@/lib/prompt";
import { FAIL_TEXT, generateWithFallback, ImagePart } from "@/lib/gemini";
import { sanitizeForPrompt } from "@/lib/vocab";
import { finishConversion } from "@/lib/convert-core";

export const runtime = "nodejs";
export const maxDuration = 120;

// 受け取り: multipart/form-data
//   images: File（複数可・1件の記録として統合）
//   items:  JSON文字列（選択された項目idの配列・表示順）
//   record_type: "interview"（面談・既定）| "meeting"（会議）。項目ライブラリ・プロンプト・人名の扱いが変わる（P9）
//   vocab:  JSON文字列（端末内の組織語彙。プロンプトに差し込むだけで保存しない）
// 返却: { ok, model, tried, data } または { ok:false, reason, error }
//   reason: "quota"（本日の上限）/ "busy"（混雑）/ "error"。error はそのまま画面に出す文言。
// [DECISION 2026-10-14] 返答の読み取り（JSON の救済）と人名の機械検出は lib/convert-core.ts へ移した（P20・評価キットと同じ経路にするため）。

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ ok: false, error: "画像がありません" }, { status: 400 });
    }

    // 記録の種類。知らない値は面談として扱う（これまでの呼び出しと同じ）
    const rt = form.get("record_type");
    const type: RecordType = isRecordType(rt) ? rt : "interview";

    let ids: string[] = [];
    try {
      ids = JSON.parse(String(form.get("items") ?? "[]"));
    } catch {
      /* 下の空チェックで弾く */
    }
    const items = itemsByIds(ids, libraryFor(type));
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

    const result = await generateWithFallback(buildPrompt(items, vocab, type), images);
    if (!result.ok) {
      // [DECISION 2026-09-10] 枠切れ（429）と混雑（503）で案内を変える。
      //   他のモデルへは流さないので、ここが「使えない」と正直に伝える唯一の場所になる。
      //   detail（生のエラー）は画面に出さない（利用者に読めない情報を見せない）。
      const status = result.reason === "quota" ? 429 : result.reason === "busy" ? 503 : 502;
      console.error("[convert] 変換できず:", result.reason, result.error, result.tried);
      return NextResponse.json(
        { ok: false, reason: result.reason, error: FAIL_TEXT[result.reason], tried: result.tried },
        { status }
      );
    }

    // 返答の読み取りと人名の機械検出（原則3の保険・面談・会議とも）は lib/convert-core.ts（評価キットと同じもの・P20）
    const data = finishConversion(result.text, type);
    if (!data) {
      return NextResponse.json(
        { ok: false, reason: "error", error: FAIL_TEXT.error, model: result.model, raw: result.text },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, model: result.model, tried: result.tried, data });
  } catch (e) {
    console.error("[convert] 想定外の失敗:", e);
    return NextResponse.json({ ok: false, reason: "error", error: FAIL_TEXT.error }, { status: 500 });
  }
}
