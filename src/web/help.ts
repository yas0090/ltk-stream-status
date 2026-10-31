import { h } from "./dom";
import { platformIcon, starIcon } from "./icons";
import { renderPlayerCard } from "./render";
import { markHelpSeen, shouldAutoShowHelp } from "./storage";

// サンプルカードのサムネイル。外部に依存しないよう、画像はここに埋め込む
const SAMPLE_THUMB =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#3b4a6b"/><text x="160" y="98" font-size="28" font-family="sans-serif" fill="#fff" text-anchor="middle">SAMPLE</text></svg>',
  );

// 配信中の選手カードのサンプル。画面と同じ描画を使い、操作はできないようにする
const renderSampleCard = () => {
  const card = renderPlayerCard(
    {
      name: "サンプル選手",
      tier: "Core",
      role: "MID",
      channels: [
        {
          platform: "twitch",
          channelUrl: "https://example.com/",
          state: "live",
          streams: [{ title: "配信タイトルの例", url: "https://example.com/", ltk: true, thumbnailUrl: SAMPLE_THUMB }],
        },
        { platform: "youtube", channelUrl: "https://example.com/", state: "offline", streams: [] },
      ],
    },
    "sample",
  );
  card.setAttribute("inert", "");
  return h("div", { class: "help-sample" }, card);
};

const section = (title: string, ...body: (Node | string)[]) =>
  h("section", { class: "help-section" }, h("h3", {}, title), ...body);

// 説明の中に画面と同じアイコンを並べる行
const iconLine = (icon: Node | string, text: string) => h("p", { class: "help-line" }, icon, h("span", {}, text));

// ヘルプのボタンとモーダル（AC-77〜89）。文章はここに直接書く。アイコンは装飾なので読み上げず、意味は隣の文章で伝える
export function renderHelp(storage?: Parameters<typeof shouldAutoShowHelp>[0]) {
  const close = h("button", { type: "button", class: "help-close" }, "閉じる");
  const dialog = h(
    "dialog",
    { class: "help", "aria-labelledby": "help-title" },
    h("div", { class: "help-head" }, h("h2", { id: "help-title" }, "ヘルプ")),
    h(
      "div",
      { class: "help-body" },
      section("このサイトについて", h("p", {}, "LTK 出場者の配信状況を一覧で確かめられます。配信中かどうかと、何を配信しているかが分かります。")),
      section(
        "選手カードの見方",
        renderSampleCard(),
        iconLine(
          h("span", { class: "live-badge help-live", "aria-hidden": "true" }, "LIVE"),
          "配信中の選手のアイコンに付きます。サムネイルは配信の画面で、押すと配信ページを開きます。",
        ),
        iconLine(
          h("span", { class: "help-icons", "aria-hidden": "true" }, platformIcon("twitch"), platformIcon("youtube")),
          "配信しているプラットフォーム（Twitch / YouTube）です。配信タイトルが並び、複数の配信があるときは件数も出ます。",
        ),
      ),
      section(
        "フィルタの使い方",
        h("p", {}, "「絞り込み」で、チーム・階級・配信（「配信中」「LTK」）を選んで一覧を絞れます。複数選ぶと、すべてに当てはまる選手を表示します。「解除」で元に戻ります。「詳細フィルタ」では、選手ごとに表示・非表示を選べます。"),
      ),
      section(
        "お気に入りの使い方",
        iconLine(
          h("span", { class: "help-icons", "aria-hidden": "true" }, starIcon(false), starIcon(true)),
          "カードの星を押すと「お気に入り」欄に登録され、もう一度押すと解除されます。登録はこのブラウザに保存されます。",
        ),
      ),
      section("本戦スケジュール", h("p", {}, "本戦の予定が近づくと上部に案内が出ます。その時間帯の配信も取得します。")),
    ),
    h("div", { class: "help-foot" }, close),
  );
  const button = h("button", { type: "button", class: "help-button", "aria-label": "ヘルプ" }, "?");

  const open = () => {
    if (!dialog.open) dialog.showModal();
  };
  button.addEventListener("click", open);
  close.addEventListener("click", () => dialog.close());
  // 閉じたときに記録する。閉じるボタンでも Esc でも発火する。表示しただけでは記録しない
  dialog.addEventListener("close", () => markHelpSeen(storage));

  const autoOpen = () => {
    if (shouldAutoShowHelp(storage)) open();
  };

  return { button, dialog, autoOpen };
}
