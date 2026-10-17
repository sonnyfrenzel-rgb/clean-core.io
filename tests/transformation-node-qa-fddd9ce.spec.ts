import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { typeCheckCandidate, type TypeCheckResult } from '../lib/test-sandbox/type-check';
import { guardBodyOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { LOOKUPS_FILE } from '../lib/transformation/lookups-node';
import { fileUrl, runInPackage, writePackage } from './helpers/transformation-scaffold';

/**
 * QA review of fddd9ce18548 — four confirmed findings on the Node package's authority and lookup seams (roadmap
 * 3.0.17 criterion 3). Synthetic snippets, not any acceptance program. Server-free.
 *
 *   - fd3392b066b8: `const rc = authority_L90(); void rc;` passed, because any later mention of `rc` counted as a use.
 *   - cbe1c1d82c46: a character column was compared by value when it looked numeric (`WHERE f < '2'` missed '10').
 *   - 0c30977361da: a WHERE the engine does not write (`IS INITIAL`, NOT IN …) left its column out of the row type.
 *   - 90667d2a91ae: two SELECTs (or two AUTHORITY-CHECKs) on one line got the same frame name twice.
 */

const typeErrors = (r: TypeCheckResult) => (r.ran ? r.findings.map((f) => `${f.path}:${f.line} ${f.code} ${f.message}`) : [`not run: ${r.reason}`]);

function prep(source: string): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const AUTH_SOURCE = [
  'REPORT z_cc_authority_discard.',
  "PARAMETERS p_werks TYPE c LENGTH 4 OBLIGATORY DEFAULT '1000'.",
  'DATA gv_done TYPE c LENGTH 1.',
  'DATA gv_subrc TYPE i.',
  'START-OF-SELECTION.',
  '  PERFORM check_plant.',
  "  gv_done = 'X'.",
  'FORM check_plant.',
  // Inside a branch the body writes: the frame does not run it, the body keeps it (QA 8394df76b027).
  '  IF p_werks IS NOT INITIAL.',
  "    AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD p_werks ID 'ACTVT' FIELD '03'.",
  '    IF sy-subrc <> 0.',
  "      MESSAGE 'No authorization' TYPE 'E'.",
  '    ENDIF.',
  '  ENDIF.',
  'ENDFORM.',
  '',
].join('\n');

test.describe('fd3392b066b8: the answer of the authority check is used only where it can change the outcome', () => {
  test('a discard is refused — void, a bare statement, `_ =`, a log, a field never read; a test, a hand-over or a return passes', () => {
    const p = prep(AUTH_SOURCE);
    const line = AUTH_SOURCE.split('\n').findIndex((l) => l.includes('AUTHORITY-CHECK')) + 1;
    const unit = p.plan.units.find((u) => u.kind !== 'orchestrator' && u.abap.some((r) => line >= r.lineStart && line <= r.lineEnd))!;
    const guard = p.plan.guards.find((g) => g.carried && g.unitId === unit.id && /sy-subrc/i.test(g.condition))!;
    const fn = `authority_L${line}`;
    const why = (body: string) => guardBodyOf(p)(unit.id, body, []);
    const protectedOp = `const r = ${guard.helper}(sel, st, null, { sySubrc: 0 });\nif (r) return r;`;
    for (const discarded of [
      `const rc = ${fn}();\nvoid rc;\n${protectedOp}`,
      `const rc = ${fn}();\nrc;\n${protectedOp}`,
      `let _ = 0;\nconst rc = ${fn}();\n_ = rc;\n${protectedOp}`,
      `const rc = ${fn}();\nconsole.log(rc);\n${protectedOp}`,
      `const rc = ${fn}();\nconst copy = rc;\nvoid copy;\n${protectedOp}`,
      `st.local.gvSubrc = ${fn}();\n${protectedOp}`,
    ]) {
      expect(why(discarded), discarded).toContain('ignores its answer');
    }
    for (const effective of [
      `const sySubrc = ${fn}();\nconst r = ${guard.helper}(sel, st, null, { sySubrc });\nif (r) return r;`,
      `const r = ${guard.helper}(sel, st, null, { sySubrc: ${fn}() });\nif (r) return r;`,
      `const rc = ${fn}();\nconst r = ${guard.helper}(sel, st, null, { sySubrc: rc });\nif (r) return r;`,
      `const rc = ${fn}();\nif (rc !== 0) return new Refusal([{ field: null, rule: 'AUTH', message: 'denied' }]);\n${protectedOp}`,
      `if (${fn}() !== 0) return new Refusal([{ field: null, rule: 'AUTH', message: 'denied' }]);\n${protectedOp}`,
      `st.local.gvSubrc = ${fn}();\nconst r = ${guard.helper}(sel, st, null, { sySubrc: st.local.gvSubrc });\nif (r) return r;`,
    ]) {
      expect(why(effective), effective).toBeNull();
    }
  });
});

const READ_SOURCE = [
  'REPORT z_cc_lookup_qa.',
  '',
  'TYPES: BEGIN OF ty_order,',
  '         vbeln TYPE c LENGTH 10,',
  '         kunnr TYPE c LENGTH 10,',
  '       END OF ty_order.',
  '',
  'DATA: gt_orders TYPE STANDARD TABLE OF ty_order WITH DEFAULT KEY,',
  '      gv_code    TYPE c LENGTH 4,',
  '      gv_open    TYPE i,',
  '      gv_big     TYPE i,',
  '      gv_land1   TYPE c LENGTH 3,',
  '      gv_name1   TYPE c LENGTH 35.',
  '',
  "PARAMETERS p_vkorg TYPE c LENGTH 4 OBLIGATORY DEFAULT '1000'.",
  '',
  'START-OF-SELECTION.',
  '  PERFORM read_orders.',
  '  PERFORM check_orders.',
  '',
  'FORM read_orders.',
  '  SELECT vbeln kunnr FROM vbak INTO TABLE gt_orders WHERE vkorg = p_vkorg.',
  'ENDFORM.',
  '',
  'FORM check_orders.',
  '  DATA ls_order TYPE ty_order.',
  '  LOOP AT gt_orders INTO ls_order.',
  '    PERFORM read_codes USING ls_order.',
  '  ENDLOOP.',
  'ENDFORM.',
  '',
  'FORM read_codes USING is_order TYPE ty_order.',
  '  DATA lt_codes TYPE STANDARD TABLE OF zcode-code WITH DEFAULT KEY.',
  '  DATA lt_open TYPE STANDARD TABLE OF zcode-code WITH DEFAULT KEY.',
  '  DATA lt_big TYPE STANDARD TABLE OF zcode-code WITH DEFAULT KEY.',
  '  DATA lv_min TYPE i VALUE 5.',
  "  SELECT code FROM zcode INTO TABLE lt_codes WHERE code < '2'.",
  '  gv_code = lines( lt_codes ).',
  '  SELECT code FROM zcode INTO TABLE lt_open WHERE status IS INITIAL.',
  '  gv_open = lines( lt_open ).',
  '  SELECT code FROM zcode INTO TABLE lt_big WHERE qty > lv_min.',
  '  gv_big = lines( lt_big ).',
  '  SELECT SINGLE land1 FROM kna1 INTO gv_land1 WHERE kunnr = is_order-kunnr. SELECT SINGLE name1 FROM kna1 INTO gv_name1 WHERE kunnr = is_order-kunnr.',
  'ENDFORM.',
  '',
].join('\n');

const lineOf = (source: string, needle: string) => source.split('\n').findIndex((l) => l.includes(needle)) + 1;

test.describe('the lookups of the Node package (QA review of fddd9ce18548)', () => {
  test('0c30977361da: a WHERE the engine does not write still types every column it names', () => {
    const p = prep(READ_SOURCE);
    const types = p.scaffold.files.find((f) => f.path === 'srv/lib/types.ts')!.content;
    const row = /\{([^}]*)\}/.exec(types.slice(types.indexOf('export interface ZcodeRow {')))?.[1] ?? '';
    for (const c of ['code', 'status', 'qty']) expect(row, c).toContain(`${c}: string | null;`);
    const line = lineOf(READ_SOURCE, 'status IS INITIAL');
    const fill = p.fillUnits.find((u) => u.lookups?.some((l) => l.line === line))!;
    expect(fill.lookups!.find((l) => l.line === line)).toMatchObject({ fn: null, open: ['WHERE status IS INITIAL'] });
  });

  test('90667d2a91ae: two reads on one line get two frame names, and the frame type-checks', () => {
    const p = prep(READ_SOURCE);
    const line = lineOf(READ_SOURCE, 'SELECT SINGLE land1');
    const unit = p.plan.units.find((u) => u.routine === 'READ_CODES')!;
    const step = p.scaffold.files.find((f) => f.path === unit.file)!.content;
    expect(step).toContain(`const lookup_L${line} = (): SelectSingle<Kna1Row> => select_kna1_L${line}(st, { kunnr: args.isOrder.kunnr });`);
    expect(step).toContain(`const lookup_L${line}_2 = (): SelectSingle<Kna1Row> => select_kna1_L${line}_2(st, { kunnr: args.isOrder.kunnr });`);
    expect(typeErrors(typeCheckCandidate(p.scaffold.files))).toEqual([]);
  });

  test('90667d2a91ae: two AUTHORITY-CHECKs on one line get two frame names, and the frame type-checks', () => {
    const source = AUTH_SOURCE.replace(
      "    AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD p_werks ID 'ACTVT' FIELD '03'.",
      "    AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD p_werks ID 'ACTVT' FIELD '03'. AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD p_werks ID 'ACTVT' FIELD '02'.",
    );
    const p = prep(source);
    const line = lineOf(source, 'AUTHORITY-CHECK');
    const unit = p.plan.units.find((u) => u.routine === 'CHECK_PLANT')!;
    const step = p.scaffold.files.find((f) => f.path === unit.file)!.content;
    expect(step).toContain(`const authority_L${line} = (): number => authority_check(st, 'M_MATE_WRK', { 'WERKS': sel.werks, 'ACTVT': '03' }, ${line});`);
    expect(step).toContain(`const authority_L${line}_2 = (): number => authority_check(st, 'M_MATE_WRK', { 'WERKS': sel.werks, 'ACTVT': '02' }, ${line});`);
    expect(typeErrors(typeCheckCandidate(p.scaffold.files))).toEqual([]);
  });

  test('cbe1c1d82c46: a character column orders as text; by value only against a numeric or a date operand', () => {
    test.setTimeout(180_000);
    const p = prep(READ_SOURCE);
    const lookups = p.scaffold.files.find((f) => f.path === LOOKUPS_FILE)!.content;
    const codeLine = lineOf(READ_SOURCE, "WHERE code < '2'");
    const qtyLine = lineOf(READ_SOURCE, 'WHERE qty > lv_min');
    expect(lookups).toContain('(row) => cmp(row.code, where.code) < 0');
    expect(lookups).toContain("(row) => cmp(row.qty, where.qty, 'number') > 0");
    const dir = writePackage(p.scaffold.files, 'cc-lookups-qa-');
    try {
      const out = runInPackage<Record<string, unknown>>(
        dir,
        [
          `const l = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/lookups.ts'))});`,
          "const zcode = [{ code: '10', status: '', qty: '10' }, { code: '1', status: 'X', qty: '3' }, { code: '3', status: null, qty: '20' }];",
          "const kna1 = [{ kunnr: '1', land1: 'FR', name1: 'A' }, { kunnr: '0001', land1: 'DE', name1: 'B' }];",
          'const st = { local: { dbZcode: zcode, dbKna1: kna1 } };',
          `const codes = l.select_zcode_L${codeLine}(st, { code: '2' }).rows.map((r) => r.code);`,
          `const big = l.select_zcode_L${qtyLine}(st, { qty: 5 }).rows.map((r) => r.code);`,
          "const key = l.select_kna1_L" + lineOf(READ_SOURCE, 'SELECT SINGLE land1') + "(st, { kunnr: '0001' }).row?.land1 ?? null;",
          "console.log(JSON.stringify({ codes, big, key, eqText: l.eq('0001', '1'), eqNumber: l.eq('0001', '1', 'number'), eqBlanks: l.eq('AB  ', 'AB'), date: l.cmp('2026-10-17', '20261017', 'date') }));",
        ].join('\n'),
      );
      // ABAP: '10' < '2' as text, '1' < '2'; '3' is not — the value order (10 > 2) is not the original's.
      expect(out.codes).toEqual(['10', '1']);
      // Against `lv_min TYPE i` the column is compared by value: qty 10 and 20 are > 5, 3 is not.
      expect(out.big).toEqual(['10', '3']);
      // A key with leading zeros is text: '0001' is not '1'.
      expect(out.key).toBe('DE');
      expect([out.eqText, out.eqNumber, out.eqBlanks, out.date]).toEqual([false, true, true, 0]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
