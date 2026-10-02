import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminGetDoc, adminSetCustomClaim, adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { assembleOwnCode, readSourceBytes, type OwnCodeFile } from '../lib/own-code-import';

/**
 * "New project" with your own code, on the page — mockup 2.8 s11 and s14.
 *
 * What only a browser can show: choosing own code writes nothing; the files
 * are checked one by one and named; the counts stand before the run; the trust
 * card is collapsed on every size; the project is written once, on "Start
 * analysis", with the joined source; and Analyze then asks the one question
 * the run still needs.
 */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const ROOT = path.resolve(__dirname, '..');
const PASSWORD = 'OwnCode123!';
const ADMIN = `own-code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
const MAIN = fs.readFileSync(path.join(ROOT, 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8');
const NOTIFY = ['FORM notify_approver USING iv_banfn TYPE banfn.', "  WRITE: / 'Notify', iv_banfn.", 'ENDFORM.', ''].join('\n');

function buffer(name: string, text: string, mimeType = 'text/plain') {
  return { name, mimeType, buffer: Buffer.from(text, 'utf8') };
}

/** Firestore writes the page sends — the Write channel of the client SDK. */
function watchWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', (req) => {
    if (/google\.firestore\.v1\.Firestore\/Write/.test(req.url())) writes.push(req.url());
  });
  return writes;
}

test.describe('own code: choose, check, start', () => {
  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Own', lastName: 'Code', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
  });

  test('s14: the demo example comes first, Skip intro sits top right, the path says New project', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signInViaLanding(page, ADMIN, PASSWORD);
    await page.goto('/admin/new-project', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-cc-new-project]')).toBeVisible({ timeout: 60000 });

    // One recommended start, the demo object (mockup s14, owner feedback 01.10.2026).
    const startHere = page.locator('[data-examples-tier="start-here"] [data-example-card]');
    await expect(startHere).toHaveCount(1);
    await expect(startHere).toHaveAttribute('data-example-card', 'Z_MM_PO_APPROVAL');
    await expect(startHere.locator('[data-start-here-why]')).toBeVisible();

    await expect(page.locator('[data-new-project-skip]')).toHaveText('Skip intro');
    await expect(page.locator('[data-clean-core-diagram]')).toBeVisible();
    await expect(page.locator('[data-shell-path] [aria-current="page"]').last()).toHaveText('New project');
    // The one-line footer of a project step, not the marketing footer.
    await expect(page.locator('footer')).toContainText('Privacy Policy');
    await expect(page.locator('footer')).not.toContainText('Knowledge Base');
  });

  test('choosing own code writes nothing and opens the upload page', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signInViaLanding(page, ADMIN, PASSWORD);
    await page.goto('/admin/new-project', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-cc-new-project]')).toBeVisible({ timeout: 60000 });

    const writes = watchWrites(page);
    await page.click('[data-start-choice="own-code"]');
    await page.click('[data-new-project-start="own-code"]');
    await page.waitForURL('**/admin/new-project/upload', { timeout: 60000 });
    await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 60000 });
    await page.locator('[data-own-code-input]').setInputFiles([buffer('Z_MM_PO_APPROVAL.abap', MAIN)]);
    await expect(page.locator('[data-own-code-file]')).toHaveCount(1);
    expect(writes, 'a project was written before "Start analysis"').toEqual([]);
  });

  test('every file is checked and named; the counts stand before the run', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signInViaLanding(page, ADMIN, PASSWORD);
    await page.goto('/admin/new-project/upload', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 60000 });

    // Collapsed by default (owner decision 30.09.2026), here as on Analyze.
    await expect(page.locator('[data-trust-toggle]')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#trust-claim-list')).toBeHidden();
    await expect(page.locator('[data-trust-pledge]')).toContainText('Terms §5');

    await page.locator('[data-own-code-input]').setInputFiles([
      buffer('Z_MM_PO_APPROVAL.abap', MAIN),
      buffer('Z_MM_PO_NOTIFY.abap', NOTIFY),
      buffer('approval-process.pdf', '%PDF-1.4', 'application/pdf'),
    ]);
    await expect(page.locator('[data-own-code-file]')).toHaveCount(3);
    await expect(page.locator('[data-own-code-file="approval-process.pdf"]')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('[data-own-code-file="Z_MM_PO_APPROVAL.abap"]')).toHaveAttribute('data-state', 'warning');
    await expect(page.locator('[data-own-code-file="Z_MM_PO_APPROVAL.abap"] [data-own-code-issue="missing-includes"]')).toContainText('Z_MM_PO_LOG');
    await expect(page.locator('[data-own-code-attention]')).toContainText('approval-process.pdf');
    await expect(page.locator('[data-own-code-start]')).toBeDisabled();

    await page.click('[data-own-code-remove="approval-process.pdf"]');
    await expect(page.locator('[data-own-code-file]')).toHaveCount(2);
    await expect(page.locator('[data-own-code-attention]')).toHaveCount(0);

    // The counts are the engine's, over the joined text.
    const files: OwnCodeFile[] = [
      ['Z_MM_PO_APPROVAL.abap', MAIN],
      ['Z_MM_PO_NOTIFY.abap', NOTIFY],
    ].map(([name, text], i) => {
      const { source, issues } = readSourceBytes(name, new TextEncoder().encode(text));
      return { id: `x${i}`, name, bytes: text.length, zip: false, sources: source ? [source] : [], issues };
    });
    const expected = assembleOwnCode(files);
    await expect(page.locator('[data-own-code-figure="lines"]')).toContainText(expected.counts!.lines.toLocaleString('en'));
    await expect(page.locator('[data-own-code-figure="routines"]')).toContainText(String(expected.counts!.routines));
    await expect(page.locator('[data-own-code-missing]')).toContainText('Z_MM_PO_LOG');
    await expect(page.locator('[data-own-code-missing]')).not.toContainText('Z_MM_PO_NOTIFY');
    await expect(page.locator('[data-own-code-name]')).toHaveValue('Z_MM_PO_APPROVAL');

    // How it is paid is a statement, not a choice the reader does not have
    // (owner decision 01.10.2026): the account's own words from lib/run-cost.ts.
    const paid = page.locator('[data-own-code-paid]');
    await expect(paid).toHaveAttribute('data-own-code-paid', 'free');
    await expect(paid.locator('input')).toHaveCount(0);
    await expect(paid.locator('[data-own-code-paid-statement]')).toHaveText('Uses 1 of your 5 free analysis runs (3 left)');
    await expect(paid.locator('[data-own-code-settings]')).toHaveAttribute('href', '/settings');
    await expect(page.locator('[data-own-code-same-source]')).toContainText('this source was already analysed');
  });

  test('"Start analysis" writes one project with the joined source, and Analyze asks the target', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signInViaLanding(page, ADMIN, PASSWORD);
    await page.goto('/admin/new-project/upload', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 60000 });

    await page.locator('[data-own-code-input]').setInputFiles([
      buffer('Z_MM_PO_APPROVAL.abap', MAIN),
      buffer('Z_MM_PO_NOTIFY.abap', NOTIFY),
    ]);
    await page.fill('[data-own-code-name]', 'Emergency purchase approval');
    // The example carries no personal-data shapes; if it ever does, the box is ticked like a reader would.
    const ack = page.locator('[data-personal-data-hints] input[type="checkbox"]');
    if (await ack.count()) await ack.check();
    await expect(page.locator('[data-own-code-start]')).toBeEnabled({ timeout: 30000 });
    const writes = watchWrites(page);
    await page.click('[data-own-code-start]');

    await page.waitForURL(/\/project\/[^/]+\/analyze/, { timeout: 90000 });
    const projectId = /\/project\/([^/]+)\/analyze/.exec(page.url())![1];
    await expect(page.getByRole('dialog')).toContainText('Confirm Target Operating Model', { timeout: 60000 });

    // The control for the test above: the watcher does see the one write.
    expect(writes.length, 'the write watcher saw nothing — the "writes nothing" check would be vacuous').toBeGreaterThan(0);
    const stored = await adminGetDoc('projects', projectId);
    expect(stored?.name).toBe('Emergency purchase approval');
    expect(stored?.legacyCode).toContain('*>>> Clean-Core.io: include Z_MM_PO_NOTIFY · Z_MM_PO_NOTIFY.abap');
    expect(stored?.legacyCode).toContain('INCLUDE z_mm_po_log.');
    expect(stored?.fromExample).toBeUndefined();
    expect(stored?.activeRunId).toBeUndefined();
  });

  test('on a phone the page fits and the trust card is still one click away', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInViaLanding(page, ADMIN, PASSWORD);
    await page.goto('/admin/new-project/upload', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 60000 });
    await page.locator('[data-own-code-input]').setInputFiles([buffer('Z_MM_PO_APPROVAL.abap', MAIN)]);
    await expect(page.locator('[data-own-code-file]')).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways at 390 px').toBeLessThanOrEqual(0);
    await expect(page.locator('[data-trust-toggle]')).toHaveAttribute('aria-expanded', 'false');
    await page.click('[data-trust-toggle]');
    await expect(page.locator('#trust-claim-list')).toBeVisible();
  });
});

test.describe('own code: after the run, the workspace', () => {
  const EMAIL = `own-code-ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, EMAIL, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Own', lastName: 'Workspace', email: EMAIL,
      tier: 'pilot', status: 'approved', isAdmin: true, activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
      // No model on any machine: the run is the deterministic one, signed.
      modelStages: { analyze: false, naming: false, statements: false },
    });
  });

  test('a signed run from the import page continues in the workspace, like an example', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto('/admin/new-project/upload', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-cc-own-code]')).toBeVisible({ timeout: 60000 });
    await page.locator('[data-own-code-input]').setInputFiles([
      buffer('Z_MM_PO_APPROVAL.abap', MAIN),
      buffer('Z_MM_PO_NOTIFY.abap', NOTIFY),
    ]);
    const ack = page.locator('[data-personal-data-hints] input[type="checkbox"]');
    if (await ack.count()) await ack.check();
    await expect(page.locator('[data-own-code-start]')).toBeEnabled({ timeout: 30000 });
    await page.click('[data-own-code-start]');

    await page.waitForURL(/\/project\/[^/]+\/analyze/, { timeout: 90000 });
    const projectId = /\/project\/([^/?]+)\/analyze/.exec(page.url())![1];
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Confirm Target Operating Model', { timeout: 60000 });
    await dialog.getByRole('radio', { name: /Public Cloud/ }).first().check();
    await dialog.getByRole('button', { name: /Confirm and start the analysis/ }).click();

    // Only once the run is signed, and then into the workspace with the first look.
    await page.waitForURL(new RegExp(`/project/${projectId}\\?first=1`), { timeout: 180000 });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });
    const stored = await adminGetDoc('projects', projectId);
    expect(typeof stored?.activeRunId, 'the workspace opened before a run was signed').toBe('string');
  });
});
