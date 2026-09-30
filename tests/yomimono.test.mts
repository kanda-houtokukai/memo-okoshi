// 読みもの（/yomimono/…）とホームの「ひと息」の棚についての機械テスト（P17・2026-09-30）。
//
// /yomimono/… は合言葉ゲートの外に出しているので、**載ってよい文面は承認済みのものだけ**。
// このファイルが承認済みの文面（ゴールデン＝docs/mock/memo-kotsu-mock.html の文面）を控えていて、1文字でも変わると落ちる。
// 文面を変えるときは、設計側の承認を取ってから lib/yomimono-copy.ts とここを一緒に直すこと。
//
// あわせて次を検査する:
//   - 読みものの一覧（READINGS）が1か所にあり、棚・道・ゲートの穴がそこから揃っていること
//   - ゲートの外に出るのは /about と読みものの道だけで、ホーム（/）は内側のままであること
//   - 棚のカード・使い方ページの入口・戻るボタンが、どれも行き先を持つこと（押しても何も起きない部品を作らない）
//   - 目次は使い方ページと同じ部品（ChapterIndex）を使い、縦の文字は writing-mode でなく1字ずつの改行であること
//   - 手書き風の字（Klee One）は、読みもの・ホームの棚・開発データの元メモだけが読むこと

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { MEMO_READING, READINGS, YOMIMONO_UI } from "../lib/yomimono-copy.ts";
import { ABOUT } from "../lib/about-copy.ts";

/* ---------------- ゴールデン（2026-09-30・設計側の文面＝docs/mock/memo-kotsu-mock.html） ---------------- */

const GOLDEN = {
  pageTitle: "メモおこし — メモの取り方",
  title: "メモの取り方",
  sub: "記録が書きやすくなるコツ",
  cover: ["母：学校の話をあまりしない", "本人：「サッカーが楽しい」", "次回 10/2（金）14:00 →"],
  lead: "記録の書きやすさは、面談中のメモで大きく変わります。現場で受け継がれてきたコツを、場面ごとにまとめました。気になるところから読んでください。",
  ui: { shelf: "ひと息", brand: "メモおこし", home: "ホーム", homeLabel: "ホームへ戻る", back: "ホームへ戻る", toc: "目次" },
  chapters: [
    {
      id: "before", c: "var(--t3)", rail: "面談前", h: "面談の前に",
      tips: [
        { h: "目的を1行で書いておく", p: "今日は何を確かめる面談かを、用紙の上に一言書きます。話が広がっても戻る場所ができ、記録の「目的」もそのまま埋まります。" },
        { h: "前回の「今後の対応」を書き写す", p: "前回の記録から、決めたことを2〜3行書き写しておきます。聞き漏らしを防げるうえ、変化を書くときに比べる元になります。" },
        { h: "メモを取ることを最初に伝える", p: "「忘れないように書かせてください」と一言断ってから書き始めます。書いている姿に、相手が身構えにくくなります。" },
      ],
    },
    {
      id: "during", c: "var(--t1)", rail: "面談中", h: "聞きながら書く",
      tips: [
        { h: "全部を書こうとしない", p: "書くのは要点の言葉だけにして、目線は相手に向けます。拾えなかった話は、面談のあとに足せば間に合います。" },
        { h: "誰の発言かを行の頭に書く", p: "「母：」「本人：」のように、話した人を行の頭に書きます。記録の「家族等の発言」と「本人の発言・様子」に分けやすくなります。", memo: ["母：学校の話をあまりしない", "本人：「サッカーが楽しい」"] },
        { h: "数字と約束はその場で書く", p: "次回の日時、回数、金額、期限は、記憶では残りません。話に出たら、すぐに書き留めます。" },
        { h: "大事な話ではペンを置く", p: "相手が言いにくそうな話をしているときは、書く手を止めて聞きます。話し終えてから短く書き留めれば足ります。" },
        { h: "余白を残して書く", p: "行を詰めずに書くと、あとで書き足す場所が残ります。話題が変わったら1行空けます。" },
      ],
    },
    {
      id: "words", c: "var(--t2)", rail: "書き方", h: "言葉の残し方",
      tips: [
        { h: "本人の言葉はかぎかっこで残す", p: "言い換えずに「」で書き留めると、あとで事実と自分の解釈を分けられます。短い一言で足ります。", memo: ["本人：「朝がしんどい」"] },
        { h: "様子は見たままを書く", p: "「疲れている様子」ではなく、見えたことを書きます。見たことが残っていれば、判断はあとからできます。", cmp: ["疲れている様子", "声が小さい　下を向くことが多い"] },
        { h: "評価の言葉を使わない", p: "「わがまま」「意欲がない」は、書いた人の評価です。起きたことを書けば、読む人が同じ場面を思い浮かべられます。", cmp: ["作業に意欲がない", "作業を10分で止めて席を立った"] },
        { h: "自分の考えには印を付ける", p: "支援者の見立ては、頭に（所感）と付けて書きます。事実と考えが混ざらず、記録にするときに書き分けられます。" },
      ],
    },
    {
      id: "marks", c: "var(--t5)", rail: "記号・略語", h: "記号と略語",
      tips: [
        { h: "記号は数個に決めて使う", p: "よく使う意味だけを記号にすると、書く手が話に追いつきます。数を増やすと、あとで自分でも読めなくなります。", legend: [["→", "変わった・次につながる"], ["↑ ↓", "増えた・減った"], ["？", "まだ確かめていない"], ["！", "大事な話"]] },
        { h: "略語は事業所でそろえる", p: "「Dr（医師）」「Ns（看護師）」のような略語は、人によって意味が違うと記録が読めなくなります。事業所で使う略語をそろえ、アプリの辞書にも登録しておきます。" },
        { h: "日付と時刻の書き方を決める", p: "「10/2（金）14:00」のように、いつも同じ形で書きます。曜日まで書いておくと、日付の書き間違いに気づけます。" },
      ],
    },
    {
      id: "after", c: "var(--t6)", rail: "面談後", h: "面談のあとに",
      tips: [
        { h: "5分以内に書き足す", p: "記憶が新しいうちに、抜けた言葉や話の順番を書き足します。撮る前のこのひと手間で、記録が確かになります。" },
        { h: "崩れた字を書き直す", p: "急いで書いた字は、あとで自分でも読めないことがあります。書き足すついでに、読みにくい字をはっきり書き直します。" },
        { h: "決まったことを最後にまとめる", p: "面談の中で決まったことと、誰が何をするかを、用紙の最後にまとめて書きます。記録の「今後の対応」がそのまま埋まります。" },
      ],
    },
    {
      id: "meeting", c: "var(--t8)", rail: "会議", h: "会議のメモ",
      tips: [
        { h: "決まったことに印を付ける", p: "決定事項の頭に「決」と書くなどして、話し合いと決まったことを分けます。あとで記録にするとき、決定事項を探しやすくなります。", memo: ["決　送迎の時間を15分早める"] },
        { h: "担当と期限を一緒に書く", p: "誰が、いつまでに行うかを並べて書きます。片方だけでは、次の会議で確かめられません。" },
        { h: "意見の違いも残す", p: "反対の意見や、保留になった点も短く残します。結論だけの記録では、あとで経緯をたどれません。" },
      ],
    },
  ],
};

