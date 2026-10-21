/**
 * Roadmap 3.0.20, step F6 — the phase state *not applicable*
 * (`docs/design/fit-to-standard-concept.md` §5.1–§5.5, §8 F6).
 *
 * Acceptance: on a confirmed standard decision on the current run,
 * Transformation and Testing are `not-applicable`, never `done` or green, and
 * excluded from `next` and `doneCount`; withdrawing the decision (or a new run)
 * restores them; code that exists anyway reads "against the decision"; the
 * tool bar marks them with a dash; Design is done on a confirmed
 * fit-to-standard design; Delivery's gaps follow the path.
 *
 * Server-free.
 */
import { test, expect } from '@playwright/test';
import { workflowSteps, workflowSummary, phaseTone, nextPhaseKey, toolOnRecord, type RailStep } from '../lib/workflow-steps';
import { toolMark, statusOfPhase } from '../lib/workspace-model';
import { deriveDecisionDraft, type DecisionDraftFacts } from '../lib/decision-draft';
import { SELF_DECLARATION } from '../lib/project-decision';
import { summaryOf, type FitToStandardRevision } from '../lib/fit-to-standard-store';
import { countEntries, type FitEntry } from '../lib/fit-to-standard-design';
import { sha256Hex } from '../lib/artefact-digest';
import type { Project } from '../lib/types';

const RUN_ID = 'run-1';
const SOURCE = "REPORT z_fit.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\nWRITE / 'x'.";
const SHA = sha256Hex(SOURCE);

const draftFacts = (architecture: string): DecisionDraftFacts => ({
  runId: RUN_ID,
  evidenceDigest: 'd'.repeat(64),
  runSignedAt: '2026-10-01T08:00:00.000Z',
  contract: null,
  signedOffArchitecture: architecture,
  signOff: { by: 'owner@example.invalid', at: '2026-10-02T08:00:00.000Z', reason: 'The standard covers it after the workshop.', notCurrent: null },
  need: { revision: 1, confirmedDrops: 0, undecided: 0 },
  handedOver: false,
  stored: undefined,
  now: '2026-10-03T10:00:00.000Z',
});
const decision = (architecture: string, status: 'confirmed' | 'draft' = 'confirmed') => ({
  ...deriveDecisionDraft(draftFacts(architecture)).draft,
  status,
  ...(status === 'confirmed'
    ? { confirmation: { account: 'owner@example.invalid', at: '2026-10-03T11:00:00.000Z', selfDeclaration: SELF_DECLARATION } }
    : {}),
});

const ENTRIES: FitEntry[] = [
  {
    elementId: 'gone', label: 'X', plainLabel: 'Own priority check', kind: 'task', anchor: { lineStart: 2, lineEnd: 2 }, anchorBasis: 'code',
    comparability: 'business-comparable', disposition: 'given-up', standardRef: null, evidenceLevel: 'E0', provenance: 'confirmed', why: '', gateClass: 'A', note: null,
  },
  {
    elementId: 'open', label: 'Y', plainLabel: 'Price check', kind: 'task', anchor: { lineStart: 3, lineEnd: 3 }, anchorBasis: 'code',
    comparability: 'business-comparable', disposition: 'gap-open', standardRef: null, evidenceLevel: 'E0', provenance: 'reconstructed', why: '', gateClass: null, note: null,
  },
];
const fitSummary = (kind: 'engine' | 'confirmation' = 'confirmation', runId = RUN_ID) => {
  const rev: FitToStandardRevision = {
    formatVersion: 1, revision: 2, kind, runId, sourceSha256: SHA, edition: 'public', engineVersion: 'v3.0.19',
    gateClasses: ['A'], againstGate: null, entries: ENTRIES, counts: countEntries(ENTRIES),
    createdBy: { uid: 'u1', name: 'Owner' }, createdAt: '2026-10-21T10:00:00.000Z',
  };
  return summaryOf(rev, null);
};

const base = (over: Record<string, unknown> = {}): Project =>
  ({
    id: 'p1',
    name: 'Z_FIT',
    legacyCode: SOURCE,
    activeRunId: RUN_ID,
    cleanCoreScore: 72,
    auditMetadata: { inputFingerprint: { sha256: SHA, fileName: 'z_fit.abap', lineCount: 3 } },
    ...over,
  }) as unknown as Project;

const byKey = (steps: RailStep[]) => Object.fromEntries(steps.map((s) => [s.key, s]));

