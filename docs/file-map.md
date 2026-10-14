# ファイルの地図

> どのファイルが何をするか（引くための地図。決まりの正本ではない）。索引は台帳 `memo-okoshi-handoff.md` の「主題の索引」。
> 2026-10-14 台帳から分けた（P24）。ファイルを足したり役割が変わったりしたら、ここを直す。

| ファイル | 役割 |
|---|---|
| memo-okoshi-handoff.md | 本台帳（正本・引き継ぎの入口はここ1本） |
| docs/rules/*.md | 主題ファイル（生きた決まり。主題ごとに1つ・索引は台帳の「主題の索引」。2026-10-14 P24 で台帳から分けた） |
| docs/file-map.md | このファイル（ファイルの地図。2026-10-14 P24 で台帳から分けた） |
| CLAUDE.md | セッション起動時の指示・台帳維持規則・凍結指定 |
| docs/mock/memo-okoshi-mock-v6.html | 設計意図の記録（凍結保存・更新しない。正本ではない） |
| docs/samples/dummy-memo-0{1,2}.png | 検証用ダミーメモ（AI生成・個人名なし・別人別日の児童面談） |
| lib/items.ts | 項目ライブラリ（面談 `ITEM_LIBRARY`／会議 `MEETING_LIBRARY`／見学 `VISIT_LIBRARY`・`libraryFor`・`isFixedType`。id=API契約の正本。面談の分類と既定値は2026-09-10に見直し） |
| lib/settings.ts | 項目の選択と表示順（`memo-okoshi:items`）。**記録と用紙が共有する**。鍵の定義はここだけ |
| lib/sheet.ts | 用紙の割り付け（A4に収める罫線の本数・枚数・行の重み `sheetRows`・頭の文言 `SHEET_HEAD`。純関数） |
| lib/stamp.ts / tests/stamp.test.mts | 完成形の押印欄（ラベルと寸法の唯一の定義・Word の twips と PDF の CSS をここから作る）／その検査とページ番号 |
| app/components/Home.tsx | ホーム画面（4枚のカード。**正本は実装**。docs/mock/kaigi-mock-v1.html が4枚の設計意図・home-mock-v3.html は3枚だった頃。どちらも凍結・参照のみ） |
| app/components/SheetMaker.tsx | 面談用紙を作る画面（**正本は実装**。docs/mock/home-youshi-mock-v2.html は凍結・参照のみ） |
| lib/record.ts | 確認画面の状態ロジック（純関数・不変条件はここでテスト） |
| app/globals.css | モックv6の `<style>` の逐語コピー＋末尾に実装用の追加のみ |
| app/components/ | **UI仕様の正本**（Review/SectionCard/Popover/Drawer/OutputOverlay/MemoPane＋Intake/Redact/StepHeader/Toast） |
| lib/mask.ts | 黒塗りのストロークモデル（純関数・undo/全消去の履歴）＋Canvas描画 |
| lib/pages.ts | 取り込み（画像/PDF→ImageBitmap・EXIF向き反映）と焼き込み書き出し `exportMasked` |
| tests/mask.test.mts | 「取り消せない状態にしない」の機械テスト |
| app/robots.ts | 検索回避（noindex） |
| lib/vocab.ts / app/components/VocabDrawer.tsx | 組織語彙の辞書（端末内保存・人名ガード・ドロワー・バックアップの純関数） |
| lib/backup.ts | 辞書＋面談・会議の設定の書き出し/読み込み（ブラウザ側） |
| lib/names.ts / tests/names.test.mts | 人名（敬称付き氏名）の機械検出＝赤の保険（原則3・面談と会議）。〇〇 は拾わない |
| tests/red.test.mts | 原則3（赤＝伏せ忘れの知らせ）: 確認で外れる・✎ の抜け道・〇〇・会議にも赤・辞書に人名を入れない |
| lib/stage.ts / app/components/useZoomPan.ts | 拡大・移動の座標計算とジェスチャー（黒塗り・元メモで共用） |
| app/components/Dialog.tsx | 確認ダイアログ（戻る・やり直し・未塗り・再変換の同意） |
| lib/docx.ts / lib/export.ts | Word（最小 .docx を自前生成・JSZip は CDN）／PDF（印刷用レイアウト＋ブラウザ印刷・完成形の `@page` を差し込む） |
| tests/print-doc.test.mts | 完成形の PDF（余白が Word と同じ・用紙の @page を巻き込まない・はみ出さない・項目をページで割る） |
| tests/p6.test.mts | 再変換マージ・Word の不可視文字/混入検査・バックアップ読み込み |
| docs/mock/kuronuri-mock-v1.html | 黒塗り画面の動作仕様（凍結・参照のみ） |
| docs/mock/torikomi-mock-v1.html | 取り込み画面の動作仕様（凍結・参照のみ。**並べ替えだけは実装が正**） |
| docs/mock/tsukaikata-mock-v3.html | 使い方ページの**体裁の設計意図の記録**（2026-09-12〜・凍結・参照のみ。正本は実装）。v2 は章立ての記録 |
| docs/mock/tsukaikata-mock-v1.html | 使い方ページの**体裁**の記録（凍結・参照のみ。**文面の正本は実装へ移管**） |
| docs/mock/steps-mock-v1.html | ステップ表示の比較（凍結・参照のみ。**A案=採用／B案=不採用**） |
| docs/mock/toolbar-mock-v1.html | 操作導線（凍結・参照のみ。下の操作帯／左の縦帯／使い方は**案C採用**） |
| lib/notice-copy.ts / app/components/NoticeDialog.tsx / tests/notice.test.mts | ホームの「利用上の注意」の文面の正本／押したときだけ開く本文（.dlg）／その検査 |
| lib/about-copy.ts | 使い方ページの**文面の正本**（承認済みの文面。tests/about.test.mts が控えと突き合わせる） |
| app/components/ChapterIndex.tsx | 章の目次（小口のインデックス・上の帯）。使い方ページと読みもので共有（P17） |
| lib/yomimono-copy.ts / app/yomimono/[slug]/page.tsx / tests/yomimono.test.mts | 読みものの文面の正本と一覧 `READINGS`／読みもののページ（ゲートの外）／その検査 |
| lib/analytics.ts / tests/analytics.test.mts | 利用状況の計測（Web Analytics の script と、クエリを落とす初期化・本番のビルドだけ）／その検査 |
| lib/hand-font.ts | 手書き風の字（Klee One）の読み込み先（読みもの・ホームの棚・開発データの元メモだけ） |
| docs/mock/tsukaikata-index-mock.html / memo-kotsu-mock.html | 目次（**案Bだけ採用**）／ホームの入口（**入口Bだけ採用**）と読みもの（P17・凍結・参照のみ） |
| docs/assets/memo-okoshi-icon-src.png | アプリアイコンの原本（**無加工**。48px以上のもと） |
| docs/assets/memo-okoshi-icon-small-src.png | 小サイズ版の原本（**無加工**。16・32px のもと。橙地で潰れない） |
| app/about/ ＋ public/icon-*.png ＋ app/manifest.ts | 使い方ページ／アイコン各サイズ／マニフェスト（standalone） |
| tests/about.test.mts / tests/icon.test.mts | 使い方ページの文面とゲートの穴／アイコンとマニフェストの検査 |
| tests/sheet-order.test.mts | 用紙の並び（群の中だけ・記録側と分離・長押し） |
| lib/reorder.ts / tests/reorder.test.mts | ページ並べ替えの純関数（落とし先の判定・ドラッグと←→の一致） |
| docs/mock/gate-mock-v1.html | 合言葉画面の動作仕様（凍結・参照のみ） |
| docs/samples/dummy-memo-03-names.png | 架空の氏名を書き込んだ検証用（赤マーカーの検証。PIL で生成） |
| docs/assets/help/*.png（原本）／public/help/*.png（配信） | 使い方ページの画面写真12枚（ダミーのメモ。由来は README。01 は P17 で棚ごと撮り直し） |
| docs/assets/help/shoot.mjs | 画面写真を撮る道具（ヘッドレス Chrome・Node の標準機能だけ。写真は `SHOTS` に足す。いまは 01・02・08・09・11。要素の範囲の切り出しも） |
| docs/samples/dummy-memo-04-hard.{png,md} | **判読しにくい**検証用（成人・就労/金銭管理。**わざと5か所を潰してある**。md が原本＝正解） |
| docs/samples/make-dummy-04-hard.py | 上を作る一回きりのツール（PIL＋Klee。種を固定。ビルド・テストとは無関係） |
| tests/vocab.test.mts | 辞書とプロンプト差し込みのテスト |
| tests/visit.test.mts / docs/samples/dummy-memo-09-visit.{png,md} ＋ make-dummy-09-visit.py | 見学記録の検査／見学のダミー（名前・来所者の名前・住所を塗った用紙。md が正解） |
| tests/meeting.test.mts | 記録の種類（面談／会議）の検査（会議にも赤・会議の用紙・用紙に押印欄が無いこと・鍵の分離） |
| docs/mock/kaigi-mock-v1.html | 会議対応（ホーム4枚・会議の用紙・確認画面）の設計意図（P9・凍結・参照のみ） |
| docs/samples/dummy-memo-05-meeting.{png,md} ＋ make-dummy-05-meeting.py | 会議のダミー（架空。内容・決定・今後の対応を混ぜて書いてある。md が正解） |
| docs/samples/dummy-memo-06-meeting-sheet.{png,md} ＋ make-dummy-06-meeting-sheet.py | 記入済みの会議の用紙のダミー（架空。**会議名は頭の欄にだけ**書いてある。md が正解） |
| tests/ui-text.test.mts | 画面文言の機械検査（「黒塗り」が残っていないこと・辞書の例示が正しい語であること） |
| middleware.ts / lib/gate.ts | 合言葉ゲート（ACCESS_CODE 設定時のみ・Cookie照合） |
| app/gate/page.tsx / app/api/gate/route.ts | 合言葉の入口と照合API |
| tests/invariants.test.mts | 不変条件2点の機械テスト（`npm test`） |
| lib/dev-fixture.json / tests/fixture.test.mts | `?fixture=1` 用の開発データ（モックv6の内容を再現。**撮影用のビルドだけ**が組み込む）／本番のビルドに入らないことの検査 |
| lib/prompt.ts | 変換プロンプト生成（項目構成を実行時差し込み） |
| lib/gemini.ts | Geminiクライアント（一覧取得→**2段 `MODEL_TIERS`（試験済み→緊急用）の中だけを試す**・失敗の種類と呼び直さない間・temperature 0・キーはヘッダ送信） |
| app/api/convert/route.ts | 変換API（multipart受け→2段の順に呼ぶ→後処理は lib/convert-core.ts・読んだ段 `tier` を返す） |
| lib/convert-core.ts | 返答の読み取り（JSON の救済）と人名の機械検出。変換API と評価キットが共有（P20） |
| eval/（run.mts・score.ts・criteria.ts・providers.ts・cases.ts・cases/）/ docs/eval/ / tests/eval.test.mts | 評価キット（モデルを同じ物差しで測る。鍵は評価用だけ＝providers.ts の `keyFor`。使い方は eval/README.md）／その結果（日付つき）／その検査 |
| eval/watch.mts / .github/workflows/watch.yml / tests/p23.test.mts（＋ no-net.mjs・watch-mock.mjs） | 毎日の見張り（22:00・Issue・watch-log ブランチ）／その起動／緊急用・評価用の鍵・見張りの検査（ネットに出ない偽物つき） |
| docs/samples/dummy-memo-07-names.png・08-symbols.png ＋ make-dummy-eval.py | 評価用のダミー（名前4か所を塗った面談／記号の会議。正解は eval/cases/*.json） |
| app/page.tsx | 画面の状態機械（取り込み→黒塗り→変換→確認→新しい変換）。元画像はここのメモリにしか無い |
| .env.local | GEMINI_API_KEY（**git管理外**・コミット禁止検証済み） |

同種ファイルの正本: UI仕様は**実装（app/components + app/globals.css）が正本**（2026-09-07移管）。
モックv6は設計意図の記録として凍結保存。旧版モック（v1〜v5）はリポジトリに置かない。
