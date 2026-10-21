import { test, expect } from '@playwright/test';
import { costAssumptionsFingerprint, costAssumptionsRevision, costComparison } from '../lib/cost-assumptions';
import { costRevisionFactsOf } from '../lib/delivery-facts';
import type { HandoverProject } from '../lib/handover';
import { nextRevisionMarks, readEconomicsRecord } from '../lib/economics-record';
import { KEEP_CHEAPEST, OVERLAP, REBUILD_CHEAPEST, assumptions, rebuild, record } from './helpers/decision-cost-fixtures';
import {
  costBasisOf,
  costRevisionWords,
  decisionCostCheck,
  decisionCostLine,
  outdatedReasons,
  outdatedReasonsOfAnswer,
  readCostBasis,
  sameCostRevision,
} from '../lib/decision-cost';

/**
 * ADR-092 (owner, 11.10.2026) — the cost revision bound into the decision, and
 * the one rule for when a later cost change makes a confirmed decision out of
 * date: only when a *different* option is now the cheapest, by the same
 * comparison Economics shows. Pure: no server, no emulator.
 */

test.describe('ADR-092 — the fixtures are what they say', () => {
  test('the comparison names Rebuild, then Keep, then nothing', () => {
    expect(costComparison(REBUILD_CHEAPEST).winner).toBe('rebuild');
    expect(costComparison(KEEP_CHEAPEST).winner).toBe('keep');
    expect(costComparison(OVERLAP).winner).toBeNull();
    expect(costComparison(OVERLAP).refusal?.code).toBe('ranges-overlap');
  });
});

test.describe('ADR-092 — what a confirmation records', () => {
  test('the revision, its number and day, and the cheapest option by the Economics comparison', () => {
    const basis = costBasisOf(record(REBUILD_CHEAPEST, 3));
    expect(basis).toEqual({
      format: 1,
      revision: costAssumptionsRevision(REBUILD_CHEAPEST),
      fingerprint: costAssumptionsFingerprint(REBUILD_CHEAPEST),
      sequence: 3,
      at: '2026-10-10T09:00:00.000Z',
      cheapest: { optionId: 'rebuild', label: 'Rebuild', kind: 'rebuild' },
      noCheapest: null,
    });
    // No amount is recorded — the basis names options, never money (ADR-022).
    expect(Object.keys(basis).sort()).toEqual(['at', 'cheapest', 'fingerprint', 'format', 'noCheapest', 'revision', 'sequence']);
    expect(Object.keys(basis.cheapest ?? {}).sort()).toEqual(['kind', 'label', 'optionId']);
  });

  test('no cheapest option is recorded with its reason; no figures as "no-figures"', () => {
    expect(costBasisOf(record(OVERLAP, 1))).toMatchObject({ cheapest: null, noCheapest: 'ranges-overlap' });
    expect(costBasisOf(null)).toEqual({ format: 1, revision: null, fingerprint: null, sequence: null, at: null, cheapest: null, noCheapest: 'no-figures' });
  });

  test('read back only when it is the shape it was written in', () => {
    const basis = costBasisOf(record(REBUILD_CHEAPEST, 2));
    expect(readCostBasis(JSON.parse(JSON.stringify(basis)))).toEqual(basis);
    expect(readCostBasis(costBasisOf(null))).toEqual(costBasisOf(null));
    expect(readCostBasis(undefined)).toBeNull();
    expect(readCostBasis({ ...basis, format: 2 })).toBeNull();
    // A cheapest option and a reason for none at once is not a record this server wrote.
    expect(readCostBasis({ ...basis, noCheapest: 'ranges-overlap' })).toBeNull();
    expect(readCostBasis({ ...basis, cheapest: null, noCheapest: 'made-up' })).toBeNull();
  });
});

