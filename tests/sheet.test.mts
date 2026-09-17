// P7-e: ホーム画面と面談用紙の機械テスト。
//
// 用紙は「面談中に項目に沿って書いてもらう紙」で、**記録と同じ項目・同じ選択**でなければ意味がない
// （用紙に枠があるのに記録側でその項目がオフ、が起きると内容がこぼれ枠に落ちる）。
// ここではその一致と、A4に収める割り付けを見張る。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEM_LIBRARY } from "../lib/items.ts";
import { defaultSettings, mergeSettings, selectedIds } from "../lib/settings.ts";
import { boxHeight, freeAreaH, freeSheetLines, lastPageCap, linesIn, OTHER_BOX, pageLabel, paginate, PRINT, sheetFileName, sheetLayout, sheetRows, SHEET, wideLast } from "../lib/sheet.ts";

/* ---------- 項目ライブラリの分類（2026-09-10に見直し） ---------- */

test("項目の分類は基本6＋追加7で、既定オンは基本6だけ（P7-e/P7-f）", () => {
  const basic = ITEM_LIBRARY.filter((l) => l.group === "基本").map((l) => l.label);
  const extra = ITEM_LIBRARY.filter((l) => l.group === "追加項目").map((l) => l.label);
  assert.deepEqual(basic, [
    "面談概要",
    "本人の発言・様子",
    "家族等の発言",
    "課題・変化",
    "健康・服薬",
    "生活・住環境",
  ]);
  assert.deepEqual(extra, [
    "支援者の所感",
    "次回への申し送り",
    "日中活動・就労",
    "金銭管理",
    "リスク・緊急性",
    "関係機関との連携",
    "本人の希望・目標",
  ]);
  // [2026-09-10 P7-f] 分類と既定を一致させる: 基本はすべてオン、追加項目はすべてオフ
  const on = ITEM_LIBRARY.filter((l) => l.defaultOn).map((l) => l.id);
  assert.deepEqual(on, ["gaiyou", "honnin", "kazoku", "kadai", "kenko", "seikatsu"]);
  assert.ok(
    ITEM_LIBRARY.filter((l) => l.group === "基本").every((l) => l.defaultOn),
    "基本はすべて既定オン"
  );
  assert.ok(
    ITEM_LIBRARY.filter((l) => l.group === "追加項目").every((l) => !l.defaultOn),
    "追加項目はすべて既定オフ"
  );
  // 締めフラグは1つだけ（追加・復帰の差し込み先）
  assert.equal(ITEM_LIBRARY.filter((l) => l.closing).length, 1);
  assert.equal(ITEM_LIBRARY.find((l) => l.closing)?.id, "moushiokuri");
});

test("すでに保存されている選択は移行せず、そのまま尊重する（P7-e）", () => {
  // 2026-09-10より前の既定（基本6）で保存していた人。id は変えていないのでそのまま読める
  const old = { enabled: ["gaiyou", "honnin", "kazoku", "shokan", "kadai", "moushiokuri"], order: [] as string[] };
  const s = mergeSettings(old, ITEM_LIBRARY);
  assert.deepEqual(selectedIds(s).sort(), old.enabled.slice().sort());
  // 基本へ上がった項目を勝手にオンにしない（AIに何を書かせるかが黙って変わるため）
  assert.equal(s.enabled.kenko, false);
  assert.equal(s.enabled.seikatsu, false);
  // 触ったことがなければ新しい既定が出る
  assert.equal(selectedIds(defaultSettings(ITEM_LIBRARY)).length, 6);
  // 知らない id は捨て、増えた id は末尾に足す
  const s2 = mergeSettings({ enabled: ["gaiyou", "no_such_item"], order: ["no_such_item", "gaiyou"] }, ITEM_LIBRARY);
  assert.deepEqual(selectedIds(s2), ["gaiyou"]);
  assert.equal(s2.order.length, ITEM_LIBRARY.length);
});

/* ---------- 用紙の割り付け ---------- */

test("1ページに入る項目は6つまで。前のページから6つずつ詰め、余りは最後のページ（P9-e。以前は8項目までが1枚）", () => {
  assert.equal(SHEET.perPageMax, 6);
  assert.equal(SHEET.perPageMax % SHEET.cols, 0, "上限は偶数（最後のページ以外は2列組の行が埋まる）");
  // 設計側が示した割り振り（1〜13項目すべて）
  const want: Record<number, number[]> = {
    1: [1], 2: [2], 3: [3], 4: [4], 5: [5], 6: [6],
    7: [6, 1], 8: [6, 2], 9: [6, 3], 10: [6, 4], 11: [6, 5], 12: [6, 6], 13: [6, 6, 1],
  };
  for (let n = 1; n <= ITEM_LIBRARY.length; n++) {
    const l = sheetLayout(n);
    assert.deepEqual(l.perPage, want[n], `n=${n}`);
    assert.equal(l.pages, want[n].length);
    assert.equal(l.perPage.reduce((a, b) => a + b, 0), n, `枠が落ちている n=${n}`);
    assert.equal(l.linesPerPage.length, l.pages);
    for (const lines of l.linesPerPage) assert.ok(lines >= SHEET.minLines, `罫線が下限を割った n=${n}`);
  }
  // 3ページ以上も同じ規則（今のライブラリは13項目までだが、規則として見張る）
  assert.deepEqual(sheetLayout(19).perPage, [6, 6, 6, 1]);
  assert.deepEqual(sheetLayout(18).perPage, [6, 6, 6]);
  // 7〜8項目で罫線が増える（以前は1枚に詰めて 6本）: 1ページ目は6項目で「その他」が無いので 10本、2ページ目は 31本
  // （2ページ目は P9-f で罫線15本までになった）
  assert.deepEqual(sheetLayout(7).linesPerPage, [10, 15]);
  assert.deepEqual(sheetLayout(8).linesPerPage, [10, 15]);
  assert.ok(Math.min(...sheetLayout(7).linesPerPage) > 6 && Math.min(...sheetLayout(8).linesPerPage) > 6);
});

