import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { adminGetDoc, adminSetDoc as seedDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { TERMS_VERSION } from '../lib/constants';
import { buildRequirementSet } from '../lib/functional-requirements';

/**
 * v3.0.1 — the functional requirements on screen, in the demo and on a real
 * project: asked for, never generated silently; every row with an ID, a
 * statement, its lines and a priority; the open questions apart; copy and
 * download carrying every requirement with its lines; no sideways scroll on a
 * phone. No model is called anywhere here.
 */

const PASSWORD = 'FuncReq123!';

async function adminSetDoc(collection: string, id: string, data: Record<string, unknown>) {
  try {
    await seedDoc(collection, id, data);
  } catch (err) {
    if (!(await adminGetDoc(collection, id))) throw err;
  }
}

async function openDemo(page: Page) {
  await page.goto('/demo/design', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 90_000 });
  const section = page.locator('[data-functional-requirements]');
  await expect(section).toBeVisible({ timeout: 60_000 });
  return section;
}

async function derive(page: Page) {
  const section = page.locator('[data-functional-requirements]');
  await expect(section.locator('[data-fr-cost]')).toContainText('no model call');
  await section.locator('[data-fr-derive]').click();
  await expect(section).toHaveAttribute('data-fr-state', 'ready', { timeout: 60_000 });
  return section;
}

test.describe('the demo', () => {
  test('nothing is read until asked; then every row carries an ID, a statement, its lines and a priority', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const before = await openDemo(page);
    await expect(before).toHaveAttribute('data-fr-state', 'idle');
    await expect(before.locator('[data-fr-row]')).toHaveCount(0);
    const section = await derive(page);
    const rows = section.locator('[data-fr-row]');
    expect(await rows.count()).toBeGreaterThan(10);
    for (const row of await rows.all()) {
      await expect(row.locator('[data-fr-id]')).toHaveText(/^FR-\d{3}$/);
      await expect(row.locator('[data-fr-statement]')).toHaveText(/^The system shall /);
      await expect(row.locator('[data-fr-anchors]')).toHaveText(/^L\d+/);
      await expect(row.locator('[data-fr-priority]')).toHaveText(/^(Must|Should|Could)$/);
    }

    // The questions the code cannot answer stand in their own tab, not in the list.
    await section.getByRole('tab', { name: /To be confirmed/ }).click();
    const open = section.locator('[data-fr-open]');
    expect(await open.count()).toBeGreaterThan(0);
    await expect(open.first()).toContainText('Not determined');
    // (The list's panel stays mounted behind its tab; none of its rows is shown.)
    await expect(section.locator('[data-fr-row]:visible')).toHaveCount(0);

    // Traceability: a step's requirement opens in the list, filtered to that step.
    await section.getByRole('tab', { name: /Traceability/ }).click();
    const link = section.locator('[data-fr-trace-link]').first();
    const id = await link.textContent();
    await link.click();
    await expect(section.locator(`[data-fr-row="${id}"] [data-fr-detail]`)).toBeVisible();
  });

  test('copy as text and the .md download carry every requirement with its lines', async ({ page, context }) => {
    test.setTimeout(180_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDemo(page);
    const section = await derive(page);
    const rows = await section.locator('[data-fr-row]').all();
    const expected: Array<{ id: string; anchors: string }> = [];
    for (const row of rows) {
      expected.push({ id: (await row.getAttribute('data-fr-row'))!, anchors: (await row.locator('[data-fr-anchors]').textContent())! });
    }

    await section.locator('[data-fr-copy-all]').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15_000 }).toContain('# Functional requirements');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('reconstructed by the Clean-Core.io engine');
    for (const e of expected) {
      expect(copied, e.id).toContain(e.id);
      expect(copied, `${e.id} lines`).toContain(e.anchors);
    }

    const [download] = await Promise.all([page.waitForEvent('download'), section.locator('[data-fr-download="md"]').click()]);
    const file = await download.path();
    const md = fs.readFileSync(file!, 'utf8');
    for (const e of expected) expect(md).toContain(`| ${e.id} |`);

    const [docx] = await Promise.all([page.waitForEvent('download'), section.locator('[data-fr-download="docx"]').click()]);
    expect(docx.suggestedFilename()).toMatch(/_functional_requirements\.docx$/);

    await section.locator(`[data-fr-copy-one="${expected[0].id}"]`).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15_000 }).toMatch(/^FR-/);
    const one = await page.evaluate(() => navigator.clipboard.readText());
    expect(one.startsWith(expected[0].id)).toBe(true);
    expect(one).toContain(`Lines: ${expected[0].anchors}`);
  });

  test('on a phone the requirements and their details fit the width', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemo(page);
    const section = await derive(page);
    await section.locator('[data-fr-row] [data-fr-details-toggle]').first().click();
    for (const tab of [/Requirements/, /Traceability/, /To be confirmed/]) {
      await section.getByRole('tab', { name: tab }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, String(tab)).toBeLessThanOrEqual(0);
      const box = await section.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(391);
    }
  });
});

