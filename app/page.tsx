"use client";

// 入口＝画面の状態機械: 取り込み → 黒塗り →（変換）→ 確認・出力 → 新しい変換
//
// 原則5: 元画像・PDFはこのコンポーネントのメモリ（ImageBitmap）にしか存在しない。
//        API へ送るのは exportMasked() でマスクを焼き込んだ JPEG だけ。
//        確認画面の「元メモ」に出すのも焼き込み後の画像。
//
// ?fixture=1 は開発用（モックv6の内容で確認画面を開く。API課金なし）。

import { useEffect, useRef, useState } from "react";
import { ITEM_LIBRARY } from "@/lib/items";
import { fromApi, type ApiData, type RecordState } from "@/lib/record";
import { exportMasked, filesToPages, releasePage, type PageItem } from "@/lib/pages";
import type { MaskState } from "@/lib/mask";
import { loadVocab } from "@/lib/vocab";
import Review from "./components/Review";
import Intake from "./components/Intake";
import Redact from "./components/Redact";
import { Toast, useToast } from "./components/Toast";
import type { MemoPage } from "./components/MemoPane";

const SETTINGS_KEY = "memo-okoshi:items";

type Settings = { enabled: Record<string, boolean>; order: string[] };

function defaultSettings(): Settings {
  const enabled: Record<string, boolean> = {};
  ITEM_LIBRARY.forEach((l) => (enabled[l.id] = l.defaultOn));
  return { enabled, order: ITEM_LIBRARY.map((l) => l.id) };
}

/** 項目のチェック構成・表示順（確認画面のドロワーが保存する）。次の変換から反映される */
function loadSettings(): Settings {
  const def = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const saved = JSON.parse(raw) as { enabled?: string[]; order?: string[] };
    const enabled: Record<string, boolean> = {};
    ITEM_LIBRARY.forEach((l) => (enabled[l.id] = (saved.enabled ?? []).includes(l.id)));
    const order = [
      ...(saved.order ?? []).filter((id) => ITEM_LIBRARY.some((l) => l.id === id)),
      ...ITEM_LIBRARY.map((l) => l.id).filter((id) => !(saved.order ?? []).includes(id)),
    ];
    return { enabled, order };
  } catch {
    return def;
  }
}

type Mode = "intake" | "mask" | "review";

export default function Page() {
  const [mode, setMode] = useState<Mode>("intake");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");
  const [rec, setRec] = useState<RecordState | null>(null);
  const [memoPages, setMemoPages] = useState<MemoPage[]>([]);
  const [run, setRun] = useState(0); // 確認画面を作り直すためのキー
  const urls = useRef<string[]>([]);
  const { toast, msg, on } = useToast();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("fixture") !== "1") return;
    const s = loadSettings();
    fetch("/dev-fixture.json")
      .then((r) => r.json())
      .then((f: ApiData & { pages?: MemoPage[] }) => {
        setRec(fromApi(f, ITEM_LIBRARY, s.enabled, s.order));
        setMemoPages(f.pages ?? []);
        setMode("review");
      })
      .catch((e) => setError(String(e)));
  }, []);

  const addFiles = async (files: File[]) => {
    setBusy(true);
    try {
      const { pages: added, failed } = await filesToPages(files);
      if (added.length) setPages((p) => [...p, ...added]);
      if (failed.length) toast(`読み込めませんでした: ${failed.join("、")}`);
    } finally {
      setBusy(false);
    }
  };

  const removePage = (id: string) =>
    setPages((p) => {
      const t = p.find((x) => x.id === id);
      if (t) releasePage(t);
      return p.filter((x) => x.id !== id);
    });

  const movePage = (id: string, dir: -1 | 1) =>
    setPages((p) => {
      const i = p.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const setMask = (id: string, mask: MaskState) => setPages((p) => p.map((x) => (x.id === id ? { ...x, mask } : x)));

  const convert = async () => {
    if (pages.length === 0) return;
    setConverting(true);
    setError("");
    try {
      const s = loadSettings();
      const blobs: Blob[] = [];
      for (const p of pages) blobs.push(await exportMasked(p)); // ← 送るのは焼き込み後だけ
      const fd = new FormData();
      blobs.forEach((b, i) => fd.append("images", b, `page-${i + 1}.jpg`));
      fd.append("items", JSON.stringify(s.order.filter((id) => s.enabled[id])));
      fd.append("vocab", JSON.stringify(loadVocab())); // 端末内の辞書。サーバーは保存しない
      const res = await fetch("/api/convert", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        setError(String(json.error ?? "変換できませんでした") + (json.raw ? "\n\n" + json.raw : ""));
        toast("変換できませんでした");
        return;
      }
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = blobs.map((b) => URL.createObjectURL(b));
      setMemoPages(urls.current.map((src) => ({ src })));
      setRec(fromApi(json.data as ApiData, ITEM_LIBRARY, s.enabled, s.order));
      setRun((n) => n + 1);
      setMode("review");
    } catch (e) {
      setError(String(e));
      toast("変換できませんでした");
    } finally {
      setConverting(false);
    }
  };

  /** 「新しい変換を始める」: 端末内のデータをすべて捨てて取り込みへ */
  const restart = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    pages.forEach(releasePage);
    setPages([]);
    setIndex(0);
    setRec(null);
    setMemoPages([]);
    setError("");
    setMode("intake");
  };

  if (mode === "review" && rec) return <Review key={run} initial={rec} pages={memoPages} onRestart={restart} />;

  if (mode === "mask" && pages.length > 0) {
    return (
      <>
        <Redact
          pages={pages}
          index={Math.min(index, pages.length - 1)}
          onIndex={setIndex}
          onMask={setMask}
          onBack={() => setMode("intake")}
          onConvert={convert}
          converting={converting}
          error={error}
        />
        <Toast msg={msg} on={on} />
      </>
    );
  }

  return (
    <>
      <Intake
        pages={pages}
        busy={busy}
        onAdd={addFiles}
        onRemove={removePage}
        onMove={movePage}
        onNext={() => {
          setIndex(0);
          setMode("mask");
        }}
        toast={toast}
      />
      {error && mode === "intake" && !pages.length && <div className="wrap single"><div className="errline">{error}</div></div>}
      <Toast msg={msg} on={on} />
    </>
  );
}
