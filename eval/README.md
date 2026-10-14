# 評価キット（P20・2026-10-14）

Gemini の無料枠のモデルは予告なく入れ替わる。新しいモデルに乗り換える前に、**同じ物差しで測る**ための道具。
選ぶ基準の最優先は **「読めない箇所を黄で申告するか」**（台帳 P7-c）。「毎日の見張り」や、有料枠・他社のモデルを比べるときにも使う。

## 使い方（リポジトリの直下で・Node の標準機能だけ）

```
node eval/run.mts                                  # 本番の優先リスト（lib/gemini.ts の PREFERRED）を 3件×3回
node eval/run.mts --models gemini:gemini-3.7-flash --runs 2
node eval/run.mts --cases hard --runs 1            # 1件だけ
node eval/run.mts --dry                            # API を呼ばずに組み立てだけ確かめる
```

- 鍵は `.env.local` の `GEMINI_API_KEY`（本番と同じ鍵・無料枠を使う。1日20回/モデル）。値は表示も保存もしない。
- 失敗しても再試行しない。429（枠切れ）が出たらそのモデルは止める。503（混雑）が2回続いても止める。
- 結果は `docs/eval/YYYY-MM-DD-HHMM.md`（表）と `.json`（各回の採点と変換の結果）。画像と鍵は残さない。

## 何を測るか

| 列 | 中身 |
|---|---|
| 要点の一致率 | 正解の要点（言い換えの候補つき）が1つの項目の中に出たか。読みにくくした箇所は除く（`eval/score.ts`） |
| 振り分け | 読めた要点のうち、正解の項目に入った割合（合否には入れない） |
| 黄（件） | 黄の印の数 |
| 黄∩印 | 読みにくくした箇所（印）のうち、黄で申告された数 |
| 申告なし | 印の箇所を黄・青なしで誤読・欠落させた数（正しく読めたものは数えない） |
| 作り話 | 正解に無い数を申告なしで書いた・塗った名前を書いた・正解側に挙げた作り話の語が出た |
| 〇〇 | 塗った箇所の前後に「〇〇」があるか |
| 時間・失敗 | 1回の時間（成功のみ）・失敗の HTTP ステータス |

合否の目安は `eval/criteria.ts` の1か所（作り話0・申告なし0・黄が印の半分以上・要点85%以上・〇〇すべて）。

## 本番と同じ経路

プロンプト＝`lib/prompt.ts` の `buildPrompt`（辞書は空）／呼び出し＝`lib/gemini.ts` の `callModel`（本番の `generateWithFallback` が使う1回の呼び出し・temperature 0）／
返答の読み取りと人名の機械検出＝`lib/convert-core.ts` の `finishConversion`（変換API と同じ）。画像はアプリが送る形（JPEG 0.92・`eval/make-inputs.py`）。

## メモ（正解は `eval/cases/*.json`・すべて架空のダミー）

| id | 元の画像 | 中身 | 印（読みにくくした箇所） |
|---|---|---|---|
| hard | docs/samples/dummy-memo-04-hard.png | 面談（成人・就労と金銭管理） | 眠剤・週1〜2・訪看・12,000円・10/3 |
| names | docs/samples/dummy-memo-07-names.png | 面談。架空の名前4か所を黒く塗ってある | 半分・2kg |
| symbols | docs/samples/dummy-memo-08-symbols.png | 会議。→・↑・↓・？・！ を使う | 10分・10/10 |

画像を作り直すとき: `python3 docs/samples/make-dummy-eval.py`（07・08）→ `python3 eval/make-inputs.py`（送る形の JPEG）。

## 提供元を足す（今回は足していない）

`eval/providers.ts` に1件足し、鍵を `.env.local` に置く。モデルは「提供元:モデル名」で指定する。
Gemini の有料枠は呼び方が同じで鍵だけ違う。他社は「プロンプトと画像を送り、返答の本文を返す」関数を書けば、後処理と採点はそのまま使える。
⚠️ 評価で測れることと、本番で使えること（その社の規約・規程整理）は別。
