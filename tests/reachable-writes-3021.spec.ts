import { test, expect } from '@playwright/test';
import { readStatements } from '../lib/abap/statement-reader';
import { readBlocks } from '../lib/abap/block-structure';
import { readCallGraphFrom } from '../lib/abap/call-graph';
import { programWrites, reachableWrites } from '../lib/abap/reachable-writes';
import { programArchitecture } from '../lib/transformation/architecture';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { rfcCallTarget, routeDrivers } from '../lib/abap/extensibility-router';
import { prepareEngineLed } from '../lib/transformation/engine-led';
import { abapCheck } from '../lib/transformation/abap-check';

/**
 * Roadmap 3.0.21 — the target architecture and the route from reachable behaviour, not from text (external code
 * audit of 22.10.2026). Synthetic programs written here. Server-free.
 *
 *   - `programArchitecture` counted every database write of the call graph — one in a FORM nothing calls, or behind a
 *     constant that is always off, made a report a "writing program" — and none of the posting calls: a program that
 *     posts through a BAPI, batch input or MODIFY ENTITIES was "read-only".
 *   - `routeDrivers` let an RFC call no run reaches choose a side-by-side route, and read `DESTINATION c_dest` with
 *     `c_dest` declared as 'NONE' as a call to another system.
 */

function factsOf(source: string, engineVersion: string | null) {
  const statements = readStatements(source);
  const graph = readCallGraphFrom(statements, readBlocks(statements));
  return { source, statements, graph, engineVersion };
}

/** A report whose only table write stands in a FORM nothing performs, and one behind a constant that is always off. */
const DEAD_WRITES = [
  'REPORT zfx_dead_writes.',
  "CONSTANTS gc_live TYPE c LENGTH 1 VALUE ' '.",
  'DATA gs_log TYPE zlog.',
  'START-OF-SELECTION.',
  '  PERFORM report_lines.',
  'FORM report_lines.',
  "  IF gc_live <> 'X'.",
  "    MESSAGE 'Live path disabled' TYPE 'E'.",
  '  ENDIF.',
  '  INSERT zlog FROM gs_log.',
  'ENDFORM.',
  'FORM old_save.',
  '  MODIFY zlog FROM gs_log.',
  'ENDFORM.',
].join('\n');

/** A program that posts only through a BAPI and batch input — no table write of its own. */
const POSTING = [
  'REPORT zfx_posting.',
  'DATA: ls_header TYPE bapimepoheader, lt_return TYPE STANDARD TABLE OF bapiret2, lt_bdc TYPE STANDARD TABLE OF bdcdata.',
  'START-OF-SELECTION.',
  "  CALL FUNCTION 'BAPI_PO_GETDETAIL1'.",
  "  CALL FUNCTION 'BAPI_PO_CREATE1' EXPORTING poheader = ls_header TABLES return = lt_return.",
  "  CALL TRANSACTION 'ME22N' USING lt_bdc MODE 'N'.",
  "  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'.",
].join('\n');

test('a write no run reaches does not make a report a writing program', () => {
  const facts = factsOf(DEAD_WRITES, '3.0.21');
  expect(programWrites(facts).map((w) => `${w.kind} ${w.object} L${w.lineStart}`)).toEqual(['table-write ZLOG L10', 'table-write ZLOG L13']);
  expect(reachableWrites(facts)).toEqual([]);
  expect(programArchitecture(facts)).toBe('read-only');
  // An engine before 3.0.21 keeps its reading.
  expect(programArchitecture(factsOf(DEAD_WRITES, '3.0.20'))).toBe('writing');
});

test('a program that posts through a BAPI or batch input is a writing program; reading BAPIs and the commit are not writes', () => {
  const facts = factsOf(POSTING, '3.0.21');
  expect(reachableWrites(facts).map((w) => `${w.kind} ${w.object}`)).toEqual(['posting-call BAPI_PO_CREATE1', 'batch-input ME22N']);
  expect(programArchitecture(facts)).toBe('writing');
  expect(programArchitecture(factsOf(POSTING, '3.0.20'))).toBe('read-only');
});

