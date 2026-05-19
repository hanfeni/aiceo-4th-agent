import { defineConfig } from "@playwright/test";

// 스펙 [E2E 테스트 작성 규칙]: real API 는 non-deterministic.
// retries:1 로 rate limit 흡수, reuseExistingServer:false 로 깨끗한 기동.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
