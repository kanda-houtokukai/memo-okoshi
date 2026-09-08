"use client";

// 確認・出力画面。docs/mock/memo-okoshi-mock-v6.html の本実装移植。
// DOM構造・クラス名・文言・アニメーションは正本どおり。状態管理のみReact化。

import { useCallback, useEffect, useRef, useState } from "react";
import { ITEM_LIBRARY, itemById } from "@/lib/items";
import {
  acceptSpill,
  activeIds,
  buildOutputText,
  counts,
  mergeReconvert,
  moveSection,
  moveSpillTo,
  outputWarnings,
  pendingReconvertIds,
  recordEntries,
  resolveToken,
  saveEdit,
  sectionCopyText,
  sectionHasWarn,
  toggleItem,
  type RecordState,
} from "@/lib/record";
import SectionCard from "./SectionCard";
import Popover from "./Popover";
import Drawer from "./Drawer";
import OutputOverlay from "./OutputOverlay";
import MemoPane, { type MemoPage } from "./MemoPane";
import StepHeader, { type Step } from "./StepHeader";
import VocabButton, { VOCAB_CHANGED } from "./VocabButton";
import { addEntry, loadVocab, REASON_TEXT, saveVocab } from "@/lib/vocab";
import type { ApiData } from "@/lib/record";
import Dialog, { type DialogSpec } from "./Dialog";
import { exportDocx, printRecord } from "@/lib/export";

const SETTINGS_KEY = "memo-okoshi:items";

function copyText(txt: string, ok: () => void) {
  const fb = () => {
    const ta = document.createElement("textarea");
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      ok();
    } catch {
      /* 失敗時は何もしない（モックと同じ） */
    }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(ok).catch(fb);
  else fb();
}

type Props = {
  initial: RecordState;
  pages: MemoPage[];
  onRestart?: () => void;
  onStep?: (s: Step) => void;
  onHome?: () => void;
  /** 追加した項目だけを埋める再変換（項目6）。null なら失敗 */
  onReconvert?: (itemIds: string[]) => Promise<ApiData | null>;
};

