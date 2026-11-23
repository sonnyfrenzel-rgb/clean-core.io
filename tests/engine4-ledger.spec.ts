import { test, expect } from '@playwright/test';
import { readSource } from '../lib/engine4/index';
import { references } from '../lib/engine4/references';
import { allKinds, kindInfo } from '../lib/engine4/statement-kinds';
import { EFFECT_CLASSES, effectOf, ENGINE4_CONSUMERS, ledger, referencesByStatement, type Consumer } from '../lib/engine4/ledger';
import { runLedgerShadow } from '../scripts/engine4/shadow-ledger';
import { shadowCorpus } from '../scripts/engine4/shadow';

/**
 * Engine 4.0: the statement ledger by effect class (`lib/engine4/ledger.ts`; engine review of 22.11.2026, §3 L1;
 * ER-05). Inert (ADR-125). Every kind has an effect class in the kind table; a statement is accounted for when a
 * consumer claims its class or the class has no effect of its own; complete = nothing unclaimed, no Unknown, no
 * fallback. Server-free.
 */
const read = (src: string) => {
  const r = readSource(src);
  const table = references(r.statements, r.tree);
  return { ...r, table };
};
const ALL_BUT_UNKNOWN: Consumer = { id: 'everything', claims: EFFECT_CLASSES.filter((k) => k !== 'unknown') };

test('every statement kind the classifier can produce has an effect class', () => {
  for (const kind of allKinds()) expect(EFFECT_CLASSES, kind).toContain(kindInfo(kind).effect);
});

test('the effect is refined per statement: internal table or database, a name that stays open', () => {
  const src = [
    'REPORT z.', 'DATA lt TYPE STANDARD TABLE OF mara.', 'DATA ls TYPE mara.', 'DATA lv TYPE funcname.',
    'MODIFY lt FROM ls INDEX 1.', 'MODIFY mara FROM ls.', 'DELETE lt WHERE matnr = 1.', 'DELETE FROM mara WHERE matnr = 1.',
    "CALL FUNCTION 'Z_X'.", 'CALL FUNCTION lv.', 'COMMIT WORK.', "AUTHORITY-CHECK OBJECT 'M_MATE_STA' ID 'ACTVT' FIELD '03'.",
    'DEFINE m.', '  WRITE &1.', 'END-OF-DEFINITION.',
  ].join('\n');
  const { statements, table } = read(src);
  const refs = referencesByStatement(table);
  expect(statements.map((s) => effectOf(s, refs))).toEqual([
    'structure', 'declaration', 'declaration', 'declaration', 'compute', 'dbWrite', 'compute', 'dbWrite',
    'callOut', 'dynamic', 'transaction', 'authorization', 'structure', 'structure', 'structure',
  ]);
});

test('without a reference table a write statement is unknown, never a guessed database write (QA 1fa0b4ed2e9e)', () => {
  const { statements } = read(['REPORT z.', 'DATA lt TYPE STANDARD TABLE OF mara.', 'INSERT INITIAL LINE INTO TABLE lt.', 'DELETE lt INDEX 1.'].join('\n'));
  expect(statements.map((s) => effectOf(s))).toEqual(['structure', 'declaration', 'unknown', 'unknown']);
  const l = ledger(statements, [ALL_BUT_UNKNOWN]);
  expect([l.complete, l.byClass.dbWrite.total, l.byClass.unknown.unclaimed]).toEqual([false, 0, 2]);
});

test('complete means: every effect class claimed, no Unknown statement, no fallback', () => {
  const src = ['REPORT z.', 'DATA lv TYPE i.', 'lv = 1.', 'IF lv = 1.', '  WRITE lv.', 'ENDIF.'].join('\n');
  const { statements, table } = read(src);
  expect(ledger(statements, [ALL_BUT_UNKNOWN], { references: table }).complete).toBe(true);
  const partial = ledger(statements, [{ id: 'flow', claims: ['control', 'compute'] }], { references: table });
  expect(partial.complete).toBe(false);
  expect(partial.unclaimedKinds).toEqual([{ kind: 'Write', effect: 'ui', count: 1, firstRow: 5 }]);
  expect(ledger(statements, [ALL_BUT_UNKNOWN], { references: table, fallback: 'template-across-lines' }).complete).toBe(false);
  const unknown = read('REPORT z.\nFROBNICATE lv.');
  const l = ledger(unknown.statements, [ALL_BUT_UNKNOWN, { id: 'cheat', claims: ['unknown'] }], { references: unknown.table });
  expect([l.complete, l.unknown, l.byClass.unknown.unclaimed]).toEqual([false, 1, 1]);
});

test('engine 4 claims only what L4 reads today, so its ledger is honest about the rest', () => {
  expect(ENGINE4_CONSUMERS.flatMap((c) => c.claims).sort()).toEqual(['authorization', 'dbRead', 'dbWrite']);
});

test('shadow against today\'s engine: silent statements counted, the kinds today never judges pinned', () => {
  test.setTimeout(600_000);
  const r = runLedgerShadow(shadowCorpus());
  expect(r.files).toBeGreaterThanOrEqual(390);
  expect(r.failures).toEqual([]);
  // 22.11.2026: of 190 files today calls complete, 154 hold statements of an effect class no reading judged.
  expect(r.completeToday).toBeGreaterThanOrEqual(150);
  expect(r.silentGapFiles).toBeGreaterThanOrEqual(100);
  expect(r.byClass.dbWrite.silent).toBe(0);
  expect(r.byClass.authorization.silent).toBe(0);
  const never = Object.entries(r.byKind).filter(([, v]) => v.judged === 0 && !['declaration', 'structure'].includes(v.effect)).map(([k]) => k).sort();
  // A kind leaves this list when a reading of today's engine starts judging it; a new kind entering it fails here.
  expect(never.filter((k) => !NEVER_JUDGED_2211.includes(k))).toEqual([]);
});

const NEVER_JUDGED_2211 = [
  'Add', 'Assign', 'CallTransformation', 'CatchSystemExceptions', 'CloseCursor', 'Collect', 'Condense', 'Describe', 'EndExec', 'Fetch',
  'GetCursor', 'GetTime', 'Hide', 'MoveCorresponding', 'Parameters', 'ReadEntities', 'Refresh', 'Reject', 'Retry', 'RollbackWork',
  'SelectOptions', 'SelectionScreen', 'SetParameter', 'SetPfStatus', 'SetTitlebar', 'Sort', 'Split', 'Sum', 'Translate', 'Unknown', 'Wait',
];
