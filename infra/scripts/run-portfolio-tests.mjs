import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve('@playwright/test/cli'), 'test', '--config=playwright.portfolio.config.ts'],
  {
    cwd: new URL('../../', import.meta.url),
    stdio: 'inherit',
    windowsHide: true,
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('PORTFOLIO_BROWSER_VERIFIED');
