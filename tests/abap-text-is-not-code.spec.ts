import { test, expect } from '@playwright/test';
import { maskComments, maskLiterals, maskNonCode } from '../lib/abap/statement-reader';
import { databaseWriteIn, isInternalTableOperation } from '../lib/abap/open-sql-discrimination';
import { detectFindings } from '../lib/abap/findings-detector';
import { buildClassModel } from '../lib/abap/class-model-resolver';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { collectLocalDataObjects } from '../lib/abap/table-dependencies';
import { extractCodeInventory, extractDataCoupling, recommendArchitecture } from '../lib/abap/code-assessment';

/**
 * A comment is not code, and neither is the inside of a literal.
 *
 * The full review of `a19945ef01dc` raised thirteen engine defects and the
 * triage found one root under four of them: every detector masked literals for
 * itself, each knew `'…'` and `` `…` `` and none knew the string template
 * `|…|`, and two of them did not know comments either. The four:
 *
 *   - **f4383c553eaa** — `collectLocalDataObjects` read the raw source, so a
 *     commented-out `* DATA vbak TYPE ztab.` registered VBAK as a local variable
 *     and the real `UPDATE vbak` below it produced **no** finding at all. This
 *     is the one that erases rather than invents, which is why it is first.
 *   - **f5f91aeacd41** — `|TRANSPORTING|` inside a `MODIFY zlog` read as the
 *     internal-table clause, so a real write to a custom table vanished.
 *   - **19bdc218308b** — `|CALL SCREEN 100|` produced a Dynpro finding, level
 *     "not supported", sign-off required, on a program that calls no screen.
 *   - **359639c30d77** — `IDOC` in a comment routed the whole analysis to
 *     Integration with 80 % confidence.
 *
 * The rule is now one pre-stage — `maskLiterals` / `maskNonCode` in
 * `statement-reader.ts` — and this spec holds it from both sides: text must not
 * become a construct, and a construct must not become text.
 *
 * **The exception this spec also guards.** A literal is read where a consumer
 * reads it: the SQL text of an ADBC call is executed by the database (R13a),
 * and the name in `CALL FUNCTION 'MASTER_IDOC_DISTRIBUTE'` is the call target.
 * Those readers take `maskComments`, which drops the comment and keeps the
 * literal. The last block below fails if someone masks them flat.
 *
 * Serverless: pure functions over text.
 */

const support = (code: string) =>
  detectFindings(buildClassModel([{ file: 'x.abap', content: code }]), [{ file: 'x.abap', content: code }]);

const constructs = (code: string) => support(code).map((f) => f.construct);

const tableFindings = (code: string) =>
  buildAbapEvidence(code, 'ZTEST', 'private').findings.filter((f) =>
    ['standard-table-write', 'standard-table-read', 'custom-table-write', 'table-access'].includes(f.kind),
  );

const route = (code: string) =>
  recommendArchitecture(code, extractCodeInventory(code), extractDataCoupling(code)).architecture;

/* ------------------------------------------------------- the pre-stage itself */

