import { test, expect, devices, type Page, type Locator } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';

/**
 * Owner, 03.10.2026 (translated): "BPMN full screen must also go one level up
 * and down; today in my tests that only works outside full screen." And, on
 * the inline workspace map: "How do I get one level up here … and why is so
 * much space wasted that could go directly to the BPMN viewer?" And on Design:
 * "in full screen I can't open the evidence boxes."
 *
 * What was wrong, measured on Z_MM_PO_APPROVAL (eight sub-processes on the top
 * level):
 *
 *   - bpmn-js's drill-down arrow opened the level on the canvas, but the map
 *     listened for `root.changed`, an event diagram-js never fires (it fires
 *     `root.set`): the path still said the top level and there was no way up —
 *     inline and in full screen alike;
 *   - the level path and the way up stood above the canvas, outside the
 *     element that goes full screen;
 *   - a click (or Enter) on a sub-process in full screen left full screen;
 *   - Back in full screen left it at once, whatever level was open;
 *   - the Design canvas showed a box's evidence in its side panel, which is
 *     not in full screen.
 *
 * Now the level path and a labelled "One level up" stand in the map's own
 * control row, inside the full-screen element; a sub-process opens in place
 * by click, tap, Enter and the arrow; Alt+Up goes up; Back walks back through
 * the levels opened in full screen and then leaves it; the level is the same
 * after leaving full screen as in it. The map takes the card's width: the
 * outline folds, the details take room only once a step is chosen.
 *
 * `FSLEVELS_SHOTS=<dir>` writes the screenshots.
 */

const SHOTS = process.env.FSLEVELS_SHOTS;
const FILE = 'Z_MM_PO_APPROVAL.abap';
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', FILE), 'utf8').replace(/\r\n/g, '\n');
const DESIGN_JSON = JSON.stringify({
  projectName: 'Full screen levels fixture',
  architectureOverview: {
    approachDescription: 'Side-by-side CAP service that reads purchase requisitions through released APIs.',
    nodeFramework: 'SAP CAP (Cloud Application Programming model)',
    runtimePlatform: 'SAP BTP',
  },
  nodeAppBlueprint: { projectStructure: [{ path: 'srv/service.cds', purpose: 'Service' }], apiEndpoints: [] },
  cloudServices: [],
  dataSync: { patternName: 'Released API calls', description: 'Synchronous calls through the destination service.' },
  securityHardening: [],
  roadmap: [],
});

const PHONE = { userAgent: devices['Pixel 7'].userAgent, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function seed(prefix: string): Promise<SeededProject> {
  const acct = await seedStageProject({ prefix, admin: true, acceptTerms: true, rich: true });
  const fingerprint = {
    sha256: sha256Hex(SOURCE), fileName: FILE, lineCount: SOURCE.split('\n').length,
    byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
  };
  await adminMergeDoc('projects', acct.projectId, { legacyCode: SOURCE, inputFingerprint: fingerprint, documentation: null, solutionDesign: DESIGN_JSON });
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

async function signIn(page: Page, acct: SeededProject, phone = false): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, acct);
  if (phone) await page.setViewportSize(PHONE.viewport);
}

/** The workspace's map, ready. */
async function openWorkspaceMap(page: Page, acct: SeededProject, phone = false): Promise<Locator> {
  await page.goto(`/project/${acct.projectId}?view=business`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-workspace-process="ready"]')).toBeAttached({ timeout: 120_000 });
  if (phone) {
    const map = page.locator('[data-process-map]').first().getByRole('radio', { name: /Map/ }).first();
    if ((await map.getAttribute('aria-checked')) !== 'true') await map.click();
  }
  const frame = page.locator('[data-workspace-process] [data-map-canvas-frame]').first();
  await expect.poll(async () => frame.locator('[data-map-node]').count(), { timeout: 90_000 }).toBeGreaterThan(5);
  await page.waitForTimeout(500);
  return frame;
}

/** A collapsed sub-process on the level on show, by its drill-down arrow. */
async function subProcessOnLevel(scope: Locator): Promise<string> {
  const id = await scope.evaluate((root) => {
    for (const arrow of root.querySelectorAll('.bjs-drilldown')) {
      if ((arrow as HTMLElement).getClientRects().length === 0) continue;
      const owner = arrow.closest('.djs-overlays')?.getAttribute('data-container-id');
      if (owner) return owner;
    }
    return '';
  });
  expect(id, 'no collapsed sub-process on this level').not.toBe('');
  return id;
}

const levelOf = (frame: Locator) => frame.getAttribute('data-map-plane');

/** The level path in the frame: visible, naming the level on show. */
async function expectPathAt(frame: Locator, plane: string) {
  const current = frame.locator('[data-process-path] [aria-current="true"]');
  await expect(current).toBeVisible();
  await expect(current).toHaveAttribute('data-process-crumb', plane);
}

