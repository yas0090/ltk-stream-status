# 設計: LTK 出場者配信状況サイト

要件: [requirements.md](requirements.md)

## アーキテクチャ

静的サイトを GitHub Pages で公開し、GitHub Actions の定期実行で配信状態を取得してサイトを再デプロイする。サーバーとデータベースは持たない。配信状態は毎回すべて取得し直し、前回の結果は保存しない。

GitHub Actions と Pages を無料で使うため、リポジトリは公開する。公開に伴う対策は次のとおり。

- Secret scanning と Push protection を有効にする
- トークンや API のレスポンス全体をログに出さない
- ワークフローの起動条件に `pull_request_target` を使わない
- 外部の Action は公式のもの（`actions/*`）だけを使う
- コミットには GitHub の noreply アドレスを使う
- YouTube の API キーは YouTube Data API 専用に制限する

```
┌──────────────────────── GitHub Actions（5分ごと / push / 手動）─────────────────────────┐
│                                                                                       │
│  data/*.yaml ──▶ ① 検証 ──▶ ② 配信状態の取得 ──▶ ③ site-data.json 生成 ──▶ ④ ビルド ──▶ ⑤ デプロイ │
│                   │          ├ Twitch Helix API                                     │      │
│                   │          └ YouTube RSS + Data API                               │      │
│                   └ 失敗したら中断（前回のサイトが残る）                                    │      │
└──────────────────────────────────────────────────────────────────────────────┼──────┘
                                                                               ▼
                                                     GitHub Pages（index.html, JS, site-data.json）
                                                                               ▲
                                                                       視聴者のブラウザ
```

- 秘密情報（Twitch のクライアントシークレット、YouTube の API キー）は GitHub Actions の Secrets に置き、取得処理の中だけで使う。配信されるファイルには含めない（AC-26）
- 取得結果はリポジトリにコミットせず、Pages のアーティファクトとして直接デプロイする。5 分ごとのコミットで履歴が膨らむのを避けるため
- LTK タグの判定は取得処理の中で行い、結果を site-data.json に書き込む。キーワードの変更は次の更新から反映される（AC-14）
- ブラウザは site-data.json を読み込んで画面を描画し、並び替えと絞り込みはブラウザ内で行う

## 技術選定

| 対象 | 採用 | 理由 |
|---|---|---|
| ホスティング | GitHub Pages | 公開リポジトリなら無料。データファイルや定期実行と同じ場所で管理できる |
| 定期実行 | GitHub Actions（schedule） | 公開リポジトリなら実行時間が無制限で無料。Secrets で秘密情報を管理できる |
| 言語 | TypeScript（Node.js 24） | 取得処理と画面で、型と判定ロジック（正規化、並び順）を共有できる |
| 画面 | Vite + TypeScript（フレームワークなし） | 画面は一覧と絞り込みだけで小さい。依存を減らして保守を軽くする |
| データファイル | YAML | 手で編集しやすく、コメントを書ける |
| データ検証 | zod | スキーマから型も作れ、エラー内容がわかりやすい |
| テスト | Vitest | Vite と設定を共有できる |

### 検討して採用しなかった案

- **Cloudflare Workers（Cron Triggers + KV、または訪問時に取得してキャッシュ）**: 定期実行の時刻は GitHub Actions より正確。ただし無料プランでは、外部へのリクエストが 1 回の実行につき 50 件までに制限される。YouTube の RSS はチャンネルごとに 1 件かかるので、出場者 60 人の多くが YouTube を使うと上限を超える。CPU 時間（1 回 10ms）も、RSS の解析で上限に近づくおそれがある
- **AWS Lambda + EventBridge + S3**: 支払いの上限を止める仕組みがなく、公開した取得先に大量アクセスが来ると請求が発生しうる（AC-24 に反する）
- **ブラウザから直接 API を呼ぶ**: Twitch のアプリトークンの発行にはクライアントシークレットが必要で、ブラウザには置けない。YouTube は訪問のたびにクォータを消費し、すぐに上限に達する
- **YouTube の `search.list`（eventType=live）**: 1 回 100 ユニットかかり、無料枠（1 日 10,000 ユニット）では 1 日 100 回しか呼べない（AC-25 を満たせない）
- **YouTube のチャンネル `/live` ページの解析**: 公式の API ではなく、ページの構造が変わると動かなくなる

## データモデル

### 入力: `data/teams.yaml`（管理者が編集する）

```yaml
teams:                      # 書いた順がチームの表示順（AC-2）
  - id: team-a              # 英数字とハイフン。絞り込みの識別に使う
    name: チームA
    players:                # 書く順は自由（表示は階級・ロールで並び替える）
      - name: 選手1
        tier: Next          # Next | Core | Masters
        role: TOP           # TOP | JG | MID | ADC | SUP
        channels:           # 1 つ以上
          - platform: twitch
            login: example_login
          - platform: youtube
            channelId: UCxxxxxxxxxxxxxxxxxxxxxx
```

