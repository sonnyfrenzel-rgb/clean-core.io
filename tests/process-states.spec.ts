import { test, expect } from '@playwright/test';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { parseBpmn } from '../lib/process-map';
import { deriveBusinessRules, rulesForElement } from '../lib/abap/business-rule-set';
import {
  ELEMENT_STATES,
  STATE_LABELS,
  applyStateChoices,
  checkStateChoices,
  markAffectedDerivations,
  noteRequired,
  readProcessStates,
  statesSentence,
  type RuleLink,
  type StateEntry,
} from '../lib/process-states';
import { confirmOutcomeSentence, CONFIRM_REFUSALS } from '../lib/process-states-client';

/**
 * Keep · Change deliberately · Drop · Clarify, without a server — roadmap 3.5.
 *
 * Four claims, and the last is the acceptance item W22-A14:
 *
 *   1. `undecided` counts the **absence** of an answer over the subjects that
 *      exist, so an entry for something that is not there cannot make it
 *      smaller;
 *   2. a confirmation carries the account, the time and the revision of the
 *      confirmation that **made** it, and a later revision does not restamp it;
 *   3. Change and Drop need a reason, Keep and Clarify do not;
 *   4. **a changed confirmed rule marks only its own derivations.** The rules
 *      and the elements below are derived from a real ABAP source by the real
 *      engine, so the link between them is the product's and not the spec's.
 *
 * Runs without a browser and without the emulators: everything under test is a
 * pure function.
 */

const PROGRAM = [
  'REPORT z_states_demo.',
  'START-OF-SELECTION.',
  '  PERFORM check_vendor.',
  '  PERFORM check_price.',
  'FORM check_vendor.',
  "  IF gv_lifnr = '0000100001'.",
  '    MESSAGE e001(zmm).',
  '  ENDIF.',
  'ENDFORM.',
  'FORM check_price.',
  '  IF gv_netpr > 5000.',
  '    MESSAGE e002(zmm).',
  '  ENDIF.',
  'ENDFORM.',
  'FORM notify_buyer.',
  "  CALL FUNCTION 'Z_NOTIFY_BUYER'.",
  'ENDFORM.',
].join('\n');

/** The subjects of that program, the way the route reads them: out of the Ist and out of the source. */
function subjectsOf() {
  const { xml } = buildBpmnExportFromSource(PROGRAM, { processName: 'Demo', sourceFileName: 'z_states_demo.abap' });
  const parsed = parseBpmn(xml);
  const set = deriveBusinessRules(PROGRAM);
  const linkOf = new Map<string, string[]>(set.rules.map((r) => [r.id, []]));
  for (const element of parsed.elements) {
    const node = element.trace?.node ?? null;
    if (!node) continue;
    for (const rule of rulesForElement(set, node)) linkOf.get(rule.id)?.push(element.id);
  }
  return {
    elements: parsed.elements.map((e) => e.id),
    rules: set.rules.map((r) => r.id),
    links: set.rules.map((r): RuleLink => ({ rule: r.id, elements: linkOf.get(r.id) ?? [] })),
  };
}

const ACCOUNT = { uid: 'uid-mara', name: 'Mara Weber' };

function entry(subject: string, kind: StateEntry['kind'], state: StateEntry['state'], revision: number, note: string | null = null): StateEntry {
  return { subject, kind, state, note, account: ACCOUNT, confirmedAt: '2026-09-17T08:00:00.000Z', revision };
}

