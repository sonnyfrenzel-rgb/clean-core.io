import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { readLuwStates } from '../lib/abap/luw-states';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildBusinessStatements } from '../lib/abap/business-statement';

/**
 * Roadmap 2.12 — Wirkungsstatus im Grundmodell (CR-06, decision §9 no. 15).
 *
 * `IN UPDATE TASK` = registered, `COMMIT WORK` = dispatched, `ROLLBACK WORK` =
 * discarded, each a state of the model with the line that proves it. CC-026
 * and CC-027 are the acceptance; the rest holds the edges of "only what the
 * code proves": V1/V2 never, local update only after SET UPDATE TASK LOCAL,
 * AND WAIT read off the statement.
 *
 * Pure: imports `lib/abap` only, no page, no route, no server.
 */

const caseSource = (id: string) => readFileSync(join(process.cwd(), 'tests/korpus/cases', id, 'source.abap'), 'utf8');
const luw = (source: string) => readLuwStates(buildProcessFacts(source));

test('CC-026: registered at 6, discarded by ROLLBACK at 12, dispatched by COMMIT at 15 — every path resolved', () => {
  const model = luw(caseSource('CC-026'));
  expect(model.registrations).toHaveLength(1);
  const [registration] = model.registrations;
  expect(registration.state).toBe('registered');
  expect(registration.lineStart).toBe(6);
  expect(registration.module).toBe('Z_CC_DECISION_UPD');
  expect(registration.outcomes.map((o) => [o.state, o.lineStart, o.conditional])).toEqual([
    ['discarded', 12, true],
    ['dispatched', 15, true],
  ]);
  // Both arms of the IF end in an LUW statement: no path is left open, and
  // above all none is called orphaned.
  expect(registration.unresolved).toBeNull();
  // F01/F05: the non-local mode is a profile assumption, not something the
  // source proves — so the engine does not claim it.
  expect(registration.updateMode.value).toBe('not-determined');
  expect(registration.updateKind.value).toBe('not-determined');

  const commit = model.events.find((e) => e.kind === 'commit')!;
  expect(commit.lineStart).toBe(15);
  // F04: no AND WAIT, so sy-subrc after it would be 0 whatever the update did.
  expect(commit.andWait).toBe(false);
  expect(commit.subrcCarriesUpdateResult).toBe(false);
  expect(commit.subrcRead).toBe(false);
  expect(commit.registrations).toEqual([registration.statementIndex]);
  const rollback = model.events.find((e) => e.kind === 'rollback')!;
  expect(rollback.lineStart).toBe(12);
  expect(rollback.andWait).toBeNull();
});

test('CC-027: registered at 5, no COMMIT in the whole report — orphaned, and not discarded', () => {
  const model = luw(caseSource('CC-027'));
  expect(model.events).toEqual([]);
  const [registration] = model.registrations;
  expect(registration.lineStart).toBe(5);
  expect(registration.outcomes).toEqual([]);
  expect(registration.unresolved?.state).toBe('orphaned');
  // F04: anchored at the end of the slice, line 10.
  expect(registration.unresolved?.lineStart).toBe(10);
  expect(registration.unresolved?.reason).toMatch(/not a ROLLBACK WORK/);
});

test('the skeleton carries the states: model and node, nothing removed', () => {
  const skeleton = buildProcessSkeleton(caseSource('CC-026'));
  const [registration] = skeleton.luw.registrations;
  const node = skeleton.nodes.find((n) => n.id === registration.nodeId)!;
  expect(node, 'the registration is drawn').toBeTruthy();
  // What was there before 2.12 stays.
  expect(node.kind).toBe('service-task');
  expect(node.detail?.inUpdateTask).toBe(true);
  expect(skeleton.notes.filter((n) => n.reason === 'commit-boundary').map((n) => n.lineStart)).toEqual([12, 15]);
  // What 2.12 adds.
  expect(node.detail?.effectState).toBe('registered');
  expect(node.detail?.effectOutcomes).toEqual(['discarded', 'dispatched']);
  expect(node.detail?.effectEnd).toBeUndefined();

  const orphan = buildProcessSkeleton(caseSource('CC-027'));
  const orphanNode = orphan.nodes.find((n) => n.id === orphan.luw.registrations[0].nodeId)!;
  expect(orphanNode.detail?.effectState).toBe('registered');
  expect(orphanNode.detail?.effectOutcomes).toEqual([]);
  expect(orphanNode.detail?.effectEnd).toBe('orphaned');
  // CC-027: no transaction node and no async node is invented from the report end.
  expect(orphan.nodes.some((n) => n.kind === 'transaction')).toBe(false);
});

test('the Fachsatz condenses the states and does not overclaim', () => {
  const b026 = buildBusinessStatements(caseSource('CC-026'));
  const commit = b026.find((b) => b.anchors.some((a) => a.lineStart === 15) && /^Mit COMMIT WORK/.test(b.core))!;
  expect(commit.text).toMatch(/angestoßen/);
  expect(commit.text).not.toMatch(/wird die Änderung persistiert/);
  const rollback = b026.find((b) => b.anchors.some((a) => a.lineStart === 12) && /^Mit ROLLBACK WORK/.test(b.core))!;
  expect(rollback.text).toMatch(/verworfen/);

  const b027 = buildBusinessStatements(caseSource('CC-027'));
  const registration = b027.find((b) => /zur Verbuchung registriert/.test(b.core))!;
  expect(registration.text).toMatch(/nicht angestoßen/);
  expect(registration.text).not.toMatch(/läuft erst mit dem COMMIT WORK/);
});

