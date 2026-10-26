import { chunk, FAILED, OFFLINE, type ChannelResult, type FetchFn } from "./types";

export type TwitchCredentials = { clientId: string; clientSecret: string };

type StreamsResponse = { data: { user_login: string; title: string; type: string; thumbnail_url?: string }[] };
type UsersResponse = { data: { login: string; profile_image_url: string }[] };

// 1 回の実行の中で、配信状態とアイコン画像の取得に同じトークンを使い回す
export type TwitchTokenProvider = () => Promise<string>;

const BATCH_SIZE = 100;

export const twitchChannelUrl = (login: string) => `https://www.twitch.tv/${login.toLowerCase()}`;

// サムネイルの URL はテンプレートなので大きさを入れる。同じ URL のまま中身が更新されるため、取得時刻を付けて
// ブラウザに古い画像が残らないようにする（AC-42）
export const twitchThumbnailUrl = (template: string | undefined, now: Date) =>
  template ? `${template.replace("{width}", "440").replace("{height}", "248")}?t=${now.getTime()}` : undefined;

// Client Credentials Flow。トークンはログに出さない
async function getAppToken({ clientId, clientSecret }: TwitchCredentials, fetchFn: FetchFn): Promise<string> {
  const res = await fetchFn("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Twitch のトークン取得に失敗しました (HTTP ${res.status})`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export function createTwitchTokenProvider(credentials: TwitchCredentials, fetchFn: FetchFn = fetch): TwitchTokenProvider {
  let token: Promise<string> | undefined;
  return () => (token ??= getAppToken(credentials, fetchFn));
}

async function fetchBatch(logins: string[], clientId: string, token: string, fetchFn: FetchFn) {
  const url = new URL("https://api.twitch.tv/helix/streams");
  url.searchParams.set("type", "live");
  url.searchParams.set("first", String(BATCH_SIZE));
  for (const login of logins) url.searchParams.append("user_login", login);

  const res = await fetchFn(url, { headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Twitch の配信情報の取得に失敗しました (HTTP ${res.status})`);
  return ((await res.json()) as StreamsResponse).data;
}

// キーは小文字のログイン名。失敗したチャンネルは error にし、例外は投げない（AC-22）
export async function fetchTwitchStatuses(
  logins: readonly string[],
  credentials: TwitchCredentials,
  fetchFn: FetchFn = fetch,
  getToken: TwitchTokenProvider = createTwitchTokenProvider(credentials, fetchFn),
  now: Date = new Date(),
): Promise<Map<string, ChannelResult>> {
  const normalized = [...new Set(logins.map((login) => login.toLowerCase()))];
  const results = new Map<string, ChannelResult>();
  if (normalized.length === 0) return results;

  let token: string;
  try {
    token = await getToken();
  } catch (error) {
    console.warn(String(error));
    for (const login of normalized) results.set(login, FAILED);
    return results;
  }

  for (const batch of chunk(normalized, BATCH_SIZE)) {
    try {
      const streams = await fetchBatch(batch, credentials.clientId, token, fetchFn);
      for (const login of batch) results.set(login, OFFLINE);
      for (const stream of streams) {
        if (stream.type !== "live") continue;
        const login = stream.user_login.toLowerCase();
        results.set(login, {
          state: "live",
          streams: [
            { title: stream.title, url: twitchChannelUrl(login), thumbnailUrl: twitchThumbnailUrl(stream.thumbnail_url, now) },
          ],
        });
      }
    } catch (error) {
      console.warn(String(error));
      for (const login of batch) results.set(login, FAILED);
    }
  }
  return results;
}

// キーは小文字のログイン名。取得できなかったログイン名は含めない（AC-27）
export async function fetchTwitchAvatars(
  logins: readonly string[],
  credentials: TwitchCredentials,
  fetchFn: FetchFn = fetch,
  getToken: TwitchTokenProvider = createTwitchTokenProvider(credentials, fetchFn),
): Promise<Map<string, string>> {
  const normalized = [...new Set(logins.map((login) => login.toLowerCase()))];
  const avatars = new Map<string, string>();
  if (normalized.length === 0) return avatars;

  try {
    const token = await getToken();
    for (const batch of chunk(normalized, BATCH_SIZE)) {
      const url = new URL("https://api.twitch.tv/helix/users");
      for (const login of batch) url.searchParams.append("login", login);
      const res = await fetchFn(url, { headers: { "Client-Id": credentials.clientId, Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Twitch のアイコン画像の取得に失敗しました (HTTP ${res.status})`);
      for (const user of ((await res.json()) as UsersResponse).data) {
        if (user.profile_image_url) avatars.set(user.login.toLowerCase(), user.profile_image_url);
      }
    }
  } catch (error) {
    console.warn(String(error));
  }
  return avatars;
}
