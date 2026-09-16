import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readControlFlow } from '../lib/abap/control-flow';
import { readStatements } from '../lib/abap/statement-reader';

/**
 * Where the program decides — roadmap 2.1.
 *
 * The engine used to count `IF` and `CASE` for a nesting-depth number and nothing
 * else (`docs/ROADMAP.md` §3), which is why the BPMN it produced carried gateways
 * without conditions. Phase 2 is accepted only when "jeder Task, jedes Gateway und
 * jede Lane einen Zeilenanker trägt oder sichtbar unbelegt ist", so every branch
 * here is measured against the two ABAP programs this product ships, not against
 * snippets written to suit the parser.
 *
 * The counts are pinned. A starter example that changes changes them, and that is
 * a decision somebody takes on purpose rather than a number that drifts.
 */
const EXAMPLES = join(process.cwd(), 'public/starter-examples');
const read = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');

const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PO = 'Z_MM_PO_APPROVAL.abap';

test.describe('the two programs this product ships', () => {
  test(`${LEGACY} — 86 IF, 2 CASE, 107 arms, every one anchored`, () => {
    const report = readControlFlow(read(LEGACY));
    const ifs = report.branches.filter((b) => b.kind === 'if');
    const cases = report.branches.filter((b) => b.kind === 'case');

    expect(ifs).toHaveLength(86);
    expect(cases).toHaveLength(2);
    expect(report.branches.reduce((n, b) => n + b.arms.length, 0)).toBe(107);
    expect(report.notHandled, 'nothing in this file defeats the reader').toEqual([]);

    // An element that cannot be anchored has to say so. None here cannot.
    for (const branch of report.branches) {
      expect(branch.terminated, `${branch.id} at L${branch.lineStart} never closed`).toBe(true);
      expect(branch.lineEnd, `${branch.id} ends before it starts`).toBeGreaterThanOrEqual(branch.lineStart);
      for (const arm of branch.arms) {
        expect(arm.header.lineStart, `${branch.id} ${arm.kind} has no line`).toBeGreaterThan(0);
        expect(arm.lineEnd).toBeGreaterThanOrEqual(arm.header.lineEnd);
      }
    }
  });

  test(`${PO} — 40 IF, 1 CASE, 53 arms`, () => {
    const report = readControlFlow(read(PO));
    expect(report.branches.filter((b) => b.kind === 'if')).toHaveLength(40);
    expect(report.branches.filter((b) => b.kind === 'case')).toHaveLength(1);
    expect(report.branches.reduce((n, b) => n + b.arms.length, 0)).toBe(53);
    expect(report.notHandled).toEqual([]);
  });

  test('a multiplication continued on the next line does not swallow the IF after it', () => {
    // Z_MM_PO_APPROVAL.abap:411-412 continues an expression with an indented `*`:
    //     lv_dev_pct = ( lv_price - lv_ref )
    //                * 100 / lv_ref.
    //     IF lv_dev_pct > 5.
    // Read as a comment line — which `^\s*\*` does — the assignment never finds
    // its period and eats the IF. That branch disappeared silently.
    const report = readControlFlow(read(PO));
    const branch = report.branches.find((b) => b.lineStart === 412);
    expect(branch, 'the price-tolerance branch at L412 is missing').toBeTruthy();
    expect(branch?.arms[0].condition).toBe('lv_dev_pct > 5');
  });

  test('IF / ELSEIF / ELSE keep the source condition and their own ranges', () => {
    const report = readControlFlow(read(PO));
    const branch = report.branches.find((b) => b.container === 'DECIDE_APPROVAL' && b.arms.length === 3);
    expect(branch, 'DECIDE_APPROVAL has an IF / ELSEIF / ELSE').toBeTruthy();

    expect(branch?.arms.map((a) => a.kind)).toEqual(['if', 'elseif', 'else']);
    expect(branch?.arms[0].condition, 'the condition as an ABAP reader wrote it').toBe(
      "gv_emergency = abap_true AND gv_amount <= '50000.00'",
    );
    expect(branch?.arms[1].condition).toBe('gv_skip_limit = abap_false');
    expect(branch?.arms[2].condition, 'ELSE states no condition').toBe('');

    // Each arm covers its own lines, and they do not overlap.
    const arms = branch?.arms ?? [];
    for (let i = 1; i < arms.length; i++) {
      expect(arms[i].lineStart, 'arms overlap').toBeGreaterThan(arms[i - 1].lineEnd);
    }
    expect(arms[arms.length - 1].lineEnd).toBeLessThan(branch?.lineEnd ?? 0);
  });

  test('CASE keeps its selector, its WHEN values and WHEN OTHERS apart', () => {
    const report = readControlFlow(read(PO));
    const branch = report.branches.find((b) => b.kind === 'case');
    expect(branch?.selector).toBe('gs_eban-knttp');
    expect(branch?.arms.map((a) => a.kind)).toEqual(['when', 'when', 'when', 'when-others']);
    expect(branch?.arms.map((a) => a.condition)).toEqual(["'K'", "'F'", 'space', '']);
    expect(branch?.container).toBe('CHECK_ACCOUNT_ASSIGNMENT');
  });
});

