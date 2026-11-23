import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { readTableDependencies } from '../lib/abap/table-dependencies';
import { databaseOnlyWriteForm, databaseWriteIn, writesDatabaseOnly } from '../lib/abap/open-sql-discrimination';
import { ENGINE_READS_350_FROM, engineReads350Apply } from '../lib/abap/engine-reads-350-gate';

/**
 * Engine 3.5.0 (gated by `ENGINE_READS_350_FROM`): a write form that exists only in ABAP SQL names a database table
 * even when the source declares a data object of the same name (`databaseOnlyWriteForm`, option `databaseWriteForms`
 * of `readTableDependencies`). Before, only UPDATE was read that way. The forms ABAP shares with internal tables keep
 * the local-name reading, and the engines before 3.5.0 answer as they signed. Server-free.
 */
const OLD = 'v3.4.0';
const NEW = 'v3.5.0';

const program = (table: string, statement: string) => `REPORT zprobe_write_forms.
DATA ${table} TYPE ${table}.
DATA lt TYPE TABLE OF ${table}.
DATA ls TYPE ${table}.

START-OF-SELECTION.
  ${statement.replace(/\$T/g, table)}
`;

/** Forms with no internal-table counterpart: a write to the table from 3.5.0. */
const DATABASE_ONLY = [
  'DELETE FROM $T WHERE id = 1.',
  "DELETE FROM $T WHERE reason = 'INTO TABLE'.",
  'DELETE $T FROM TABLE lt.',
  'INSERT $T FROM TABLE lt.',
  'INSERT INTO $T VALUES ls.',
  'INSERT $T FROM ls.',
  "INSERT $T FROM @( VALUE #( reason = 'INTO' ) ).",
  'MODIFY $T FROM TABLE lt.',
  'MODIFY $T FROM @ls.',
  'DELETE $T FROM @ls.',
  'MODIFY $T CLIENT SPECIFIED FROM ls.',
];

/** Forms ABAP shares with internal tables: a local of that name stays an internal table at every version. */
const INTERNAL = [
  'MODIFY $T FROM ls.',
  'MODIFY $T FROM ls INDEX 1.',
  'DELETE $T FROM 2.',
  'DELETE $T FROM 2 TO 5.',
  'DELETE $T WHERE id = 1.',
  'INSERT ls INTO $T INDEX 1.',
  'INSERT ls INTO TABLE $T.',
  'APPEND ls TO $T.',
];

const writes = (source: string, databaseWriteForms: boolean) =>
  readTableDependencies(source, { databaseWriteForms }).dependencies
    .filter((d) => d.access === 'write')
    .map((d) => d.table);

const writeFindings = (source: string, engine: string) =>
  buildAbapEvidence(source, 'zprobe_write_forms.abap', 'private', undefined, engine).findings
    .filter((f) => /MARA/.test(f.title) && /write/.test(f.kind))
    .map((f) => ({ severity: f.severity, line: f.lineStart }));

test('the gate opens at 3.5.0', () => {
  expect(ENGINE_READS_350_FROM).toBe('3.5.0');
  expect(engineReads350Apply('v3.4.0')).toBe(false);
  expect(engineReads350Apply('v3.4.9')).toBe(false);
  expect(engineReads350Apply('v3.5.0')).toBe(true);
  expect(engineReads350Apply(null)).toBe(false);
  expect(engineReads350Apply(undefined)).toBe(false);
});

for (const form of DATABASE_ONLY) {
  test(`${form.replace(/\$T/g, 'zlog')} beside a local of the same name: a write to the table from 3.5.0 only`, () => {
    const source = program('zlog', form);
    expect(writes(source, false)).toEqual([]);
    expect(writes(source, true)).toEqual(['ZLOG']);
    const sap = program('mara', form);
    expect(writeFindings(sap, OLD)).toEqual([]);
    expect(writeFindings(sap, NEW)).toEqual([{ severity: 'Critical', line: 7 }]);
  });
}

for (const form of INTERNAL) {
  test(`${form.replace(/\$T/g, 'lt_log')} on a local table: no table write at any version`, () => {
    const source = program('lt_log', form);
    expect(writes(source, false)).toEqual([]);
    expect(writes(source, true)).toEqual([]);
    const sap = program('mara', form);
    expect(writeFindings(sap, OLD)).toEqual([]);
    expect(writeFindings(sap, NEW)).toEqual([]);
  });
}

test('UPDATE was a write to the table before 3.5.0 and stays one', () => {
  const source = program('zlog', 'UPDATE $T SET id = 2 WHERE id = 1.');
  expect(writes(source, false)).toEqual(['ZLOG']);
  expect(writes(source, true)).toEqual(['ZLOG']);
  const sap = program('mara', 'UPDATE $T SET id = 2 WHERE id = 1.');
  expect(writeFindings(sap, OLD)).toEqual([{ severity: 'Critical', line: 7 }]);
  expect(writeFindings(sap, NEW)).toEqual([{ severity: 'Critical', line: 7 }]);
});

test('without a local of the same name every database form is a write at every version', () => {
  for (const form of DATABASE_ONLY) {
    const source = `REPORT z.\nDATA lt TYPE TABLE OF zlog.\nDATA ls TYPE zlog.\n${form.replace(/\$T/g, 'zlog')}\n`;
    expect(writes(source, false), form).toEqual(['ZLOG']);
    expect(writes(source, true), form).toEqual(['ZLOG']);
  }
});

test('databaseOnlyWriteForm: the ABAP SQL forms yes, the shared forms no, and writesDatabaseOnly is unchanged', () => {
  const ask = (text: string) => {
    const write = databaseWriteIn(text);
    expect(write, text).not.toBeNull();
    return databaseOnlyWriteForm(text, write!);
  };
  for (const form of DATABASE_ONLY) expect(ask(form.replace(/\$T/g, 'zlog')), form).toBe(true);
  expect(ask('UPDATE zlog SET id = 2.')).toBe(true);
  expect(ask('MODIFY zlog FROM ls.')).toBe(false);
  expect(ask('DELETE zlog FROM 2.')).toBe(false);
  // The UPDATE-only reading the skeleton and the call graph keep.
  expect(writesDatabaseOnly({ table: 'ZLOG', keyword: 'DELETE' })).toBe(false);
  expect(writesDatabaseOnly({ table: 'ZLOG', keyword: 'INSERT' })).toBe(false);
  expect(writesDatabaseOnly({ table: 'ZLOG', keyword: 'MODIFY' })).toBe(false);
  expect(writesDatabaseOnly({ table: 'ZLOG', keyword: 'UPDATE' })).toBe(true);
});
