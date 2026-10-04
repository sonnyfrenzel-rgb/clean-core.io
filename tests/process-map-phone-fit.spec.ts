import { test, expect, devices, type Page, type Locator } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';

/**
 * On a phone the process map fits its card at a readable zoom (ADR-072,
 * amended 04.10.2026).
 *
 * The main path of Z_MM_PO_APPROVAL is some 1,350 BPMN units wide; the card
 * on a 390 px phone leaves about 340 px for it, so a fit across needs some
 * 20 % — and the floor on a phone is 40 % ("20 % is not readable"). The map
 * opened at its start with the right of the process cut off. On a phone the
 * map is now drawn from a narrower layout of the same model — the main path
 * wraps after fewer columns — so it fits across at 40 % or more and is read
 * downwards. The layout is a view: the BPMN file that is exported, edited and
 * stored is not touched (`tests/bpmn-phone-layout.spec.ts`).
 *
 * For each map that uses the inline renderer — the workspace (Business), the
 * Documentation stage's "Explore the process", the two demo pages — at 390 px
 * with touch: the opening zoom is at least 40 %, and every drawn shape, line
 * and label of the level on show lies inside the canvas from left to right.
 * The big example and a small one; full screen on a phone too.
 *
 * `PHONEFIT_SHOTS=<dir>` writes the screenshots.
 */