test("罫線の間隔はどの項目数でも同じ（P8-b）", () => {
  // 書く字の大きさは項目数と関係ない。行間が項目数で変わるのはおかしい
  for (let n = 1; n <= ITEM_LIBRARY.length; n++) {
    assert.equal(sheetLayout(n).pitch, SHEET.line, `行間が変わっている n=${n}`);
  }
  // 枠の高さに**入るだけ**引く＝枠が高いほど本数が多い（引き伸ばさない）
  for (let n = 1; n <= ITEM_LIBRARY.length; n++) {
    const l = sheetLayout(n);
    l.perPage.forEach((c, i) => {
      const h = boxHeight(c, i === l.perPage.length - 1, i > 0); // 2ページ目以降は頭が題だけ（P9-g）
      const room = h - PRINT.boxTop - PRINT.boxBottom;
      // 2ページ以上の最後のページは上限（15本）で止まる（P9-f）。それ以外は高さに入るだけ
      const cap = lastPageCap(l.pages, i) ?? Infinity;
      assert.equal(l.linesPerPage[i], Math.min(Math.floor(room / SHEET.line), cap), `本数が高さと合わない n=${n}`);
      assert.equal(l.linesPerPage[i], Math.min(linesIn(h), cap));
      // 引いた罫線は必ず枠に収まる
      assert.ok(l.linesPerPage[i] * SHEET.line <= room + 0.001, `枠からはみ出している n=${n}`);
    });
  }
  // 同じページの種類（その他あり／なし）なら、載る項目が少ないほど枠が高く、行数が増える（単調・逆転しない）
  for (const hasOther of [true, false]) {
    const byCount = [1, 2, 3, 4, 5, 6].map((c) => linesIn(boxHeight(c, hasOther)));
    for (let i = 1; i < byCount.length; i++) assert.ok(byCount[i] <= byCount[i - 1], `行数が増えている: ${byCount}`);
  }
  // 2項目のときに余白が無駄にならない（以前は14本しか引かず行間が15mmまで開いていた）
  assert.ok(sheetLayout(2).linesPerPage[0] >= 30, `少ない項目で余白が余っている: ${sheetLayout(2).linesPerPage}`);
});

test("最後の行に1つしか入らない枠は横いっぱいにする（P8-c）", () => {
  // 1項目だと左半分だけに枠ができて右が丸ごと空いていた。3・5・7でも最後の行の片側が空く
  for (let n = 1; n <= ITEM_LIBRARY.length; n++) {
    const l = sheetLayout(n);
    l.perPage.forEach((c, i) => {
      assert.equal(wideLast(c), c % 2 === 1, `n=${n} ページ${i + 1}（${c}個）の判定が違う`);
    });
    // 最後のページ以外は6項目（偶数）なので広げない。広げることがあるのは最後のページだけ（P9-e）
    l.perPage.slice(0, -1).forEach((c, i) => assert.equal(wideLast(c), false, `n=${n} の${i + 1}ページ目が奇数`));
  }
  // 横に広げても行の高さは変わらない＝罫線の本数も間隔も変わらない
  for (const n of [1, 3, 5, 7]) {
    assert.equal(sheetLayout(n).pitch, SHEET.line);
    assert.equal(sheetLayout(n).linesPerPage[0], sheetLayout(n + 1).linesPerPage[0], `n=${n} と ${n + 1} で本数が違う`);
  }

  // P9 から割り付けは `sheetRows`。面談（wide の項目なし）では「最後に1つ余った枠」だけが wide になる
  for (let n = 1; n <= ITEM_LIBRARY.length; n++) {
    const l = sheetLayout(n);
    paginate(ITEM_LIBRARY.slice(0, n), l.perPage).forEach((page, i) => {
      const rows = sheetRows(page, i === l.perPage.length - 1);
      const wides = rows.filter((r) => r.wide);
      assert.equal(wides.length, wideLast(page.length) ? 1 : 0, `n=${n} ページ${i + 1}: 広げる枠の数`);
      if (wides.length) assert.equal(rows[rows.length - 1].wide, true, `n=${n}: 広げるのは最後の枠だけ`);
    });
  }
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  assert.ok(src.includes('(r.wide ? " wide" : "")'), "行の判定どおりに広げる");
  const css = readFileSync("app/globals.css", "utf8");
  assert.ok(css.includes(".p-box.wide{grid-column:1 / -1}"), "横いっぱいにする指定がある");
});

