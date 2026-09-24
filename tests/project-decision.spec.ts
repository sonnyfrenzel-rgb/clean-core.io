import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { adminSetDoc, adminGetDoc } from './helpers/admin-seed';
import {
  DECISION_BINDINGS,
  DECISION_VERSION,
  SELF_DECLARATION,
  canonicalProjectDecision,
  conditionAttestable,
  decisionConfirmable,
  decisionCoverage,
  decisionFingerprint,
  decisionManifestInput,
  decisionReversibility,
  emptyProjectDecision,
  normaliseProjectDecision,
  type ProjectDecision,
} from '../lib/project-decision';
import { buildProjectDecision, decisionManifestInputs } from '../lib/project-decision-build';
import { buildArchitectureContract } from '../lib/architecture-contract';
import {
  COMPARISON_KIND,
  COST_ASSUMPTIONS_INPUT_ID,
  costAssumptionsCoverage,
  costComparison,
  emptyCostAssumptions,
  type CostAssumptions,
  type CostOption,
} from '../lib/cost-assumptions';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { PROVENANCE } from '../lib/provenance';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { evidenceDigest } from '../lib/run-evidence-digest';
import { validateProjectCommand, type ProjectCommandState } from '../lib/project-commands';

/**
 * Roadmap 8.4 — *"Entscheidung: bindet Bedarf, Option, Kostenrevision und
 * Vertrag; Bedingungen mit Status; Zeitleiste; umkehrbar ja/nein. Bestätigt vom
 * Konto — Selbstauskunft, kein organisatorisches Mandat."*
 *
 * Pure, except the last block: no browser, no emulator, no server. Every branch
 * of the model and of the two new commands is reachable from a function call,
 * which is why the step is built as a module and a command rather than as a
 * page with logic in it. The last block (QA review of 4b4586aff273) drives the
 * three decision commands through `/api/projects/[id]/commands` against the
 * emulator, because the token, the ownership check, the server clock and the
 * journal entry live in the route and not in the validator.
 */

/* ---------- fixtures ---------- */

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

const option = (over: Partial<CostOption> & Pick<CostOption, 'id' | 'kind'>): CostOption => ({
  label: over.id,
  oneOff: { low: { devDays: 10, testDays: 4 }, high: { devDays: 14, testDays: 6 } },
  perRelease: { devDays: 2, testDays: 1 },
  maintenanceBaselinePerYear: null,
  upgradeDelay: null,
  effortSource: 'stated',
  ...over,
});

const doNothing = (): CostOption =>
  option({
    id: 'do-nothing',
    kind: COMPARISON_KIND,
    oneOff: { low: { devDays: 0, testDays: 0 }, high: { devDays: 0, testDays: 0 } },
    perRelease: { devDays: 1, testDays: 6 },
    maintenanceBaselinePerYear: { devDays: 2, testDays: 2 },
    upgradeDelay: { state: 'stated', value: { releasesDeferred: 2 } },
  });

const completeAssumptions = (over: Partial<CostAssumptions> = {}): CostAssumptions => ({
  ...emptyCostAssumptions(),
  currency: 'EUR',
  devDayRate: 800,
  testDayRate: 600,
  horizonYears: 5,
  releaseCadence: { perYear: 2, confirmed: true },
  options: [doNothing(), option({ id: 'rebuild', kind: 'rebuild' })],
  ...over,
});

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

function decisionFixture(over: Partial<Parameters<typeof buildProjectDecision>[0]> = {}): ProjectDecision {
  const assumptions = completeAssumptions();
  return buildProjectDecision({
    summary: 'Rebuild on stack with released APIs.',
    runId: 'run-1',
    evidenceDigest: DIGEST,
    contract: contractFixture(),
    assumptions,
    comparison: costComparison(assumptions),
    chosenOptionId: 'rebuild',
    need: { revision: 4, confirmedDrops: 0, undecided: 0 },
    handedOver: false,
    timeline: { draftedAt: '2026-09-23T10:00:00.000Z' },
    ...over,
  });
}

const binding = (d: ProjectDecision, key: string) => d.bindings.find((b) => b.key === key)!;

/* ================================================= what a decision binds */

