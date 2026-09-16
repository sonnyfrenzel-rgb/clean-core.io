import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readCallGraph } from '../lib/abap/call-graph';
import { buildProcessFacts } from '../lib/abap/process-facts';

/**
 * What the program calls and what it writes — roadmap 2.2.
 *
 * Seven facts the row names, each with a line range: the FORM/PERFORM graph,
 * function-module names with BAPIs marked, `CALL TRANSACTION`, `SUBMIT`,
 * `AUTHORITY-CHECK` with object and fields, and database writes. The engine
 * followed no PERFORM at all before this and recorded `AUTHORITY-CHECK` without
 * either its object or its fields (`docs/ROADMAP.md` §3).
 *
 * Measured against the two ABAP programs this product ships. The counts are
 * pinned: a starter example that changes changes them, deliberately.
 */
const EXAMPLES = join(process.cwd(), 'public/starter-examples');
const read = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');

const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PO = 'Z_MM_PO_APPROVAL.abap';

test.describe('the FORM/PERFORM graph of the shipped programs', () => {
  test(`${LEGACY} — 42 subroutines, 50 calls, every target resolved`, () => {
    const report = readCallGraph(read(LEGACY));
    expect(report.forms).toHaveLength(42);
    expect(report.performs).toHaveLength(50);
    expect(report.edges, 'every call resolves inside this source').toHaveLength(50);
    expect(report.unresolvedTargets).toEqual([]);
    expect(report.recursion).toEqual([]);
    expect(report.reachabilityCertain, 'no PERFORM (name) in this file').toBe(true);

    for (const form of report.forms) {
      expect(form.terminated, `FORM ${form.name} has no ENDFORM`).toBe(true);
      expect(form.lineEnd).toBeGreaterThan(form.lineStart);
    }
  });

  test(`${LEGACY} — 17 subroutines over 311 lines are never reached`, () => {
    const report = readCallGraph(read(LEGACY));
    expect(report.neverPerformed).toHaveLength(17);
    expect(report.unreachable).toHaveLength(17);
    expect(report.unreachableLines).toBe(311);
    // The demonstration routines at the end of the file: business rules 1-14 plus
    // the native-SQL, SUBMIT and CALL SCREEN examples.
    expect(report.unreachable.filter((n) => n.startsWith('LEGACY_BUSINESS_RULE_'))).toHaveLength(14);
    expect(report.unreachable).toContain('LEGACY_SUBMIT_EXAMPLE');
  });

  test(`${PO} — 35 subroutines, 34 calls, entry point is the event block`, () => {
    const report = readCallGraph(read(PO));
    expect(report.forms).toHaveLength(35);
    expect(report.performs).toHaveLength(34);
    expect(report.edges).toHaveLength(34);
    expect(report.unresolvedTargets).toEqual([]);

    const entry = report.edges.filter((e) => e.fromKind === 'event');
    expect(entry.length, 'the program starts at START-OF-SELECTION').toBeGreaterThan(0);
    expect(new Set(entry.map((e) => e.from))).toEqual(new Set(['START-OF-SELECTION']));
    expect(entry[0].to).toBe('CHECK_AUTHORITY');
  });

  test(`${PO} — a routine reached only from an unreached routine is unreached too`, () => {
    const report = readCallGraph(read(PO));
    expect(report.neverPerformed).toHaveLength(12);
    expect(report.unreachable).toHaveLength(13);
    expect(report.unreachableLines).toBe(147);

    // CHECK_COST_CENTER is performed — by CHECK_ACCOUNT_ASSIGNMENT, which nothing
    // performs. "Never performed" and "never reached" are different questions.
    expect(report.neverPerformed).not.toContain('CHECK_COST_CENTER');
    expect(report.unreachable).toContain('CHECK_COST_CENTER');
    expect(report.unreachable).toContain('CHECK_ACCOUNT_ASSIGNMENT');
  });

  test('subroutine parameters keep their direction and drop their types', () => {
    const report = readCallGraph(read(PO));
    const stored = report.forms.find((f) => f.name === 'STORE_ATTACHMENT');
    expect(stored?.parameters).toEqual([
      { name: 'IT_BIN', direction: 'tables' },
      { name: 'IV_LENGTH', direction: 'using' },
    ]);
    const converted = report.forms.find((f) => f.name === 'CONVERT_TO_EUR');
    expect(converted?.parameters).toEqual([
      { name: 'IV_WAERS', direction: 'using' },
      { name: 'CV_AMOUNT', direction: 'changing' },
    ]);
  });
});

