"use client";

// P1 検証ページ（素朴でよい・デザイン移植はP3）
// 画像を選ぶ → 項目を選ぶ → 送信 → 整形表示＋生JSON

import { useState } from "react";
import { ITEM_LIBRARY } from "@/lib/items";

type Token = { t: "p" | "y" | "b" | "r"; s: string; cands?: string[]; note?: string };
type ApiResult = {
  ok: boolean;
  error?: string;
  model?: string;
  tried?: string[];
  raw?: string;
  data?: {
    record_type: string;
    sections: { id: string; tokens: Token[] }[];
    spill: { text: string; suggest: string | null }[];
    insights: { text: string; why: string; refs: string[] }[];
  };
};

const TOKEN_STYLE: Record<Token["t"], React.CSSProperties> = {
  p: {},
  y: { background: "#fff3b0", borderBottom: "2px solid #e0a800" },
  b: { background: "#d7e8ff", borderBottom: "2px solid #4a90d9" },
  r: { background: "#ffd6d6", borderBottom: "2px solid #d64545", fontWeight: "bold" },
};

export default function Page() {
  const [files, setFiles] = useState<File[]>([]);
  const [checked, setChecked] = useState<string[]>(
    ITEM_LIBRARY.filter((d) => d.basic).map((d) => d.id)
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  const toggle = (id: string) =>
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("images", f));
      fd.append("items", JSON.stringify(checked));
      const res = await fetch("/api/convert", { method: "POST", body: fd });
      setResult((await res.json()) as ApiResult);
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const labelOf = (id: string) => ITEM_LIBRARY.find((d) => d.id === id)?.label ?? id;

  return (
    <main>
      <h1>メモおこし P1 疎通検証</h1>

      <section>
        <h2>1. 画像（複数可・1件の記録に統合）</h2>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <p>{files.map((f) => f.name).join(" / ") || "未選択"}</p>
      </section>

      <section>
        <h2>2. 項目構成</h2>
        {ITEM_LIBRARY.map((d) => (
          <label key={d.id} style={{ display: "inline-block", marginRight: "1em" }}>
            <input type="checkbox" checked={checked.includes(d.id)} onChange={() => toggle(d.id)} />
            {d.label}
          </label>
        ))}
      </section>

      <p>
        <button onClick={submit} disabled={busy || files.length === 0}>
          {busy ? "変換中…" : "変換する"}
        </button>
      </p>

      {result && !result.ok && (
        <section style={{ color: "#b00" }}>
          <h2>エラー</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{result.error}</pre>
          {result.raw && <pre style={{ whiteSpace: "pre-wrap", color: "#555" }}>{result.raw}</pre>}
        </section>
      )}

      {result?.ok && result.data && (
        <>
          <p>
            使用モデル: <code>{result.model}</code>（試行: {result.tried?.join(" → ")}）
          </p>
          <section>
            <h2>記録（黄=低確信 / 青=推定 / 赤=人名）</h2>
            {result.data.sections.map((s) => (
              <div key={s.id} style={{ margin: "0.6em 0" }}>
                <strong>【{labelOf(s.id)}】</strong>{" "}
                {s.tokens.length === 0 ? (
                  <span style={{ color: "#999" }}>（記載なし）</span>
                ) : (
                  s.tokens.map((t, i) => (
                    <span key={i} style={TOKEN_STYLE[t.t] ?? {}} title={t.note ?? t.cands?.join(" / ")}>
                      {t.s}
                    </span>
                  ))
                )}
              </div>
            ))}
          </section>

          <section>
            <h2>拾いきれなかった内容（こぼれ）</h2>
            {result.data.spill.length === 0 ? (
              <p style={{ color: "#999" }}>なし</p>
            ) : (
              <ul>
                {result.data.spill.map((sp, i) => (
                  <li key={i}>
                    {sp.text} {sp.suggest && <em>（→ {labelOf(sp.suggest)}?）</em>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>AIの気づき（記録とは別枠）</h2>
            {result.data.insights.length === 0 ? (
              <p style={{ color: "#999" }}>なし</p>
            ) : (
              <ul>
                {result.data.insights.map((ins, i) => (
                  <li key={i}>
                    {ins.text}
                    <br />
                    <small>なぜ: {ins.why} ／ 関連: {ins.refs.map(labelOf).join("・") || "—"}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details>
            <summary>生JSON</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </details>
        </>
      )}
    </main>
  );
}
