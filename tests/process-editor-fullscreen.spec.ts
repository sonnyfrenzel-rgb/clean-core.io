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
 * The editor in full screen keeps every function on screen (owner, 02.10.2026:
 * "the footer is cut off at the bottom of the screen").
 *
 * Until this fix the canvas was `calc(100vh - 16rem)` tall in full screen while
 * toolbar, palette, the "started from" line, the shortcuts and the footer
 * together needed well over 16rem, so Save and Discard sat below the edge of the
 * screen. Full screen is now one column the height of the window in which only
 * the canvas row gives way. Measured here at the common desktop sizes, at
 * browser zoom 125 % (the same window in fewer CSS pixels), and in the fallback
 * the editor uses when the browser refuses element full screen — a window that
 * still has the browser's own bars, which is what `100dvh` is for.
 */

const EXAMPLE = path.resolve(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap');
const FILE_NAME = 'Z_MM_PO_APPROVAL.abap';
const SOURCE = fs.readFileSync(EXAMPLE, 'utf8').replace(/\r\n/g, '\n');

const STAMP = Date.now();
const EMAIL = `editorfs-${STAMP}@cleancore-test.io`;
const PASSWORD = 'EditorFs123!';
const PROJECT_ID = `editor-fs-${STAMP}`;
const RUN_ID = `editor-fs-run-${STAMP}`;

/** Desktop windows, and the same windows at browser zoom 125 % (CSS pixels = window / 1.25). */
const WINDOWS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768 at 125 %', width: 1093, height: 614 },
  { name: '1440x900 at 125 %', width: 1152, height: 720 },
] as const;

async function openEditor(page: Page) {
  await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-process-map]').waitFor({ timeout: 90000 });
  await page.locator('[data-process-map-canvas]').waitFor({ timeout: 90000 });
  await page.locator('[data-process-edit-toggle]').click();
  await page.locator('[data-process-editor]').waitFor({ timeout: 60000 });
  await expect
    .poll(async () => page.locator('[data-process-editor-canvas] .djs-shape').count(), { timeout: 60000 })
    .toBeGreaterThan(5);
}

/** Every footer action, the toolbar and a usable canvas are inside the window. */
async function expectAllOnScreen(page: Page, label: string) {
  const size = page.viewportSize()!;
  const save = page.locator('[data-editor-save]');
  await expect(save, label).toBeVisible();
  for (const selector of ['[data-editor-save]', '[data-editor-discard]', '[data-editor-fullscreen-toggle]', '[data-editor-export="bpmn"]', '[data-editor-import]', '[data-editor-compare]']) {
    const box = await page.locator(selector).boundingBox();
    expect(box, `${label}: ${selector} has a box`).toBeTruthy();
    expect(box!.y, `${label}: ${selector} top`).toBeGreaterThanOrEqual(0);
    expect(box!.x, `${label}: ${selector} left`).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, `${label}: ${selector} bottom`).toBeLessThanOrEqual(size.height);
    expect(box!.x + box!.width, `${label}: ${selector} right`).toBeLessThanOrEqual(size.width);
  }
  const footer = await page.locator('[data-process-editor-footer]').boundingBox();
  expect(footer!.y + footer!.height, `${label}: footer bottom`).toBeLessThanOrEqual(size.height);
  // Clickable, not merely inside: nothing sits on top of Save, and the editor does not scroll to reach it.
  const hit = await save.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  });
  expect(hit, `${label}: Save is the element under its own centre`).toBe(true);
  await save.click({ trial: true, timeout: 5000 });
  const root = await page.locator('[data-process-editor]').evaluate((el) => ({ scroll: el.scrollHeight - el.clientHeight }));
  expect(root.scroll, `${label}: the full-screen editor does not scroll`).toBeLessThanOrEqual(1);
  // The canvas takes the rest, and the rest is a canvas worth having.
  const canvas = await page.locator('[data-process-editor-canvas]').boundingBox();
  expect(canvas!.height, `${label}: canvas height`).toBeGreaterThanOrEqual(180);
  expect(canvas!.y + canvas!.height, `${label}: canvas ends above the footer`).toBeLessThanOrEqual(footer!.y);
  // On a short canvas the overview map does not cover bpmn-js's own tools.
  const tools = await page.locator('[data-process-editor-canvas] .djs-palette').boundingBox();
  const map = await page.locator('[data-editor-minimap]').boundingBox();
  if (tools && map) {
    const apart = map.x >= tools.x + tools.width || map.x + map.width <= tools.x
      || map.y >= tools.y + tools.height || map.y + map.height <= tools.y;
    expect(apart, `${label}: minimap clear of the tool palette`).toBe(true);
  }
}

test.describe('the BPMN editor in full screen', () => {
  test.describe.configure({ mode: 'serial' });

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
      firstName: 'Editor', lastName: 'Fullscreen', email: EMAIL,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    const fingerprint = {
      sha256: sha256Hex(SOURCE), fileName: FILE_NAME, lineCount: SOURCE.split('\n').length,
      byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
    };
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Purchase order approval', userId: uid, createdAt: new Date(), status: 'documented',
      legacyCode: SOURCE, activeRunId: RUN_ID, inputFingerprint: fingerprint,
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

  test('browser full screen: Save and every footer action stay inside the window at desktop sizes and at 125 %', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await openEditor(page);
    const root = page.locator('[data-process-editor]');

    for (const size of WINDOWS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.locator('[data-editor-fullscreen-toggle]').click();
      await expect(root).toHaveAttribute('data-editor-fullscreen', 'true');
      await expect(root).toHaveAttribute('data-editor-fullscreen-mode', 'browser');
      await expectAllOnScreen(page, size.name);
      await page.locator('[data-editor-fullscreen-toggle]').click();
      await expect(root).toHaveAttribute('data-editor-fullscreen', 'false');
    }
  });

  test('window full screen when the browser refuses: same layout, browser bars included, Escape leaves', async ({ page }) => {
    test.setTimeout(300 * 1000);
    // An embedded page or an iPhone: element full screen is refused.
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = function refuse() {
        return Promise.reject(new TypeError('not allowed'));
      };
    });
    // `next dev` puts its own indicator in the lower left corner; a production build has none.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'nextjs-portal { display: none !important; }';
        document.head.appendChild(style);
      });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await openEditor(page);
    const root = page.locator('[data-process-editor]');

    // A laptop: 1366x768 screen less the browser's tab strip, address bar and taskbar.
    for (const size of [...WINDOWS, { name: 'laptop 1366x768 with browser bars', width: 1366, height: 657 }]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.locator('[data-editor-fullscreen-toggle]').click();
      await expect(root).toHaveAttribute('data-editor-fullscreen-mode', 'overlay');
      await expectAllOnScreen(page, `${size.name} (window)`);
      // It covers the page: the app's own header is not on top of the toolbar.
      const toolbarFree = await page.locator('[data-editor-fullscreen-toggle]').evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && (top === el || el.contains(top));
      });
      expect(toolbarFree, `${size.name}: the toggle is reachable`).toBe(true);
      await page.locator('[data-editor-fullscreen-toggle]').click();
      await expect(root).toHaveAttribute('data-editor-fullscreen', 'false');
    }

    await page.locator('[data-editor-fullscreen-toggle]').click();
    await expect(root).toHaveAttribute('data-editor-fullscreen', 'true');
    await page.locator('[data-editor-fullscreen-toggle]').focus();
    await page.keyboard.press('Escape');
    await expect(root).toHaveAttribute('data-editor-fullscreen', 'false');
  });
});
