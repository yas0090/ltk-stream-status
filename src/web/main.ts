import "./style.css";
import { createApp, fetchSiteData } from "./app";

// 開発サーバーでだけ、?now=2026-10-27T18:30:00+09:00 で現在時刻を差し替えて本戦の案内を確かめられる
const devNow = import.meta.env.DEV ? new URLSearchParams(location.search).get("now") : null;
const fixedNow = devNow ? new Date(devNow) : undefined;

createApp(document.querySelector<HTMLElement>("#app")!, {
  loadData: fetchSiteData,
  ...(fixedNow && !Number.isNaN(fixedNow.getTime()) ? { now: () => fixedNow } : {}),
});
