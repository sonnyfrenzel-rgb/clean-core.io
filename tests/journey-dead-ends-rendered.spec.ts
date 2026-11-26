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
 * Journey review 26.11.2026, rendered: on a project analysed through `/api/runs/create`, Analyze IT carries "Re-design
 * this program" into Re-design, and Design's Management view, with every check done over a design stored in the older
 * text form, says so and offers the rewrite instead of "Ready for your confirmation" over a closed button.
 *
 * `Z_SALES_ORDER_CREATOR` asks the business no question, so a design on record makes the checklist ready (as in
 * `design-signoff-real-run.spec.ts`).
 */

const EXAMPLE = 'Z_SALES_ORDER_CREATOR.txt';
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', EXAMPLE), 'utf8');
/** A design as an earlier version stored it: prose, no structured target. */
const OLDER_DESIGN = '# Sales order creation\n\nAn in-app extension that creates sales orders through the released API.';

async function analysedWithOlderDesign(request: import('@playwright/test').APIRequestContext) {
  const seeded = await seedStageProject({ prefix: 'journey-deadend', acceptTerms: true });
  await adminSetDoc('projects', seeded.projectId, {
    name: 'Z_SALES_ORDER_CREATOR', userId: seeded.uid, createdAt: new Date(), status: 'uploaded',
    legacyCode: SOURCE, s4Deployment: 'private',
  });
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = connectAuthToEmulator(getAuth(app));
  const cred = await signInWithEmailAndPassword(auth, seeded.email, seeded.password);
  const token = await cred.user.getIdToken(true);
  const res = await request.post('/api/runs/create', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { projectId: seeded.projectId, legacyCode: SOURCE, s4Deployment: 'private', analysis: '{}', uploadedFileName: EXAMPLE },
    timeout: 180_000,
  });
  expect(res.status(), await res.text()).toBe(200);
  await adminMergeDoc('projects', seeded.projectId, { solutionDesign: OLDER_DESIGN });
  return seeded;
}

test('Analyze IT leads into Re-design, and an older design says what blocks the confirm and offers the rewrite', async ({ page, request }) => {
  test.setTimeout(420_000);
  const seeded = await analysedWithOlderDesign(request);
  await signInThroughForm(page, seeded);

  // Analyze, IT: the card's primary goes to Re-design.
  await page.goto(`/project/${seeded.projectId}/analyze?view=it`, { waitUntil: 'domcontentloaded' });
  const redesign = page.locator('[data-analyze-it-redesign]');
  await expect(redesign).toBeVisible({ timeout: 120_000 });
  await expect(redesign).toHaveText('Re-design this program');
  await expect(redesign).toHaveAttribute('href', `/project/${seeded.projectId}/redesign`);

  // Design, Management: every check done, the design in the older form.
  await page.goto(`/project/${seeded.projectId}/design?view=management`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-view="management"] [data-design-checklist]')).toBeVisible({ timeout: 120_000 });
  const answer = page.locator('#design-answer [data-answer]');
  await expect(answer).toContainText('older form', { timeout: 120_000 });
  await expect(answer).not.toContainText('Ready for your confirmation');
  const rewrite = page.locator('[data-design-rewrite-older]');
  await expect(rewrite).toBeVisible();
  await expect(rewrite).toHaveText('Write the design again');
  await expect(page.locator('[data-design-confirm]')).toHaveCount(0);
  await expect(page.locator('#design-confirm-note')).toContainText('Every check is done');
  expect((await adminGetDoc('projects', seeded.projectId))?.approvedByArchitect ?? false).toBe(false);
});
