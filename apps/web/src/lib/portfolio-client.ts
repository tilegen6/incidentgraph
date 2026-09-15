import { createDemoSnapshot } from '@incidentgraph/shared/src/demo';
import {
  annotationSchema,
  createIncidentSchema,
  updateIncidentSchema,
  type Snapshot,
  type Incident,
} from '@incidentgraph/shared';
import { analyzeRootCause } from '@incidentgraph/shared/src/analysis';
import { z } from 'zod';
import {
  getBootstrap,
  getMetrics,
  listIncidents,
  listLogs,
  searchWorkspace,
  telemetryQuerySchema,
} from '@incidentgraph/shared/src/queries';
type TabStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const sessionKey = 'incidentgraph-portfolio-session-v1';
const editsKey = 'incidentgraph-portfolio-edits-v1';
const demoUser = { name: 'Alex Morgan', email: 'demo@incidentgraph.dev' };
const editSchema = z.object({
  path: z.string().max(150),
  method: z.enum(['POST', 'PATCH']),
  body: z.unknown(),
  at: z.string().datetime(),
  id: z.string().uuid(),
});
type Edit = z.infer<typeof editSchema>;
function applyEdit(data: Snapshot, edit: Edit) {
  if (edit.path === '/incidents' && edit.method === 'POST') {
    const input = createIncidentSchema.parse(edit.body);
    if (
      input.serviceIds.some(
        (id) =>
          !data.services.some((row) => row.id === id && row.environment === input.environment),
      )
    )
      throw new Error('Select services in the incident environment');
    const incident: Incident = {
      ...input,
      id: `INC-${edit.id.slice(0, 8).toUpperCase()}`,
      status: 'Investigating',
      startedAt: edit.at,
      resolvedAt: null,
      rootCause: 'Awaiting telemetry',
      summary: 'Manually declared incident. Add investigation notes as evidence becomes available.',
      analysis: {
        candidates: [],
        recommendation: 'Collect telemetry from affected services to begin analysis.',
        calculatedAt: edit.at,
        methodVersion: 'weighted-evidence-v1',
      },
    };
    data.incidents.unshift(incident);
    return incident;
  }
  const match = /^\/incidents\/([^/]+)(?:\/(annotations|analyze))?$/.exec(edit.path);
  const incident = data.incidents.find((row) => row.id === match?.[1]);
  if (!match || !incident) throw new Error('Incident not found');
  if (!match[2] && edit.method === 'PATCH') {
    const patch = updateIncidentSchema.parse(edit.body);
    Object.assign(incident, patch);
    if (patch.status)
      incident.resolvedAt =
        patch.status === 'Resolved'
          ? new Date(Math.max(Date.parse(edit.at), Date.parse(incident.startedAt))).toISOString()
          : null;
    return incident;
  }
  if (match[2] === 'annotations' && edit.method === 'POST') {
    const note = {
      ...annotationSchema.parse(edit.body),
      id: edit.id,
      incidentId: incident.id,
      author: demoUser.name,
      createdAt: edit.at,
    };
    data.annotations.push(note);
    return note;
  }
  if (match[2] === 'analyze' && edit.method === 'POST') {
    const anomalies = data.events
      .filter((row) => row.incidentId === incident.id && row.magnitude > 0)
      .map((row) => ({ ...row, environment: incident.environment }));
    incident.analysis = analyzeRootCause(anomalies, data.dependencies, data.services, edit.at);
    incident.rootCause = incident.analysis.candidates[0]?.title ?? 'Awaiting telemetry';
    return incident;
  }
  throw new Error('Unknown portfolio operation');
}

// A public demo entry marker, never a credential or authorization boundary.
export function createPortfolioClient(storage: TabStorage) {
  let data = createDemoSnapshot();
  let edits: Edit[] = [];
  try {
    const saved = storage.getItem(editsKey);
    if (saved) {
      if (saved.length > 1_000_000) throw new Error('Demo storage limit');
      const restored = z.array(editSchema).max(200).parse(JSON.parse(saved));
      for (const edit of restored) applyEdit(data, edit);
      edits = restored;
    }
  } catch {
    storage.removeItem(editsKey);
    data = createDemoSnapshot();
  }
  return async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const method = options?.method?.toUpperCase() ?? 'GET';
    let result: unknown;
    if (path === '/auth/config' && method === 'GET') result = { demoMode: true };
    else if (path === '/auth/me' && method === 'GET')
      result = storage.getItem(sessionKey) ? demoUser : null;
    else if (path === '/auth/login' && method === 'POST') {
      const body = JSON.parse(String(options?.body ?? '{}'));
      if (body.email !== demoUser.email || body.password !== 'investigate-demo')
        throw new Error('Use the prefilled demo credentials.');
      storage.setItem(sessionKey, 'entered');
      result = demoUser;
    } else if (path === '/auth/logout' && method === 'POST') {
      storage.removeItem(sessionKey);
      storage.removeItem(editsKey);
      data = createDemoSnapshot();
      edits = [];
      result = { ok: true };
    } else {
      if (!storage.getItem(sessionKey)) throw new Error('Enter the demo workspace first.');
      const url = new URL(path, 'https://portfolio.invalid');
      const q = telemetryQuerySchema.parse(Object.fromEntries(url.searchParams));
      const readers: Record<string, () => unknown> = {
        '/bootstrap': () => getBootstrap(data, q, { STORAGE_MODE: 'browser', DEMO_MODE: true }),
        '/incidents': () => listIncidents(data, q),
        '/logs': () => listLogs(data, q),
        '/metrics': () => getMetrics(data, q),
        '/search': () => searchWorkspace(data, q),
      };
      if (method === 'GET' && readers[url.pathname]) result = readers[url.pathname]();
      else if (method === 'GET' && /^\/incidents\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[2];
        const incident = data.incidents.find((row) => row.id === id);
        if (!incident) throw new Error('Incident not found');
        result = {
          ...incident,
          events: data.events.filter((row) => row.incidentId === id),
          annotations: data.annotations.filter((row) => row.incidentId === id),
        };
      } else if (method === 'POST' || method === 'PATCH') {
        if (edits.length >= 200) throw new Error('Demo edit limit reached. Sign out to reset.');
        const edit = editSchema.parse({
          path: url.pathname,
          method,
          body: JSON.parse(String(options?.body ?? '{}')),
          at: new Date().toISOString(),
          id: crypto.randomUUID(),
        });
        const next = structuredClone(data);
        result = applyEdit(next, edit);
        const serialized = JSON.stringify([...edits, edit]);
        if (serialized.length > 1_000_000)
          throw new Error('Demo storage limit reached. Sign out to reset.');
        storage.setItem(editsKey, serialized);
        edits.push(edit);
        data = next;
      } else throw new Error('Unknown portfolio operation');
    }
    return structuredClone(result) as T;
  };
}
