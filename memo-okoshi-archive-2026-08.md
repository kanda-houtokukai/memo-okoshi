# メモおこし 経緯アーカイブ（2026-08）

> 台帳（memo-okoshi-handoff.md）の記録が10件を超えたときに、**最も古いものから原文のまま**移す場所。
> 要約・圧縮はしない（CLAUDE.md「台帳の維持」）。いまも効いている制約は移す前に台帳の
> 「生きている注意事項」へ昇格させてある。

---

## 2026-08-17 P0: 器の整備

- 公開リポジトリ kanda-houtokukai/memo-okoshi を作成・クローン（~/memo-okoshi）。
- CLAUDE.md（dev-workflow の claude-md-template から）・本台帳を初期化。
- ~/Downloads/memo-okoshi-mock-v6.html を docs/mock/ へ配置し、UI仕様の正本として凍結。
- アプリ実装・package.json・APIキー設定・Vercel連携は範囲外として実施せず（P1/P4へ送り）。
- ~/.claude/skills/design-process/SKILL.md はローカルに存在せず、「AI感の排除」追記はユーザーへ
  手動反映を案内（design-process スキルは claude.ai 側=プラグイン管理のため）。

## 2026-08-18 P1: 変換の核

- 手順0: ホーピー（mascot-avatar）の `.env` から `GEMINI_API_KEY` を画面非表示のまま
  `.env.local` へコピー。`git check-ignore` とステージ検査でコミット不可能を機械検証。
  ダミーメモ2枚（ChatGPT生成・伏せ字済み）を `docs/samples/` に配置（目視で個人名なし確認）。
- Next.js 15（App Router/TS）を手書き最小構成で初期化（create-next-appは非空ディレクトリ回避）。
- `lib/gemini.ts`: モデル一覧取得→Vision対応を版数降順（安定版先・flash優先）に試行、
  成功モデルをプロセス内キャッシュ。キーはURLでなく `x-goog-api-key` ヘッダで送信。
- 疎通結果: `gemini-3.7-flash` が失敗→ `gemini-3.6-flash` で成功（フォールバック実証）。
  2枚統合39秒・単画像28秒。response_mime_type=application/json 指定で3回ともパース成功。
- 動作確認: 該当なし項目は空tokens（shokan空）／3項目に絞ると残り内容がspillへ降格・
  suggest付与／insightsは観点提示トーンで独立生成。黄y・赤rは未出現（ダミーの字が綺麗
  すぎるため。伏せ字〇〇/△△をrにしない指示は機能）。
- npm install はグローバル設定でdeny→ユーザー承認「今回だけ許可」で一時解除→復元。
