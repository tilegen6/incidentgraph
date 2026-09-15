import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/portfolio-e2e',
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: process.env.PORTFOLIO_BASE_URL ?? 'http://localhost:3102',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: process.env.PORTFOLIO_BASE_URL
    ? undefined
    : {
        command:
          'npm run build:portfolio -w @incidentgraph/web && npm exec -w @incidentgraph/web -- next start -H 127.0.0.1 -p 3102',
        url: 'http://localhost:3102',
        timeout: 180000,
        reuseExistingServer: false,
        env: {
          NEXT_DIST_DIR: '.next-portfolio',
          NEXT_PUBLIC_PORTFOLIO_DEMO: 'true',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      },
});
