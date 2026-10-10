import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { artefactDigest, sha256Hex } from '../lib/artefact-digest';
import { buildEngineConfluenceHtml, STALE_EXPORT_NOTE } from '../lib/documentation-export';
import { FIXTURE_FILE, engineDocumentationOf, fixtureSource, processDocumentOf } from './helpers/business-layer-fixture';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';

/**
 * Owner decision 30.09.2026 on QA finding c8ae21453b3b — a stale
 * documentation is **not** blocked from the Confluence export. What it may not
 * do is pass itself off as current:
 *
 *   1. the export button carries a visible stale note when the documentation
 *      phase of `workflowSteps(project)` is `stale`, and none when it is not;
 *   2. the exported file opens with the same warning, and a current one does
 *      not.
 *
 * Both halves are tested as data (the template) and in a browser, with a
 * real download, against one stale and one current project. Since roadmap
 * 3.0.7 the export sits in the stage header's one Export menu, and the page of
 * a legacy blueprint is gone with its rendering (a legacy blueprint is
 * downloaded as it was stored).
 */

const ENGINE_DOC = processDocumentOf(fixtureSource());

test.describe('the Confluence template says when it is stale', () => {
  test('a stale process description export opens with the note; a current one does not', async () => {
    const stale = await buildEngineConfluenceHtml(ENGINE_DOC, null, { stale: true }).text();
    expect(stale).toContain('data-stale-export');
    expect(stale).toContain('Regenerate it before relying on it.');
    // Before the heading, so it is the first thing a reader of the file sees.
    expect(stale.indexOf('data-stale-export')).toBeLessThan(stale.indexOf('<h1>'));
    for (const current of [
      await buildEngineConfluenceHtml(ENGINE_DOC, null, { stale: false }).text(),
      await buildEngineConfluenceHtml(ENGINE_DOC, null).text(),
    ]) {
      expect(current).not.toContain('data-stale-export');
      expect(current).not.toContain('Regenerate it before relying on it.');
    }
  });

  test('the note names the state and what to do about it', () => {
    expect(STALE_EXPORT_NOTE).toMatch(/^Stale — /);
    expect(STALE_EXPORT_NOTE).toMatch(/Regenerate/);
  });
});

test.describe('the documentation stage, stale and current, in a browser', () => {
  const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const EMAIL = `doc-stale-${STAMP}@cleancore-test.io`;
  const PASSWORD = 'DocStale123!';
  const STALE_ID = `doc-stale-${STAMP}`;
  const CURRENT_ID = `doc-current-${STAMP}`;
  const RUN_ID = `doc-stale-run-${STAMP}`;

  // The process description is read from the signed source, so both projects
  // keep it; the stale one carries the documentation's digest recorded at a
  // source change — it was written for the previous source
  // (`staleness()` in lib/workflow-steps.ts), which is what makes it stale.
  const ANALYSED = fixtureSource();
  const DOCUMENTATION = JSON.stringify(engineDocumentationOf(ANALYSED));

  const fingerprint = {
    sha256: sha256Hex(ANALYSED),
    fileName: FIXTURE_FILE,
    lineCount: ANALYSED.split('\n').length,
    byteSize: ANALYSED.length,
    objectType: 'Report',
    uploadedAt: new Date().toISOString(),
  };

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }

    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Doc', lastName: 'Stale', email: EMAIL,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });

    const fields = (name: string, extra: Record<string, unknown> = {}) => ({
      name, userId: uid, createdAt: new Date(), status: 'documented',
      legacyCode: ANALYSED,
      analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
      cleanCoreScore: 62,
      solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n',
      generatedCode: 'export const ok = true;\n',
      documentation: DOCUMENTATION,
      activeRunId: RUN_ID,
      inputFingerprint: fingerprint,
      ...extra,
    });
    await adminSetDoc('projects', STALE_ID, fields('Stale documentation fixture', {
      auditMetadata: {
        inputFingerprint: fingerprint,
        sourceChange: {
          runId: RUN_ID,
          previousSha256: sha256Hex('REPORT z_old.\n'),
          artefacts: { documentation: artefactDigest('documentation', DOCUMENTATION) },
        },
      },
    }));
    await adminSetDoc('projects', CURRENT_ID, fields('Current documentation fixture'));
    for (const id of [STALE_ID, CURRENT_ID]) {
      await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
        runId: RUN_ID, projectId: id, userId: uid,
        createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
        inputFingerprint: fingerprint,
      });
    }
  });

  /** Opens the stage's Export menu and reads the Confluence item before the click closes the menu. */
  async function exportFrom(page: Page, projectId: string): Promise<{ state: string | null; describedBy: string | null; html: string }> {
    await page.goto(`/project/${projectId}/documentation`, { waitUntil: 'domcontentloaded' });
    const menu = page.locator('[data-documentation-export-menu]');
    await expect(menu).toBeVisible({ timeout: 90000 });
    const button = page.getByRole('button', { name: /Export Confluence/ });
    await expect.poll(async () => {
      if (!(await button.isVisible())) await menu.click();
      return button.isVisible();
    }, { timeout: 90000 }).toBe(true);
    const state = await button.getAttribute('data-export-confluence');
    const describedBy = await button.getAttribute('aria-describedby');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), button.click()]);
    const file = path.join(os.tmpdir(), `cc-doc-stale-${projectId}.html`);
    await download.saveAs(file);
    const html = fs.readFileSync(file, 'utf8');
    fs.unlinkSync(file);
    return { state, describedBy, html };
  }

  test('a stale documentation is exportable, and the menu and the file both say it is stale', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);

    const { state, describedBy, html } = await exportFrom(page, STALE_ID);
    // The premise: the workflow contract calls this documentation stale.
    expect(state).toBe('stale');

    const note = page.locator('[data-confluence-stale-note]');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Stale — regenerate first');
    expect(describedBy).toBe('confluence-export-stale');

    expect(html, 'the stale export does not say it is stale').toContain('data-stale-export');
    expect(html).toContain('Regenerate it before relying on it.');
  });

  test('a current documentation exports without any stale note', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);

    const { state, html } = await exportFrom(page, CURRENT_ID);
    expect(state).toBe('current');
    await expect(page.locator('[data-confluence-stale-note]')).toHaveCount(0);
    expect(html, 'a current export was marked stale').not.toContain('data-stale-export');
  });
});
