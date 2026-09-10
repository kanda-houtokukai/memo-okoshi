// 使い方ページ（/about）についての機械テスト。
//
// /about は合言葉ゲートの外に出しているので、**載ってよい文面は承認済みのものだけ**。
// このファイルが承認済みの文面（ゴールデン）を控えていて、1文字でも変わると落ちる。
// 文面を変えるときは、設計側の承認を取ってから lib/about-copy.ts とここを一緒に直すこと。
// （2026-09-11に手順書へ作り直した。体裁の正本は docs/mock/tsukaikata-mock-v2.html で凍結してあり、
//   文面が食い違ったら実装が正しい。）
//
// あわせて次を検査する:
//   - 文の作法（見出しは文にしない／本文はすべて述語で終える）
//   - 章の順序（目次のとおりに並んでいること）
//   - 画面写真12枚がすべて参照され、配信の場所に実在すること
//   - ゲートの外に出す道が増えていないこと

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { ABOUT } from "../lib/about-copy.ts";

/* ---------------- ゴールデン（2026-09-11・設計側の承認どおり） ---------------- */

const GOLDEN = {
  pageTitle: "メモおこし — 使い方",
  h1: "使い方",
  lead: "面談中に書いたメモを撮ると、記録の形に整います。清書にかかっていた時間を減らせます。ここでは印刷から転記までの流れを説明します。",
  note: "画面の例はすべて架空のものです。",
  toc: ["用紙を印刷する", "1 取り込み", "2 伏せる", "3 変換", "4 確認", "5 出力", "辞書", "注意事項", "困ったとき"],
  leads: {
    prep: "項目の枠に沿って書くと、読み取りが安定します。手元のメモをそのまま撮っても使えますが、用紙を使うほうが振り分けの精度が上がります。",
    take: "書いたメモをアプリに入れます。",
    mask: "氏名などを隠します。隠したあとの画像だけが送られます。",
    conv: "読み取りと振り分けをします。30秒ほどかかります。",
    check: "元のメモと見比べて直します。一番大事な工程です。",
    out: "普段の記録システムに移します。",
    dict: "事業所で使う言葉を登録すると、読み取りが良くなります。",
  } as Record<string, string>,
  /** 各章の手順の見出し（順番も含めて固定） */
  steps: {
    prep: ["ホームで「面談用紙を印刷」を選ぶ", "項目を選ぶ", "「印刷」を押す"],
    take: ["「＋」からメモを選ぶ", "順番を整える", "「次へ」を押す"],
    mask: ["道具を選ぶ", "拡大して細かいところを塗る", "「次へ」を押して確認する"],
    conv: ["待つ"],
    check: ["印の付いた箇所を直す", "文章を直す", "拾いきれなかった内容を移す", "AIの気づきを読む", "「完成」を押す"],
    out: ["コピーして貼り付ける", "ファイルで保存する", "次の記録を始める"],
    dict: ["言葉を登録する", "他の端末に移す"],
  } as Record<string, string[]>,
  /** 設計側が指示した書き換え（モックより優先） */
  changed: {
    prepStep2: "対象者や面談の種類に応じて項目を組み替えます。",
    basic: "面談で扱う頻度が高い項目です。最初はすべて入っています。",
    extra: "就労や金銭管理など、必要に応じて足します。",
    pc: "パソコンでは「＋」からファイル選択が直接開きます。画面に画像をドラッグしても入ります。",
  },
  cautions: [
    ["記録の下書き", "そのまま記録にはできません。内容を確かめて、必要なら書き直してから仕上げてください。記録の責任は書いた人にあります。"],
    ["伏せ忘れの確認", "赤い印は保険であり、完全ではありません。送る前に隠し忘れがないか見てください。"],
    ["AIの気づき", "支援の方針を示すものではありません。見落としを探すきっかけとして使ってください。記録には入りません。"],
    ["データの保存", "内容は保存されません。途中で閉じたり戻ったりすると、それまでの作業は失われます。"],
    ["辞書の登録", "よく使う言葉を登録すると読み取りが良くなります。ただし人の名前は登録しないでください。"],
    ["用紙の管理", "印刷した用紙には氏名などをそのまま書きます。保管や廃棄は事業所の規程に従ってください。"],
  ],
  troubles: [
    ["読み取りが合っていない", "元のメモと見比べて直してください。よく使う言葉は辞書に登録すると次から良くなります。"],
    ["「本日の利用上限に達しました」と出る", "1日に使える回数を超えています。翌日また試してください。"],
    ["「いま混み合っています」と出る", "少し待ってからもう一度試してください。メモと伏せた箇所は残っています。"],
    ["作業の途中で内容が消えた", "このアプリは内容を保存しません。画面を閉じたり戻ったりすると最初からになります。"],
    ["項目を足したい", "確認画面の「項目」から足せます。足したあとに変換をやり直すと、その項目にも内容が入ります。直した内容はそのまま残ります。"],
  ],
  footer: "試験運用中です。うまくいかない点や気づいたことがあれば教えてください。",
};

