import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { adminGetDoc, adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { decisionBasisOf } from '../lib/decide';

/**
 * QA review of 374ee7134c8e, the test gaps of the Decide page (ADR-145), executed against the running app and the
 * emulators on a real signed run:
 *
 *   - the `decide` command itself: a basis that moved between the page's read and the commit is refused with 409 and
 *     writes nothing, a non-owner and a caller without a token are refused (583f223f6061);
 *   - "Record and write the design (sends answers to …)" really starts the design's model call, once, and only on the
 *     click; a failed call leaves the decision recorded and says so (01d676de09bc);
 *   - Design, Management after a recorded Rebuild without a design offers "Write the design" (8e5be9d33deb);
 *   - "Generate draft (sends code to …)" on the result starts the generation, once, and only on the click (01d676de09bc).
 *
 * The model proxy and the generation lease are intercepted: nothing reaches a provider.
 */

const EXAMPLE = 'Z_SALES_ORDER_CREATOR.txt';
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', EXAMPLE), 'utf8');
const REASON = 'The plant that ran it closed in Q3; nobody has needed the program since.';

const DESIGN_JSON = JSON.stringify({
  projectName: 'Sales order creation',
  architectureOverview: {
    approachDescription: 'In-app RAP object that creates sales orders through the released API.',
    nodeFramework: 'SAP RAP (RESTful Application Programming)',
    runtimePlatform: 'SAP S/4HANA Core (Developer Extensibility)',
  },
  nodeAppBlueprint: { projectStructure: [{ path: 'zr_sales_order.bdef', purpose: 'Behavior definition' }], apiEndpoints: [] },
  cloudServices: [],
  dataSync: { patternName: 'Transactional DB Access', description: 'One LUW.' },
  securityHardening: [],
  roadmap: [{ phase: 'Phase 1', title: 'RAP', deliverables: ['BO'] }],
});

async function tokenOf(seeded: SeededProject): Promise<string> {
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = connectAuthToEmulator(getAuth(app));
  const cred = await signInWithEmailAndPassword(auth, seeded.email, seeded.password);
  return cred.user.getIdToken(true);
}

async function analysed(request: import('@playwright/test').APIRequestContext, prefix: string) {
  const seeded = await seedStageProject({ prefix, acceptTerms: true });
  await adminSetDoc('projects', seeded.projectId, {
    name: 'Z_SALES_ORDER_CREATOR', userId: seeded.uid, createdAt: new Date(), status: 'uploaded', legacyCode: SOURCE, s4Deployment: 'private',
  });
  const token = await tokenOf(seeded);
  const res = await request.post('/api/runs/create', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { projectId: seeded.projectId, legacyCode: SOURCE, s4Deployment: 'private', analysis: '{}', uploadedFileName: EXAMPLE },
    timeout: 180_000,
  });
  expect(res.status(), await res.text()).toBe(200);
  return { seeded, token };
}

/**
 * Counts the requests matching `pattern` that start model work and answers them with a refusal, so nothing reaches a
 * provider. A GET of the lease route is the plan's read of this hour's generations, not a start: it passes through.
 */
async function intercept(page: Page, pattern: string): Promise<{ count: () => number }> {
  let n = 0;
  await page.route(pattern, async (route) => {
    if (route.request().method() === 'GET') {
      await route.continue();
      return;
    }
    n += 1;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Intercepted by the test.' }) });
  });
  return { count: () => n };
}

test('the decide command: a basis that moved since the read is refused whole; non-owners and callers without a token too', async ({ request }) => {
  test.setTimeout(300_000);
  const { seeded, token } = await analysed(request, 'decide-route');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const commands = `/api/projects/${seeded.projectId}/commands`;

  // The page's read, and the basis it binds.
  const readRes = await request.get(`/api/projects/${seeded.projectId}/decision`, { headers, timeout: 120_000 });
  expect(readRes.status()).toBe(200);
  const read = await readRes.json();
  const basisAtRead = decisionBasisOf({ runId: read.runId, evidenceDigest: read.evidenceDigest, draft: read.draft, stored: read.stored, costRevision: read.costNow?.revision ?? null });
  const body = (targetArchitecture: string, basis: string) => ({
    command: 'decide', targetArchitecture, justification: REASON, expectedRunId: read.runId, expectedEvidenceDigest: read.evidenceDigest, expectedDecisionBasis: basis,
  });

  // No token, and a signed-in account that is not the owner: refused, nothing written.
  expect((await request.post(commands, { headers: { 'Content-Type': 'application/json' }, data: body('retire', basisAtRead) })).status()).toBe(401);
  const stranger = await seedStageProject({ prefix: 'decide-route-stranger', acceptTerms: true });
  const strangerToken = await tokenOf(stranger);
  const refused = await request.post(commands, { headers: { Authorization: `Bearer ${strangerToken}`, 'Content-Type': 'application/json' }, data: body('retire', basisAtRead) });
  expect(refused.status()).toBe(404);
  expect((await adminGetDoc('projects', seeded.projectId))?.approvedByArchitect ?? false).toBe(false);

  // The owner records Retire on that read: sign-off and confirmed record, together.
  const ok = await request.post(commands, { headers, data: body('retire', basisAtRead), timeout: 120_000 });
  expect(ok.status(), await ok.text()).toBe(200);
  let stored = await adminGetDoc('projects', seeded.projectId);
  expect(stored?.targetArchitecture).toBe('retire');
  expect((stored?.decision as { status?: string }).status).toBe('confirmed');

  // Withdrawn in between: the record the first read saw is not the record any more.
  expect((await request.post(commands, { headers, data: { command: 'withdraw-decision' } })).status()).toBe(200);

  // A second decision on the stale read: 409, and neither the sign-off nor the record moves.
  const stale = await request.post(commands, { headers, data: body('keep', basisAtRead), timeout: 120_000 });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).code).toBe('decision-moved');
  stored = await adminGetDoc('projects', seeded.projectId);
  expect(stored?.targetArchitecture).toBe('retire');
  expect((stored?.decision as { status?: string }).status).toBe('withdrawn');
});

