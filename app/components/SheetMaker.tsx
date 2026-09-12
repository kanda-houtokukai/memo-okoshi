"use client";

// 面談用紙を作る画面。正本は `docs/mock/home-youshi-mock-v2.html` の「2. 用紙を作る」「3. 用紙の見本」（凍結）。
//
// なぜ紙を配るのか: 面談中に項目に沿って書いてもらえれば、AIは**位置でも振り分けられる**ので読み取りが安定する。
// 聞き取る側にとっても、枠が並んでいること自体が聞き漏らしの防止になる。
//
// [DECISION 2026-09-10] 左で項目をトグルし、右の見本が**その場で変わる**（押した結果がすぐ見える）。
// [DECISION 2026-09-10] 項目は**記録と同じライブラリ・同じ選択**を使う（`lib/settings.ts`）。
//   ここでトグルすると次の変換の項目構成も変わる。用紙と出力を食い違わせないため。
// [DECISION 2026-09-10] PDFは**ブラウザの印刷（PDFとして保存）**で作る。日本語フォントを積まずに済み、
//   出力（Word/PDF）でも同じ手を使っている。ファイル名は `面談用紙_YYYYMMDD`。
// [DECISION 2026-09-10] **説明文は置かない**（原則4）。見本そのものが説明になっている。
// [DECISION 2026-09-10] ボタンは「PDFで保存」→**「印刷」**（P7-g）。押すと印刷ダイアログが開くので、
//   保存されると思って押した人が戸惑う。印刷ダイアログからPDF保存も選べるので、文言としてもこちらが正確。
// [DECISION 2026-09-10] **狭い画面（≤900px）は「項目」と「見本」をタブで切り替える**（P7-g）。
//   トグルの一覧が画面をほぼ占めて見本に辿り着けなかった。作法・閾値は確認画面（元メモ／記録）と同じ `.mobile-tabs`。
//   ⚠️ **「印刷」はタブの外側に置く**（どちらを表示していても押せる。P6-k の「次へ」が押し出された件と同種の問題を作らない）。
// [DECISION 2026-09-12] **項目を並べ替えられる**（P8-d）。対象者や面談の内容で聞く順番が変わり、用紙の並びが
//   面談の流れと違うと書くたびに視線が飛ぶ。**群の中だけ**で動かせ、並びは**用紙だけの設定**（`lib/settings.ts`）。
//   つまみは各行の右端（3本線）。**マウスはつまみから即ドラッグ／タッチはつまみの長押しで掴む／キーボードは↑↓**。
// [DECISION 2026-09-12] ⚠️ **タッチは長押ししてから掴む**（取り込み画面の紙は長押し待ちなしで掴む。ここは変える）。
//   取り込み画面は紙が横に並び、机のスクロールは縦なので方向で分けられる。この一覧は**並べ替えもスクロールも縦**で、
//   方向では分けられない。しかもつまみは右端＝親指でスクロールする場所にある。**掴む前に指が動けばスクロールに譲り**
//   （touch-action は殺さない）、**止めて待てば掴む**。掴んだあとだけスクロールを止める。
//   掴んだ行は指に付いて浮き（群の範囲から出ない＝群をまたげないことが形で分かる）、**他の行がよけて落ちる位置が空く**。
//   線で示す形は採らない: 縦の一覧では線がちょうど指の下＝掴んだ行の真下に来て、隠れて見えない。
//   並べ替えの計算は取り込み画面と同じ `moveTo`（`lib/reorder.ts`）。説明文は足さない。

import { useEffect, useMemo, useRef, useState } from "react";
import { ITEM_LIBRARY, type ItemDef } from "@/lib/items";
import {
  groupIds,
  loadSettings,
  loadSheetFree,
  loadSheetOrder,
  moveWithinGroup,
  saveSettings,
  saveSheetFree,
  saveSheetOrder,
  sheetGroups,
  sheetIds,
  type Settings,
} from "@/lib/settings";
import { dropIndexVertical } from "@/lib/reorder";
import {
  freeSheetLines,
  OTHER_BOX,
  paginate,
  sheetFileName,
  sheetLayout,
  SHEET,
  wideLast,
} from "@/lib/sheet";
import StepHeader from "./StepHeader";
import VocabButton from "./VocabButton";

type Props = { onHome: () => void; toast: (m: string) => void };
type Group = ItemDef["group"];

