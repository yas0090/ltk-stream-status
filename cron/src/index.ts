// Cloudflare Workers の Cron Triggers から、GitHub Actions のワークフローを起動する（AC-21）。
// GitHub Actions の schedule は大きく間引かれるため、時刻どおりに動く Workers から workflow_dispatch を呼ぶ

export type Env = {
  // fine-grained トークン。このリポジトリの Actions（読み書き）だけに権限を絞る。Worker の Secret に置く
  GITHUB_TOKEN: string;
  GITHUB_REPOSITORY: string;
  WORKFLOW_FILE: string;
  GITHUB_REF: string;
};

type FetchFn = typeof fetch;

export async function dispatchWorkflow(env: Env, fetchFn: FetchFn = fetch): Promise<boolean> {
  const url = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`;
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ltk-stream-status-cron",
      },
      body: JSON.stringify({ ref: env.GITHUB_REF }),
    });
    // 成功すると 204 が返る。トークンはログに出さない
    if (res.status === 204) return true;
    console.error(`ワークフローの起動に失敗しました (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    return false;
  } catch (error) {
    console.error(`ワークフローの起動に失敗しました: ${String(error)}`);
    return false;
  }
}

type ExecutionContext = { waitUntil: (promise: Promise<unknown>) => void };

export default {
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dispatchWorkflow(env));
  },
};