test('undecided counts the subjects with no answer, not the entries that are missing', () => {
  const subjects = { elements: ['A', 'B', 'C', 'D'], rules: ['BR-001', 'BR-002'] };

  const none = readProcessStates([], subjects);
  expect(none.counts).toEqual({ keep: 0, change: 0, drop: 0, clarify: 0, undecided: 6 });

  const some = readProcessStates(
    [entry('A', 'element', 'keep', 1), entry('BR-001', 'rule', 'change', 1, 'Tolerance per material group.')],
    subjects,
  );
  expect(some.counts).toEqual({ keep: 1, change: 1, drop: 0, clarify: 0, undecided: 4 });

  // An answer about something that is not in this process is not an answer
  // about anything. It is dropped — and dropping it must not make `undecided`
  // one too small, which is what "subjects minus entries" would do.
  const stray = readProcessStates(
    [
      entry('A', 'element', 'keep', 1),
      entry('Gateway_deleted', 'element', 'drop', 1, 'gone from the model'),
      entry('BR-404', 'rule', 'drop', 1, 'not in this source'),
    ],
    subjects,
  );
  expect(stray.counts.undecided).toBe(5);
  expect(stray.counts.drop).toBe(0);
  expect(Object.keys(stray.bySubject)).toEqual(['A']);

  // Nor is an entry that calls a rule an element.
  const wrongKind = readProcessStates([entry('BR-001', 'element', 'keep', 1)], subjects);
  expect(wrongKind.counts.undecided).toBe(6);
  expect(wrongKind.bySubject['BR-001']).toBeUndefined();

  // Two entries for one subject: the higher revision is the answer, whatever
  // order they came out of the store in.
  const twice = readProcessStates(
    [entry('A', 'element', 'drop', 4, 'later'), entry('A', 'element', 'keep', 2)],
    subjects,
  );
  expect(twice.bySubject.A.state).toBe('drop');
  expect(twice.bySubject.A.revision).toBe(4);

  expect(statesSentence(some)).toBe('1 kept, 1 to change, 0 dropped, 0 to clarify, 4 of 6 not yet confirmed.');
});

test('a confirmation keeps the account, the time and the revision that made it', () => {
  const first = applyStateChoices(
    [],
    [{ subject: 'A', kind: 'element', state: 'keep', note: null }],
    { account: ACCOUNT, confirmedAt: '2026-09-17T08:00:00.000Z', revision: 1 },
  );
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ subject: 'A', state: 'keep', revision: 1, confirmedAt: '2026-09-17T08:00:00.000Z' });

  const second = applyStateChoices(
    first,
    [{ subject: 'B', kind: 'element', state: 'drop', note: 'Plant 1000 no longer skips the check.' }],
    { account: { uid: 'uid-jonas', name: 'Jonas Peters' }, confirmedAt: '2026-09-18T11:30:00.000Z', revision: 2 },
  );
  const a = second.find((e) => e.subject === 'A')!;
  const b = second.find((e) => e.subject === 'B')!;
  // A was answered at revision 1 by Mara and is still Mara's answer at
  // revision 2 — a snapshot that restamped every row would show one name and
  // one time for work two people did on different days.
  expect(a.account.name).toBe('Mara Weber');
  expect(a.confirmedAt).toBe('2026-09-17T08:00:00.000Z');
  expect(a.revision).toBe(1);
  expect(b.account.name).toBe('Jonas Peters');
  expect(b.revision).toBe(2);
});

test('Change and Drop need a reason; Keep and Clarify do not', () => {
  const subjects = { elements: ['A'], rules: ['BR-001'] };
  expect(noteRequired('change')).toBe(true);
  expect(noteRequired('drop')).toBe(true);
  expect(noteRequired('keep')).toBe(false);
  expect(noteRequired('clarify')).toBe(false);

  const dropped = checkStateChoices([{ subject: 'BR-001', kind: 'rule', state: 'drop' }], subjects);
  expect(dropped.ok).toBe(false);
  expect(dropped.ok === false && dropped.code).toBe('note-required');

  // Whitespace is not a reason.
  const blank = checkStateChoices([{ subject: 'BR-001', kind: 'rule', state: 'change', note: '   ' }], subjects);
  expect(blank.ok === false && blank.code).toBe('note-required');

  const kept = checkStateChoices([{ subject: 'A', kind: 'element', state: 'keep' }], subjects);
  expect(kept.ok).toBe(true);
  expect(kept.ok === true && kept.choices[0].note).toBeNull();

  const unknown = checkStateChoices([{ subject: 'Gateway_nope', kind: 'element', state: 'keep' }], subjects);
  expect(unknown.ok === false && unknown.code).toBe('unknown-subject');

  const twice = checkStateChoices(
    [
      { subject: 'A', kind: 'element', state: 'keep' },
      { subject: 'A', kind: 'element', state: 'drop', note: 'no' },
    ],
    subjects,
  );
  expect(twice.ok === false && twice.code).toBe('bad-request');
});

