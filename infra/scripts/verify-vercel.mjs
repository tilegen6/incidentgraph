import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const { url } = JSON.parse(
  await readFile(new URL('../../.data/vercel/deployment.json', import.meta.url), 'utf8'),
);
const parsed = new URL(url);
assert.equal(parsed.protocol, 'https:');
assert.ok(parsed.hostname.endsWith('.vercel.app'));
assert.equal(parsed.origin, url);
const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
assert.equal(response.status, 200);
assert.ok((await response.text()).includes('IncidentGraph'));
const result = spawnSync(process.execPath, ['infra/scripts/run-portfolio-tests.mjs'], {
  cwd: new URL('../../', import.meta.url),
  env: { ...process.env, PORTFOLIO_BASE_URL: url },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
assert.equal(result.status, 0, 'Live portfolio verification failed');
console.log('VERCEL_DEPLOYMENT_VERIFIED');