test.describe('8.4 — the decision binds what it stands on', () => {
  test('all five bindings, always, and never a silent null', () => {
    for (const d of [decisionFixture(), emptyProjectDecision()]) {
      expect(d.decisionVersion).toBe(DECISION_VERSION);
      expect(d.bindings.map((b) => b.key)).toEqual([...DECISION_BINDINGS]);
      for (const b of d.bindings) {
        // The invariant of the type, asserted: exactly one of the two sides is
        // present. A binding that is neither bound nor not-determined is a
        // field a reader may fill in from imagination.
        expect(b.revision === null, `${b.key}`).toBe(b.notDeterminedReason !== null);
        if (b.revision === null) expect(b.notDeterminedReason!.length).toBeGreaterThan(20);
        // A bound binding's caveat lives in `note`, never in the field that
        // says it was not bound at all.
        if (b.revision !== null) expect(b.notDeterminedReason).toBeNull();
        expect(Object.keys(PROVENANCE)).toContain(b.provenance);
      }
    }
  });

  test('a need nobody confirmed is "not determined" with a reason, never an empty revision', () => {
    const d = decisionFixture({ need: { revision: null, confirmedDrops: 0, undecided: 3 } });
    const need = binding(d, 'need');
    expect(need.revision).toBeNull();
    expect(need.notDeterminedReason).toContain('3 element(s)');
    expect(need.provenance).toBe('not-determined');
    // Qualified, not blocked: a decision without a confirmed need is badly
    // supported, not impossible. The record says so instead of locking.
    expect(decisionCoverage(d).gaps.map((g) => g.code)).toContain('need-not-confirmed');
    expect(decisionConfirmable(d)).toBe(true);
  });
});

/* ================================================= no invented cost winner */

test.describe('8.4 — 7.4 keeps its four refusals through the binding', () => {
  test('a comparison that names no winner does not become one on the decision', () => {
    // One option only: 7.4's `too-few-options`. The assumptions are otherwise
    // complete, so the cost revision *is* bound — and its provenance says the
    // comparison refused, rather than a simulation that implies a cheapest one.
    const assumptions = completeAssumptions({ options: [doNothing()] });
    const comparison = costComparison(assumptions);
    expect(comparison.winner).toBeNull();
    expect(comparison.refusal?.code).toBe('too-few-options');

    const d = decisionFixture({ assumptions, comparison, chosenOptionId: 'do-nothing' });
    const cost = binding(d, 'cost');
    expect(cost.revision).not.toBeNull();
    expect(cost.provenance).toBe('not-determined');
    expect(cost.note).toBe(comparison.refusal!.sentence);
    expect(decisionCoverage(d).gaps.map((g) => g.code)).toContain('cost-no-winner');
  });

  test('assumptions that carry no amount bind no cost revision at all', () => {
    const assumptions = emptyCostAssumptions();
    expect(costAssumptionsCoverage(assumptions).state).toBe('rejected');
    const d = decisionFixture({ assumptions, comparison: costComparison(assumptions) });
    const cost = binding(d, 'cost');
    expect(cost.revision).toBeNull();
    expect(cost.notDeterminedReason).toBe(costAssumptionsCoverage(assumptions).sentence);
    expect(decisionCoverage(d).gaps.map((g) => g.code)).toContain('cost-not-bound');
    // And it still qualifies rather than blocks — roadmap line 498.
    expect(decisionConfirmable(d)).toBe(true);
  });
});

/* ============================================ the seam roadmap 7.4 left open */

test.describe('8.4 — the cost assumptions become a signed input here', () => {
  test('the manifest of a decision carries decision, contract and assumptions', () => {
    const assumptions = completeAssumptions();
    const contract = contractFixture();
    const inputs = decisionManifestInputs(decisionFixture(), { contract, assumptions });
    const ids = inputs.map((i) => i.id);
    expect(ids).toContain('decision:architecture');
    expect(ids).toContain('contract:architecture');
    // This is the wiring 7.4 built and deliberately did not switch on.
    expect(ids, 'the cost seam is not live').toContain(COST_ASSUMPTIONS_INPUT_ID);
  });

  test('rejected assumptions are omitted rather than signed', () => {
    const assumptions = emptyCostAssumptions();
    const d = decisionFixture({ assumptions, comparison: costComparison(assumptions) });
    const ids = decisionManifestInputs(d, { contract: contractFixture(), assumptions }).map((i) => i.id);
    expect(ids).not.toContain(COST_ASSUMPTIONS_INPUT_ID);
    // …and the omission is visible on the decision itself, not only absent
    // from a manifest nobody reads.
    expect(binding(d, 'cost').revision).toBeNull();
  });

  test('a blocked decision cannot become a signed input', () => {
    const blocked = emptyProjectDecision();
    expect(decisionCoverage(blocked).state).toBe('blocked');
    expect(() => decisionManifestInput(blocked)).toThrow(/must not become a signed input/);
  });
});

