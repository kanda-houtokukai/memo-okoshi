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
import { paginate, sheetFileName, sheetLayout, SHEET } from "../lib/sheet.ts";

/* ---------- 項目ライブラリの分類（2026-09-10に見直し） ---------- */

test("項目の分類は基本6＋追加7で、既定オンは8項目（P7-e）", () => {
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
  // 所感と申し送りは追加項目へ移したが、使う場面が多いので既定はオンのまま
  const on = ITEM_LIBRARY.filter((l) => l.defaultOn).map((l) => l.id);
  assert.deepEqual(on, ["gaiyou", "honnin", "kazoku", "kadai", "kenko", "seikatsu", "shokan", "moushiokuri"]);
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
  assert.equal(selectedIds(defaultSettings(ITEM_LIBRARY)).length, 8);
  // 知らない id は捨て、増えた id は末尾に足す
  const s2 = mergeSettings({ enabled: ["gaiyou", "no_such_item"], order: ["no_such_item", "gaiyou"] }, ITEM_LIBRARY);
  assert.deepEqual(selectedIds(s2), ["gaiyou"]);
  assert.equal(s2.order.length, ITEM_LIBRARY.length);
});

/* ---------- 用紙の割り付け ---------- */

test("用紙は選んだ項目が増えても罫線を減らして1枚に収める（P7-e）", () => {
  // 既定の8項目・全部の13項目、どちらも1枚
  assert.equal(sheetLayout(8).pages, 1);
  assert.equal(sheetLayout(ITEM_LIBRARY.length).pages, 1, "全項目オンでも1枚に収まる");
  // 項目が増えるほど罫線は減る（単調）
  const lines = [2, 4, 6, 8, 10, 12, 13].map((n) => sheetLayout(n).lines);
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i] <= lines[i - 1], `罫線が増えている: ${lines}`);
  // 下限を割らない・上限を超えない
  for (let n = 1; n <= 30; n++) {
    const l = sheetLayout(n);
    assert.ok(l.lines >= SHEET.minLines, `罫線が下限を割った n=${n}`);
    assert.ok(l.lines <= SHEET.maxLines, `罫線が上限を超えた n=${n}`);
  }
  // 下限を割るところまで増やしたら2枚目に送る（枠は分割しない）
  const many = sheetLayout(30);
  assert.ok(many.pages >= 2);
  assert.equal(many.lines, SHEET.minLines);
  assert.equal(many.perPage % SHEET.cols, 0, "1枚に載る枠の数は2列で割り切れる");
});

test("2枚目に送るときも枠は途中で分割しない（P7-e）", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  const l = sheetLayout(items.length);
  const pages = paginate(items, l.perPage);
  assert.equal(pages.length, l.pages);
  assert.deepEqual(pages.flat(), items, "どの枠も落ちず、順番も変わらない");
  assert.ok(pages.every((p) => p.length <= l.perPage));
  // 0項目でも落ちない
  assert.deepEqual(paginate([], 0), [[]]);
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
  assert.ok(!src.includes('localStorage'), "保存は lib/settings.ts に集約する（鍵を増やさない）");
  // 記録側も同じ鍵を使う
  const review = readFileSync("app/components/Review.tsx", "utf8");
  assert.ok(review.includes('from "@/lib/settings"'), "記録側も同じ鍵を共有する");
  const settings = readFileSync("lib/settings.ts", "utf8");
  assert.equal((settings.match(/memo-okoshi:items/g) ?? []).length, 1, "鍵の定義は1か所");
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
  assert.deepEqual(words, ["メモおこし", "メモをおこす", "面談用紙を印刷", "使い方"], `説明文がある → ${words.join(" / ")}`);

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