test.describe('nesting is kept, not flattened', () => {
  test('an IF inside a CASE inside a LOOP names all three, outermost first', () => {
    const report = readControlFlow(read(LEGACY));
    // PROCESS_ACTIONS: FORM > LOOP AT gt_orders > CASE <fs_order>-action > IF.
    const inner = report.branches.find((b) => b.lineStart === 439);
    expect(inner, 'the branch inside the CASE inside the LOOP is missing').toBeTruthy();
    expect(inner?.enclosing.map((e) => e.kind)).toEqual(['form', 'loop', 'case']);
    expect(inner?.container).toBe('PROCESS_ACTIONS');

    const outer = report.branches.find((b) => b.id === inner?.parentId);
    expect(outer?.kind, 'the parent is the CASE, not the LOOP and not the FORM').toBe('case');
    expect(outer?.selector).toBe('<fs_order>-action');
    expect(outer?.enclosing.map((e) => e.kind)).toEqual(['form', 'loop']);
  });

  test('an ELSE belongs to its own IF, not to the one around it', () => {
    const source = [
      'FORM outer.',
      '  IF a = 1.',
      '    IF b = 2.',
      '      x = 1.',
      '    ELSE.',
      '      x = 2.',
      '    ENDIF.',
      '  ELSE.',
      '    x = 3.',
      '  ENDIF.',
      'ENDFORM.',
    ].join('\n');

    const report = readControlFlow(source);
    expect(report.branches).toHaveLength(2);
    const [outer, inner] = report.branches;
    expect(outer.lineStart).toBe(2);
    expect(outer.arms.map((a) => [a.kind, a.header.lineStart])).toEqual([['if', 2], ['else', 8]]);
    expect(inner.lineStart).toBe(3);
    expect(inner.arms.map((a) => [a.kind, a.header.lineStart])).toEqual([['if', 3], ['else', 5]]);
    expect(inner.parentId).toBe(outer.id);
  });
});

test.describe('what a condition is, and what it is not', () => {
  test('a condition over four lines is one condition with all four in its range', () => {
    const source = [
      'FORM check.',
      '  IF lv_amount > 1000',
      "     AND lv_country = 'DE'",
      "     AND ( lv_type = 'A'",
      "        OR lv_type = 'B' ).",
      '    x = 1.',
      '  ENDIF.',
      'ENDFORM.',
    ].join('\n');

    const report = readControlFlow(source);
    expect(report.branches).toHaveLength(1);
    const arm = report.branches[0].arms[0];
    expect(arm.header.lineStart).toBe(2);
    expect(arm.header.lineEnd, 'the range has to reach the last line of the condition').toBe(5);
    expect(arm.condition).toBe("lv_amount > 1000 AND lv_country = 'DE' AND ( lv_type = 'A' OR lv_type = 'B' )");
  });

  test('a comment or a literal containing IF produces nothing', () => {
    const source = [
      'REPORT z_prose.',
      "* IF the amount is above the limit, ask the manager.",
      "  WRITE 'IF you see this, nothing was parsed.'.",
      "  lv_note = `CASE closed. ELSE nothing.`.",
      "  MESSAGE 'ELSEIF is a word' TYPE 'I'.  \" IF this were parsed it would be wrong",
      'IF lv_real = 1.',
      '  x = 1.',
      'ENDIF.',
    ].join('\n');

    const report = readControlFlow(source);
    expect(report.branches, 'exactly one real branch, and it is the last one').toHaveLength(1);
    expect(report.branches[0].lineStart).toBe(6);
    expect(report.branches[0].arms[0].condition).toBe('lv_real = 1');
  });

  test('a chained statement is split into its parts, each with its own line', () => {
    const source = [
      'START-OF-SELECTION.',
      '  PERFORM: read_data,',
      '           check_data,',
      '           write_data.',
    ].join('\n');

    const statements = readStatements(source);
    const performs = statements.filter((s) => s.keyword === 'PERFORM');
    expect(performs.map((s) => s.text)).toEqual([
      'PERFORM read_data',
      'PERFORM check_data',
      'PERFORM write_data',
    ]);
    expect(performs.map((s) => s.lineStart)).toEqual([2, 3, 4]);
    expect(performs.every((s) => s.fromChain)).toBe(true);
    expect(performs.map((s) => s.chainHeadLine), 'the keyword they borrowed stands on line 2').toEqual([2, 2, 2]);
  });

  test('two statements on one line are two statements', () => {
    const statements = readStatements('IF sy-subrc = 0. x = 1. ENDIF.');
    expect(statements.map((s) => s.text)).toEqual(['IF sy-subrc = 0', 'x = 1', 'ENDIF']);
    expect(statements.every((s) => s.lineStart === 1 && s.lineEnd === 1)).toBe(true);
  });
});

