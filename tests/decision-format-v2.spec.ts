/**
 * Roadmap 3.0.20, step F9 — the decision record, format 2 (owner decision 21.10.2026).
 *
 * "Move to SAP standard" binds the confirmed fit-to-standard design
 * (`standard-design`) and carries its gaps as derived conditions inside the
 * fingerprinted record; every other decision stays format 1, byte for byte.
 *
 * The four format-1 fingerprints below were computed by the code on `dev` at
 * 18a3d8e3, before format 2 existed: the same inputs must still give the same
 * canonical bytes and the same fingerprint, and a record written then must read
 * back unchanged. Server-free.
 */
import { test, expect } from '@playwright/test';
import {
  DECISION_BINDINGS,
  DECISION_BINDINGS_V2,
  DECISION_VERSION,
  DECISION_VERSION_2,
  canonicalProjectDecision,
  conditionAttestable,
  decisionConfirmable,
  decisionCoverage,
  decisionFingerprint,
  emptyProjectDecision,
  normaliseProjectDecision,
  type ProjectDecision,
} from '../lib/project-decision';
import { buildProjectDecision, type BuildDecisionArgs } from '../lib/project-decision-build';
import { deriveDecisionDraft, standardDesignBasisOf, type DecisionDraftFacts } from '../lib/decision-draft';
import { fitDesignDigest, type FitToStandardSummary } from '../lib/fit-to-standard-store';
import { decisionCardView } from '../lib/decision-card';
import { decisionManagerView } from '../lib/decision-manager';

const args = (over: Partial<BuildDecisionArgs> = {}): BuildDecisionArgs => ({
  summary: 'Retire this object, as the signed-off target architecture says.',
  runId: 'run-1',
  evidenceDigest: 'd'.repeat(64),
  contract: null,
  assumptions: null,
  comparison: null,
  chosenOptionId: 'retire · Retire / Decommission',
  chosenOptionKind: 'retire',
  need: { revision: 2, confirmedDrops: 1, undecided: 3, open: { rules: 2, decisions: 1 } },
  handedOver: false,
  signOff: { by: 'owner@example.com', at: '2026-10-20T10:00:00.000Z', reason: 'No longer used.', notCurrent: null },
  attestations: [{ conditionId: 'C-1', status: 'met', account: 'owner@example.com', at: '2026-10-20T11:00:00.000Z', note: 'Done.' }],
  timeline: { runSignedAt: '2026-10-20T09:00:00.000Z', draftedAt: '2026-10-20T12:00:00.000Z' },
  ...over,
});

/** Computed on dev 18a3d8e3, before format 2 — never recompute these from the code under test. */
const FORMAT_1_PINS: ReadonlyArray<[string, Partial<BuildDecisionArgs>, string]> = [
  ['retire, resting on the sign-off', {}, 'c98798838b861e7b9b479966a3fe8762f6807ea1929d54f84a0b586a02a3590a'],
  ['keep', { chosenOptionId: 'keep · Keep', chosenOptionKind: 'keep', summary: 'Keep.' }, '2d1cea010e1cd29afa8fea8dac6580955c681337fae9f5a898ad0652a83aeee7'],
  ['no option', { chosenOptionId: null, chosenOptionKind: null }, '67319101d1acf1ea56f39898509f7cecf68b435fbd690ae8b0736d0be98a1898'],
  ['rebuild without a contract', { chosenOptionId: 'rap · In-App ABAP Cloud (RAP)', chosenOptionKind: 'rebuild', signOff: null }, '5d3cffef61a965a10e00a806987872adad0daa900f21d16face377644d57ad12'],
];

const SUMMARY: FitToStandardSummary = {
  revision: 3,
  confirmed: true,
  runId: 'run-1',
  sourceSha256: 'a'.repeat(64),
  edition: 'public',
  gateClasses: ['A'],
  againstGate: false,
  counts: { elements: 9, givenUp: 2, covered: 1, configuration: 0, gapKeyUser: 1, gapOrganisational: 1, gapOpen: 1, goesWithProgram: 3, unknown: 0 },
  conditions: [
    { elementId: 'n4', basis: 'derived', disposition: 'gap-open', text: 'Open gap: "Check the credit limit" (L40–L52) — nothing covering it has been named.', anchor: { lineStart: 40, lineEnd: 52 } },
    { elementId: 'deviation-L49', basis: 'stated', disposition: 'gap-key-user', text: 'Key-user extension for "BAdI implementation" (L49–L81) (Custom Logic).', anchor: { lineStart: 49, lineEnd: 81 } },
    { elementId: 'n7', basis: 'stated', disposition: 'gap-organisational', text: 'Organisational change for "Release the order" (L90): the team lead releases by hand.', anchor: { lineStart: 90, lineEnd: 90 } },
  ],
  confirmedBy: 'Owner Name',
  confirmedAt: '2026-10-21T09:00:00.000Z',
  needRevision: 4,
};