/** コメントを落とす（ブロック・JSX・行頭の // に加え、行末の // も。"https://" のような文字列の中は落とさない） */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/([;{}),])\s*\/\/.*$/gm, "$1");
const PAGE = "app/yomimono/[slug]/page.tsx";

test("読みもの「メモの取り方」の文面が承認済みのもの（モックの文面）と一致する", () => {
  assert.equal(MEMO_READING.pageTitle, GOLDEN.pageTitle);
  assert.equal(MEMO_READING.title, GOLDEN.title);
  assert.equal(MEMO_READING.sub, GOLDEN.sub);
  assert.deepEqual(MEMO_READING.cover, GOLDEN.cover);
  assert.equal(MEMO_READING.lead, GOLDEN.lead);
  assert.deepEqual({ ...YOMIMONO_UI }, GOLDEN.ui);
  // 章（場面）とコツは、決めていない欄（memo/cmp/legend）が付いていないことまで含めて一致させる
  assert.deepEqual(JSON.parse(JSON.stringify(MEMO_READING.chapters)), GOLDEN.chapters);
  // 6つの場面・21のコツ・手書き風の例3つ・比べる例2つ・記号の表1つ
  const tips = MEMO_READING.chapters.flatMap((c) => c.tips);
  assert.equal(MEMO_READING.chapters.length, 6);
  assert.equal(tips.length, 21);
  assert.equal(tips.filter((t) => t.memo).length, 3);
  assert.equal(tips.filter((t) => t.cmp).length, 2);
  assert.equal(tips.filter((t) => t.legend).length, 1);
});

