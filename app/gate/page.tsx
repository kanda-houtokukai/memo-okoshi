"use client";

// 合言葉の入口（P6 項目11で作り直し。動作仕様の正本: docs/mock/gate-mock-v1.html）
// 見た目だけの差し替え。認証はこれまでどおり /api/gate（サーバー判定・HttpOnly Cookie）に任せ、
// ここは POST して行き先（/ か /gate?e=1）を見るだけ。誤入力はエラー文を積まず帯を揺らして選択状態に戻す。

import { useRef, useState } from "react";

export default function GatePage() {
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const doShake = () => {
    setShake(false);
    requestAnimationFrame(() => setShake(true));
    inputRef.current?.select();
  };

  const submit = async () => {
    const v = inputRef.current?.value.trim() ?? "";
    if (!v) {
      doShake();
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("code", v);
      const res = await fetch("/api/gate", { method: "POST", body: fd, redirect: "follow" });
      if (res.url.includes("/gate")) doShake();
      else window.location.href = "/";
    } catch {
      doShake();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate2">
      <div className="card">
        <div className="tabs">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <h1>メモおこし</h1>
        <div className="sub">MEMO OKOSHI</div>
        <div className={"field" + (shake ? " shake" : "")} onAnimationEnd={() => setShake(false)}>
          <input
            ref={inputRef}
            type="password"
            placeholder="合言葉"
            autoComplete="current-password"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <button onClick={submit} disabled={busy}>
            {busy ? "…" : "入る"}
          </button>
        </div>
      </div>
    </div>
  );
}
