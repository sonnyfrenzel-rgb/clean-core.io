import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminSetDoc } from './helpers/admin-seed';
import { COACH_MARK_IDS, COACH_MARK_STORAGE_KEY } from '../lib/coach-marks';

/**
 * Owner, 10.10.2026: in the IT view of Z_MM_PO_APPROVAL a click on "Business"
 * did nothing. The view switch kept the old fragment, and IT's layer address
 * (`#architecture`, which the IT redirects and Management's layer bar write)
 * made the Business redirect send the reader straight back to IT; the layer
 * state, fed only by `hashchange`, could also stay stale after a client
 * navigation. And: a view switch always starts at the top of the new view.
 *
 * Held here in a browser: from IT with no fragment and with each of IT's own
 * and the old layer fragments, Business opens and stays open, then Management,
 * then IT — each at the top, with no fragment; Management with a layer chosen
 * opens Business; and a deliberate deep link from IT still keeps its place.
 */

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const PO = fs.readFileSync(path.resolve('public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');

async function idToken(email: string, password: string): Promise<string> {
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return ((await res.json()) as { idToken: string }).idToken;
}

test.describe.configure({ mode: 'serial' });

let account: Awaited<ReturnType<typeof seedStageProject>>;
let projectId = '';

test.beforeAll(async () => {
  test.setTimeout(240_000);
  account = await seedStageProject({ prefix: 'viewswitch', acceptTerms: true });
  const token = await idToken(account.email, account.password);
  projectId = `${account.projectId}-po`;
  await adminSetDoc('projects', projectId, { name: 'Z_MM_PO_APPROVAL', userId: account.uid, createdAt: new Date(), status: 'created', legacyCode: PO });
  const res = await fetch(`${BASE}/api/runs/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, s4Deployment: 'private', analysis: '', uploadedFileName: 'Z_MM_PO_APPROVAL.abap' }),
  });
  expect(res.ok, `the run was not signed: ${res.status}`).toBe(true);
});

const radio = (page: Page, name: string) =>
  page.locator('[data-cc-segmented][aria-label="View"] button[role="radio"]', { hasText: name });
const shell = (page: Page) => page.locator('[data-workspace-shell]');

/**
 * Switches by the view control from a scrolled position and holds that the
 * new view opened, at its top, with no fragment — and is still there after a
 * second and a half, sampled every frame, so a redirect that bounces the reader
 * back is seen whenever it lands rather than raced.
 */
async function switchTo(page: Page, name: 'Business' | 'IT' | 'Management', key: string) {
  await page.evaluate(() => window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)));
  await expect.poll(() => page.evaluate(() => window.scrollY), { message: 'the page could not be scrolled before the switch' }).toBeGreaterThan(200);
  await radio(page, name).evaluate((el) => (el as HTMLElement).click());
  await expect(shell(page)).toHaveAttribute('data-workspace-shell', key, { timeout: 30_000 });
  const seen = await page.evaluate(async () => {
    const out = new Set<string>();
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      await new Promise((r) => requestAnimationFrame(r));
      out.add(`${document.querySelector('[data-workspace-shell]')?.getAttribute('data-workspace-shell')}|${new URL(location.href).searchParams.get('view')}|${location.hash}`);
    }
    return [...out];
  });
  expect(seen, `${name}: the view did not hold, or kept a fragment`).toEqual([`${key}|${key}|`]);
  await expect.poll(() => page.evaluate(() => window.scrollY), { message: `${name} did not open at its top` }).toBe(0);
}

async function waitForView(page: Page) {
  await expect(shell(page)).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1500);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([key, ids]) => window.localStorage.setItem(key as string, JSON.stringify(ids)),
    [COACH_MARK_STORAGE_KEY, [...COACH_MARK_IDS]] as const,
  );
});

test('from IT, with and without each fragment: Business, Management and IT open at their top and stay', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, account);
  for (const hash of ['', '#it-findings', '#it-objects', '#architecture', '#evidence', '#need']) {
    await page.goto(`/project/${projectId}?view=it${hash}`, { waitUntil: 'domcontentloaded' });
    await waitForView(page);
    // `#need` in IT is an old layer address: it lands in Business on the map,
    // so the walk starts from there and goes to IT first.
    if ((await shell(page).getAttribute('data-workspace-shell')) !== 'it') {
      await expect(shell(page)).toHaveAttribute('data-workspace-shell', 'business', { timeout: 30_000 });
      await switchTo(page, 'IT', 'it');
    }
    await expect(page.locator('[data-it-view][data-it-state]')).toBeVisible({ timeout: 90_000 });
    await switchTo(page, 'Business', 'business');
    await switchTo(page, 'Management', 'management');
    await switchTo(page, 'Business', 'business');
    await switchTo(page, 'IT', 'it');
    await switchTo(page, 'Management', 'management');
    await switchTo(page, 'IT', 'it');
  }
});

test('Management with a layer IT owns opens Business, and a deep link out of IT keeps its place', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, account);
  for (const layer of ['architecture', 'changes', 'costs']) {
    await page.goto(`/project/${projectId}?view=management#${layer}`, { waitUntil: 'domcontentloaded' });
    await waitForView(page);
    // Management has no layers since ADR-087: an old layer address may have
    // sent the reader on already. From wherever it landed, Business opens.
    if ((await shell(page).getAttribute('data-workspace-shell')) === 'business') await switchTo(page, 'Management', 'management');
    await switchTo(page, 'Business', 'business');
  }

  // A deliberate deep link into another view keeps its target (ADR-086).
  await page.goto(`/project/${projectId}?view=it`, { waitUntil: 'domcontentloaded' });
  await waitForView(page);
  const out = page.locator('[data-it-elsewhere-link]').filter({ hasText: /Management/ }).first();
  await expect(out).toBeVisible({ timeout: 90_000 });
  await out.click();
  await expect(page).toHaveURL(/[?&]view=management#[\w-]+$/, { timeout: 30_000 });
});