test.describe('what the reader will not guess at', () => {
  test('an IF nothing closes is reported rather than anchored', () => {
    const source = ['FORM broken.', '  IF a = 1.', '    x = 1.', 'ENDFORM.'].join('\n');
    const report = readControlFlow(source);

    expect(report.branches).toHaveLength(1);
    expect(report.branches[0].terminated).toBe(false);
    expect(report.notHandled.map((n) => n.reason)).toEqual(['unterminated']);
    expect(report.notHandled[0].lineStart).toBe(2);
    expect(report.notHandled[0].detail).toContain('ENDIF');
  });

  test('an IF that arrived through a chain colon is reported, not drawn', () => {
    // `IF: a = 1.` is not ABAP anybody writes, and it is not ABAP that compiles.
    // The reader separates the parts correctly and still refuses to make a
    // gateway out of a construct it had to repair.
    const source = ['IF: lv_a = 1.', '  x = 1.', 'ENDIF.'].join('\n');
    const report = readControlFlow(source);
    expect(report.branches).toEqual([]);
    expect(report.notHandled.map((n) => n.reason)).toEqual(['chained-branch']);
    expect(report.notHandled[0].snippet).toBe('IF lv_a = 1');
  });

  test('native SQL is marked, not read as ABAP', () => {
    // ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap:655-657. The `:` in
    // `INTO :lv_count` is a host variable; read as a chain colon it split the
    // query in two and carried the ENDEXEC off with the second half.
    const statements = readStatements(read(LEGACY));
    const native = statements.filter((s) => s.nativeSql);
    expect(native).toHaveLength(1);
    expect(native[0].fromChain, 'a host-variable colon is not a chain').toBe(false);
    expect(native[0].text).toContain(':lv_count');
    expect(native[0].text).toContain('ENDEXEC');
    expect(native[0].lineStart).toBe(656);

    // And it opens no block: the SQL SELECT is not an ABAP SELECT … ENDSELECT.
    const report = readControlFlow(read(LEGACY));
    expect(report.notHandled).toEqual([]);
  });

  test('a branch inside a macro body is reported, not drawn', () => {
    const source = [
      'DEFINE check_amount.',
      '  IF &1 > &2.',
      '    MESSAGE e001.',
      '  ENDIF.',
      'END-OF-DEFINITION.',
      'START-OF-SELECTION.',
      '  IF lv_real = 1.',
      '    x = 1.',
      '  ENDIF.',
    ].join('\n');

    const report = readControlFlow(source);
    expect(report.branches.map((b) => b.lineStart), 'only the branch outside the macro').toEqual([7]);
    expect(report.notHandled.map((n) => n.reason)).toEqual(['macro-body']);
    expect(report.notHandled[0].lineStart).toBe(2);
  });
});

test.describe('a period is not always the end of a statement', () => {
  // The scanner cut at every period outside a quoted literal. Two places in
  // ordinary ABAP put one somewhere else, and the second is the dangerous one:
  //
  //   lv_price = 12.50.          two statements, `lv_price = 12` and `50`
  //   IF lv_rate > 0.5.          the gateway's condition became `IF lv_rate > 0`
  //   lv = |Total: { x } EUR.|.  the statement ended inside the sentence
  //
  // A lost statement is visible. A truncated condition is not: it reads as a
  // complete condition that says something else (QA review of ca2464aba930).

  test('a decimal point does not end a statement', () => {
    const st = readStatements('REPORT z.\nlv_price = 12.50.\nIF lv_price > 10.\n  WRITE / lv_price.\nENDIF.');
    expect(st.map((s) => s.text)).toContain('lv_price = 12.50');
    expect(st.filter((s) => s.keyword === 'IF').length).toBe(1);
  });

  test('a truncated condition is the failure that would not be noticed', () => {
    const st = readStatements('REPORT z.\nIF lv_rate > 0.5.\n  PERFORM apply.\nENDIF.');
    const branch = st.find((s) => s.keyword === 'IF');
    expect(branch?.text, 'the condition lost everything after the decimal point').toBe('IF lv_rate > 0.5');
  });

  test('a string template keeps its full stops', () => {
    const st = readStatements('REPORT z.\nlv_text = |Total: { lv_price } EUR.|.\nWRITE / lv_text.');
    expect(st.length).toBe(3);
    expect(st[1].text).toContain('EUR.');
  });

  test('a template nested inside an embedded expression still closes', () => {
    // A bar inside `{ … }` opens or closes a nested template, and either way the
    // outer one is still open. Counting bars cannot tell the two apart.
    const st = readStatements('REPORT z.\nlv = |a { |b.c| } d.|.\nWRITE / lv.');
    expect(st.length, 'the statement never terminated').toBe(3);
    expect(st[2].text).toBe('WRITE / lv');
  });

  test('an ordinary period still ends an ordinary statement', () => {
    const st = readStatements('REPORT z.\nlv = 1. IF lv > 0. ENDIF.');
    expect(st.map((s) => s.text)).toEqual(['REPORT z', 'lv = 1', 'IF lv > 0', 'ENDIF']);
  });
});
