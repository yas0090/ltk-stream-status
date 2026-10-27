// @vitest-environment happy-dom
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("src/web/index.html", "utf8");
const doc = new DOMParser().parseFromString(html, "text/html");

const content = (selector: string) => doc.querySelector(selector)?.getAttribute("content");

describe("共有時の meta タグ", () => {
  it("説明文があり、非公式であることを含む", () => {
    expect(content('meta[name="description"]')).toContain("非公式");
  });

  it("OGP のタグがそろっている", () => {
    for (const property of ["og:title", "og:description", "og:type", "og:site_name"]) {
      expect(content(`meta[property="${property}"]`), property).toBeTruthy();
    }
  });

  it("og:url と og:image が公開 URL を指す", () => {
    expect(content('meta[property="og:url"]')).toBe("https://ltk4-livenow-unofficial.pages.dev/");
    expect(content('meta[property="og:image"]')).toBe("https://ltk4-livenow-unofficial.pages.dev/og-image.png");
  });

  it("twitter:card が summary_large_image", () => {
    expect(content('meta[name="twitter:card"]')).toBe("summary_large_image");
  });

  it("サムネイル画像が public にある", () => {
    expect(existsSync("src/web/public/og-image.png")).toBe(true);
  });
});
