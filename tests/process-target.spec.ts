import { test, expect } from '@playwright/test';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { UNANCHORED, applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel, type ProcessMapModel } from '../lib/process-map';
import type { ElementState, ProcessStates, StateEntry } from '../lib/process-states';
import {
  NEED_WITHOUT_CODE,
  buildTargetModel,
  compareIstSoll,
  type ComparisonRow,
  type TargetSubject,
} from '../lib/process-target';

/**
 * Ist and Soll — roadmap 3.6, and the Phase-3 condition C23-A06.
 *
 * With no server at all: the derivation is two pure functions over a
 * reconstructed process and a set of statements, and what "stays", "goes" and
 * "open" mean must not depend on a browser, a route or the order a store
 * returned two documents in.
 *
 * The Ist is built out of real ABAP through 2.6 and 2.4 rather than written out
 * as a fixture object, so the element ids, the line anchors and the one element
 * that has no anchor are the ones the product actually produces. A hand-built
 * model would let a wrong derivation pass by agreeing with itself.
 */

const FILE_NAME = 'Z_TARGET_FIXTURE.abap';

/** Line feeds only: the same bytes here and in CI (`CLAUDE.md`, gotchas). */
const FIXTURE = [
  'REPORT z_target_fixture.',                 // 1
  '',                                         // 2
  'START-OF-SELECTION.',                      // 3
  '  PERFORM check_limit.',                   // 4
  '  PERFORM post_document.',                 // 5
  '',                                         // 6
  'FORM check_limit.',                        // 7
  "  IF lv_amount > '5000'.",                 // 8
  '    MESSAGE e001(zmm).',                   // 9
  '  ELSE.',                                  // 10
  "    UPDATE zmm_log SET note = 'ok'.",      // 11
  '  ENDIF.',                                 // 12
  'ENDFORM.',                                 // 13
  '',                                         // 14
  'FORM post_document.',                      // 15
  "  IF lv_kind = 'A'.",                      // 16
  '    INSERT INTO zmm_doc VALUES ls_row.',   // 17
  '  ELSE.',                                  // 18
  "    UPDATE zmm_doc SET flag = 'X'.",       // 19
  '  ENDIF.',                                 // 20
  "  CALL FUNCTION 'Z_SEND_MAIL'.",           // 21
  '',                                         // 22 — no ENDFORM: the end of this
].join('\n');                                 //      routine has nothing to anchor to

function istModel(): ProcessMapModel {
  const bpmn = buildBpmnExportFromSource(FIXTURE, {
    processName: 'Emergency purchase approval',
    sourceFileName: FILE_NAME,
  });
  const named = applyNaming(namingContextOf(FIXTURE), null, 'no-key');
  return buildProcessMapModel({ bpmn, named, fileName: FILE_NAME });
}

const SONNY = { uid: 'uid-sonny', name: 'Sonny Frenzel' };

function entry(subject: string, state: ElementState, kind: 'element' | 'rule' = 'element'): StateEntry {
  return {
    subject,
    kind,
    state,
    note: null,
    account: SONNY,
    confirmedAt: '2026-09-18T09:30:00.000Z',
    revision: 2,
  };
}

/** 3.5's record, assembled the way its store will: absent means undecided. */
function states(...entries: StateEntry[]): ProcessStates {
  const bySubject: Record<string, StateEntry> = {};
  for (const e of entries) bySubject[e.subject] = e;
  const counts = { keep: 0, change: 0, drop: 0, clarify: 0, undecided: 0 };
  for (const e of entries) counts[e.state] += 1;
  return { bySubject, counts };
}

/** The first element of the Ist that carries a line range, and the first that does not. */
function anchoredId(ist: ProcessMapModel): string {
  const element = ist.elements.find((e) => e.anchor !== null);
  if (!element) throw new Error('the fixture produced no anchored element');
  return element.id;
}

function unanchoredId(ist: ProcessMapModel): string {
  const element = ist.elements.find((e) => e.anchor === null);
  if (!element) throw new Error('the fixture produced no unanchored element');
  return element.id;
}

function subjectOf(list: readonly TargetSubject[], id: string): TargetSubject {
  const found = list.find((s) => s.subject === id);
  if (!found) throw new Error(`${id} is not in this list`);
  return found;
}

