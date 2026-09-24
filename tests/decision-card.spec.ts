import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { buildArchitectureContract, contractCoverage } from '../lib/architecture-contract';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { evidenceDigest } from '../lib/run-evidence-digest';
import { SELF_DECLARATION, normaliseProjectDecision } from '../lib/project-decision';
import { validateProjectCommand, type ProjectCommandState } from '../lib/project-commands';
import { deriveDecisionDraft, readStoredDecision, type DecisionDraftFacts } from '../lib/decision-draft';
import { conditionsSummary, decisionCardView } from '../lib/decision-card';
import { deriveProjectDecision } from '../lib/decision-facts';
import { PROCESS_STATE_COLLECTION } from '../lib/process-states';
import { PROCESS_REVISION_COLLECTION } from '../lib/process-revisions';

/**
 * Roadmap 8.4, second half — the "Open decision" card of the workspace
 * (mockup screen 5). Pure: the revision rule, the card's sentences and the
 * card's two-command confirmation are all function calls. The route and the
 * rendered card are covered by `tests/project-access-matrix.spec.ts` and
 * `tests/mfa-trust-chain-gate.spec.ts`, which need a server.
 */

const SOURCE = `REPORT z_mm_report.
DATA: lv_c TYPE i.
SELECT COUNT(*) FROM ekpo INTO lv_c.
WRITE lv_c.
`;

function contractFixture() {
  const evidence = buildAbapEvidence(SOURCE, 'Z_TEST.abap', 'public');
  const route = routeExtensibility(evidence, 'public');
  return buildArchitectureContract({
    contractId: 'AC-1',
    runId: 'run-1',
    inputManifest: buildInputManifest(
      analysisRunInputs({
        sourceSha256: 'a'.repeat(64),
        deploymentTarget: 'public',
        catalogVersion: '2026.FPS01',
        rulesetVersion: 'rules-v1.0',
        engineVersion: '2.15.0',
        model: null,
      }),
      null,
    ),
    evidence,
    route,
  });
}

const RUN = {
  inputFingerprint: { sha256: 'a'.repeat(64), lineCount: 4 },
  evidenceReport: [{ id: 'f1' }],
  originalRecommendation: 'In-App (ABAP Cloud)',
  rulesetVersion: 'rules-v1.0',
  sapApiCatalogVersion: 'catalog-1',
  analyzerVersion: 'engine-1',
  runHash: 'b'.repeat(64),
};
const DIGEST = evidenceDigest(RUN);

const facts = (over: Partial<DecisionDraftFacts> = {}): DecisionDraftFacts => ({
  runId: 'run-1',
  evidenceDigest: DIGEST,
  runSignedAt: '2026-09-20T08:00:00.000Z',
  contract: contractFixture(),
  signedOffArchitecture: 'rap',
  need: { revision: 4, confirmedDrops: 0, undecided: 0 },
  handedOver: false,
  stored: undefined,
  now: '2026-09-24T10:00:00.000Z',
  ...over,
});

const ACTOR = { email: 'owner@example.invalid', now: '2026-09-24T11:00:00.000Z' };

/**
 * The project document as the commands route hands it to `validateProjectCommand`,
 * with the fingerprint the route derives from the same project
 * (`deriveProjectDecision()` → `deriveDecisionDraft()` over these facts).
 */
const stateWith = (decision: unknown, derivedFrom: DecisionDraftFacts = facts()): ProjectCommandState =>
  ({
    activeRunId: 'run-1',
    activeRunEvidence: DIGEST,
    decision,
    derivedDecisionFingerprint: deriveDecisionDraft({ ...derivedFrom, stored: decision }).draft.fingerprint,
  }) as ProjectCommandState;

