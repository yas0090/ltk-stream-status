import type { Platform } from "../shared/types";

const SVG_NS = "http://www.w3.org/2000/svg";

// ロゴ風の簡略化したアイコン。色は CSS の currentColor で付ける
const PATHS: Record<Platform, string[]> = {
  twitch: ["M4 2 2.5 5.5V19h4.5v3h2.5l3-3h3.5L21 13.5V2Zm15 10.5-2.5 2.5H12l-3 3v-3H5.5V4H19Z", "M11 7h2v5h-2zm5 0h2v5h-2z"],
  youtube: [
    "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3Z",
  ],
};

export function platformIcon(platform: Platform): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "platform-icon");
  for (const d of PATHS[platform]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "currentColor");
    path.setAttribute("fill-rule", "evenodd");
    svg.append(path);
  }
  return svg;
}
