# 設計: GitHub 上で Claude に計画・実装を任せる

Issue: #4 / 要件: [requirements.md](requirements.md)

## アーキテクチャ

```
持ち主が Issue に claude ラベルを付ける ─┐
持ち主が Issue に @claude とコメントする ─┤
                                          ▼
        .github/workflows/claude.yml（GitHub Actions）
          1. 持ち主か、claude ラベル付きの Issue か、PR でないかを確かめる
          2. Node を用意し npm ci
          3. anthropics/claude-code-action@v1 を動かす
             - Issue 本文とコメントを読み、CLAUDE.md の手順に従って今の段階を判断する
             - 進み具合を 1 つのコメントに書き、更新していく
          4. 失敗したら Issue に失敗したことと実行ログの URL をコメントする
                                          │ 実装の段階なら
                                          ▼
                 ブランチ claude/<番号>-<説明> に push し、PR を作る
                                          │
               ┌──────────────────────────┴───────────────────┐
               ▼                                              ▼
   test.yml（既存）: 型チェック・テスト・ビルド    preview.yml: 画面に関わる変更なら
                                                   Cloudflare Pages にプレビューを出し、
                                                   URL を PR にコメントする
                                          │
                                          ▼
                              持ち主が確かめてマージ
```

## 段階の進め方

Claude は実行のたびに新しく起動し、前回の会話を覚えていない。今の段階は **Issue のコメントの流れから判断する**。判断のしかたは CLAUDE.md の「GitHub Actions で動くとき」に書く。

| 状況 | Claude がすること |
|---|---|
| `claude` ラベルが付いた（`spec` なし） | 計画をコメントする |
| `claude` ラベルが付いた（`spec` あり） | 要件をコメントする |
| `@claude 承認` のコメント（`spec` なし） | 実装して PR を作る |
| `@claude 承認` のコメント（`spec` あり） | 要件 → 設計 → タスクの次の段階をコメントする。タスクが承認されたら実装して PR を作る |
| `@claude` を含む、承認以外のコメント | 修正依頼として、直したものをコメントする。質問なら答える |
| 内容があいまい | 推測せず、質問をコメントする |

- **承認の見分け方**: コメントが `@claude 承認` で始まるときだけ承認とする。それ以外はすべて修正依頼や質問として扱い、実装を始めない（AC-4）。決まった言葉にするのは、あいまいな返事で意図せず実装が始まるのを防ぐため
- **承認の記録**: 承認を受けたら、進み具合のコメントの先頭に「YYYY-MM-DD 承認: <段階>」を書く（AC-5）
- **仕様書の置き場所**: `spec` の Issue でも、要件・設計・タスクは承認まで Issue のコメントでやり取りする。承認された内容は、実装の PR で `docs/specs/<機能名>/` に書く。claude-code-action は Issue からの実行のたびに新しいブランチを作るため、段階ごとにコミットすると内容が別々のブランチに分かれてしまう。仕様と実装が 1 つの PR にまとまるので、レビューもしやすい

## ワークフロー（`.github/workflows/claude.yml`）

```yaml
on:
  issues:
    types: [labeled]
  issue_comment:
    types: [created]
```

### 動かす条件（job の `if`）

すべてを満たすときだけ動かす（AC-12）。

- 操作した人が持ち主（`github.actor == github.repository_owner`）
- ラベルの操作なら、付けたラベルが `claude`
- コメントなら、`@claude` を含み、Issue に `claude` ラベルが付いていて、PR へのコメントではない（`!github.event.issue.pull_request`。PR 上での応答は対象外）

claude-code-action も既定で書き込み権限のない人を拒否するが、コラボレーターを将来追加したときにも持ち主だけに絞れるよう、ワークフロー側でも確かめる。

### claude-code-action の設定

| 入力 | 値 | 理由 |
|---|---|---|
| `claude_code_oauth_token` | `secrets.CLAUDE_CODE_OAUTH_TOKEN` | 契約プランで動かす（AC-16）。`claude setup-token` で作る 1 年有効のトークン |
| `label_trigger` | `claude` | |
| `trigger_phrase` | `@claude` | |
| `branch_prefix` / `branch_name_template` | `claude/` / `{{prefix}}{{entityNumber}}-{{description}}` | Claude が作ったブランチだと分かるようにする |
| `include_comments_by_actor` | `yas0090,claude[bot]` | 公開リポジトリなので、他人のコメントに紛れ込ませた指示を読ませない（AC-12, 13） |
| `claude_args` | `--allowedTools` で下の Bash だけを許す | 必要なコマンドだけを使わせる（AC-14） |

許す Bash コマンド: `npm test`、`npm run typecheck`、`npm run build`、`git` の操作、`gh pr create`。`npm ci` や `npm install` は許さず、依存の追加が必要なら計画でそう伝え、持ち主が手元で行う。

PR の本文は `tmp/pr-body.md` に書き、`gh pr create --body-file` の 1 コマンドで作らせる（2026-10-27 追加: #6 で `gh pr create` が許可の判定で拒否され、PR を作れなかったため。本文を `$(...)` やヒアドキュメントで渡したことが原因とみている）。`gh` が使うトークン（`GH_TOKEN`）は claude-code-action が Claude の実行環境に渡している。原因を追えるよう `display_report: true` で実行結果のページに報告を出す。

### 権限

```yaml
permissions:
  contents: write
  issues: write
  pull-requests: write
  id-token: write
```