test.describe('8.4 card — what the draft binds on this project', () => {
  test('the fixture contract is not blocked, so the tests below test the card and not a blocked contract', () => {
    expect(contractCoverage(contractFixture()).state).not.toBe('blocked');
  });

  test('no sign-off: the option is not determined, the draft is blocked, and the card will not confirm it', () => {
    const { draft } = deriveDecisionDraft(facts({ signedOffArchitecture: null }));
    const view = decisionCardView(draft);
    const option = view.bindings.find((b) => b.key === 'option')!;
    expect(option.value).toBeNull();
    expect(option.reason).toContain('No option is chosen');
    expect(view.coverage.state).toBe('blocked');
    expect(view.confirmable).toBe(false);
    expect(view.summary).toContain('No target architecture is signed off');
  });

  test('a recommendation that was never signed off is not read as an option', () => {
    // `signedOffArchitecture` is only set by the route when approvedByArchitect
    // is true; an unknown code must not become an option either.
    const { draft } = deriveDecisionDraft(facts({ signedOffArchitecture: 'something-else' }));
    expect(draft.bindings.find((b) => b.key === 'option')!.revision).toBeNull();
  });

  test('the cost revision is never invented: not determined, with 7.4\'s reason', () => {
    const { draft } = deriveDecisionDraft(facts());
    const cost = decisionCardView(draft).bindings.find((b) => b.key === 'cost')!;
    expect(cost.value).toBeNull();
    expect(cost.provenance).toBe('not-determined');
    expect(cost.reason).toContain('No cost assumptions were stated');
  });

  test('a signed-off RAP target binds the option, is reversible inside this product, and can be confirmed', () => {
    const { draft } = deriveDecisionDraft(facts());
    const view = decisionCardView(draft);
    expect(view.bindings.find((b) => b.key === 'option')!.value).toBe('rap · In-App ABAP Cloud (RAP)');
    expect(view.bindings.find((b) => b.key === 'need')!.value).toBe('need/r4');
    expect(draft.reversibility.answer).toBe('reversible');
    expect(view.reversible.answer).toMatch(/^Yes, inside this product/);
    expect(view.coverage.state).toBe('qualified');
    expect(view.confirmable).toBe(true);
    expect(view.identity).toBe('DEC-1 · revision 1');
    expect(view.selfDeclaration).toBe(SELF_DECLARATION);
  });

  test('an option the comparison does not carry still has a kind — reversibility does not claim none is chosen', () => {
    const { draft } = deriveDecisionDraft(facts({ signedOffArchitecture: 'retire', handedOver: true, need: { revision: 2, confirmedDrops: 3, undecided: 0 } }));
    expect(draft.reversibility.answer).toBe('irreversible');
    expect(decisionCardView(draft).reversible.answer).toBe('No');
  });

  test('a need that could not be counted is not reported as "0 undecided"', () => {
    const { draft } = deriveDecisionDraft(facts({ need: { revision: null, confirmedDrops: 0, undecided: null } }));
    const need = draft.bindings.find((b) => b.key === 'need')!;
    expect(need.revision).toBeNull();
    expect(need.notDeterminedReason).not.toMatch(/\b0 element/);
    expect(need.notDeterminedReason).toContain('has not been reconstructed');
    expect(draft.conditions.find((c) => c.id === 'need:undecided')).toBeUndefined();
  });

  test('undecided elements become an open condition, and the summary counts it', () => {
    const { draft } = deriveDecisionDraft(facts({ need: { revision: null, confirmedDrops: 0, undecided: 5 } }));
    const view = decisionCardView(draft);
    expect(draft.conditions.some((c) => c.id === 'need:undecided' && c.status === 'open')).toBe(true);
    expect(view.conditionsSummary).toMatch(/^\d+ open/);
    expect(view.dialogLines.join(' ')).toMatch(/stay(s)? open and (is|are) shown with the decision/);
  });

  test('no conditions is a sentence, not a zero', () => {
    expect(conditionsSummary([])).toMatch(/^None/);
    expect(conditionsSummary([])).not.toMatch(/\b0\b/);
  });

  test('the dialog names every binding it binds and every one it could not', () => {
    const { draft } = deriveDecisionDraft(facts());
    const lines = decisionCardView(draft).dialogLines;
    expect(lines[0]).toContain('option rap');
    expect(lines.join(' ')).toContain('Not determined, and confirmed as such: cost revision');
    expect(lines).toContain('A later change is a new revision, not an edit.');
  });
});