test.describe('the pre-stage keeps the shape of the source', () => {
  test('every line and every column survives the masking', () => {
    const source = [
      'REPORT ztest.',
      "  WRITE 'hello'.        \" a note",
      '* a full-line comment',
      '  DATA(x) = |a template|.',
    ].join('\n');
    for (const masked of [maskNonCode(source), maskComments(source)]) {
      const before = source.split('\n');
      const after = masked.split('\n');
      expect(after).toHaveLength(before.length);
      after.forEach((line, i) => expect(line, `line ${i + 1} changed length`).toHaveLength(before[i].length));
    }
  });

  test('a literal loses its contents and keeps its delimiters', () => {
    // The delimiter is syntax: `CALL FUNCTION 'name'` is a resolvable call and
    // `CALL FUNCTION lv_name` is not, and the quote is the whole difference.
    expect(maskLiterals("WRITE 'hello'.")).toBe("WRITE '     '.");
    expect(maskLiterals('WRITE `hello`.')).toBe('WRITE `     `.');
    expect(maskLiterals('DATA(m) = |CALL SCREEN 100|.')).toBe('DATA(m) = |               |.');
  });

  test('an embedded expression of a template is masked with the text around it', () => {
    // `{ … }` is ABAP, evaluated before the text exists — never a clause of the
    // statement that carries the template.
    expect(maskLiterals('lv = |Status: { lv_x } ok|.')).toBe('lv = |                   |.');
  });

  test('a comment line goes, and an indented asterisk continuing a statement stays', () => {
    const source = ['lv_dev = ( a - b )', '  * 100 / c.', '  * prose here'].join('\n');
    const masked = maskNonCode(source).split('\n');
    expect(masked[1].trim(), 'the multiplication is a continuation, not a comment').toBe('* 100 / c.');
    expect(masked[2].trim(), 'no statement is open, so this is a comment').toBe('');
  });

  test('a quote inside a comment does not open a literal, and a quote inside a literal does not open a comment', () => {
    expect(maskNonCode(`MOVE a TO b. " don't`).trimEnd()).toBe('MOVE a TO b.');
    expect(maskNonCode(`WRITE 'a"b'.`).trimEnd()).toBe(`WRITE '   '.`);
  });

  test('maskComments drops the comment and keeps the literal', () => {
    expect(maskComments(`CALL FUNCTION 'IDOC_INPUT'. " old IDOC note`).trimEnd())
      .toBe(`CALL FUNCTION 'IDOC_INPUT'.`);
  });
});

/* ------------------------------------------- f4383c553eaa — the erased finding */

test.describe('a declaration that is not executed suppresses nothing (f4383c553eaa)', () => {
  const WRITE_TO_VBAK = 'UPDATE vbak SET erdat = sy-datum WHERE vbeln = lv_vbeln.';

  test('a commented-out declaration leaves the Critical finding standing', () => {
    const code = ['REPORT z_write.', '* DATA vbak TYPE ztab.', WRITE_TO_VBAK].join('\n');
    const f = tableFindings(code);
    expect(f.map((x) => x.kind)).toEqual(['standard-table-write']);
    expect(f[0].severity).toBe('Critical');
    expect(collectLocalDataObjects(code), 'a comment declared nothing').not.toContain('VBAK');
  });

  test('a declaration written inside a literal leaves it standing too', () => {
    const code = ['REPORT z_write.', "WRITE 'DATA vbak TYPE ztab'.", WRITE_TO_VBAK].join('\n');
    expect(tableFindings(code).map((x) => x.kind)).toEqual(['standard-table-write']);
  });

  test('a real declaration still suppresses — the guard removes noise, not coverage', () => {
    const code = ['REPORT z_local.', 'DATA vbak TYPE ztab.', WRITE_TO_VBAK].join('\n');
    expect(collectLocalDataObjects(code)).toContain('VBAK');
    expect(tableFindings(code), 'a name declared in the source is a variable').toHaveLength(0);
  });
});

/* -------------------------------------- f5f91aeacd41 — the template as a clause */

test.describe('an internal-table word inside a template is not a clause (f5f91aeacd41)', () => {
  const inTemplate: Array<[string, string]> = [
    ['MODIFY', "MODIFY zlog FROM @( VALUE zlog( message = |TRANSPORTING| ) )"],
    ['INSERT', "INSERT zlog FROM @( VALUE zlog( message = |INDEX| ) )"],
    ['DELETE', "DELETE FROM zlog WHERE message = |INTO TABLE|"],
  ];

  for (const [keyword, statement] of inTemplate) {
    test(`${keyword} with the word in a string template is still a database write`, () => {
      const write = databaseWriteIn(statement);
      expect(write, statement).not.toBeNull();
      expect(write!.table.toUpperCase()).toBe('ZLOG');
      expect(isInternalTableOperation(statement)).toBe(false);
    });
  }

  test('the real internal-table forms are still internal', () => {
    expect(databaseWriteIn('MODIFY lt_items FROM ls_item TRANSPORTING flag')).toBeNull();
    expect(databaseWriteIn('INSERT ls_wa INTO TABLE lt_items')).toBeNull();
    expect(isInternalTableOperation('DELETE lt_items INDEX 3')).toBe(true);
  });

  test('the write reaches the evidence engine from the same source', () => {
    const code = ['REPORT z_tpl.', "MODIFY zlog FROM @( VALUE zlog( message = |TRANSPORTING| ) )."].join('\n');
    expect(tableFindings(code).map((f) => f.kind)).toEqual(['custom-table-write']);
  });
});