test.describe('a real project', () => {
  test.describe.configure({ mode: 'serial' });
  const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const EMAIL = `func-req-${STAMP}@cleancore-test.io`;
  const SIGNED = `func-req-signed-${STAMP}`;
  const UNSIGNED = `func-req-unsigned-${STAMP}`;
  const WORDED = 'The system shall read this sentence as the model proposed it (fixture).';

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', 'Z_SALES_ORDER_CREATOR.txt'), 'utf8').replace(/\r\n/g, '\n');
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch { /* connected */ }
    const uid = (await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD)).user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Func', lastName: 'Req', email: EMAIL, tier: 'pilot', status: 'approved',
      termsVersionAccepted: TERMS_VERSION, transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });
    const fingerprint = { sha256: sha256Hex(source), fileName: 'Z_SALES_ORDER_CREATOR.txt', lineCount: source.split('\n').length, byteSize: source.length, objectType: 'Report', uploadedAt: new Date().toISOString() };
    for (const [id, signed] of [[SIGNED, true], [UNSIGNED, false]] as const) {
      const runId = `${id}-run`;
      await adminSetDoc('projects', id, {
        name: 'Z_SALES_ORDER_CREATOR', userId: uid, createdAt: new Date(), status: 'analyzed', s4Deployment: 'private',
        legacyCode: signed ? source : `${source}\n* changed after the run\n`,
        analysis: JSON.stringify({ cleanCoreScore: 60 }), cleanCoreScore: 60,
        solutionDesign: '# Target architecture\n\nFixture.\n', activeRunId: runId, inputFingerprint: fingerprint,
      });
      const unsigned = { runId, projectId: id, userId: uid, createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint };
      const runHash = recomputeStoredRunHash(unsigned);
      await adminSetDoc(`projects/${id}/runs`, runId, { ...unsigned, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!) });
    }
    // A stored wording proposal for FR-001, as the route would have written it
    // after a model call: the row shows it with its own chip.
    await adminSetDoc(`projects/${SIGNED}/requirement_wording`, 'current', {
      formatVersion: 1,
      digest: buildRequirementSet({ source }).sourceSha256,
      wording: { 'FR-001': WORDED },
      discarded: [],
      origin: { source: 'model', receipt: 'verified', provider: 'test', modelId: 'test', byok: false, issuedAt: null, textSha256: null },
      proposedAt: new Date().toISOString(),
    });
  });

  test('a signed source: derived on request, with the commit decision and its lines; without one, the reason instead of a button that does nothing', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);

    await page.goto(`/project/${UNSIGNED}/design`, { waitUntil: 'domcontentloaded' });
    const blocked = page.locator('[data-functional-requirements]');
    await expect(blocked).toBeVisible({ timeout: 120_000 });
    await expect(blocked).toHaveAttribute('data-fr-state', 'blocked');
    await expect(blocked.locator('[data-fr-derive]')).toBeDisabled();
    await expect(blocked).toContainText('Re-run the analysis');

    await page.goto(`/project/${SIGNED}/design`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-functional-requirements]')).toBeVisible({ timeout: 120_000 });
    const section = await derive(page);
    await expect(section.locator('[data-fr-row]').filter({ hasText: 'Roll back changes' })).toHaveCount(1);
    await expect(section.locator('[data-fr-row]').filter({ hasText: "'TA'" })).toHaveCount(1);
    // Each sentence wears the chip of where it came from (QA review of
    // 55b47b8a, e7757800247f): the model's wording "proposed", the engine's
    // "reconstructed" — never the model chip beside the engine sentence.
    const worded = section.locator('[data-fr-row="FR-001"]');
    await expect(worded.locator('[data-fr-statement]')).toHaveText(WORDED);
    await expect(worded.locator('[data-fr-statement-provenance] [data-provenance="proposed"]')).toBeVisible();
    await expect(worded.locator('[data-fr-engine-wording] [data-provenance="reconstructed"]')).toBeVisible();
    await expect(worded.locator('[data-fr-engine-wording] [data-provenance="proposed"]')).toHaveCount(0);
    // The wording proposal is a button with its cost said beside it, never a call on opening.
    await expect(section.locator('[data-fr-wording-cost]')).toContainText('model call');
  });
});