test.describe('calls the graph cannot close', () => {
  test('a PERFORM to a subroutine this source does not define is named', () => {
    const source = [
      'START-OF-SELECTION.',
      '  PERFORM here.',
      '  PERFORM elsewhere.',
      'FORM here.',
      '  x = 1.',
      'ENDFORM.',
    ].join('\n');

    const report = readCallGraph(source);
    expect(report.unresolvedTargets).toEqual(['ELSEWHERE']);
    expect(report.edges.map((e) => e.to), 'an unresolved call is not an edge').toEqual(['HERE']);
    expect(report.performs.find((p) => p.target === 'ELSEWHERE')?.unresolved).toBe(true);
    expect(report.performs.find((p) => p.target === 'HERE')?.unresolved).toBe(false);
  });

  test('a computed target makes reachability an opinion, and the report says so', () => {
    const source = [
      'START-OF-SELECTION.',
      '  PERFORM (lv_name) IN PROGRAM (lv_prog).',
      'FORM never_called.',
      '  x = 1.',
      'ENDFORM.',
    ].join('\n');

    const report = readCallGraph(source);
    expect(report.performs[0].dynamic).toBe(true);
    expect(report.performs[0].target).toBeUndefined();
    expect(report.performs[0].unresolved, 'unknown is not the same as missing').toBe(false);
    expect(report.reachabilityCertain).toBe(false);
    expect(report.unreachable, 'still reported, but no longer proven').toEqual(['NEVER_CALLED']);
  });

  test('recursion is found, direct and mutual', () => {
    const source = [
      'START-OF-SELECTION.',
      '  PERFORM walk.',
      '  PERFORM ping.',
      'FORM walk.',
      '  PERFORM walk.',
      'ENDFORM.',
      'FORM ping.',
      '  PERFORM pong.',
      'ENDFORM.',
      'FORM pong.',
      '  PERFORM ping.',
      'ENDFORM.',
    ].join('\n');

    const report = readCallGraph(source);
    const cycles = report.recursion.map((c) => c.join('>')).sort();
    expect(cycles).toEqual(['PING>PONG', 'WALK']);
  });

  test('a chained PERFORM is two calls, each on its own line', () => {
    const source = ['START-OF-SELECTION.', '  PERFORM: alpha,', '           beta.'].join('\n');
    const report = readCallGraph(source);
    expect(report.performs.map((p) => [p.target, p.lineStart])).toEqual([
      ['ALPHA', 2],
      ['BETA', 3],
    ]);
  });

  test('a comment or a literal containing PERFORM produces nothing', () => {
    const source = [
      'REPORT z_prose.',
      '* PERFORM the check before you release the requisition.',
      "  WRITE 'PERFORM check_limit'.",
      "  lv_hint = `CALL FUNCTION 'BAPI_PO_CREATE1'`.",
      "  MESSAGE 'SUBMIT the report' TYPE 'I'.  \" CALL TRANSACTION ME21N",
    ].join('\n');

    const report = readCallGraph(source);
    expect(report.performs).toEqual([]);
    expect(report.functionModules).toEqual([]);
    expect(report.submits).toEqual([]);
    expect(report.transactions).toEqual([]);
  });
});

