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
 * A sign-off on a project analysed the way a reader analyses one — a real
 * signed run through `/api/runs/create`, not a seeded run document — shows as
 * confirmed once it lands, and still after a reload.
 *
 * Since 3.5.0 "Confirm target" is the Management view's one primary action,
 * behind the checklist (ADR-130 (1), G8): the business questions answered and
 * the design current. The IT view shows the state. A design written for an
 * earlier run is no longer signed off over: the checklist names it out of date.
 *
 * `Z_SALES_ORDER_CREATOR` asks the business no question, so a design on
 * record makes the checklist ready; `Z_MM_PO_APPROVAL` asks ten.
 */

const EXAMPLE = 'Z_SALES_ORDER_CREATOR.txt';
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', EXAMPLE), 'utf8');
const CONFIRMED = 'The target is confirmed.';

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

async function openManagement(page: import('@playwright/test').Page, projectId: string) {
  await page.goto(`/project/${projectId}/design?view=management`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-view="management"] [data-design-checklist]')).toBeVisible({ timeout: 120_000 });
}

test('an analysis that moved on after the design: Confirm target waits, and the older design document is named as older', async ({ page, request }) => {
  test.setTimeout(480_000);
  // Analysed, designed, then analysed again under another target: the design
  // document was written for the earlier run.
  const seeded = await analysedProject(request, ['private', 'public']);
  await signInThroughForm(page, seeded);
  await openManagement(page, seeded.projectId);
  const checklist = page.locator('[data-design-checklist]');
  await expect(checklist.locator('li').filter({ hasText: 'Design written' })).toContainText('Out of date: write it again', { timeout: 120_000 });
  await expect(page.locator('[data-design-confirm]')).toBeDisabled();
  await expect(page.locator('#design-confirm-note')).toHaveText('Possible once every check below is done.');
  expect((await adminGetDoc('projects', seeded.projectId))?.approvedByArchitect ?? false).toBe(false);
  // The design document is still named as written for the earlier run.
  await page.goto(`/project/${seeded.projectId}/design?view=it`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/This design was generated for a previous/)).toBeVisible({ timeout: 120_000 });
});

test('after Confirm target on a real run, the Design page says confirmed — and after a reload', async ({ page, request }) => {
  test.setTimeout(420_000);
  const seeded = await analysedProject(request, ['private']);
  await signInThroughForm(page, seeded);
  await openManagement(page, seeded.projectId);
  await expect(page.locator('[data-design-confirm]')).toBeEnabled({ timeout: 120_000 });

  // "Confirm target" asks first (owner 02.10.2026); its own button confirms.
  await page.locator('[data-design-confirm]').click();
  await page.locator('[data-cc-message-box] button:has-text("Confirm target")').click();
  await expect(page.locator('#design-answer [data-answer]')).toHaveText(CONFIRMED, { timeout: 60_000 });
  await expect(page.locator('[data-design-confirm]')).toHaveText(/Change target/);
  expect((await adminGetDoc('projects', seeded.projectId))?.approvedByArchitect).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#design-answer [data-answer]')).toHaveText(CONFIRMED, { timeout: 120_000 });
  // The IT view shows the state (G8).
  await page.goto(`/project/${seeded.projectId}/design?view=it`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#design-answer [data-answer-condition]')).toContainText('The target is confirmed (Management view).', { timeout: 120_000 });
});