test('a changed confirmed rule marks only the elements drawn from it', () => {
  const { elements, rules, links } = subjectsOf();
  expect(rules.length, 'the fixture derived no business rules').toBeGreaterThanOrEqual(2);

  // Two rules, each with derivations of its own, and the two sets disjoint.
  // Without a second rule that has elements, "marks only its own" would be true
  // of a function that marks every element it is told about, which is the
  // marking the acceptance item forbids.
  const withElements = links.filter((l) => l.elements.length > 0);
  expect(withElements.length, 'the fixture has fewer than two rules with derivations').toBeGreaterThanOrEqual(2);
  const changed = withElements[0];
  const other = withElements[1];
  expect(changed.elements.some((id) => other.elements.includes(id)), 'the two rules share an element').toBe(false);
  const untouched = elements.filter((id) => !changed.elements.includes(id));
  expect(untouched.length, 'every element is drawn from the same rule').toBeGreaterThan(0);

  const subjects = { elements, rules };
  const states = readProcessStates(
    [entry(changed.rule, 'rule', 'change', 2, 'The tolerance comes from configuration per material group.')],
    subjects,
  );

  const marks = markAffectedDerivations(states, links);
  expect(marks.map((m) => m.element).sort()).toEqual([...changed.elements].sort());
  for (const id of untouched) {
    expect(marks.some((m) => m.element === id), `${id} is drawn from no changed rule and was marked anyway`).toBe(false);
  }
  // Named separately, because these are the elements a marking that marks
  // everything would reach: they are drawn from a rule, and that rule did not move.
  for (const id of other.elements) {
    expect(marks.some((m) => m.element === id), `${id} belongs to ${other.rule}, which nobody changed`).toBe(false);
  }
  expect(marks[0].rules.map((r) => r.rule)).toEqual([changed.rule]);
  expect(marks[0].sentence).toContain(STATE_LABELS.change);
  expect(marks[0].sentence).toContain(changed.rule);
  // Nothing was confirmed on the elements themselves, so nothing is stale yet.
  expect(marks.every((m) => m.stale === false)).toBe(true);

  // A rule confirmed as Keep has not moved, so it marks nothing at all.
  const keptStates = readProcessStates([entry(changed.rule, 'rule', 'keep', 2)], subjects);
  expect(markAffectedDerivations(keptStates, links)).toEqual([]);

  // An unconfirmed rule marks nothing either.
  expect(markAffectedDerivations(readProcessStates([], subjects), links)).toEqual([]);

  // And an element confirmed before the rule moved is marked as stale — that is
  // the case the marking exists for.
  const staleStates = readProcessStates(
    [
      entry(changed.elements[0], 'element', 'keep', 1),
      entry(changed.rule, 'rule', 'drop', 3, 'The business no longer needs this check.'),
    ],
    subjects,
  );
  const staleMarks = markAffectedDerivations(staleStates, links);
  const first = staleMarks.find((m) => m.element === changed.elements[0])!;
  expect(first.stale).toBe(true);
  expect(first.rules[0].reason).toBe('rule-dropped');
  // …while an element of the same rule that nobody confirmed is marked and not stale.
  expect(staleMarks.filter((m) => m.stale).length).toBe(1);
});

test('every refusal this build knows has a sentence, and none of them is undefined', () => {
  for (const code of CONFIRM_REFUSALS) {
    const sentence = confirmOutcomeSentence({ ok: false, code, error: 'server wording', status: 409 });
    expect(typeof sentence, `${code} has no sentence`).toBe('string');
    expect(sentence.length, `${code} has an empty sentence`).toBeGreaterThan(10);
    expect(sentence).not.toContain('undefined');
  }
  expect(ELEMENT_STATES).toEqual(['keep', 'change', 'drop', 'clarify']);
});
