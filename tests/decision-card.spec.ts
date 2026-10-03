import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { buildArchitectureContract, contractCoverage } from '../lib/architecture-contract';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { evidenceDigest } from '../lib/run-evidence-digest';
import { SELF_DECLARATION, decisionCoverage, normaliseProjectDecision } from '../lib/project-decision';
import { sha256Hex } from '../lib/artefact-digest';
import { contractOfProject } from '../lib/contract-build';
import { validateProjectCommand, type ProjectCommandState } from '../lib/project-commands';
import { deriveDecisionDraft, readStoredDecision, type DecisionDraftFacts } from '../lib/decision-draft';
import { bindingShown, conditionsSummary, decisionCardView } from '../lib/decision-card';
import { decisionHeadline, decisionManagerView, decisionPoint, withoutSourcePaths } from '../lib/decision-manager';
import { deriveProjectDecision } from '../lib/decision-facts';
import { PROCESS_STATE_COLLECTION } from '../lib/process-states';
import { PROCESS_REVISION_COLLECTION } from '../lib/process-revisions';
import { WORKSPACE_MESSAGES } from '../lib/workspace-messages';

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
  signOff: { by: 'owner@example.invalid', at: '2026-09-21T08:00:00.000Z', reason: '', notCurrent: null },
  need: { revision: 4, confirmedDrops: 0, undecided: 0 },
  handedOver: false,
  stored: undefined,
  now: '2026-09-24T10:00:00.000Z',
  ...over,
});

const ACTOR = { email: 'owner@example.invalid', now: '2026-09-24T11:00:00.000Z' };

