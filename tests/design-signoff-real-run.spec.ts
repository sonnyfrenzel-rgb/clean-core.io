import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { connectAuthToEmulator } from './helpers/emulator-guard';
import { adminGetDoc, adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';

/**
 * A decision on a project analysed the way a reader analyses one — a real signed run through `/api/runs/create`, not a
 * seeded run document. Since ADR-145 the route is recorded with the decision on the Decide page, in one go (`decide`):
 * Design no longer asks for "Confirm target". It shows the decided option, keeps "Change target" for a route on record,
 * and the IT view says the target is recorded with the decision — after a reload too. A design written for an earlier
 * run is still named as older.
 *
 * `Z_SALES_ORDER_CREATOR` asks the business no question.
 */

const EXAMPLE = 'Z_SALES_ORDER_CREATOR.txt';
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', EXAMPLE), 'utf8');

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
  roadmap: [],
});

async function analysedProject(request: import('@playwright/test').APIRequestContext, deployments: string[]) {
  const seeded = await seedStageProject({ prefix: 'dsignoff-real', acceptTerms: true });
  // A project as the new-project dialog leaves it: source staged, never analysed.
  await adminSetDoc('projects', seeded.projectId, {
    name: 'Z_SALES_ORDER_CREATOR', userId: seeded.uid, createdAt: new Date(), status: 'uploaded',
    legacyCode: SOURCE, s4Deployment: deployments[0],
  });
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = connectAuthToEmulator(getAuth(app));
  const cred = await signInWithEmailAndPassword(auth, seeded.email, seeded.password);
  const token = await cred.user.getIdToken(true);
  for (const [i, s4Deployment] of deployments.entries()) {
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { projectId: seeded.projectId, legacyCode: SOURCE, s4Deployment, analysis: '{}', uploadedFileName: EXAMPLE },
      timeout: 180_000,
    });
    expect(res.status(), await res.text()).toBe(200);
    // The design is written after the first run, as the Design stage writes it.
    if (i === 0) await adminMergeDoc('projects', seeded.projectId, { solutionDesign: DESIGN_JSON });
  }
  return seeded;
}

test('an analysis that moved on after the design: Management leads to the decision, and the older design is named as older', async ({ page, request }) => {
  test.setTimeout(480_000);
  // Analysed, designed, then analysed again under another target: the design document was written for the earlier run.
  const seeded = await analysedProject(request, ['private', 'public']);
  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/design?view=management`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#design-answer [data-answer]')).toHaveText('Not decided yet. The decision is taken on the Decide page.', { timeout: 120_000 });
  await expect(page.locator('[data-design-confirm]')).toHaveCount(0);
  expect((await adminGetDoc('projects', seeded.projectId))?.approvedByArchitect ?? false).toBe(false);
  // The design document is still named as written for the earlier run.
  await page.goto(`/project/${seeded.projectId}/design?view=it`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/This design was generated for a previous/)).toBeVisible({ timeout: 120_000 });
});

test('a Rebuild recorded on the Decide page on a real run: Design shows it decided, with "Change target" — and after a reload', async ({ page, request }) => {
  test.setTimeout(420_000);
  const seeded = await analysedProject(request, ['private']);
  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/redesign`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-decide-state="choosing"]')).toBeVisible({ timeout: 120_000 });
  await page.locator('[data-decide-option="rebuild"]').click();
  const record = page.locator('[data-decide-record]');
  await expect(record).toBeEnabled({ timeout: 120_000 });
  await record.click();
  await page.getByRole('dialog').getByRole('button', { name: /^(Record only|Record the decision)$/ }).first().click();
  await expect(page.locator('[data-decide-state="decided"][data-decide-result-option="rebuild"]')).toBeVisible({ timeout: 120_000 });
  const stored = await adminGetDoc('projects', seeded.projectId);
  expect(stored?.approvedByArchitect).toBe(true);
  expect((stored?.decision as { status?: string } | undefined)?.status).toBe('confirmed');
  expect(stored?.approvedBy).toBe(seeded.email);

  await page.goto(`/project/${seeded.projectId}/design?view=management`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#design-answer [data-answer]')).toContainText('Decided: Rebuild as', { timeout: 120_000 });
  await expect(page.locator('[data-design-confirm]')).toHaveText(/Change target/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#design-answer [data-answer]')).toContainText('Decided: Rebuild as', { timeout: 120_000 });
  // The IT view says where the target was recorded.
  await page.goto(`/project/${seeded.projectId}/design?view=it`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#design-answer [data-answer-condition]')).toContainText('The target is recorded with the decision.', { timeout: 120_000 });
});