/* ====================================================== reversible yes / no */

test.describe('8.4 — "umkehrbar ja/nein" is answered, or refused with a reason', () => {
  test('no option chosen: not determined, and it says why', () => {
    const r = decisionReversibility({ optionKind: null, handedOver: false, confirmedDrops: 0 });
    expect(r.answer).toBe('not-determined');
    expect(r.boundary).toBeNull();
    expect(r.reason).toContain('nothing to reverse');
  });

  test('nothing handed over: reversible, with the boundary named', () => {
    const r = decisionReversibility({ optionKind: 'rebuild', handedOver: false, confirmedDrops: 2 });
    expect(r.answer).toBe('reversible');
    expect(r.boundary).toContain('not the target system');
  });

  test('handed over and retiring a confirmed drop: the one honest "no"', () => {
    const r = decisionReversibility({ optionKind: 'retire', handedOver: true, confirmedDrops: 3 });
    expect(r.answer).toBe('irreversible');
    expect(r.reason).toContain('3 confirmed need decision(s)');
    expect(r.reason).toContain('new build');
  });

  test('handed over otherwise: not determined — the target system is not observable here', () => {
    // Including a retire that no confirmed drop stands behind: the giving-up
    // would then be this product's inference, and an inference is not a "no".
    for (const args of [
      { optionKind: 'rebuild' as const, handedOver: true, confirmedDrops: 9 },
      { optionKind: 'retire' as const, handedOver: true, confirmedDrops: 0 },
    ]) {
      const r = decisionReversibility(args);
      expect(r.answer, JSON.stringify(args)).toBe('not-determined');
      expect(r.reason).toContain('not observable here');
    }
    // A decision whose reversibility is undetermined is carried as qualified.
    const d = decisionFixture({ handedOver: true, chosenOptionId: 'rebuild' });
    expect(d.reversibility.answer).toBe('not-determined');
    expect(decisionCoverage(d).gaps.map((g) => g.code)).toContain('reversibility-not-determined');
  });
});

/* ========================================== conditions, and who owns a status */

test.describe('8.4 — a condition without a status is a note', () => {
  test('every condition carries a status and who may set it', () => {
    const d = decisionFixture();
    expect(d.conditions.length).toBeGreaterThan(0);
    for (const c of d.conditions) {
      expect(['open', 'met', 'waived', 'not-determined']).toContain(c.status);
      expect(['derived', 'attested']).toContain(c.statusBasis);
      expect(c.text.length).toBeGreaterThan(20);
    }
    // The contract's limits arrive as conditions rather than as a footnote.
    const fromContract = d.conditions.filter((c) => c.source === 'contract-limit');
    expect(fromContract.length).toBe(contractFixture().fields.flatMap((f) => f.limits).length);
    for (const c of fromContract) expect(c.statusBasis).toBe('derived');
  });

  test('the account may not set a derived status', () => {
    const d = decisionFixture();
    const derived = d.conditions.find((c) => c.statusBasis === 'derived')!;
    expect(conditionAttestable(derived)).toBe(false);
  });

  test('an attestation naming a derived condition does not overwrite it', () => {
    const base = decisionFixture();
    const target = base.conditions.find((c) => c.statusBasis === 'derived')!;
    const d = decisionFixture({
      attestations: [
        {
          conditionId: target.id,
          status: 'waived',
          account: 'owner@example.com',
          at: '2026-09-23T11:00:00.000Z',
          note: 'We accept this for the pilot.',
        },
      ],
    });
    const stillDerived = d.conditions.find((c) => c.id === target.id)!;
    expect(stillDerived.status).toBe('open');
    expect(stillDerived.statusBasis).toBe('derived');
    // The account's word is kept — beside the evidence, never on top of it.
    const own = d.conditions.find((c) => c.id === `account:${target.id}`)!;
    expect(own.statusBasis).toBe('attested');
    expect(own.attestation?.account).toBe('owner@example.com');
    expect(own.provenance).toBe('confirmed');
  });

  test('a record cannot smuggle a waived derived condition past the server', () => {
    const d = decisionFixture();
    const smuggled = JSON.parse(JSON.stringify(d)) as ProjectDecision;
    const victim = smuggled.conditions.find((c) => c.statusBasis === 'derived')!;
    victim.status = 'waived';
    const read = normaliseProjectDecision(smuggled);
    expect(read.ok).toBe(false);
  });

  test('statusBasis and attestation have to agree', () => {
    const d = decisionFixture();
    const record = JSON.parse(JSON.stringify(d)) as ProjectDecision;
    record.conditions[0] = { ...record.conditions[0], statusBasis: 'attested', attestation: null };
    expect(normaliseProjectDecision(record).ok).toBe(false);
  });
});