/** A Retire sign-off as `approve-architecture` writes it, with the facts `deriveProjectDecision` reads from it. */
const RETIRE_REASON = 'SCMON shows zero executions over 13 months; the business owner confirmed nothing depends on it.';
const RETIRE_FACTS: Partial<DecisionDraftFacts> = {
  contract: null,
  signedOffArchitecture: 'retire',
  signOff: { by: 'owner@example.invalid', at: '2026-09-21T08:00:00.000Z', reason: RETIRE_REASON, notCurrent: null },
};

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
    // The key stays for the tooltip; the reader is told what it means.
    expect(view.bindings.find((b) => b.key === 'need')!.shown).toBe('revision 4');
    expect(draft.reversibility.answer).toBe('reversible');
    expect(view.reversible.answer).toMatch(/^Yes, inside this product/);
    expect(view.coverage.state).toBe('qualified');
    expect(view.confirmable).toBe(true);
    expect(view.identity).toBe('DEC-1 · revision 1');
    expect(view.selfDeclaration).toBe(SELF_DECLARATION);
  });

  test('an option the comparison does not carry still has a kind — reversibility does not claim none is chosen', () => {
    // Retire as the real derivation hands it over: no contract (`contractOfProject`
    // answers off-track, see "8.4 card — an option that generates nothing" below)
    // and the sign-off it rests on instead.
    const { draft } = deriveDecisionDraft(
      facts({ ...RETIRE_FACTS, handedOver: true, need: { revision: 2, confirmedDrops: 3, undecided: 0 } }),
    );
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
    // The two headlines come from the catalogue since block D, D.29 — the
    // source names the keys, and the keys are read for their words.
    expect(card).toMatch(/headline: draftSaved \? wt\('decision\.draftSaved'\) : wt\('decision\.nothingWritten'\)/);
    expect(WORKSPACE_MESSAGES['decision.draftSaved']).toMatch(/draft was saved/);
    expect(WORKSPACE_MESSAGES['decision.nothingWritten']).toBe('Nothing was written.');
    expect(card).not.toMatch(/headline=\{wt\('decision\.nothingWritten'\)\}/);
  });

  test('a command whose answer was lost is not reported as nothing written, and the decision is read again', () => {
    // QA review of 8adfa0e6db63: the server can commit and the answer still be
    // lost; fetch then rejects and the catch said "Nothing was written."
    const client = fs.readFileSync(path.join(ROOT, 'lib/project-command-client.ts'), 'utf8');
    expect(client).toMatch(/try \{\s*res = await fetch\([\s\S]*?\} catch \{\s*throw new CommandAnswerLostError\(/);
    // QA review of 4c9d12276f58: a 5xx is an unknown outcome too, and it is
    // decided before the generic refusal — a 500 after a commit is not "refused".
    const unknown = client.indexOf('if (res.status >= 500)');
    const refused = client.indexOf('if (!res.ok) throw new Error(');
    expect(unknown, 'a 5xx is still read as a refusal').toBeGreaterThan(-1);
    expect(unknown).toBeLessThan(refused);
    expect(client.slice(unknown, refused)).toContain('throw new CommandAnswerLostError(');
    const catches = card.split('} catch (err: unknown) {').slice(1);
    expect(catches.length).toBe(2);
    for (const c of catches) {
      const lost = c.indexOf('if (err instanceof CommandAnswerLostError)');
      expect(lost).toBeGreaterThanOrEqual(0);
      const nothing = c.indexOf("wt('decision.nothingWritten')");
      expect(nothing, 'the refusal no longer says nothing was written').toBeGreaterThan(-1);
      expect(lost).toBeLessThan(nothing);
    }
    const handler = card.slice(card.indexOf('const answerLost = useCallback('), card.indexOf('const confirm = useCallback('));
    expect(handler).toContain('setReload((n) => n + 1);');
    expect(handler).not.toContain('Nothing was written');
    expect(handler).not.toContain("wt('decision.nothingWritten')");
  });

  test('no role is stored or sent: Management, Business and IT are views only', () => {
    expect(card).not.toMatch(/\b(role|view)\s*:\s*'(management|business|it)'/i);
  });

  test('the card is mounted in the Management view of the workspace only', () => {
    const shell = fs.readFileSync(path.join(ROOT, 'components/workspace/WorkspaceShell.tsx'), 'utf8');
    // Handed to the Management answers only, as the hero of the decision
    // panel and never inside a fold (owner 03.10.2026) — and nowhere else.
    expect(shell).toMatch(/view === 'management' \? \([\s\S]{0,400}?<ManagementAnswers[\s\S]{0,800}?decision=\{[\s\S]{0,600}?<DecisionCard/);
    expect(shell).not.toMatch(/<ManagementFold\s+id="options"/);
    expect(shell.match(/<DecisionCard\b/g)).toHaveLength(1);
  });
});

test.describe('a bound revision, as the reader is told it', () => {
  test('a contract key says which contract, on which route, in what state — without the key', () => {
    // What the 3.0 gap audit read on the decision card.
    const shown = bindingShown('contract', 'blocked:qualified:AC-1/side-by-side-cap+592e7a6c667f');
    expect(shown).toBe('AC-1, Side-by-side on SAP BTP — CAP — blocked by a limit');
    expect(bindingShown('contract', 'AC-2/in-app-rap+deviation+0123456789ab')).toContain('deviating from the route');
    expect(bindingShown('contract', 'qualified:AC-3/in-app-rap+0123456789ab')).toContain('draft with open limits');
  });

  test('a cost key says currency, horizon, cadence and options — and that not all of it is confirmed', () => {
    expect(bindingShown('cost', 'unconfirmed:no-currency@no-horizony/no-cadence#3opt+7bb12ca381e8')).toBe(
      'no currency, no time horizon, no release cadence, 3 options — not all assumptions confirmed',
    );
    expect(bindingShown('cost', 'EUR@5y/4/y#2opt+0123456789ab')).toBe('EUR, over 5 years, 4 releases a year, 2 options');
  });

  test('a key of a shape it does not know is shown as it is, not guessed at', () => {
    expect(bindingShown('cost', 'something-else')).toBe('something-else');
    expect(bindingShown('option', 'rap · In-App ABAP Cloud (RAP)')).toBe('rap · In-App ABAP Cloud (RAP)');
  });
});

/**
 * G4-F1 (`docs/release/g4-chain-acceptance.md`). Retire is the product's option
 * for a retirement and for a standard adoption alike, and it generates nothing:
 * `contractOfProject` answers `off-track` and no architecture contract exists.
 * The decision must still be confirmable on what it does rest on — the signed
 * run and the account's sign-off with its reason — and must stay refused when
 * any of that is stale or missing. Derived through `deriveProjectDecision`, the
 * server's own derivation, over a project and run document as the routes write
 * them — not over a contract fixture the derivation never produces.
 */
test.describe('8.4 card — an option that generates nothing (G4-F1)', () => {
  const SIGNED_AT = '2026-09-21T08:00:00.000Z';
  const manifest = buildInputManifest(
    analysisRunInputs({
      sourceSha256: sha256Hex(SOURCE),
      deploymentTarget: 'public',
      catalogVersion: '2026.FPS01',
      rulesetVersion: 'rules-v1.0',
      engineVersion: '2.15.0',
      model: null,
    }),
    null,
  );
  const runDoc = { ...RUN, inputManifest: manifest, createdAt: '2026-09-20T08:00:00.000Z' };
  const runDigest = evidenceDigest(runDoc);
  const run2Doc = { ...runDoc, runHash: 'c'.repeat(64) };

  /** Only the runs exist; the need collections are empty, as on a project nobody reconstructed. */
  function fakeDb(runs: Record<string, Record<string, unknown>>) {
    const nothing = { empty: true, docs: [], exists: false, data: () => undefined };
    type Node = { path: string; collection: (c: string) => Node; doc: (d: string) => Node; orderBy: () => Node; limit: () => Node; get: () => Promise<unknown> };
    const node = (p: string): Node => ({
      path: p,
      collection: (c) => node(`${p}/${c}`),
      doc: (d) => node(`${p}/${d}`),
      orderBy: () => node(`${p}?newest`),
      limit: () => node(p),
      get: async () => {
        const id = /^projects\/p1\/runs\/(.+)$/.exec(p)?.[1];
        return id && runs[id] ? { exists: true, data: () => runs[id] } : nothing;
      },
    });
    return { collection: (c: string) => node(c) } as unknown as Parameters<typeof deriveProjectDecision>[0];
  }

  const project = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    legacyCode: SOURCE,
    s4Deployment: 'public',
    activeRunId: 'run-1',
    approvedByArchitect: true,
    targetArchitecture: 'retire',
    architectJustifiedOverride: RETIRE_REASON,
    architectSignOffAt: SIGNED_AT,
    approvedBy: 'owner@example.invalid',
    ...over,
  });

  async function derive(data: Record<string, unknown>) {
    const derived = await deriveProjectDecision(fakeDb({ 'run-1': runDoc, 'run-2': run2Doc }), 'p1', data, '2026-09-24T12:00:00.000Z');
    expect(derived.ok).toBe(true);
    if (!derived.ok) throw new Error(derived.code);
    return derived;
  }

  /**
   * Record the draft and confirm it the way the card does, with the fingerprint
   * the commands route derives from the project as it stands at confirmation.
   */
  async function recordAndConfirm(data: Record<string, unknown>, active: { runId: string; digest: string } = { runId: 'run-1', digest: runDigest }) {
    const { answer } = await derive(data);
    const recorded = validateProjectCommand({ command: 'record-decision-draft', decision: answer.draft }, { decision: undefined } as ProjectCommandState, ACTOR);
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) throw new Error(recorded.code);
    const onProject = recorded.fields.decision;
    const atConfirmation = await derive({ ...data, activeRunId: active.runId, decision: onProject });
    return validateProjectCommand(
      {
        command: 'confirm-decision',
        expectedDecisionFingerprint: answer.draft.fingerprint,
        expectedRunId: active.runId,
        expectedEvidenceDigest: active.digest,
      },
      {
        activeRunId: active.runId,
        activeRunEvidence: active.digest,
        decision: onProject,
        derivedDecisionFingerprint: atConfirmation.answer.draft.fingerprint,
      } as ProjectCommandState,
      ACTOR,
    );
  }

  const blocking = (d: Parameters<typeof decisionCoverage>[0]) =>
    decisionCoverage(d).gaps.filter((g) => g.severity === 'blocks').map((g) => g.code);

  test('the real derivation has no contract for Retire — off-track, as the finding says', () => {
    const built = contractOfProject(project(), manifest);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe('off-track');
  });

  test('Retire binds the run and the sign-off in place of a contract, and is confirmed', async () => {
    const { answer, runId, evidenceDigest: digest } = await derive(project());
    const contract = answer.draft.bindings.find((b) => b.key === 'contract')!;
    expect(contract.revision).toMatch(/^none-required:retire\/sign-off@2026-09-21T08:00:00\.000Z\+[0-9a-f]{12}$/);
    expect(contract.provenance).toBe('confirmed');
    expect(contract.note).toContain('No architecture contract is required');
    expect(contract.note).toContain('owner@example.invalid');
    expect(runId).toBe('run-1');
    expect(digest).toBe(runDigest);
    expect(answer.draft.boundRunId).toBe('run-1');
    expect(answer.draft.bindings.find((b) => b.key === 'run')!.revision).toBe('run-1');
    expect(blocking(answer.draft)).toEqual([]);
    const view = decisionCardView(answer.draft);
    expect(view.confirmable).toBe(true);
    expect(view.bindings.find((b) => b.key === 'contract')!.shown).toBe(
      'none required — nothing is generated; rests on the analysis run and the sign-off of 2026-09-21',
    );

    const confirmed = await recordAndConfirm(project());
    expect(confirmed.ok, confirmed.ok ? '' : `${confirmed.code}: ${confirmed.error}`).toBe(true);
    if (!confirmed.ok) return;
    expect(readStoredDecision(confirmed.fields.decision)?.status).toBe('confirmed');
  });

  test('another reason or another sign-off is another binding — the decision names this sign-off', async () => {
    const a = (await derive(project())).answer.draft;
    const b = (await derive(project({ architectJustifiedOverride: `${RETIRE_REASON} Also checked with finance.` }))).answer.draft;
    const c = (await derive(project({ architectSignOffAt: '2026-09-22T08:00:00.000Z' }))).answer.draft;
    const key = (d: typeof a) => d.bindings.find((x) => x.key === 'contract')!.revision;
    expect(key(b)).not.toBe(key(a));
    expect(key(c)).not.toBe(key(a));
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });

  test('probe: Retire on a stale run is refused — the decision of run 1 is not one of run 2', async () => {
    const refused = await recordAndConfirm(project(), { runId: 'run-2', digest: evidenceDigest(run2Doc) });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.status).toBe(409);
    expect(refused.code).toBe('decision-run-mismatch');
  });

  test('probe: Retire signed off for a previous source is refused', async () => {
    const stale = project({
      auditMetadata: { sourceChange: { at: SIGNED_AT, runId: 'run-1', previousSha256: 'd'.repeat(64), artefacts: {}, signOff: SIGNED_AT } },
    });
    const { answer } = await derive(stale);
    expect(answer.draft.bindings.find((b) => b.key === 'contract')!.revision).toMatch(/^not-current:none-required:retire\//);
    expect(blocking(answer.draft)).toEqual(['sign-off-not-current']);
    expect(decisionCoverage(answer.draft).sentence).toContain('It was given for a previous source');
    expect(decisionCardView(answer.draft).confirmable).toBe(false);
    const refused = await recordAndConfirm(stale);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe('decision-blocked');
  });

  test('probe: Retire after the source moved past the run is refused', async () => {
    const moved = project({ legacyCode: `${SOURCE}WRITE 1.\n` });
    const { answer } = await derive(moved);
    expect(blocking(answer.draft)).toEqual(['sign-off-not-current']);
    expect(decisionCoverage(answer.draft).sentence).toContain('source on the project is not what the analysis run read');
    const refused = await recordAndConfirm(moved);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe('decision-blocked');
  });

  test('probe: Retire without the required sign-off is refused — no sign-off, or one without its reason', async () => {
    const none = project({ approvedByArchitect: false, targetArchitecture: null, architectJustifiedOverride: '', architectSignOffAt: null, approvedBy: '' });
    const unsigned = await derive(none);
    expect(blocking(unsigned.answer.draft)).toContain('option-not-chosen');
    const refusedNone = await recordAndConfirm(none);
    expect(refusedNone.ok).toBe(false);
    if (!refusedNone.ok) expect(refusedNone.code).toBe('decision-blocked');

    // `approve-architecture` refuses Retire without a reason (override-needs-reason);
    // a record that carries none anyway was not written by it and is not stood on.
    const bare = project({ architectJustifiedOverride: '' });
    const { answer } = await derive(bare);
    expect(blocking(answer.draft)).toEqual(['sign-off-not-current']);
    expect(decisionCoverage(answer.draft).sentence).toContain('records no reason');
    const refused = await recordAndConfirm(bare);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe('decision-blocked');
  });

  test('probe: an extension decision without a contract stays refused', async () => {
    // Integration Suite and Event Mesh build something and are off both generation tracks, so no contract exists.
    for (const target of ['integration', 'event']) {
      const data = project({ targetArchitecture: target });
      const { answer } = await derive(data);
      expect(answer.draft.bindings.find((b) => b.key === 'contract')!.revision).toBeNull();
      expect(blocking(answer.draft)).toEqual(['contract-not-bound']);
      const refused = await recordAndConfirm(data);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.code).toBe('decision-blocked');
    }
    // A rebuild handed no contract is not let through as "nothing to generate" either.
    const { draft } = deriveDecisionDraft(facts({ contract: null }));
    expect(blocking(draft)).toEqual(['contract-not-bound']);
  });

  test('probe: a record claiming "no contract required" for a rebuild, or in a shape it does not have, is blocked', () => {
    const { draft } = deriveDecisionDraft(facts());
    for (const revision of [
      'none-required:rebuild/sign-off@2026-09-21T08:00:00.000Z+0123456789ab',
      'none-required:retire',
      'not-current:none-required:',
    ]) {
      const forged = {
        ...draft,
        bindings: draft.bindings.map((b) => (b.key === 'contract' ? { ...b, revision, notDeterminedReason: null } : b)),
      };
      expect(blocking(forged), revision).toEqual(['contract-not-bound']);
    }
  });

  test('a key of the no-contract shape is told as what it is', () => {
    expect(bindingShown('contract', 'not-current:none-required:retire/sign-off@2026-09-21T08:00:00.000Z+0123456789ab')).toBe(
      'none required — nothing is generated; the sign-off of 2026-09-21 is not current',
    );
  });
});

