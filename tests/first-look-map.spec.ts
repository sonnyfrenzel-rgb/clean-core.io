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
 *
 * What he saw: the build-up drew the process beside the code, and when it
 * ended (~2.4 s) the card turned into the answer without it, while the BPMN
 * map stood ~1,070 px down, under the fold, behind status, tools and the
 * anchor bar. This walks the real path — own code, the run, `?first=1` — and
 * reads the first screen after the build-up and again five seconds later.
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
  // Complete after the build-up; its end state on the visit after the run.
  await expect(page.locator('[data-first-look="complete"], [data-first-look="end-state"]')).toBeVisible();
  // The process the build-up drew is still there, whole, in plain words.
  const picture = page.locator('[data-first-look-process="drawn"] svg[data-first-look-excerpt]');
  await expect(picture).toBeInViewport();
  expect(await picture.locator('[data-first-look-node]').count()).toBeGreaterThan(1);
  // Drawn whole: the last node the excerpt walks ends inside the picture, not under its edge.
  const cut = await picture.evaluate((svg) => {
    const frame = svg.parentElement!.getBoundingClientRect();
    return [...svg.querySelectorAll('[data-first-look-node]')].some((n) => n.getBoundingClientRect().bottom > frame.bottom + 1);
  });
  expect(cut, 'a node of the picture is cut off at its lower edge').toBe(false);
  // And the full map is on the page, ready, straight under the answer and Next step.
  await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible();
}

test.describe('a new project: the process stays with the first look', () => {
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

  test('own code → first look → run → workspace: the process is on the first screen and still there 5 s later', async ({ page }) => {
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
    await page.click('[data-own-code-start]');

    // The workspace first, with the first look — never the Analyze tool (owner
    // 02.10.2026). The run starts from its Next step, in the same session, so
    // Analyze takes the import's handoff and asks only the operating model.
    await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 90000 });
    expect(page.url()).not.toContain('/analyze');
    const projectId = new URL(page.url()).pathname.split('/')[2];
    // The build-up runs on this first visit, and the process picture stands
    // when it is done — before any run (ADR-059).
    await expect(page.locator('[data-first-look="building"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-first-look="complete"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-first-look-process="drawn"] svg[data-first-look-excerpt]')).toBeVisible();
    await page.locator(`[data-next-step] a[href*="/project/${projectId}/analyze"]`).first().click({ timeout: 60000 });
    await page.waitForURL(new RegExp(`/project/${projectId}/analyze`), { timeout: 60000 });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Confirm Target Operating Model', { timeout: 60000 });
    await dialog.getByRole('radio', { name: /Public Cloud/ }).first().check();
    await dialog.getByRole('button', { name: /Confirm and start the analysis/ }).click();
    await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 180000 });

    // Back in the workspace after the signed run: the map's block is on the page.
    await expect(page.locator('[data-workspace-process-block]')).toHaveCount(1, { timeout: 60000 });

    // The answer, the picture of the process, the map under it — the first
    // look's end state now, since its build-up was seen before the run.
    await expect(page.locator('[data-first-look="complete"], [data-first-look="end-state"]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 90000 });
    await firstScreen(page);

    // The map directly under the answer and Next step — status, tools and the
    // anchor bar come after it, not between.
    const order = await page.evaluate(() =>
      ['[data-first-look]', '[data-next-step]', '[data-workspace-process-block]', '[data-workspace-status-tools]', 'nav[data-workspace-layers]'].map(
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

    // The picture leads to the whole map.
    await page.click('[data-first-look-open-map]');
    await expect(page.locator('[data-workspace-process] [data-process-map]')).toBeInViewport();
  });
});