test.describe('8.4 card — a later change is a new revision', () => {
  test('nothing moved: the stored record is the draft, same revision, same fingerprint', () => {
    const first = deriveDecisionDraft(facts());
    const stored = { ...first.draft, status: 'draft', confirmation: null };
    const again = deriveDecisionDraft(facts({ stored, now: '2026-09-25T09:00:00.000Z' }));
    expect(again.unchanged).toBe(true);
    expect(again.draft.revision).toBe(1);
    expect(again.draft.fingerprint).toBe(first.draft.fingerprint);
  });

  test('the evidence moved: the draft is the next revision, drafted now', () => {
    const first = deriveDecisionDraft(facts());
    const stored = { ...first.draft, status: 'confirmed', confirmation: { account: 'a@b.c', at: 'x', selfDeclaration: SELF_DECLARATION } };
    const moved = deriveDecisionDraft(
      facts({ stored, need: { revision: 5, confirmedDrops: 0, undecided: 0 }, now: '2026-09-25T09:00:00.000Z' }),
    );
    expect(moved.unchanged).toBe(false);
    expect(moved.draft.revision).toBe(2);
    expect(moved.stored?.status).toBe('confirmed');
    expect(moved.draft.timeline.find((e) => e.kind === 'decision-drafted')?.at).toBe('2026-09-25T09:00:00.000Z');
  });

  test('a withdrawn decision is not confirmed again under its old number', () => {
    const first = deriveDecisionDraft(facts());
    const stored = { ...first.draft, status: 'withdrawn', confirmation: null };
    const next = deriveDecisionDraft(facts({ stored }));
    expect(next.unchanged).toBe(false);
    expect(next.draft.revision).toBe(2);
  });

  test('a record that cannot be read back is treated as absent, not trusted', () => {
    const first = deriveDecisionDraft(facts());
    const tampered = { ...first.draft, fingerprint: 'f'.repeat(64) };
    expect(readStoredDecision(tampered)).toBeNull();
    expect(deriveDecisionDraft(facts({ stored: tampered })).draft.revision).toBe(1);
  });
});

test.describe('8.4 card — a confirmation derives from the transaction it commits in', () => {
  // QA review of 8adfa0e6db63: the confirmation read the project in its
  // transaction but derived the decision from ordinary reads of the run, the
  // newest need revision and the baseline — a need revision written between
  // those reads and the commit left the confirmation bound to the one before.
  test('given a transaction, every read of the derivation goes through it', async () => {
    const direct: string[] = [];
    const viaTx: string[] = [];
    const nothing = { empty: true, docs: [], exists: false, data: () => undefined };
    type Node = { path: string; collection: (c: string) => Node; doc: (d: string) => Node; orderBy: () => Node; limit: () => Node; get: () => Promise<typeof nothing> };
    const node = (p: string): Node => ({
      path: p,
      collection: (c) => node(`${p}/${c}`),
      doc: (d) => node(`${p}/${d}`),
      orderBy: () => node(`${p}?newest`),
      limit: () => node(p),
      get: async () => {
        direct.push(p);
        return nothing;
      },
    });
    const db = { collection: (c: string) => node(c) };
    const tx = {
      get: async (r: Node) => {
        viaTx.push(r.path);
        return nothing;
      },
    };
    const derived = await deriveProjectDecision(
      db as unknown as Parameters<typeof deriveProjectDecision>[0],
      'p1',
      { legacyCode: SOURCE, activeRunId: 'run-1' },
      '2026-09-24T12:00:00.000Z',
      tx as unknown as Parameters<typeof deriveProjectDecision>[4],
    );
    expect(derived.ok).toBe(true);
    expect(direct, 'read outside the transaction').toEqual([]);
    expect(viaTx).toEqual([
      'projects/p1/runs/run-1',
      `projects/p1/${PROCESS_STATE_COLLECTION}?newest`,
      `projects/p1/${PROCESS_REVISION_COLLECTION}/1`,
    ]);
  });

  test('the command route hands its transaction to the derivation', () => {
    const route = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/projects/[projectId]/commands/route.ts'), 'utf8');
    expect(route).toMatch(/deriveProjectDecision\(db, projectId, project, new Date\(\)\.toISOString\(\), tx\)/);
  });
});

