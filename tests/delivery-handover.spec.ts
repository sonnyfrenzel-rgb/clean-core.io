import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  AUDIT_PACK_FILES,
  HANDOVER_LINKS,
  NOT_SIGNED,
  buildHandoverChain,
  chainSummary,
  confirmationsOf,
  handoverFacets,
  handoverGroups,
  handoverNextStep,
  handoverStatusLine,
  handoverStillNeeded,
  handoverTimeline,
  signedSourceOf,
  type HandoverProject,
} from '../lib/handover';
import { buildAuditPackContents } from '../lib/audit-pack-build';
import { workflowSteps, handoverBlockers, testEvidence } from '../lib/workflow-steps';
import { buildProjectDecision } from '../lib/project-decision-build';
import { SELF_DECLARATION } from '../lib/project-decision';
import { sha256Hex } from '../lib/artefact-digest';
import { receiptFor } from './helpers/test-receipt';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';

/**
 * The Delivery stage as the handover of mockup v2.8 screen 6 (roadmap 8.5):
 * the evidence chain of the whole project, the handover package, who confirmed
 * what, and the honest gaps.
 *
 * The pure half pins what `lib/handover.ts` may say. It reads, it never
 * decides what is signed — so the one thing it must not do is describe a pack
 * other than the one the server builds, and the first test holds that.
 */

const ROOT = path.resolve(__dirname, '..');
const PAGE = 'app/(app)/project/[projectId]/delivery/page.tsx';
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SOURCE = 'REPORT z_handover.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';

function project(extra: Record<string, unknown> = {}): HandoverProject {
  return {
    id: 'p1',
    name: 'Handover fixture',
    legacyCode: SOURCE,
    activeRunId: 'run-0001',
    createdAt: '2026-09-16T08:00:00.000Z',
    cleanCoreScore: 62,
    worklist: [],
    auditMetadata: {
      inputFingerprint: {
        sha256: sha256Hex(SOURCE), fileName: 'z_handover.abap', lineCount: 2, byteSize: SOURCE.length,
        uploadedAt: '2026-09-16T07:59:00.000Z', objectType: 'Report',
      },
      modelCard: { provider: null, model: null, modelParticipation: 'none', engineVersion: 'v2.20.0', byokUsed: false },
    },
    ...extra,
  } as HandoverProject;
}