test('SET UPDATE TASK LOCAL is local only when it precedes the registration in the same LUW', () => {
  const local = luw([
    'REPORT zt.',
    'START-OF-SELECTION.',
    '  SET UPDATE TASK LOCAL.',
    "  CALL FUNCTION 'Z_UPD' IN UPDATE TASK.",
    '  COMMIT WORK.',
  ].join('\n'));
  expect(local.registrations[0].updateMode.value).toBe('local');
  expect(local.registrations[0].updateMode.setAt?.lineStart).toBe(3);

  const reset = luw([
    'REPORT zt.',
    'START-OF-SELECTION.',
    '  SET UPDATE TASK LOCAL.',
    '  COMMIT WORK.',
    "  CALL FUNCTION 'Z_UPD' IN UPDATE TASK.",
    '  COMMIT WORK.',
  ].join('\n'));
  // The COMMIT in between ends the LUW the switch was set for.
  expect(reset.registrations[0].updateMode.value).toBe('not-determined');
});

test('AND WAIT is read off the statement, and COMMIT CONNECTION is not an LUW event', () => {
  const model = luw([
    'REPORT zt.',
    'START-OF-SELECTION.',
    "  CALL FUNCTION 'Z_UPD' IN UPDATE TASK.",
    '  COMMIT CONNECTION default.',
    '  COMMIT WORK AND WAIT.',
    '  IF sy-subrc <> 0.',
    "    WRITE / 'FAILED'.",
    '  ENDIF.',
  ].join('\n'));
  expect(model.events).toHaveLength(1);
  const [commit] = model.events;
  expect(commit.token).toBe('COMMIT WORK AND WAIT');
  expect(commit.andWait).toBe(true);
  expect(commit.subrcCarriesUpdateResult).toBe(true);
  expect(commit.subrcRead).toBe(true);
  expect(model.registrations[0].outcomes.map((o) => [o.state, o.lineStart, o.conditional])).toEqual([
    ['dispatched', 5, false],
  ]);
  expect(model.registrations[0].unresolved).toBeNull();
});

test('a registration in a FORM is followed to its PERFORM, and BAPI_TRANSACTION_COMMIT dispatches', () => {
  const model = luw([
    'REPORT zt.',
    'START-OF-SELECTION.',
    '  PERFORM register.',
    "  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'.",
    'FORM register.',
    "  CALL FUNCTION 'Z_UPD' IN UPDATE TASK.",
    'ENDFORM.',
  ].join('\n'));
  const [registration] = model.registrations;
  expect(registration.outcomes.map((o) => [o.state, o.lineStart])).toEqual([['dispatched', 4]]);
  expect(registration.unresolved).toBeNull();
  expect(model.events[0].andWait).toBe(true);
});

test('not a whole program, or an opaque call on the way: not determined — never orphaned by default', () => {
  const include = luw([
    "  CALL FUNCTION 'Z_UPD' IN UPDATE TASK.",
    "  WRITE / 'X'.",
  ].join('\n'));
  expect(include.registrations[0].unresolved?.state).toBe('not-determined');

  const opaque = luw([
    'REPORT zt.',
    'START-OF-SELECTION.',
    "  CALL FUNCTION 'Z_UPD' IN UPDATE TASK.",
    "  CALL FUNCTION 'Z_SOMETHING_ELSE'.",
  ].join('\n'));
  expect(opaque.registrations[0].unresolved?.state).toBe('not-determined');
  expect(opaque.registrations[0].unresolved?.reason).toMatch(/line 4/i);

  const leaves = luw([
    'REPORT zt.',
    'START-OF-SELECTION.',
    "  CALL FUNCTION 'Z_UPD' IN UPDATE TASK.",
    '  CHECK p_x = abap_true.',
    '  COMMIT WORK.',
  ].join('\n'));
  // The COMMIT is reached on some paths; CHECK leaves on the others.
  expect(leaves.registrations[0].outcomes.map((o) => [o.state, o.conditional])).toEqual([['dispatched', true]]);
  expect(leaves.registrations[0].unresolved?.state).toBe('not-determined');
});

test('an IF without ELSE leaves the other path unresolved', () => {
  const model = luw([
    'REPORT zt.',
    'PARAMETERS p_x AS CHECKBOX.',
    'START-OF-SELECTION.',
    "  CALL FUNCTION 'Z_UPD' IN UPDATE TASK.",
    "  IF p_x = 'X'.",
    '    COMMIT WORK.',
    '  ENDIF.',
  ].join('\n'));
  const [registration] = model.registrations;
  expect(registration.outcomes.map((o) => [o.state, o.lineStart, o.conditional])).toEqual([['dispatched', 6, true]]);
  // The whole report is here and nothing else can commit: the other path orphans.
  expect(registration.unresolved?.state).toBe('orphaned');
});
