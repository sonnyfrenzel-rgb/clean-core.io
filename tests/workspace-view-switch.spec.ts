import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminSetDoc } from './helpers/admin-seed';

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
 *
 * Since 3.5.0 all three views are Analyze's (AB-9, AB-10, AB-11) and the switch
 * is its header's (`switchStageView`, which drops a place of one view and starts
 * the new view at its top): the same promise in its new place.
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
  page.locator('[data-stage-view-switch] [data-cc-segmented][aria-label="View"] button[role="radio"]', { hasText: name });
/** The view Analyze shows: its header's switch says it (`components/StageViewSwitch.tsx`). */
const shown = (page: Page) => page.locator('[data-stage-view-switch]');
const KEY = { Business: 'business', IT: 'it', Management: 'management' } as const;

/**
 * Switches by the view control from a scrolled position and holds that the
 * new view opened, at its top, with no fragment, on Analyze — and is still
 * there after a second and a half, sampled every frame, so a redirect that
 * bounces the reader back is seen whenever it lands rather than raced.
 */
async function switchTo(page: Page, name: keyof typeof KEY) {
  const key = KEY[name];
  // Scrolled as a reader scrolls — a wheel also ends a deep link's follow,
  // which a programmatic scroll would be pulled back by.
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 4000);
  await expect.poll(() => page.evaluate(() => window.scrollY), { message: 'the page could not be scrolled before the switch' }).toBeGreaterThan(40);
  // The wheel scrolls smoothly: click once the page has come to rest, as a reader would.
  await page.evaluate(async () => {
    let last = -1;
    let still = 0;
    while (still < 10) {
      await new Promise((r) => requestAnimationFrame(r));
      still = window.scrollY === last ? still + 1 : 0;
      last = window.scrollY;
    }
  });
  await radio(page, name).evaluate((el) => (el as HTMLElement).click());
  await expect(shown(page)).toHaveAttribute('data-stage-view-switch', key, { timeout: 30_000 });
  const seen = await page.evaluate(async () => {
    const out = new Set<string>();
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      await new Promise((r) => requestAnimationFrame(r));
      out.add(
        `${location.pathname.endsWith('/analyze')}|${document.querySelector('[data-stage-view-switch]')?.getAttribute('data-stage-view-switch')}|${new URL(location.href).searchParams.get('view')}|${location.hash}`,
      );
    }
    return [...out];
  });
  expect(seen, `${name}: the view did not hold, left Analyze, or kept a fragment`).toEqual([`true|${key}|${key}|`]);
  await expect.poll(() => page.evaluate(() => window.scrollY), { message: `${name} did not open at its top` }).toBe(0);
}

async function waitForIt(page: Page) {
  await expect(shown(page)).toHaveAttribute('data-stage-view-switch', 'it', { timeout: 90_000 });
  await expect(page.locator('[data-analyze-it]')).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1500);
}

// Since 3.5.0 the workspace page is gone (AB-11): an old address `/project/<id>?view=it#…` opens Analyze in the view
// and at the place its content lives now (`lib/workspace-redirect.ts`), and the three views are Analyze's, switched
// by its header. The promise is the same: from any of those places, each view opens at its top, without the old
// fragment, and stays.
test('from IT, with and without each fragment: Business, Management and IT open at their top and stay', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, account);
  for (const hash of ['', '#it-findings', '#it-objects', '#architecture', '#evidence', '#need']) {
    await page.goto(`/project/${projectId}?view=it${hash}`, { waitUntil: 'domcontentloaded' });
    if (hash === '#need') {
      // `#need` in IT is an old layer address: it lands in Business on the map, so the walk starts from there.
      await expect(page).toHaveURL(/\/analyze(\?view=business)?#process-map$/, { timeout: 60_000 });
      await expect(page.locator('[data-analyze-business="ready"]')).toBeVisible({ timeout: 90_000 });
      await page.waitForTimeout(1500);
      await switchTo(page, 'IT');
    } else {
      await waitForIt(page);
    }
    await switchTo(page, 'Business');
    await switchTo(page, 'IT');
    await switchTo(page, 'Management');
    await switchTo(page, 'Business');
    await switchTo(page, 'Management');
    await switchTo(page, 'IT');
  }
});

test('an old Management layer address lands where its content lives, Business opens from there, and a deep link keeps its place', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, account);
  // Management has no layers since ADR-087: `#architecture` is IT's Objects & dependencies, in Analyze.
  await page.goto(`/project/${projectId}?view=management#architecture`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/analyze\?view=it#[\w-]+$/, { timeout: 60_000 });
  await waitForIt(page);
  await switchTo(page, 'Business');
  // The decision and the costs are tools now: Re-design's decision step and Economics (ADR-143).
  await page.goto(`/project/${projectId}?view=management#changes`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/redesign(\?[^#]*)?#decide$/, { timeout: 60_000 });
  await page.goto(`/project/${projectId}?view=management#costs`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/tco(\?|$)/, { timeout: 60_000 });

  // A deliberate deep link into a view keeps its target (ADR-086): Management's risk section.
  await page.goto(`/project/${projectId}/analyze?view=management#mgmt-risk`, { waitUntil: 'domcontentloaded' });
  await expect(shown(page)).toHaveAttribute('data-stage-view-switch', 'management', { timeout: 90_000 });
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/[?&]view=management#mgmt-risk$/);
});
