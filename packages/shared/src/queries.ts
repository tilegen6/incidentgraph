import { z } from 'zod';
import { matchesQuery, type Snapshot } from './index';
export const baseTelemetryQuerySchema = z.object({
  environment: z.enum(['production', 'staging']).default('production'),
  q: z.string().max(300).default(''),
  service: z.string().default('all'),
  level: z.enum(['all', 'ERROR', 'WARN', 'INFO', 'DEBUG']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  range: z.enum(['15m', '1h', '6h', '24h']).default('1h'),
});
export const telemetryQuerySchema = baseTelemetryQuerySchema.extend({
  status: z.string().optional(),
  severity: z.string().optional(),
  from: z.string().datetime().optional(),
});
export type TelemetryQuery = z.infer<typeof telemetryQuerySchema>;
export function getBootstrap(
  data: Snapshot,
  q: TelemetryQuery,
  config: { STORAGE_MODE: string; DEMO_MODE: boolean },
) {
  const d = data;
  const ids = new Set(d.services.filter((s) => s.environment === q.environment).map((s) => s.id));
  const incidents = d.incidents.filter((i) => i.environment === q.environment);
  return {
    services: d.services.filter((s) => ids.has(s.id)),
    dependencies: d.dependencies.filter((e) => ids.has(e.source)),
    incidents,
    events: d.events.filter((e) => incidents.some((i) => i.id === e.incidentId)),
    deployments: d.deployments.filter((e) => e.environment === q.environment),
    traces: d.traces.filter((t) => t.environment === q.environment),
    annotations: d.annotations.filter((a) => incidents.some((i) => i.id === a.incidentId)),
    demoTime: d.demoTime,
    storageMode: config.STORAGE_MODE,
    demoMode: config.DEMO_MODE,
    serviceTrends: Object.fromEntries(
      d.services
        .filter((s) => ids.has(s.id))
        .map((s) => [
          s.id,
          d.metrics
            .filter((m) => m.serviceId === s.id)
            .slice(-20)
            .map((m) => m.latency),
        ]),
    ),
  };
}
export function listIncidents(data: Snapshot, q: TelemetryQuery) {
  let rows = data.incidents.filter((i) => i.environment === q.environment);
  rows = rows.filter(
    (i) =>
      (!q.status || i.status === q.status) &&
      (!q.severity || i.severity === q.severity) &&
      (q.service === 'all' || i.serviceIds.includes(q.service)) &&
      matchesQuery(`${i.title} ${i.id} ${i.rootCause}`, q.q) &&
      (!q.from || i.startedAt >= q.from),
  );
  return {
    items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
    total: rows.length,
    page: q.page,
    pageSize: q.pageSize,
  };
}
export function listLogs(data: Snapshot, q: TelemetryQuery) {
  const rows = data.logs
    .filter(
      (l) =>
        l.environment === q.environment &&
        (q.service === 'all' || l.serviceId === q.service) &&
        (q.level === 'all' || l.level === q.level) &&
        matchesQuery(`${l.message} ${l.traceId} ${l.serviceId}`, q.q),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const histogram = Array.from({ length: 36 }, (_, i) => {
    const start = Date.parse(data.demoTime) - 18 * 60000 + i * 30000;
    const bucket = rows.filter(
      (l) => Date.parse(l.timestamp) >= start && Date.parse(l.timestamp) < start + 30000,
    );
    return {
      timestamp: new Date(start).toISOString(),
      count: bucket.length,
      errors: bucket.filter((l) => l.level === 'ERROR').length,
    };
  });
  return {
    histogram,
    items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
    total: rows.length,
    page: q.page,
    pageSize: q.pageSize,
  };
}
export function getMetrics(data: Snapshot, q: TelemetryQuery) {
  const d = data;
  const minutes = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440 }[q.range];
  const start = Date.parse(d.demoTime) - minutes * 60000;
  const rows = d.metrics.filter(
    (m) =>
      m.environment === q.environment &&
      (q.service === 'all' || m.serviceId === q.service) &&
      Date.parse(m.timestamp) >= start,
  );
  if (q.service !== 'all') return rows;
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = grouped.get(row.timestamp) ?? [];
    bucket.push(row);
    grouped.set(row.timestamp, bucket);
  }
  return [...grouped].map(([timestamp, b]) => ({
    timestamp,
    latency: Math.round(
      b.reduce((sum, m) => sum + m.latency * m.rps, 0) /
        Math.max(
          1,
          b.reduce((sum, m) => sum + m.rps, 0),
        ),
    ),
    errorRate: Number(
      (
        b.reduce((sum, m) => sum + m.errorRate * m.rps, 0) /
        Math.max(
          1,
          b.reduce((sum, m) => sum + m.rps, 0),
        )
      ).toFixed(2),
    ),
    rps: b.reduce((sum, m) => sum + m.rps, 0),
    cpu: Math.round(b.reduce((sum, m) => sum + m.cpu, 0) / b.length),
    memory: Math.round(b.reduce((sum, m) => sum + m.memory, 0) / b.length),
    connections: b.find((m) => m.serviceId.includes('postgres-main'))?.connections ?? 0,
    cacheHit: b.find((m) => m.serviceId.endsWith('redis'))?.cacheHit ?? 0,
  }));
}
export function searchWorkspace(data: Snapshot, q: TelemetryQuery) {
  if (!q.q.trim()) return [];
  const d = data;
  return [
    ...d.incidents
      .filter((i) => i.environment === q.environment && matchesQuery(`${i.title} ${i.id}`, q.q))
      .map((i) => ({
        id: i.id,
        label: i.title,
        type: 'Incident',
        href: `/app/incidents/${i.id}`,
      })),
    ...d.services
      .filter((s) => s.environment === q.environment && matchesQuery(s.name, q.q))
      .map((s) => ({
        id: s.id,
        label: s.name,
        type: 'Service',
        href: `/app/services?service=${s.id}`,
      })),
    ...d.traces
      .filter((t) => t.environment === q.environment && matchesQuery(`${t.id} ${t.operation}`, q.q))
      .slice(0, 5)
      .map((t) => ({ id: t.id, label: t.id, type: 'Trace', href: `/app/traces?trace=${t.id}` })),
    ...d.logs
      .filter((l) => l.environment === q.environment && matchesQuery(l.message, q.q))
      .slice(0, 3)
      .map((l) => ({
        id: l.id,
        label: l.message,
        type: 'Log',
        href: `/app/logs?q=${encodeURIComponent(q.q)}`,
      })),
  ].slice(0, 15);
}