/** Inside the full-screen frame and inside the window. */
async function expectOnScreen(page: Page, target: Locator, label: string) {
  await expect(target, label).toBeVisible();
  const box = (await target.boundingBox())!;
  const size = page.viewportSize()!;
  expect(box.y, `${label}: top`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${label}: bottom`).toBeLessThanOrEqual(size.height);
  const hit = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  });
  expect(hit, `${label}: covered`).toBe(true);
}

test.describe('levels in full screen and inline — desktop', () => {
  let acct: SeededProject;
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    acct = await seed('fslevels-d');
  });

  test('the workspace map: down and up by click, Enter, the arrow, the control and Alt+Up, inline and in full screen; the level survives full screen', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, acct);
    const frame = await openWorkspaceMap(page, acct);
    const toggle = frame.locator('[data-map-fullscreen-toggle]');
    const up = frame.locator('[data-process-up]');

    // Inline: the path is in the control row; at the top it names the program and offers no way up.
    await expectPathAt(frame, 'top');
    await expect(frame.locator('[data-map-view-tools] [data-process-path]')).toBeVisible();
    await expect(up).toHaveCount(0);
    const sub = await subProcessOnLevel(frame);
    // The arrow (bpmn-js's own) — the path follows it now.
    await frame.locator(`.djs-overlays[data-container-id="${sub}"] .bjs-drilldown`).click();
    await expect.poll(() => levelOf(frame)).toBe(sub);
    await expectPathAt(frame, sub);
    await expect(up).toBeVisible();
    await expect(up).toHaveAccessibleName(/One level up/);
    await up.click();
    await expect.poll(() => levelOf(frame)).toBe('top');
    await expect(up).toHaveCount(0);

    // Full screen: a click on the sub-process opens it there, and full screen stays.
    await toggle.click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await frame.locator(`[data-map-node="${sub}"]`).click();
    await expect.poll(() => levelOf(frame)).toBe(sub);
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await expectPathAt(frame, sub);
    await expectOnScreen(page, up, 'the way up in full screen');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-fullscreen-sublevel-1440.png` });

    // Up by the control.
    await up.click();
    await expect.poll(() => levelOf(frame)).toBe('top');
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');

    // Down by Enter, up by Alt+Up.
    await frame.locator(`[data-map-node="${sub}"]`).focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => levelOf(frame)).toBe(sub);
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(() => levelOf(frame)).toBe('top');
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');

    // Down by the arrow; leave full screen; the level stays, and stays on the way back in.
    await frame.locator(`.djs-overlays[data-container-id="${sub}"] .bjs-drilldown`).click();
    await expect.poll(() => levelOf(frame)).toBe(sub);
    await toggle.click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
    await page.waitForTimeout(400);
    expect(await levelOf(frame), 'leaving full screen changed the level').toBe(sub);
    await expectPathAt(frame, sub);
    await toggle.click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await page.waitForTimeout(400);
    expect(await levelOf(frame), 'entering full screen changed the level').toBe(sub);
    await page.keyboard.press('Escape');
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
    await page.waitForTimeout(400);
    expect(await levelOf(frame), 'Escape changed the level').toBe(sub);
  });

  test('the Documentation map keeps the level in the address in full screen; the editor walks its own levels there', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, acct);
    await page.goto(`/project/${acct.projectId}/documentation`, { waitUntil: 'domcontentloaded' });
    const frame = page.locator('[data-map-canvas-frame]').first();
    await expect.poll(async () => frame.locator('[data-map-node]').count(), { timeout: 120_000 }).toBeGreaterThan(5);
    await page.waitForTimeout(800);
    const sub = await subProcessOnLevel(frame);
    const toggle = frame.locator('[data-map-fullscreen-toggle]');

    await toggle.click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await frame.locator(`[data-map-node="${sub}"]`).click();
    await expect.poll(() => levelOf(frame)).toBe(sub);
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain(`map=${sub}`);
    await expectPathAt(frame, sub);
    await frame.locator('[data-process-up]').click();
    await expect.poll(() => levelOf(frame)).toBe('top');
    await frame.locator(`.djs-overlays[data-container-id="${sub}"] .bjs-drilldown`).click();
    await expect.poll(() => levelOf(frame)).toBe(sub);
    await toggle.click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
    await page.waitForTimeout(400);
    expect(await levelOf(frame)).toBe(sub);
    expect(await page.evaluate(() => location.hash)).toContain(`map=${sub}`);
    await frame.locator('[data-process-up]').click();
    await expect.poll(() => levelOf(frame)).toBe('top');

    // The editor: its own levels, the same path and way up, in full screen.
    await page.locator('[data-process-edit-toggle]').click();
    const editor = page.locator('[data-process-editor]');
    await expect.poll(async () => editor.locator('[data-process-editor-canvas] .djs-shape').count(), { timeout: 60_000 }).toBeGreaterThan(5);
    await editor.locator('[data-editor-fullscreen-toggle]').click();
    await expect(editor).toHaveAttribute('data-editor-fullscreen', 'true');
    const editorSub = await subProcessOnLevel(editor.locator('[data-process-editor-canvas]'));
    await editor.locator(`.djs-overlays[data-container-id="${editorSub}"] .bjs-drilldown`).click();
    const editorPath = editor.locator('[data-process-path] [aria-current="true"]');
    await expect(editorPath).toHaveAttribute('data-process-crumb', editorSub);
    await expectOnScreen(page, editor.locator('[data-process-up]'), 'the editor\'s way up in full screen');
    await editor.locator('[data-process-up]').click();
    await expect(editor.locator('[data-process-path]')).toHaveCount(0);
    await editor.locator(`.djs-overlays[data-container-id="${editorSub}"] .bjs-drilldown`).click();
    await expect(editorPath).toHaveAttribute('data-process-crumb', editorSub);
    await page.keyboard.press('Alt+ArrowUp');
    await expect(editor.locator('[data-process-path]')).toHaveCount(0);
    await editor.locator(`.djs-overlays[data-container-id="${editorSub}"] .bjs-drilldown`).click();
    await expect(editorPath).toHaveAttribute('data-process-crumb', editorSub);
    await editor.locator('[data-editor-fullscreen-toggle]').click();
    await expect(editor).toHaveAttribute('data-editor-fullscreen', 'false');
    await expect(editorPath).toHaveAttribute('data-process-crumb', editorSub);
  });

  test('the map takes the width: details only when a step is chosen, the outline folds and is remembered', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, acct);
    const frame = await openWorkspaceMap(page, acct);
    const map = page.locator('[data-workspace-process] [data-process-map]').first();
    const share = async () => {
      const [f, m] = await Promise.all([frame.boundingBox(), map.boundingBox()]);
      return f!.width / m!.width;
    };
    await expect(page.locator('[data-process-map-details]')).toHaveCount(0);
    expect(await share(), 'the map is under 70 % of the card with nothing chosen').toBeGreaterThanOrEqual(0.7);
    const before = (await frame.boundingBox())!.width;
    if (SHOTS) await map.screenshot({ path: `${SHOTS}/after-inline-1440.png` });

    // A step: the details open beside the map; closing them gives the width back.
    const step = frame.locator('[data-map-node]').nth(2);
    await step.click();
    const details = page.locator('[data-process-map-details]');
    await expect(details).toBeVisible();
    if (SHOTS) await map.screenshot({ path: `${SHOTS}/after-inline-details-1440.png` });
    await details.locator('[data-process-code-card-close]').click();
    await expect(details).toHaveCount(0);
    await expect.poll(async () => Math.round((await frame.boundingBox())!.width)).toBe(Math.round(before));

    // The outline folds from the control row, and the choice is kept for this viewer.
    const layout = page.locator('[data-workspace-process] [data-process-map-layout]').first();
    await expect(layout).toHaveAttribute('data-outline', 'open');
    await frame.locator('[data-process-outline-toggle]').click();
    await expect(layout).toHaveAttribute('data-outline', 'closed');
    await expect(page.locator('[data-workspace-process] [data-process-map-outline-column]').first()).toBeHidden();
    await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(before + 100);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-process] [data-process-map-layout]').first()).toHaveAttribute('data-outline', 'closed', { timeout: 120_000 });
    await page.locator('[data-workspace-process] [data-process-outline-toggle]').first().click();
    await expect(page.locator('[data-workspace-process] [data-process-map-layout]').first()).toHaveAttribute('data-outline', 'open');

    // Narrower than 1280 px: the outline starts folded for a viewer who never chose, and details lie over the map.
    await page.evaluate(() => window.localStorage.removeItem('cc.processMap.outline'));
    await page.setViewportSize({ width: 1200, height: 900 });
    const narrow = await openWorkspaceMap(page, acct);
    await expect(page.locator('[data-workspace-process] [data-process-map-layout]').first()).toHaveAttribute('data-outline', 'closed');
    const width = (await narrow.boundingBox())!.width;
    await narrow.locator('[data-map-node]').nth(2).click();
    await expect(page.locator('[data-process-map-details]')).toBeVisible();
    expect(Math.round((await narrow.boundingBox())!.width), 'the details shrank the map instead of lying over it').toBe(Math.round(width));
    await page.keyboard.press('Escape');

    if (SHOTS) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await openWorkspaceMap(page, acct);
      await page.locator('[data-workspace-process] [data-process-map]').first().screenshot({ path: `${SHOTS}/after-inline-1280.png` });
    }
  });

  test('Design full screen: a box opens its evidence inside full screen; Escape closes it first, then full screen', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, acct);
    await page.goto(`/project/${acct.projectId}/design`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('svg[data-architecture-canvas]')).toBeVisible({ timeout: 120_000 });
    const card = page.locator('[data-canvas-card]');
    await card.locator('[data-canvas-fullscreen-toggle]').click();
    await expect(card).not.toHaveAttribute('data-canvas-fullscreen', 'false');
    await card.locator('[data-canvas-box]').first().click();
    const drawer = page.locator('[data-design-fullscreen-evidence]');
    await expect(drawer).toBeVisible();
    expect(await drawer.evaluate((el) => !!el.closest('[data-canvas-card]')), 'the drawer is not inside the full-screen element').toBe(true);
    await expect(drawer.locator('[data-design-evidence]')).toBeVisible();
    await expectOnScreen(page, drawer.locator('[data-cc-canvas-drawer-close]'), 'the drawer\'s close button');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-design-fullscreen-evidence-1440.png` });
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(card).not.toHaveAttribute('data-canvas-fullscreen', 'false');
    await page.keyboard.press('Escape');
    await expect(card).toHaveAttribute('data-canvas-fullscreen', 'false');
  });

  test('a step chosen in full screen shows its details (full screen closes, as decided on 02.10.2026)', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, acct);
    const frame = await openWorkspaceMap(page, acct);
    await frame.locator('[data-map-fullscreen-toggle]').click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    // A step, not a sub-process: the first node with no drill-down arrow.
    const step = await frame.evaluate((root) => {
      const subs = new Set([...root.querySelectorAll('.bjs-drilldown')].map((a) => a.closest('.djs-overlays')?.getAttribute('data-container-id')));
      const node = [...root.querySelectorAll<HTMLElement>('[data-map-node]')].find((b) => b.getClientRects().length > 0 && !subs.has(b.dataset.mapNode) && b.getBoundingClientRect().width > 60);
      return node?.dataset.mapNode ?? '';
    });
    expect(step).not.toBe('');
    await frame.locator(`[data-map-node="${step}"]`).click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
    await expect(page.locator(`[data-process-code-card="${step}"]`)).toBeVisible();
  });
});

test.describe('levels in full screen — phone, touch', () => {
  test.use(PHONE);
  let acct: SeededProject;
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    acct = await seed('fslevels-p');
  });

  test('tap down, tap up (44 px), the arrow; Back goes up the levels opened in full screen first, then leaves it', async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, acct, true);
    const frame = await openWorkspaceMap(page, acct, true);
    const toggle = frame.locator('[data-map-fullscreen-toggle]');
    const url = page.url();
    const sub = await subProcessOnLevel(frame);

    await toggle.tap();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await frame.locator(`[data-map-node="${sub}"]`).tap();
    await expect.poll(() => levelOf(frame)).toBe(sub);
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await expectPathAt(frame, sub);
    const up = frame.locator('[data-process-up]');
    await expectOnScreen(page, up, 'the way up on a phone');
    const box = (await up.boundingBox())!;
    expect(box.height, 'the way up is not a 44 px target').toBeGreaterThanOrEqual(43.5);
    expect(box.width).toBeGreaterThanOrEqual(43.5);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-phone-fullscreen-sublevel.png` });
    await up.tap();
    await expect.poll(() => levelOf(frame)).toBe('top');

    // The arrow, by touch.
    await frame.locator(`.djs-overlays[data-container-id="${sub}"] .bjs-drilldown`).tap();
    await expect.poll(() => levelOf(frame)).toBe(sub);

    // Back: first the level opened in full screen …
    await page.goBack();
    await expect.poll(() => levelOf(frame)).toBe('top');
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    // … then the level opened before it (by the control, also in full screen) …
    await page.goBack();
    await expect.poll(() => levelOf(frame)).toBe(sub);
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    // … then full screen itself, on the level it was entered on, at the same address.
    await page.goBack();
    await expect.poll(() => levelOf(frame)).toBe('top');
    await page.goBack();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false', { timeout: 10_000 });
    await page.waitForTimeout(400);
    expect(page.url()).toBe(url);
    expect(await levelOf(frame)).toBe('top');

    // Leaving by the button keeps the level open in full screen.
    await toggle.tap();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    await frame.locator(`[data-map-node="${sub}"]`).tap();
    await expect.poll(() => levelOf(frame)).toBe(sub);
    await frame.locator('[data-map-fullscreen-toggle]').tap();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
    await page.waitForTimeout(400);
    expect(await levelOf(frame)).toBe(sub);
    await expect(frame.locator('[data-process-up]')).toBeVisible();
  });
});
