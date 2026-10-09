import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { DEFAULT_TARGET_EDITION, targetEditionOf } from '../lib/target-edition';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The target edition is asked on every screen that starts a project (owner,
 * 06.10.2026: "beim Start eines Beispiels oder neuen Projekts werde ich gar
 * nicht mehr gefragt, ob Public oder Private Cloud").
 *
 * From 03.10. the start signed the first run in the workspace at once, and
 * `hooks/useStartRun.ts` read a project without a target as Private while the
 * route read it as Public. Every new project was therefore assessed — routing,
 * score, design, management overview — against an edition nobody chose.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

test.describe('the target edition of a new project', () => {
  test('a missing target reads as the server default, the same on client and route', () => {
    expect(DEFAULT_TARGET_EDITION).toBe('public');
    expect(targetEditionOf(undefined)).toBe('public');
    expect(targetEditionOf('')).toBe('public');
    expect(targetEditionOf('private')).toBe('private');
    expect(targetEditionOf('public')).toBe('public');
    // The route's own default, which the client helper mirrors.
    expect(read('app/api/runs/create/route.ts')).toMatch(/body\.s4Deployment \|\| projectData\?\.s4Deployment \|\| 'public'/);
  });

  // The source half. The own-code import is rendered end to end, down to the
  // edition the active run signed, in tests/level-and-target-rendered.spec.ts
  // (QA a1f9ee03577a / 0b5e3a8b9d49).
  test('both start screens ask for it and write it before the workspace opens', () => {
    for (const file of ['components/StarterExamples.tsx', 'components/workspace/OwnCodeImport.tsx']) {
      const src = read(file);
      expect(src, file).toContain('<TargetEditionChoice');
      expect(src, file).toMatch(/updateDoc\(docRef, \{ s4Deployment: edition \}\)/);
      // The write comes before the push into the workspace that signs the run.
      expect(src.indexOf('s4Deployment: edition'), file).toBeLessThan(src.indexOf('?first=1'));
    }
  });

  test('no client start path invents Private for a project without a target', () => {
    for (const file of ['hooks/useStartRun.ts', 'components/workspace/WorkspaceListReport.tsx']) {
      const src = read(file);
      expect(src, file).not.toMatch(/s4Deployment === 'public' \? 'public' : 'private'/);
      expect(src, file).toContain('targetEditionOf(');
    }
  });
});

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
try {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'TargetEdition123!';

test.describe('an example started for the Public Edition', () => {
  test('is signed for the Public Edition, and the management overview says so', async ({ page }) => {
    test.setTimeout(360 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    const email = `edition-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
    const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Target', lastName: 'Edition', email,
      tier: 'pilot', status: 'approved', activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
      modelStages: { analyze: false, naming: false, statements: false },
    });
    await signInViaLanding(page, email, PASSWORD);

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
    const list = page.locator('[data-cc-workspace]');
    await expect(list).toBeVisible({ timeout: 90000 });
    const choice = list.locator('[data-target-edition-choice]');
    // Asked, and visibly preselected — a one-click start still works.
    await expect(choice).toHaveAttribute('data-target-edition', 'private');
    await choice.locator('[data-target-edition-option="public"]').click();
    await expect(choice).toHaveAttribute('data-target-edition', 'public');

    const start = list.locator('[data-example-start="Z_MATERIAL_STOCK_CALC"]').first();
    if (!(await start.isVisible().catch(() => false))) {
      await list.locator('[data-examples-more] button').first().click({ timeout: 60000 });
    }
    await start.click({ timeout: 60000 });

    await page.waitForURL(/\/project\/[^/?]+\?first=1/, { timeout: 120000 });
    const projectId = new URL(page.url()).pathname.split('/')[2];
    await expect(page.locator('[data-workspace-process="ready"] [data-process-map]')).toBeVisible({ timeout: 120000 });

    // The signed run carried the chosen edition, and the route kept it on the project.
    await expect
      .poll(async () => {
        const p = await adminGetDoc('projects', projectId);
        return p?.activeRunId ? p.s4Deployment : null;
      }, { timeout: 90000 })
      .toBe('public');

    await page.goto(`/project/${projectId}?view=management`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    // The bucket card may stand in a folded section; its text is what is asserted.
    const buckets = page.locator('[data-executive-buckets]');
    await expect(buckets).toBeAttached({ timeout: 90000 });
    await expect(buckets).toContainText('Public Edition', { timeout: 60000 });
    await expect(buckets).not.toContainText('Private Edition');
  });
});
