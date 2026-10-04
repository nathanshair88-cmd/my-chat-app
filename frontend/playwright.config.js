import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5175",
    channel: "chrome",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "python -m uvicorn app.main:app --host 127.0.0.1 --port 8001",
      cwd: "../backend",
      url: "http://127.0.0.1:8001",
      reuseExistingServer: false,
      env: {
        DATABASE_URL: "sqlite+aiosqlite:///./alto-e2e.db",
        DEBUG_EXCEPTIONS: "false",
        CORS_ORIGINS: "http://127.0.0.1:5175",
        SOCKET_CORS_ORIGINS: "http://127.0.0.1:5175",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5175 --strictPort",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
      env: {
        VITE_API_URL: "http://127.0.0.1:8001/api",
        VITE_SOCKET_URL: "http://127.0.0.1:8001",
      },
    },
  ],
});