test("読みものの一覧は1か所（READINGS）で、棚・道・ゲートの穴がそこから揃う", () => {
  assert.deepEqual(READINGS, [MEMO_READING]);
  for (const r of READINGS) assert.equal(r.href, `/yomimono/${r.slug}`, `${r.slug} の道`);
  // 道は一覧から作る。一覧に無い道は 404（dynamicParams=false）
  const page = readFileSync(PAGE, "utf8");
  assert.ok(page.includes("export const dynamicParams = false"));
  assert.ok(/generateStaticParams\(\) \{\s*return READINGS\.map\(\(r\) => \(\{ slug: r\.slug \}\)\);/.test(page));
  // ゲート: 読みものの道は1本ずつ完全一致で外に出す（前方一致にしない）
  const mw = readFileSync("middleware.ts", "utf8");
  const block = mw.slice(mw.indexOf("const PUBLIC"), mw.indexOf("]);", mw.indexOf("const PUBLIC")));
  const paths = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const r of READINGS) assert.ok(paths.includes(r.href), `${r.href} がゲートの外に無い`);
  assert.ok(!paths.some((p) => p.startsWith("/yomimono") && !READINGS.some((r) => r.href === p)), "一覧に無い読みものの道を開けている");
  assert.ok(!mw.includes('startsWith("/yomimono'), "読みものを前方一致で開けない");
});

test("ゲートの外で開くのは /about と読みものの道。ホーム（/）は内側のまま", () => {
  const mw = readFileSync("middleware.ts", "utf8");
  const block = mw.slice(mw.indexOf("const PUBLIC"), mw.indexOf("]);", mw.indexOf("const PUBLIC")));
  const paths = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.includes("/about") && paths.includes("/yomimono/memo"));
  assert.ok(!paths.includes("/"), "ホームをゲートの外に出している");
  // 判定は完全一致の Set だけ。未認証はホームも含めて /gate へ
  assert.ok(mw.includes("if (PUBLIC.has(path)) return NextResponse.next();"));
  assert.ok(mw.includes('NextResponse.redirect(new URL("/gate", req.url))'));
  // 検索避けは使い方ページと同じ（robots.txt の Disallow と、このページの noindex）
  assert.ok(readFileSync(PAGE, "utf8").includes("robots: { index: false, follow: false }"));
  assert.ok(readFileSync("app/robots.ts", "utf8").includes('disallow: "/"'));
});

