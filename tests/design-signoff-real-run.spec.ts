import { test, expect } from '@playwright/test';
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
 * signed run of `Z_MM_PO_APPROVAL` through `/api/runs/create`, not a seeded
 * run document — shows as confirmed once it lands, and still after a reload.
 */

const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8');

const DESIGN_JSON = JSON.stringify({
  projectName: 'Emergency purchase approval',
  architectureOverview: {
    approachDescription: 'Side-by-side CAP service that reads purchase requisitions through released APIs.',
    nodeFramework: 'SAP CAP (Cloud Application Programming model)',
    runtimePlatform: 'SAP BTP (Business Technology Platform)',
  },
  nodeAppBlueprint: { projectStructure: [{ path: 'srv/service.cds', purpose: 'Service' }], apiEndpoints: [] },
  cloudServices: [],
  dataSync: { patternName: 'Released API calls', description: 'Synchronous calls through the destination service.' },
  securityHardening: [],
  roadmap: [],
});

async function analysedProject(request: import('@playwright/test').APIRequestContext, deployments: string[]) {
  const seeded = await seedStageProject({ prefix: 'dsignoff-real', acceptTerms: true });
  // A project as the new-project dialog leaves it: source staged, never analysed.
  await adminSetDoc('projects', seeded.projectId, {
    name: 'Z_MM_PO_APPROVAL', userId: seeded.uid, createdAt: new Date(), status: 'uploaded',
    legacyCode: SOURCE, s4Deployment: deployments[0],
  });
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = connectAuthToEmulator(getAuth(app));
  const cred = await signInWithEmailAndPassword(auth, seeded.email, seeded.password);
  const token = await cred.user.getIdToken(true);
  for (const [i, s4Deployment] of deployments.entries()) {
    const res = await request.post('/api/runs/create', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { projectId: seeded.projectId, legacyCode: SOURCE, s4Deployment, analysis: '{}', uploadedFileName: 'Z_MM_PO_APPROVAL.abap' },
      timeout: 180_000,
    });
    expect(res.status(), await res.text()).toBe(200);
    // The design is written after the first run, as the Design stage writes it.
    if (i === 0) await adminMergeDoc('projects', seeded.projectId, { solutionDesign: DESIGN_JSON });
  }
  return seeded;
}

async function confirmAndCheck(page: import('@playwright/test').Page, seeded: { projectId: string; email: string; password: string }) {
  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-canvas-stage]')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-design-alternative]').first()).toBeVisible({ timeout: 120_000 });

  await page.locator('[data-design-confirm]').click();
  await page.locator('[data-design-signoff-dialog] button:has-text("Confirm & Lock Architecture")').click();
  await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-design-kpi="Sign-off"]')).toContainText('Confirmed');
  expect((await adminGetDoc('projects', seeded.projectId))?.approvedByArchitect).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-canvas-stage]')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-design-kpi="Sign-off"]')).toContainText('Confirmed');
}

test('a sign-off given after the analysis moved on shows as confirmed, while the older design document is named as older', async ({ page, request }) => {
  test.setTimeout(480_000);
  // Analysed, designed, then analysed again under another target: the design
  // document was written for the earlier run, the sign-off is given now.
  const seeded = await analysedProject(request, ['private', 'public']);
  await confirmAndCheck(page, seeded);
  // The design document is still named as written for the earlier run — that
  // is the document's state, not the sign-off's.
  await expect(page.getByText(/This design was generated for a previous/)).toBeVisible();
});

test('after Confirm & Lock on a real run, the Design page says confirmed — and after a reload', async ({ page, request }) => {
  test.setTimeout(420_000);
  const seeded = await seedStageProject({ prefix: 'dsignoff-real', acceptTerms: true });
  // A project as the new-project dialog leaves it: source staged, never analysed.
  await adminSetDoc('projects', seeded.projectId, {
    name: 'Z_MM_PO_APPROVAL', userId: seeded.uid, createdAt: new Date(), status: 'uploaded',
    legacyCode: SOURCE, s4Deployment: 'private',
  });
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = connectAuthToEmulator(getAuth(app));
  const cred = await signInWithEmailAndPassword(auth, seeded.email, seeded.password);
  const token = await cred.user.getIdToken(true);
  const res = await request.post('/api/runs/create', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { projectId: seeded.projectId, legacyCode: SOURCE, s4Deployment: 'private', analysis: '{}', uploadedFileName: 'Z_MM_PO_APPROVAL.abap' },
    timeout: 180_000,
  });
  expect(res.status(), await res.text()).toBe(200);
  await adminMergeDoc('projects', seeded.projectId, { solutionDesign: DESIGN_JSON });

  await signInThroughForm(page, seeded);
  await page.goto(`/project/${seeded.projectId}/design`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-canvas-stage]')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-design-alternative]').first()).toBeVisible({ timeout: 120_000 });

  await page.locator('[data-design-confirm]').click();
  await page.locator('[data-design-signoff-dialog] button:has-text("Confirm & Lock Architecture")').click();
  await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-design-kpi="Sign-off"]')).toContainText('Confirmed');
  expect((await adminGetDoc('projects', seeded.projectId))?.approvedByArchitect).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-canvas-stage]')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-design-answer="confirmed"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-design-kpi="Sign-off"]')).toContainText('Confirmed');
});
