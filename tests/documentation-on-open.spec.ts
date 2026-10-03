import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';
import { PROCESS_DOCUMENT_SECTIONS } from '../lib/process-document';
import { businessLayerFor, engineDocumentationOf, fixtureSource, FIXTURE_FILE } from './helpers/business-layer-fixture';

/**
 * Generate on open (owner 03.10.2026: "the process docu should be created as
 * soon as the tool is opened, analogous to Design").
 *
 *   - the process description is built and stored when the owner opens the
 *     stage: engine only, no model call, no click;
 *   - with a model available and nothing current on record, the business
 *     layer is written once — exactly one model call (a fixture answer here,
 *     never a real one), with the "Writing … (model)" state and its cost on
 *     screen; opening the stage again calls nothing;
 *   - without a model: no call, and the reason in one line with Settings;
 *   - a reader never starts anything (the effects are the owner's);
 *   - nothing scrolls sideways on a phone.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SOURCE = fixtureSource();
const LAYER = businessLayerFor(engineDocumentationOf(SOURCE));
const SHOTS = process.env.PROCDOC_SHOTS || '';

test('the automatic starts belong to the owner, and the business layer waits for a known model', () => {
  const page = read('app/(app)/project/[projectId]/documentation/page.tsx');
  const docEffect = page.slice(page.indexOf('const autoDocFor = useRef'), page.indexOf('const businessAutoReady'));
  expect(docEffect).toMatch(/if \(!project \|\| !isOwner/);
  expect(docEffect).toContain("stored.kind === 'none'");
  // A stored legacy blueprint is never replaced by itself.
  expect(docEffect).not.toContain("'other'");
  const ready = page.slice(page.indexOf('const businessAutoReady'), page.indexOf('// A generation this page started'));
  for (const condition of ['isOwner', 'modelAvailability.known', "modelAvailability.enabled('documentation')", '!businessDocumentation.trim()', 'engineDoc.sourceSha256 === signedDigest']) {
    expect(ready, `the automatic business layer does not wait for ${condition}`).toContain(condition);
  }
  // Once per documentation: a failure is not retried by itself.
  expect(ready).toContain('autoBusinessFor.current === key');
  // No double call: the page's own generation and another tab's lease.
  expect(page).toContain('businessLayerInFlight(leaseId)');
  expect(page).toContain('claimBusinessLayerLease(leaseId, tab)');
});

test.describe('the Documentation stage on opening', () => {
  const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const EMAIL = `doc-open-${STAMP}@cleancore-test.io`;
  const PASSWORD = 'DocOpen123!';
  const ON = `doc-open-on-${STAMP}`;
  const OFF = `doc-open-off-${STAMP}`;
  const PHONE = `doc-open-phone-${STAMP}`;
  const RUN_ID = `doc-open-run-${STAMP}`;

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
      firstName: 'Doc', lastName: 'Open', email: EMAIL,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });
    const fingerprint = {
      sha256: sha256Hex(SOURCE), fileName: FIXTURE_FILE, lineCount: SOURCE.split('\n').length,
      byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
    };
    for (const id of [ON, OFF, PHONE]) {
      await adminSetDoc('projects', id, {
        name: 'Process description fixture', userId: uid, createdAt: new Date(), status: 'analyzed',
        legacyCode: SOURCE,
        analysis: '',
        cleanCoreScore: 62,
        activeRunId: RUN_ID,
        inputFingerprint: fingerprint,
      });
      const unsignedRun = {
        runId: RUN_ID, projectId: id, userId: uid,
        createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint,
      };
      const runHash = recomputeStoredRunHash(unsignedRun);
      await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
        ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
      });
    }
  });

  async function model(page: Page, on: boolean) {
    await page.route('**/api/model-stages', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(on
        ? { stages: { analyze: true, design: true, transformation: true, documentation: true, testing: true, naming: true, statements: true }, keyAvailable: true, keySource: 'community' }
        : { stages: {}, keyAvailable: false, keySource: null }),
    }));
  }

  /** The fixture answer — what a model returns for this process, keyed to its element ids. */
  async function fixtureModel(page: Page, calls: { n: number }) {
    await page.route('**/api/gemini', async (route) => {
      calls.n += 1;
      await new Promise((r) => setTimeout(r, 2500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: `\`\`\`json\n${JSON.stringify(LAYER)}\n\`\`\``, receipt: null }),
      });
    });
  }

  test('with a model: the document is stored at once, the business layer written with one call, and never again', async ({ page }) => {
    test.setTimeout(300 * 1000);
    const calls = { n: 0 };
    await model(page, true);
    await fixtureModel(page, calls);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${ON}/documentation`, { waitUntil: 'domcontentloaded' });

    // The writing state says what it is and what it costs.
    const writing = page.locator('[data-business-layer-writing]');
    await expect(writing).toBeVisible({ timeout: 120000 });
    await expect(writing).toContainText('(model)');
    await expect(writing).toContainText('One model call');
    await expect(writing).toContainText('not counted against your analysis runs');

    // The process description, its sections in order.
    await expect(page.locator('[data-process-document]')).toBeVisible({ timeout: 120000 });
    const order = await page.locator('[data-process-document] [data-doc-section]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('data-doc-section')),
    );
    expect(order).toEqual(PROCESS_DOCUMENT_SECTIONS.map((s) => s.key));

    await expect(page.locator('[data-business-sop]')).toBeVisible({ timeout: 60000 });
    expect(calls.n, 'the business layer was asked for more than once').toBe(1);
    const stored = await adminGetDoc('projects', ON);
    expect(JSON.parse(String(stored?.documentation)).format).toBe('engine-process-documentation');
    expect(String(stored?.businessDocumentation)).toContain(LAYER.raci_matrix[0].stepId);

    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'stage-1440-top.png') });
    if (SHOTS) {
      await page.locator('[data-process-document]').scrollIntoViewIfNeeded();
      await page.locator('[data-process-document]').screenshot({ path: path.join(SHOTS, 'stage-1440-description.png') });
    }

    // Opening it again finds everything current and calls nothing.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-business-sop]')).toBeVisible({ timeout: 120000 });
    await expect(page.locator('[data-process-document]')).toBeVisible({ timeout: 120000 });
    await page.waitForTimeout(3000);
    expect(calls.n, 'a current business layer was written again').toBe(1);
  });

  test('without a model: the document is stored, nothing is called, and the reason stands in one line', async ({ page }) => {
    test.setTimeout(300 * 1000);
    const calls = { n: 0 };
    await model(page, false);
    await fixtureModel(page, calls);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${OFF}/documentation`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-process-document]')).toBeVisible({ timeout: 120000 });
    await expect(page.locator('[data-business-layer-off]')).toBeVisible();
    await expect(page.locator('[data-business-layer-off] a[href="/settings"]')).toBeVisible();
    await expect.poll(async () => JSON.parse(String((await adminGetDoc('projects', OFF))?.documentation ?? '{}')).format, { timeout: 60000 })
      .toBe('engine-process-documentation');
    await page.waitForTimeout(2000);
    expect(calls.n).toBe(0);
  });

  test('phone: the process description reads at 390 px without sideways scrolling', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await model(page, false);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${PHONE}/documentation`, { waitUntil: 'domcontentloaded' });
    const description = page.locator('[data-process-document]');
    await expect(description).toBeVisible({ timeout: 120000 });
    await expect(page.locator('[data-doc-main-step]').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(0);
    if (SHOTS) {
      await description.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, 'stage-390-description.png') });
      await page.locator('[data-doc-section="rules"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, 'stage-390-rules.png') });
    }
  });
});
