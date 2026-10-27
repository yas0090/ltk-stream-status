# タスク: GitHub 上で Claude に計画・実装を任せる

Issue: #4 / 要件: [requirements.md](requirements.md) / 設計: [design.md](design.md)

## 1. 準備（持ち主が行う）

- [x] 1-1. Claude GitHub App を `ltk-stream-status` だけにインストールする（2026-10-27 済み）
- [x] 1-2. 手元で `claude setup-token` を実行し、トークンを Secret `CLAUDE_CODE_OAUTH_TOKEN` に登録する（2026-10-27 済み）
- [ ] 1-3. トークンの期限（1 年後）を控える

## 2. Claude を動かすワークフロー（`.github/workflows/claude.yml`）

- [x] 2-1. トリガーと動かす条件（AC-12）
  - `issues: labeled`、`issue_comment: created`
  - job の `if`: 持ち主の操作、`claude` ラベル、`@claude` を含む、PR へのコメントでない
- [x] 2-2. Node の用意、`npm ci`、claude-code-action の設定（AC-13, 14, 16）
  - `claude_code_oauth_token`、`label_trigger`、`trigger_phrase`、ブランチ名、`include_comments_by_actor`、`--allowedTools`
  - `permissions`、`timeout-minutes: 30`、`concurrency`
- [x] 2-3. 失敗・キャンセル時に Issue へコメントするステップ（AC-15）

## 3. プレビュー（`.github/workflows/preview.yml`）

- [x] 3-1. 画面に関わるファイルを変えた PR で、ビルドし、本番の `site-data.json` を置いて Cloudflare Pages のプレビューに出す（AC-11）
  - Cloudflare のトークンはデプロイのステップにだけ渡す
- [x] 3-2. `dist/` に秘密情報がないことを確かめるステップを入れる（AC-13）
- [x] 3-3. プレビュー URL を PR にコメントする。同じ PR では 1 つのコメントを更新する

## 4. Claude への指示（CLAUDE.md）

- [x] 4-1. 「GitHub Actions で動くとき」の節を足す（AC-2〜6, 8〜10）
  - 段階の判断、`@claude 承認` での承認、承認の記録、仕様書は実装の PR で書く
  - 禁止事項: マージしない、ワークフローを変えない、依存を追加しない
- [x] 4-2. ブランチ名の決まりに `claude/<番号>-<説明>` を足す

## 5. 確認（main にマージしてから、試しの Issue で行う）

- [ ] 5-1. 設計の「実装時に確かめること」を確かめ、違っていれば設計を直す
- [ ] 5-2. `spec` なしの Issue で、計画 → 修正依頼 → 承認 → PR まで進める（AC-1, 4, 5, 7〜10）
  - 2026-10-27 #6 で確認。計画・修正依頼・承認の記録・実装・push はできたが、`gh pr create` が拒否されて PR を作れなかった。PR の作り方を直し、次の Issue で確かめ直す
- [x] 5-3. 画面を変える PR でプレビュー URL が出て、本番が変わっていない（AC-11）（2026-10-27 #7 で確認）
- [ ] 5-4. `spec` ありの Issue で、要件 → 設計 → タスク → 実装まで進める（AC-2, 3）
- [ ] 5-5. あいまいな Issue で質問が返る（AC-6）
- [ ] 5-6. 持ち主以外では動かないことを、ワークフローの条件と実行履歴で確かめる（AC-12）
- [ ] 5-7. トークンを一時的に外して失敗させ、失敗のコメントが付く（AC-15）
- [ ] 5-8. 実行ログ・コメント・PR・プレビューに秘密情報がない（AC-13）
