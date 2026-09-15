import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function enter(page: Page) {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Enter demo workspace' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter demo workspace' }).click();
  await expect(page.getByRole('heading', { name: 'System overview' })).toBeVisible();
}
test('public routes, graph and responsive workspace work without an API server', async ({
  page,
  request,
}) => {
  const errors: string[] = [],
    apiRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("'strict-dynamic'");
  expect(response?.headers()['content-security-policy']).not.toContain("'unsafe-eval'");
  await enter(page);
  const paths = [
    '/',
    '/architecture',
    '/login',
    '/app/overview',
    '/app/incidents',
    '/app/incidents/INC-1042',
    '/app/services',
    '/app/service-map',
    '/app/logs',
    '/app/metrics',
    '/app/traces',
    '/app/deployments',
    '/app/settings',
  ];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    if (['/app/overview', '/app/incidents/INC-1042', '/app/service-map'].includes(path))
      await expect(page.locator('.react-flow__node').first()).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
      path,
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      path,
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  expect(errors).toEqual([]);
  expect(apiRequests).toEqual([]);
  expect((await request.get('/api/bootstrap')).status()).toBe(404);
  expect((await request.get('/.env')).status()).toBe(404);
});
test('edits survive reload, are isolated from another visitor, render safely and reset on logout', async ({
  page,
  browser,
  baseURL,
}) => {
  await enter(page);
  await page.goto('/app/incidents/INC-1042');
  await page.getByLabel('Incident status', { exact: true }).selectOption('Resolved');
  await expect(
    page.getByRole('status').filter({ hasText: 'Investigation updated.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Activity/ }).click();
  const note = '<img src=x onerror="alert(1)"> portfolio isolated note';
  await page.getByLabel('Add an investigation note').fill(note);
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Incident status', { exact: true })).toHaveValue('Resolved');
  await page.getByRole('button', { name: /^Activity/ }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  const other = await browser.newContext({ baseURL });
  try {
    const otherPage = await other.newPage();
    await enter(otherPage);
    await otherPage.goto('/app/incidents/INC-1042');
    await expect(otherPage.getByLabel('Incident status', { exact: true })).not.toHaveValue(
      'Resolved',
    );
    await otherPage.getByRole('button', { name: /^Activity/ }).click();
    await expect(otherPage.getByText(note, { exact: true })).toHaveCount(0);
  } finally {
    await other.close();
  }
  await page.goto('/app/overview');
  await page.getByRole('button', { name: 'Declare incident', exact: true }).click();
  await page.getByLabel('Incident title').fill('Portfolio investigation check');
  await page.getByLabel('payment-service', { exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Declare incident' }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio investigation check' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Portfolio investigation check' })).toBeVisible();
  await page.goto('/app/settings');
  await expect(page.getByText('This browser tab only')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/app/incidents');
  await expect(page).toHaveURL(/\/login$/);
  await enter(page);
  await page.goto('/app/incidents');
  await page.getByLabel('Search incidents').fill('Portfolio investigation check');
  await expect(page.getByText('No incidents in this view')).toBeVisible();
});
test('telemetry filters, trace links and global search lead to matching evidence', async ({
  page,
}) => {
  await enter(page);
  await page.goto('/app/logs?service=payment-service');
  await page.getByLabel('Log search query').fill('timeout OR connection');
  await page.getByRole('button', { name: 'Run query' }).click();
  await page
    .getByRole('button', { name: /Expand log/ })
    .first()
    .click();
  await expect(page.getByText('STRUCTURED CONTEXT')).toBeVisible();
  await page.getByRole('link', { name: 'Open trace', exact: true }).click();
  await expect(page.getByText('Critical path insight', { exact: true })).toBeVisible();
  await page.goto('/app/metrics');
  await page.getByLabel('Metrics service').selectOption('postgres-main');
  await expect(
    page.getByRole('heading', { name: 'Database connections', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cache hit rate', exact: true })).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await page.getByLabel('Global search').fill('Payment failures');
  await page.getByRole('button', { name: /Payment failures Incident/ }).click();
  await expect(page.getByRole('heading', { name: 'Payment failures', exact: true })).toBeVisible();
  await page.getByLabel('Environment', { exact: true }).selectOption('staging');
  await page.goto('/app/incidents');
  await expect(page.getByText('No incidents in this view')).toBeVisible();
});
