import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';

/**
 * Owner 02.10.2026 on the Documentation stage: "auch in docu muss ich den
 * ganzen prozess sehen und navigieren können der hier aufgeschrieben wurde,
 * ich brauche auch hier + - und vollbild wie auch sonst, saubere
 * Navigationsmöglichkeit". The map was cut off on the right with no control
 * but the bpmn.io mark.
 *
 * Now the map opens with the whole process in view, and carries the editor's
 * own zoom out / zoom in / fit / full screen (`CanvasViewControls`,
 * `useCanvasFullscreen`). A step chosen in full screen closes it and its
 * chapter is shown, as outside. Tested on a signed project and on the demo.
 */

const FILE = 'Z_MM_PO_APPROVAL.abap';
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', FILE), 'utf8').replace(/\r\n/g, '\n');

const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EMAIL = `doc-map-${STAMP}@cleancore-test.io`;
const PASSWORD = 'DocMap123!';
const PROJECT_ID = `doc-map-${STAMP}`;
const RUN_ID = `doc-map-run-${STAMP}`;

async function nodesInsideCanvas(page: Page): Promise<{ nodes: number; outside: string[] }> {
  return page.locator('[data-process-map-canvas]').evaluate((canvas) => {
    const box = canvas.getBoundingClientRect();
    const outside: string[] = [];
    const nodes = [...canvas.querySelectorAll<HTMLElement>('[data-map-node]')];
    for (const node of nodes) {
      const r = node.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < box.left - 1 || r.top < box.top - 1 || r.right > box.right + 1 || r.bottom > box.bottom + 1) {
        outside.push(node.dataset.mapNode ?? '?');
      }
    }
    return { nodes: nodes.length, outside };
  });
}

async function zoomPercent(page: Page): Promise<number> {
  return Number((await page.locator('[data-map-zoom]').innerText()).replace(/[^\d]/g, ''));
}

/** The four checks, on whichever Documentation stage is open. */
async function exerciseTheMap(page: Page, label: string) {
  const canvas = page.locator('[data-process-map-canvas]');
  await expect(canvas).toBeVisible({ timeout: 90000 });
  await expect.poll(async () => page.locator('[data-process-map-canvas] [data-map-node]').count(), { timeout: 60000 }).toBeGreaterThan(5);

  // 1. The whole process on open.
  const opened = await nodesInsideCanvas(page);
  expect(opened.outside, `${label}: steps outside the map on open`).toEqual([]);

  // 2. Zoom changes the scale, fit brings the whole process back.
  const frame = page.locator('[data-map-canvas-frame]');
  const before = await zoomPercent(page);
  await frame.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => zoomPercent(page)).toBeGreaterThan(before);
  await frame.getByRole('button', { name: 'Zoom out' }).click();
  await frame.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(() => zoomPercent(page)).toBeLessThan(before);
  await frame.getByRole('button', { name: 'Zoom in' }).click();
  await frame.getByRole('button', { name: 'Zoom in' }).click();
  await frame.getByRole('button', { name: 'Fit to screen' }).click();
  await expect.poll(async () => (await nodesInsideCanvas(page)).outside).toEqual([]);

  // 3. Full screen opens and closes; labelled, pressed, focus back on the toggle.
  const toggle = frame.locator('[data-map-fullscreen-toggle]');
  await expect(toggle).toHaveAccessibleName('Full screen');
  await toggle.click();
  await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAccessibleName('Leave full screen');
  const size = page.viewportSize()!;
  const filled = await frame.boundingBox();
  expect(filled!.width, `${label}: full screen does not fill the window`).toBeGreaterThan(size.width - 2);
  expect((await nodesInsideCanvas(page)).outside, `${label}: steps outside the map in full screen`).toEqual([]);
  await toggle.click();
  await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
  await expect(toggle).toBeFocused();

  // 4. A step chosen in full screen closes it and opens its chapter.
  await toggle.click();
  await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
  const step = page.locator('[data-process-map-canvas] [data-map-node]').nth(3);
  const id = await step.getAttribute('data-map-node');
  await step.click();
  await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
  await expect(page.locator(`[data-map-node="${id}"]`)).toHaveAttribute('data-selected', 'true');
  const panel = page.locator('[data-handbook-panel]');
  await expect(panel).toBeInViewport();
  return { panel, id };
}

test.describe('the Documentation map: whole process, zoom, full screen', () => {
  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Doc', lastName: 'Map', email: EMAIL,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });
    const fingerprint = {
      sha256: sha256Hex(SOURCE), fileName: FILE, lineCount: SOURCE.split('\n').length,
      byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
    };
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Documentation map fixture', userId: uid, createdAt: new Date(), status: 'transformed',
      legacyCode: SOURCE,
      analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
      cleanCoreScore: 62,
      solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n',
      generatedCode: 'export const ok = true;\n',
      activeRunId: RUN_ID,
      inputFingerprint: fingerprint,
    });
    const unsignedRun = {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint,
    };
    const runHash = recomputeStoredRunHash(unsignedRun);
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
    });
  });

  test('a signed project: the map fits on open, zooms, opens full screen, and a step still opens its chapter', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
    const { panel } = await exerciseTheMap(page, 'project');
    await expect(panel).not.toHaveAttribute('data-handbook-panel', 'none');
  });

  test('when the browser refuses full screen the map covers the window, and Escape leaves it', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = function refuse() {
        return Promise.reject(new TypeError('not allowed'));
      };
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.locator('[data-process-map-canvas] [data-map-node]').count(), { timeout: 90000 }).toBeGreaterThan(5);
    const frame = page.locator('[data-map-canvas-frame]');
    const toggle = frame.locator('[data-map-fullscreen-toggle]');
    await toggle.click();
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'true');
    const box = await frame.boundingBox();
    expect(box!.width).toBeGreaterThan(1438);
    expect(box!.height).toBeGreaterThan(898);
    await page.keyboard.press('Escape');
    await expect(frame).toHaveAttribute('data-map-fullscreen', 'false');
    await expect(toggle).toBeFocused();
  });

  test('the demo: the same map, the same controls', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/demo/documentation', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
    const { panel } = await exerciseTheMap(page, 'demo');
    await expect(panel).not.toHaveAttribute('data-handbook-panel', 'none');
  });
});
