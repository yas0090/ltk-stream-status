---
name: pr
description: 今のブランチの変更から PR を作る。作業が終わって「PR にして」「PR を出して」と言われたときに使う
---

# PR を作る

1. ブランチ名から Issue 番号を取り、Issue を読む: `gh issue view <番号>`
2. 確かめる
   ```sh
   npm run typecheck && npm test && npm run build
   ```
   失敗したら PR を作らず、結果を伝える
3. 受け入れ条件を一つずつ見て、満たしているか確かめる。満たしていないものがあれば伝える
4. 未コミットの変更があれば、Conventional Commits 形式（本文は日本語）のメッセージを示し、承認を得てコミットする
5. 本文を `.github/pull_request_template.md` に沿って書く
   - `Closes #<番号>` を必ず入れる
   - 確かめたことのチェックは、実際に行ったものだけ付ける
   - 画面の変更があれば、スクリーンショットを貼るようユーザーに頼む
6. タイトル（Conventional Commits 形式、日本語）と本文を見せ、承認を得てから push と PR の作成を行う

```sh
git push -u origin HEAD
gh pr create --title "<タイトル>" --body-file <本文のファイル>
```

本文のファイルはスクラッチパッドに置く。作ったら PR の URL と、テスト（test.yml）の結果を `gh pr checks <番号> --watch` で確かめて伝える。
