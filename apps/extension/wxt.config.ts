import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "JobTrackr",
    short_name: "JobTrackr",
    description:
      "One-click job capture and application autofill for your JobTrackr tracker.",
    permissions: ["activeTab", "storage", "tabs"],
    host_permissions: ["<all_urls>"],
    icons: {
      16: "/icon-16.png",
      32: "/icon-32.png",
      48: "/icon-48.png",
      128: "/icon-128.png",
    },
    browser_specific_settings: {
      safari: {
        strict_min_version: "16.4",
      },
    },
  },
});
