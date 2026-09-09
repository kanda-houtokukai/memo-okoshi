// 使い方ページ（/about）についての機械テスト。
//
// /about は合言葉ゲートの外に出しているので、**載ってよい文面は承認済みのものだけ**。
// このファイルが承認済みの文面（ゴールデン）を控えていて、1文字でも変わると落ちる。
// 文面を変えるときは、設計側の承認を取ってから lib/about-copy.ts とここを一緒に直すこと。
// （2026-09-09に文面の正本を docs/mock/tsukaikata-mock-v1.html から lib/about-copy.ts へ移管した。
//   モックは体裁の記録として凍結してあり、文面が食い違ったら実装が正しい。）
//
// あわせて文の作法も検査する: 小見出しは名詞句（文にしない）／本文はすべて述語で終える（体言止めを使わない）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ABOUT } from "../lib/about-copy.ts";

/** 承認済みの文面（2026-09-09・設計側指示のまま） */
const GOLDEN = {
  pageTitle: "メモおこし — このアプリについて",
  h1: "メモおこしについて",
  lead: "面談中に書いたメモを撮ると、記録の形に整います。清書にかかっていた時間を減らせます。",
  headings: { who: "使う場面", flow: "5つの工程", marks: "確認画面の印", cautions: "注意事項" },
  who: "相談支援、ケアマネジメント、サービス管理、生活相談など、面談やモニタリングの記録を書く仕事で使えます。走り書きのメモから、面談の様子や家族の話、課題、申し送りといった形に起こします。",
  whoAlso: "教育相談や三者面談、退院支援の面談でも同じように使えます。記録の項目は事業所ごとに選べます。",
  steps: [
    ["取り込み", "メモを撮るか、写真やPDFから選びます。複数枚をまとめて1件の記録にできます。読む順番は後から並べ替えられます。"],
    ["伏せる", "氏名などを指でなぞって隠します。送られるのは隠したあとの画像だけで、元の画像は端末から出ません。"],
    ["変換", "選んだ項目にそって内容を振り分けます。書かれていないことは空欄のままにします。どの項目にも入らなかった内容も残ります。"],
    ["確認", "元のメモと見比べて直します。読み取れなかった箇所や推測した箇所には印が付きます。"],
    ["出力", "項目ごと、または全文をコピーして、普段の記録システムに貼り付けます。WordとPDFでも書き出せます。"],
  ],
  marks: [
    ["黄", "読み取れなかった箇所です。そのままでよければ確定し、違っていれば候補から選ぶか自分で直してください。"],
    ["青", "メモにない内容を前後から推測した箇所です。使うかどうかを判断してください。"],
    ["赤", "人名かもしれない語です。置き換えるまで完成できません。"],
  ],
  cautions: [
    ["記録の下書き", "そのまま記録にはできません。内容を確かめて、必要なら書き直してから仕上げてください。記録の責任は書いた人にあります。"],
    ["伏せ忘れの確認", "赤い印は保険であり、完全ではありません。送る前に隠し忘れがないか見てください。"],
    ["AIの気づき", "支援の方針を示すものではありません。見落としを探すきっかけとして使ってください。記録には入りません。"],
    ["データの保存", "内容は保存されません。途中で閉じたり戻ったりすると、それまでの作業は失われます。"],
    ["辞書の登録", "よく使う言葉を登録すると読み取りが良くなります。ただし人の名前は登録しないでください。"],
  ],
  footer: "試験運用中です。うまくいかない点や気づいたことがあれば教えてください。",
};

test("使い方ページの文面が承認済みのものと一致する", () => {
  assert.equal(ABOUT.pageTitle, GOLDEN.pageTitle);
  assert.equal(ABOUT.h1, GOLDEN.h1);
  assert.equal(ABOUT.lead, GOLDEN.lead);
  assert.deepEqual({ ...ABOUT.headings }, GOLDEN.headings);
  assert.equal(ABOUT.who, GOLDEN.who);
  assert.equal(ABOUT.whoAlso, GOLDEN.whoAlso);
  assert.deepEqual(ABOUT.steps.map((s) => [s.h, s.p]), GOLDEN.steps);
  assert.deepEqual(ABOUT.marks.map((m) => [m.label, m.text]), GOLDEN.marks);
  assert.deepEqual(ABOUT.cautions.map((c) => [c.b, c.s]), GOLDEN.cautions);
  assert.equal(ABOUT.footer, GOLDEN.footer);
});

test("小見出しは名詞句（文にしない）", () => {
  const headings = [
    ABOUT.h1,
    ...Object.values(ABOUT.headings),
    ...ABOUT.steps.map((s) => s.h),
    ...ABOUT.cautions.map((c) => c.b),
  ];
  for (const h of headings) {
    assert.ok(!h.endsWith("。"), `小見出しに句点がある → ${h}`);
    assert.ok(!/(ます|ました|ください|です|でした)$/.test(h), `小見出しが文になっている → ${h}`);
    assert.ok(h.length <= 12, `小見出しが長い → ${h}`);
  }
});

test("本文はすべて述語で終える（体言止めを使わない）", () => {
  const bodies = [
    ABOUT.lead,
    ABOUT.who,
    ABOUT.whoAlso,
    ...ABOUT.steps.map((s) => s.p),
    ...ABOUT.marks.map((m) => m.text),
    ...ABOUT.cautions.map((c) => c.s),
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
  const block = src.slice(src.indexOf("const PUBLIC"), src.indexOf("]);"));
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
  assert.ok(src.includes("PUBLIC.has(path)"), "完全一致（Set.has）で判定していること");
  assert.ok(!src.includes('path.startsWith("/about'), "前方一致で開けない");
  // ゲート本体（未認証は /gate へ・API は 401）が生きていること
  assert.ok(src.includes('new NextResponse("unauthorized", { status: 401 })'));
  assert.ok(src.includes('NextResponse.redirect(new URL("/gate", req.url))'));
});