/* ================================================ the fingerprint, and status */

test.describe('8.4 — status is outside the fingerprint, everything else is inside', () => {
  test('confirming does not move the fingerprint', () => {
    const d = decisionFixture();
    const confirmed: ProjectDecision = {
      ...d,
      status: 'confirmed',
      confirmation: { account: 'owner@example.com', at: 'now', selfDeclaration: SELF_DECLARATION },
    };
    expect(decisionFingerprint(confirmed)).toBe(decisionFingerprint(d));
    // Not only the hash: the canonical form itself is character-for-character
    // the same. A hash equality could be satisfied by two forms that happen to
    // collide; this says the confirmation is genuinely not in the input.
    expect(canonicalProjectDecision(confirmed)).toBe(canonicalProjectDecision(d));
  });

  test('a changed condition status is a new fingerprint — a change is a revision, not an edit', () => {
    const d = decisionFixture();
    const moved: ProjectDecision = {
      ...d,
      conditions: d.conditions.map((c, i) => (i === 0 ? { ...c, status: 'met' as const } : c)),
    };
    expect(decisionFingerprint(moved)).not.toBe(decisionFingerprint(d));
  });

  test('so is a changed binding, a changed reversibility and a changed timeline', () => {
    const d = decisionFixture();
    const variants: ProjectDecision[] = [
      { ...d, bindings: d.bindings.map((b, i) => (i === 0 ? { ...b, revision: 'need/r9' } : b)) },
      { ...d, reversibility: { ...d.reversibility, answer: 'irreversible' } },
      { ...d, timeline: [...d.timeline, { at: 'z', kind: 'run-signed', sentence: 's', account: null }] },
      { ...d, summary: `${d.summary} (revised)` },
    ];
    for (const v of variants) expect(decisionFingerprint(v)).not.toBe(decisionFingerprint(d));
  });

  test('a fingerprint on the wire is recomputed, never believed', () => {
    const d = decisionFixture();
    const tampered = { ...d, summary: 'Something else entirely.' };
    // The old fingerprint travels with new content: the shape of a record
    // edited after it was shown.
    const read = normaliseProjectDecision({ ...tampered, fingerprint: d.fingerprint });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.error).toContain('is not the decision that was sent');
    // Without the stale fingerprint, the same record reads back and gets its own.
    const fresh = normaliseProjectDecision({ ...tampered, fingerprint: undefined });
    expect(fresh.ok).toBe(true);
    if (fresh.ok) expect(fresh.decision.fingerprint).not.toBe(d.fingerprint);
  });

  test('status and confirmation never arrive from outside', () => {
    const d = decisionFixture();
    const read = normaliseProjectDecision({
      ...d,
      fingerprint: undefined,
      status: 'confirmed',
      confirmation: { account: 'ceo@example.com', at: 'yesterday', selfDeclaration: 'approved by the board' },
    });
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.decision.status).toBe('draft');
      expect(read.decision.confirmation).toBeNull();
    }
  });
});

/* ======================================== the confirmation, bound and attested */

