import { test, expect } from '@playwright/test';
import os from 'os';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { signInViaLanding } from './helpers/sign-in';
import { sha256Hex, artefactDigest } from '../lib/artefact-digest';
import { TERMS_VERSION } from '../lib/constants';
import type { TestCase } from '../lib/types';

/**
 * The delivery page, QA full review of v2.20.0 (fc787674705f).
 *
 * - b795a6e204b0: the flat CAP bundle ran `tsc` without a `tsconfig.json` and a
 *   CI that called `npm ci` without a lockfile — neither could succeed.
 * - 0e42c93fe3d2: a coverage estimate for a previous source was shown as current.
 * - 756a21a80ea3: business documentation stayed exportable on a blocked handover.
 * - 4a94616dd5a7: the audit-pack accordion said "Ready" beside a disabled download.
 * - ea7d41305986: the deck mixed the old run's metrics with the current source's findings.
 * - b24ba286e2fd: a failed project read rendered the page, and Export Guide threw.
 */

const STAMP = Date.now();
const EMAIL = `delivery-qa220-${STAMP}@cleancore-test.io`;
const PASSWORD = 'DeliveryQa220!';
const CAP = 'Side-by-Side (BTP CAP)';
const SOURCE = 'REPORT z_delivery_qa.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';

const FLAT = `flat-${STAMP}`;
const STALE_TESTS = `stale-tests-${STAMP}`;
const SOURCE_CHANGED = `src-changed-${STAMP}`;
const FOREIGN = `foreign-${STAMP}`;

const CASES: TestCase[] = [{ id: 't1', name: 'Totals', category: 'Unit', status: 'Passed' } as TestCase];
const DOCS = JSON.stringify({ l3_flow: [{ id: 'Task_1', name: 'Check stock', type: 'task', role: 'Clerk' }] });

function emulatorAuth() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected in this worker */
  }
  return auth;
}

async function seedProject(id: string, owner: string, extra: Record<string, unknown>) {
  await adminSetDoc('projects', id, {
    name: `Delivery QA ${id}`,
    userId: owner,
    createdAt: new Date(),
    status: 'documented',
    extensibilityRoute: CAP,
    originalRecommendation: CAP,
    legacyCode: SOURCE,
    analysis: JSON.stringify({ cleanCoreScore: 55, standardFit: { potential: 'Medium' } }),
    cleanCoreScore: 55,
    solutionDesign: '# Target architecture\n\nOne paragraph.\n',
    generatedCode: 'export const handler = () => 1;\n',
    testCases: CASES,
    coverageEstimate: { percentage: 71 },
    documentation: DOCS,
    businessDocumentation: '{"sop":"Check stock"}',
    activeRunId: `${id}-run`,
    ...extra,
  });
  await adminSetDoc(`projects/${id}/runs`, `${id}-run`, {
    runId: `${id}-run`,
    projectId: id,
    userId: owner,
    createdAt: new Date().toISOString(),
    status: 'completed',
    cleanCoreScore: 55,
    extensibilityRoute: CAP,
  });
}

test.describe('delivery page — QA full review of v2.20.0', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(emulatorAuth(), EMAIL, PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Delivery', lastName: 'QA', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION,
      mfaEnabled: false, createdAt: new Date(),
    });

    await seedProject(FLAT, uid, {});
    // Tests and documentation carry the digests recorded at a source change:
    // they were built for the previous source, and the handover is blocked.
    await seedProject(STALE_TESTS, uid, {
      auditMetadata: {
        // The source is the analysed one — only the artefacts are old. A
        // fingerprint is present, which is what the badge used to call "Ready".
        inputFingerprint: { sha256: sha256Hex(SOURCE), lineCount: 2, objectType: 'REPORT', fileName: 'z.abap' },
        sourceChange: {
          runId: `${STALE_TESTS}-run`,
          previousSha256: sha256Hex('REPORT z_old.\n'),
          artefacts: {
            testCases: artefactDigest('testCases', CASES),
            documentation: artefactDigest('documentation', DOCS),
          },
        },
      },
    });
    // The signed run analysed a different source than the one on the project.
    await seedProject(SOURCE_CHANGED, uid, {
      auditMetadata: { inputFingerprint: { sha256: sha256Hex('REPORT z_other.\n'), lineCount: 1, objectType: 'REPORT', fileName: 'z.abap' } },
    });
    // Somebody else's project: the rules refuse the read, so the load throws.
    await seedProject(FOREIGN, `someone-else-${STAMP}`, {});
  });

  test('b795a6e204b0 · the flat CAP bundle carries a tsconfig and a CI that runs without a lockfile', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${FLAT}/delivery`, { waitUntil: 'domcontentloaded' });
    const button = page.locator('button[data-handover-bundle]');
    await button.waitFor({ state: 'visible', timeout: 60000 });
    await expect(button, 'the handover is blocked, so this spec would prove nothing').toBeEnabled();

    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), button.click()]);
    const produced = path.join(os.tmpdir(), `cc-delivery-qa220-${STAMP}.zip`);
    await download.saveAs(produced);
    const zip = await JSZip.loadAsync(fs.readFileSync(produced));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

    expect(names).toContain('src/app.ts');
    expect(names, '`build` is `tsc`, and there is no project file for it').toContain('tsconfig.json');
    const tsconfig = JSON.parse(await zip.file('tsconfig.json')!.async('string'));
    const pkg = JSON.parse(await zip.file('package.json')!.async('string'));
    // main and test read dist/, compiled from src/.
    expect(tsconfig.compilerOptions.rootDir).toBe('src');
    expect(tsconfig.compilerOptions.outDir).toBe('dist');
    expect(pkg.main).toBe('dist/app.js');
    expect(names, 'a lockfile ships now — then `npm ci` alone would be fine').not.toContain('package-lock.json');

    const ci = await zip.file('.github/workflows/ci.yml')!.async('string');
    expect(ci, 'CI calls `npm ci` unconditionally, and there is no lockfile').not.toMatch(/^\s*- run: npm ci\s*$/m);
    expect(ci).toContain('npm install');

  });

  test('0e42c93fe3d2 · 756a21a80ea3 · 4a94616dd5a7 · a stale suite qualifies its estimate and blocks the SOP export and the pack badge', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${STALE_TESTS}/delivery`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stale-notice]')).toBeVisible({ timeout: 60000 });

    await expect(page.locator('[data-coverage-stale]')).toBeVisible();
    await expect(page.locator('[data-coverage-provenance]')).toHaveCount(0);

    await expect(page.locator('button[data-stage-output="businessDocumentation"]')).toBeDisabled();

    const header = page.locator('button', { hasText: 'Compliance Audit Pack' });
    await expect(header).toContainText('Blocked');
    await expect(header).not.toContainText('Ready');
  });

  test('ea7d41305986 · a source that is not the analysed one gets no stakeholder deck', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${SOURCE_CHANGED}/delivery`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-stale-notice]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-delivery-deck-blocked]')).toBeVisible();
    await expect(page.locator('#presentation-preview')).toHaveCount(0);
  });

  test('b24ba286e2fd · a project that cannot be read shows an error, not deliverables that throw', async ({ page }) => {
    test.setTimeout(120 * 1000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${FOREIGN}/delivery`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-delivery-load-failed]')).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole('button', { name: 'Export Guide' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
