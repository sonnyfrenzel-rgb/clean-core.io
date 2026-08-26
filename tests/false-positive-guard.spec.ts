/**
 * False-positive guard for the ABAP evidence engine.
 *
 * WHY THIS FILE EXISTS: the three existing engine specs carry 116 assertions
 * between them and not one of them asserts ABSENCE — no toHaveLength(0), no
 * .not., no toBe(0). Every test says "this pattern produces this finding".
 * A detector that fires on everything passes all 116, which is exactly what
 * happened: `INSERT ls_wa INTO TABLE lt_items` was reported as a Critical
 * "direct write to SAP standard table LS_WA", and `SELECT FROM i_salesorder`
 * — the correct ABAP Cloud pattern — as an illegal standard-table read with an
 * invented successor `I_I_SALESORDER`.
 *
 * Findings are shown to architects as fact and feed the Clean Core Score and the
 * RAP-vs-CAP routing decision, so a false positive is not cosmetic: it inflates
 * the Critical count and can flip the recommended target architecture.
 *
 * Every test here asserts what must NOT be reported. Regressions in the other
 * direction are covered by the "must still fire" block at the end — a guard that
 * only suppresses would be worse than none.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';

const findings = (code: string, dep: 'public' | 'private' = 'private') =>
  buildAbapEvidence(code, 'ZTEST', dep).findings;

const tableFindings = (code: string, dep: 'public' | 'private' = 'private') =>
  findings(code, dep).filter((f) =>
    ['standard-table-write', 'standard-table-read', 'custom-table-write', 'table-access'].includes(f.kind),
  );

test.describe('internal table operations are not database access', () => {
  test('INSERT … INTO TABLE reports nothing', () => {
    expect(tableFindings(`INSERT ls_wa INTO TABLE lt_vbap.`)).toHaveLength(0);
  });

  test('INSERT LINES OF reports nothing — and never an object called LINES', () => {
    const f = tableFindings(`INSERT LINES OF lt_src INTO TABLE lt_dst.`);
    expect(f).toHaveLength(0);
    expect(findings(`INSERT LINES OF lt_src INTO TABLE lt_dst.`).map((x) => x.objectName)).not.toContain('LINES');
  });

  test('INSERT INITIAL LINE reports nothing', () => {
    expect(tableFindings(`INSERT INITIAL LINE INTO TABLE lt_items ASSIGNING <fs>.`)).toHaveLength(0);
  });

  test('MODIFY on a declared internal table reports nothing', () => {
    expect(
      tableFindings(`DATA lt_mara TYPE TABLE OF ty_mat.
        MODIFY lt_mara FROM ls_mara.`),
    ).toHaveLength(0);
  });

  test('MODIFY … INDEX and TRANSPORTING report nothing', () => {
    expect(tableFindings(`MODIFY lt_items FROM ls_item INDEX 1.`)).toHaveLength(0);
    expect(tableFindings(`MODIFY lt_items FROM ls_item TRANSPORTING flag.`)).toHaveLength(0);
  });

  test('DELETE itab WHERE (no FROM) reports nothing', () => {
    expect(tableFindings(`DELETE lt_itab WHERE flag = 'X'.`)).toHaveLength(0);
  });

  test('DELETE ADJACENT DUPLICATES reports nothing', () => {
    expect(tableFindings(`DELETE ADJACENT DUPLICATES FROM lt_items COMPARING matnr.`)).toHaveLength(0);
  });

  test('a realistic block of internal-table handling is silent', () => {
    const code = `REPORT zclean.
      DATA lt_items TYPE TABLE OF ty_item.
      DATA ls_item  TYPE ty_item.
      LOOP AT lt_source INTO DATA(ls_src).
        ls_item-matnr = ls_src-matnr.
        INSERT ls_item INTO TABLE lt_items.
      ENDLOOP.
      SORT lt_items BY matnr.
      DELETE ADJACENT DUPLICATES FROM lt_items COMPARING matnr.
      MODIFY lt_items FROM ls_item INDEX 1.
      DELETE lt_items WHERE matnr IS INITIAL.`;
    expect(tableFindings(code)).toHaveLength(0);
  });
});

test.describe('released SAP objects are the target state, not a violation', () => {
  test('SELECT from a released CDS view reports nothing, even on public cloud', () => {
    // I_SALESORDER is state 'released' in the Cloudification artifact.
    expect(tableFindings(`SELECT * FROM i_salesorder INTO TABLE @DATA(lt).`, 'public')).toHaveLength(0);
  });

  test('no successor is invented for an object the catalog does not map', () => {
    // T000 has no mapped successor; the engine used to answer `I_T000`.
    const f = findings(`SELECT * FROM t000 INTO TABLE lt.`);
    expect(f.length).toBeGreaterThan(0);
    for (const x of f) expect(x.sapReplacement?.objectName).not.toBe('I_T000');
    expect(f.every((x) => !x.sapReplacement || x.sapReplacement.confidence === 'Catalog Match')).toBe(true);
  });
});

test.describe('reserved-namespace objects are not called SAP standard', () => {
  test('a write to an unlisted /NS/ table is custom, not a standard-table Critical', () => {
    const f = tableFindings(`INSERT /acme/ztab FROM ls_row.`);
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe('custom-table-write');
    expect(f[0].severity).not.toBe('Critical');
  });
});

test.describe('detectors must still fire on real database access', () => {
  const mustFire: Array<[string, string]> = [
    ['UPDATE on a standard table', `UPDATE vbak SET erdat = sy-datum WHERE vbeln = '1'.`],
    ['DELETE FROM a standard table', `DELETE FROM vbak WHERE vbeln = '1'.`],
    ['INSERT into a standard table', `INSERT vbak FROM ls_head.`],
    ['SELECT from a standard table', `SELECT * FROM vbak INTO TABLE lt.`],
    ['write to a custom Z table', `INSERT zmytable FROM ls_row.`],
  ];

  for (const [label, code] of mustFire) {
    test(`${label} is still reported`, () => {
      expect(tableFindings(code).length).toBeGreaterThan(0);
    });
  }
});
