import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { EXAMPLE_SNIPPETS } from '../lib/example-snippets';
import { adminGetDoc, adminSetCustomClaim, adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';

/**
 * Roadmap 3.0.6, left open by the 3.0.5 QA loop: two rendered tests the source
 * guards could not stand in for.
 *
 *   1. The IT view's level explanation (`components/cc/LevelExplained.tsx`)
 *      opens on a mouse hover and closes when the mouse leaves, opens on a tap
 *      and closes on a tap outside, and closes on Escape with the focus left on
 *      the chip. `tests/level-explained.spec.ts` only reads the source.
 *   2. The own-code import's target choice (`TargetEditionChoice` in
 *      `components/workspace/OwnCodeImport.tsx`): preselected Private, the
 *      reader picks Public, and the run the workspace signs is the Public one.
 *      `tests/target-edition-choice.spec.ts` renders this only for an example.
 *
 * Needs the emulators and a dev server (`npx playwright test` as in CI).
 */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const ROOT = path.resolve(__dirname, '..');
const PASSWORD = 'LevelTarget123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SALES_ORDER = EXAMPLE_SNIPPETS.find((s) => s.id === 'static-sales-order')!.code;
const BAPI = 'BAPI_SALESORDER_CREATEFROMDAT2';

/** The explanation panel of one chip: the element its button is described by. */
async function panelOf(page: Page, trigger: Locator): Promise<Locator> {
  const id = await trigger.getAttribute('aria-describedby');
  expect(id, 'the level button is not described by its explanation').toBeTruthy();
  return page.locator(`[id="${id}"]`);
}

/** The tour's tips stand over the page on a first visit; they are not under test here. */
async function dismissCoachMarks(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const dismiss = page.locator('[data-coach-mark-dismiss]').first();
    if (!(await dismiss.isVisible().catch(() => false))) return;
    await dismiss.click();
  }
}

test.describe('the IT view explains a level on hover, on a tap, and closes on Escape', () => {
  const OWNER = `${unique('lvl-owner')}@cleancore-test.io`;
  const PROJECT_ID = unique('lvl-explained');
  const RUN_ID = unique('lvl-explained-run');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, OWNER, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Level', lastName: 'Explained', email: OWNER,
      tier: 'pilot', status: 'approved', isAdmin: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Z_SALES_ORDER_CREATOR', userId: cred.user.uid,
      createdAt: new Date(), status: 'analyzed', s4Deployment: 'private',
      legacyCode: SALES_ORDER, activeRunId: RUN_ID, cleanCoreScore: 80,
    });
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: cred.user.uid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 80, legacyCode: SALES_ORDER,
    });
  });

  async function openIt(page: Page): Promise<Locator> {
    await signInViaLanding(page, OWNER, PASSWORD);
    await page.goto(`/project/${PROJECT_ID}?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-it-view=""]'), 'the IT answers never arrived').toBeVisible({ timeout: 90000 });
    await dismissCoachMarks(page);
    const trigger = page.locator(`[data-it-use-level="${BAPI}"] [data-cc-level-trigger]`).first();
    await expect(trigger).toBeVisible({ timeout: 60000 });
    await trigger.scrollIntoViewIfNeeded();
    return trigger;
  }

  test('a mouse: hover opens it, leaving closes it; a click pins it and Escape closes it, focus on the chip', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const trigger = await openIt(page);
    const panel = await panelOf(page, trigger);
    await expect(panel).toBeHidden();
    await expect(panel).toContainText('Level B');

    await trigger.hover();
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Away from the chip and its panel: closed again.
    await page.mouse.move(5, 5);
    await expect(panel).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await page.mouse.move(5, 5);
    await expect(panel, 'a click pins the explanation open').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('a touch screen: a tap opens it, a tap outside closes it', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
      const trigger = await openIt(page);
      const panel = await panelOf(page, trigger);
      await expect(panel).toBeHidden();
      await trigger.tap();
      await expect(panel).toBeVisible();
      // The panel stays on the screen, not clipped off its side.
      const box = await panel.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      // A tap on the page heading, away from the chip and its panel.
      await page.locator('h1').first().tap();
      await expect(panel).toBeHidden();
    } finally {
      await context.close();
    }
  });
});

test.describe('the own-code import asks for the target, and the signed run follows the choice', () => {
  const EMAIL = `${unique('own-target')}@cleancore-test.io`;
  const MAIN = fs.readFileSync(path.join(ROOT, 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, EMAIL, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Own', lastName: 'Target', email: EMAIL,
      tier: 'pilot', status: 'approved', isAdmin: true, activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
      // No model on any machine: the run is the deterministic one, signed.
      modelStages: { analyze: false, naming: false, statements: false },
    });
  });

  test('Private is preselected, Public is chosen, and the project is signed for the Public Edition', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto('/admin/new-project/upload', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 60000 });
    await page.locator('[data-own-code-input]').setInputFiles([
      { name: 'Z_MM_PO_APPROVAL.abap', mimeType: 'text/plain', buffer: Buffer.from(MAIN, 'utf8') },
    ]);
    await expect(page.locator('[data-own-code-file]')).toHaveCount(1);

    const choice = page.locator('[data-cc-own-code] [data-target-edition-choice]');
    // Asked, and visibly preselected — a one-click start still works.
    await expect(choice).toHaveAttribute('data-target-edition', 'private');
    await expect(choice.getByRole('radio', { checked: true })).toHaveValue('private');
    // A real choice: the radio group is reachable and named.
    await expect(choice.getByRole('radiogroup')).toHaveAccessibleName(/target system/i);
    await choice.locator('[data-target-edition-option="public"]').click();
    await expect(choice).toHaveAttribute('data-target-edition', 'public');
    await expect(choice.locator('[data-target-edition-option="public"]')).toHaveAttribute('data-selected', 'true');
    await expect(choice.locator('[data-target-edition-option="private"]')).toHaveAttribute('data-selected', 'false');

    const ack = page.locator('[data-personal-data-hints] input[type="checkbox"]');
    if (await ack.count()) await ack.check();
    await expect(page.locator('[data-own-code-start]')).toBeEnabled({ timeout: 30000 });
    await page.click('[data-own-code-start]');

    await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 90000 });
    const projectId = new URL(page.url()).pathname.split('/')[2];
    // The signed run carried the chosen edition, and the route kept it on the project.
    await expect
      .poll(async () => {
        const p = await adminGetDoc('projects', projectId);
        return p?.activeRunId ? p.s4Deployment : null;
      }, { timeout: 120000 })
      .toBe('public');
    const stored = await adminGetDoc('projects', projectId);
    expect(stored?.fromExample).toBeUndefined();
    // The project field is what the route copied over; the claim is about the
    // signed run (QA review of dd8e996, 0b5e3a8b9d49). The active run records
    // the target twice inside its signature: the manifest's deployment input
    // and the assessment profile's edition.
    expect(stored?.activeRunId, 'no active run').toBeTruthy();
    const run = await adminGetDoc(`projects/${projectId}/runs`, String(stored!.activeRunId));
    expect(run, 'the active run is not stored under the project').toBeTruthy();
    const deploymentInput = (run!.inputManifest?.inputs ?? []).find(
      (i: { id?: unknown }) => i?.id === 'target:s4-deployment',
    );
    expect(deploymentInput?.revision, 'the signed manifest names another target').toBe('public');
    expect(run!.assessmentProfile?.edition, 'the signed profile names another edition').toBe('public');
    expect(run!.runHash, 'the run is not signed').toBeTruthy();
  });
});