test.describe('8.4 — the confirmation is the account\'s, and it is bound to the run', () => {
  const actor = { email: 'owner@example.com', now: '2026-09-23T12:00:00.000Z' };
  const stored = (d: ProjectDecision, status = 'draft') => ({ ...d, status, confirmation: null });
  const state = (d: ProjectDecision, over: Partial<ProjectCommandState> = {}): ProjectCommandState => ({
    activeRunId: 'run-1',
    activeRunEvidence: DIGEST,
    decision: stored(d),
    // The fixtures are built by `buildProjectDecision`, i.e. they *are* what the
    // server derives; `decision-card.spec.ts` covers a record that is not.
    derivedDecisionFingerprint: d.fingerprint,
    ...over,
  });
  const confirm = (d: ProjectDecision, over: Record<string, unknown> = {}) => ({
    command: 'confirm-decision',
    expectedRunId: 'run-1',
    expectedEvidenceDigest: DIGEST,
    expectedDecisionFingerprint: d.fingerprint,
    ...over,
  });

  test('it records the token\'s account, the server clock and the self-declaration', () => {
    const d = decisionFixture();
    const r = validateProjectCommand(confirm(d), state(d), actor);
    expect(r.ok, r.ok ? '' : r.error).toBe(true);
    if (!r.ok) return;
    const written = r.fields.decision as ProjectDecision;
    expect(written.status).toBe('confirmed');
    expect(written.confirmation?.account).toBe('owner@example.com');
    expect(written.confirmation?.at).toBe(actor.now);
    // One spelling of the sentence, and it is `lib/provenance.ts`'s.
    expect(written.confirmation?.selfDeclaration).toBe(PROVENANCE.confirmed.meaning);
    expect(r.action).toBe('PROJECT_DECISION_CONFIRMED');
  });

  test('a body cannot name its own confirmer', () => {
    const d = decisionFixture();
    const r = validateProjectCommand(
      confirm(d, { confirmation: { account: 'cto@example.com', at: '1999', selfDeclaration: 'x' } }),
      state(d),
      actor,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.fields.decision as ProjectDecision).confirmation?.account).toBe('owner@example.com');
  });

  test('CR-11 again: a confirmation prepared on another run is refused, not rehung', () => {
    const d = decisionFixture();
    const moved = { ...RUN, evidenceReport: [{ id: 'f1' }, { id: 'f2' }] };
    const r = validateProjectCommand(
      confirm(d),
      state(d, { activeRunId: 'run-2', activeRunEvidence: evidenceDigest(moved) }),
      actor,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('run-moved');
      expect(r.error).toContain('findings 1 → 2');
      expect(r.error).toContain('decide on');
    }
  });

  test('and a decision derived from another run is refused even when the caller is current', () => {
    // The caller read the current run; the *decision* did not. Two tabs are
    // enough to separate them, so both are compared.
    const stale = decisionFixture({ runId: 'run-0' });
    const r = validateProjectCommand(
      confirm(stale),
      { activeRunId: 'run-1', activeRunEvidence: DIGEST, decision: stored(stale) },
      actor,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('decision-run-mismatch');
  });

  test('a decision that moved since it was read is refused with both fingerprints', () => {
    const read = decisionFixture();
    const redrafted = decisionFixture({ summary: 'Rebuild — and drop the plant bypass.' });
    const r = validateProjectCommand(confirm(read), state(redrafted), actor);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('decision-moved');
      expect(r.error).toContain(read.fingerprint.slice(0, 12));
      expect(r.error).toContain(redrafted.fingerprint.slice(0, 12));
    }
  });

  test('a blocked decision cannot be confirmed, however current everything else is', () => {
    const blocked = decisionFixture({ contract: null, chosenOptionId: null });
    expect(decisionCoverage(blocked).state).toBe('blocked');
    const r = validateProjectCommand(confirm(blocked), state(blocked), actor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('decision-blocked');
  });

  test('confirming twice is refused: a change is a new revision', () => {
    const d = decisionFixture();
    const r = validateProjectCommand(confirm(d), state(d, { decision: stored(d, 'confirmed') }), actor);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('already-confirmed');
  });

  test('a withdrawal needs a confirmed decision, and keeps who confirmed it', () => {
    const d = decisionFixture();
    const nothing = validateProjectCommand({ command: 'withdraw-decision' }, state(d), actor);
    expect(nothing.ok).toBe(false);
    if (!nothing.ok) expect(nothing.code).toBe('not-confirmed');

    const confirmation = { account: 'owner@example.com', at: actor.now, selfDeclaration: SELF_DECLARATION };
    const r = validateProjectCommand(
      { command: 'withdraw-decision' },
      state(d, { decision: { ...d, status: 'confirmed', confirmation } }),
      actor,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const written = r.fields.decision as ProjectDecision;
      expect(written.status).toBe('withdrawn');
      expect(written.confirmation).toEqual(confirmation);
    }
  });

  test('a draft is stored as a draft, whatever it claims to be', () => {
    const d = decisionFixture();
    const r = validateProjectCommand(
      { command: 'record-decision-draft', decision: { ...d, fingerprint: undefined, status: 'confirmed' } },
      {},
      actor,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const written = r.fields.decision as ProjectDecision;
      expect(written.status).toBe('draft');
      expect(written.confirmation).toBeNull();
    }
  });

  test('a confirmed decision is not redrafted in place — withdraw first, then a new revision', () => {
    const d = decisionFixture();
    const confirmation = { account: 'owner@example.com', at: '2026-09-24T08:00:00.000Z', selfDeclaration: SELF_DECLARATION };
    const confirmedState = { decision: { ...d, status: 'confirmed', confirmation } };
    const r = validateProjectCommand({ command: 'record-decision-draft', decision: { ...d, fingerprint: undefined } }, confirmedState, actor);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.code).toBe('decision-confirmed');
    }
    // After a withdrawal the same draft is accepted again.
    const withdrawn = { decision: { ...d, status: 'withdrawn', confirmation } };
    expect(validateProjectCommand({ command: 'record-decision-draft', decision: { ...d, fingerprint: undefined } }, withdrawn, actor).ok).toBe(true);
  });
});

