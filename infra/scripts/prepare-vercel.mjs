import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = resolve(root, '.data/vercel/source');
const denied =
  /(?:^|\/)(?:\.env[^/]*|\.data|\.git|\.next[^/]*|node_modules|dist|exports|backups|\.npmrc|\.netrc|\.pgpass)(?:\/|$)|\.(?:pem|key|pfx|p12|db|sqlite[^/]*|dump|backup|bak|har|log|tsbuildinfo)$/i;
const allowed = (path) =>
  !denied.test(path) &&
  ([
    'package.json',
    'package-lock.json',
    'tsconfig.base.json',
    '.gitignore',
    '.vercelignore',
    'apps/api/package.json',
    'infra/scripts/build-portfolio.mjs',
  ].includes(path) ||
    /^(?:apps\/web|packages\/shared)\//.test(path));
// Positive controls ensure the deny filter really rejects sensitive path classes.
for (const path of [
  'apps/web/.env.local',
  'apps/web/.data/customer.json',
  'apps/web/client.pem',
  'apps/web/.next/server.js',
  'apps/web/exports/client.json',
  'apps/web/.npmrc',
])
  assert.equal(allowed(path), false, path);
assert.equal(allowed('apps/web/src/app/page.tsx'), true);
const paths = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(allowed);
assert.ok(
  paths.includes('apps/web/vercel.json') && paths.includes('apps/web/src/lib/portfolio-client.ts'),
);
const expected = new Map();
for (const path of paths) {
  const source = resolve(root, path),
    target = resolve(destination, path);
  assert.ok(target.startsWith(destination + sep));
  assert.equal((await lstat(source)).isSymbolicLink(), false, path);
  const bytes = await readFile(source);
  expected.set(path, createHash('sha256').update(bytes).digest('hex'));
  if (!process.argv.includes('--verify')) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    const path = relative(destination, target).split(sep).join('/');
    assert.equal(entry.isSymbolicLink(), false, path);
    if (entry.isDirectory()) {
      await walk(target);
      continue;
    }
    if (['.vercel/project.json', '.vercel/README.txt'].includes(path)) continue;
    assert.ok(expected.has(path), `Unexpected deployment file: ${path}`);
    assert.equal(
      createHash('sha256')
        .update(await readFile(target))
        .digest('hex'),
      expected.get(path),
      path,
    );
    expected.delete(path);
  }
}
await walk(destination);
assert.equal(expected.size, 0, 'Deployment files missing');
console.log(
  `VERCEL_SOURCE_VERIFIED: ${paths.length} allowlisted source files, no local environments, snapshots or credentials.`,
);