test('MODIFY ENTITIES is a write', () => {
  const src = ['REPORT zfx_eml.', 'START-OF-SELECTION.', '  MODIFY ENTITIES OF i_purchaseordertp_2 ENTITY purchaseorder UPDATE FIELDS ( purchaseordertype ) WITH VALUE #( ( ) ).'].join('\n');
  expect(reachableWrites(factsOf(src, '3.0.21')).map((w) => `${w.kind} ${w.object}`)).toEqual(['entity-modify I_PURCHASEORDERTP_2']);
});

const RFC = (destination: string, dead: boolean) =>
  [
    'REPORT zfx_rfc.',
    "CONSTANTS: gc_dest TYPE rfcdest VALUE 'NONE',",
    "           gc_remote TYPE rfcdest VALUE 'ERP_PROD'.",
    'START-OF-SELECTION.',
    dead ? "  WRITE 'nothing'." : '  PERFORM call_out.',
    'FORM call_out.',
    `  CALL FUNCTION 'Z_REMOTE_READ' DESTINATION ${destination}.`,
    'ENDFORM.',
  ].join('\n');

test('DESTINATION with a constant whose value is NONE calls this system and chooses no route', () => {
  const now = buildAbapEvidence(RFC('gc_dest', false), 'ZFX_RFC.abap', 'private', undefined, '3.0.21');
  const rfc = now.findings.find((f) => f.kind === 'rfc-call')!;
  expect(rfc.rfcTarget).toBe('local');
  expect(rfcCallTarget(rfc)).toBe('local');
  expect(routeDrivers(now, 'private', '3.0.21')).toEqual([]);
  // Another value stays a call to another system.
  const remote = buildAbapEvidence(RFC('gc_remote', false), 'ZFX_RFC.abap', 'private', undefined, '3.0.21');
  expect(routeDrivers(remote, 'private', '3.0.21').map((d) => d.kind)).toEqual(['rfc-call']);
  // An engine before 3.0.21 keeps its reading.
  const before = buildAbapEvidence(RFC('gc_dest', false), 'ZFX_RFC.abap', 'private', undefined, '3.0.20');
  expect(before.findings.find((f) => f.kind === 'rfc-call')!.rfcTarget).toBeUndefined();
  expect(routeDrivers(before, 'private', '3.0.20').map((d) => d.kind)).toEqual(['rfc-call']);
});

test('an RFC call in a FORM nothing calls is a finding, never a route driver', () => {
  const ev = buildAbapEvidence(RFC('gc_remote', true), 'ZFX_RFC.abap', 'private', undefined, '3.0.21');
  const rfc = ev.findings.find((f) => f.kind === 'rfc-call')!;
  expect(rfc.uncalled).toEqual({ routine: 'CALL_OUT' });
  expect(routeDrivers(ev, 'private', '3.0.21')).toEqual([]);
  expect(routeDrivers({ findings: [{ ...rfc, uncalled: undefined, notReached: true }] }, 'private', '3.0.21')).toEqual([]);
  expect(routeDrivers(ev, 'private', '3.0.20').map((d) => d.kind)).toEqual(['rfc-call']);
});

test('RAP: a program that posts only through a BAPI gets the business object on engine 3.0.21, and it activates', () => {
  const src = [
    'REPORT zfx_posting.',
    'DATA: ls_header TYPE bapimepoheader, lt_return TYPE STANDARD TABLE OF bapiret2.',
    "PARAMETERS p_bsart TYPE c LENGTH 4 DEFAULT 'NB'.",
    'START-OF-SELECTION.',
    '  PERFORM post.',
    'FORM post.',
    '  ls_header-doc_type = p_bsart.',
    "  CALL FUNCTION 'BAPI_PO_CREATE1' EXPORTING poheader = ls_header TABLES return = lt_return.",
    'ENDFORM.',
  ].join('\n');
  const files = (engine: string) => {
    const p = prepareEngineLed({ source: src, track: 'rap', program: 'Z_TEST', decisions: [], contextText: '', project: { analyzerVersion: engine } });
    if (!p.ok) throw new Error(p.reason);
    return p.scaffold.files;
  };
  const now = files('3.0.21');
  expect(now.some((f) => f.path.endsWith('.bdef.asbdef'))).toBe(true);
  const r = abapCheck(now);
  if (!r.ran) throw new Error(r.reason);
  expect(r.activation.activatable, JSON.stringify(r.activation.findings.filter((f) => f.kind !== 'lint').slice(0, 5))).toBe(true);
  expect(files('3.0.20').some((f) => f.path.endsWith('.bdef.asbdef'))).toBe(false);
});