test.describe('owner 21.10.2026 — the same revision is the same full fingerprint, not the same twelve characters', () => {
  // Two different sets of figures whose revision keys agree (the key carries twelve hex characters of the
  // fingerprint): the full fingerprint tells them apart.
  const KEY = costAssumptionsRevision(REBUILD_CHEAPEST);
  const then = costBasisOf({ ...record(REBUILD_CHEAPEST, 1), revision: KEY });
  const now = costBasisOf({ ...record(KEEP_CHEAPEST, 2), revision: KEY });

  test('a key that agrees with other figures behind it is no longer "same"', () => {
    expect(then.revision).toBe(now.revision);
    expect(then.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(then.fingerprint).not.toBe(now.fingerprint);
    expect(sameCostRevision(then, now)).toBe(false);
    expect(decisionCostCheck(then, now).state).toBe('outdated');
    expect(decisionCostCheck(then, costBasisOf(record(REBUILD_CHEAPEST, 1))).state).toBe('same');
  });

  test('a basis recorded before 3.0.20 has no fingerprint, is still read, and is compared by its key', () => {
    const { fingerprint: _drop, ...old } = then;
    void _drop;
    const read = readCostBasis(JSON.parse(JSON.stringify(old)))!;
    expect(read).not.toBeNull();
    expect(read.fingerprint).toBeNull();
    expect(decisionCostCheck(read, now).state).toBe('same');
    // A fingerprint that is not 64 hex characters is not one.
    expect(readCostBasis({ ...then, fingerprint: 'abc' })!.fingerprint).toBeNull();
    expect(readCostBasis(JSON.parse(JSON.stringify(then)))).toEqual(then);
  });

  test('the delivery package copies the figures only when the full fingerprint matches', () => {
    const held = (economics: ReturnType<typeof record>) =>
      costRevisionFactsOf({ _economics: economics } as unknown as HandoverProject, then, 'DEC-1')!.figures;
    expect(held(record(REBUILD_CHEAPEST, 1))).not.toBeNull();
    expect(held({ ...record(KEEP_CHEAPEST, 1), revision: KEY })).toBeNull();
  });
});

test.describe('ADR-092 — when a later cost change outdates a confirmed decision', () => {
  const on = costBasisOf(record(REBUILD_CHEAPEST, 1, '2026-10-10T09:00:00.000Z'));

  test('same revision: confirmed, priced on it', () => {
    const check = decisionCostCheck(on, costBasisOf(record(REBUILD_CHEAPEST, 1)));
    expect(check.state).toBe('same');
    expect(decisionCostLine(check)).toBe('Priced on revision 1 (10 Oct 2026), on which "Rebuild" is the cheapest option.');
    expect(outdatedReasons({ confirmed: true, unchanged: true, cost: check })).toEqual([]);
  });

  test('the costs changed and the same option is the cheapest: not outdated, with the note', () => {
    const cheaper = assumptions(rebuild(8, 12));
    expect(costComparison(cheaper).winner).toBe('rebuild');
    const check = decisionCostCheck(on, costBasisOf(record(cheaper, 2, '2026-10-11T08:00:00.000Z')));
    expect(check.state).toBe('changed');
    expect(decisionCostLine(check)).toBe(
      'Priced on revision 1 (10 Oct 2026), costs changed since (revision 2 (11 Oct 2026)). "Rebuild" is still the cheapest.',
    );
    expect(outdatedReasons({ confirmed: true, unchanged: true, cost: check })).toEqual([]);
  });

  test('a different option is the cheapest now: outdated, by cost', () => {
    const check = decisionCostCheck(on, costBasisOf(record(KEEP_CHEAPEST, 2, '2026-10-11T08:00:00.000Z')));
    expect(check.state).toBe('outdated');
    expect(decisionCostLine(check)).toBe(
      'Priced on revision 1 (10 Oct 2026), when "Rebuild" was the cheapest; costs changed since (revision 2 (11 Oct 2026)), and now "Keep" is.',
    );
    expect(outdatedReasons({ confirmed: true, unchanged: true, cost: check })).toEqual(['cost']);
    // One state with both reasons, when the evidence moved as well (ADR-085).
    expect(outdatedReasons({ confirmed: true, unchanged: false, cost: check })).toEqual(['evidence', 'cost']);
    // A decision that is not confirmed is never outdated.
    expect(outdatedReasons({ confirmed: false, unchanged: false, cost: check })).toEqual([]);
  });

  test('no cheapest option on either side: not outdated by cost, and the change is shown', () => {
    const nowNone = decisionCostCheck(on, costBasisOf(record(OVERLAP, 2, '2026-10-11T08:00:00.000Z')));
    expect(nowNone.state).toBe('changed');
    expect(outdatedReasons({ confirmed: true, unchanged: true, cost: nowNone })).toEqual([]);
    expect(decisionCostLine(nowNone)).toBe(
      'Priced on revision 1 (10 Oct 2026), costs changed since (revision 2 (11 Oct 2026)). Then "Rebuild" is the cheapest, now no option is the cheapest — so the change does not overturn the decision.',
    );

    const thenNone = decisionCostCheck(costBasisOf(record(OVERLAP, 1)), costBasisOf(record(KEEP_CHEAPEST, 2)));
    expect(thenNone.state).toBe('changed');
    expect(outdatedReasons({ confirmed: true, unchanged: true, cost: thenNone })).toEqual([]);

    // Figures removed since: no cheapest now, so not outdated by cost either.
    const removed = decisionCostCheck(on, costBasisOf(null));
    expect(removed.state).toBe('changed');
    expect(decisionCostLine(removed)).toMatch(/^Priced on revision 1 \(10 Oct 2026\), the figures were removed since\./);
  });

  test('no recorded revision: said explicitly, never guessed, never outdated by cost', () => {
    const check = decisionCostCheck(null, costBasisOf(record(KEEP_CHEAPEST, 4)));
    expect(check.state).toBe('not-recorded');
    expect(decisionCostLine(check)).toBe('Cost revision not recorded (decision taken before 3.0.10).');
    expect(outdatedReasons({ confirmed: true, unchanged: true, cost: check })).toEqual([]);
  });

  test('confirmed without figures: says so, and what Economics holds since', () => {
    const none = costBasisOf(null);
    expect(decisionCostLine(decisionCostCheck(none, costBasisOf(null)))).toBe('No cost figures were stored when this decision was confirmed.');
    expect(decisionCostLine(decisionCostCheck(none, costBasisOf(record(KEEP_CHEAPEST, 1))))).toBe(
      'No cost figures were stored when this decision was confirmed; Economics holds revision 1 (10 Oct 2026) since.',
    );
  });

  test('a revision from before the numbering is named by its day, never by a made-up number or its key', () => {
    const old = costBasisOf(record(REBUILD_CHEAPEST));
    expect(old.sequence).toBeNull();
    expect(costRevisionWords(old)).toBe('the revision saved 10 Oct 2026');
    expect(decisionCostLine(decisionCostCheck(old, old))).not.toContain(old.revision as string);
  });
});

test.describe('ADR-092 — the answer of the decision route', () => {
  test('the route\'s reasons are read as sent; an older answer falls back to the fingerprint rule', () => {
    expect(outdatedReasonsOfAnswer({ stored: { status: 'confirmed' }, unchanged: true, outdated: ['cost'] })).toEqual(['cost']);
    expect(outdatedReasonsOfAnswer({ stored: { status: 'confirmed' }, unchanged: false })).toEqual(['evidence']);
    expect(outdatedReasonsOfAnswer({ stored: { status: 'confirmed' }, unchanged: true })).toEqual([]);
    expect(outdatedReasonsOfAnswer({ stored: { status: 'draft' }, unchanged: false, outdated: ['cost'] })).toEqual([]);
  });
});

test.describe('ADR-092 — Economics numbers its revisions', () => {
  const now = '2026-10-11T08:00:00.000Z';
  test('first save is 1; an unchanged revision keeps its number and day; a new one counts on', () => {
    const r = costAssumptionsRevision(REBUILD_CHEAPEST);
    expect(nextRevisionMarks(null, r, now)).toEqual({ sequence: 1, revisionAt: now });
    const first = record(REBUILD_CHEAPEST, 1, '2026-10-10T09:00:00.000Z');
    expect(nextRevisionMarks(first, r, now)).toEqual({ sequence: 1, revisionAt: '2026-10-10T09:00:00.000Z' });
    expect(nextRevisionMarks(first, costAssumptionsRevision(KEEP_CHEAPEST), now)).toEqual({ sequence: 2, revisionAt: now });
  });

  test('a record from before 3.0.10 has no number: counting starts at 1, never guessed from it', () => {
    const old = record(REBUILD_CHEAPEST);
    expect(nextRevisionMarks(old, costAssumptionsRevision(KEEP_CHEAPEST), now)).toEqual({ sequence: 1, revisionAt: now });
    // The same revision saved again keeps the day it is known to have been saved on.
    expect(nextRevisionMarks(old, old.revision, now)).toEqual({ sequence: 1, revisionAt: old.savedAt });
  });

  test('the number and day are read back off the stored record, and only when well-formed', () => {
    const stored = JSON.parse(JSON.stringify(record(REBUILD_CHEAPEST, 5)));
    expect(readEconomicsRecord(stored)).toMatchObject({ sequence: 5, revisionAt: '2026-10-10T09:00:00.000Z' });
    const bad = readEconomicsRecord({ ...stored, sequence: 0 });
    expect(bad && 'sequence' in bad).toBe(false);
  });
});