### 入力: `data/keywords.yaml`

```yaml
ltkKeywords:
  - LTK
```

### 検証ルール（AC-23）

- 必須項目: チームの `id` と `name`、選手の `name`・`tier`・`role`、1 つ以上の `channels`
- `tier` と `role` は上の列挙値だけを許す
- `twitch` は `login`、`youtube` は `channelId`（`UC` で始まる 24 文字）を必須にする
- 1 チームの中で、同じ `tier` と `role` の組み合わせが重複したらエラーにする
- チーム `id` の重複と、同じチャンネルの重複登録はエラーにする
- 検証に失敗したら処理を終了コード 1 で終える。デプロイは行われず、前回のサイトが残る。GitHub からワークフロー失敗の通知メールが届く

### 出力: `site-data.json`（取得処理が生成し、ブラウザが読み込む）

```ts
type SiteData = {
  generatedAt: string;          // ISO 8601。最終更新日時（AC-9, AC-10）
  teams: {
    id: string;
    name: string;
    players: {
      name: string;
      tier: "Next" | "Core" | "Masters";
      role: "TOP" | "JG" | "MID" | "ADC" | "SUP";
      channels: {
        platform: "twitch" | "youtube";
        channelUrl: string;     // チャンネルページ（AC-6）
        state: "live" | "offline" | "error";   // error = 取得失敗（AC-22）
        streams: {              // state=live のときだけ要素がある。複数同時配信に対応（AC-8）
          title: string;
          url: string;          // 配信ページへの直接リンク（AC-7）
          ltk: boolean;         // LTK タグ（AC-12, AC-13）
        }[];
      }[];
    }[];
  }[];
};
```

- チームの並び順はデータファイルの順のまま出力する。階級とロールの並び替えは画面側で行う
- 選手が配信中かどうかは「どれかのチャンネルが live」で判定し、画面側で計算する

## 配信状態の取得

### Twitch

1. Client Credentials Flow でアプリのアクセストークンを取得する（`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`）
2. `GET /helix/streams?user_login=...&type=live` を、100 件ずつ呼ぶ
3. 返ってきた login は `live`、返ってこなかった login は `offline` にする
4. リクエストが失敗した場合は、そのバッチに含まれる全チャンネルを `error` にする
5. Twitch の配信ページはチャンネルページと同じ URL（`https://www.twitch.tv/{login}`）になる

### YouTube

1. チャンネルごとに RSS（`https://www.youtube.com/feeds/videos.xml?channel_id=...`）を取得し、直近の動画 ID を集める。RSS はクォータを消費しない
   - 公開日時が 7 日以内の動画だけを候補にして、API の呼び出し回数を減らす
   - RSS の取得に失敗したチャンネルは `error` にする
2. 候補の ID を `videos.list`（`part=snippet,contentDetails`）で 50 件ずつ問い合わせる。1 回 1 ユニット（`YOUTUBE_API_KEY`）
3. 次の 2 つをどちらも満たす動画を配信中とみなす
   - `snippet.liveBroadcastContent == "live"`。これで配信予定（`upcoming`）は除外できる
   - `contentDetails.duration == "P0D"`。プレミア公開は動画の長さを持つので、これで除外できる
4. 配信中の動画が 1 本以上あれば `live`、なければ `offline` にする。`videos.list` が失敗した場合は、そのバッチに関係するチャンネルを `error` にする

**クォータの見積もり**: 出場者は 60 人（4 チーム × 15 人）。最も多い場合として全員が YouTube チャンネルを持ち、候補が平均 5 本と仮定すると、1 回の実行で 300 本＝6 ユニットかかる。288 回/日で 1,728 ユニット/日となり、上限 10,000 に対して十分な余裕がある（AC-25）。

**リスク**: プレミア公開の判定（`P0D`）と、RSS に配信中の動画が載るまでの遅れは、実装時に実際のデータで確かめる。

### LTK タグの判定（AC-12, AC-13）

```ts
const normalize = (s: string) => s.normalize("NFKC").toLowerCase();
const isLtk = (title: string, keywords: string[]) =>
  keywords.some((k) => normalize(title).includes(normalize(k)));
```

## 画面

1 ページだけの構成にする。