test("自由形式は枠なしの罫線だけ・1枚固定（P8-b）", () => {
  // 書ける高さに同じ間隔で入るだけ引く（P8-f）
  const lines = freeSheetLines();
  assert.equal(lines, Math.floor(freeAreaH() / SHEET.line));
  assert.ok(lines >= 30, "自由形式なのに行が少ない");

  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  // 用紙の見た目だけを切り替える。1枚固定で、「その他」も出さない
  assert.ok(src.includes("free ? [[]] : paginate("), "自由形式は1枚固定");
  assert.ok(src.includes("other={!free &&"), "自由形式では「その他」を出さない");
  assert.ok(src.includes('className="p-free"'), "枠なしの罫線だけを描く");
  // 記入欄（日時・場所・参加者）は残す
  const paper = src.slice(src.indexOf("function Paper("), src.indexOf("export default function"));
  assert.ok(paper.indexOf('className="p-head"') < paper.indexOf("free ?"), "記入欄は自由形式でも出す");
});

test("自由形式の罫線は下の行（メモおこし）に重ならず、印字できる範囲に収まる（P8-f）", () => {
  const printable = SHEET.pageH - SHEET.margin * 2; // 279mm
  const lines = freeSheetLines();
  // 見出し・記入欄（実測 32.8→33mm）＋罫線の欄の上の余白＋罫線＋下の行（実測 5.84→6mm）が 279mm に収まる
  const used = PRINT.head + PRINT.freePad + lines * SHEET.line + PRINT.foot;
  assert.ok(used <= printable, `印字できる範囲を越える（${used}mm）`);
  // 最後の線と下の行のあいだに余裕がある（2mm 以上）
  assert.ok(printable - used >= 2, `下の行との余裕が少ない（${(printable - used).toFixed(2)}mm）`);
  // 1本足すと入らない＝入るだけ引いている
  assert.ok(used + SHEET.line > printable, "まだ1本入る");
  // 2026-09-17 P9-b: 記入欄を3行にして頭が 32.8→42.4mm になり 39→38本
  assert.equal(lines, 38);
  // 間隔は 6mm のまま
  assert.equal(SHEET.line, 6);
});

test("枠ありの罫線は全項目数で枠に収まり、縁ぎりぎりにならない（各ページで判定・P8-g）", () => {
  // 印刷の実測から決めた枠の高さに入るだけの本数。
  // 2026-09-12 P8-g: 1〜2=33／3〜4=15／5〜6=9／7〜8=6／9〜10=11+15／11〜12=11+9／13=8+9
  // 2026-09-17 P9-b（記入欄を3行に・頭 32.8→42.4mm）: 下のとおり。基本6項目（既定）は 9本のまま
  const want: Record<number, number[]> = {
    1: [31], 2: [31], 3: [14], 4: [14], 5: [9], 6: [9], 7: [10, 15], 8: [10, 15],
    9: [10, 15], 10: [10, 15], 11: [10, 10], 12: [10, 10], 13: [10, 12, 15],
  };
  // 2026-09-17 P9-f（2ページ以上の最後のページは15本まで）: 7〜8 の2ページ目と13 の3ページ目が 31→15
  // 2026-09-17 P9-e（1ページ6項目まで）: 7〜8 は 6→10+31、13 は 7+9→10+10+31。ほかは P9-b のまま
  // 印刷で実測した枠の並びの高さ（「その他」のあるページ／ないページ）と、線の太さどおりの1本目の位置
  // （2026-09-17 P9-b に測り直した。2026-09-12 は 210.53 / 240.36）
  const MEASURED = { gridWithOther: 200.93, gridNoOther: 230.77, boxTop: 8.35 };
  // 2ページ目以降（頭が題だけ・P9-g・2026-09-17 に測定）: 枠の並びの高さ その他あり 231.12 ／ なし 260.96
  const MEASURED_CONT = { gridWithOther: 231.12, gridNoOther: 260.96 };
  // 2026-09-17 P9-g（2ページ目以降は記入欄・押印欄なし）: 9〜10 の2枚目 14→15（上限）、11〜12 の2枚目 9→10、13 の2枚目 10→12
  for (let n = 1; n <= 13; n++) {
    const l = sheetLayout(n);
    assert.deepEqual(l.linesPerPage, want[n], `n=${n}`);
    l.perPage.forEach((c, i) => {
      const hasOther = i === l.perPage.length - 1;
      const lines = l.linesPerPage[i];
      // 割り付けの寸法で: 最後の線から枠の下端まで、下の余白＋枠線（1.45mm）以上あいている
      const h = boxHeight(c, hasOther, i > 0);
      assert.ok(h - PRINT.boxTop - lines * SHEET.line >= PRINT.boxBottom - 1e-9, `n=${n} p${i + 1}: 縁ぎりぎり`);
      // 実測の寸法でも: 枠に収まり、下の余白に罫線が入らない
      const rows = Math.ceil(c / SHEET.cols);
      const M = i > 0 ? MEASURED_CONT : MEASURED;
      const realH = ((hasOther ? M.gridWithOther : M.gridNoOther) - SHEET.gap * (rows - 1)) / rows;
      const clear = realH - MEASURED.boxTop - lines * SHEET.line;
      assert.ok(clear >= PRINT.boxBottom, `n=${n} p${i + 1}: 実測では最後の線から下端まで ${clear.toFixed(2)}mm`);
      // 1本足すと入らない＝入るだけ引いている（上限で止めた最後のページは、上限の本数ちょうど）
      const cap = lastPageCap(l.pages, i);
      if (cap !== undefined && lines === cap) assert.ok(linesIn(h) >= cap, `n=${n} p${i + 1}: 上限で止めたのに高さが足りない`);
      else assert.ok(h - PRINT.boxTop - (lines + 1) * SHEET.line < PRINT.boxBottom, `n=${n} p${i + 1}: まだ1本入る`);
    });
  }
  // 割り付けの見積もりは実測より小さくない（本数が多すぎる側に倒れない）
  assert.ok(PRINT.head >= 42.4 && PRINT.foot >= 5.84 && PRINT.boxTop >= 8.35);
});