test('a confirmed "Move to SAP standard" on the current run: Transformation and Testing are not applicable — never done, never green, never next', () => {
  const steps = workflowSteps(base({ decision: decision('standard') }));
  const s = byKey(steps);
  for (const key of ['transformation', 'testing'] as const) {
    expect(s[key].state).toBe('not-applicable');
    expect(s[key].done).toBe(false);
    expect(s[key].proven).toBe(false);
    expect(phaseTone(s[key])).toBe('none');
    expect(toolOnRecord(s[key])).toBe(false);
    expect(toolMark(s[key])).toEqual({ kind: 'dash', meaning: 'not-applicable', words: 'tools.mark.notApplicable' });
    expect(statusOfPhase(s[key])).toBe('not-started');
    expect(s[key].badge).toBe('Not applicable');
    expect(s[key].detail).toContain('moves the program to SAP standard — nothing is built or tested');
  }
  const summary = workflowSummary(steps);
  expect(summary.total).toBe(5);
  expect(summary.notApplicable).toBe(2);
  expect(['transformation', 'testing']).not.toContain(summary.next.key);
  expect(['transformation', 'testing']).not.toContain(nextPhaseKey(steps));
  // Never Analyze, Design, Documentation, Economics or Delivery.
  for (const key of ['analyze', 'design', 'documentation', 'tco', 'delivery'] as const) expect(s[key].state).not.toBe('not-applicable');
});

test('withdrawing the decision, a draft, another option or a new run restores the normal reading at once', () => {
  for (const project of [
    base(),
    base({ decision: decision('standard', 'draft') }),
    base({ decision: decision('cap') }),
    base({ decision: decision('standard'), activeRunId: 'run-2' }),
  ]) {
    const s = byKey(workflowSteps(project));
    expect(s.transformation.state).toBe('empty');
    expect(s.testing.state).toBe('empty');
    expect(workflowSummary(workflowSteps(project)).total).toBe(7);
  }
});

test('code generated before the decision stays readable, marked against the decision on record', () => {
  const generated = JSON.stringify([{ path: 'src/zcl_x.clas.abap', content: 'CLASS zcl_x DEFINITION. ENDCLASS.' }]);
  const s = byKey(workflowSteps(base({ decision: decision('standard'), generatedCode: generated })));
  expect(s.transformation.state).not.toBe('not-applicable');
  expect(s.transformation.badge).toBe('Against the decision on record');
  expect(s.transformation.detail).toContain('not shipped in the package');
});

test('Design is done on a confirmed fit-to-standard design on the current run — never proven; an unconfirmed or earlier one does not count', () => {
  const confirmed = byKey(workflowSteps(base({ decision: decision('standard'), fitToStandard: fitSummary() })));
  expect(confirmed.design).toMatchObject({ state: 'done', proven: false, badge: 'Fit-to-standard design confirmed' });
  expect(confirmed.design.detail).toContain('1 given up, 1 gap (0 key user, 0 organisational, 1 open)');
  const engineOnly = byKey(workflowSteps(base({ decision: decision('standard'), fitToStandard: fitSummary('engine') })));
  expect(engineOnly.design.state).toBe('empty');
  const earlier = byKey(workflowSteps(base({ decision: decision('standard'), fitToStandard: fitSummary('confirmation', 'run-0') })));
  expect(earlier.design.state).toBe('empty');
});

test('Delivery on the standard path: no fit-to-standard design is a gap; with it and the documentation it is ready — decision, nothing built, open gaps named, never green', () => {
  const without = byKey(workflowSteps(base({ decision: decision('standard'), documentation: '# Doc' })));
  expect(without.delivery.state).toBe('partial');
  expect(without.delivery.detail).toContain('no confirmed fit-to-standard design');
  const ready = byKey(workflowSteps(base({ decision: decision('standard'), documentation: '# Doc', fitToStandard: fitSummary() })));
  expect(ready.delivery).toMatchObject({ state: 'done', proven: false, badge: 'Ready · decision, nothing built · open gaps' });
  expect(phaseTone(ready.delivery)).toBe('unproven');
  expect(ready.delivery.detail).toContain('1 open gap stands as a condition of the decision');
  const summary = workflowSummary(workflowSteps(base({ decision: decision('standard'), documentation: '# Doc', fitToStandard: fitSummary() })));
  expect(summary.doneCount).toBeLessThanOrEqual(summary.total);
});