const standard = (over: Partial<BuildDecisionArgs> = {}) =>
  buildProjectDecision(
    args({
      summary: 'Move this object to SAP standard, as the account chose.',
      chosenOptionId: 'standard · Move to SAP standard',
      chosenOptionKind: 'standard',
      attestations: [],
      standardDesign: standardDesignBasisOf(SUMMARY),
      ...over,
    }),
  );

const binding = (d: ProjectDecision, key: string) => d.bindings.find((b) => b.key === key);

test.describe('format 1 stays byte for byte', () => {
  for (const [name, over, pin] of FORMAT_1_PINS) {
    test(`${name}: the fingerprint of dev 18a3d8e3`, () => {
      const d = buildProjectDecision(args(over));
      expect(d.decisionVersion).toBe(DECISION_VERSION);
      expect(d.bindings.map((b) => b.key)).toEqual([...DECISION_BINDINGS]);
      expect(canonicalProjectDecision(d)).not.toContain('standard-design');
      expect(d.fingerprint).toBe(pin);
      // A record stored then reads back as itself.
      const read = normaliseProjectDecision(JSON.parse(JSON.stringify(d)));
      expect(read.ok).toBe(true);
      if (read.ok) expect(read.decision.fingerprint).toBe(pin);
    });
  }

  test('the empty decision and a design on the facts change nothing for another option', () => {
    expect(emptyProjectDecision().fingerprint).toBe('a56a43430e2e51c823ba9ef5329d9454d1f3bff59212447573564fa4bdf8bd2e');
    const retire = buildProjectDecision(args({ standardDesign: standardDesignBasisOf(SUMMARY) }));
    expect(retire.fingerprint).toBe(FORMAT_1_PINS[0][2]);
  });

  test('a format-1 record cannot carry a fit-to-standard gap', () => {
    const d = buildProjectDecision(args());
    const smuggled = JSON.parse(JSON.stringify(d)) as ProjectDecision;
    smuggled.conditions.push({ ...standard().conditions.find((c) => c.source === 'fit-gap')! });
    const read = normaliseProjectDecision({ ...smuggled, fingerprint: undefined });
    expect(read.ok).toBe(false);
  });
});

