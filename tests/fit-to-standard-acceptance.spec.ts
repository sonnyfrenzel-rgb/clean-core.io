/**
 * Roadmap 3.0.20, step F10 — the path "standard adoption" end to end, with its
 * negative probes (`docs/design/fit-to-standard-concept.md` §8 F10).
 *
 * One shipped case (Z_SD_DELIVERY_PRIORITY, Public Edition) through every step
 * the product takes on this path, each step the module the route or the screen
 * calls: the gate offers after Analyze → the engine's design → a model proposal
 * with a wrong SAP identifier → the account's confirmation → the decision
 * "Move to SAP standard" → the phase contract → the package without code.
 * Probes: the wrong ID, a new run after the confirmation, the decision
 * withdrawn, code generated against the decision.
 *
 * Server-free: the same pure modules, no Firestore. The rendered walk through
 * the screens needs the emulators and a signed run, and is the owner's.
 */
import { test, expect } from '@playwright/test';
import { readFitToStandard, designFromReading } from '../lib/fit-to-standard-read';
import { applyFitProposals } from '../lib/fit-to-standard-proposal';
import { applyFitChoices, confirmedFitDesign, fitConditions, summaryOf, type FitToStandardRevision } from '../lib/fit-to-standard-store';
import { countEntries, fitDesignSummary } from '../lib/fit-to-standard-design';
import { buildFitPackage, fitConditionLines, FIT_PACKAGE_PATHS } from '../lib/fit-to-standard-package';
import { buildKeyUserSteps } from '../lib/key-user-steps';
import { workflowSteps, workflowSummary } from '../lib/workflow-steps';
import { decisionOptionsView } from '../lib/decision-option-signals';
import { deriveDecisionDraft, type DecisionDraftFacts } from '../lib/decision-draft';
import { SELF_DECLARATION } from '../lib/project-decision';
import { createDeliveryBundle, finishDeliveryPackage } from '../lib/delivery-package';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { catalogSnapshotKeyForProject } from '../lib/abap/catalog-snapshots';
import { loadSapNameLists } from '../lib/sap-identifiers';
import { sha256Hex } from '../lib/artefact-digest';
import type { HandoverProject } from '../lib/handover';
import type { Project } from '../lib/types';
import { readExample } from './helpers/starter-example-files';

const FILE = 'Z_SD_DELIVERY_PRIORITY.abap';
const SOURCE = readExample(FILE);
const SHA = sha256Hex(SOURCE);
const RUN = 'run-acceptance-1';

const draftFacts = (runId: string): DecisionDraftFacts => ({
  runId,
  evidenceDigest: 'e'.repeat(64),
  runSignedAt: '2026-10-21T08:00:00.000Z',
  contract: null,
  signedOffArchitecture: 'standard',
  signOff: { by: 'owner@example.invalid', at: '2026-10-21T09:00:00.000Z', reason: 'The fit-to-standard workshop confirmed the design.', notCurrent: null },
  need: { revision: 2, confirmedDrops: 1, undecided: 0 },
  handedOver: false,
  stored: undefined,
  now: '2026-10-21T11:00:00.000Z',
});
const confirmedDecision = (runId = RUN) => ({
  ...deriveDecisionDraft(draftFacts(runId)).draft,
  status: 'confirmed',
  confirmation: { account: 'owner@example.invalid', at: '2026-10-21T11:05:00.000Z', selfDeclaration: SELF_DECLARATION },
});

test.beforeAll(async () => {
  await loadSapNameLists();
});