test.describe('the handover reads what is on record', () => {
  test('the pack list on screen is the pack the server builds, file for file', () => {
    const contents = buildAuditPackContents({
      projectId: 'p1',
      runId: 'run-0001',
      run: { createdAt: '2026-09-16T08:00:00.000Z', worklist: [] },
      attested: {},
    });
    const onScreen = (kind: string) => AUDIT_PACK_FILES.filter((f) => f.kind === kind).map((f) => f.path).sort();
    expect(onScreen('signed')).toEqual(Object.keys(contents.signed).sort());
    expect(onScreen('attested')).toEqual(Object.keys(contents.attested).sort());
    expect(onScreen('manifest')).toEqual(['manifest.json']);
    // The grade is never part of the signed pack, and the screen says so.
    expect(NOT_SIGNED.join(' ')).toMatch(/level grade/);
  });

  test('every link is always there, in order, and an open link says why', () => {
    const empty = { id: 'p0', name: 'Empty', activeRunId: 'run-x' } as HandoverProject;
    const chain = buildHandoverChain(empty, workflowSteps(empty));
    expect(chain.map((l) => l.key)).toEqual([...HANDOVER_LINKS]);
    for (const l of chain) {
      if (l.state === 'open') {
        expect(l.value, `${l.key} is open and carries a value`).toBeNull();
        expect(l.missing, `${l.key} is open and does not say why`).toBeTruthy();
        expect(l.provenance).toBe('not-determined');
      }
    }
    // No cost figure is stored anywhere, so no simulation is claimed.
    expect(chain.find((l) => l.key === 'economics')!.state).toBe('open');
  });

  test('green is earned: only the signed run and its analysis are proven, generated work never', () => {
    const p = project({
      solutionDesign: '# Design', generatedCode: 'export const ok = 1;\n', documentation: '# Blueprint\n',
      testCases: [{ id: 't1', name: 'Case', category: 'Unit', status: 'Passed' }],
    });
    const chain = buildHandoverChain(p, workflowSteps(p));
    const proven = chain.filter((l) => l.provenance === 'proven').map((l) => l.key);
    expect(proven).toEqual(['run', 'analysis']);
    expect(chain.find((l) => l.key === 'transformation')!.provenance).toBe('proposed');
    // A `Passed` string a browser can write is not a run.
    expect(chain.find((l) => l.key === 'tests')!.provenance).toBe('not-determined');
    expect(chain.find((l) => l.key === 'design')!.provenance).toBe('proposed');
  });

  test('a recorded test run is a sandbox run against mocks, and says so', () => {
    const base = project({
      generatedCode: 'export const ok = 1;\n',
      testSuite: { code: "test('t1', () => {});" },
      testCases: [{ id: 't1', name: 'Case', category: 'Unit', status: 'Passed' }],
    });
    const p = { ...base, testRunReceipt: receiptFor(base) } as HandoverProject;
    const tests = buildHandoverChain(p, workflowSteps(p)).find((l) => l.key === 'tests')!;
    expect(tests.provenance).toBe('demonstrated-mock');
    expect(tests.missing).toContain('not against an SAP system');
    expect(confirmationsOf(p).map((c) => c.what)).toContain('Ran the test suite in the sandbox');
  });

  test('a recorded run with no pass or fail is not called "no run on record" (QA review of a88149856dcc)', () => {
    const base = project({
      generatedCode: 'export const ok = 1;\n',
      testSuite: { code: "test('t1', () => {});" },
      testCases: [{ id: 't1', name: 'Case', category: 'Unit', status: 'Not run' }],
    });
    const p = { ...base, testRunReceipt: receiptFor(base, [{ id: 't1', status: 'Error' }]) } as HandoverProject;
    const chain = buildHandoverChain(p, workflowSteps(p));
    const state = { blockers: [] as string[], exportedAt: null };
    // The status line on the same screen reads the receipt as a run…
    expect(handoverStatusLine(p, chain).find((s) => s.key === 'receipts')!.value).toBe('sandbox test run');
    // …so the receipt step does not deny it.
    const sub = handoverGroups(p, chain, state).find((g) => g.key === 'receipt')!.sub;
    expect(sub).not.toContain('no run on record');
    expect(sub).toContain('the recorded run returned no pass or fail');
    // Without a receipt the absence is still said.
    const none = project({ generatedCode: base.generatedCode, testSuite: base.testSuite, testCases: base.testCases });
    expect(handoverGroups(none, buildHandoverChain(none, workflowSteps(none)), state).find((g) => g.key === 'receipt')!.sub).toContain('no run on record');
  });

  test('a test suite written for a previous source says so on the receipt step, like the other steps (QA review of a88149856dcc)', () => {
    const changed = project({
      legacyCode: `${SOURCE}WRITE 'changed'.\n`,
      generatedCode: 'export const ok = 1;\n',
      testSuite: { code: "test('t1', () => {});" },
      testCases: [{ id: 't1', name: 'Case', category: 'Unit', status: 'Not run' }],
    });
    const phases = workflowSteps(changed);
    expect(phases.find((p) => p.key === 'testing')!.state).toBe('stale');
    const receipt = handoverGroups(changed, buildHandoverChain(changed, phases), { blockers: [], exportedAt: null }).find((g) => g.key === 'receipt')!;
    expect(receipt.provenance).toBe('stale');
    expect(receipt.sub).toContain('made for a previous source');
  });

  test('a confirmed decision names the account and stays a self-declaration', () => {
    const decision = buildProjectDecision({
      summary: 'Build this object as Side-by-Side BTP (CAP), as the signed-off target architecture says.',
      runId: 'run-0001', evidenceDigest: 'digest', contract: null, assumptions: null, comparison: null,
      chosenOptionId: null, need: { revision: null, confirmedDrops: 0, undecided: null }, handedOver: false,
      timeline: { draftedAt: '2026-09-17T09:00:00.000Z' },
    });
    const p = project({
      approvedByArchitect: true, targetArchitecture: 'cap', approvedBy: 'lead@example.com',
      architectSignOffAt: '2026-09-16T09:00:00.000Z',
      decision: { ...decision, status: 'confirmed', confirmation: { account: 'lead@example.com', at: '2026-09-17T10:00:00.000Z', selfDeclaration: SELF_DECLARATION } },
    });
    const link = buildHandoverChain(p, workflowSteps(p)).find((l) => l.key === 'decision')!;
    expect(link.provenance).toBe('confirmed');
    expect(link.by).toBe('lead@example.com');
    expect(link.value).toContain('DEC-1');
    const who = confirmationsOf(p);
    expect(who.map((c) => c.provenance)).toEqual(['confirmed', 'confirmed']);
    expect(who[0].what).toContain('Confirmed the target architecture');
    expect(handoverTimeline(p).map((e) => e.sentence)).toContain('Target architecture confirmed: Side-by-Side SAP BTP (CAP)');
  });

  // Codex code-trust-03: confirm for run A, then run B becomes the active run.
  test('a decision confirmed for a previous run is history, not the current decision', () => {
    const decision = buildProjectDecision({
      summary: 'Build this object as Side-by-Side BTP (CAP), as the signed-off target architecture says.',
      runId: 'run-0001', evidenceDigest: 'digest', contract: null, assumptions: null, comparison: null,
      chosenOptionId: null, need: { revision: null, confirmedDrops: 0, undecided: null }, handedOver: false,
      timeline: { draftedAt: '2026-09-17T09:00:00.000Z' },
    });
    const confirmed = { ...decision, status: 'confirmed', confirmation: { account: 'lead@example.com', at: '2026-09-17T10:00:00.000Z', selfDeclaration: SELF_DECLARATION } };
    const onRunA = project({ decision: confirmed });
    const onRunB = project({ decision: confirmed, activeRunId: 'run-0002' });
    // Every phase finished, so only the decision can still be open.
    const allDone = (p: HandoverProject) => workflowSteps(p).map((s) => ({ ...s, state: 'done' as const, done: true, proven: true }));

    const current = buildHandoverChain(onRunA, workflowSteps(onRunA));
    expect(current.find((l) => l.key === 'decision')!.provenance).toBe('confirmed');
    expect(handoverNextStep(onRunA, allDone(onRunA), [], current, 'p1').kind).toBe('none');

    const chain = buildHandoverChain(onRunB, workflowSteps(onRunB));
    const link = chain.find((l) => l.key === 'decision')!;
    expect(link.provenance).toBe('stale');
    expect(link.state).toBe('stale');
    expect(link.missing).toContain('previous analysis run');
    expect(handoverStillNeeded(onRunB, chain, { blockers: [], exportedAt: null }).map((n) => n.key)).toContain('decision');
    const next = handoverNextStep(onRunB, allDone(onRunB), [], chain, 'p1');
    expect(next.kind).toBe('open');
    expect(next.headline).toBe('Confirm the decision');
  });

  test('the next step blocks first, then names the first missing phase', () => {
    const changed = project({ legacyCode: `${SOURCE}* changed\n`, generatedCode: 'x' });
    const phases = workflowSteps(changed);
    const chain = buildHandoverChain(changed, phases);
    const blocked = handoverNextStep(changed, phases, handoverBlockers(changed), chain, 'p1');
    expect(blocked.kind).toBe('blocked');
    // A source the run did not read gets no BPMN: its line anchors would lie.
    expect(signedSourceOf(changed)).toBeNull();
    expect(signedSourceOf(project())).not.toBeNull();

    const fresh = project();
    const next = handoverNextStep(fresh, workflowSteps(fresh), [], buildHandoverChain(fresh, workflowSteps(fresh)), 'p1');
    expect(next.kind).toBe('open');
    if (next.kind === 'open') expect(next.href).toBe('/project/p1/design');
    expect(chainSummary(buildHandoverChain(fresh, workflowSteps(fresh))).of).toBe(9);
  });

  test('the object page: four steps over all nine links, and what is still needed names its tool', () => {
    const fresh = project({ solutionDesign: '# Design', extensibilityRoute: 'Side-by-Side (SAP BTP)' });
    const phases = workflowSteps(fresh);
    const chain = buildHandoverChain(fresh, phases);
    const state = { blockers: [] as string[], exportedAt: null };
    const groups = handoverGroups(fresh, chain, state);
    expect(groups.map((g) => g.label)).toEqual(['Requirement', 'Decision', 'Receipt', 'Delivery artefact']);
    // Every one of the nine links stands behind exactly one step.
    expect(groups.flatMap((g) => g.links.map((l) => l.key)).sort()).toEqual([...HANDOVER_LINKS].sort());
    const decision = groups.find((g) => g.key === 'decision')!;
    expect(decision.title).toBe('Side-by-Side on SAP BTP');
    expect(decision.sub).toBe('Recommended, not confirmed');
    // Nothing sealed: the package is not determined, never proven.
    expect(groups.find((g) => g.key === 'delivery')!.provenance).toBe('not-determined');
    expect(groups.find((g) => g.key === 'receipt')!.provenance).toBe('not-determined');

    const needed = handoverStillNeeded(fresh, chain, state);
    const keys = needed.map((n) => n.key);
    expect(keys).toEqual(expect.arrayContaining(['design', 'transformation', 'documentation', 'tests', 'economics', 'decision', 'audit-pack']));
    expect(keys).not.toContain('run');
    expect(needed.find((n) => n.key === 'decision')!.stage).toBe('management');

    const facets = handoverFacets(fresh, phases, chain, state);
    expect(facets.map((f) => f.value)).toEqual(['Not handed over', 'Available', 'Pending', 'No tests']);
    expect(facets[0].sub).toBe(`${needed.length} things a handover still needs`);
    expect(handoverStatusLine(fresh, chain).map((s) => `${s.label} ${s.value}`)).toEqual([
      'Run signed', 'Decision not confirmed', 'Receipts none', 'Engine v2.20.0 · no model',
    ]);

    // A sealed pack is not acceptance, and an untested suite never reads as a run.
    const sealed = { blockers: [] as string[], exportedAt: '2026-09-20T10:00:00.000Z' };
    expect(handoverFacets(fresh, phases, chain, sealed)[0].basis).toContain('delivery is not acceptance');
    expect(handoverStillNeeded(fresh, chain, sealed).map((n) => n.key)).not.toContain('audit-pack');
    const blocked = { blockers: ['the generated code'], exportedAt: '2026-09-20T10:00:00.000Z' };
    expect(handoverFacets(fresh, phases, chain, blocked)[0].value).toBe('Blocked');
    expect(handoverStillNeeded(fresh, chain, blocked).map((n) => n.key)).toContain('audit-pack');
  });

  test('the page speaks the product’s vocabulary, not the old score language', () => {
    const src = read(PAGE);
    for (const gone of ['Compliance tier', 'MEDIUM RISK', 'Board Presentation', 'Interactive Strategic Map', 'Integrity Report', 'Return to Dashboard', 'Compliance Audit Pack', 'Level 5']) {
      expect(src, `${gone} came back`).not.toContain(gone);
    }
    const deck = read('lib/board-deck.ts');
    expect(deck).not.toMatch(/'(HIGH|MEDIUM|LOW) RISK'|Compliance tier|Model Registry|Transformation Board/);
    // The chain is built by the module and only drawn by the page.
    expect(src).toContain('buildHandoverChain(hp, phases)');
    expect(src).toContain('data-handover-audit-pack');
  });
});