test.describe('8.4 card — the two commands the card sends', () => {
  test('record the draft, then confirm it with the fingerprint and the run the card showed', () => {
    const { draft } = deriveDecisionDraft(facts());
    const recorded = validateProjectCommand({ command: 'record-decision-draft', decision: draft }, stateWith(undefined), ACTOR);
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    const onProject = recorded.fields.decision;

    const confirmed = validateProjectCommand(
      {
        command: 'confirm-decision',
        expectedDecisionFingerprint: draft.fingerprint,
        expectedRunId: 'run-1',
        expectedEvidenceDigest: DIGEST,
      },
      stateWith(onProject),
      ACTOR,
    );
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const record = readStoredDecision(confirmed.fields.decision);
    expect(record?.status).toBe('confirmed');
    expect(record?.confirmation?.account).toBe(ACTOR.email);
    expect(record?.confirmation?.selfDeclaration).toBe(SELF_DECLARATION);

    // And the card, reading it back, finds nothing moved.
    const again = deriveDecisionDraft(facts({ stored: confirmed.fields.decision }));
    expect(again.unchanged).toBe(true);
  });

  test('a blocked draft is refused by the server too — the disabled button is not the only guard', () => {
    const { draft } = deriveDecisionDraft(facts({ signedOffArchitecture: null }));
    const recorded = validateProjectCommand({ command: 'record-decision-draft', decision: draft }, stateWith(undefined), ACTOR);
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    const refused = validateProjectCommand(
      {
        command: 'confirm-decision',
        expectedDecisionFingerprint: draft.fingerprint,
        expectedRunId: 'run-1',
        expectedEvidenceDigest: DIGEST,
      },
      stateWith(recorded.fields.decision, facts({ signedOffArchitecture: null })),
      ACTOR,
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.status).toBe(409);
    expect(refused.code).toBe('decision-blocked');
  });

  // QA review of 4b4586aff273: `record-decision-draft` checks a record's shape
  // and fingerprint, not where its bindings came from. A record with the right
  // run and evidence but a contract, conditions and reversibility of the
  // sender's choosing could be confirmed.
  test('a record the server did not derive is not confirmed, however well-formed', () => {
    const { draft } = deriveDecisionDraft(facts());
    const forged = normaliseProjectDecision({
      ...draft,
      fingerprint: undefined,
      bindings: draft.bindings.map((b) =>
        b.key === 'contract' ? { ...b, revision: 'AC-9/r1@run-1+000000000000', notDeterminedReason: null } : b,
      ),
      conditions: [],
      reversibility: { answer: 'reversible', boundary: null, reason: 'Nothing here is hard to undo.' },
    });
    expect(forged.ok, forged.ok ? '' : forged.error).toBe(true);
    if (!forged.ok) return;
    expect(forged.decision.boundRunId).toBe('run-1');
    expect(forged.decision.boundEvidenceDigest).toBe(DIGEST);

    const recorded = validateProjectCommand({ command: 'record-decision-draft', decision: forged.decision }, stateWith(undefined), ACTOR);
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    const confirm = {
      command: 'confirm-decision',
      expectedDecisionFingerprint: forged.decision.fingerprint,
      expectedRunId: 'run-1',
      expectedEvidenceDigest: DIGEST,
    };
    const refused = validateProjectCommand(confirm, stateWith(recorded.fields.decision), ACTOR);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe('decision-not-derived');

    // And a caller that supplies no derivation at all confirms nothing either.
    const underived = validateProjectCommand(
      confirm,
      { ...stateWith(recorded.fields.decision), derivedDecisionFingerprint: undefined },
      ACTOR,
    );
    expect(underived.ok).toBe(false);
    if (!underived.ok) expect(underived.code).toBe('decision-not-derived');
  });
});

