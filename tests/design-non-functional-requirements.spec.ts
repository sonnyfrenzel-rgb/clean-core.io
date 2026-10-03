import { test, expect, type Locator, type Page } from '@playwright/test';
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

/**
 * The non-functional requirements on screen (owner 03.10.2026): read from the
 * code as soon as the section opens (since the ADR-074 amendment of the same
 * day: "when I click Design, everything should be generated directly"), never
 * by a model; the eight categories at a glance and
 * agreeing with the lists below them; the questions apart; copy and downloads
 * carrying every requirement with its lines; the design model's text only as
 * a folded proposal; no sideways scroll on a phone. No model is called here.
 */

const PASSWORD = 'NonFuncReq123!';

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
  const section = page.locator('[data-non-functional-requirements]');
  await expect(section).toBeVisible({ timeout: 60_000 });
  return section;
}

/** The requirements are read on opening, without a click (ADR-074, amended 03.10.2026). */
async function derive(page: Page) {
  const section = page.locator('[data-non-functional-requirements]');
  await expect(section).toHaveAttribute('data-nfr-state', 'ready', { timeout: 60_000 });
  await expect(section.locator('[data-nfr-derive]'), 'no button stands between the reader and the requirements').toHaveCount(0);
  return section;
}

/** Every row and question with its category, as the screen shows them. */
async function readLists(section: Locator) {
  const rows: Array<{ id: string; category: string; anchors: string }> = [];
  for (const row of await section.locator('[data-nfr-row]').all()) {
    rows.push({
      id: (await row.getAttribute('data-nfr-row'))!,
      category: (await row.getAttribute('data-nfr-row-category'))!,
      anchors: (await row.locator('[data-nfr-anchors]').textContent())!,
    });
  }
  const questions: Array<{ id: string; category: string }> = [];
  for (const q of await section.locator('[data-nfr-question]').all()) {
    questions.push({ id: (await q.getAttribute('data-nfr-question'))!, category: (await q.getAttribute('data-nfr-question-category'))! });
  }
  return { rows, questions };
}

