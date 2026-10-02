import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator, connectFirestoreToEmulator, EMULATOR_PASSWORD } from './helpers/emulator-guard';
import { adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';

/**
 * The real "start from an example" path, end to end: a project written with
 * exactly the six fields the example gallery writes, a run started from the
 * Analyze page, and what the signed run and the page then say. Found on a
 * capture of Z_MM_PO_APPROVAL (01.10.2026):
 *
 *   1. the run was signed, and the page headed, as `manual-input.abap`;
 *   2. "Direct write to an SAP standard table — 1 finding" over two dots;
 *   3. program-map columns numbered 2 3 1 4 5 left to right;
 *   4. "without a model" in the answer, "with a model narrative" under it.
 *
 * The narrative is switched off for the run so it is the same on any machine;
 * for (4) a second project carries a stored narrative, which is the branch the
 * capture showed. `ANPOL_SHOTS` names a folder for screenshots of each state.
 */
const STAMP = Date.now();
const EMAIL = `anpol-${STAMP}@cleancore-test.io`;
const PROJECT_ID = `anpol-${STAMP}`;
const NARRATIVE_ID = `anpol-narrative-${STAMP}`;
const ROOT = path.resolve(__dirname, '..');
// What `loadStarterExample` hands on: the served text, without a byte-order mark.
const SOURCE = fs.readFileSync(path.join(ROOT, 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/^﻿/, '');
const SHOTS = process.env.ANPOL_SHOTS || '';
const TAG = process.env.ANPOL_TAG || 'after';

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
connectFirestoreToEmulator(clientDb);

let idToken = '';
let uid = '';

async function shot(page: Page, name: string, locator?: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `anpol-${TAG}-${name}.png`);
  if (!locator) {
    await page.screenshot({ path: file, fullPage: false });
    return;
  }
  // Clear of the sticky bars: scrolled so the element starts well below them.
  await page.locator(locator).first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 260));
  await page.waitForTimeout(400);
  const box = await page.locator(locator).first().boundingBox();
  if (box) await page.screenshot({ path: file, clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  test.setTimeout(120 * 1000);
  const auth = getAuth(app);
  connectAuthToEmulator(auth);
  const cred = await createUserWithEmailAndPassword(auth, EMAIL, EMULATOR_PASSWORD);
  idToken = await cred.user.getIdToken();
  uid = cred.user.uid;
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Ana', lastName: 'Pol', email: EMAIL, tier: 'pilot', status: 'approved',
    activatedAt: new Date(), transformationsUsed: 0, transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
  });
  // components/StarterExamples.tsx writes these six fields and no others
  // (firestore.rules allows no more at create).
  await adminSetDoc('projects', PROJECT_ID, {
    name: 'Z_MM_PO_APPROVAL', status: 'uploaded', legacyCode: SOURCE,
    userId: cred.user.uid, createdAt: new Date(), fromExample: true,
  });
  const res = await request.post('/api/model-stages', {
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    data: { stages: { analyze: false } },
  });
  expect(res.status(), await res.text()).toBe(200);
});