const SHOTS = process.env.PHONEFIT_SHOTS;
const PHONE = { userAgent: devices['Pixel 7'].userAgent, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const BIG = 'Z_MM_PO_APPROVAL.abap';
const SMALL = 'Z_MATERIAL_STOCK_CALC.txt';
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n');

async function seed(prefix: string, file: string): Promise<SeededProject> {
  const source = read(file);
  const acct = await seedStageProject({ prefix, admin: true, acceptTerms: true, rich: true });
  const fingerprint = {
    sha256: sha256Hex(source), fileName: file, lineCount: source.split('\n').length,
    byteSize: source.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
  };
  await adminMergeDoc('projects', acct.projectId, { legacyCode: source, inputFingerprint: fingerprint, documentation: null });
  const unsignedRun = {
    runId: acct.runId, projectId: acct.projectId, userId: acct.uid,
    createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62, inputFingerprint: fingerprint,
  };
  const runHash = recomputeStoredRunHash(unsignedRun);
  await adminSetDoc(`projects/${acct.projectId}/runs`, acct.runId, {
    ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
  });
  return acct;
}

interface Fit {
  zoom: number;
  canvas: { left: number; right: number };
  drawn: { left: number; right: number; width: number; height: number };
  nodes: number;
}

/** The opening zoom and the drawn extent of the level on show, against the canvas. */
async function measure(frame: Locator): Promise<Fit> {
  const zoom = Number((await frame.locator('[data-map-zoom]').innerText()).replace(/[^\d]/g, ''));
  const box = await frame.locator('[data-process-map-canvas]').evaluate((host) => {
    const c = host.getBoundingClientRect();
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    // Every drawn thing of the level on show — shapes, lines, labels — not the root.
    for (const el of host.querySelectorAll<SVGGraphicsElement>('.djs-element:not(.djs-root) > .djs-visual')) {
      if (el.getClientRects().length === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    }
    return { canvas: { left: c.left, right: c.right }, drawn: { left, right, width: right - left, height: bottom - top } };
  });
  const nodes = await frame.locator('[data-map-node]').count();
  return { zoom, ...box, nodes };
}

async function expectFits(frame: Locator, label: string): Promise<Fit> {
  await expect.poll(async () => frame.locator('[data-map-node]').count(), { timeout: 90_000 }).toBeGreaterThan(2);
  // The fit settles on the frame after the import.
  await frame.page().waitForTimeout(600);
  const fit = await measure(frame);
  console.log(`${label}: zoom ${fit.zoom} %, canvas ${Math.round(fit.canvas.left)}–${Math.round(fit.canvas.right)}, drawn ${Math.round(fit.drawn.left)}–${Math.round(fit.drawn.right)} (${Math.round(fit.drawn.width)}×${Math.round(fit.drawn.height)} px)`);
  expect(fit.zoom, `${label}: opening zoom`).toBeGreaterThanOrEqual(40);
  expect(fit.drawn.left, `${label}: cut off on the left`).toBeGreaterThanOrEqual(fit.canvas.left - 1);
  expect(fit.drawn.right, `${label}: cut off on the right`).toBeLessThanOrEqual(fit.canvas.right + 1);
  return fit;
}

async function shot(page: Page, name: string, frame: Locator) {
  if (!SHOTS) return;
  await expect.poll(async () => frame.locator('[data-map-node]').count(), { timeout: 90_000 }).toBeGreaterThan(2);
  await page.waitForTimeout(600);
  await frame.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function signIn(page: Page, acct: SeededProject) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, acct);
  await page.setViewportSize(PHONE.viewport);
}

/** On a phone a map may open as its list of steps: switch it to the map. */
async function showMap(page: Page, scope: string): Promise<Locator> {
  const map = page.locator(scope).first();
  await expect(map).toBeAttached({ timeout: 120_000 });
  const radio = map.getByRole('radio', { name: /^Map$/ }).first();
  const frame = map.locator('[data-map-canvas-frame]').first();
  await expect(radio.or(frame).first()).toBeVisible({ timeout: 120_000 });
  if ((await radio.count()) && (await radio.getAttribute('aria-checked')) !== 'true') await radio.click();
  await expect(frame).toBeVisible({ timeout: 120_000 });
  return frame;
}

async function workspaceMap(page: Page, acct: SeededProject): Promise<Locator> {
  await page.goto(`/project/${acct.projectId}?view=business`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-workspace-process="ready"]')).toBeAttached({ timeout: 120_000 });
  return showMap(page, '[data-workspace-process]');
}

async function documentationMap(page: Page, acct: SeededProject): Promise<Locator> {
  await page.goto(`/project/${acct.projectId}/documentation`, { waitUntil: 'domcontentloaded' });
  return showMap(page, '[data-documentation-explore]');
}

test.use({ hasTouch: true, userAgent: PHONE.userAgent });

test.describe('on a phone the process map fits its card at 40 % or more', () => {
  let big: SeededProject;
  let small: SeededProject;
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    big = await seed('phonefit-big', BIG);
    small = await seed('phonefit-small', SMALL);
  });

  test('the workspace (Business): the big example and a small one, inline and in full screen', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, big);
    const frame = await workspaceMap(page, big);
    await shot(page, 'workspace-big-390', frame);
    await expectFits(frame, 'workspace, Z_MM_PO_APPROVAL');
    // Full screen on a phone: the same narrow layout, the whole width in view.
    await frame.locator('[data-map-fullscreen-toggle]').click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await page.waitForTimeout(500);
    await expectFits(frame, 'workspace full screen, Z_MM_PO_APPROVAL');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/workspace-big-fullscreen-390.png` });
    // A sub-process opens its level, which fits as well, and the way up works.
    const sub = await frame.evaluate((root) => {
      for (const arrow of root.querySelectorAll('.bjs-drilldown')) {
        if ((arrow as HTMLElement).getClientRects().length === 0) continue;
        const owner = arrow.closest('.djs-overlays')?.getAttribute('data-container-id');
        if (owner) return owner;
      }
      return '';
    });
    expect(sub, 'no collapsed sub-process on the top level').not.toBe('');
    await frame.locator(`[data-map-node="${sub}"]`).click();
    await expect.poll(() => frame.getAttribute('data-map-plane')).toBe(sub);
    await page.waitForTimeout(400);
    await expectFits(frame, `workspace full screen, level ${sub}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/workspace-big-sublevel-390.png` });
    await frame.locator('[data-process-up]').click();
    await expect.poll(() => frame.getAttribute('data-map-plane')).toBe('top');
    await page.keyboard.press('Escape');
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');

    // Line anchors stand under the names; a step opens its details, with its lines.
    await expect(frame.locator('[data-process-map-canvas]')).toHaveAttribute('data-map-layout', 'phone');
    expect(await frame.locator('.cc-map-anchor-code').count()).toBeGreaterThan(5);
    await expect(frame.locator('.djs-label', { hasText: '?' }).first()).toBeVisible();
    await frame.locator('[data-map-node]').nth(2).click();
    const details = page.locator('[data-process-map-details]');
    await expect(details).toBeVisible();
    await expect(details).toContainText(/L\d+/);
  });

  test('the workspace (Business): a small example that fits keeps its layout', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, small);
    const frame = await workspaceMap(page, small);
    await expectFits(frame, 'workspace, Z_MATERIAL_STOCK_CALC');
    await shot(page, 'workspace-small-390', frame);
  });

  test('Documentation, "Explore the process": the big example', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, big);
    const frame = await documentationMap(page, big);
    await shot(page, 'documentation-big-390', frame);
    await expectFits(frame, 'documentation, Z_MM_PO_APPROVAL');
  });

  test('the demo workspace and the demo documentation (Z_MM_PO_APPROVAL)', async ({ page }) => {
    test.setTimeout(300_000);
    // The demo workspace is for a signed-in account, like a project.
    await signIn(page, small);
    await page.goto('/demo/workspace?view=business', { waitUntil: 'domcontentloaded' });
    const frame = await showMap(page, '[data-process-map]');
    await shot(page, 'demo-workspace-390', frame);
    await expectFits(frame, 'demo workspace');

    await page.goto('/demo/documentation', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60_000 });
    const doc = await showMap(page, '[data-documentation-explore]');
    await shot(page, 'demo-documentation-390', doc);
    await expectFits(doc, 'demo documentation');
  });
});
