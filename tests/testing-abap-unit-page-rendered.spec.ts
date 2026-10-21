import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';
import { buildRapScaffold } from '../lib/transformation';
import { planOf } from './helpers/transformation-scaffold';
import { OUTSIDE_RESULT_VERSION, outsideSubjectOf } from '../lib/sap-test-results';

/**
 * QA review of dd189e7328b2, db5b52a69e6a: the ABAP Unit evidence was rendered as a component and the page only
 * read in its source, so a condition around it on the Testing page would have hidden it unnoticed. Here the Testing
 * page itself, signed in, for an ABAP Cloud project with a result from the reader's SAP system on record: current,
 * it shows the passed-in-SAP count; for another package state, it says not known. Needs the dev server and the
 * Firebase emulators.
 */

const FIXTURE = path.join(__dirname, 'fixtures', 'golden-master', 'three-cases.abap');
const ROUTE = 'ABAP Cloud (RAP)';

test.describe.configure({ mode: 'serial' });

let acct: SeededProject;
let confirmed: Record<string, unknown>;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  acct = await seedStageProject({ prefix: 'abap-unit-page', acceptTerms: true });
  const { facts, plan } = planOf(fs.readFileSync(FIXTURE, 'utf8'));
  const scaffold = buildRapScaffold(plan, facts);
  const artefacts = {
    activeRunId: acct.runId,
    extensibilityRoute: ROUTE,
    generatedCode: JSON.stringify(scaffold.files.map((f) => ({ path: f.path, content: f.content }))),
    testCases: [{ id: 'TC_01', name: 'x', category: 'Unit', status: 'Passed' }],
  };
  confirmed = {
    v: OUTSIDE_RESULT_VERSION, kind: 'confirmed', subject: outsideSubjectOf(artefacts),
    recordedAt: '2026-10-18T10:00:00.000Z', recordedBy: acct.uid, scenarioCount: 1,
    passed: 70, failed: 4, skipped: 3, coverage: null, file: null, system: 'S4T', ranOn: '2026-10-18',
  };
  await adminMergeDoc(`projects/${acct.projectId}/runs`, acct.runId, { extensibilityRoute: ROUTE });
  await adminMergeDoc('projects', acct.projectId, { ...artefacts, outsideTestResult: confirmed });
});

test('the Testing page shows the passed-in-SAP count for a current result, and not known for a stale one', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, acct);
  await page.goto(`/project/${acct.projectId}/testing`, { waitUntil: 'domcontentloaded' });
  const block = page.locator('[data-testing-step="run"] [data-test-evidence-abap-unit]');
  await expect(block).toBeVisible({ timeout: 90_000 });
  await expect(block).toContainText('passed in SAP: 70 of 77 ABAP Unit test methods');
  await expect(block).not.toContainText('not known here');

  // The same result for another package state is out of date: the page says so.
  await adminMergeDoc('projects', acct.projectId, { outsideTestResult: { ...confirmed, subject: { ...(confirmed.subject as object), codeDigest: 'other' } } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(block).toBeVisible({ timeout: 90_000 });
  await expect(block).toContainText('passed in SAP: not known here');
});