/* ========================================== the sentence, and where it lives */

test('the self-declaration is the product\'s one sentence, and the mockup\'s', () => {
  expect(SELF_DECLARATION).toBe(PROVENANCE.confirmed.meaning);
  // `DESIGN.md` §4 and `CLAUDE.md` both state it; the mockup puts it where the
  // confirmation happens rather than in a popover, and this pins that the
  // record and the picture say the same thing.
  const mockup = fs.readFileSync(
    path.join(process.cwd(), 'docs', 'roadmap', 'clean-core-mockups-v2_8.html'),
    'utf8',
  );
  expect(mockup).toContain('a self-declaration, not an organisational mandate');
});

/* ====================================== the three commands, through the route */

const DECISION_OWNER = `decision-owner-${Date.now()}@example.com`;
const DECISION_STRANGER = `decision-stranger-${Date.now()}@example.com`;
const DECISION_PASSWORD = 'DecisionRoute123!';
const DECISION_PROJECT = `decision-route-${Date.now()}`;

const clientApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const clientAuth = getAuth(clientApp);
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  try {
    connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }
}
const adminDb = (): Firestore => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};
const journal = async (action: string) =>
  (await adminDb().collection('audit_events').where('action', '==', `${action}:${DECISION_PROJECT}`).get()).size;