test.describe('the handover on screen', () => {
  test('nine links, the package and the signature, readable on a phone', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const acct = await seedStageProject({ prefix: 'handover', acceptTerms: true, rich: true });
    await adminMergeDoc('projects', acct.projectId, {
      approvedByArchitect: true, targetArchitecture: 'cap', approvedBy: acct.email,
      architectSignOffAt: '2026-09-16T09:00:00.000Z',
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/delivery`, { waitUntil: 'domcontentloaded' });

    const links = page.locator('[data-chain-link]');
    await expect(links).toHaveCount(9, { timeout: 60000 });
    // The pack's four steps lead; the nine links sit one level deeper (proposal A).
    await expect(page.locator('[data-chain-group]')).toHaveCount(4);
    await expect(page.locator('[data-chain-group="decision"]')).toContainText('Side-by-Side SAP BTP (CAP)');
    await expect(page.locator('[data-delivery-facet]')).toHaveCount(4);
    await expect(page.locator('[data-still-needed-item="economics"]')).toBeVisible();
    await page.locator('[data-chain-detail] [data-cc-disclosure-trigger]').click();
    await expect(page.locator('[data-chain-link="economics"]')).toHaveAttribute('data-chain-state', 'open');
    await expect(page.locator('[data-chain-link="design"]')).toContainText('Side-by-Side SAP BTP (CAP)');
    await expect(page.locator('[data-handover-next]')).toBeVisible();
    await expect(page.locator('[data-signature-covers]')).toContainText('Not signed');
    await expect(page.locator('[data-confirmations]')).toContainText(acct.email);
    await expect(page.getByText('MEDIUM RISK')).toHaveCount(0);
    await expect(page.getByText('Compliance tier', { exact: false })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(links.first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways at 390 px').toBeLessThanOrEqual(0);
  });
});

test('one verdict under a duplicated case id is counted once (QA review of a88149856dcc)', () => {
  const base = {
    activeRunId: 'run-0001',
    legacyCode: SOURCE,
    generatedCode: 'export const ok = 1;\n',
    testSuite: { code: "test('t1', () => {});" },
    testCases: [
      { id: 't1', name: 'Case', category: 'Unit', status: 'Passed' },
      { id: 't1', name: 'Same id', category: 'Unit', status: 'Passed' },
    ],
  };
  const p = { ...base, testRunReceipt: receiptFor(base, [{ id: 't1', status: 'Passed' }]) } as unknown as Parameters<typeof testEvidence>[0];
  const evidence = testEvidence(p);
  expect(evidence.total).toBe(2);
  // One run verdict cannot make two cases verified.
  expect(evidence.attestedPasses).toBe(1);
});
