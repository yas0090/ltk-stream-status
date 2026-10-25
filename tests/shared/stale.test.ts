import { describe, expect, it } from "vitest";
import { isStale } from "../../src/shared/stale";

const generatedAt = "2026-10-25T09:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(generatedAt) + ms);

describe("isStale（AC-10）", () => {
  it("29分59秒なら警告しない", () => {
    expect(isStale(generatedAt, at(29 * 60_000 + 59_000))).toBe(false);
  });

  it("30分ちょうどなら警告する", () => {
    expect(isStale(generatedAt, at(30 * 60_000))).toBe(true);
  });

  it("更新直後は警告しない", () => {
    expect(isStale(generatedAt, at(0))).toBe(false);
  });

  it("日時が読めなければ警告する", () => {
    expect(isStale("invalid", at(0))).toBe(true);
  });
});
