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
import { boxHeight, freeSheetLines, OTHER_BOX, paginate, sheetFileName, sheetLayout, SHEET, wideLast } from "../lib/sheet.ts";

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

test("用紙は8項目までが1枚・9項目以上は2枚（書く余裕を優先・P7-g）", () => {
  for (let n = 1; n <= SHEET.onePageMax; n++) assert.equal(sheetLayout(n).pages, 1, `n=${n} は1枚`);
  for (let n = SHEET.onePageMax + 1; n <= ITEM_LIBRARY.length; n++) {
    assert.equal(sheetLayout(n).pages, 2, `n=${n} は2枚`);
  }
  // 2枚に分かれると枠が大きくなる＝罫線が増える（8項目→9項目でむしろ余裕が出る）
  assert.ok(
    sheetLayout(9).linesPerPage[0] > sheetLayout(8).linesPerPage[0],
    `2枚に分けたのに余裕が増えていない: 8→${sheetLayout(8).linesPerPage} / 9→${sheetLayout(9).linesPerPage}`
  );
  for (let n = 1; n <= ITEM_LIBRARY.length; n++) {
    const l = sheetLayout(n);
    assert.equal(l.perPage.reduce((a, b) => a + b, 0), n, `枠が落ちている n=${n}`);
    assert.equal(l.perPage.length, l.pages);
    assert.equal(l.linesPerPage.length, l.pages);
    for (const lines of l.linesPerPage) assert.ok(lines >= SHEET.minLines, `罫線が下限を割った n=${n}`);
  }
  assert.equal(sheetLayout(SHEET.onePageMax).pages, 1, "8項目＋その他でも1枚");
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
      const inner = boxHeight(c, i === l.perPage.length - 1) - SHEET.boxHead - SHEET.boxPad;
      assert.equal(l.linesPerPage[i], Math.floor(inner / SHEET.line), `本数が高さと合わない n=${n}`);
      // 引いた罫線は必ず枠に収まる
      assert.ok(l.linesPerPage[i] * SHEET.line <= inner + 0.001, `枠からはみ出している n=${n}`);
    });
  }
  // 項目が少ないほど枠が高く、行数が増える（単調・逆転しない）
  const oneP = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => sheetLayout(n).linesPerPage[0]);
  for (let i = 1; i < oneP.length; i++) assert.ok(oneP[i] <= oneP[i - 1], `行数が増えている: ${oneP}`);
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
    // 1ページ目は必ず偶数なので広げない（P7-h の割り振りとかみ合っていること）
    if (l.pages === 2) assert.equal(wideLast(l.perPage[0]), false, `n=${n} の1ページ目が奇数`);
  }
  // 横に広げても行の高さは変わらない＝罫線の本数も間隔も変わらない
  for (const n of [1, 3, 5, 7]) {
    assert.equal(sheetLayout(n).pitch, SHEET.line);
    assert.equal(sheetLayout(n).linesPerPage[0], sheetLayout(n + 1).linesPerPage[0], `n=${n} と ${n + 1} で本数が違う`);
  }

  const src = readFileSync("app/components/SheetMaker.tsx", "utf8");
  assert.ok(src.includes("wideLast(items.length) && i === items.length - 1"), "最後の枠だけ広げる");
  const css = readFileSync("app/globals.css", "utf8");
  assert.ok(css.includes(".p-box.wide{grid-column:1 / -1}"), "横いっぱいにする指定がある");
});

test("自由形式は枠なしの罫線だけ・1枚固定（P8-b）", () => {
  // 紙面いっぱいに同じ間隔で引く
  const lines = freeSheetLines();
  const usable = SHEET.pageH - SHEET.margin * 2 - SHEET.headH;
  assert.equal(lines, Math.floor(usable / SHEET.line));
  assert.ok(lines * SHEET.line <= usable + 0.001, "紙からはみ出している");
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

test("2枚のとき1ページ目は偶数個・枠は途中で分割しない（P7-h）", () => {
  // 2列組なので、1ページ目が奇数だと最後の行が片側だけ埋まって空白ができる
  for (let n = SHEET.onePageMax + 1; n <= ITEM_LIBRARY.length; n++) {
    const l = sheetLayout(n);
    assert.equal(l.pages, 2);
    assert.equal(l.perPage[0] % SHEET.cols, 0, `1ページ目が奇数 n=${n} → ${l.perPage.join("+")}`);
    assert.ok(l.perPage[0] <= SHEET.onePageMax, `1ページ目が上限を超えた n=${n}`);
    assert.ok(l.perPage[1] >= 1, `2ページ目が空 n=${n}`);
    assert.ok(l.perPage[1] <= SHEET.onePageMax, `2ページ目が上限を超えた n=${n}`);
    assert.equal(l.perPage[0] + l.perPage[1], n, `枠が落ちている n=${n}`);
  }
  // 設計側が示した想定どおりの割り振り
  assert.deepEqual(sheetLayout(9).perPage, [6, 3]);
  assert.deepEqual(sheetLayout(11).perPage, [6, 5]);
  // 切り分けは割り振りに従い、順番も変わらない
  const items = Array.from({ length: 13 }, (_, i) => i);
  const pages = paginate(items, sheetLayout(13).perPage);
  assert.deepEqual(pages.flat(), items, "どの枠も落ちず、順番も変わらない");
  assert.deepEqual(pages.map((p) => p.length), sheetLayout(13).perPage);
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

test("ホームが起点で、カードは3枚・説明文なし（P7-e）", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.ok(page.includes('useState<Mode>("home")'), "アプリの起点はホーム");
  assert.ok(page.includes('setMode("sheet")') && page.includes('setMode("intake")'), "ホームから両方へ行ける");

  const home = readFileSync("app/components/Home.tsx", "utf8");
  assert.equal((home.match(/className="hcard"/g) ?? []).length, 3, "カードは3枚");
  for (const t of ["メモをおこす", "面談用紙を印刷", "使い方"]) assert.ok(home.includes(t), `${t} のカードがある`);
  assert.equal((home.match(/<svg /g) ?? []).length, 3, "3枚ともSVGの絵を持つ");
  assert.ok(home.includes("about={false}"), "使い方はカードにあるので、ヘッダーには二重に出さない");
  // タイトル以外の文字を置かない
  const body = home.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const words = (body.match(/>[^<>{}]*[ぁ-んァ-ヶ一-龥][^<>{}]*</g) ?? []).map((w) => w.slice(1, -1).trim());
  // 題の下の一文だけが例外（名前だけだと文字起こしツールと思われるため）。カードには説明文を置かない
  assert.deepEqual(
    words,
    ["メモおこし", "面談記録のための文字おこしツール", "メモをおこす", "面談用紙を印刷", "使い方"],
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
