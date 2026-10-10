import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetCustomClaim, adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * A new project shows its process with the first look, and keeps showing it.
 *
 * Owner, 02.10.2026 (translated): "The process must always be shown when I
 * start a new project, with the first look — the process was there briefly
 * and then disappeared; but you have to be able to find your bearings first."
 * And 03.10.2026: "the complete process map has to be created directly."
 *
 * Since ADR-072 the start signs the engine's reading itself, so the first look
 * ends on the full map, drawn from that run, right under the answer. This
 * walks the real path — own code, `?first=1`, no Analyze — and reads the first
 * screen after the build-up and again five seconds later.
 */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public/starter-examples/Z_INVOICE_EXTRACTOR.txt'), 'utf8');
const PASSWORD = 'FirstLookMap123!';
const EMAIL = `first-look-map-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;

/** What stands in the first screen, at the top of the page. */
async function firstScreen(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('[data-first-look="complete"], [data-first-look="end-state"]')).toBeVisible();
  // The process stands in the first screen — since 03.10.2026 as the story of
  // its steps in plain words, the opening of the Business view (owner: "he just
  // wants to know more about his old process") — and the full map, drawn from
  // the signed run, follows right under it.
  await expect(page.locator('[data-process-story]')).toBeInViewport();
  const map = page.locator('[data-workspace-process="ready"] [data-process-map]');
  await expect(map).toBeVisible();
  // The main line stays on the right after the build-up (owner 10.10.2026,
  // reversing 03.10.2026).
  await expect(page.locator('[data-first-look-process="drawn"]')).toBeVisible();
}

test.describe('a new project: the first look ends on the full map', () => {
  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, EMAIL, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'First', lastName: 'Look', email: EMAIL,
      tier: 'pilot', status: 'approved', isAdmin: true, activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
      // No model on any machine: the run is the deterministic one, signed.
      modelStages: { analyze: false, naming: false, statements: false },
    });
  });

  test('own code → first look → signed at the start: the map is on the first screen and still there 5 s later', async ({ page }) => {
    test.setTimeout(400 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto('/admin/new-project/upload', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 60000 });
    await page.locator('[data-own-code-input]').setInputFiles([
      { name: 'Z_INVOICE_EXTRACTOR.abap', mimeType: 'text/plain', buffer: Buffer.from(SOURCE, 'utf8') },
    ]);
    const ack = page.locator('[data-personal-data-hints] input[type="checkbox"]');
    if (await ack.count()) await ack.check();
    await expect(page.locator('[data-own-code-start]')).toBeEnabled({ timeout: 30000 });
    const visited: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(frame.url());
    });
    await page.click('[data-own-code-start]');

    await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 90000 });
    // The build-up runs on this first visit, and its last moment is the map.
    await expect(page.locator('[data-first-look="building"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-first-look="complete"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90000 });
    await firstScreen(page);

    // Next step first (owner, 03.10.2026), the map directly under the answer,
    // and the work area after it.
    const order = await page.evaluate(() =>
      ['[data-next-step]', '[data-first-look]', '[data-workspace-process-block]', '[data-workspace-status-tools]', 'nav[data-workspace-layers]'].map(
        (sel) => {
          const el = document.querySelector(sel);
          return el ? el.getBoundingClientRect().top + window.scrollY : -1;
        },
      ),
    );
    expect(order.every((t) => t >= 0), `a block is missing: ${order.join(', ')}`).toBe(true);
    for (let i = 1; i < order.length; i++) expect(order[i], `block ${i} stands above block ${i - 1}`).toBeGreaterThan(order[i - 1]);

    // And it stays.
    await page.waitForTimeout(5000);
    await firstScreen(page);
    expect(visited.filter((u) => u.includes('/analyze')), 'the start went through Analyze').toEqual([]);
  });
});