test.describe('function modules, transactions and reports', () => {
  test('names are read, BAPIs are marked, a computed name is not invented', () => {
    const report = readCallGraph(read(PO));
    expect(report.functionModules).toHaveLength(7);

    const bapis = report.functionModules.filter((c) => c.bapi).map((c) => c.name);
    expect(bapis).toEqual(['BAPI_PO_CREATE1', 'BAPI_TRANSACTION_COMMIT']);
    // A workflow API is not a BAPI, whatever it does.
    expect(report.functionModules.find((c) => c.name === 'SAP_WAPI_CREATE_EVENT')?.bapi).toBe(false);

    const dynamic = report.functionModules.filter((c) => c.dynamic);
    expect(dynamic).toHaveLength(1);
    expect(dynamic[0].name, 'CALL FUNCTION lv_fm_name names nothing yet').toBeUndefined();
    expect(dynamic[0].caller).toBe('NOTIFY_REQUESTER');
  });

  test('a destination and an update task are recorded as written', () => {
    const report = readCallGraph(read(LEGACY));
    expect(report.functionModules).toHaveLength(6);
    const remote = report.functionModules.find((c) => c.destination);
    expect(remote?.name).toBe('Z_CREDIT_EXPOSURE_READ');
    expect(remote?.destination, 'the argument as the source writes it').toBe('c_destination');
    const update = report.functionModules.find((c) => c.inUpdateTask);
    expect(update?.name).toBe('Z_SD_LEGACY_LOG_WRITE');
  });

  test('CALL TRANSACTION keeps a literal code and resolves a constant', () => {
    const literal = readCallGraph(read(PO)).transactions;
    expect(literal).toHaveLength(1);
    expect(literal[0].code).toBe('ME21N');
    expect(literal[0].resolvedFrom).toBe('literal');
    expect(literal[0].batchInput, "CALL TRANSACTION … USING <bdcdata> is batch input").toBe(true);
    expect(literal[0].caller).toBe('CREATE_PO_BATCH_INPUT');

    const constant = readCallGraph(read(LEGACY)).transactions;
    expect(constant).toHaveLength(1);
    expect(constant[0].codeExpression, 'what the source writes').toBe('c_tcode_va02');
    expect(constant[0].code, 'and what the constant it names holds').toBe('VA02');
    expect(constant[0].resolvedFrom).toBe('constant');
    expect(constant[0].dynamic).toBe(false);
  });

  test('a transaction code held in a variable stays unknown', () => {
    const source = ['FORM go.', "  CALL TRANSACTION lv_tcode USING lt_bdc MODE 'N'.", 'ENDFORM.'].join('\n');
    const call = readCallGraph(source).transactions[0];
    expect(call.code).toBeUndefined();
    expect(call.codeExpression).toBe('lv_tcode');
    expect(call.dynamic).toBe(true);
  });

  test('SUBMIT names the report it starts', () => {
    const report = readCallGraph(read(LEGACY));
    expect(report.submits).toHaveLength(1);
    expect(report.submits[0].program).toBe('RV_ORDER_FLOW_INFORMATION');
    expect(report.submits[0].andReturn).toBe(true);
    expect(report.submits[0].viaJob).toBe(false);
    expect(report.submits[0].caller).toBe('LEGACY_SUBMIT_EXAMPLE');
  });

  test('a SUBMIT whose program is computed says so', () => {
    const call = readCallGraph('FORM go.\n  SUBMIT (lv_prog) AND RETURN.\nENDFORM.').submits[0];
    expect(call.dynamic).toBe(true);
    expect(call.program).toBeUndefined();
    expect(call.programExpression).toBe('(lv_prog)');
  });
});