test.describe('8.4 card — source guards', () => {
  const ROOT = path.resolve(__dirname, '..');
  const card = fs.readFileSync(path.join(ROOT, 'components/workspace/DecisionCard.tsx'), 'utf8');

  test('the card derives nothing itself: no contract, no evidence engine, no draft builder in the browser', () => {
    expect(card).not.toMatch(/from '@\/lib\/(architecture-contract|contract-build|project-decision-build|decision-draft|abap\/)/);
    expect(card).toContain('/decision`');
  });

  test('the card writes only through the commands route, and shows the server\'s refusal as an alert', () => {
    expect(card).toContain("command: 'record-decision-draft'");
    expect(card).toContain("command: 'confirm-decision'");
    expect(card).toContain('expectedDecisionFingerprint');
    expect(card).toContain('expectedEvidenceDigest');
    expect(card).not.toMatch(/setDoc|updateDoc|addDoc/);
    // `CcMessageStrip` with state="error" renders role="alert".
    expect(card).toMatch(/<CcMessageStrip state="error"/);
  });

  test('a refused confirmation that first saved the draft does not claim nothing was written', () => {
    // QA review of 4b4586aff273: the confirmation records the draft before it
    // confirms; a refusal of the second command left the draft written while
    // the strip said "Nothing was written."
    expect(card).toMatch(/record-decision-draft', decision: draft \}\);\s*draftSaved = true;/);
    expect(card).toMatch(/headline: draftSaved \? '[^']*draft was saved[^']*' : 'Nothing was written\.'/);
    expect(card).not.toMatch(/headline="Nothing was written\."/);
  });

  test('a command whose answer was lost is not reported as nothing written, and the decision is read again', () => {
    // QA review of 8adfa0e6db63: the server can commit and the answer still be
    // lost; fetch then rejects and the catch said "Nothing was written."
    const client = fs.readFileSync(path.join(ROOT, 'lib/project-command-client.ts'), 'utf8');
    expect(client).toMatch(/try \{\s*res = await fetch\([\s\S]*?\} catch \{\s*throw new CommandAnswerLostError\(/);
    const catches = card.split('} catch (err: unknown) {').slice(1);
    expect(catches.length).toBe(2);
    for (const c of catches) {
      const lost = c.indexOf('if (err instanceof CommandAnswerLostError)');
      expect(lost).toBeGreaterThanOrEqual(0);
      expect(lost).toBeLessThan(c.indexOf('Nothing was written.'));
    }
    const handler = card.slice(card.indexOf('const answerLost = useCallback('), card.indexOf('const confirm = useCallback('));
    expect(handler).toContain('setReload((n) => n + 1);');
    expect(handler).not.toContain('Nothing was written');
  });

  test('no role is stored or sent: Management, Business and IT are views only', () => {
    expect(card).not.toMatch(/\b(role|view)\s*:\s*'(management|business|it)'/i);
  });

  test('the card is mounted in the Management view of the workspace only', () => {
    const shell = fs.readFileSync(path.join(ROOT, 'components/workspace/WorkspaceShell.tsx'), 'utf8');
    expect(shell).toMatch(/view === 'management' && \(\s*<div[^>]*>\s*<DecisionCard/);
  });
});
