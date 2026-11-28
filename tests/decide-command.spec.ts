import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { evidenceDigest } from '../lib/run-evidence-digest';
import {
  PROJECT_COMMANDS,
  SERVER_ONLY_PROJECT_FIELDS,
  decideRecord,
  decideSignOff,
  fieldsWrittenByCommands,
  validateProjectCommand,
  type ProjectCommandState,
  type ProjectCommandWrite,
} from '../lib/project-commands';
import { deriveDecisionDraft, type DecisionDraftFacts } from '../lib/decision-draft';
import { costBasisOf } from '../lib/decision-cost';
import { SELF_DECLARATION } from '../lib/project-decision';
import { decisionBasisOf } from '../lib/decide';

/**
 * ADR-145, step S2: the server command `decide` — the option (for a Rebuild its route), the sign-off it stands on,
 * the draft and the confirmation in one transaction, with the bindings `approve-architecture` and `confirm-decision`
 * had: the run and its evidence (409 on a moved run), and what the page read (`expectedDecisionBasis`, 409 when the
 * answers or the record moved). Owner only, Admin SDK, no rules change. Server-free: the two pure steps and the route's
 * source.
 */
const ROOT = path.resolve(__dirname, '..');
const code = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const RUN = { evidence: { findings: [] }, analysis: { cleanCoreScore: 40 } };
const DIGEST = evidenceDigest(RUN);
const ACTOR = { email: 'owner@example.invalid', now: '2026-11-27T10:00:00.000Z' };
const REASON = 'SCMON shows zero executions over 13 months; the business owner confirmed nothing depends on it.';

const state = (over: Partial<ProjectCommandState> = {}): ProjectCommandState => ({
  activeRunId: 'run-1',
  activeRunEvidence: DIGEST,
  contractRecommendation: 'rap',
  decision: undefined,
  ...over,
});

const facts = (over: Partial<DecisionDraftFacts> = {}): DecisionDraftFacts => ({
  runId: 'run-1',
  evidenceDigest: DIGEST,
  runSignedAt: '2026-11-20T08:00:00.000Z',
  contract: null,
  signedOffArchitecture: null,
  signOff: null,
  need: { revision: 3, confirmedDrops: 0, undecided: 1 },
  handedOver: false,
  stored: undefined,
  now: ACTOR.now,
  ...over,
});

const BASIS = decisionBasisOf({ runId: 'run-1', evidenceDigest: DIGEST, draft: deriveDecisionDraft(facts()).draft, stored: null });

const body = (over: Record<string, unknown> = {}) => ({
  command: 'decide',
  targetArchitecture: 'retire',
  justification: REASON,
  expectedRunId: 'run-1',
  expectedEvidenceDigest: DIGEST,
  expectedDecisionBasis: BASIS,
  ...over,
});

/** The draft the route derives after the sign-off is applied: the same facts the sign-off fields give. */
function derivedAfter(signOff: ProjectCommandWrite) {
  const f = signOff.fields;
  const answer = deriveDecisionDraft(
    facts({
      signedOffArchitecture: f.targetArchitecture as string,
      signOff: { by: f.approvedBy as string, at: f.architectSignOffAt as string, reason: f.architectJustifiedOverride as string, notCurrent: null },
    }),
  );
  return { draft: answer.draft, draftFingerprint: answer.draft.fingerprint, costBasisNow: costBasisOf(null) };
}

