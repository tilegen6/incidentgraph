import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://localhost:3101',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: [
    {
      command:
        'node infra/scripts/reset-e2e.mjs && npm exec -- tsx --tsconfig apps/api/tsconfig.json apps/api/src/main.ts',
      url: 'http://localhost:4101/api/health',
      timeout: 60000,
      reuseExistingServer: false,
      env: {
        PORT: '4101',
        WEB_ORIGIN: 'http://localhost:3101',
        STORAGE_MODE: 'demo',
        DEMO_DATA_PATH: '.data/e2e.json',
      },
    },
    {
      command: 'npm exec -w @incidentgraph/web -- next dev -p 3101',
      url: 'http://localhost:3101',
      timeout: 90000,
      reuseExistingServer: false,
      env: {
        API_URL: 'http://localhost:4101',
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
