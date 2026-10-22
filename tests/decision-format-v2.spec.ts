/**
 * The decision record stays format 1, byte for byte.
 *
 * Roadmap 3.0.20 built a format 2 for "Move to SAP standard" (step F9); it was
 * removed again with fit to standard by owner decision 21.10.2026. Every
 * decision, "Move to SAP standard" included, is format 1 as in v3.0.19.
 *
 * The four format-1 fingerprints below were computed by the code on `dev` at
 * 18a3d8e3, before format 2 existed: the same inputs must still give the same
 * canonical bytes and the same fingerprint, and a record written then must read
 * back unchanged. Server-free.
 */
import { test, expect } from '@playwright/test';
import {
  DECISION_BINDINGS,
  DECISION_VERSION,
  canonicalProjectDecision,
  decisionFingerprint,
  emptyProjectDecision,
  normaliseProjectDecision,
} from '../lib/project-decision';
import * as projectDecision from '../lib/project-decision';
import { buildProjectDecision, type BuildDecisionArgs } from '../lib/project-decision-build';

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

  test('the empty decision keeps its fingerprint', () => {
    expect(emptyProjectDecision().fingerprint).toBe('a56a43430e2e51c823ba9ef5329d9454d1f3bff59212447573564fa4bdf8bd2e');
  });

  test('"Move to SAP standard" is format 1 with the five bindings, as in v3.0.19 (owner decision 21.10.2026)', () => {
    const d = buildProjectDecision(
      args({ summary: 'Move this object to SAP standard, as the account chose.', chosenOptionId: 'standard · Move to SAP standard', chosenOptionKind: 'standard', attestations: [] }),
    );
    expect(d.decisionVersion).toBe(DECISION_VERSION);
    expect(d.bindings.map((b) => b.key)).toEqual([...DECISION_BINDINGS]);
    expect(canonicalProjectDecision(d)).not.toContain('standard-design');
    expect(d.conditions.some((c) => (c.source as string) === 'fit-gap')).toBe(false);
    // Format 2 and its bindings are gone from the module.
    expect(Object.keys(projectDecision).filter((k) => /^DECISION_\w*_?V(?:ERSION_)?2$/.test(k))).toEqual([]);
  });
});

const LEVEL_OR_VIEW = /\blevel [A-D]\b|clean[- ]core level|\b(Business|Management|IT) view\b/i;

test.describe('format 1 keeps its integrity checks', () => {
  test('the fingerprint is recomputed, never believed; a wrong one is refused; no Level or view rides along', () => {
    for (const [, over] of FORMAT_1_PINS) {
      const d = buildProjectDecision(args(over));
      expect(decisionFingerprint(d)).toBe(d.fingerprint);
      // Missing: recomputed from the record (lib/project-decision.ts, normaliseProjectDecision).
      const missing = normaliseProjectDecision({ ...JSON.parse(JSON.stringify(d)), fingerprint: undefined });
      expect(missing.ok).toBe(true);
      if (missing.ok) expect(missing.decision.fingerprint).toBe(d.fingerprint);
      // Wrong: the record is refused.
      expect(normaliseProjectDecision({ ...JSON.parse(JSON.stringify(d)), fingerprint: '0'.repeat(64) }).ok).toBe(false);
      // The clean core Level and the three views are never part of what a decision signs.
      expect(canonicalProjectDecision(d)).not.toMatch(LEVEL_OR_VIEW);
    }
    // Two different decisions never share a fingerprint.
    expect(new Set(FORMAT_1_PINS.map(([, over]) => buildProjectDecision(args(over)).fingerprint)).size).toBe(FORMAT_1_PINS.length);
  });
});