const chapterById = (id: string) => ABOUT.chapters.find((c) => c.id === id)!;

test("使い方ページの文面が承認済みのものと一致する", () => {
  assert.equal(ABOUT.pageTitle, GOLDEN.pageTitle);
  assert.equal(ABOUT.h1, GOLDEN.h1);
  assert.equal(ABOUT.lead, GOLDEN.lead);
  assert.equal(ABOUT.note, GOLDEN.note);
  assert.deepEqual(ABOUT.toc.map((t) => t.label), GOLDEN.toc);
  for (const [id, lead] of Object.entries(GOLDEN.leads)) {
    assert.equal(chapterById(id).lead, lead, `章「${id}」の導入`);
  }
  for (const [id, hs] of Object.entries(GOLDEN.steps)) {
    assert.deepEqual(chapterById(id).steps.map((s) => s.h), hs, `章「${id}」の手順`);
  }
  assert.deepEqual(ABOUT.cautions.map((c) => [c.b, c.s]), GOLDEN.cautions);
  assert.deepEqual(ABOUT.troubles.map((t) => [t.b, t.s]), GOLDEN.troubles);
  assert.equal(ABOUT.footer, GOLDEN.footer);
});

test("設計側が指示した書き換えが入っている（モックより優先）", () => {
  const prep2 = chapterById("prep").steps[1];
  assert.deepEqual(prep2.ps, [GOLDEN.changed.prepStep2]);
  assert.equal(prep2.pairs?.find((p) => p.lb === "基本")?.tx, GOLDEN.changed.basic);
  assert.equal(prep2.pairs?.find((p) => p.lb === "追加項目")?.tx, GOLDEN.changed.extra);
  assert.equal(chapterById("take").steps[0].tip, GOLDEN.changed.pc);
  // 冒頭の断りは、最初の画面写真より前（＝章より前の lead）にある
  const page = readFileSync("app/about/page.tsx", "utf8");
  assert.ok(page.indexOf("ABOUT.note") < page.indexOf("ABOUT.chapters"), "断りが最初の写真より後ろにある");
});

test("章の順序は目次のとおり", () => {
  // 目次が順序の正本。手順のある7章 → 注意事項 → 困ったとき
  assert.deepEqual(
    ABOUT.toc.map((t) => t.id),
    ["prep", "take", "mask", "conv", "check", "out", "dict", "caution", "trouble"]
  );
  assert.deepEqual(ABOUT.chapters.map((c) => c.id), ABOUT.toc.slice(0, 7).map((t) => t.id));
  // ページも同じ順に並べている（手順の7章をまとめて出し、最後に注意事項・困ったとき）
  const page = readFileSync("app/about/page.tsx", "utf8");
  const order = [...page.matchAll(/ABOUT\.chapters\.map|<section[^>]*id="(\w+)"/g)].map((m) => m[1] ?? "chapters");
  assert.deepEqual(order, ["chapters", "caution", "trouble"]);
  assert.ok(page.indexOf("ABOUT.toc[7]") < page.indexOf("ABOUT.toc[8]"));
});

test("画面写真は12枚すべてが参照され、配信の場所に実在する", () => {
  const shots = ABOUT.chapters.flatMap((c) => c.steps.flatMap((s) => s.shots ?? []));
  const files = shots.map((s) => s.src.replace("/help/", ""));
  const onDisk = readdirSync("public/help").filter((f) => f.endsWith(".png")).sort();
  assert.equal(onDisk.length, 12, "配信する画像は12枚");
  assert.deepEqual(files.slice().sort(), onDisk, "参照と配信の中身が食い違っている");
  assert.equal(new Set(files).size, files.length, "同じ画像を2か所で使っている");
  // 原本（docs/assets/help）と配信（public/help）が同じ顔ぶれであること
  const origin = readdirSync("docs/assets/help").filter((f) => f.endsWith(".png")).sort();
  assert.deepEqual(origin, onDisk, "原本と配信の顔ぶれが違う");
  for (const f of onDisk) assert.ok(existsSync("public/help/" + f));
  // 説明（alt）を必ず持つ。読み上げと、画像が出ないときのために
  for (const s of shots) assert.ok(s.alt.length >= 4, `alt が短い → ${s.src}`);

  // 重くならないよう、遅延読み込みと寸法指定をする
  const page = readFileSync("app/about/page.tsx", "utf8");
  assert.ok(page.includes('loading="lazy"'), "遅延読み込みにする");
  assert.ok(page.includes("decoding=") && page.includes("width={s.w}") && page.includes("height={s.h}"), "寸法を指定する");
  // 寸法は実物と一致していること（違うと読み込み時に文章の位置がずれる）
  for (const sh of shots) {
    const png = readFileSync("public/help/" + sh.src.replace("/help/", ""));
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    assert.equal(sh.w, w, `幅が実物と違う → ${sh.src}`);
    assert.equal(sh.h, h, `高さが実物と違う → ${sh.src}`);
  }
  // 押すと原寸が別タブで開く（拡大の代わり。部品もJSも増やさない）
  assert.ok(page.includes('target="_blank"') && page.includes('rel="noopener"'));
});

