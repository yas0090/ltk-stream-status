# ltk-stream-status

LTK 出場者の配信状況を表示するサイト（LTK4 Live Now）。

## 開発の進め方（Issue 駆動）

作業は GitHub の Issue 単位で進める。手順はスキル `/issue`・`/start`・`/pr` にまとめてある。

1. Issue を立てる（`.github/ISSUE_TEMPLATE/` のテンプレートに沿う）
2. ブランチを切る: `<種類>/<Issue番号>-<短い英語名>`（例: `feat/12-team-filter`、`fix/15-thumbnail-size`）
   - 種類は Conventional Commits と同じ（feat, fix, chore, docs, refactor, test, style）
3. 仕様を書く
   - 大きい機能（ラベル `spec`）: `docs/specs/` の仕様書を更新してから実装する。Issue から該当箇所へリンクする
   - 小さい修正・不具合: Issue 本文の受け入れ条件を仕様とする
4. PR を作る。本文に `Closes #<番号>` を書き、マージで Issue を閉じる
5. PR のテスト（`.github/workflows/test.yml`）が通ってからマージする。main への push でデプロイされる

## 決まりごと

- main へ直接コミットしない（緊急の修正を除く）
- コミット、push、Issue・PR の作成と変更は、内容を見せて確認を取ってから行う
- 画面を変えたときは、push 前にローカルサーバーで表示を確かめてもらう
- `docs/specs/stream-status/tasks.md` は Issue 駆動へ移る前の記録として残す。新しい作業は Issue で管理する

## ラベル

- `enhancement`: 機能追加・改善
- `bug`: 不具合
- `spec`: `docs/specs/` の仕様書を書いてから進める大きさの作業
- `ops`: 運用作業（デプロイ、外部サービスの設定、確認作業）

## よく使うコマンド

- `npm test` / `npm run typecheck` / `npm run build`
- `npm run dev`: ローカルで画面を確かめる
