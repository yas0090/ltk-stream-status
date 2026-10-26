import { describe, expect, it, vi } from "vitest";
import worker, { dispatchWorkflow, type Env } from "../../cron/src/index";

const env: Env = {
  GITHUB_TOKEN: "github_pat_secret",
  GITHUB_REPOSITORY: "owner/repo",
  WORKFLOW_FILE: "deploy.yml",
  GITHUB_REF: "main",
};

describe("起動用の Worker（AC-21）", () => {
  it("GitHub API の workflow_dispatch を正しい URL・ヘッダー・本文で呼ぶ", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    expect(await dispatchWorkflow(env, fetchFn)).toBe(true);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/owner/repo/actions/workflows/deploy.yml/dispatches");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer github_pat_secret");
    expect(headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");
    expect(headers.get("User-Agent")).toBeTruthy();
    expect(JSON.parse(String(init?.body))).toEqual({ ref: "main" });
  });

  it("失敗したらログに残し、トークンは出さない", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('{"message":"Bad credentials"}', { status: 401 }));
    expect(await dispatchWorkflow(env, fetchFn)).toBe(false);
    expect(error.mock.calls[0]?.[0]).toContain("HTTP 401");
    expect(String(error.mock.calls[0]?.[0])).not.toContain("github_pat_secret");

    const throwing = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network");
    });
    expect(await dispatchWorkflow(env, throwing)).toBe(false);
    error.mockRestore();
  });

  it("scheduled から起動を待ち合わせる", async () => {
    const waitUntil = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await worker.scheduled({}, env, { waitUntil });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0]![0];
    vi.unstubAllGlobals();
  });
});