test("自由形式は記録側の項目選択に触れない（P8-b）", () => {
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  // 切り替えは専用の鍵だけを書く。項目の選択（saveSettings）は呼ばない
  const toggleFree = src.slice(src.indexOf("const toggleFree ="), src.indexOf("const toggle ="));
  assert.ok(toggleFree.includes("saveSheetFree"), "自由形式は専用の鍵に持つ");
  assert.ok(!toggleFree.includes("saveSettings") && !toggleFree.includes("setSet"), "項目の選択を書き換えない");
  // 自由形式のあいだは項目を触らせない（押せなくする＋念のため関数側でも弾く）
  const toggle = src.slice(src.indexOf("const toggle ="), src.indexOf("const print ="));
  assert.ok(toggle.includes("if (free) return"), "自由形式のあいだは項目を変えない");
  assert.ok(src.includes("disabled={free}"), "項目のトグルを押せなくする");
  // 鍵の定義は lib/settings.ts にだけ置く
  const sheetMaker = src.match(/memo-okoshi:/g) ?? [];
  assert.deepEqual(sheetMaker, [], "画面側に鍵を書かない");
  const settings = readFileSync("lib/settings.ts", "utf8");
  assert.deepEqual(
    settings.match(/"memo-okoshi:[^"]+"/g) ?? [],
    ['"memo-okoshi:items"', '"memo-okoshi:sheet-free"', '"memo-okoshi:sheet-order"'],
    "鍵の定義は settings.ts だけに置く（項目の選択・自由形式・用紙の並び）"
  );
});

test("最後のページ以外は6項目で偶数・枠は途中で分割しない・「その他」は最後のページ（P7-h→P9-e）", () => {
  for (let n = 1; n <= ITEM_LIBRARY.length; n++) {
    const l = sheetLayout(n);
    l.perPage.forEach((c, i) => {
      assert.ok(c >= 1 && c <= SHEET.perPageMax, `n=${n} p${i + 1} が ${c}項目`);
      if (i < l.perPage.length - 1) assert.equal(c, SHEET.perPageMax, `n=${n}: 最後のページ以外に空きがある`);
    });
    // 罫線の計算で「その他」のぶん狭くするのは最後のページだけ
    l.perPage.forEach((c, i) => assert.equal(l.linesPerPage[i], Math.min(linesIn(boxHeight(c, i === l.perPage.length - 1, i > 0)), lastPageCap(l.pages, i) ?? Infinity)));
  }
  // 切り分けは割り振りに従い、順番も変わらない（3ページでも）
  const items = Array.from({ length: 13 }, (_, i) => i);
  const pages = paginate(items, sheetLayout(13).perPage);
  assert.deepEqual(pages.flat(), items, "どの枠も落ちず、順番も変わらない");
  assert.deepEqual(pages.map((p) => p.length), [6, 6, 1]);
  // 画面: 「その他」は最後のページだけに描く
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  assert.ok(src.includes("other={!free && i === pages.length - 1}"));
  // 0項目でも落ちない
  assert.deepEqual(paginate([], [0]), [[]]);
});

test("「その他」は用紙だけの欄で、記録の項目ライブラリには足さない（P7-g）", () => {
  // 記録側には「こぼれ枠」という同じ役割の受け皿が既にある
  assert.ok(!ITEM_LIBRARY.some((l) => l.id === OTHER_BOX.id || l.label === OTHER_BOX.label));
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  // 常に最後のページの最後に置く（項目のループの外）
  assert.ok(src.includes("other={!free && i === pages.length - 1}"), "「その他」は最後のページだけ");
  assert.ok(src.indexOf('className="p-box other"') > src.indexOf('className="p-grid"'), "項目の枠より後ろ");
  // トグルの一覧には出さない（常設なので選ぶ必要がない）
  const cfg = src.slice(src.indexOf('className="cfg"'), src.indexOf('className="pv"'));
  assert.ok(!cfg.includes("OTHER_BOX"), "「その他」をトグルの一覧に出さない");
  // プロンプトは選んだ項目からしか作らない＝用紙に「その他」と刷っても項目は増えない
  const prompt = readFileSync("lib/prompt.ts", "utf8");
  assert.ok(!prompt.includes("その他"), "プロンプトに「その他」を持ち込まない");
  assert.ok(prompt.includes("sections はこの id のみ"), "使ってよい id を明示している");
});

