---
name: start
description: Issue の作業を始める。Issue を読み、ブランチを切り、仕様の確認から着手する。「#12 をやって」「Issue 12 に着手して」と言われたときに使う。引数は Issue 番号
---

# Issue の作業を始める

1. Issue を読む: `gh issue view <番号> --comments`
2. 作業ツリーがきれいか確かめ、main を最新にする
   ```sh
   git status --short
   git switch main && git pull --ff-only
   ```
   未コミットの変更があれば、止めてユーザーに聞く
3. ブランチを切る: `git switch -c <種類>/<番号>-<短い英語名>`
   - 種類はラベルから決める（enhancement → feat、bug → fix、ops → chore）
4. 仕様を確かめる
   - `spec` ラベルあり: `docs/specs/` の該当する仕様書（requirements.md → design.md → tasks.md）を更新し、段階ごとに承認を得てから実装へ進む
   - `spec` ラベルなし: Issue の受け入れ条件を仕様とする。受け入れ条件があいまいなら、実装前にユーザーに確認し、Issue 本文を更新する
5. 実装の計画（変えるファイル、追加するテスト）を示し、承認を得てから実装する
6. 受け入れ条件ごとにテストを書き、`npm test` と `npm run typecheck` を通す
7. 画面を変えたときは、ローカルサーバー（`npm run dev`）で表示を確かめてもらう

実装中に仕様と食い違うことや不明点が出たら、推測で進めずに確かめ、Issue か仕様書を先に更新する。
終わったら `/pr` で PR を作る。