test("棚のカード・使い方ページの入口・戻るボタンは、どれも行き先を持つ（押しても何も起きない部品を作らない）", () => {
  // ホームの棚: 一覧（READINGS）のカードは、その読みものの道へのリンク
  const home = readFileSync("app/components/Home.tsx", "utf8");
  assert.ok(/READINGS\.map\(\(r\) => \(\s*<a key=\{r\.slug\} className="hs-card" href=\{r\.href\}>/.test(home), "棚のカードがリンクでない");
  // 棚はカードの下・「利用上の注意」の上
  assert.ok(home.indexOf('className="cards"') < home.indexOf('className="hs-shelf"'));
  assert.ok(home.indexOf('className="hs-shelf"') < home.indexOf('className="home-notice"'));
  assert.ok(home.includes("{YOMIMONO_UI.shelf}"), "棚の見出し（ひと息）");
  // 使い方ページの入口（メモを書くの章の最後）
  const about = readFileSync("app/about/page.tsx", "utf8");
  assert.ok(about.includes('<a className="ab-insert" href={w.insert.href}>'));
  assert.equal(ABOUT.write.insert.href, MEMO_READING.href);
  assert.equal(ABOUT.write.insert.title, MEMO_READING.title);
  // 読みもののページ: 上の「ホーム」と最後の「ホームへ戻る」は / へのリンク
  const page = strip(readFileSync(PAGE, "utf8"));
  assert.ok(page.includes('<a className="ym-home" href="/" aria-label={YOMIMONO_UI.homeLabel}>'));
  assert.ok(/<a className="ym-back" href="\/">\s*\{YOMIMONO_UI\.back\}/.test(page));
  // 行き先が実在する（/ はホーム、/yomimono/… は一覧から作るページ）
  assert.ok(existsSync("app/page.tsx") && existsSync(PAGE));
  // <button> で作って onClick を持たない、という部品が無い
  for (const f of [PAGE, "app/components/ChapterIndex.tsx"]) {
    const src = strip(readFileSync(f, "utf8"));
    for (const m of src.matchAll(/<button\b[^>]*>/g)) assert.ok(m[0].includes("onClick"), `${f}: 押しても何も起きないボタン → ${m[0]}`);
    for (const m of src.matchAll(/<a\b[^>]*>/g)) assert.ok(/href=/.test(m[0]), `${f}: 行き先の無いリンク → ${m[0]}`);
  }
});

test("読みもののページの器は文字を持たず、文面は正本から読む", () => {
  const page = strip(readFileSync(PAGE, "utf8"));
  const jp = page.match(/[ぁ-んァ-ヶ一-龥々ー、。「」・（）]{2,}/g) ?? [];
  assert.deepEqual(jp, [], `page.tsx に直接書かれた文面がある → ${jp.join(" / ")}`);
  assert.ok(page.includes('from "@/lib/yomimono-copy"'));
  // 目次の部品も文字を持たない（「目次」は各ページの正本から渡す）
  const ix = strip(readFileSync("app/components/ChapterIndex.tsx", "utf8"));
  assert.deepEqual(ix.match(/[ぁ-んァ-ヶ一-龥々ー、。「」・（）]{2,}/g) ?? [], []);
});

test("目次は使い方ページと同じ部品（案B）で、縦の文字は writing-mode でなく1字ずつ改行する", () => {
  const page = readFileSync(PAGE, "utf8");
  assert.ok(page.includes('from "@/app/components/ChapterIndex"') && page.includes("<ChapterIndex"));
  assert.ok(readFileSync("app/about/page.tsx", "utf8").includes("<ChapterIndex"), "使い方ページも同じ部品を使う");
  const ix = readFileSync("app/components/ChapterIndex.tsx", "utf8");
  // 1字ずつ <br> で並べる
  assert.ok(/\[\.\.\.ch\.rail\]\.map\(\(c, k\) => \(\s*<Fragment key=\{k\}>\s*\{k > 0 && <br \/>\}/.test(ix), "縦の文字を1字ずつ改行していない");
  const css = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/writing-mode/.test(css), "writing-mode を使っている（Chromium でボタンの中の縦書きが潰れた）");
  // 880px で出し分ける（広い画面は縦のインデックス・狭い画面は上の帯）
  assert.ok(/@media \(min-width:880px\)\{\s*\.ix-bar\{display:none\}/.test(css));
  assert.ok(css.includes(".ix-rail{display:none}"));
  // 視差効果を減らす設定: 動きを止める（スクロールも名前の入れ替えも）
  assert.ok(ix.includes('matchMedia("(prefers-reduced-motion: reduce)")') && ix.includes('behavior: smooth ? "smooth" : "auto"'));
  assert.ok(/@media \(prefers-reduced-motion:reduce\)\{[^@]*\.ix-name \.in-up,\.ix-name \.in-down\{animation:none\}/.test(css));
  // 一覧は外側を押す・Esc・章を選ぶ、のいずれでも閉じる
  assert.ok(ix.includes('document.addEventListener("pointerdown", onDown)') && ix.includes('e.key === "Escape"'));
  assert.ok(/const go = [\s\S]*?setOpen\(false\)/.test(ix));
  // 閉じている一覧は押せない・読み上げない
  assert.ok(ix.includes("inert={!open}"));
});

test("手書き風の字（Klee One）は、読みもの・ホームの棚・開発データの元メモだけが読む", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  const links = [...strip(layout).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(!links.some((h) => h.includes("Klee")), "共通の layout で Klee One を読んでいる");
  const href = readFileSync("lib/hand-font.ts", "utf8");
  assert.ok(href.includes("family=Klee+One:wght@400;600"));
  for (const f of [PAGE, "app/components/Home.tsx", "app/components/MemoPane.tsx"]) {
    assert.ok(readFileSync(f, "utf8").includes('<link rel="stylesheet" href={HAND_FONT_HREF} precedence="default" />'), `${f} が字を読んでいない`);
  }
  // 使い方ページ・用紙・ゲートは読まない
  for (const f of ["app/about/page.tsx", "app/components/SheetMaker.tsx", "app/gate/page.tsx"]) {
    assert.ok(!readFileSync(f, "utf8").includes("HAND_FONT_HREF"), `${f} が手書き風の字を読んでいる`);
  }
});

test("読みものの文面にも「宿題」が無い（既存の見張り tests/meeting.test.mts の範囲に入っている）", () => {
  assert.ok(!JSON.stringify(READINGS).includes("宿題"));
  const meeting = readFileSync("tests/meeting.test.mts", "utf8");
  // 既存の見張りは app・lib・public の下をすべて走査する（新しいファイルも自動で入る）
  assert.ok(meeting.includes('...sourcesUnder("app"), ...sourcesUnder("lib"), ...sourcesUnder("public")'));
  assert.ok(meeting.includes('join("lib", "yomimono-copy.ts")'), "見張りの範囲に読みものの文面が入っていることを確かめていない");
  assert.ok(existsSync("lib/yomimono-copy.ts") && existsSync(PAGE));
});