function rowOf(rows: readonly ComparisonRow[], id: string): ComparisonRow {
  const found = rows.find((r) => r.subject === id);
  if (!found) throw new Error(`${id} has no row in the comparison`);
  return found;
}

test.describe('the fixture is a real reconstruction', () => {
  test('it has anchored elements and at least one without an anchor', () => {
    const ist = istModel();
    expect(ist.elements.length, 'nothing was drawn — every check below would be vacuous').toBeGreaterThan(4);
    expect(ist.elements.filter((e) => e.anchor !== null).length).toBeGreaterThan(2);
    expect(ist.elements.filter((e) => e.anchor === null).length).toBeGreaterThan(0);
  });
});

test.describe('the target model, out of the Ist and the states', () => {
  test('what is dropped is not in the target', () => {
    const ist = istModel();
    const gone = anchoredId(ist);
    const target = buildTargetModel(ist, states(entry(gone, 'drop')));

    expect(target.subjects.map((s) => s.subject), 'a dropped element is still in the target').not.toContain(gone);
    expect(target.dropped.map((s) => s.subject)).toContain(gone);
    expect(subjectOf(target.dropped, gone).disposition).toBe('dropped');
    // And nothing else moved out with it.
    expect(target.subjects.length).toBe(ist.elements.length - 1);
  });

  test('what is dropped keeps the lines its code stood at', () => {
    const ist = istModel();
    const gone = anchoredId(ist);
    const istAnchor = ist.elements.find((e) => e.id === gone)!.anchor!;
    const target = buildTargetModel(ist, states(entry(gone, 'drop')));

    const dropped = subjectOf(target.dropped, gone);
    expect(dropped.anchor, 'it is established that the code for this was there').toEqual({
      lineStart: istAnchor.lineStart,
      lineEnd: istAnchor.lineEnd,
    });
    expect(dropped.anchorBasis).toBe('code');

    // And the comparison carries it through rather than dropping the evidence
    // with the element.
    const row = rowOf(compareIstSoll(ist, target).rows, gone);
    expect(row.verdict).toBe('goes');
    expect(row.anchor).toEqual({ lineStart: istAnchor.lineStart, lineEnd: istAnchor.lineEnd });
    expect(row.sentence).toContain(`line${istAnchor.lineEnd === istAnchor.lineStart ? '' : 's'} ${istAnchor.lineStart}`);
  });

  test('"clarify" and "nobody has said anything" are both open and are not the same', () => {
    const ist = istModel();
    const asked = anchoredId(ist);
    const silent = ist.elements.find((e) => e.id !== asked)!.id;
    const target = buildTargetModel(ist, states(entry(asked, 'clarify')));

    const clarify = subjectOf(target.subjects, asked);
    const undecided = subjectOf(target.subjects, silent);

    // Both open …
    expect(clarify.disposition).toBe('open');
    expect(undecided.disposition).toBe('open');

    // … and told apart by three independent carriers, none of which collapses.
    expect(clarify.openReason).toBe('clarify');
    expect(undecided.openReason).toBe('undecided');
    expect(clarify.state).toBe('clarify');
    expect(undecided.state, 'nobody speaking is not a state').toBeNull();
    expect(clarify.decision?.account.name).toBe(SONNY.name);
    expect(clarify.decision?.confirmedAt).toBe('2026-09-18T09:30:00.000Z');
    expect(undecided.decision, 'there is nobody to name and no time to show').toBeNull();

    // And the counters keep them apart too.
    expect(target.counts.clarify).toBe(1);
    expect(target.counts.undecided).toBe(ist.elements.length - 1);

    const comparison = compareIstSoll(ist, target);
    expect(rowOf(comparison.rows, asked).openReason).toBe('clarify');
    expect(rowOf(comparison.rows, silent).openReason).toBe('undecided');
    expect(rowOf(comparison.rows, asked).sentence).toContain(SONNY.name);
    expect(rowOf(comparison.rows, silent).sentence).toContain('nobody has said anything');
    expect(comparison.counts.clarify).toBe(1);
    expect(comparison.counts.undecided).toBe(ist.elements.length - 1);
  });

  test('keep stays unchanged, change is marked as deliberately changed', () => {
    const ist = istModel();
    const kept = anchoredId(ist);
    const changed = ist.elements.find((e) => e.id !== kept && e.anchor !== null)!.id;
    const target = buildTargetModel(ist, states(entry(kept, 'keep'), entry(changed, 'change')));

    expect(subjectOf(target.subjects, kept).disposition).toBe('kept');
    expect(subjectOf(target.subjects, kept).openReason).toBeNull();
    expect(subjectOf(target.subjects, changed).disposition).toBe('changed');

    const comparison = compareIstSoll(ist, target);
    expect(rowOf(comparison.rows, kept).verdict).toBe('stays');
    expect(rowOf(comparison.rows, changed).verdict).toBe('changes');
    // What the change is, is not invented.
    expect(rowOf(comparison.rows, changed).sentence).toContain('nobody has written down');
  });
});