test.describe('format 2: "Move to SAP standard" binds the design', () => {
  test('six bindings, the design by revision, run and digest; its gaps as derived conditions', () => {
    const d = standard();
    expect(d.decisionVersion).toBe(DECISION_VERSION_2);
    expect(d.bindings.map((b) => b.key)).toEqual([...DECISION_BINDINGS_V2]);
    const design = binding(d, 'standard-design')!;
    expect(design.revision).toBe(`fit/r3@run-1+${fitDesignDigest(SUMMARY).slice(0, 12)}`);
    expect(design.provenance).toBe('confirmed');
    expect(design.note).toContain('2 given up, 3 gaps (1 key user, 1 organisational, 1 open)');
    expect(design.note).toContain('self-declaration');

    const gaps = d.conditions.filter((c) => c.source === 'fit-gap');
    expect(gaps.map((c) => c.id).sort()).toEqual(['fit:deviation-L49', 'fit:n4', 'fit:n7']);
    for (const c of gaps) {
      expect(c.status).toBe('open');
      expect(c.statusBasis).toBe('derived');
      expect(conditionAttestable(c)).toBe(false);
      expect(c.evidence).toMatch(/^fit\/r3:gap-/);
    }
    expect(gaps.find((c) => c.id === 'fit:n4')!.provenance).toBe('reconstructed');
    expect(gaps.find((c) => c.id === 'fit:n7')!.provenance).toBe('confirmed');
    // Qualified by its open conditions, never blocked by them.
    expect(decisionConfirmable(d)).toBe(true);
    expect(decisionCoverage(d).gaps.filter((g) => g.code === 'condition-open').length).toBeGreaterThanOrEqual(3);
  });

  test('the verifier reads it back; every bound byte is inside the fingerprint', () => {
    const d = standard();
    const read = normaliseProjectDecision(JSON.parse(JSON.stringify(d)));
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.decision.fingerprint).toBe(d.fingerprint);

    // Another design revision, another digest, a gap reworded: each is a new fingerprint.
    const other = standard({ standardDesign: standardDesignBasisOf({ ...SUMMARY, revision: 4 }) });
    expect(other.fingerprint).not.toBe(d.fingerprint);
    const tampered = JSON.parse(JSON.stringify(d)) as ProjectDecision;
    tampered.conditions.find((c) => c.id === 'fit:n4')!.text = 'Covered by SAP standard.';
    const refused = normaliseProjectDecision(tampered);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain('is not the decision that was sent');
  });

  test('an open gap cannot be waived — not by a record, not by an attestation', () => {
    const d = standard();
    const waived = JSON.parse(JSON.stringify(d)) as ProjectDecision;
    waived.conditions.find((c) => c.id === 'fit:n4')!.status = 'waived';
    expect(normaliseProjectDecision({ ...waived, fingerprint: undefined }).ok).toBe(false);

    const attested = standard({
      attestations: [{ conditionId: 'fit:n4', status: 'waived', account: 'owner@example.com', at: '2026-10-21T10:00:00.000Z', note: 'We accept it.' }],
    });
    expect(attested.conditions.find((c) => c.id === 'fit:n4')!.status).toBe('open');
    expect(attested.conditions.find((c) => c.id === 'account:fit:n4')!.statusBasis).toBe('attested');
  });

  test('without a confirmed design: not determined, qualified, still confirmable', () => {
    const d = standard({ standardDesign: null });
    expect(d.decisionVersion).toBe(DECISION_VERSION_2);
    const design = binding(d, 'standard-design')!;
    expect(design.revision).toBeNull();
    expect(design.notDeterminedReason).toContain('No confirmed fit-to-standard design');
    expect(d.conditions.some((c) => c.source === 'fit-gap')).toBe(false);
    expect(decisionCoverage(d).gaps.map((g) => g.code)).toContain('standard-design-not-bound');
    expect(decisionConfirmable(d)).toBe(true);
    // An unconfirmed summary binds nothing either.
    expect(standardDesignBasisOf({ ...SUMMARY, confirmed: false })).toBeNull();
  });

  test('a design made against the gate is bound and says so; the decision is qualified by it', () => {
    const d = standard({ standardDesign: standardDesignBasisOf({ ...SUMMARY, againstGate: true }) });
    expect(binding(d, 'standard-design')!.revision).toMatch(/^against-gate:fit\/r3@run-1\+/);
    expect(binding(d, 'standard-design')!.note).toContain('never counts as a recommendation');
    expect(decisionCoverage(d).gaps.map((g) => g.code)).toContain('standard-design-against-gate');
  });

  test('a signed field never carries a clean core level or a view', () => {
    const text = canonicalProjectDecision(standard()) + JSON.stringify(standard());
    expect(text).not.toMatch(/\blevel [A-D]\b|clean[- ]core level|\b(Business|Management|IT) view\b/i);
  });

  test('the card and Management name the design and send each gap to it', () => {
    const d = standard();
    const card = decisionCardView(d);
    const shown = card.bindings.find((b) => b.key === 'standard-design')!;
    expect(shown.label).toBe('fit-to-standard design');
    expect(shown.shown).toBe('revision 3, confirmed by you');
    const view = decisionManagerView(d);
    const gap = view.points.find((p) => p.id === 'fit:n4')!;
    expect(gap.place).toMatchObject({ kind: 'stage', path: 'design', hash: 'fit-to-standard' });
    expect(view.other.map((p) => p.id)).toContain('fit:n4');
  });
});

test.describe('the draft of a project', () => {
  const facts = (over: Partial<DecisionDraftFacts> = {}): DecisionDraftFacts => ({
    runId: 'run-1',
    evidenceDigest: 'd'.repeat(64),
    runSignedAt: '2026-10-20T09:00:00.000Z',
    contract: null,
    signedOffArchitecture: 'standard',
    signOff: { by: 'owner@example.com', at: '2026-10-20T10:00:00.000Z', reason: 'The standard does it.', notCurrent: null },
    need: { revision: 4, confirmedDrops: 2, undecided: 0, open: { rules: 0, decisions: 0 } },
    handedOver: false,
    stored: null,
    fitDesign: SUMMARY,
    now: '2026-10-21T12:00:00.000Z',
    ...over,
  });

  test('"Move to SAP standard" is drafted in format 2 with the confirmed design', () => {
    const { draft } = deriveDecisionDraft(facts());
    expect(draft.decisionVersion).toBe(DECISION_VERSION_2);
    expect(binding(draft, 'standard-design')!.revision).toMatch(/^fit\/r3@run-1\+/);
  });

  test('a stored record re-derives to itself; a design confirmed again makes it a new revision', () => {
    const first = deriveDecisionDraft(facts());
    const stored = { ...first.draft, status: 'confirmed', confirmation: { account: 'owner@example.com', at: '2026-10-21T12:05:00.000Z', selfDeclaration: 'x' } };
    expect(deriveDecisionDraft(facts({ stored })).unchanged).toBe(true);
    const moved = deriveDecisionDraft(facts({ stored, fitDesign: { ...SUMMARY, revision: 5 } }));
    expect(moved.unchanged).toBe(false);
    expect(moved.draft.revision).toBe(2);
  });

  test('a decision for another option ignores the design and stays format 1', () => {
    const { draft } = deriveDecisionDraft(facts({ signedOffArchitecture: 'retire' }));
    expect(draft.decisionVersion).toBe(DECISION_VERSION);
    expect(binding(draft, 'standard-design')).toBeUndefined();
    expect(decisionFingerprint(draft)).toBe(draft.fingerprint);
  });
});