test('Record and write the design starts the design once, on the click; a failure keeps the decision; Management offers to write it', async ({ page, request }) => {
  test.setTimeout(420_000);
  const { seeded } = await analysed(request, 'decide-write');
  const gemini = await intercept(page, '**/api/gemini**');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/redesign`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-decide-state="choosing"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-decide-option="rebuild"]').click();
  const record = page.locator('[data-decide-record]');
  await expect(record).toBeEnabled({ timeout: 120_000 });
  await record.click();
  const box = page.getByRole('dialog');
  await expect(box.locator('[data-decide-model-hint]')).toContainText('two model calls to');
  expect(gemini.count(), 'a model call before the click').toBe(0);
  await box.getByRole('button', { name: /^Record and write the design \(sends answers to / }).click();

  // On Design, the design's first model call goes out once; refused here, so the second never follows.
  await page.waitForURL(/\/design\?view=business/, { timeout: 120_000 });
  await expect.poll(() => gemini.count(), { timeout: 120_000 }).toBe(1);
  await expect(page.getByText('Your decision is recorded. The design could not be written; open Design to try again.')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(3000);
  expect(gemini.count()).toBe(1);
  const stored = await adminGetDoc('projects', seeded.projectId);
  expect((stored?.decision as { status?: string }).status).toBe('confirmed');
  expect(stored?.solutionDesign ?? '').toBe('');

  // A reload starts nothing: the request was taken.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#design-answer')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(5000);
  expect(gemini.count()).toBe(1);

  // Design, Management: the recorded Rebuild without a design offers to write it, in the Business view.
  await page.goto(`/project/${seeded.projectId}/design?view=management`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#design-answer [data-answer]')).toContainText('Decided: Rebuild as', { timeout: 120_000 });
  await expect(page.locator('[data-design-write-link]')).toHaveText('Write the design');
  await expect(page.locator('[data-design-write-link]')).toHaveAttribute('href', `/project/${seeded.projectId}/design?view=business#design-questions`);
});

test('Generate draft on the result starts the generation once, on the click, and opening Transformation alone does not', async ({ page, request }) => {
  test.setTimeout(420_000);
  const { seeded } = await analysed(request, 'decide-generate');
  const lease = await intercept(page, '**/api/transformation/lease**');
  const gemini = await intercept(page, '**/api/gemini**');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/redesign`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-decide-state="choosing"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-decide-option="rebuild"]').click();
  await expect(page.locator('[data-decide-record]')).toBeEnabled({ timeout: 120_000 });
  await page.locator('[data-decide-record]').click();
  await page.getByRole('dialog').getByRole('button', { name: /^(Record only|Record the decision)$/ }).first().click();
  await expect(page.locator('[data-decide-state="decided"][data-decide-result-option="rebuild"]')).toBeVisible({ timeout: 120_000 });

  // A design on record, as Design writes it; then the result offers the approved button.
  await adminMergeDoc('projects', seeded.projectId, { solutionDesign: DESIGN_JSON, status: 'designed' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const generate = page.locator('[data-decide-next="generate"]');
  await expect(generate).toHaveText(/^Generate draft \(sends code to /, { timeout: 120_000 });

  // Opening Transformation by itself sends nothing.
  await page.goto(`/project/${seeded.projectId}/transformation`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-generate-code]')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(5000);
  expect(lease.count() + gemini.count(), 'model work on opening').toBe(0);

  // The click on the Decide page starts it, once.
  await page.goto(`/project/${seeded.projectId}/redesign`, { waitUntil: 'domcontentloaded' });
  await expect(generate).toBeVisible({ timeout: 120_000 });
  await generate.click();
  await page.waitForURL(/\/transformation$/, { timeout: 120_000 });
  await expect.poll(() => lease.count() + gemini.count(), { timeout: 180_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(3000);
  expect(lease.count(), 'one generation lease asked for').toBeLessThanOrEqual(1);
});