test.describe('C23-A06 — a need without code gets no invented anchor', () => {
  test('an element that exists only in the target carries no anchor at all', () => {
    const ist = istModel();
    const neighbour = anchoredId(ist);
    const target = buildTargetModel(
      ist,
      states(entry(neighbour, 'keep'), entry('Need_1', 'keep')),
    );

    const need = subjectOf(target.subjects, 'Need_1');
    expect(need.fromIst).toBe(false);
    expect(need.anchor, 'a drawn need was given a line range').toBeNull();
    expect(need.anchorBasis).toBe('need');
    expect(need.evidenceLabel, 'the target says so in the word the map already uses').toBe(UNANCHORED);
    expect(need.unanchoredReason).toBe(NEED_WITHOUT_CODE);
    // Not the neighbour's lines, not the plane's, not the process's.
    expect(need.plane).toBeNull();
  });

  test('and the comparison counts it as added, never as confirmed', () => {
    const ist = istModel();
    const target = buildTargetModel(ist, states(entry('Need_1', 'keep')));
    const comparison = compareIstSoll(ist, target);

    const row = rowOf(comparison.rows, 'Need_1');
    expect(row.verdict, 'a confirmed need is still a need').toBe('added');
    expect(row.inIst).toBe(false);
    expect(row.anchor).toBeNull();
    expect(comparison.byVerdict.stays.map((r) => r.subject)).not.toContain('Need_1');
    expect(comparison.byVerdict.added.map((r) => r.subject)).toEqual(['Need_1']);
    expect(comparison.counts.added).toBe(1);
    expect(comparison.counts.addedWithoutAnchor, 'every added row is without an anchor').toBe(1);
  });

  test('no row anywhere carries a line range it did not get from the Ist', () => {
    const ist = istModel();
    const anchored = anchoredId(ist);
    const unanchored = unanchoredId(ist);
    const target = buildTargetModel(
      ist,
      states(
        entry(anchored, 'drop'),
        entry(unanchored, 'change'),
        entry('Need_1', 'clarify'),
        entry('Need_2', 'keep'),
        entry('BR-004', 'keep', 'rule'),
      ),
      ['BR-004', 'BR-007'],
    );
    const comparison = compareIstSoll(ist, target);

    const istAnchors = new Map(ist.elements.map((e) => [e.id, e.anchor]));
    const rows: Array<{ subject: string; anchor: unknown; basis: string }> = [
      ...[...target.subjects, ...target.dropped].map((s) => ({ subject: s.subject, anchor: s.anchor, basis: s.anchorBasis })),
      ...comparison.rows.map((r) => ({ subject: r.subject, anchor: r.anchor, basis: r.anchorBasis })),
    ];
    expect(rows.length, 'nothing was derived — the check would be vacuous').toBeGreaterThan(10);

    for (const row of rows) {
      const fromIst = istAnchors.get(row.subject) ?? null;
      expect(row.anchor, `${row.subject} carries an anchor the Ist does not have`).toEqual(
        fromIst ? { lineStart: fromIst.lineStart, lineEnd: fromIst.lineEnd } : null,
      );
      // The invariant the basis exists for: a line range only ever comes from code.
      expect(row.anchor !== null, `${row.subject}: anchor and basis disagree`).toBe(row.basis === 'code');
    }
  });

  test('a rule states no place of its own, and an unknown rule id is a need', () => {
    const ist = istModel();
    const target = buildTargetModel(ist, states(entry('BR-004', 'keep', 'rule'), entry('BR-999', 'keep', 'rule')), [
      'BR-004',
      'BR-007',
    ]);

    const known = subjectOf(target.subjects, 'BR-004');
    expect(known.fromIst).toBe(true);
    expect(known.anchorBasis, 'a rule stands wherever its condition is written, so not in one range').toBe('unknown');
    expect(known.anchor).toBeNull();
    expect(known.evidenceLabel, 'saying nothing is not the same as saying "none"').toBeNull();

    // A rule nobody spoke about is open, like an element nobody spoke about.
    expect(subjectOf(target.subjects, 'BR-007').state).toBeNull();
    expect(subjectOf(target.subjects, 'BR-007').openReason).toBe('undecided');

    // And an id 3.4 never produced is a need without code, not a rule of the Ist.
    const invented = subjectOf(target.subjects, 'BR-999');
    expect(invented.fromIst).toBe(false);
    expect(invented.anchorBasis).toBe('need');
    expect(compareIstSoll(ist, target).byVerdict.added.map((r) => r.subject)).toContain('BR-999');
  });
});

