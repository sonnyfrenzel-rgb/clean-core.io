import { test, expect } from '@playwright/test';
import { getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminGetDoc, adminMergeDoc } from './helpers/admin-seed';
import { receiptFor } from './helpers/test-receipt';
import { buildProjectDecision } from '../lib/project-decision-build';
import { SELF_DECLARATION } from '../lib/project-decision';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { ECONOMICS_START_INPUTS, serializeEconomics } from '../lib/economics-record';
import { initialCostAssumptions } from '../components/tco/OptionComparison';

/**
 * Owner report, 12.10.2026 — the Delivery tool after he downloaded the signed
 * audit pack of a project ready for handover: the evidence chain still said
 * "Audit pack not sealed yet", the Audit pack card "Last sealed: Never", the
 * still-needed list held the pack with a link to the page he was on, and the
 * next-step card above all of it said "Nothing open — hand the package to
 * operations". The server had sealed the pack; the page had read the project
 * once and never again.
 *
 * Rendered, against the emulators and the real routes: the run is signed by
 * `/api/runs/create`, the figures stored by the cost-assumptions route, and the
 * pack sealed by `/api/audit-pack/create` when the button is pressed. Everything
 * else a finished project has is written the way the stages leave it. No model
 * is called. The page is never reloaded between the two halves.
 */

// The source `seedStageProject` stores, so the signed run reads the same code.
const SOURCE = 'REPORT z_style.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';

test.describe.configure({ mode: 'serial' });

let acct: SeededProject;

test.beforeAll(async ({ request }) => {
  test.setTimeout(180_000);
  acct = await seedStageProject({ prefix: 'sealed', acceptTerms: true });
  const user = getAuth(getApps().find((a) => a.name === '[DEFAULT]')).currentUser;
  if (!user) throw new Error('the seeded account is not signed in');
  const headers = { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' };

  // A signed run of the source on the project — the pack is sealed against it.
  const run = await request.post('/api/runs/create', {
    headers,
    data: { projectId: acct.projectId, legacyCode: SOURCE, analysis: '', uploadedFileName: 'z_style.abap' },
  });
  expect(run.status(), await run.text()).toBe(200);
  const runId = (await adminGetDoc('projects', acct.projectId))?.activeRunId as string;
  expect(runId).toBeTruthy();

  // What a finished project carries: a signed-off design, code, documentation
  // read from the code, a suite with a receipt that covers it, a confirmed
  // decision bound to this run.
  const bpmn = buildBpmnExportFromSource(SOURCE, { processName: 'z_style.abap', sourceFileName: 'z_style.abap' });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(SOURCE), null), fileName: 'z_style.abap' });
  const artefacts = {
    activeRunId: runId,
    solutionDesign: '# Target architecture\n\nSide-by-side on SAP BTP.\n',
    approvedByArchitect: true,
    targetArchitecture: 'cap',
    approvedBy: acct.email,
    architectSignOffAt: new Date().toISOString(),
    generatedCode: 'export const ok = true;\n',
    testSuite: { code: "import { test } from 'node:test';\ntest('t1', () => {});\n" },
    testCases: [{ id: 't1', name: 'Case', category: 'Unit', description: 'd', priority: 'High', status: 'Passed' }],
    documentation: JSON.stringify(buildProcessDocumentation({ source: SOURCE, map })),
  };
  const decision = buildProjectDecision({
    summary: 'Build this object as Side-by-Side BTP (CAP), as the signed-off target architecture says.',
    runId, evidenceDigest: 'digest', contract: null, assumptions: null, comparison: null,
    chosenOptionId: null, need: { revision: null, confirmedDrops: 0, undecided: null }, handedOver: false,
    timeline: { draftedAt: new Date().toISOString() },
  });
  await adminMergeDoc('projects', acct.projectId, {
    ...artefacts,
    testRunReceipt: receiptFor(artefacts),
    decision: { ...decision, status: 'confirmed', confirmation: { account: acct.email, at: new Date().toISOString(), selfDeclaration: SELF_DECLARATION } },
  });

  // A cost scenario, through the route that stores one.
  const figures = JSON.parse(
    serializeEconomics({
      assumptions: { ...initialCostAssumptions(), currency: 'EUR', devDayRate: 820, testDayRate: 640, horizonYears: 5 },
      inputs: { ...ECONOMICS_START_INPUTS, oneTimeBudget: 40000 },
    }),
  );
  const cost = await request.post(`/api/projects/${acct.projectId}/cost-assumptions`, { headers, data: figures });
  expect(cost.status(), await cost.text()).toBe(200);
});

test('downloading the pack seals it on the page at once: chain, card, list and next step move together', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, acct);
  await page.goto(`/project/${acct.projectId}/delivery`, { waitUntil: 'domcontentloaded' });

  const next = page.locator('[data-handover-next]');
  const needed = page.locator('[data-still-needed-item]');
  const chainDelivery = page.locator('[data-chain-group="delivery"]');
  const card = page.locator('#audit-pack');
  await expect(next).toBeVisible({ timeout: 90_000 });

  // Before: the one thing open is the pack, and the card asks for exactly that.
  await expect(needed, `still needed: ${await needed.allInnerTexts()}`).toHaveCount(1);
  await expect(page.locator('[data-still-needed-item="audit-pack"]')).toBeVisible();
  const here = page.locator('[data-still-needed-item="audit-pack"] a');
  await expect(here).toHaveText(/On this page/);
  await expect(here).toHaveAttribute('href', '#audit-pack');
  await expect(next).toHaveAttribute('data-handover-next', 'seal');
  await expect(next).toContainText('Download the signed audit pack');
  await expect(next).not.toContainText('Nothing open');
  await expect(chainDelivery).toContainText('Audit pack not sealed yet.');
  await expect(card).toContainText('Never');
  await expect(card).toContainText('The first download of this run seals it.');

  const download = page.waitForEvent('download');
  await next.locator('[data-handover-next-download]').click();
  await download;

  // After, without a reload: sealed everywhere the page says it.
  await expect(next).toHaveAttribute('data-handover-next', 'none', { timeout: 60_000 });
  await expect(next).toContainText('Nothing open — hand the package to operations');
  await expect(next).toContainText(/Audit pack sealed on \d{4}-\d{2}-\d{2}/);
  await expect(needed).toHaveCount(0);
  await expect(chainDelivery).toContainText('Audit pack sealed and downloaded.');
  await expect(card).not.toContainText('Never');
  await expect(card).toContainText(/\d{4}-\d{2}-\d{2}/);
  await expect(page.locator('[data-audit-pack-seal-missing]')).toHaveCount(0);

  // The server wrote it, for this run — the page did not make it up.
  const stored = await adminGetDoc('projects', acct.projectId);
  expect(typeof stored?.auditMetadata?.auditPackExportedAt).toBe('string');
  expect(stored?.auditMetadata?.auditPackExportedRunId).toBe(stored?.activeRunId);
});
