import { test, expect, type Page } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';

/**
 * Owner, 02.10.2026 (translated): "when I open an example from the workspace,
 * the workspace with the first look always opens first, and not Analyze."
 *
 * Every way an ordinary community account starts an example — or its own code —
 * lands on the project's workspace with the first look (`?first=1`), never on
 * the Analyze tool — and the workspace signs the engine's reading at once, so
 * the first look ends on the full map (ADR-072). Each entry point
 * below runs as a fresh community account: no admin claim, no `isAdmin`, and no
 * model stage on, so nothing here waits on or pays for a model call.
 */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'ExampleOpens123!';
const SOURCE = [
  'REPORT z_example_opens.',
  'TABLES: vbak.',
  'DATA lt_vbak TYPE STANDARD TABLE OF vbak.',
  'SELECT * FROM vbak INTO TABLE lt_vbak UP TO 10 ROWS.',
  'IF sy-subrc <> 0.',
  "  MESSAGE 'No orders' TYPE 'E'.",
  'ENDIF.',
  'LOOP AT lt_vbak INTO DATA(ls_vbak).',
  '  WRITE: / ls_vbak-vbeln.',
  'ENDLOOP.',
].join('\n');

async function communityAccount(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Example', lastName: 'Opener', email,
    tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
    transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    modelStages: { analyze: false, naming: false, statements: false },
  });
  return email;
}

async function goto(page: Page, url: string) {
  // The sign-in redirect can still be in flight and abort this navigation.
  await page.evaluate(() => window.stop()).catch(() => {});
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  } catch {
    await page.waitForTimeout(1500);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  }
}

/**
 * The project's entry since AB-2 (ADR-109): Analyze in the Business view, the
 * full map drawn from the run the start signed (ADR-072) — not the two-node
 * main line — with the first look's blocks below it, and never today's score
 * page (IT's).
 */
async function expectWorkspaceWithFirstLook(page: Page): Promise<string> {
  await page.waitForURL(/\/project\/[^/?]+\/analyze\?first=1/, { timeout: 120000 });
  expect(page.url(), 'an example landed on the score page').not.toContain('view=it');
  // The recorder was installed before the start was pressed (`recordFirstLook`), so no state the first look took
  // between the press and this line can be missed.
  expect(await page.evaluate(() => Array.isArray((window as unknown as { __firstLookStates?: unknown }).__firstLookStates)), 'the first look was not recorded from the start').toBe(true);
  const projectId = new URL(page.url()).pathname.split('/')[2];
  await expect(page.locator('[data-analyze-business="ready"]')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('[data-analyze-score]'), 'Business shows no score').toHaveCount(0);
  // The text around the map (3.2.0, AB-6) where the first look stood: there at once, then read.
  const look = page.locator('[data-around-the-map]');
  await expect(look).toBeVisible({ timeout: 60000 });
  await expect(look).toHaveAttribute('data-around-the-map', /^(reading|ready)$/, { timeout: 60000 });
  await expect(look).toHaveAttribute('data-around-the-map', 'ready', { timeout: 90000 });
  const states = await page.evaluate(() => (window as unknown as { __firstLookStates?: string[] }).__firstLookStates ?? []);
  expect(states.filter((v) => v !== 'reading' && v !== 'ready'), 'the text around the map took a state other than reading and ready').toEqual([]);
  const map = page.locator('[data-workspace-process="ready"] [data-process-map]');
  await expect(map, 'the start drew no full map').toBeVisible({ timeout: 60000 });
  // And it stays.
  await page.waitForTimeout(3000);
  await expect(map).toBeVisible();
  expect(page.url()).not.toContain('view=it');
  return projectId;
}

/**
 * Every state the first look takes, recorded from before the start is pressed: the paced build-up retired with 3.1.0
 * (AB-3), so the card reads ("waiting") and then stands in its end state — it never builds up. Installed in the
 * page as it stands (a client-side navigation keeps it) and for every document loaded after it (a full load).
 */