test.describe('the counters', () => {
  test('they add up to the number of subjects, and nothing is counted twice', () => {
    const ist = istModel();
    const anchored = anchoredId(ist);
    const unanchored = unanchoredId(ist);
    const third = ist.elements.find((e) => e.id !== anchored && e.id !== unanchored)!.id;
    const target = buildTargetModel(
      ist,
      states(
        entry(anchored, 'drop'),
        entry(unanchored, 'change'),
        entry(third, 'clarify'),
        entry('Need_1', 'keep'),
        entry('BR-004', 'keep', 'rule'),
      ),
      ['BR-004', 'BR-007'],
    );

    const c = target.counts;
    expect(c.subjects).toBe(ist.elements.length + 2 /* rules */ + 1 /* need */);
    expect(c.subjects).toBe(target.subjects.length + target.dropped.length);
    expect(
      c.kept + c.changed + c.dropped + c.clarify + c.undecided,
      'a subject is in exactly one of the five',
    ).toBe(c.subjects);
    expect(c.elements + c.rules).toBe(c.subjects);
    expect(c.needsWithoutCode).toBe(1);
    expect(c.kept).toBe(2); // the drawn need and BR-004
    expect(c.changed).toBe(1);
    expect(c.dropped).toBe(1);
    expect(c.clarify).toBe(1);

    const comparison = compareIstSoll(ist, target);
    const k = comparison.counts;
    expect(k.subjects).toBe(comparison.rows.length);
    expect(k.subjects).toBe(c.subjects);
    expect(k.stays + k.changes + k.goes + k.open + k.added, 'a row has exactly one verdict').toBe(k.subjects);
    expect(k.clarify + k.undecided, 'every open row is open for exactly one of the two reasons').toBe(k.open);
    expect(k.added).toBe(1);
    expect(k.goes).toBe(1);

    // Every subject appears once and only once across the five groups.
    const grouped = Object.values(comparison.byVerdict).flat().map((r) => r.subject);
    expect(grouped.length).toBe(k.subjects);
    expect(new Set(grouped).size).toBe(k.subjects);
  });

  test('an Ist nobody has spoken about is entirely undecided, and nothing is dropped', () => {
    const ist = istModel();
    const target = buildTargetModel(ist, states());
    expect(target.counts.undecided).toBe(ist.elements.length);
    expect(target.counts.clarify).toBe(0);
    expect(target.dropped).toEqual([]);

    const comparison = compareIstSoll(ist, target);
    expect(comparison.counts.open).toBe(ist.elements.length);
    expect(comparison.counts.stays).toBe(0);
    expect(comparison.summary).toContain(`${ist.elements.length} subjects`);
  });
});

test.describe('what a Soll never claims', () => {
  test('the derivation carries the sentence that says what it is not', () => {
    const ist = istModel();
    const target = buildTargetModel(ist, states());
    for (const text of [target.disclaimer, compareIstSoll(ist, target).disclaimer]) {
      expect(text).toContain('not a statement about the code');
      expect(text).toContain('no audit pack');
    }
    // And no summary anywhere reports evidence it does not have.
    for (const text of [target.summary, compareIstSoll(ist, target).summary]) {
      expect(text).not.toMatch(/\bproven\b|\bverified\b|\bconfirmed by the code\b/i);
    }
  });
});
