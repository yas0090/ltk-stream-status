import "./style.css";
import { createApp, fetchSiteData } from "./app";

createApp(document.querySelector<HTMLElement>("#app")!, { loadData: fetchSiteData });