async function recordFirstLook(page: Page) {
  const install = () => {
    const w = window as unknown as { __firstLookStates?: string[] };
    if (w.__firstLookStates) return;
    w.__firstLookStates = [];
    const note = () => {
      for (const el of document.querySelectorAll('[data-around-the-map]')) {
        const v = el.getAttribute('data-around-the-map') ?? '';
        if (!w.__firstLookStates!.includes(v)) w.__firstLookStates!.push(v);
      }
    };
    note();
    new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-around-the-map'] });
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

async function startFromGallery(page: Page, scope: string, name: string) {
  await expect(page.locator(scope).first()).toBeVisible({ timeout: 90000 });
  const start = page.locator(`${scope} [data-example-start="${name}"]`).first();
  // The first four stand up front; the rest are under "More examples".
  if (!(await start.isVisible().catch(() => false))) {
    await page.locator(`${scope} [data-examples-more] button`).first().click({ timeout: 60000 });
  }
  await recordFirstLook(page);
  await start.click({ timeout: 60000 });
}

test.describe('an example opens Analyze, Business, with the map and the first look, never the score page (owner 02.10.2026; AB-2)', () => {
  test.describe.configure({ mode: 'serial' });

  test('from "My workspace" — the first view a new account sees (AB-14a)', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const email = await communityAccount('example-list');
    await signInViaLanding(page, email, PASSWORD);
    await goto(page, '/dashboard');
    await expect(page.locator('[data-cc-workspace]')).toBeVisible({ timeout: 90000 });
    await startFromGallery(page, '[data-cc-workspace]', 'Z_MATERIAL_STOCK_CALC');
    await expectWorkspaceWithFirstLook(page);
  });

  test('from the landing page\'s start into the product, signed in', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const email = await communityAccount('example-landing');
    await signInViaLanding(page, email, PASSWORD);
    await goto(page, '/');
    // The landing's start into the product since 3.5.0 (UX review Q10, an honest button): it leads to My workspace,
    // where the examples stand.
    const open = page.getByRole('link', { name: 'Analyze your own code, free account' }).first();
    await expect(open).toHaveAttribute('href', '/dashboard', { timeout: 60000 });
    await open.click();
    await page.waitForURL(/\/dashboard/, { timeout: 90000 });
    await expect(page.locator('[data-cc-workspace]')).toBeVisible({ timeout: 90000 });
    await startFromGallery(page, '[data-cc-workspace]', 'Z_INVOICE_EXTRACTOR');
    await expectWorkspaceWithFirstLook(page);
  });

  test('from "New project", the example half', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const email = await communityAccount('example-newproject');
    await signInViaLanding(page, email, PASSWORD);
    // A new account's first view has the start built in and no "New project"
    // (AB-14a); the page itself is the same for every account.
    await goto(page, '/admin/new-project');
    await expect(page.locator('[data-cc-new-project]')).toBeVisible({ timeout: 90000 });
    await startFromGallery(page, '[data-new-project-examples]', 'Z_MATERIAL_STOCK_CALC');
    await expectWorkspaceWithFirstLook(page);
  });

  test('from "New project", own code — the workspace signs the reading, no Analyze in between', async ({ page }) => {
    test.setTimeout(480 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const email = await communityAccount('example-owncode');
    await signInViaLanding(page, email, PASSWORD);
    await goto(page, '/admin/new-project/upload');
    await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 90000 });
    await page.locator('[data-own-code-input]').setInputFiles([
      { name: 'Z_EXAMPLE_OPENS.abap', mimeType: 'text/plain', buffer: Buffer.from(SOURCE, 'utf8') },
    ]);
    const ack = page.locator('[data-personal-data-hints] input[type="checkbox"]');
    if (await ack.count()) await ack.check();
    await expect(page.locator('[data-own-code-start]')).toBeEnabled({ timeout: 30000 });
    await recordFirstLook(page);
    await page.click('[data-own-code-start]');
    const projectId = await expectWorkspaceWithFirstLook(page);

    // The run is on record, so the tool bar has moved past Analyze. Analyze, Business has no "Next step" card any
    // more (ADR-118); the tool bar says it: Analyze done, and never the tool tagged next.
    const analyzeTool = page.locator(`[data-stage-tools] a[data-workspace-tool="analyze"][href*="/project/${projectId}/analyze"]`).first();
    await expect(analyzeTool).toHaveAttribute('data-phase-state', 'done', { timeout: 60000 });
    await expect(page.locator('[data-stage-tools] a[data-workspace-tool="analyze"][data-workspace-tool-next]')).toHaveCount(0);
  });
});