test('standard adoption, end to end — and every probe falls back to the honest reading', () => {
  // 1. Analyze → the offer.
  const reading = readFitToStandard({
    source: SOURCE, fileName: FILE, edition: 'public', catalogSnapshot: catalogSnapshotKeyForProject({ s4Deployment: 'public' }),
    engineVersion: 'v3.0.19', mode: 'project', hasRun: true, analyzeState: 'done', signedSourceSha256: SHA,
  });
  expect(reading.gate).toMatchObject({ outcome: 'offered', primary: 'A' });

  // 2. The engine's design (revision 1).
  const design = designFromReading(reading, false)!;
  expect(design.counts.gapKeyUser).toBe(1);
  const open = design.entries.find((e) => e.disposition === 'gap-open')!;
  expect(open).toBeDefined();

  // 3. Probe: a model proposes a wrong SAP ID for the open step — dropped, SAP's title beside it.
  const proposal = applyFitProposals(design.entries, { proposals: [{ elementId: open.elementId, kind: 'fiori-app', id: 'F2358', title: 'Process Collections Worklist' }] });
  expect(proposal.kept).toBe(0);
  expect(proposal.dropped[0]).toMatchObject({ id: 'F2358', sapTitle: 'Monitor Purchase Order Items' });
  expect(proposal.entries.find((e) => e.elementId === open.elementId)!.disposition).toBe('gap-open');

  // 4. The account confirms after the workshop: the open step is given up.
  const entries = applyFitChoices(proposal.entries, [{ elementId: open.elementId, disposition: 'given-up' }]);
  const revision: FitToStandardRevision = {
    formatVersion: 1, revision: 3, kind: 'confirmation', runId: RUN, sourceSha256: SHA, edition: 'public', engineVersion: 'v3.0.19',
    gateClasses: design.gateClasses, againstGate: null, entries, counts: countEntries(entries), createdBy: { uid: 'u1', name: 'Owner' },
    createdAt: '2026-10-21T10:30:00.000Z',
  };
  const fitToStandard = summaryOf(revision, 2);
  expect(fitConditions(entries).every((c) => c.basis === 'stated')).toBe(true);

  // 5. The decision "Move to SAP standard", confirmed on the current run → the phase contract.
  const project = {
    id: 'p-acc', name: 'Z_SD_DELIVERY_PRIORITY', userId: 'u1', legacyCode: SOURCE, activeRunId: RUN, cleanCoreScore: 82,
    s4Deployment: 'public', analyzerVersion: 'v3.0.19', extensibilityRoute: 'ABAP Cloud (on-stack)', documentation: '# Process documentation',
    decision: confirmedDecision(), fitToStandard,
    auditMetadata: { inputFingerprint: { sha256: SHA, fileName: FILE, lineCount: 132, byteSize: SOURCE.length, uploadedAt: '2026-10-21T07:00:00.000Z', objectType: 'Report' } },
  } as unknown as Project;
  const steps = workflowSteps(project);
  const at = Object.fromEntries(steps.map((s) => [s.key, s]));
  expect(at.transformation.state).toBe('not-applicable');
  expect(at.testing.state).toBe('not-applicable');
  expect(at.design).toMatchObject({ state: 'done', proven: false });
  expect(at.delivery).toMatchObject({ state: 'done', proven: false, badge: 'Ready · decision, nothing built' });
  expect(workflowSummary(steps)).toMatchObject({ total: 5, notApplicable: 2 });

  // Management: the catalog candidate nobody confirmed keeps the standard option not determined;
  // confirmed as well, every step is resolved and it speaks for — Confirmed, never Proven.
  const standardCard = (p: Project) => decisionOptionsView({
    subject: 'Z_SD_DELIVERY_PRIORITY', mode: 'project', hasRun: true,
    fit: { state: 'not-determined', why: 'unread', reason: 'x', platform: 'public' },
    decision: null, status: null, confirmation: null, signOff: null, engineRoute: null, usage: null, economics: null,
    fitDesign: confirmedFitDesign(p),
  }).cards.find((c) => c.option === 'standard')!;
  expect(fitToStandard.unconfirmedCandidates).toBe(1);
  expect(standardCard(project)).toMatchObject({ signal: 'not-determined', provenance: 'confirmed' });
  const candidate = entries.find((e) => e.disposition === 'covered')!;
  const allConfirmed = applyFitChoices(entries, [{ elementId: candidate.elementId, disposition: 'covered' }]);
  const confirmedAll = { ...project, fitToStandard: summaryOf({ ...revision, entries: allConfirmed, counts: countEntries(allConfirmed) }, 2) } as unknown as Project;
  expect(standardCard(confirmedAll)).toMatchObject({ signal: 'for', provenance: 'confirmed' });

  // 6. The package without code.
  const facts = deliveryFactsOf(project as unknown as HandoverProject, {
    phases: steps, rules: ruleFactsOf(null, 'not read here.'), score: scoreFactsOf(project as unknown as HandoverProject, null),
    generatedAt: '2026-10-21T12:00:00.000Z', appVersion: 'v3.0.19', referenceSection: '## Reference patterns\n', documentationFromEngine: true,
  });
  const files = buildFitPackage({ projectName: 'Z_SD_DELIVERY_PRIORITY', sourceFileName: FILE, source: SOURCE, skeleton: reading.skeleton, revision, keyUserSteps: buildKeyUserSteps(reading.evidence.keyUser) });
  const bundle = createDeliveryBundle();
  bundle.folder('docs').file('process-documentation.md', '# Process documentation\n');
  const pkg = finishDeliveryPackage({ entries: bundle.entries, facts: { ...facts, standard: { files, conditions: fitConditionLines(revision), summary: fitDesignSummary(revision.counts) } }, layout: 'package' });
  const names = pkg.files.map((f) => f.path);
  for (const p of Object.values(FIT_PACKAGE_PATHS)) expect(names).toContain(p);
  expect(names.some((n) => /^src\//.test(n) || /\.(abap|ts|js|cds)$/.test(n))).toBe(false);
  expect(pkg.files.find((f) => f.path === 'docs/decision.md')!.content).toContain('Conditions — from the fit-to-standard design');

  // Probe: a new run after the confirmation — the design is no longer current, the phases read as before.
  const rerun = { ...project, activeRunId: 'run-acceptance-2' } as unknown as Project;
  expect(confirmedFitDesign(rerun)).toBeNull();
  const afterRerun = Object.fromEntries(workflowSteps(rerun).map((s) => [s.key, s]));
  expect(afterRerun.transformation.state).not.toBe('not-applicable');
  expect(afterRerun.testing.state).not.toBe('not-applicable');
  expect(afterRerun.delivery.badge).not.toContain('decision, nothing built');

  // Probe: the decision withdrawn (back to a draft) — the phases read as before at once.
  const withdrawn = { ...project, decision: { ...confirmedDecision(), status: 'draft', confirmation: undefined } } as unknown as Project;
  const afterWithdraw = Object.fromEntries(workflowSteps(withdrawn).map((s) => [s.key, s]));
  expect(afterWithdraw.transformation.state).toBe('empty');
  expect(afterWithdraw.testing.state).toBe('empty');

  // Probe: code generated against the decision — readable, marked, and not shipped.
  const generatedCode = JSON.stringify([{ path: 'src/zcl_prio.clas.abap', content: 'CLASS zcl_prio DEFINITION. ENDCLASS.' }]);
  const against = { ...project, generatedCode } as unknown as Project;
  const t = workflowSteps(against).find((s) => s.key === 'transformation')!;
  expect(t.badge).toBe('Against the decision on record');
  const bundle2 = createDeliveryBundle();
  bundle2.file('src/zcl_prio.clas.abap', 'CLASS zcl_prio DEFINITION. ENDCLASS.', 'generated');
  const pkg2 = finishDeliveryPackage({ entries: bundle2.entries, facts: { ...facts, standard: { files, conditions: [], summary: 'x' } }, layout: 'package' });
  expect(pkg2.files.map((f) => f.path)).not.toContain('src/zcl_prio.clas.abap');
});
