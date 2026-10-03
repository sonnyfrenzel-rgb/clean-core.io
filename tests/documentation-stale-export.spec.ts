import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import {
  buildEngineConfluenceHtml,
  buildLegacyConfluenceHtml,
  STALE_EXPORT_NOTE,
} from '../lib/documentation-export';
import { fixtureSource, processDocumentOf } from './helpers/business-layer-fixture';
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
 * Both halves are tested as data (the two templates) and in a browser, with a
 * real download, against one stale and one current project.
 */

const BLUEPRINT = {
  l1_domain: { name: 'Order to Cash', strategicGoal: 'Clean core', owner: 'Process Owner' },
  l2_group: { name: 'Sales', processArea: 'Order handling', kpis: ['Cycle time'] },
  l3_flow: [
    { id: 'Start', name: 'Trigger', type: 'startEvent', role: 'System', next: ['Task1'] },
    { id: 'Task1', name: 'Check order', type: 'serviceTask', role: 'System', next: ['End'] },
    { id: 'End', name: 'Done', type: 'endEvent', role: 'System', next: [] },
  ],
  l4_tasks: [
    {
      stepId: 'Task1', name: 'Check order', description: 'Checks the order.',
      inputs: ['Order'], outputs: ['Result'], systems: ['SAP S/4HANA'], complexity: 'Low',
    },
  ],
};

const ENGINE_DOC = processDocumentOf(fixtureSource());

test.describe('the Confluence templates say when they are stale', () => {
  test('a stale legacy blueprint export opens with the note; a current one does not', async () => {
    const stale = await buildLegacyConfluenceHtml(BLUEPRINT, null, { stale: true }).text();
    expect(stale).toContain('data-stale-export');
    expect(stale).toContain('Regenerate it before relying on it.');
    // Before the heading, so it is the first thing a reader of the file sees.
    expect(stale.indexOf('data-stale-export')).toBeLessThan(stale.indexOf('<h1>'));

    for (const current of [
      await buildLegacyConfluenceHtml(BLUEPRINT, null, { stale: false }).text(),
      await buildLegacyConfluenceHtml(BLUEPRINT, null).text(),
    ]) {
      expect(current).not.toContain('data-stale-export');
      expect(current).not.toContain('Regenerate it before relying on it.');
    }
  });

  test('a stale engine documentation export opens with the note; a current one does not', async () => {
    const stale = await buildEngineConfluenceHtml(ENGINE_DOC, null, { stale: true }).text();
    expect(stale).toContain('data-stale-export');
    expect(stale.indexOf('data-stale-export')).toBeLessThan(stale.indexOf('<h1>'));
    const current = await buildEngineConfluenceHtml(ENGINE_DOC, null).text();
    expect(current).not.toContain('data-stale-export');
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

  const ANALYSED = 'REPORT z_doc_stale.\nSELECT * FROM vbak INTO TABLE @DATA(lt_orders).\nWRITE lt_orders.\n';
  // The source written afterwards without a new run: every artefact built on
  // the analysed source is stale (`staleness()` in lib/workflow-steps.ts).
  const CHANGED = `${ANALYSED}WRITE 'changed'.\n`;

  const fingerprint = {
    sha256: sha256Hex(ANALYSED),
    fileName: 'Z_DOC_STALE.abap',
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

    const fields = (name: string, legacyCode: string) => ({
      name, userId: uid, createdAt: new Date(), status: 'documented',
      legacyCode,
      analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
      cleanCoreScore: 62,
      solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n',
      generatedCode: 'export const ok = true;\n',
      documentation: JSON.stringify(BLUEPRINT),
      activeRunId: RUN_ID,
      inputFingerprint: fingerprint,
    });
    await adminSetDoc('projects', STALE_ID, fields('Stale documentation fixture', CHANGED));
    await adminSetDoc('projects', CURRENT_ID, fields('Current documentation fixture', ANALYSED));
    for (const id of [STALE_ID, CURRENT_ID]) {
      await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
        runId: RUN_ID, projectId: id, userId: uid,
        createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
        inputFingerprint: fingerprint,
      });
    }
  });

  async function exportFrom(page: Page, projectId: string): Promise<{ button: ReturnType<Page['locator']>; html: string }> {
    await page.goto(`/project/${projectId}/documentation`, { waitUntil: 'domcontentloaded' });
    const button = page.getByRole('button', { name: /Export Confluence/ });
    await expect(button).toBeEnabled({ timeout: 90000 });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), button.click()]);
    const file = path.join(os.tmpdir(), `cc-doc-stale-${projectId}.html`);
    await download.saveAs(file);
    const html = fs.readFileSync(file, 'utf8');
    fs.unlinkSync(file);
    return { button, html };
  }

  test('a stale documentation is exportable, and the button and the file both say it is stale', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);

    const { button, html } = await exportFrom(page, STALE_ID);
    // The premise: the workflow contract calls this documentation stale.
    await expect(page.locator('[data-export-confluence]')).toHaveAttribute('data-export-confluence', 'stale');

    const note = page.locator('[data-confluence-stale-note]');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Stale — regenerate first');
    await expect(button).toHaveAttribute('aria-describedby', 'confluence-export-stale');

    expect(html, 'the stale export does not say it is stale').toContain('data-stale-export');
    expect(html).toContain('Regenerate it before relying on it.');
  });

  test('a current documentation exports without any stale note', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);

    const { html } = await exportFrom(page, CURRENT_ID);
    await expect(page.locator('[data-export-confluence]')).toHaveAttribute('data-export-confluence', 'current');
    await expect(page.locator('[data-confluence-stale-note]')).toHaveCount(0);
    expect(html, 'a current export was marked stale').not.toContain('data-stale-export');
  });
});
