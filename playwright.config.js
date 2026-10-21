// Playwright-Einstellungen für den Browser-Kernpfad (M5.3.3).
// Ziel-URL über BASE_URL, z. B. die öffentliche v1; ohne BASE_URL wird lokal ein kleiner Server gestartet.
const { defineConfig } = require("@playwright/test");

const PUBLIC = process.env.BASE_URL;
const LOCAL = "http://127.0.0.1:4173/";

module.exports = defineConfig({
  testDir: "tests",
  testMatch: /.*\.spec\.js$/,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: PUBLIC || LOCAL,
    // schon installiertes Chrome nutzen, kein eigener Browser-Download
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: PUBLIC
    ? undefined
    : { command: "python -m http.server 4173 --bind 127.0.0.1", url: LOCAL, reuseExistingServer: true },
});