export default function Review({ initial, pages, onRestart, onStep, onHome, onReconvert }: Props) {
  const [rec, setRec] = useState<RecordState>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [pop, setPop] = useState<{ sid: string; ti: number; left: number; top: number } | null>(null);
  const [picker, setPicker] = useState<{ index: number; left: number; top: number } | null>(null);
  const [page, setPage] = useState(0);
  const [mobileTab, setMobileTab] = useState<"memo" | "rec">("rec");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dlg, setDlg] = useState<DialogSpec | null>(null);
  const [reconverting, setReconverting] = useState(false);
  const [insClosed, setInsClosed] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [outText, setOutText] = useState("");
  const [warning, setWarning] = useState("");
  const [outCopied, setOutCopied] = useState(false);
  const [copiedSec, setCopiedSec] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const c = counts(rec);
  const [pulse, setPulse] = useState<{ y: boolean; b: boolean; r: boolean }>({ y: false, b: false, r: false });
  const prevCounts = useRef(c);

  /* 要確認カウンタの脈動（値が変わった瞬間だけ .pulse） */
  useEffect(() => {
    const p = prevCounts.current;
    const changed = { y: p.y !== c.y, b: p.b !== c.b, r: p.r !== c.r };
    prevCounts.current = c;
    if (!changed.y && !changed.b && !changed.r) return;
    setPulse(changed);
    const t = setTimeout(() => setPulse({ y: false, b: false, r: false }), 180);
    return () => clearTimeout(t);
  }, [c.y, c.b, c.r]);

  /* 項目のチェック構成・表示順は端末内（localStorage）に保存 */
  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ enabled: activeIds(rec), order: rec.order })
      );
    } catch {
      /* プライベートブラウズ等では保存できないが動作は続ける */
    }
  }, [rec.enabled, rec.order]);

  /* ポップオーバーの外側クリックで閉じる（モックと同じ判定） */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".pop") || t.classList.contains("mk") || t.closest(".mv")) return;
      setPop(null);
      setPicker(null);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastOn(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastOn(false), 2600);
  }, []);

  const flashCard = useCallback((id: string) => {
    const el = document.getElementById("sec-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1400);
  }, []);

  /** 将来: マーカー↔元メモの位置連動。APIが ref を返すようになったらここに実装する（P3ではスコープ外） */
  const flashMemo = useCallback((_ref: string) => {}, []);

  const acts = activeIds(rec);

  const popPos = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return {
      left: Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - 320)),
      top: r.bottom + window.scrollY + 8,
    };
  };

  const onTokenClick = (sid: string, ti: number, el: HTMLElement) => {
    setPicker(null);
    setPop({ sid, ti, ...popPos(el) });
  };

  const doResolve = (val: string | null, learn?: boolean) => {
    if (!pop) return;
    const tk = rec.tokens[pop.sid]?.[pop.ti];
    setRec((s) => resolveToken(s, pop.sid, pop.ti, val));
    setPop(null);
    // 黄マーカーからの学習: 確定した語を組織語彙へ（赤には出ない導線）
    if (learn && tk?.t === "y") {
      const r = addEntry(loadVocab(), { term: val ?? tk.s });
      if (r.ok) {
        saveVocab(r.list);
        window.dispatchEvent(new Event(VOCAB_CHANGED));
        toast("確定しました — 辞書に追加");
        return;
      }
      toast(r.reason === "dup" ? "確定しました（辞書にあります）" : REASON_TEXT[r.reason!]);
      return;
    }
    toast(tk?.t === "r" ? "人名を置き換えました" : "確定しました");
  };

  const onCopySection = (id: string) => {
    const text = sectionCopyText(rec, id);
    if (text === null) {
      toast("人名（赤）を置き換えるとコピーできます");
      return;
    }
    const warn = sectionHasWarn(rec.tokens[id] ?? []);
    copyText(text, () => {
      setCopiedSec(id);
      setTimeout(() => setCopiedSec((s) => (s === id ? null : s)), 1800);
      toast(warn ? "コピーしました（未確認 残あり）" : "コピーしました");
    });
  };

  const onDone = () => {
    if (c.r > 0) {
      toast("人名（赤）を置き換えると完成できます");
      const sp = document.querySelector(".mk.r") as HTMLElement | null;
      if (sp) {
        sp.scrollIntoView({ behavior: "smooth", block: "center" });
        sp.style.outline = "2px solid var(--r-line)";
        setTimeout(() => (sp.style.outline = ""), 1400);
      }
      return;
    }
    const w = outputWarnings(rec);
    setWarning(w.length ? w.join("・") + " を残して出力しています。最終確認は記入者の責任です。" : "");
    setOutText(buildOutputText(rec, ITEM_LIBRARY));
    setOutCopied(false);
    setOutOpen(true);
  };

  const onToggleItem = (id: string) => {
    const def = itemById(id);
    if (!def) return;
    const res = toggleItem(rec, id, ITEM_LIBRARY);
    setRec(res.state);
    if (rec.enabled[id]) {
      toast(res.demoted ? `「${def.label}」を外しました — 内容はこぼれ枠へ` : `「${def.label}」を外しました`);
    } else {
      toast(`「${def.label}」を追加`);
    }
  };

  /** AIの気づきの「＋」チップ / こぼれ枠の「＋項目へ」 */
  const addFromSpill = (id: string) => {
    const def = itemById(id);
    if (!def) return;
    const idx = rec.spill.findIndex((sp) => sp.sug === id);
    setRec((s) => (idx >= 0 ? acceptSpill(s, idx, ITEM_LIBRARY) : toggleItem(s, id, ITEM_LIBRARY).state));
    toast(`「${def.label}」を追加`);
    setTimeout(() => flashCard(id), 150);
  };

  const onAcceptSpill = (index: number) => {
    const it = rec.spill[index];
    const def = it.sug ? itemById(it.sug) : undefined;
    if (!def) return;
    setRec((s) => acceptSpill(s, index, ITEM_LIBRARY));
    toast(`「${def.label}」に移しました`);
    setTimeout(() => flashCard(def.id), 150);
  };

  /** suggest のないこぼれ: 表示中の項目から移動先を選ばせる */
  const onOpenSpillPicker = (index: number, el: HTMLElement) => {
    if (acts.length === 0) {
      toast("項目を追加すると移せます");
      return;
    }
    setPop(null);
    setPicker({ index, ...popPos(el) });
  };

  const onPickSpillTarget = (targetId: string) => {
    if (!picker) return;
    const def = itemById(targetId);
    if (!def) return;
    setRec((s) => moveSpillTo(s, picker.index, targetId, ITEM_LIBRARY));
    setPicker(null);
    toast(`「${def.label}」に移しました`);
    setTimeout(() => flashCard(targetId), 150);
  };

  const doneReady = c.r === 0;
  const pending = pendingReconvertIds(rec);

  /** 追加した項目だけを埋める再変換（同意を得てから） */
  const askReconvert = () => {
    if (!onReconvert || pending.length === 0) return;
    const names = pending.map((id) => itemById(id)?.label ?? id).join("・");
    setDlg({
      title: "追加した項目をAIで埋めますか",
      body: `「${names}」を、いまの画像から読み取って埋めます。30〜40秒かかります。すでに直した文章・確認したマーカー・こぼれ枠の内容はそのまま残ります。`,
      go: "再変換する",
      cancel: "やめる",
      onGo: async () => {
        setDlg(null);
        setReconverting(true);
        try {
          const data = await onReconvert(acts);
          if (data) {
            setRec((s) => mergeReconvert(s, data, ITEM_LIBRARY));
            toast("追加した項目を埋めました");
          }
        } finally {
          setReconverting(false);
        }
      },
      onCancel: () => setDlg(null),
    });
  };

  return (
    <>
      <StepHeader
        step="review"
        done={onStep ? ["intake", "mask"] : []}
        onStep={onStep}
        onHome={onHome}
        right={
          <>
            <div className="chips">
              <span className="lbl">要確認</span>
              <span className={"chip y" + (c.y === 0 ? " zero" : "") + (pulse.y ? " pulse" : "")}>
                読取 <b>{c.y}</b>
              </span>
              <span className={"chip b" + (c.b === 0 ? " zero" : "") + (pulse.b ? " pulse" : "")}>
                推定 <b>{c.b}</b>
              </span>
              <span className={"chip r" + (c.r === 0 ? " zero" : "") + (pulse.r ? " pulse" : "")}>
                人名 <b>{c.r}</b>
              </span>
            </div>
            <VocabButton toast={toast} />
            <button className={"done-btn" + (doneReady ? " ready" : "")} onClick={onDone}>
              {c.r > 0 ? "完成（人名の対応が必要）" : c.y + c.b > 0 ? "完成" : "完成 ✓"}
            </button>
          </>
        }
      />

      <div className="wrap">
        <div className="mobile-tabs">
          <button className={mobileTab === "memo" ? "on" : ""} onClick={() => setMobileTab("memo")}>
            元メモ
          </button>
          <button className={mobileTab === "rec" ? "on" : ""} onClick={() => setMobileTab("rec")}>
            記録
          </button>
        </div>

        <div className={"pane-memo" + (mobileTab === "memo" ? " on" : "")}>
          <MemoPane pages={pages} page={page} onPage={setPage} />
        </div>

        <div className={"pane-rec" + (mobileTab === "rec" ? " on" : "")}>
          <div className="pane-h">
            <h2>記録（下書き）</h2>
            <span className="info" data-tip="黄=読取に自信なし ／ 青=AIの推定 ／ 赤=人名・対応必須" tabIndex={0}>
              ?
            </span>
            <div className="rec-tools">
              {onReconvert && pending.length > 0 && (
                <button className={"tool-btn accent" + (reconverting ? " busy" : "")} onClick={askReconvert} disabled={reconverting}>
                  {reconverting ? "再変換中" : "再変換"}
                  {!reconverting && <span className="ins-count">{pending.length}</span>}
                </button>
              )}
              <button className="tool-btn" onClick={() => setDrawerOpen(true)}>
                ☰ 項目
              </button>
            </div>
          </div>

          <div className="rec">
            {acts.map((id) => {
              const def = itemById(id);
              if (!def) return null;
              return (
                <SectionCard
                  key={id}
                  def={def}
                  tokens={rec.tokens[id] ?? []}
                  editing={editing === id}
                  copied={copiedSec === id}
                  highlighted={highlight === id}
                  onStartEdit={() => {
                    setPop(null);
                    setEditing(id);
                  }}
                  onSaveEdit={(text) => {
                    setRec((s) => saveEdit(s, id, text));
                    setEditing(null);
                    toast(`「${def.label}」を確定しました`);
                  }}
                  onCancelEdit={() => setEditing(null)}
                  onCopy={() => onCopySection(id)}
                  onMove={(dir) => setRec((s) => moveSection(s, id, dir))}
                  onTokenClick={(ti, el) => onTokenClick(id, ti, el)}
                />
              );
            })}
          </div>

          {rec.spill.length > 0 && (
            <div className="spill">
              <div className="sp-card">
                <div className="sp-h">
                  <h2>拾いきれなかった内容</h2>
                  <span className="sp-count">{rec.spill.length}</span>
                  <span className="info" data-tip="どの項目にも入らなかった内容。黙って捨てません" tabIndex={0}>
                    ?
                  </span>
                </div>
                <div>
                  {rec.spill.map((it, idx) => {
                    const def = it.sug ? itemById(it.sug) : undefined;
                    return (
                      <div className="sp-item" key={idx}>
                        {it.ref ? (
                          <div className="tx" data-tip="元メモを見る" onClick={() => flashMemo(it.ref!)}>
                            {it.text}
                          </div>
                        ) : (
                          <div className="tx">{it.text}</div>
                        )}
                        {def ? (
                          <button className="mv" onClick={() => onAcceptSpill(idx)}>
                            ＋ 「{def.label}」へ
                          </button>
                        ) : (
                          <button
                            className="mv"
                            data-tip="項目へ移す"
                            aria-label="項目へ移す"
                            onClick={(e) => onOpenSpillPicker(idx, e.currentTarget)}
                          >
                            ＋
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className={"insights" + (insClosed ? " closed" : "")}>
            <div className="ins-h" onClick={() => setInsClosed((v) => !v)}>
              <h2>AIの気づき</h2>
              <span className="ins-count">{rec.insights.length}</span>
              <span
                className="info"
                data-tip="参考表示 — 記録・転記には含まれません"
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
              >
                ?
              </span>
              <span className="ins-chev">▾</span>
            </div>
            <div className="ins-body">
              {rec.insights.map((i, idx) => (
                <div className="note" key={idx}>
                  <div>{i.s}</div>
                  <div className="why">{i.why}</div>
                  <div className="n-refs">
                    {i.refs.map((r) => {
                      const def = itemById(r);
                      if (!def) return null;
                      return rec.enabled[r] ? (
                        <span
                          key={r}
                          className="tabchip"
                          style={{ background: def.color }}
                          data-tip={def.label}
                          onClick={() => flashCard(r)}
                        >
                          {def.tab}
                        </span>
                      ) : (
                        <span
                          key={r}
                          className="tabchip off"
                          data-tip={`「${def.label}」を項目に追加`}
                          onClick={() => addFromSpill(r)}
                        >
                          ＋{def.tab}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {pop && rec.tokens[pop.sid]?.[pop.ti] && (
        <Popover
          token={rec.tokens[pop.sid][pop.ti]}
          pos={{ left: pop.left, top: pop.top }}
          onResolve={doResolve}
          onClose={() => setPop(null)}
        />
      )}

      {picker && (
        <Popover
          mode="picker"
          options={acts.map((id) => ({ id, label: itemById(id)!.label }))}
          pos={{ left: picker.left, top: picker.top }}
          onPick={onPickSpillTarget}
          onClose={() => setPicker(null)}
        />
      )}

      <Drawer
        open={drawerOpen}
        enabled={rec.enabled}
        onToggle={onToggleItem}
        onClose={() => setDrawerOpen(false)}
      />

      <OutputOverlay
        open={outOpen}
        text={outText}
        warning={warning}
        copied={outCopied}
        onCopy={() => copyText(outText, () => setOutCopied(true))}
        onClose={() => {
          setOutOpen(false);
          setOutCopied(false);
        }}
        onRestart={onRestart}
        onWord={() => exportDocx(recordEntries(rec, ITEM_LIBRARY)).catch(() => toast("Wordを作れませんでした"))}
        onPdf={() => printRecord(recordEntries(rec, ITEM_LIBRARY))}
      />

      {reconverting && <div className="progress fill" />}
      <Dialog spec={dlg} />

      <div className={"toast" + (toastOn ? " on" : "")}>{toastMsg}</div>
    </>
  );
}