test('a run of the example, started on the Analyze page', async ({ page }) => {
  test.setTimeout(300 * 1000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInViaLanding(page, EMAIL, EMULATOR_PASSWORD, { pauseMs: 3500 });
  await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-stage-title]', { timeout: 60000 });

  await page.getByText('Private Cloud RISE Edition').first().click();
  const ack = page.locator('[data-personal-data-ack] input[type="checkbox"]');
  if (await ack.count()) await ack.check();
  await page.getByRole('button', { name: /Start Analysis/ }).click();
  await page.getByRole('button', { name: /Confirm and start the analysis/ }).click();

  const report = page.locator('[data-evidence-only-report]');
  await expect(report).toBeVisible({ timeout: 180000 });
  await expect(page.locator('[data-program-map]')).toBeVisible({ timeout: 60000 });
  await page.locator('[data-analysis-answer]').scrollIntoViewIfNeeded();
  await shot(page, 'head', '[data-analysis-answer]');
  await page.locator('[data-program-map]').scrollIntoViewIfNeeded();
  await shot(page, 'map', '[data-program-map]');
  await page.locator('[data-program-map-dot="246"]').click();
  await expect(page.locator('[data-analyze-source-panel]')).toBeVisible();
  await shot(page, 'source', '[data-analyze-source-panel]');
  const panelText = await page.locator('[data-analyze-source-panel]').innerText();
  // And as the capture saw it: reloaded, the head read from the stored run.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-analysis-answer]')).toBeVisible({ timeout: 90000 });
  await shot(page, 'head-reloaded', '[data-analysis-answer]');
  expect(panelText).toContain('Z_MM_PO_APPROVAL.abap');

  // 1. The signed run and the page both name the example's file.
  const project = (await getDoc(doc(clientDb, 'projects', PROJECT_ID))).data() as { activeRunId?: string };
  expect(project.activeRunId, 'no signed run').toBeTruthy();
  const run = (await getDoc(doc(clientDb, 'projects', PROJECT_ID, 'runs', project.activeRunId!))).data() as {
    inputFingerprint: { fileName: string };
  };
  expect(run.inputFingerprint.fileName, 'the run was signed under the paste placeholder').toBe('Z_MM_PO_APPROVAL.abap');
  // The provenance line sits behind "Details" (owner 02.10.2026): hidden first, then opened.
  await expect(page.locator('[data-analysis-meta]')).toHaveCount(0);
  await page.locator('[data-analysis-answer] [data-stage-meta-toggle]').click();
  await expect(page.locator('[data-analysis-meta]')).toContainText('Z_MM_PO_APPROVAL.abap');
  await expect(page.locator('body')).not.toContainText('manual-input.abap');

  // 2. The EBAN write row: its count and its dots agree.
  const writeRow = page.locator('[data-program-map-row="standard-table-write"]');
  await expect(writeRow).toContainText('1 finding · 2 places in the code');
  await expect(page.locator('[data-program-map-dot="246"]')).toHaveCount(1);
  await expect(page.locator('[data-program-map-dot="455"]')).toHaveCount(1);

  // 3. Column numbers read 1..n left to right.
  const heads = page.locator('[data-program-map-column]');
  const n = await heads.count();
  expect(n).toBeGreaterThan(3);
  const placed: Array<{ x: number; label: number }> = [];
  for (let i = 0; i < n; i++) {
    const box = await heads.nth(i).boundingBox();
    placed.push({ x: box!.x, label: Number(await heads.nth(i).innerText()) });
  }
  placed.sort((a, b) => a.x - b.x);
  expect(placed.map((p) => p.label)).toEqual(placed.map((_, i) => i + 1));
  await expect(page.locator('[data-program-map-caption]')).toContainText('The program runs them in this order: 3 → 1 → 2 → 4');

  // 4, without a narrative: the evidence is the engine's; no summary was written.
  const status = page.locator('[data-analysis-status]');
  await expect(status).toContainText('engine only, no model');
  await expect(status).toContainText('none for this run');
  await expect(status).not.toContainText('with a model narrative');
});

test('with a model narrative stored, the head says which part is the proposal', async ({ page }) => {
  test.setTimeout(240 * 1000);
  // A project of its own: a stored run is authoritative over the project
  // document, so a narrative merged onto the project that just ran would not
  // be read. This one carries the narrative and no run.
  await adminSetDoc('projects', NARRATIVE_ID, {
    name: 'Z_MM_PO_APPROVAL', status: 'uploaded', legacyCode: SOURCE,
    userId: uid, createdAt: new Date(), fromExample: true, s4Deployment: 'private',
    analysis: JSON.stringify({ summary: 'The program approves emergency purchase requisitions and writes their status back to EBAN.' }),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInViaLanding(page, EMAIL, EMULATOR_PASSWORD, { pauseMs: 3500 });
  await page.goto(`/project/${NARRATIVE_ID}/analyze`, { waitUntil: 'domcontentloaded' });
  const head = page.locator('[data-analysis-answer]');
  await expect(head).toBeVisible({ timeout: 90000 });
  await head.scrollIntoViewIfNeeded();
  await shot(page, 'head-narrative', '[data-analysis-answer]');

  await expect(head).toContainText('without a model');
  await expect(head).toContainText('The Summary further down was written by a model: a proposal, marked as such, and not part of this evidence.');
  const status = page.locator('[data-analysis-status]');
  await expect(status).toContainText('engine only, no model');
  await expect(status).toContainText('model proposal, not evidence');
  await expect(status).not.toContainText('with a model narrative');
  await expect(page.locator('#analyze-summary')).toContainText('Model proposal');
});