test.describe('the demo', () => {
  test('read on opening, without a click; every row carries an ID, a category, a sentence, its lines and a priority, and the overview agrees with the lists', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDemo(page);
    const section = await derive(page);

    const rows = section.locator('[data-nfr-row]');
    expect(await rows.count()).toBeGreaterThan(5);
    for (const row of await rows.all()) {
      await expect(row.locator('[data-nfr-id]')).toHaveText(/^NFR-\d{2}$/);
      await expect(row.locator('[data-nfr-statement]')).toHaveText(/ shall /);
      await expect(row.locator('[data-nfr-category]')).not.toBeEmpty();
      await expect(row.locator('[data-nfr-anchors]')).toHaveText(/^L\d+/);
      await expect(row.locator('[data-nfr-priority]')).toHaveText(/^(Must|Should|Could)$/);
    }

    // The questions stand in their own tab — the list shows none of them.
    await expect(section.locator('[data-nfr-question]:visible')).toHaveCount(0);
    await section.getByRole('tab', { name: /To be decided/ }).click();
    const questions = section.locator('[data-nfr-question]');
    expect(await questions.count()).toBeGreaterThan(3);
    await expect(questions.first()).toContainText('Not determined');
    await expect(section.locator('[data-nfr-row]:visible')).toHaveCount(0);

    // The eight tiles say what the lists hold, category by category.
    const { rows: listed, questions: asked } = await readLists(section);
    const tiles = section.locator('[data-nfr-tile]');
    await expect(tiles).toHaveCount(8);
    for (const tile of await tiles.all()) {
      const category = (await tile.getAttribute('data-nfr-tile'))!;
      const grounded = listed.filter((r) => r.category === category).length;
      const open = asked.filter((x) => x.category === category).length;
      expect(Number(await tile.getAttribute('data-nfr-tile-grounded')), category).toBe(grounded);
      expect(Number(await tile.getAttribute('data-nfr-tile-questions')), category).toBe(open);
      expect(await tile.getAttribute('data-nfr-tile-status'), category).toBe(grounded ? 'grounded' : open ? 'decision' : 'none');
      await expect(tile.locator('[data-nfr-tile-grounded-text]')).toHaveText(grounded ? `${grounded} grounded in the code` : 'Nothing found in the code');
    }

    // A tile narrows the list to its category.
    await section.getByRole('tab', { name: /Requirements/ }).click();
    const authTile = section.locator('[data-nfr-tile="authorization"]');
    await authTile.click();
    await expect(authTile).toHaveAttribute('aria-pressed', 'true');
    for (const row of await section.locator('[data-nfr-row]:visible').all()) await expect(row).toHaveAttribute('data-nfr-row-category', 'authorization');
  });

  test('copy as text, the .md and the one specification carry every requirement and question with its lines', async ({ page, context }) => {
    test.setTimeout(180_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDemo(page);
    const section = await derive(page);
    const { rows, questions } = await readLists(section);

    await section.locator('[data-nfr-copy-all]').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15_000 }).toContain('# Non-functional requirements');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('read by the Clean-Core.io engine');
    for (const r of rows) {
      expect(copied, r.id).toContain(r.id);
      expect(copied, `${r.id} lines`).toContain(r.anchors);
    }
    for (const x of questions) expect(copied, x.id).toContain(x.id);

    const [md] = await Promise.all([page.waitForEvent('download'), section.locator('[data-nfr-download="md"]').click()]);
    const text = fs.readFileSync((await md.path())!, 'utf8');
    for (const r of rows) expect(text).toContain(`| ${r.id} |`);
    const [docx] = await Promise.all([page.waitForEvent('download'), section.locator('[data-nfr-download="docx"]').click()]);
    expect(docx.suggestedFilename()).toMatch(/_non_functional_requirements\.docx$/);

    const [spec] = await Promise.all([page.waitForEvent('download'), section.locator('[data-nfr-spec="md"]').click()]);
    expect(spec.suggestedFilename()).toMatch(/_requirements_specification\.md$/);
    const both = fs.readFileSync((await spec.path())!, 'utf8');
    expect(both).toContain('## A. Functional requirements');
    expect(both).toContain('## B. Non-functional requirements');
    expect(both).toMatch(/\| FR-001 \|/);
    for (const r of rows) expect(both, r.id).toContain(r.anchors);

    await section.locator(`[data-nfr-copy-one="${rows[0].id}"]`).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15_000 }).toMatch(/^NFR-/);
    const one = await page.evaluate(() => navigator.clipboard.readText());
    expect(one.startsWith(rows[0].id)).toBe(true);
    expect(one).toContain(`Lines: ${rows[0].anchors}`);
  });

  test('on a phone the overview, the requirements and their details fit the width', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemo(page);
    const section = await derive(page);
    await section.locator('[data-nfr-row] [data-nfr-details-toggle]').first().click();
    for (const tab of [/Requirements/, /To be decided/]) {
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
  const EMAIL = `nfr-${STAMP}@cleancore-test.io`;
  const PROJECT = `nfr-signed-${STAMP}`;
  const DESIGN = JSON.stringify({
    projectName: 'NFR fixture',
    architectureOverview: { approachDescription: 'Fixture design.', nodeFramework: 'SAP CAP (Cloud Application Programming model)', runtimePlatform: 'SAP BTP' },
    nodeAppBlueprint: { projectStructure: [{ path: 'srv/service.cds', purpose: 'Service' }], apiEndpoints: [] },
    cloudServices: [],
    dataSync: { patternName: 'Released API calls', description: 'Fixture.' },
    securityHardening: [],
    roadmap: [],
  });
  /** What the design model used to write: the same paragraph under any program. */
  const PROPOSALS = {
    monitoring: 'Implement robust monitoring with dashboards and alerts for response time, error rate and throughput.',
    dataRetention: 'Proposal for TBD-04: keep the rows of ZMM_PO_APPR for ten years.',
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch { /* connected */ }
    const uid = (await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD)).user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Non', lastName: 'Func', email: EMAIL, tier: 'pilot', status: 'approved',
      termsVersionAccepted: TERMS_VERSION, transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });
    const fingerprint = { sha256: sha256Hex(source), fileName: 'Z_MM_PO_APPROVAL.abap', lineCount: source.split('\n').length, byteSize: source.length, objectType: 'Report', uploadedAt: new Date().toISOString() };
    const runId = `${PROJECT}-run`;
    await adminSetDoc('projects', PROJECT, {
      name: 'Z_MM_PO_APPROVAL', userId: uid, createdAt: new Date(), status: 'designed', s4Deployment: 'private',
      legacyCode: source, analysis: JSON.stringify({ cleanCoreScore: 60 }), cleanCoreScore: 60,
      solutionDesign: DESIGN, nonFunctionalRequirements: PROPOSALS, activeRunId: runId, inputFingerprint: fingerprint,
    });
    const unsigned = { runId, projectId: PROJECT, userId: uid, createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint };
    const runHash = recomputeStoredRunHash(unsigned);
    await adminSetDoc(`projects/${PROJECT}/runs`, runId, { ...unsigned, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!) });
  });

  test('read from the signed source without a model call; the model’s text stands folded beside it, a generic one said to be generic', async ({ page }) => {
    test.setTimeout(300_000);
    const modelCalls: string[] = [];
    page.on('request', (r) => {
      if (/\/api\/gemini/.test(r.url())) modelCalls.push(r.url());
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${PROJECT}/design`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-non-functional-requirements]')).toBeVisible({ timeout: 120_000 });
    const section = await derive(page);

    await expect(section.locator('[data-nfr-row]').filter({ hasText: 'M_BANF_EKG' })).toHaveCount(1);
    await expect(section.locator('[data-nfr-row]').filter({ hasText: 'ZMM_PO_APPR' }).first()).toBeVisible();

    const generic = section.locator('[data-nfr-proposal="monitoring"]');
    await expect(generic).toHaveAttribute('data-nfr-proposal-generic', 'true');
    await expect(generic).toContainText('Generic — names nothing from this program');
    // Folded: the model's sentence is not on screen until opened.
    await expect(generic.getByText(PROPOSALS.monitoring)).toBeHidden();
    const specific = section.locator('[data-nfr-proposal="retention"]');
    await expect(specific).toHaveAttribute('data-nfr-proposal-generic', 'false');
    await expect(specific).toContainText('ZMM_PO_APPR');
    await specific.getByRole('button', { name: /Model proposal/ }).click();
    await expect(specific.getByText(PROPOSALS.dataRetention)).toBeVisible();
    await expect(specific.locator('[data-provenance="proposed"]')).toBeVisible();

    // The design document points here instead of carrying the prose: the
    // group "How it is secured and run" links to this section (03.10.2026).
    await page.locator('[data-design-group-toggle="secure"]').click();
    await expect(page.locator('[data-design-group="secure"] [data-nfr-moved] a[href="#non-functional-requirements"]')).toBeVisible();
    expect(modelCalls).toEqual([]);
  });
});