test("PDFの名前は日付ベース（P7-e）", () => {
  assert.equal(sheetFileName(new Date(2026, 8, 10)), "面談用紙_20260910");
  assert.equal(sheetFileName(new Date(2026, 11, 3)), "面談用紙_20261203");
});

/* ---------- 用紙と記録の一致・画面の作り ---------- */

test("用紙は記録と同じ項目ライブラリ・同じ選択を使う（P7-e）", () => {
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  assert.ok(src.includes('from "@/lib/items"'), "項目は記録と同じライブラリから取る");
  assert.ok(src.includes('from "@/lib/settings"'), "選択も記録と同じところから取る");
  assert.ok(!/ITEM_LIBRARY\s*=|const\s+SHEET_ITEMS/.test(src), "用紙だけの項目表を作らない");
  assert.ok(!src.includes("localStorage"), "保存は lib/settings.ts に集約する（画面側に鍵を書かない）");
  // 記録側も同じ鍵を使う
  const review = readFileSync("app/components/Review.tsx", "utf8");
  assert.ok(review.includes('from "@/lib/settings"'), "記録側も同じ鍵を共有する");
  const settings = readFileSync("lib/settings.ts", "utf8");
  assert.equal((settings.match(/memo-okoshi:items/g) ?? []).length, 1, "項目の鍵の定義は1か所");
});

test("用紙に氏名の注記を入れない／説明文を置かない（P7-e）", () => {
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // 面談中は正確な内容が必要。伏せるのは撮影後の工程なので、用紙では求めない
  for (const ng of ["イニシャル", "匿名", "伏せて"]) {
    assert.ok(!body.includes(ng), `用紙に ${ng} の注記がある`);
  }
  // 説明文を足さない（原則4）: 画面に出る文字はどれも見出し・ボタン・項目名で、**文にしない**。
  // 例外は、押せないときの理由を伝えるトーストだけ。
  const shown = (body.match(/>[^<>{}]*[ぁ-んァ-ヶ一-龥][^<>{}]*</g) ?? []).map((w) => w.slice(1, -1).trim());
  for (const w of shown) {
    assert.ok(!/(です|ます|ください|。)/.test(w), `説明文になっている → ${w}`);
    assert.ok(w.length <= 12, `画面の文字が長い → ${w}`);
  }
});

test("ホームが起点で、カードは4枚（面談／会議／用紙／使い方）・説明文なし（P7-e・P9）", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.ok(page.includes('useState<Mode>("home")'), "アプリの起点はホーム");
  assert.ok(page.includes('setMode("sheet")') && page.includes('setMode("intake")'), "ホームから両方へ行ける");

  const home = readFileSync("app/components/Home.tsx", "utf8");
  assert.equal((home.match(/className="hcard"/g) ?? []).length, 4, "カードは4枚（P9: 面談と会議の入口を分けた）");
  for (const t of ["面談メモを", "会議メモを", "用紙を印刷", "使い方"]) assert.ok(home.includes(t), `${t} のカードがある`);
  assert.equal((home.match(/<svg /g) ?? []).length, 4, "4枚ともSVGの絵を持つ");
  assert.ok(home.includes('onMemo("interview")') && home.includes('onMemo("meeting")'), "入口で記録の種類が決まる");
  assert.ok(home.includes("about={false}"), "使い方はカードにあるので、ヘッダーには二重に出さない");
  // タイトル以外の文字を置かない
  const body = home.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const words = (body.match(/>[^<>{}]*[ぁ-んァ-ヶ一-龥][^<>{}]*</g) ?? []).map((w) => w.slice(1, -1).trim());
  // 題の下の一文だけが例外（名前だけだと文字起こしツールと思われるため）。カードには説明文を置かない
  // （「面談メモを／おこす」は <br> で2行に割った1つの題）
  assert.deepEqual(
    words,
    ["メモおこし", "面談記録のための文字おこしツール", "面談メモを", "おこす", "会議メモを", "おこす", "用紙を印刷", "使い方"],
    `説明文がある → ${words.join(" / ")}`
  );
  const cards = home.slice(home.indexOf('className="cards"'));
  assert.ok(!/className="(ttl|hcard)"[^>]*>[^<]*[ぁ-ん]{10,}/.test(cards), "カードに説明文を足さない");

  // 狭い画面では横長の一列にする
  const css = readFileSync("app/globals.css", "utf8");
  const narrow = css.slice(css.indexOf("@media (max-width:620px)"));
  assert.ok(narrow.includes(".cards{grid-template-columns:1fr}"), "狭い画面では一列");
  assert.ok(narrow.includes("flex-direction:row"), "狭い画面では横長のカード");
});