test.describe('decide, step 1: the sign-off it stands on, bound to the run', () => {
  test('a decide command is known, and validateProjectCommand alone never writes one', () => {
    expect(PROJECT_COMMANDS).toContain('decide');
    const alone = validateProjectCommand(body(), state(), ACTOR);
    expect(alone).toMatchObject({ ok: false, status: 400, code: 'decide-needs-derivation' });
  });

  test('no signed run, or a confirmed decision on record: refused, nothing written', () => {
    expect(decideSignOff(body(), state({ activeRunId: '' }), ACTOR)).toMatchObject({ ok: false, status: 409, code: 'no-run' });
    expect(decideSignOff(body(), state({ decision: { status: 'confirmed' } }), ACTOR)).toMatchObject({ ok: false, status: 409, code: 'decision-confirmed' });
  });

  test('the run binding is the decision\'s: missing, moved or unreadable evidence refuses with 400 or 409', () => {
    expect(decideSignOff(body({ expectedRunId: '' }), state(), ACTOR)).toMatchObject({ ok: false, status: 400, code: 'missing-expected-run' });
    expect(decideSignOff(body({ expectedEvidenceDigest: '' }), state(), ACTOR)).toMatchObject({ ok: false, status: 400, code: 'missing-evidence-digest' });
    const moved = decideSignOff(body(), state({ activeRunId: 'run-2' }), ACTOR);
    expect(moved).toMatchObject({ ok: false, status: 409, code: 'run-moved', activeRunId: 'run-2' });
    expect(moved.ok ? '' : moved.error).toContain('decide on that');
    expect(decideSignOff(body(), state({ activeRunEvidence: null }), ACTOR)).toMatchObject({ ok: false, status: 409, code: 'run-unreadable' });
    expect(decideSignOff(body(), state({ profileDrift: { recorded: 'a', now: 'b' } }), ACTOR)).toMatchObject({ ok: false, status: 409, code: 'profile-changed' });
  });

  test('what the page read is named, or nothing is written', () => {
    expect(decideSignOff(body({ expectedDecisionBasis: undefined }), state(), ACTOR)).toMatchObject({ ok: false, status: 400, code: 'missing-decision-basis' });
    expect(decideSignOff(body({ expectedDecisionBasis: 'abc' }), state(), ACTOR)).toMatchObject({ ok: false, status: 400, code: 'missing-decision-basis' });
  });

  test('a departure from the contract\'s route needs a reason, as approve-architecture requires', () => {
    expect(decideSignOff(body({ justification: '' }), state(), ACTOR)).toMatchObject({ ok: false, status: 400, code: 'override-needs-reason' });
    expect(decideSignOff(body({ targetArchitecture: 'cap', justification: '' }), state(), ACTOR)).toMatchObject({ ok: false, code: 'override-needs-reason' });
    // Following the contract's route needs none.
    expect(decideSignOff(body({ targetArchitecture: 'rap', justification: '' }), state(), ACTOR)).toMatchObject({ ok: true });
    expect(decideSignOff(body({ targetArchitecture: 'nonsense' }), state(), ACTOR)).toMatchObject({ ok: false, code: 'unknown-architecture' });
  });

  test('the sign-off fields are the server\'s: who off the token, when off the clock', () => {
    const ok = decideSignOff(body(), state(), ACTOR);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.action).toBe('PROJECT_DECIDED');
    expect(ok.fields).toEqual({
      targetArchitecture: 'retire',
      approvedByArchitect: true,
      architectJustifiedOverride: REASON,
      architectSignOffAt: ACTOR.now,
      approvedBy: ACTOR.email,
    });
  });
});

test.describe('decide, step 2: the derived draft, recorded and confirmed together', () => {
  test('Retire: the sign-off and the confirmed record in one write, by the signed-in account', () => {
    const signOff = decideSignOff(body(), state(), ACTOR) as ProjectCommandWrite;
    const derived = derivedAfter(signOff);
    const result = decideRecord(body(), state({ derivedDecisionFingerprint: derived.draftFingerprint, costBasisNow: derived.costBasisNow }), ACTOR, signOff, derived);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.action).toBe('PROJECT_DECIDED');
    expect(Object.keys(result.fields).sort()).toEqual(['approvedBy', 'approvedByArchitect', 'architectJustifiedOverride', 'architectSignOffAt', 'decision', 'targetArchitecture']);
    const decision = result.fields.decision as Record<string, unknown>;
    expect(decision.status).toBe('confirmed');
    expect(decision.confirmation).toEqual({ account: ACTOR.email, at: ACTOR.now, selfDeclaration: SELF_DECLARATION });
    expect(decision.fingerprint).toBe(derived.draftFingerprint);
    expect(decision.boundRunId).toBe('run-1');
    expect(decision.costBasis).toEqual(costBasisOf(null));
    // Only fields the existing commands already write: no new server-only field, so no rules change.
    for (const key of Object.keys(result.fields)) expect(SERVER_ONLY_PROJECT_FIELDS as readonly string[]).toContain(key);
    for (const key of Object.keys(result.fields)) expect(fieldsWrittenByCommands()).toContain(key);
  });

  test('a decision that would be blocked is refused whole: no sign-off is written without its record', () => {
    // A Rebuild without a contract binds nothing to build against: blocked, as confirm-decision has always refused it.
    const signOff = decideSignOff(body({ targetArchitecture: 'rap', justification: '' }), state(), ACTOR) as ProjectCommandWrite;
    const derived = derivedAfter(signOff);
    const result = decideRecord(body(), state({ derivedDecisionFingerprint: derived.draftFingerprint, costBasisNow: derived.costBasisNow }), ACTOR, signOff, derived);
    expect(result).toMatchObject({ ok: false, status: 409, code: 'decision-blocked' });
  });

  test('costs that could not be read, or a draft that is not the server\'s, refuse as confirm-decision does', () => {
    const signOff = decideSignOff(body(), state(), ACTOR) as ProjectCommandWrite;
    const derived = derivedAfter(signOff);
    expect(decideRecord(body(), state(), ACTOR, signOff, { ...derived, costBasisNow: null })).toMatchObject({ ok: false, status: 409, code: 'costs-unread' });
    expect(decideRecord(body(), state(), ACTOR, signOff, { ...derived, draftFingerprint: 'f'.repeat(64) })).toMatchObject({ ok: false, status: 409 });
    // The draft names another run than the one bound: refused.
    const other = deriveDecisionDraft(facts({ runId: 'run-0', signedOffArchitecture: 'retire', signOff: { by: ACTOR.email, at: ACTOR.now, reason: REASON, notCurrent: null } })).draft;
    expect(decideRecord(body(), state(), ACTOR, signOff, { draft: other, draftFingerprint: other.fingerprint, costBasisNow: costBasisOf(null) })).toMatchObject({ ok: false, status: 409, code: 'decision-run-mismatch' });
  });
});

