// 人名（赤マーカー）の置き換え記号。
//
// [DECISION 2026-09-09] 既定の候補は**アルファベット＋元の敬称**（A君・Aさん・A先生…）。
//   先頭1文字のイニシャル（「そうたくん」→「そ」）は元の名前が透けるうえ、記録の慣習としても不自然だった。
// [DECISION 2026-09-09] **同じ名前には常に同じ記号／違う名前には違う記号**（A,B,C…）。
//   バラバラだと同じ人が別人に見え、記録として使えない。割り当ての単位は1件の記録（変換）ごとで、
//   次の変換では A から振り直す。
// [DECISION 2026-09-09] 対応表は**画面の中だけ**に持つ（原則5）。サーバーへ送らない・保存しない。
//   このファイルは純関数だけで、保存も通信もしない（tests/alias.test.mts が中身を機械検査する）。
// [DECISION 2026-09-09] **敬称が無ければ記号だけ**（「田中」→「A」）。「A氏」のように敬称を足すと、
//   元に書かれていない関係性を作ってしまう（原則「書かれていないことは書かない」）。
// [DECISION 2026-09-09] 敬称は**記録の表記に揃える**（「そうたくん」→「A君」・「鈴木さま」→「A様」）。
//   関係性（君／さん／先生…）は保ったまま、送り仮名だけ記録で使う形にする。

/** 名前（敬称を除いた芯）→ 記号。1件の記録のあいだだけ持つ */
export type AliasMap = Record<string, string>;

/** 敬称・肩書き。長いものから順に見る（「さま」を「ま」で切らないため） */
const HONORIFICS = [
  "センター長",
  "施設長",
  "理事長",
  "教頭先生",
  "先生",
  "課長",
  "部長",
  "係長",
  "主任",
  "園長",
  "所長",
  "院長",
  "師長",
  "室長",
  "局長",
  "会長",
  "社長",
  "校長",
  "教頭",
  "ちゃん",
  "さま",
  "さん",
  "くん",
  "君",
  "様",
  "氏",
  "殿",
];

/** 記録に書くときの敬称の形（関係性は変えず、表記だけ揃える） */
const WRITTEN: Record<string, string> = { くん: "君", さま: "様" };

/** 「そうたくん」→ { core:"そうた", honorific:"くん" }。敬称が無ければ honorific は "" */
export function splitHonorific(raw: string): { core: string; honorific: string } {
  const s = raw.trim();
  for (const h of HONORIFICS) {
    if (s.length > h.length && s.endsWith(h)) return { core: s.slice(0, -h.length).trim(), honorific: h };
  }
  return { core: s, honorific: "" };
}

/** 同じ人と見なすための鍵。敬称と空白の違いは無視する（「田中さん」と「田中 」は同じ人） */
export function nameKey(raw: string): string {
  return splitHonorific(raw).core.replace(/[\s　]/g, "");
}

/** 0→A, 25→Z, 26→AA, 27→AB …（26人を超えても破綻しない） */
export function letterAt(i: number): string {
  let n = i;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/**
 * この語に割り当てる記号を返す。すでに割り当て済みなら同じ記号を返し、
 * 初めてなら次の記号を足した新しい対応表を返す（元の対応表は変えない）。
 */
export function aliasFor(map: AliasMap, raw: string): { map: AliasMap; key: string; letter: string; alias: string } {
  const { honorific } = splitHonorific(raw);
  const key = nameKey(raw);
  const letter = map[key] ?? letterAt(Object.keys(map).length);
  const next = map[key] ? map : { ...map, [key]: letter };
  return { map: next, key, letter, alias: letter + (WRITTEN[honorific] ?? honorific) };
}

/**
 * 記録に出てくる順に A,B,C… を振った対応表を作る。
 * [DECISION 2026-09-09] 割り当ての順は**記録に出てくる順**（押した順ではない）。
 *   「Aは最初に出てくる人」と読めるようにするため。開いていない名前にも先に記号が決まる。
 */
export function seedAliases(namesInOrder: string[]): AliasMap {
  let map: AliasMap = {};
  for (const n of namesInOrder) map = aliasFor(map, n).map;
  return map;
}

/** 対応表と元の語から置き換え後の文字列を作る（敬称は元の語のものを使う） */
export function aliasOf(map: AliasMap, raw: string): string | null {
  const key = nameKey(raw);
  const letter = map[key];
  if (!letter) return null;
  const h = splitHonorific(raw).honorific;
  return letter + (WRITTEN[h] ?? h);
}