- 秘密情報は `CLAUDE_CODE_OAUTH_TOKEN` だけを渡す。Twitch・YouTube・Cloudflare の値は Claude の job に渡さない（AC-13）。テストは秘密情報なしで通る（PR #3 の test.yml で確かめた）
- Claude GitHub App はワークフローファイルを書き換えられない。`.github/workflows/` の変更が必要なら、計画でそう伝え、持ち主が手元で行う
- `show_full_output` は既定の `false` のままにする（公開リポジトリの実行ログに出力が残るため）

### 失敗したとき（AC-15）

claude-code-action の進み具合のコメントは、失敗したときの表示が保証されていない。最後に `if: failure() || cancelled()` のステップを置き、`gh issue comment` で失敗したことと実行ログの URL を Issue に書く。

- `timeout-minutes: 30`
- `concurrency: claude-<Issue番号>`（同じ Issue での実行が重ならないようにする。キャンセルはしない）

## プレビュー（`.github/workflows/preview.yml`、AC-11）

```yaml
on:
  pull_request:
    paths: ["src/web/**", "src/shared/**", "vite.config.ts", "data/changelog.yaml"]
```

`data/` の変更は配信状態の取得（`npm run generate`）を通さないと画面に出ないため、プレビューの対象にしない。データの変更は本番に反映して確かめる。ただし更新履歴（`data/changelog.yaml`）は配信状態と関係なく差し替えられるので対象にする（#28）。

1. `npm ci` → `npm run build`
2. 本番の `site-data.json` を `PUBLIC_SITE_URL` から取って `dist/` に置く。配信状態の取得はしない（YouTube のクォータを使わないため）
3. `npm run preview-data`（`src/fetch/preview-main.ts`）で、`dist/site-data.json` の `changelog` だけを PR の `data/changelog.yaml` の内容に差し替える。検証と並べ替えは取得処理と同じ `parseChangelogData`・`sortChangelog` を使い、形式が違えば失敗させる。ファイルの読み書きだけで API は呼ばない
4. `wrangler pages deploy dist --branch=<PR のブランチ名>` で、本番とは別のプレビュー URL に出す（本番は `--branch=main` なので影響しない）
5. URL を PR にコメントする。同じ PR では 1 つのコメントを更新する

- Cloudflare のトークンは、デプロイのステップにだけ渡す（ビルド中のコードから読めないようにする）
- フォークからの PR では Secret が渡らないので動かない。持ち主の PR だけが対象なので問題ない
- プレビューの URL は公開される。本番と同じ内容なので問題ない

## CLAUDE.md とスキル

- CLAUDE.md に「GitHub Actions で動くとき」の節を足す。段階の判断、承認の見分け方、記録のしかた、コメントの書き方、禁止事項（マージしない、ワークフローを変えない、依存を追加しない）を書く
- 既存の「決まりごと」にある「確認を取ってから行う」は、GitHub 上では「承認のコメントを受けてから行う」と読み替えると書く
- ブランチ名の決まりに `claude/<番号>-<説明>` を足す
- 手元のスキル（`/issue`・`/start`・`/pr`）はそのまま使う

## 持ち主が行う設定

1. Claude GitHub App をリポジトリにインストールする（https://github.com/apps/claude）
2. 手元で `claude setup-token` を実行し、出たトークンを Secret `CLAUDE_CODE_OAUTH_TOKEN` に登録する
3. トークンの期限（1 年）をカレンダーなどに控える

## 要件の変更

設計の過程で、要件を次のとおり変える。

- AC-2: 仕様書は承認まで Issue のコメントでやり取りし、実装の PR で `docs/specs/` に書く
- AC-7: Claude のブランチ名は `claude/<Issue番号>-<説明>` とする

## 実装時に確かめること

2026-10-27 に #6, #9 で確かめた結果。

- Claude GitHub App のトークンで作った PR で、test.yml と preview.yml が動くか → 動いた（PR #11）
- `gh pr create` を Claude から使えるか → `GH_TOKEN` は渡されているが、本文を `$(...)` などで渡すと拒否された。`--body-file` の 1 コマンドにして作れた（PR #11）
- リポジトリの CLAUDE.md を、Actions 上の Claude が読むか → 読んだ（段階の判断、承認の記録、PR テンプレートに従っていた）。`.claude/skills/` は使う場面がなく、確かめていない
- App のトークンは action の最後に失効するため、後のステップで PR を作る方法は使えない

## 受け入れ条件と確かめ方

ワークフローは自動テストしにくいので、試しの Issue を作って手で確かめる。

| AC | 確かめ方 |
|---|---|
| AC-1, 6 | `claude` ラベルを付け、計画（あいまいなら質問）がコメントされる |
| AC-2, 3, 5 | `spec` 付きの Issue で、要件 → 設計 → タスクと承認を進め、承認の記録が残る |
| AC-4 | 「@claude ここを直して」で計画が直り、実装は始まらない |
| AC-7, 8, 9, 10 | 承認後に `claude/` ブランチの PR ができ、本文に `Closes` がある。マージされていない |
| AC-11 | 画面を変える PR にプレビュー URL がコメントされ、本番が変わっていない |
| AC-12 | 別アカウント（またはワークフローの条件の確認）で、持ち主以外では動かない |
| AC-13 | 実行ログ・コメント・PR・プレビューに秘密情報がない（deploy.yml と同じ grep をプレビューにも入れる） |
| AC-15 | わざと失敗させ（例: トークンを外す）、失敗のコメントが付く |