/* --------------------------------------- 19bdc218308b — the fabricated construct */

test.describe('a construct named inside a literal is not a construct (19bdc218308b)', () => {
  const method = (body: string) =>
    ['CLASS zcl_x DEFINITION.', 'ENDCLASS.', 'CLASS zcl_x IMPLEMENTATION.', '  METHOD m.', `    ${body}`, '  ENDMETHOD.', 'ENDCLASS.'].join('\n');

  test('CALL SCREEN in a string template produces no Dynpro finding', () => {
    expect(constructs(method('DATA(message) = |CALL SCREEN 100|.'))).not.toContain('dynpro-screen');
  });

  test('CALL SCREEN in a comment produces none either', () => {
    expect(constructs(method('DATA(x) = 1. " CALL SCREEN 100 was here'))).not.toContain('dynpro-screen');
  });

  test('a real CALL SCREEN is still a not-supported finding that needs sign-off', () => {
    const f = support(method('CALL SCREEN 100.')).filter((x) => x.construct === 'dynpro-screen');
    expect(f).toHaveLength(1);
    expect(f[0].requiresSignOff).toBe(true);
  });

  test('the literal delimiter still tells a resolvable call from a dynamic one', () => {
    // The masking keeps `'`, so `CALL FUNCTION 'X'` stays a literal call. Blank
    // the delimiter too and every function call in the product becomes dynamic.
    expect(constructs(method(`CALL FUNCTION 'Z_DO_IT' EXPORTING iv_a = 1.`))).not.toContain('dynamic-call');
    expect(constructs(method('CALL FUNCTION lv_name EXPORTING iv_a = 1.'))).toContain('dynamic-call');
  });
});

/* -------------------------------------- 359639c30d77 — the routing from a comment */

test.describe('the architecture is decided by what executes (359639c30d77)', () => {
  const READ = 'SELECT * FROM vbak INTO TABLE @DATA(lt).';

  test('IDOC in a comment does not route to Integration', () => {
    const code = ['REPORT z_read.', '* replaced the old IDOC interface in 2019', READ].join('\n');
    expect(route(code)).not.toBe('integration');
  });

  test('a commented-out IDoc call does not route to Integration either', () => {
    // The call target is read out of its literal on purpose, so the comment has
    // to be gone before that reader runs — otherwise the exception reopens the
    // hole the masking closed, one layer down.
    const code = ['REPORT z_read.', `* CALL FUNCTION 'MASTER_IDOC_DISTRIBUTE'.`, READ].join('\n');
    expect(route(code)).not.toBe('integration');
  });

  test('a real IDoc function module does — the name in the literal is the call target', () => {
    const code = ['REPORT z_idoc.', `CALL FUNCTION 'MASTER_IDOC_DISTRIBUTE' EXPORTING x = 1.`].join('\n');
    expect(route(code)).toBe('integration');
  });

  test('a real RFC utility does too — the name a word boundary used to hide', () => {
    const code = ['REPORT z_rfc.', `CALL FUNCTION 'RFC_READ_TABLE' EXPORTING query_table = 'VBAK'.`].join('\n');
    expect(route(code)).toBe('integration');
  });
});

/* ------------------------------------------------- the exception, guarded */

test('a literal a consumer executes is still read: ADBC SQL text (R13a)', () => {
  // `table-dependencies.ts` reads the SQL of an ADBC call out of its template on
  // purpose, because the database executes it. Masking that literal flat — the
  // obvious "consistency" refactor — deletes the only evidence of the write.
  const code = [
    'REPORT zcc_adbc.',
    'DATA lv_sql TYPE string.',
    "lv_sql = |UPDATE KNA1 SET NAME1 = 'X'|.",
    'DATA(lo_stmt) = NEW cl_sql_statement( ).',
    'DATA(lv_rows) = lo_stmt->execute_update( lv_sql ).',
  ].join('\n');
  const kna1 = extractDataCoupling(code).find((e) => e.tableName === 'KNA1');
  expect(kna1, 'the table the executed text writes is still the dependency').toBeTruthy();
  expect(kna1!.accessType).toBe('Write');
});
