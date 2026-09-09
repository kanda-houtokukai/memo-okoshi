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