test("作業中の内容が失われるときだけ確認を挟んでホームへ戻る（P7-e）", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const goHome = page.slice(page.indexOf("const goHome = ()"), page.indexOf("if (mode === \"home\")"));
  assert.ok(goHome.includes("pages.length === 0 && !rec"), "何も無ければ確認しない");
  assert.ok(goHome.includes('setMode("home")'), "何も無ければそのままホームへ");
  assert.ok(goHome.includes("ホームに戻りますか"), "失われるときは確認する");
  assert.ok(goHome.includes("すべて失われます"), "何が失われるかを書く");
  // 「最初から」は端末内のデータを捨ててホームへ戻る
  const restart = page.slice(page.indexOf("const restart = ()"), page.indexOf("const confirm = ("));
  assert.ok(restart.includes('setMode("home")'));
});

/* ---------- P7-g: ボタンの文言と、狭い画面の切り替え ---------- */

test("用紙のボタンは「印刷」（押すと印刷ダイアログが開くので実際の動作に合わせる・P7-g）", () => {
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(/className="dl"[\s\S]{0,120}印刷/.test(body), "ボタンの文言が「印刷」");
  assert.ok(!body.includes("PDFで保存"), "保存されると誤解させる文言が残っていない");
  assert.ok(body.includes("window.print()"), "実際に印刷ダイアログを開く");
});

