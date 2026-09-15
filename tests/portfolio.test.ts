import { describe, expect, it } from 'vitest';
import { createPortfolioClient } from '../apps/web/src/lib/portfolio-client';
import type { Incident, LogEntry, MetricPoint, Snapshot } from '../packages/shared/src';

function tabStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
const login = {
  method: 'POST',
  body: JSON.stringify({ email: 'demo@incidentgraph.dev', password: 'investigate-demo' }),
};
describe('public portfolio workspace', () => {
  it('enters a synthetic demo, survives reload, and clears the demo session on logout', async () => {
    const storage = tabStorage();
    const request = createPortfolioClient(storage);
    expect(await request('/auth/config')).toEqual({ demoMode: true });
    expect(await request('/auth/me')).toBeNull();
    await expect(request('/bootstrap')).rejects.toThrow('Enter the demo');
    await expect(request('/auth/login', { ...login, body: '{}' })).rejects.toThrow(
      'demo credentials',
    );
    await request('/auth/login', login);
    expect(await createPortfolioClient(storage)('/auth/me')).toMatchObject({ name: 'Alex Morgan' });
    await request('/auth/logout', { method: 'POST' });
    expect(await createPortfolioClient(storage)('/auth/me')).toBeNull();
  });
  it('explores the seeded production incident and filters telemetry by environment and service', async () => {
    const request = createPortfolioClient(tabStorage());
    await request('/auth/login', login);
    const overview = await request<Snapshot>('/bootstrap');
    expect(overview.services).toHaveLength(11);
    expect(await request<Incident>('/incidents/INC-1042')).toMatchObject({
      title: 'Payment failures',
    });
    expect(await request('/incidents?environment=staging')).toMatchObject({ items: [], total: 0 });
    const logs = await request<{ items: LogEntry[] }>('/logs?service=payment-service&level=ERROR');
    expect(logs.items.length).toBeGreaterThan(0);
    expect(
      logs.items.every((row) => row.serviceId === 'payment-service' && row.level === 'ERROR'),
    ).toBe(true);
    const metrics = await request<MetricPoint[]>('/metrics?service=postgres-main&range=15m');
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.every((row) => row.serviceId === 'postgres-main')).toBe(true);
    expect(await request('/search?q=Payment failures')).toContainEqual(
      expect.objectContaining({ href: '/app/incidents/INC-1042' }),
    );
  });
  it('persists investigation edits within one tab and never shares them with another visitor', async () => {
    const storage = tabStorage(),
      visitor = createPortfolioClient(storage);
    await visitor('/auth/login', login);
    await visitor('/incidents/INC-1042', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Resolved' }),
    });
    const text = '<img src=x onerror=alert(1)> isolated note';
    await visitor('/incidents/INC-1042/annotations', {
      method: 'POST',
      body: JSON.stringify({ body: text }),
    });
    const created = await visitor<Incident>('/incidents', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Portfolio investigation',
        severity: 'SEV-3',
        serviceIds: ['payment-service'],
        environment: 'production',
        owner: 'Alex Morgan',
      }),
    });
    const reloaded = createPortfolioClient(storage);
    expect(await reloaded(`/incidents/${created.id}`)).toMatchObject({
      title: 'Portfolio investigation',
    });
    expect(await reloaded('/incidents/INC-1042')).toMatchObject({
      status: 'Resolved',
      annotations: expect.arrayContaining([expect.objectContaining({ body: text })]),
    });
    expect(await reloaded('/incidents/INC-1042/analyze', { method: 'POST' })).toMatchObject({
      analysis: {
        candidates: expect.arrayContaining([
          expect.objectContaining({ serviceId: 'postgres-main' }),
        ]),
      },
    });
    const other = createPortfolioClient(tabStorage());
    await other('/auth/login', login);
    expect((await other<Incident>('/incidents/INC-1042')).status).not.toBe('Resolved');
    await expect(other(`/incidents/${created.id}`)).rejects.toThrow('Incident not found');
    await visitor('/auth/logout', { method: 'POST' });
    await visitor('/auth/login', login);
    await expect(visitor(`/incidents/${created.id}`)).rejects.toThrow('Incident not found');
  });
});