test("見出しは文にしない（章は短く・手順は動詞句）", () => {
  const chapterHeads = [ABOUT.h1, ...ABOUT.toc.map((t) => t.label), ...ABOUT.chapters.map((c) => c.h)];
  for (const h of chapterHeads) {
    assert.ok(!h.endsWith("。"), `章の見出しに句点がある → ${h}`);
    assert.ok(!/(ます|ました|ください|です|でした)$/.test(h), `章の見出しが文になっている → ${h}`);
    assert.ok(h.length <= 12, `章の見出しが長い → ${h}`);
  }
  // 手順の見出しは動詞句にする（手順書なので動作で見出す）。ただし文にはしない
  const stepHeads = ABOUT.chapters.flatMap((c) => c.steps.map((s) => s.h));
  for (const h of stepHeads) {
    assert.ok(!h.endsWith("。"), `手順の見出しに句点がある → ${h}`);
    assert.ok(!/(ます|ました|ください|です|でした)$/.test(h), `手順の見出しが文になっている → ${h}`);
    assert.ok(h.length <= 20, `手順の見出しが長い → ${h}`);
  }
  // 注意事項・困ったときの小見出しも文にしない
  for (const b of [...ABOUT.cautions.map((c) => c.b), ...ABOUT.troubles.map((t) => t.b)]) {
    assert.ok(!b.endsWith("。"), `小見出しに句点がある → ${b}`);
    assert.ok(b.length <= 22, `小見出しが長い → ${b}`);
  }
});

test("本文はすべて述語で終える（体言止めを使わない）", () => {
  const bodies = [
    ABOUT.lead,
    ABOUT.note,
    ...ABOUT.chapters.flatMap((c) => [
      ...(c.lead ? [c.lead] : []),
      ...c.steps.flatMap((s) => [
        ...(s.ps ?? []),
        ...(s.pairs ?? []).map((p) => p.tx),
        ...(s.tip ? [s.tip] : []),
      ]),
    ]),
    ...ABOUT.cautions.map((c) => c.s),
    ...ABOUT.troubles.map((t) => t.s),
    ABOUT.footer,
  ];
  for (const b of bodies) {
    assert.ok(b.endsWith("。"), `本文が句点で終わっていない → ${b}`);
    for (const sentence of b.split("。").filter(Boolean)) {
      assert.ok(
        /(ます|ません|ました|ください|です|でした)$/.test(sentence),
        `述語で終わっていない文がある → ${sentence}。`
      );
      assert.ok(sentence.length <= 60, `一文が長い → ${sentence}。`);
    }
  }
});

test("使い方ページの器は文字を持たず、文面は正本から読む", () => {
  const src = readFileSync("app/about/page.tsx", "utf8");
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const jp = body.match(/[ぁ-んァ-ヶ一-龥々ー、。「」・（）]{4,}/g) ?? [];
  assert.deepEqual(jp, [], `page.tsx に直接書かれた文面がある → ${jp.join(" / ")}`);
  assert.ok(src.includes('from "@/lib/about-copy"'), "文面は lib/about-copy.ts から読む");
});

test("合言葉ゲートの外に出す道は、決めたものだけ（前方一致にしない）", () => {
  const src = readFileSync("middleware.ts", "utf8");
  const block = src.slice(src.indexOf("const PUBLIC"), src.indexOf("]);", src.indexOf("const PUBLIC")));
  const paths = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  // 使い方ページ・マニフェスト・アイコンだけ。いずれも静的で秘密を含まない。
  assert.deepEqual(paths, [
    "/gate",
    "/api/gate",
    "/about",
    "/manifest.webmanifest",
    "/icon-16.png",
    "/icon-32.png",
    "/icon-48.png",
    "/icon-192.png",
    "/icon-512.png",
    "/apple-touch-icon.png",
  ]);
  // 画面写真は1枚ずつ完全一致で通す（`/help/` の前方一致にしない＝あとから置いたものが黙って公開されない）
  const helpBlock = src.slice(src.indexOf("const HELP_SHOTS"), src.indexOf("];", src.indexOf("const HELP_SHOTS")));
  const help = [...helpBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  const shots = ABOUT.chapters
    .flatMap((c) => c.steps.flatMap((s) => s.shots ?? []))
    .map((s) => s.src.replace("/help/", ""))
    .sort();
  assert.deepEqual(help, shots, "ゲートを通す写真と、ページが参照する写真が食い違っている");
  assert.ok(!src.includes('startsWith("/help'), "写真を前方一致で開けない");
  assert.ok(src.includes("PUBLIC.has(path)"), "完全一致（Set.has）で判定していること");
  assert.ok(!src.includes('path.startsWith("/about'), "前方一致で開けない");
  // ゲート本体（未認証は /gate へ・API は 401）が生きていること
  assert.ok(src.includes('new NextResponse("unauthorized", { status: 401 })'));
  assert.ok(src.includes('NextResponse.redirect(new URL("/gate", req.url))'));
});