test("狭い画面は項目と見本をタブで切り替える（確認画面と同じ作法・P7-g）", () => {
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  // 部品も閾値も増やさず、確認画面（元メモ／記録）と同じ .mobile-tabs を使う
  assert.ok(src.includes('className="mobile-tabs"'), "確認画面と同じ切り替えの部品を使う");
  assert.ok(src.includes('"cfg" + (tab === "items" ? " on" : "")'), "項目側の表示はタブに従う");
  assert.ok(src.includes('"pv" + (tab === "paper" ? " on" : "")'), "見本側の表示はタブに従う");
  // 選択そのものはタブと別に持つので、切り替えても状態が保たれる
  const setTabCalls = [...src.matchAll(/setTab\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(setTabCalls.sort(), ['"items"', '"paper"'], "タブの切り替えはタブだけを変える");
  const toggle = src.slice(src.indexOf("const toggle ="), src.indexOf("const print ="));
  assert.ok(!toggle.includes("setTab"), "選択を変えてもタブは動かさない");

  const css = readFileSync("app/globals.css", "utf8");
  // 閾値は確認画面と同じ 900px（760px の旧しきい値は残っていない）
  const narrow = css.slice(css.indexOf("@media (max-width:900px){", css.indexOf(".sheet-cfg")));
  assert.ok(narrow.includes(".cfg,.pv"), "狭い画面では両方を隠して .on のほうだけ出す");
  assert.ok(narrow.includes(".cfg.on{display:flex}") && narrow.includes(".pv.on{display:flex}"));
  // 用紙の節の中に、伏せる画面用の 760px のような別の閾値を持ち込まない
  const sheetBlock = css.slice(css.indexOf("/* ---------- 用紙を作る"), css.indexOf("/* ---------- 印刷（PDFで保存）"));
  const thresholds = [...sheetBlock.matchAll(/@media \(max-width:(\d+)px\)/g)].map((m) => m[1]);
  assert.deepEqual(thresholds, ["900"], "用紙だけ別の閾値を持たない（確認画面と同じ900px）");
});

test("「印刷」はタブの外側にあり、画面が低くても押せる（P6-kと同種の押し出しを作らない・P7-g）", () => {
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  // cfg-foot が .cfg / .pv のどちらの中にも入っていないこと
  const cfg = src.slice(src.indexOf('{"cfg" + (tab'), src.indexOf('{"pv" + (tab'));
  const pv = src.slice(src.indexOf('{"pv" + (tab'), src.indexOf('className="cfg-foot"'));
  assert.ok(!cfg.includes("cfg-foot") && !pv.includes("cfg-foot"), "「印刷」がタブの中に入っている");
  assert.ok(src.indexOf('className="cfg-foot"') > src.indexOf('{"pv" + (tab'), "「印刷」は両方の後ろ＝外側にある");

  const css = readFileSync("app/globals.css", "utf8");
  const wide = css.slice(css.indexOf(".sheet-cfg{"), css.indexOf(".pv{"));
  assert.ok(wide.includes("grid-template-rows:1fr auto"), "はみ出すのは中身側で、足元の帯は残る");
  // 中身が長いときにスクロールするのは枠の中（帯を押し出さない）
  assert.ok(/\.cfg\{[^}]*overflow:auto/.test(css), "項目の一覧は枠の中でスクロールする");
  assert.ok(/\.pv\{[^}]*overflow:auto/.test(css), "見本は枠の中でスクロールする");
});

/* ---------- P9-f: 2ページ以上の最後のページは罫線15本まで ---------- */

test("最後のページの罫線の上限は2ページ以上のときだけ（1枚なら紙いっぱい・P9-f）", () => {
  assert.equal(SHEET.lastPageMaxLines, 15);
  assert.equal(lastPageCap(1, 0), undefined, "1枚で収まるときは上限をかけない");
  assert.equal(lastPageCap(2, 0), undefined, "最後のページ以外はかけない");
  assert.equal(lastPageCap(2, 1), 15);
  assert.equal(lastPageCap(3, 1), undefined);
  assert.equal(lastPageCap(3, 2), 15);
  // 1〜2項目が1枚のときは現行どおり31本、7項目の2ページ目と13項目の3ページ目は15本
  assert.deepEqual([1, 2].map((n) => sheetLayout(n).linesPerPage), [[31], [31]]);
  assert.deepEqual(sheetLayout(7).linesPerPage, [10, 15]);
  assert.deepEqual(sheetLayout(13).linesPerPage, [10, 12, 15]); // P9-g で2ページ目 10→12
  // 15本以下の最後のページはそのまま（11〜12項目の10本）。9〜10項目は P9-g で入る本数が17本になり上限15本で止まる
  assert.deepEqual([9, 10, 11, 12].map((n) => sheetLayout(n).linesPerPage.at(-1)), [15, 15, 10, 10]);
  // 画面の割り付け（sheetRows）も同じ本数で、止めた枠だけ capped
  for (let n = 1; n <= ITEM_LIBRARY.length; n++) {
    const l = sheetLayout(n);
    paginate(ITEM_LIBRARY.slice(0, n), l.perPage).forEach((page, i) => {
      const last = i === l.perPage.length - 1;
      const rows = sheetRows(page, last, lastPageCap(l.pages, i), i > 0);
      assert.ok(rows.every((r) => r.lines === l.linesPerPage[i]), `n=${n} p${i + 1}`);
      assert.equal(rows.some((r) => r.capped), l.pages > 1 && last && linesIn(boxHeight(page.length, true, i > 0)) > 15, `n=${n} p${i + 1}: capped`);
    });
  }
  // 「その他」は3本のまま・自由形式は変わらない（38本）
  assert.equal(SHEET.otherLines, 3);
  assert.equal(freeSheetLines(), 38);
});

test("止めた枠は引き伸ばさず罫線の高さで閉じ、「その他」が直後に続いて下は余白。A4 に収まる（P9-f）", () => {
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  assert.ok(src.includes("cap={free ? undefined : lastPageCap(pages.length, i)}"), "上限は枠ありの用紙のページごとに渡す（自由形式には渡さない）");
  assert.ok(src.includes("const rows = sheetRows(items, Boolean(other), cap, continued)") && src.includes('"p-grid" + (capped ? " capped" : "")'));
  const css = readFileSync("app/globals.css", "utf8");
  const screen = css.slice(css.indexOf("/* ---------- 用紙を作る"), css.indexOf("/* ---------- 印刷（PDFで保存）"));
  assert.ok(screen.includes(".p-grid.capped{flex:0 0 auto;grid-auto-rows:auto}"), "止めた枠は内容の高さ（引き伸ばさない）");
  assert.ok(screen.includes(".p-grid.capped + .p-box.other{margin-bottom:auto}"), "「その他」は直後・その下が余白（下の行は紙の下端）");
  const print = css.slice(css.indexOf("/* ---------- 印刷（PDFで保存）"));
  assert.ok(!/\.print-sheet \.p-grid[^{]*\{[^}]*(flex|grid-auto-rows)/.test(print), "印刷で上書きしない（画面と同じ規則が効く）");
  // A4: 頭＋15本の枠（1行）＋隙間＋その他＋下の行 ≤ 279mm（計算）
  const box15 = PRINT.boxTop + SHEET.lastPageMaxLines * SHEET.line + PRINT.boxBottom;
  const other = PRINT.boxTop + SHEET.otherLines * SHEET.line + PRINT.boxBottom + SHEET.gap;
  assert.ok(PRINT.head + box15 + other + PRINT.foot <= SHEET.pageH - SHEET.margin * 2);
  // 印刷の実測（2026-09-17・192mm 幅に印刷の規則を当てて測った値）: 止めた枠は 99.42mm で 15本、最後の線から枠の下端まで 1.33mm。
  // これは「その他」の枠（内容の高さで閉じる・以前から 1.33mm）と同じ閉じ方で、最後の線は下の余白（1.2mm＋枠線）の上端に接し、
  // 余白の中には入らない（割り付けの計算では下の余白ちょうど 1.45mm。細い線が実際より薄く描かれるぶん実測は小さく出る）。
  // 「その他」は枠の 2.4mm 下、その下 102.71mm が余白で、下の行は紙の下端。ページは 279mm に収まる
  const MEASURED = { box15H: 99.42, box15Clear: 1.33, otherClear: 1.33, otherGap: 2.4, paperH: 279, footFromBottom: 0 };
  assert.equal(MEASURED.box15Clear, MEASURED.otherClear, "止めた枠は「その他」と同じ閉じ方");
  assert.ok(Math.abs(box15 - PRINT.boxTop - SHEET.lastPageMaxLines * SHEET.line - PRINT.boxBottom) < 1e-9, "計算上は下の余白ちょうど");
  assert.ok(MEASURED.box15H < box15 && MEASURED.paperH <= SHEET.pageH - SHEET.margin * 2 && MEASURED.footFromBottom === 0);
});

/* ---------- P9-g: 2ページ目以降は記入欄・押印欄なし・ページ番号 ---------- */

test("2ページ目以降は題だけ（記入欄・押印欄を出さない）。ページ番号は2ページ以上のときだけ全ページに「n / 全体」（P9-g）", () => {
  assert.equal(pageLabel(0, 1), undefined, "1枚のときは入れない");
  assert.deepEqual([0, 1].map((i) => pageLabel(i, 2)), ["1 / 2", "2 / 2"]);
  assert.deepEqual([0, 1, 2].map((i) => pageLabel(i, 3)), ["1 / 3", "2 / 3", "3 / 3"]);
  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  const paper = src.slice(src.indexOf("function Paper("), src.indexOf("export default function"));
  // 2ページ目以降の頭は題だけ。記入欄・押印欄は1ページ目の分岐の中にだけある
  const cont = paper.slice(paper.indexOf("{continued ? ("), paper.indexOf(") : (", paper.indexOf("{continued ? (")));
  assert.ok(cont.includes('className="p-head cont"') && cont.includes('className="p-title"'));
  assert.ok(!/p-fields|p-stamp|p-name|f-date|f-place|f-people/.test(cont), "2ページ目以降に記入欄・押印欄がある");
  assert.ok(paper.includes("const continued = index > 0;") && paper.includes("const pageNo = pageLabel(index, pageCount);"));
  assert.ok(paper.includes('{pageNo && <span className="p-no">{pageNo}</span>}'), "ページ番号は下の行の中");
  assert.ok(paper.indexOf('className="p-no"') > paper.indexOf('className="p-foot"'));
  // ページの番号と総数は用紙の並びから渡す（自由形式は1枚固定なので「1ページ目・全1ページ」＝頭あり・番号なし）
  assert.ok(src.includes("index={i}") && src.includes("pageCount={pages.length}") && src.includes("free ? [[]] : paginate("));
  // 頭の高さ: 2ページ目以降は実測 12.2mm（1ページ目 42.4mm）。割り付けはページごとに見る
  assert.ok(PRINT.headCont >= 12.2 && PRINT.head >= 42.4);
  assert.ok(boxHeight(6, false, true) - boxHeight(6, false) > 9.9, "2ページ目以降は枠が高くなる（30mm を3行で分ける）");
  // CSS: 題の下の余白を詰める・ページ番号は下の行の高さを取らない（重ねて置く）。印刷にも同じ規則
  const css = readFileSync("app/globals.css", "utf8");
  const screen = css.slice(css.indexOf("/* ---------- 用紙を作る"), css.indexOf("/* ---------- 印刷（PDFで保存）"));
  const print = css.slice(css.indexOf("/* ---------- 印刷（PDFで保存）"));
  assert.ok(screen.includes(".p-head.cont .p-title{margin-bottom:0}") && print.includes(".print-sheet .p-head.cont .p-title{margin-bottom:0}"));
  assert.ok(screen.includes(".p-foot{position:relative}") && /\.p-foot \.p-no\{position:absolute;[^}]*justify-content:center/.test(screen), "中央・高さを取らない");
  assert.ok(print.includes(".print-sheet .p-foot .p-no{top:0.8mm;font-size:7pt;"));
});

test("1〜13項目の罫線（P9-g 後）: 1ページ目は変わらず、2ページ目以降は記入欄のぶん増える。各ページ A4 に収まる", () => {
  const want: Record<number, number[]> = {
    1: [31], 2: [31], 3: [14], 4: [14], 5: [9], 6: [9], 7: [10, 15], 8: [10, 15],
    9: [10, 15], 10: [10, 15], 11: [10, 10], 12: [10, 10], 13: [10, 12, 15],
  };
  for (let n = 1; n <= 13; n++) {
    const l = sheetLayout(n);
    assert.deepEqual(l.linesPerPage, want[n], `n=${n}`);
    l.perPage.forEach((c, i) => {
      // 計算上: 頭（1ページ目 42.5／以降 12.5）＋枠の並び＋（最後のページ）その他＋下の行 ≤ 279mm
      const last = i === l.perPage.length - 1;
      const rows = Math.ceil(c / SHEET.cols);
      const box = PRINT.boxTop + l.linesPerPage[i] * SHEET.line + PRINT.boxBottom;
      const used = (i > 0 ? PRINT.headCont : PRINT.head) + rows * box + SHEET.gap * (rows - 1) +
        (last ? PRINT.boxTop + SHEET.otherLines * SHEET.line + PRINT.boxBottom + SHEET.gap : 0) + PRINT.foot;
      assert.ok(used <= SHEET.pageH - SHEET.margin * 2 + 1e-9, `n=${n} p${i + 1}: A4 を越える（${used.toFixed(1)}mm）`);
    });
  }
  // 自由形式・会議は1枚なので変わらない
  assert.equal(freeSheetLines(), 38);
});