/* -------------------------------------------- what a manager reads first */

test.describe('the decision as a manager reads it (owner, 03.10.2026)', () => {
  const CATALOG_SENTENCE =
    "The catalog that answered is the Public Cloud release list; this build ships no edition-specific snapshot, and the lookup takes no edition (`lib/abap/catalog-service.ts` names neither `deployment` nor `edition`). The S/4HANA Cloud, Private Edition target context is bound as an input, not corroborated by a catalog for that edition.";

  test('the headline is the option, in plain words, and the four pillars carry their state', () => {
    const draft = deriveDecisionDraft(facts()).draft;
    const m = decisionManagerView(draft);
    expect(m.headline).toBe('Rebuild as In-App ABAP Cloud (RAP)');
    expect(m.pillars.map((p) => p.key)).toEqual(['need', 'option', 'cost', 'contract']);
    const by = Object.fromEntries(m.pillars.map((p) => [p.key, p]));
    expect(by.option.provenance).toBe('confirmed');
    expect(by.need.provenance).toBe('confirmed');
    // Never invented: the cost revision is not bound, and the pillar says so.
    expect(by.cost.provenance).toBe('not-determined');
    expect(by.cost.line).toMatch(/No cost assumptions entered yet/);
    // Figures stored on Economics but bound to no decision: the pillar says how
    // far they price, and that they are not bound — never "none entered", never
    // in place, never an amount (merge of economics-persist, 03.10.2026).
    const stored = Object.fromEntries(decisionManagerView(draft, { priced: 2, total: 3 }).pillars.map((p) => [p.key, p]));
    expect(stored.cost.line).toBe('2 of 3 options priced in Economics — not bound to this decision.');
    expect(stored.cost.provenance).toBe('not-determined');
    expect(stored.cost.inPlace).toBe(false);
    expect(decisionManagerView(draft, { priced: 0, total: 3 }).pillars.find((p) => p.key === 'cost')?.line).toMatch(/No cost assumptions entered yet/);
    // Green is reserved for proven: no pillar of a decision is proven.
    for (const p of m.pillars) expect(p.provenance).not.toBe('proven');
    expect(decisionHeadline(null)).toBe('No option chosen yet');
    expect(decisionHeadline('retire · Retire / Decommission')).toBe('Retire this object');
    expect(decisionManagerView(deriveDecisionDraft(facts({ signedOffArchitecture: null })).draft).readiness).toMatch(
      /^Cannot be confirmed yet: .*no target architecture is signed off/,
    );
  });

  test('a condition is one plain line with the place it is resolved; the record text is kept for the fold', () => {
    const point = decisionPoint({
      id: 'contract:catalog-not-edition-specific:S/4HANA Cloud, Private Edition',
      text: CATALOG_SENTENCE,
      source: 'contract-limit',
      status: 'open',
      statusBasis: 'derived',
      evidence: 'catalog-not-edition-specific:S/4HANA Cloud, Private Edition',
      attestation: null,
      provenance: 'reconstructed',
    });
    expect(point.line).toBe('The SAP catalog check is not specific to S/4HANA Cloud, Private Edition.');
    expect(point.place).toEqual({ kind: 'view', view: 'it' });
    const need = decisionPoint({
      id: 'need:undecided', text: 'x', source: 'need-open', status: 'open', statusBasis: 'derived',
      evidence: 'undecided:15', attestation: null, provenance: 'reconstructed',
    });
    expect(need).toMatchObject({ line: '15 process elements have no confirmed state yet.', place: { kind: 'view', view: 'business' } });
  });

  test('no source file path reaches the reader, not even in the technical fold', () => {
    const cleaned = withoutSourcePaths(CATALOG_SENTENCE);
    expect(cleaned).not.toMatch(/lib\/|\.ts\b|`/);
    expect(cleaned).toContain('the lookup takes no edition.');
    const draft = deriveDecisionDraft(facts()).draft;
    for (const e of decisionManagerView(draft).technical) expect(e.text).not.toMatch(/lib\/|\.tsx?\b/);
  });

  test('a confirmed decision is not offered for confirmation again', () => {
    const draft = deriveDecisionDraft(facts()).draft;
    expect(decisionManagerView(draft).readiness).toMatch(/^Can be confirmed/);
    const confirmed = { ...draft, status: 'confirmed' as const };
    expect(decisionManagerView(confirmed).readiness).not.toMatch(/Can be confirmed|Cannot be confirmed/);
  });

  test('what is stored is not touched: the record keeps its own sentences and fingerprint', () => {
    const draft = deriveDecisionDraft(facts()).draft;
    const before = JSON.stringify(draft);
    decisionManagerView(draft);
    expect(JSON.stringify(draft)).toBe(before);
    const card = fs.readFileSync(path.resolve(__dirname, '..', 'lib/decision-manager.ts'), 'utf8');
    expect(card).not.toMatch(/from '\.\/(architecture-contract|contract-build|project-decision-build|decision-draft)'|from '\.\/abap\//);
  });
});