test.describe('8.4 — the decision commands through /api/projects/[id]/commands (emulator)', () => {
  test.describe.configure({ mode: 'serial' });

  let ownerToken = '';
  let strangerToken = '';
  const d = decisionFixture();

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    const owner = await createUserWithEmailAndPassword(clientAuth, DECISION_OWNER, DECISION_PASSWORD);
    ownerToken = await owner.user.getIdToken();
    await adminSetDoc('users', owner.user.uid, {
      firstName: 'Decision', lastName: 'Owner', email: DECISION_OWNER, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, mfaEnabled: false, createdAt: new Date(),
    });
    const stranger = await createUserWithEmailAndPassword(clientAuth, DECISION_STRANGER, DECISION_PASSWORD);
    strangerToken = await stranger.user.getIdToken();
    await adminSetDoc('users', stranger.user.uid, {
      firstName: 'Not', lastName: 'Yours', email: DECISION_STRANGER, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, mfaEnabled: false, createdAt: new Date(),
    });
    await adminSetDoc('projects', DECISION_PROJECT, {
      name: 'Decision route fixture',
      userId: owner.user.uid,
      createdAt: new Date(),
      status: 'analyzed',
      legacyCode: SOURCE,
      activeRunId: 'run-1',
      originalRecommendation: RUN.originalRecommendation,
    });
    // The run the decision is bound to; its digest is `DIGEST`, which the
    // fixture decision names.
    await adminSetDoc(`projects/${DECISION_PROJECT}/runs`, 'run-1', {
      ...RUN,
      runId: 'run-1',
      projectId: DECISION_PROJECT,
      userId: owner.user.uid,
    });
  });

  const post = (request: APIRequestContext, token: string | null, data: Record<string, unknown>) =>
    request.post(`/api/projects/${DECISION_PROJECT}/commands`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      data,
    });
  const confirmBody = (over: Record<string, unknown> = {}) => ({
    command: 'confirm-decision',
    expectedRunId: 'run-1',
    expectedEvidenceDigest: DIGEST,
    expectedDecisionFingerprint: d.fingerprint,
    ...over,
  });
  const storedDecision = async () =>
    ((await adminGetDoc('projects', DECISION_PROJECT)) || {}).decision as ProjectDecision | undefined;

  test('without a token nothing is drafted', async ({ request }) => {
    const res = await post(request, null, { command: 'record-decision-draft', decision: d });
    expect(res.status()).toBe(401);
    expect(await storedDecision()).toBeUndefined();
    expect(await journal('PROJECT_DECISION_DRAFTED')).toBe(0);
  });

  test('another account cannot draft on this project, and is told what a missing project is told', async ({ request }) => {
    const res = await post(request, strangerToken, { command: 'record-decision-draft', decision: d });
    expect(res.status()).toBe(404);
    expect(await storedDecision()).toBeUndefined();
    expect(await journal('PROJECT_DECISION_DRAFTED')).toBe(0);
  });

  test('the owner drafts: stored as a draft whatever it claims, with one journal entry', async ({ request }) => {
    const res = await post(request, ownerToken, {
      command: 'record-decision-draft',
      decision: { ...d, status: 'confirmed', confirmation: { account: 'cto@example.com', at: '1999', selfDeclaration: 'x' } },
    });
    expect(res.status()).toBe(200);
    const stored = await storedDecision();
    expect(stored?.status).toBe('draft');
    expect(stored?.confirmation).toBeNull();
    expect(await journal('PROJECT_DECISION_DRAFTED')).toBe(1);
  });

  test('a confirmation of a decision that moved is refused and writes neither decision nor journal', async ({ request }) => {
    const res = await post(request, ownerToken, confirmBody({ expectedDecisionFingerprint: 'e'.repeat(64) }));
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe('decision-moved');
    expect((await storedDecision())?.status).toBe('draft');
    expect(await journal('PROJECT_DECISION_CONFIRMED')).toBe(0);
  });

  test('a confirmation from another account is refused', async ({ request }) => {
    const res = await post(request, strangerToken, confirmBody());
    expect(res.status()).toBe(404);
    expect((await storedDecision())?.status).toBe('draft');
    expect(await journal('PROJECT_DECISION_CONFIRMED')).toBe(0);
  });

  test('the owner confirms: the token names the confirmer and the server clock the time', async ({ request }) => {
    const before = Date.now();
    const res = await post(
      request,
      ownerToken,
      confirmBody({ confirmation: { account: 'cto@example.com', at: '1999-01-01T00:00:00.000Z', selfDeclaration: 'x' } }),
    );
    expect(res.status()).toBe(200);
    const stored = await storedDecision();
    expect(stored?.status).toBe('confirmed');
    expect(stored?.confirmation?.account, 'the body chose the confirmer').toBe(DECISION_OWNER);
    expect(stored?.confirmation?.selfDeclaration).toBe(SELF_DECLARATION);
    const at = Date.parse(String(stored?.confirmation?.at));
    expect(at, 'not the server clock').toBeGreaterThanOrEqual(before - 60_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(await journal('PROJECT_DECISION_CONFIRMED')).toBe(1);
  });

  test('confirming twice is refused and journals nothing', async ({ request }) => {
    const res = await post(request, ownerToken, confirmBody());
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe('already-confirmed');
    expect(await journal('PROJECT_DECISION_CONFIRMED')).toBe(1);
  });

  test('another account cannot withdraw it', async ({ request }) => {
    const res = await post(request, strangerToken, { command: 'withdraw-decision' });
    expect(res.status()).toBe(404);
    expect((await storedDecision())?.status).toBe('confirmed');
    expect(await journal('PROJECT_DECISION_WITHDRAWN')).toBe(0);
  });

  test('the owner withdraws: the confirmation stays on the record, one journal entry', async ({ request }) => {
    const res = await post(request, ownerToken, { command: 'withdraw-decision' });
    expect(res.status()).toBe(200);
    const stored = await storedDecision();
    expect(stored?.status).toBe('withdrawn');
    expect(stored?.confirmation?.account).toBe(DECISION_OWNER);
    expect(await journal('PROJECT_DECISION_WITHDRAWN')).toBe(1);
  });

  test('withdrawing again is refused and journals nothing', async ({ request }) => {
    const res = await post(request, ownerToken, { command: 'withdraw-decision' });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe('not-confirmed');
    expect(await journal('PROJECT_DECISION_WITHDRAWN')).toBe(1);
  });
});