/** タッチで掴むまでの長押し（ms）。これより前に指が動いたらスクロールとみなして掴まない */
const HOLD_MS = 350;
/** 長押しの間に許す指のぶれ（px） */
const HOLD_SLOP = 8;
/** 掴んだまま一覧の上下端に寄せたら、一覧をスクロールさせる（取り込み画面の机と同じ考え） */
const EDGE = 44;
const EDGE_STEP = 8;

/** 掴んでいる行。dy は見た目のずれ（群の範囲に収める）、over は落とす位置（群の中の 0..数）、h は行の高さ（よける幅） */
type Drag = { id: string; group: Group; from: number; dy: number; over: number; h: number };

/** 用紙1枚ぶん。画面の見本と印刷で同じものを使う（食い違わせない）。
 *  `other` は最後のページだけ true（「その他」の枠は常に最後）。
 *  `free` は自由形式（枠なしの罫線だけ・「その他」も出さない）。 */
function Paper({
  items,
  lines,
  other,
  free,
}: {
  items: ItemDef[];
  lines: number;
  other?: boolean;
  free?: boolean;
}) {
  return (
    <div className="paper">
      <div className="p-head">
        <div className="p-title">面談記録メモ</div>
        {/* 記入欄。日時は数字だけを書くマス（表記の揺れを作らない）、参加者は1行ぶんの長い下線 */}
        <div className="p-fields">
          <div className="f f-date">
            <span className="lb">日時</span>
            <span className="cel y" />
            <span className="u">年</span>
            <span className="cel" />
            <span className="u">月</span>
            <span className="cel" />
            <span className="u">日</span>
            <span className="cel" />
            <span className="u">時</span>
            <span className="cel" />
            <span className="u">分</span>
            <span className="u wave">〜</span>
            <span className="cel" />
            <span className="u">時</span>
            <span className="cel" />
            <span className="u">分</span>
          </div>
          <div className="f f-place">
            <span className="lb">場所</span>
            <span className="wr" />
          </div>
          <div className="f f-people">
            <span className="lb">参加者</span>
            <span className="wr" />
          </div>
        </div>
      </div>
      {free ? (
        // 枠なし・罫線だけ。間隔は枠のときと同じ
        <div className="p-free">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className="p-grid">
            {items.map((it, i) => (
              <div
                // 最後の行に1つしか入らないときは横いっぱいに広げる（右半分を空けない）
                className={"p-box" + (wideLast(items.length) && i === items.length - 1 ? " wide" : "")}
                key={it.id}
                style={{ ["--c" as string]: it.color }}
              >
                <h4>{it.label}</h4>
                <div className="p-lines">
                  {Array.from({ length: lines }, (_, i) => (
                    <div key={i} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {other && (
            // 想定外の話の受け皿。横いっぱい・他の枠より低くして、項目の枠を痩せさせない
            <div
              className="p-box other"
              style={{ ["--c" as string]: "var(--sub)" }}
            >
              <h4>{OTHER_BOX.label}</h4>
              <div className="p-lines">
                {Array.from({ length: SHEET.otherLines }, (_, i) => (
                  <div key={i} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <div className="p-foot">メモおこし</div>
    </div>
  );
}

export default function SheetMaker({ onHome, toast }: Props) {
  const [set, setSet] = useState<Settings | null>(null);
  /** 狭い画面でどちらを見せるか。選択の状態はここでは持たないので、切り替えても中身は保たれる */
  const [tab, setTab] = useState<"items" | "paper">("items");
  /** 自由形式。**用紙の見た目だけ**を切り替える（記録側の選択には触れない） */
  const [free, setFree] = useState(false);
  /** 用紙での並び（**用紙だけの設定**。記録側の並びとは別に持つ） */
  const [order, setOrder] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  useEffect(() => {
    setSet(loadSettings(ITEM_LIBRARY));
    setFree(loadSheetFree());
    setOrder(loadSheetOrder(ITEM_LIBRARY));
  }, []);

  // 用紙に載るのは「記録と共有のオン・オフ」×「用紙だけの並び」
  const ids = set ? sheetIds(order, set.enabled, ITEM_LIBRARY) : [];
  const items = useMemo(
    () =>
      ids.map((id) => ITEM_LIBRARY.find((l) => l.id === id)!).filter(Boolean),
    [ids.join(",")],
  );
  const layout = sheetLayout(items.length);
  const pages = free ? [[]] : paginate(items, layout.perPage);
  const freeLines = freeSheetLines();

  /** 用紙の並びだけを書く。記録側の選択・並び（saveSettings）には触れない */
  const moveItem = (g: Group, from: number, insertAt: number) => {
    setOrder((o) => {
      const next = moveWithinGroup(o, ITEM_LIBRARY, g, from, insertAt);
      saveSheetOrder(next);
      return next;
    });
  };

  const cfgRef = useRef<HTMLDivElement>(null);
  const session = useRef<{
    id: string;
    group: Group;
    from: number;
    y0: number;
    st0: number;
    y: number;
    minDy: number;
    maxDy: number;
    /** 掴んだ時点の各行の位置（一覧の中の座標）。よけた行の見た目に引きずられないよう、落とし先はこれで測る */
    rects: { top: number; bottom: number }[];
    h: number;
    raf: number;
  } | null>(null);
  const hold = useRef<{ timer: number; x0: number; y0: number; y: number } | null>(null);

  /** その群の行（画面上の並び順） */
  const rowsOf = (g: Group) =>
    Array.from(cfgRef.current?.querySelectorAll<HTMLElement>(`[data-grp="${g}"] .item`) ?? []);

  /** 掴んだ行を除いて測り、元の並びの挿入位置に直す（取り込み画面と同じ計算）。一覧のスクロールぶんを戻して使う */
  const insertAtFor = (s: NonNullable<typeof session.current>, y: number) => {
    const st = cfgRef.current?.scrollTop ?? 0;
    const rects = s.rects
      .filter((_, i) => i !== s.from)
      .map((r) => ({ left: 0, right: 0, top: r.top - st, bottom: r.bottom - st }));
    const k = dropIndexVertical(rects, y);
    return k < s.from ? k : k + 1;
  };

  const update = (y: number) => {
    const s = session.current;
    const c = cfgRef.current;
    if (!s || !c) return;
    s.y = y;
    // 一覧がスクロールしたぶんも足す。見た目は群の範囲に収める（群をまたげないことが形で分かる）
    const dy = Math.max(s.minDy, Math.min(s.maxDy, y - s.y0 + (c.scrollTop - s.st0)));
    setDrag({ id: s.id, group: s.group, from: s.from, dy, over: insertAtFor(s, y), h: s.h });
  };

  const begin = (id: string, g: Group, from: number, y: number) => {
    const c = cfgRef.current;
    const rects = rowsOf(g).map((el) => el.getBoundingClientRect());
    if (!c || rects.length < 2 || session.current) return false;
    session.current = {
      id,
      group: g,
      from,
      y0: y,
      st0: c.scrollTop,
      y,
      minDy: rects[0].top - rects[from].top,
      maxDy: rects[rects.length - 1].bottom - rects[from].bottom,
      rects: rects.map((r) => ({ top: r.top + c.scrollTop, bottom: r.bottom + c.scrollTop })),
      h: rects[from].height,
      raf: 0,
    };
    setDrag({ id, group: g, from, dy: 0, over: from, h: rects[from].height });
    // 上下端に寄せているあいだ一覧を送る（終わりの判定はここに置かない。指／ボタンを離したときに終わる）
    const tick = () => {
      const s = session.current;
      if (!s) return;
      const r = c.getBoundingClientRect();
      const before = c.scrollTop;
      if (s.y < r.top + EDGE) c.scrollTop -= EDGE_STEP;
      else if (s.y > r.bottom - EDGE) c.scrollTop += EDGE_STEP;
      if (c.scrollTop !== before) api.current.update(s.y);
      s.raf = requestAnimationFrame(tick);
    };
    session.current.raf = requestAnimationFrame(tick);
    return true;
  };

  const finish = (commit: boolean) => {
    const s = session.current;
    session.current = null;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    if (commit) {
      const at = insertAtFor(s, s.y);
      if (at !== s.from && at !== s.from + 1) moveItem(s.group, s.from, at);
    }
    setDrag(null);
  };

  /** 画面の外（window や一覧に直接付けた受け手）からは、いつもこの最新版を呼ぶ */
  const api = useRef({ update, finish });
  api.current = { update, finish };

  /** マウス（とペン）: つまみから、そのままドラッグ */
  const onGripPointerDown = (e: React.PointerEvent, id: string, g: Group, from: number) => {
    if (e.pointerType === "touch" || e.button !== 0 || free) return; // タッチは長押しで掴む（下）
    e.preventDefault();
    if (!begin(id, g, from, e.clientY)) return;
    const move = (ev: PointerEvent) => api.current.update(ev.clientY);
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      api.current.finish(ev.type === "pointerup");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  /** タッチ: つまみを長押しして掴む。待つあいだに指が動けば、掴まずにスクロールへ譲る */
  const onGripTouchStart = (e: React.TouchEvent, id: string, g: Group, from: number) => {
    if (free || e.touches.length !== 1 || session.current) return;
    const t = e.touches[0];
    const h = { timer: 0, x0: t.clientX, y0: t.clientY, y: t.clientY };
    h.timer = window.setTimeout(() => {
      if (hold.current !== h) return;
      hold.current = null;
      if (begin(id, g, from, h.y)) navigator.vibrate?.(10);
    }, HOLD_MS);
    hold.current = h;
  };

  /** キーボード: つまみに焦点を置いて ↑↓（群の中で1つずつ。取り込み画面の ←→ に相当） */
  const onGripKey = (e: React.KeyboardEvent, id: string, g: Group, from: number, count: number) => {
    const dir = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!dir || free) return;
    e.preventDefault();
    const to = from + dir;
    if (to < 0 || to >= count) return;
    moveItem(g, from, dir === 1 ? to + 1 : to);
    // 行が動いても同じ項目のつまみに焦点を残す
    requestAnimationFrame(() =>
      cfgRef.current?.querySelector<HTMLElement>(`[data-id="${id}"] .grip`)?.focus(),
    );
  };

  // タッチの続き（動かす・離す）は一覧に直接受ける。React の touchmove は preventDefault が効かない（受動的）ため。
  // ⚠️ スクロールを止めるのは**掴んだあとだけ**。掴む前は何もしない（＝一覧は普通にスクロールする）。
  useEffect(() => {
    const c = cfgRef.current;
    if (!c) return;
    const cancelHold = () => {
      if (hold.current) {
        clearTimeout(hold.current.timer);
        hold.current = null;
      }
    };
    const onMove = (ev: TouchEvent) => {
      const t = ev.touches[0];
      if (!t) return;
      const h = hold.current;
      if (h) {
        h.y = t.clientY;
        if (Math.hypot(t.clientX - h.x0, t.clientY - h.y0) > HOLD_SLOP) cancelHold();
        return;
      }
      if (session.current) {
        ev.preventDefault();
        api.current.update(t.clientY);
      }
    };
    const onEnd = (ev: TouchEvent) => {
      cancelHold();
      if (session.current) api.current.finish(ev.type === "touchend");
    };
    const onScroll = () => {
      if (hold.current) cancelHold();
    };
    c.addEventListener("touchmove", onMove, { passive: false });
    c.addEventListener("touchend", onEnd);
    c.addEventListener("touchcancel", onEnd);
    c.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      c.removeEventListener("touchmove", onMove);
      c.removeEventListener("touchend", onEnd);
      c.removeEventListener("touchcancel", onEnd);
      c.removeEventListener("scroll", onScroll);
      cancelHold();
    };
  }, []);

  const toggleFree = () => {
    setFree((f) => {
      saveSheetFree(!f);
      return !f;
    });
  };

  const toggle = (id: string) => {
    if (free) return; // 自由形式のあいだは項目を触らせない（用紙に出ないため）
    setSet((s) => {
      if (!s) return s;
      const next = { ...s, enabled: { ...s.enabled, [id]: !s.enabled[id] } };
      saveSettings(next);
      return next;
    });
  };

  /** 見本をそのまま印刷に回す（印刷用のCSSがA4の実寸で描き直す） */
  const print = () => {
    if (items.length === 0) {
      toast("項目を1つ以上選んでください");
      return;
    }
    const src = document.querySelector(".pv-inner");
    if (!src) return;
    const root = document.createElement("div");
    root.className = "print-sheet";
    root.appendChild(src.cloneNode(true));
    document.body.appendChild(root);
    const prevTitle = document.title;
    document.title = sheetFileName();
    const cleanup = () => {
      document.title = prevTitle;
      root.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(() => {
      if (document.body.contains(root)) cleanup();
    }, 60000);
  };

  return (
    <div className="sheet-root">
      <StepHeader right={<VocabButton toast={toast} />} onHome={onHome} />

      <div className="sheet-cfg">
        {/* 狭い画面だけ出る切り替え（確認画面と同じ .mobile-tabs） */}
        <div className="mobile-tabs">
          <button
            className={tab === "items" ? "on" : ""}
            onClick={() => setTab("items")}
          >
            項目
          </button>
          <button
            className={tab === "paper" ? "on" : ""}
            onClick={() => setTab("paper")}
          >
            見本
          </button>
        </div>

        <div
          ref={cfgRef}
          className={"cfg" + (tab === "items" ? " on" : "") + (drag ? " lifting" : "")}
        >
          <h2>用紙に入れる項目</h2>
          {sheetGroups(ITEM_LIBRARY).map((g) => {
            // 群ごとに、用紙での並びで出す（オフの項目も並べ替えられる）
            const gids = groupIds(order, ITEM_LIBRARY, g);
            // 掴んでいるあいだ、落ちる位置にあたる行をよけさせる（空いた所に落ちる）
            const shift = (i: number) => {
              if (!drag || drag.group !== g || i === drag.from) return 0;
              if (drag.over > drag.from && i > drag.from && i < drag.over) return -drag.h;
              if (drag.over < drag.from && i >= drag.over && i < drag.from) return drag.h;
              return 0;
            };
            return (
              <div key={g} data-grp={g}>
                <div className="grp-t">{g}</div>
                {gids.map((id, i) => {
                  const l = ITEM_LIBRARY.find((x) => x.id === id)!;
                  const on = Boolean(set?.enabled[id]);
                  const lifted = drag?.id === id;
                  const dy = shift(i);
                  return (
                    <div
                      key={id}
                      data-id={id}
                      className={"item" + (lifted ? " lifted" : "")}
                      style={
                        lifted
                          ? { transform: `translateY(${drag!.dy}px) scale(1.02)` }
                          : dy
                            ? { transform: `translateY(${dy}px)` }
                            : undefined
                      }
                    >
                      <button
                        className={"row" + (on ? " on" : "")}
                        style={{ ["--c" as string]: l.color }}
                        role="switch"
                        aria-checked={on}
                        disabled={free}
                        onClick={() => toggle(id)}
                      >
                        <span className="sw" aria-hidden />
                        <span className="tg" aria-hidden />
                        <span className="nm">{l.label}</span>
                      </button>
                      <button
                        className="grip"
                        aria-label="つまんで並べ替え"
                        disabled={free}
                        onPointerDown={(e) => onGripPointerDown(e, id, g, i)}
                        onTouchStart={(e) => onGripTouchStart(e, id, g, i)}
                        onKeyDown={(e) => onGripKey(e, id, g, i, gids.length)}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={(e) => e.preventDefault()}
                      >
                        <i aria-hidden />
                        <i aria-hidden />
                        <i aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 第3の群。選ぶと上のトグルが押せなくなる（用紙に出ないため） */}
          <div className="grp-t free">{OTHER_BOX.freeLabel}</div>
          <button
            className={"row" + (free ? " on" : "")}
            style={{ ["--c" as string]: "var(--sub)" }}
            role="switch"
            aria-checked={free}
            onClick={toggleFree}
          >
            <span className="sw" aria-hidden />
            <span className="tg" aria-hidden />
            <span className="nm">{OTHER_BOX.freeLabel}</span>
          </button>
        </div>

        <div className={"pv" + (tab === "paper" ? " on" : "")}>
          <div className="pv-inner">
            {pages.map((p, i) => (
              <Paper
                key={i}
                items={p}
                lines={free ? freeLines : layout.linesPerPage[i]}
                other={!free && i === pages.length - 1}
                free={free}
              />
            ))}
          </div>
        </div>

        {/* 「印刷」はタブの外側。どちらを表示していても、画面が低くても押せる */}
        <div className="cfg-foot">
          <span className="cnt">
            {free
              ? `${OTHER_BOX.freeLabel}・1枚`
              : `${items.length}項目・${layout.pages}枚`}
          </span>
          <button
            className="dl"
            onClick={print}
            disabled={!free && items.length === 0}
          >
            印刷
          </button>
        </div>
      </div>
    </div>
  );
}