```
┌──────────────────────────────────────┐
│ LTK 配信状況        最終更新 18:40     │  ← 30分以上前なら警告帯を表示（AC-10）
├──────────────────────────────────────┤
│ [チーム ▼] [階級 ▼] [□配信中のみ] [□LTKのみ] [解除] │
├──────────────────────────────────────┤
│ ■ チームA                             │
│   Next                               │
│   ● 選手1  TOP                        │  ● 赤 = 配信中 / 灰 = 配信していない（AC-5）
│     [Twitch] 配信タイトル… [LTK]  ▶配信 │
│     [YouTube] チャンネル               │
│   ○ 選手2  JG   [Twitch] チャンネル    │
│   Core                               │
│   ...                                │
└──────────────────────────────────────┘
```

- **並び順**: チーム（データの順）→ 階級（Next → Core → Masters）→ ロール（TOP → JG → MID → ADC → SUP）（AC-2〜4）。階級とロールの組み合わせは 1 チームの中で一意なので、これで順番が 1 通りに決まる
- **チャンネル表示**: すべてのチャンネルにプラットフォーム名とチャンネルページへのリンクを表示する（AC-6）。配信中なら配信タイトル、LTK タグ、配信ページへのリンクを加える（AC-7, AC-8）。取得に失敗したチャンネルには「取得失敗」と表示する（AC-22）
- **絞り込み**（AC-15〜19）
  - チームと階級は複数選択のチェックボックスにする。何も選ばない状態は「すべて」と同じ扱いにする
  - 軸の中は OR、軸の間は AND で組み合わせる
  - 「LTK のみ」は、LTK タグ付きの配信がある選手だけを表示する
  - 出場者が 0 人になったチームや階級は表示しない
  - 「解除」ですべての条件を初期状態に戻す
- **データの再読み込み**: ページを開いている間は 5 分ごとに site-data.json を読み直す。GitHub Pages はキャッシュを最大 10 分持つので、クエリ文字列にタイムスタンプを付けて読み込む
- **警告**: `now - generatedAt >= 30分` のとき、データが古いことを示す警告帯を表示する。1 分ごとに判定し直す（AC-10）
- **レスポンシブ**: 1 カラムの構成にし、長いタイトルは折り返す。360px 幅でも横スクロールが出ないようにする（AC-11）

## ディレクトリ構成

```
data/
  teams.yaml
  keywords.yaml
src/
  shared/        # 型、スキーマ、正規化、LTK判定、並び順、絞り込み（取得処理と画面で共有）
  fetch/         # 配信状態の取得処理（Twitch, YouTube, site-data.json 生成）
  web/           # 画面（index.html, main.ts, style.css）
tests/
.github/workflows/deploy.yml
```

## ワークフロー（`.github/workflows/deploy.yml`）

- **起動条件**
  - `schedule: */5 * * * *`（AC-21）
  - `push`（main ブランチ）
  - `workflow_dispatch`
- **手順**: checkout → 依存のインストール → テスト → データ検証と取得（site-data.json 生成）→ Vite でビルド → `actions/upload-pages-artifact` → `actions/deploy-pages`
- **同時実行**: `concurrency: pages` を指定し、実行が重なったら古いほうを取り消す
- **注意点**
  - 公開リポジトリでは、60 日間リポジトリに動きがないと定期実行が自動で止まる。大会期間中はデータの更新で動きが出る想定だが、運用メモに残す
  - カスタムワークフローでデプロイする場合、Pages のビルド回数の上限（1 時間 10 回）は適用されない

## 受け入れ条件とテストの対応

| AC | 検証方法 |
|---|---|
| AC-1〜4 | 単体テスト: 並び替えの関数（チーム順、階級順、ロール順） |
| AC-5〜8 | 単体テスト: 描画の関数の出力 DOM（マーク、リンク、タイトル、複数配信） |
| AC-9, 10 | 単体テスト: 経過時間から警告を出すかの判定（29分59秒 / 30分ちょうど） |
| AC-11 | 手動確認: ブラウザの開発ツールで 360px 幅にする |
| AC-12, 13 | 単体テスト: LTK 判定（大文字・小文字、全角・半角、含まない場合） |
| AC-14, 20 | 結合テスト: データファイルを変えて生成処理を実行し、出力に反映されること |
| AC-15〜19 | 単体テスト: 絞り込みの関数（各軸、OR/AND、空のグループを消す、解除） |
| AC-21 | ワークフロー定義の確認と、Actions の実行履歴での確認 |
| AC-22 | 単体テスト: API をモックし、一部の取得が失敗したときに `error` になること |
| AC-23 | 単体テスト: スキーマ検証（欠けた項目、定義外の値、同じ階級・ロールの重複、チーム ID・チャンネルの重複） |
| AC-24, 25 | 設計で確認（上のクォータの見積もり）と、運用中に Google Cloud Console で使用量を確認 |
| AC-26 | 結合テスト: ビルドした成果物に Secrets の値が含まれないことを grep で確かめる |
