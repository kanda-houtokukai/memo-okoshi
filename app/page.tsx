"use client";

// 入口＝画面の状態機械: 取り込み → 黒塗り →（変換）→ 確認・出力 → 新しい変換
//
// 原則5: 元画像・PDFはこのコンポーネントのメモリ（ImageBitmap）にしか存在しない。
//        API へ送るのは exportMasked() でマスクを焼き込んだ JPEG だけ。
//        確認画面の「元メモ」に出すのも焼き込み後の画像。
//
// 行き来と離脱（P6 項目8）— 何が残り何が失われるか:
//   確認 → 黒塗り: 変換結果（記録・マーカーの解決・こぼれ・気づき）は失われる。画像と黒塗りは残る
//   確認/黒塗り → 取り込み: 変換結果は失われる。画像と黒塗りは残る（ページを外せばその黒塗りも消える）
//   ホーム（最初から）: すべて失われる
//   ブラウザの戻る・閉じる: 画像か変換結果があれば beforeunload で警告
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
import Dialog, { type DialogSpec } from "./components/Dialog";
import { Toast, useToast } from "./components/Toast";
import type { MemoPage } from "./components/MemoPane";
import type { Step } from "./components/StepHeader";

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

/** 変換API呼び出し（初回も再変換も同じ）。blobs は焼き込み後の画像だけ */
async function callConvert(blobs: Blob[], itemIds: string[]): Promise<{ ok: true; data: ApiData } | { ok: false; error: string }> {
  const fd = new FormData();
  blobs.forEach((b, i) => fd.append("images", b, `page-${i + 1}.jpg`));
  fd.append("items", JSON.stringify(itemIds));
  fd.append("vocab", JSON.stringify(loadVocab())); // 端末内の辞書。サーバーは保存しない
  const res = await fetch("/api/convert", { method: "POST", body: fd });
  const json = await res.json();
  if (!json.ok) return { ok: false, error: String(json.error ?? "変換できませんでした") + (json.raw ? "\n\n" + json.raw : "") };
  return { ok: true, data: json.data as ApiData };
}

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
  const [dlg, setDlg] = useState<DialogSpec | null>(null);
  const urls = useRef<string[]>([]);
  const blobs = useRef<Blob[]>([]); // 焼き込み後の画像（再変換に使う）
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

  /* 離脱警告: 端末内にしかないものがあるとき */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (pages.length === 0 && !rec) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [pages.length, rec]);

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
      const out: Blob[] = [];
      for (const p of pages) out.push(await exportMasked(p)); // ← 送るのは焼き込み後だけ
      const r = await callConvert(out, s.order.filter((id) => s.enabled[id]));
      if (!r.ok) {
        setError(r.error);
        toast("変換できませんでした");
        return;
      }
      blobs.current = out;
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = out.map((b) => URL.createObjectURL(b));
      setMemoPages(urls.current.map((src) => ({ src })));
      setRec(fromApi(r.data, ITEM_LIBRARY, s.enabled, s.order));
      setRun((n) => n + 1);
      setMode("review");
    } catch (e) {
      setError(String(e));
      toast("変換できませんでした");
    } finally {
      setConverting(false);
    }
  };

  /** 追加した項目だけを埋める再変換（項目6）。焼き込み済み画像をそのまま再送する */
  const reconvert = async (itemIds: string[]): Promise<ApiData | null> => {
    if (blobs.current.length === 0) return null;
    const r = await callConvert(blobs.current, itemIds);
    if (!r.ok) {
      toast("再変換できませんでした");
      return null;
    }
    return r.data;
  };

  /** 変換結果を捨てる（画像と黒塗りは残す） */
  const dropResult = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    blobs.current = [];
    setRec(null);
    setMemoPages([]);
    setError("");
  };

  /** 「最初から」: 端末内のデータをすべて捨てて取り込みへ */
  const restart = () => {
    dropResult();
    pages.forEach(releasePage);
    setPages([]);
    setIndex(0);
    setMode("intake");
  };

  const confirm = (spec: Omit<DialogSpec, "onCancel">) =>
    setDlg({ ...spec, onGo: () => { setDlg(null); spec.onGo(); }, onCancel: () => setDlg(null) });

  /** ステップ表示から前の工程へ戻る（何が失われるかを明示して確認） */
  const goStep = (target: Step) => {
    if (target === "mask" && mode === "review") {
      confirm({
        title: "黒塗りに戻りますか",
        body: "変換した記録（マーカーの確認・直した文章・こぼれ枠・気づき）は失われます。画像と黒塗りは残ります。",
        go: "黒塗りに戻る",
        cancel: "やめる",
        onGo: () => { dropResult(); setMode("mask"); },
      });
      return;
    }
    if (target === "intake") {
      if (mode === "review") {
        confirm({
          title: "取り込みに戻りますか",
          body: "変換した記録は失われます。画像と黒塗りは残ります（ページを外すとその黒塗りも消えます）。",
          go: "取り込みに戻る",
          cancel: "やめる",
          onGo: () => { dropResult(); setMode("intake"); },
        });
      } else {
        // 黒塗り → 取り込み: 失うものはない
        setMode("intake");
      }
    }
  };

  const goHome = () => {
    if (pages.length === 0 && !rec) return;
    confirm({
      title: "最初からやり直しますか",
      body: "取り込んだ画像・黒塗り・変換した記録はすべて失われます（この端末にも残りません）。",
      warn: "コピーや保存をしていない記録は戻せません。",
      go: "最初から",
      cancel: "やめる",
      onGo: restart,
    });
  };

  if (mode === "review" && rec)
    return (
      <>
        <Review key={run} initial={rec} pages={memoPages} onRestart={restart} onStep={goStep} onHome={goHome} onReconvert={reconvert} />
        <Dialog spec={dlg} />
      </>
    );

  if (mode === "mask" && pages.length > 0) {
    return (
      <>
        <Redact
          pages={pages}
          index={Math.min(index, pages.length - 1)}
          onIndex={setIndex}
          onMask={setMask}
          onConvert={convert}
          onStep={goStep}
          onHome={goHome}
          converting={converting}
          error={error}
          toast={toast}
        />
        <Dialog spec={dlg} />
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
        onNext={() => { setIndex(0); setMode("mask"); }}
        onHome={goHome}
        toast={toast}
      />
      {error && !pages.length && (
        <div className="wrap single">
          <div className="errline">{error}</div>
        </div>
      )}
      <Dialog spec={dlg} />
      <Toast msg={msg} on={on} />
    </>
  );
}
