import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { access, mkdir } from 'node:fs/promises';
import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes } from 'node:crypto';
process.env.ADMIN_PASSWORD = randomBytes(32).toString('base64url');
process.env.DEMO_MODE = 'false';

const root = fileURLToPath(new URL('../../', import.meta.url));
const databaseDir = fileURLToPath(new URL('../../.data/postgres-verification', import.meta.url));
await mkdir(databaseDir, { recursive: true });
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'incidentgraph',
  password: 'verification-only',
  port: 55432,
  persistent: true,
  createPostgresUser: false,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
const run = promisify(execFile);
let repository;
try {
  const initialized = await access(`${databaseDir}/PG_VERSION`).then(
    () => true,
    () => false,
  );
  if (!initialized) await postgres.initialise();
  await postgres.start();
  // This cluster is dedicated to verification; databases are never reused outside it.
  const client = postgres.getPgClient();
  await client.connect();
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = 'incidentgraph_verify'",
  );
  if (exists.rowCount) await postgres.dropDatabase('incidentgraph_verify');
  await postgres.createDatabase('incidentgraph_verify');
  await client.end();
  process.env.DATABASE_URL =
    'postgresql://incidentgraph:verification-only@127.0.0.1:55432/incidentgraph_verify';
  process.env.STORAGE_MODE = 'postgres';
  await run(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      'apps/api/prisma/schema.prisma',
    ],
    { cwd: root, env: process.env, windowsHide: true },
  );
  const { Storage } = await import('../../apps/api/dist/apps/api/src/storage.js');
  const { IncidentService } = await import('../../apps/api/dist/apps/api/src/incident-service.js');
  repository = new Storage();
  await repository.onModuleInit();
  const data = repository.snapshot();
  assert.equal(data.services.length, 22);
  assert.equal(data.logs.length, 360);
  assert.equal(data.metrics.length, 6358);
  assert.equal(data.traces.length, 32);
  assert.equal(
    data.incidents.find((i) => i.id === 'INC-1042').analysis.candidates[0].serviceId,
    'postgres-main',
  );
  const service = new IncidentService(repository);
  const created = await service.create({
    title: 'PostgreSQL persistence verification',
    severity: 'SEV-3',
    environment: 'production',
    serviceIds: ['postgres-main'],
    owner: 'Alex Morgan',
  });
  await service.update(created.id, { status: 'Monitoring' });
  await repository.addAnnotation({
    id: `pg-note-${created.id}`,
    incidentId: created.id,
    author: 'Alex Morgan',
    body: 'Persisted through Prisma in a real PostgreSQL database.',
    createdAt: new Date().toISOString(),
  });
  await repository.close();
  repository = new Storage();
  await repository.onModuleInit();
  assert.equal(
    repository.snapshot().incidents.find((i) => i.id === created.id).status,
    'Monitoring',
  );
  assert.ok(repository.snapshot().annotations.some((a) => a.id === `pg-note-${created.id}`));
  console.log(
    'PASS: PostgreSQL migration, idempotent seed, relational reads, incident writes, notes, and reconnect persistence.',
  );
} finally {
  await repository?.close();
  await postgres.stop();
}
