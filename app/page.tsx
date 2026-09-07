"use client";

// 入口。画像を投入して変換し、確認・出力画面（Review）へ渡す。
//
// ここの入力UIはモックの範囲外＝P1検証ページ相当の暫定。取り込み・黒塗りはP2で作る。
// ?fixture=1 で開くと、モックv6の内容を再現したフィクスチャを読み込む（API課金なしで
// 移植の見た目を正本と突き合わせるための開発用の入口）。

import { useEffect, useState } from "react";
import { ITEM_LIBRARY } from "@/lib/items";
import { fromApi, type ApiData, type RecordState } from "@/lib/record";
import Review from "./components/Review";
import type { MemoPage } from "./components/MemoPane";

const SETTINGS_KEY = "memo-okoshi:items";

type Settings = { enabled: Record<string, boolean>; order: string[] };

function defaultSettings(): Settings {
  const enabled: Record<string, boolean> = {};
  ITEM_LIBRARY.forEach((l) => (enabled[l.id] = l.defaultOn));
  return { enabled, order: ITEM_LIBRARY.map((l) => l.id) };
}

function loadSettings(): Settings {
  const def = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const saved = JSON.parse(raw) as { enabled?: string[]; order?: string[] };
    const enabled: Record<string, boolean> = {};
    ITEM_LIBRARY.forEach((l) => (enabled[l.id] = (saved.enabled ?? []).includes(l.id)));
    // 保存後に項目が増えても落ちないよう、未知/欠落は定義順で補う
    const order = [
      ...(saved.order ?? []).filter((id) => ITEM_LIBRARY.some((l) => l.id === id)),
      ...ITEM_LIBRARY.map((l) => l.id).filter((id) => !(saved.order ?? []).includes(id)),
    ];
    return { enabled, order };
  } catch {
    return def;
  }
}

export default function Page() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rec, setRec] = useState<RecordState | null>(null);
  const [pages, setPages] = useState<MemoPage[]>([]);

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    if (new URLSearchParams(window.location.search).get("fixture") !== "1") return;
    fetch("/dev-fixture.json")
      .then((r) => r.json())
      .then((f: ApiData & { pages?: MemoPage[] }) => {
        setRec(fromApi(f, ITEM_LIBRARY, s.enabled, s.order));
        setPages(f.pages ?? []);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const convert = async () => {
    if (!settings) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("images", f));
      fd.append("items", JSON.stringify(settings.order.filter((id) => settings.enabled[id])));
      const res = await fetch("/api/convert", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error + (json.raw ? "\n\n" + json.raw : ""));
        return;
      }
      setRec(fromApi(json.data as ApiData, ITEM_LIBRARY, settings.enabled, settings.order));
      setPages(files.map((f) => ({ src: URL.createObjectURL(f) })));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (rec) return <Review initial={rec} pages={pages} />;

  return (
    <div className="intake">
      <h1>メモおこし</h1>
      <div className="box">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <div className="files">{files.map((f) => f.name).join(" / ") || "　"}</div>
        <button onClick={convert} disabled={busy || files.length === 0 || !settings}>
          {busy ? "変換中…" : "変換する"}
        </button>
        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}