test.describe('AUTHORITY-CHECK with object and fields', () => {
  test('both checks of the legacy program carry object, IDs and values', () => {
    const report = readCallGraph(read(LEGACY));
    expect(report.authorityChecks).toHaveLength(2);

    const [display, change] = report.authorityChecks;
    expect(display.object).toBe('V_VBAK_VKO');
    expect(display.lineStart).toBe(197);
    expect(display.lineEnd, 'the check spans three lines and the range says so').toBe(199);
    expect(display.fields).toEqual([
      { id: 'VKORG', value: 'c_default_vkorg', dummy: false },
      { id: 'ACTVT', value: '03', dummy: false },
    ]);
    expect(change.fields[1], 'the second check asks for change, not display').toEqual({
      id: 'ACTVT',
      value: '02',
      dummy: false,
    });
    expect(change.caller).toBe('AUTHORITY_CHECK');
  });

  test('the purchasing check of the PO program names its purchasing group', () => {
    const check = readCallGraph(read(PO)).authorityChecks[0];
    expect(check.object).toBe('M_BANF_EKG');
    expect(check.fields.map((f) => f.id)).toEqual(['ACTVT', 'EKGRP']);
    expect(check.fields[1].value, 'the field is filled from a variable, named as written').toBe('lv_ekgrp');
  });

  test('a DUMMY field is a declared field that is deliberately not checked', () => {
    const source = [
      'FORM check.',
      "  AUTHORITY-CHECK OBJECT 'S_TCODE'",
      "    ID 'TCD' FIELD 'SE38'",
      "    ID 'ACTVT' DUMMY.",
      'ENDFORM.',
    ].join('\n');
    const check = readCallGraph(source).authorityChecks[0];
    expect(check.object).toBe('S_TCODE');
    expect(check.fields).toEqual([
      { id: 'TCD', value: 'SE38', dummy: false },
      { id: 'ACTVT', value: undefined, dummy: true },
    ]);
  });
});

test.describe('database writes come from the one discriminator', () => {
  test('the internal-table forms produce nothing', () => {
    const source = [
      'FORM work.',
      '  INSERT ls_item INTO TABLE lt_items.',
      '  MODIFY lt_items FROM ls_item INDEX sy-tabix.',
      '  DELETE lt_items WHERE status = 1.',
      '  DELETE ADJACENT DUPLICATES FROM lt_items COMPARING id.',
      '  MODIFY SCREEN.',
      'ENDFORM.',
    ].join('\n');
    expect(readCallGraph(source).databaseWrites).toEqual([]);
  });

  test('MODIFY dbtab FROM TABLE itab is a write despite the words', () => {
    const writes = readCallGraph('FORM w.\n  MODIFY zorder_head FROM TABLE lt_rows.\nENDFORM.').databaseWrites;
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ table: 'ZORDER_HEAD', keyword: 'MODIFY', caller: 'W' });
  });

  test('the shipped programs write where they say they write', () => {
    const po = readCallGraph(read(PO)).databaseWrites;
    expect(po.map((w) => `${w.keyword} ${w.table}@${w.lineStart}`)).toEqual([
      'UPDATE EBAN@246',
      'INSERT ZMM_PO_APPR@450',
      'UPDATE EBAN@455',
      'INSERT ZMM_PO_ATTACH@647',
    ]);
    // `UPDATE 'S'` on line 633 is an argument of CALL TRANSACTION, not a write.
    expect(po.map((w) => w.lineStart)).not.toContain(633);

    const legacy = readCallGraph(read(LEGACY)).databaseWrites;
    expect(legacy.map((w) => `${w.keyword} ${w.table}`)).toEqual([
      'INSERT ZSD_ORD_RISK',
      'INSERT ZSD_LEGACY_LOG',
    ]);
  });
});

test.describe('the seam the process skeleton reads', () => {
  test('one reading serves both halves, and the line numbers agree', () => {
    const facts = buildProcessFacts(read(PO));
    expect(facts.statements.length).toBe(444);
    expect(facts.control.branches).toHaveLength(41);
    expect(facts.calls.forms).toHaveLength(35);
    expect(facts.structure.unterminated, 'nothing in this file is left open').toEqual([]);

    // A branch and the call inside it must agree about which routine they are in.
    const branch = facts.control.branches.find((b) => b.container === 'DECIDE_APPROVAL');
    const call = facts.calls.performs.find((p) => p.caller === 'DECIDE_APPROVAL');
    expect(branch).toBeTruthy();
    expect(call).toBeTruthy();
    expect(call!.lineStart).toBeGreaterThanOrEqual(
      facts.calls.forms.find((f) => f.name === 'DECIDE_APPROVAL')!.lineStart,
    );
    expect(branch!.lineStart).toBeGreaterThanOrEqual(
      facts.calls.forms.find((f) => f.name === 'DECIDE_APPROVAL')!.lineStart,
    );
  });
});
