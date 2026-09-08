// 人名検知の保険（原則3: 赤マーカーは強制）。
//
// AI が人名を "p"/"y"/"b" に紛れ込ませたときのために、敬称付きの氏名パターンを機械的に検出して
// 独立した "r" トークンに切り出す。AI 側の検知を置き換えるものではなく、取りこぼしを拾う二重防御。
//
// [DECISION 2026-09-08] 検出は保守的にする（誤検知＝正しい語を強制的に置き換えさせる害が大きい）:
//   - 漢字で始まる 1〜4文字 ＋（任意の空白）＋ 1〜4文字 ＋ 敬称（さん/様/さま/くん/君/ちゃん/氏）
//   - 直前が文頭・記号・空白・括弧のときだけ（「お子さん」「お母さん」のような続柄語を避ける）
//   - 続柄・役割語の停止語（利用者さん・職員さん 等）は除外
//   - 敬称なしの姓名は扱わない（機械では見分けられない。プロンプト側に任せる）

export type NameToken = { t: "p" | "y" | "b" | "r"; s: string; cands?: string[]; note?: string; ref?: string | null; resolved?: boolean };

// 敬称。直後に漢字が続く「様子」「氏名」「君主」等は敬称ではない
const HONORIFIC = "(?:さん|様|さま|くん|君|ちゃん|氏)(?![一-龯々])";
// 直前境界: 文頭 / 空白 / 記号・括弧・句読点
const BOUNDARY = "(?:^|[\\s　（(「『【\\[：:・、。,.／/→])";
// 氏名の芯: 漢字2〜4（山田／田中由美）／漢字姓＋空白＋名／カタカナ2〜6／ひらがな2〜4
const NAME_CORE = "(?:[一-龯々]{1,3}[ 　][一-龯々ぁ-ゖァ-ヶー]{1,4}|[一-龯々]{2,4}|[ァ-ヶー]{2,6}|[ぁ-ゖ]{2,4})";
const RE = new RegExp(`(${BOUNDARY})(${NAME_CORE}${HONORIFIC})`, "g");

const STOP = new Set([
  "利用者さん", "職員さん", "患者さん", "皆さん", "皆様", "先生", "子供さん", "子どもさん", "娘さん", "息子さん",
  "奥さん", "旦那さん", "母さん", "父さん", "姉さん", "兄さん", "妹さん", "弟さん", "祖母さん", "祖父さん",
  "保護者様", "保護者さん", "ご家族様", "家族さん", "お客さん", "お客様", "業者さん", "看護師さん", "医師さん",
  "支援員さん", "相談員さん", "介護士さん", "保育士さん", "担当者さん", "本人さん", "御本人様", "ご本人様",
  "皆さま", "みなさん", "お子さん", "お母さん", "お父さん", "お姉さん", "お兄さん", "おばあさん", "おじいさん",
]);

// 「担当 佐藤氏」のように役割語＋空白＋氏名の形は、役割語を落として氏名だけを取る
const ROLE_PREFIX = new Set([
  "担当", "同席", "記録", "記録者", "支援", "支援者", "相談", "相談員", "面談", "対応", "出席", "参加", "同行",
  "保護者", "母", "父", "祖母", "祖父", "兄", "姉", "弟", "妹", "本人", "職員", "医師", "主治医", "看護師", "先生",
  "サビ管", "ワーカー", "ケアマネ", "利用者", "児童", "園長", "所長", "施設長", "管理者", "主任", "係",
]);

export function findNames(text: string): { start: number; end: number; name: string }[] {
  const out: { start: number; end: number; name: string }[] = [];
  RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(text)) !== null) {
    let name = m[2];
    let start = m.index + m[1].length;
    const sp = name.search(/[ 　]/);
    if (sp > 0 && ROLE_PREFIX.has(name.slice(0, sp))) {
      // 役割語を落とす（残りが氏名＋敬称）
      start += sp + 1;
      name = name.slice(sp + 1);
      if (!new RegExp(`^${NAME_CORE}${HONORIFIC}$`).test(name)) continue;
    }
    if (STOP.has(name) || STOP.has(name.replace(/[ 　]/g, ""))) continue;
    out.push({ start, end: start + name.length, name });
  }
  return out;
}

/** 1トークン内の敬称付き氏名を切り出して r にする。該当がなければ元のまま返す */
export function splitNameTokens(tok: NameToken): NameToken[] {
  if (tok.t === "r" || tok.resolved) return [tok];
  const hits = findNames(tok.s);
  if (!hits.length) return [tok];
  const out: NameToken[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start > pos) out.push({ ...tok, s: tok.s.slice(pos, h.start) });
    out.push({ t: "r", s: h.name, note: "人名らしき語を検知しました（機械検出）" });
    pos = h.end;
  }
  if (pos < tok.s.length) out.push({ ...tok, s: tok.s.slice(pos) });
  return out.filter((t) => t.s.length > 0);
}

export function enforceNames<T extends { sections: { id: string; tokens: NameToken[] }[] }>(data: T): T {
  return {
    ...data,
    sections: data.sections.map((sec) => ({ ...sec, tokens: sec.tokens.flatMap(splitNameTokens) })),
  };
}
