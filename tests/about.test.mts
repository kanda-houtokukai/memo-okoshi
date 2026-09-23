// 使い方ページ（/about）についての機械テスト。
//
// /about は合言葉ゲートの外に出しているので、**載ってよい文面は承認済みのものだけ**。
// このファイルが承認済みの文面（ゴールデン）を控えていて、1文字でも変わると落ちる。
// 文面を変えるときは、設計側の承認を取ってから lib/about-copy.ts とここを一緒に直すこと。
// （2026-09-11に手順書へ作り直した。体裁の正本は 2026-09-12 から docs/mock/tsukaikata-mock-v3.html（凍結）で、
//   文面が食い違ったら実装が正しい。）
//
// あわせて次を検査する:
//   - 文の作法（見出しは文にしない／本文はすべて述語で終える）
//   - 章の順序（目次のとおりに並んでいること）
//   - 画面写真12枚がすべて参照され、配信の場所に実在すること
//   - ゲートの外に出す道が増えていないこと
//   - 体裁の構造（手順が縦線でつながる・章の頭がある等）と、横あふれを防ぐ指定（P8-h）

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { ABOUT } from "../lib/about-copy.ts";

/* ---------------- ゴールデン（2026-09-11・設計側の承認どおり） ---------------- */

const GOLDEN = {
  pageTitle: "メモおこし — 使い方",
  h1: "使い方",
  lead: "面談や会議で書いたメモを撮ると、記録の形に整います。清書にかかっていた時間を減らせます。ここでは印刷から転記までの流れを、面談を例に説明します。",
  note: "画面の例はすべて架空のものです。",
  toc: ["用紙を印刷する", "1 取り込み", "2 伏せる", "3 変換", "4 確認", "5 出力", "辞書", "注意事項", "困ったとき"],
  leads: {
    prep: "項目の枠に沿って書くと、読み取りが安定します。手元のメモをそのまま撮っても使えますが、用紙を使うほうが振り分けの精度が上がります。",
    take: "ホームで「面談メモをおこす」か「会議メモをおこす」を選び、書いたメモをアプリに入れます。",
    mask: "氏名など個人が分かる語を隠します。隠したあとの画像だけが送られます。隠した箇所は「〇〇」と書き起こされます。",
    conv: "読み取りと振り分けをします。30秒ほどかかります。",
    check: "元のメモと見比べて直します。一番大事な工程です。",
    out: "普段の記録システムに移します。",
    dict: "事業所で使う言葉を登録すると、読み取りが良くなります。",
  } as Record<string, string>,
  /** 各章の手順の見出し（順番も含めて固定） */
  steps: {
    prep: ["ホームで「用紙を印刷」を選ぶ", "用紙の種類と項目を選ぶ", "「印刷」を押す"],
    take: ["「＋」からメモを選ぶ", "順番を整える", "「次へ」を押す"],
    mask: ["道具を選ぶ", "拡大して細かいところを塗る", "「次へ」を押して確認する"],
    conv: ["待つ"],
    check: ["印の付いた箇所を直す", "文章を直す", "拾いきれなかった内容を移す", "AIの気づきを読む", "「完成」を押す"],
    out: ["コピーして貼り付ける", "ファイルで保存する", "次の記録を始める"],
    dict: ["言葉を登録する", "他の端末に移す"],
  } as Record<string, string[]>,
  /** 設計側が指示した書き換え（モックより優先） */
  changed: {
    prepStep2: "画面の上で面談と会議を切り替えます。どちらの用紙でも、対象者や議題に合わせて項目を外したり並べ替えたりできます。",
    basic: "面談で扱う頻度が高い項目です。最初はすべて入っています。",
    extra: "就労や金銭管理など、必要に応じて足します。",
    pc: "パソコンでは「＋」からファイル選択が直接開きます。画面に画像をドラッグしても入ります。",
  },
  /** 会議への対応で足した文（P10・2026-09-18 設計側の承認どおり） */
  meeting: {
    /** 用紙の pair「会議」（用紙に載る3項目と、頭の記入欄から記録に入るもの） */
    sheetPair:
      "内容・決定事項・今後の対応の3つです。足せる項目はありません。用紙の頭に書く会議名・日時・場所・出席者は、記録の「会議概要」に入ります。",
    /** 用紙の pair「その他」（書いた内容の行き先を足した） */
    otherPair:
      "用紙の最後に必ず付きます。どの項目にも当てはまらない話を書けます。書いた内容は項目に振り分けられ、当てはまらないものは確認画面の「拾いきれなかった内容」に出ます。",
    /** 手順3（1枚に入る項目の数・記入欄の付く枚。押印欄は P12 で完成形へ移した） */
    prepStep3: "1枚に入る項目は6つまでです。7つ以上になると次の用紙に続きます。記入欄は1枚目にだけ付きます。",
    /** 出力の手順2（押印欄は完成形の1ページ目の右上。P12） */
    outStep2: "WordとPDFで書き出せます。どちらも1ページ目の右上に押印欄が付きます。",
    /** 赤の説明と「完成」（P15: 赤は伏せ忘れの知らせ・面談と会議とも） */
    red: "塗り忘れた人名かもしれない語です。確認するまで完成できません。そのまま残すか、書き換えます。",
    done: "確認していない赤い印が残っていると押せません。",
    /** 確認の手順2（塗った箇所「〇〇」に名前を書き入れる。P15） */
    editStep: "項目ごとに書き直せます。右上の鉛筆から開きます。「〇〇」になった箇所には、ここで名前を書き入れます。",
  },
  /** 撮り直した画面写真の説明（P13・2026-09-23 設計側の文面） */
  alts: {
    "/help/01-home.png": "ホーム画面。カードが4枚並んでいる",
    "/help/02-sheet-maker.png": "用紙を作る画面。上に面談と会議の切り替え、左に項目の一覧、右に用紙の見本",
  } as Record<string, string>,
  cautions: [
    ["記録の下書き", "そのまま記録にはできません。内容を確かめて、必要なら書き直してから仕上げてください。記録の責任は書いた人にあります。"],
    ["送った内容の扱い", "読み取りにはGoogleのAI（Gemini）の無料枠を使っています。送った内容はGoogleのサービス改善に使われることがあり、担当者が目を通す場合もあります。氏名など個人が分かる語は、必ず塗りつぶしてから送ってください。"],
    ["伏せ忘れの確認", "赤い印は保険であり、完全ではありません。赤が付いた名前は、すでにAIに届いている可能性があります。送る前に隠し忘れがないか見てください。"],
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

test("会議への対応が文面に入っている（章は足さず、該当する章に一文ずつ・P10）", () => {
  // 冒頭で「面談を例に説明する」と断る（章を足さない代わりの断り）
  assert.ok(ABOUT.lead.includes("面談や会議で") && ABOUT.lead.includes("面談を例に"), "冒頭の断りがない");
  // 用紙の章: 種類の切り替え・会議の項目・「その他」の行き先・枚数と記入欄
  const prep2 = chapterById("prep").steps[1];
  assert.equal(prep2.pairs?.find((p) => p.lb === "会議")?.tx, GOLDEN.meeting.sheetPair);
  assert.equal(prep2.pairs?.find((p) => p.lb === "その他")?.tx, GOLDEN.meeting.otherPair);
  // pair の並びは 基本 → 追加項目 → 会議 → その他（面談の項目の話が先・「その他」は最後）
  assert.deepEqual(prep2.pairs?.map((p) => p.lb), ["基本", "追加項目", "会議", "その他"]);
  assert.deepEqual(chapterById("prep").steps[2].ps, [GOLDEN.meeting.prepStep3]);
  assert.deepEqual(chapterById("out").steps[1].ps, [GOLDEN.meeting.outStep2]);
  // 取り込みの入口（ホームの2枚のカード）
  assert.ok(chapterById("take").lead?.includes("会議メモをおこす"), "会議の入口が書かれていない");
  // 赤は伏せ忘れの知らせ（P15。面談・会議とも。「会議では出ない」は無くなった）
  const check1 = chapterById("check").steps[0];
  assert.equal(check1.pairs?.find((p) => p.mk === "r")?.tx, GOLDEN.meeting.red);
  assert.deepEqual(chapterById("check").steps[1].ps, [GOLDEN.meeting.editStep]);
  assert.deepEqual(chapterById("check").steps[4].ps, [GOLDEN.meeting.done]);
  assert.ok(ABOUT.cautions.find((c) => c.b === "伏せ忘れの確認")?.s.includes("すでにAIに届いている可能性があります"));
  const all = JSON.stringify(ABOUT);
  assert.ok(!/会議では(印が)?出ません|記号か「担当」|置き換えるまで/.test(all), "旧い赤の説明が残っている");
  // 会議の章は足さない（目次・章の構成は P9 までと同じ）。上の「章の順序は目次のとおり」と対
  assert.equal(ABOUT.toc.length, 9);
  assert.ok(!ABOUT.chapters.some((c) => c.h.includes("会議")), "会議の章を足している");
  // 用語: 「宿題」ではなく「今後の対応」と書く（`tests/meeting.test.mts` が lib 配下も走査する）
  assert.ok(GOLDEN.meeting.sheetPair.includes("今後の対応"));
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

/* ---------------- 体裁（P8-h・docs/mock/tsukaikata-mock-v3.html） ---------------- */

const aboutCss = () => {
  const css = readFileSync("app/globals.css", "utf8");
  const start = css.indexOf("使い方ページ /about");
  // 注釈（原因の説明に規則そのものを書いている）は検査の対象から外す
  return css.slice(start, css.indexOf("/* 作業画面ヘッダーの入口", start)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[\s\S]*?\*\//, "");
};

test("体裁: 手順は縦の一本線でつなぎ、章の頭と表組みがある（v3）", () => {
  const page = readFileSync("app/about/page.tsx", "utf8");
  const css = aboutCss();
  // 手順: 番号が左端に一列、右に内容。カードにしない（背景・枠を付けない）
  assert.ok(page.includes('className="ab-steps"') && page.includes('className="step"') && page.includes('className="n"'));
  assert.ok(/\.about \.ab-steps::before\{[^}]*position:absolute[^}]*width:2px/.test(css), "手順をつなぐ縦線がない");
  assert.ok(/\.about \.step \.n\{[^}]*position:absolute/.test(css), "番号が左端の列にない");
  const step = css.match(/\.about \.step\{[^}]*\}/)?.[0] ?? "";
  assert.ok(!/background|border:/.test(step), "手順をカードにしている");
  // 章の頭: 番号の四角＋見出し＋右に一行の説明、下に章の色の太線
  assert.ok(page.includes('className="sec-head"') && page.includes('className="sec-no"') && page.includes('className="sub"'));
  assert.ok(/\.about \.sec-head\{[^}]*border-bottom:2px solid var\(--c/.test(css), "章の頭の下に章の色の線がない");
  // どの章にも章の頭がある（手順の7章・注意事項・困ったとき）
  assert.equal((page.match(/<SecHead /g) ?? []).length, 3, "章の頭を出す場所（手順の章・注意事項・困ったとき）");
  // ラベルと説明は表組み（dl/dt/dd）。黄・青・赤はラベルに色
  assert.ok(page.includes('<dl className="pairs">') && page.includes("<dt className={pr.mk}>") && page.includes("<dd>"));
  for (const k of ["y", "b", "r"]) assert.ok(css.includes(`.about .pairs dt.${k}{`), `ラベル ${k} の色がない`);
  // 画像は本文より控えめ（最大520px・縦長は330px）
  assert.ok(/\.about \.shot\{[^}]*max-width:520px/.test(css) && css.includes(".about .shot.narrow{max-width:330px}"));
  const narrow = ABOUT.chapters.flatMap((c) => c.steps.flatMap((s) => s.shots ?? [])).filter((s) => s.h / s.w >= 0.9);
  assert.deepEqual(narrow.map((s) => s.src), ["/help/10-spill-picker.png", "/help/12-vocab.png"], "縦長として狭くする写真");
  // 注意事項と困ったときは、区切り線でつないだ一枚の表
  assert.ok(/\.about \.cautions,\.about \.qa\{[^}]*display:grid;gap:1px;background:var\(--line\)/.test(css));
});

test("横あふれを防ぐ指定が入っている（P8-h）", () => {
  const css = aboutCss();
  // 長い英数字（URL など）も折り返す
  assert.ok(/\.about\{[^}]*overflow-wrap:anywhere/.test(css), "長い文字列が折り返さない");
  // 画像は枠より広がらない。寸法の属性は位置ずれ防止のため残し、CSS で抑える
  assert.ok(css.includes(".about img{display:block;max-width:100%;height:auto}"));
  const page = readFileSync("app/about/page.tsx", "utf8");
  assert.ok(page.includes("width={s.w}") && page.includes("height={s.h}"), "寸法の属性を外さない");
  // 表組みの説明の列は縮められる（1fr のままだと中身の最小幅より縮まない）
  assert.ok(css.includes("grid-template-columns:auto minmax(0,1fr)") && /\.about \.pairs dd\{[^}]*min-width:0/.test(css));
  // 折り返さない指定は短いラベル（dt）だけ。本文にはかけない
  const nowrap = [...css.matchAll(/([^{}]+)\{[^}]*white-space:nowrap/g)].map((m) => m[1].trim());
  assert.deepEqual(nowrap, [".about .pairs dt"], "本文に折り返さない指定がある");
  // 文字を極端に小さくしない（0.72rem 未満を使わない）
  for (const m of css.matchAll(/font-size:([\d.]+)rem/g)) assert.ok(Number(m[1]) >= 0.72, `文字が小さすぎる → ${m[0]}`);
});

test("使い方ページの部品名が、他の画面の規則とぶつからない（横あふれの原因になった・P8-h）", () => {
  // 2026-09-12: 手順の入れ物を .steps にしていたため、作業画面の工程表示の規則
  // （.steps{display:flex;...} と .steps span{white-space:nowrap}）が使い方ページにまで効き、
  // 説明文が折り返さずに 375px で 192px はみ出していた。部品名が他の画面の規則の先頭に来ていないことを見張る。
  const page = readFileSync("app/about/page.tsx", "utf8");
  const classes = new Set<string>(["y", "b", "r", "warn", "narrow"]);
  for (const m of page.matchAll(/className=(?:"([^"]+)"|\{([^}]*)\})/g)) {
    const lit = m[1] ? [m[1]] : [...(m[2] ?? "").matchAll(/"([^"]*)"/g)].map((x) => x[1]);
    for (const l of lit) for (const c of l.split(/\s+/)) if (c) classes.add(c);
  }
  const shared = new Set(["brand", "h-in"]); // ヘッダーは作業画面と共有する（意図どおり）
  const css = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const clash: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const sel of m[1].split(",").map((x) => x.trim())) {
      if (!sel || sel.startsWith("@") || sel.startsWith(".about")) continue;
      const first = sel.match(/^\.([\w-]+)/)?.[1];
      if (first && classes.has(first) && !shared.has(first)) clash.push(sel);
    }
  }
  assert.deepEqual(clash, [], `他の画面の規則が使い方ページに効く → ${clash.join(" / ")}`);
  assert.ok(!classes.has("steps") && !classes.has("note") && !classes.has("mk"), "ぶつかると分かっている名前を使っている");
});

test("撮り直した画面写真（01・02）の説明と撮り方（P13）", () => {
  const shots = ABOUT.chapters.flatMap((c) => c.steps.flatMap((s) => s.shots ?? []));
  for (const [src, alt] of Object.entries(GOLDEN.alts)) {
    const sh = shots.find((s) => s.src === src);
    assert.ok(sh, `${src} が無い`);
    assert.equal(sh!.alt, alt, `${src} の説明`);
    // 撮影の寸法（shoot.mjs の 1345×775・倍率1）どおり
    assert.deepEqual([sh!.w, sh!.h], [1345, 775], `${src} の寸法`);
  }
  // 撮影の道具が撮れる写真は、ゲートを通す写真（HELP_SHOTS）の中だけ（名前を変えると配信されない）
  const shoot = readFileSync("docs/assets/help/shoot.mjs", "utf8");
  const list = shoot.slice(shoot.indexOf("const SHOTS = {"), shoot.indexOf("/* ---------------- ここから下は道具"));
  const names = [...list.matchAll(/^  "([^"]+\.png)":/gm)].map((m) => m[1]);
  assert.deepEqual(names, ["01-home.png", "02-sheet-maker.png"]);
  const mw = readFileSync("middleware.ts", "utf8");
  for (const n of names) assert.ok(mw.includes(`"${n}"`), `${n} がゲートの一覧に無い`);
  // npm の依存を足さない（Node の標準機能だけ）
  assert.ok(![...shoot.matchAll(/^import .* from "([^"]+)";$/gm)].some((m) => !m[1].startsWith("node:")), "Node の標準機能以外を読み込んでいる");
});