test.describe('the basis: what the page read, besides the run', () => {
  test('moves with an answer (the need revision), with the record, with the run; not with the clock', () => {
    const at = (over: Partial<DecisionDraftFacts>, stored: { fingerprint: string; status: string } | null = null) => {
      const f = facts(over);
      return decisionBasisOf({ runId: f.runId, evidenceDigest: f.evidenceDigest, draft: deriveDecisionDraft(f).draft, stored });
    };
    expect(at({})).toBe(BASIS);
    expect(at({ now: '2026-12-01T00:00:00.000Z' })).toBe(BASIS);
    expect(at({ need: { revision: 4, confirmedDrops: 0, undecided: 0 } })).not.toBe(BASIS);
    expect(at({}, { fingerprint: 'a'.repeat(64), status: 'withdrawn' })).not.toBe(BASIS);
    expect(at({ runId: 'run-2' })).not.toBe(BASIS);
    expect(BASIS).toMatch(/^[0-9a-f]{64}$/);
  });
});

test.describe('the route: owner only, one transaction, every read before the one write', () => {
  const route = code('app/api/projects/[projectId]/commands/route.ts');

  test('decide is bound like the sign-off and the confirmation, and checked against the contract\'s route', () => {
    expect(route).toContain("commandName === 'approve-architecture' || commandName === 'confirm-decision' || commandName === 'decide'");
    expect(route).toContain("commandName === 'approve-architecture' || commandName === 'decide' ? recommendationOfProject(project) : null");
  });

  test('the owner check comes first, and decide derives twice inside the transaction before it writes', () => {
    const owner = route.indexOf('stored.userId !== decodedToken.uid');
    const decide = route.indexOf('const decideInOneGo');
    const write = route.indexOf('tx.update(ref');
    expect(owner).toBeGreaterThan(0);
    expect(decide).toBeGreaterThan(owner);
    expect(write).toBeGreaterThan(decide);
    const body = route.slice(decide, route.indexOf('const actor', decide));
    expect(body.match(/deriveProjectDecision\(db, projectId, [^)]*, t\)/g)?.length).toBe(2);
    expect(body).toContain('decisionBasisOf({');
    expect(body).toContain("code: 'decision-moved'");
    expect(body).toContain('{ ...read, ...signOff.fields }');
    expect(body).not.toMatch(/tx\.(update|set)\(/);
  });

  test('no rules change: the decision and the release fields stay server-only, written by the Admin SDK route alone', () => {
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    for (const f of ['decision', 'targetArchitecture', 'approvedBy']) expect(SERVER_ONLY_PROJECT_FIELDS as readonly string[]).toContain(f);
    expect(rules).not.toMatch(/['"]decide['"]/);
  });
});
