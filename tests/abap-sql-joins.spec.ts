import { test, expect } from '@playwright/test';
import { extractSelects, parseSelect } from '../lib/abap/select-parser';
import { matchCdsView } from '../lib/abap/cds-catalog';
import { diffResultSets } from '../lib/abap/result-diff';

test.describe('ABAP Open SQL Complex Joins & Quirks Tests', () => {

  test('should extract and parse SELECT statements correctly including comments and backticks', () => {
    const abapCode = `
      * Select with inline comments and backticks
      SELECT ksubr, kposn FROM vbap
        INTO TABLE @lt_items
        WHERE vbeln = '123' AND matnr = \`MAT-A\`. " Filter by backtick string

      " SELECT with INTO before FROM (legacy syntax support)
      SELECT SINGLE vbeln INTO @lv_vbeln FROM vbak WHERE erdat = '20260617'.
    `;

    const selects = extractSelects(abapCode);
    expect(selects.length).toBe(2);

    // 1. First select (standard)
    expect(selects[0].text).toContain('SELECT ksubr, kposn FROM vbap INTO TABLE @lt_items WHERE vbeln = \'123\' AND matnr = `MAT-A`');
    const model1 = parseSelect(selects[0].text, 'test.abap', selects[0].line);
    expect(model1.from.name).toBe('VBAP');
    expect(model1.into.kind).toBe('table');
    expect(model1.into.target).toBe('@LT_ITEMS');

    // 2. Second select (INTO before FROM)
    expect(selects[1].text).toContain('SELECT SINGLE vbeln INTO @lv_vbeln FROM vbak WHERE erdat = \'20260617\'');
    const model2 = parseSelect(selects[1].text, 'test.abap', selects[1].line);
    expect(model2.from.name).toBe('VBAK');
    expect(model2.into.kind).toBe('workarea');
    expect(model2.into.target).toBe('@LV_VBELN');
    expect(model2.fields.length).toBe(1);
    expect(model2.fields[0].raw).toBe('vbeln');
  });

  test('should detect various SQL quirks during parsing', () => {
    const abapCode = `
      SELECT DISTINCT vbeln, posnr, name1
        FROM vbak INNER JOIN vbap ON vbak~vbeln = vbap~vbeln
        LEFT OUTER JOIN kna1 ON vbak~kunnr = kna1~kunnr
        INTO CORRESPONDING FIELDS OF TABLE @lt_result
        FOR ALL ENTRIES IN @lt_orders
        WHERE vbak~vbeln = @lt_orders-vbeln.
    `;

    const selects = extractSelects(abapCode);
    expect(selects.length).toBe(1);

    const model = parseSelect(selects[0].text, 'test.abap', selects[0].line);
    expect(model.distinct).toBe(true);
    expect(model.joins.length).toBe(2);
    expect(model.joins[0].type).toBe('inner');
    expect(model.joins[1].type).toBe('left-outer');
    expect(model.forAllEntries?.driver).toBe('@LT_ORDERS');
    expect(model.into.kind).toBe('corresponding');

    const quirks = model.quirks.map(q => q.type);
    expect(quirks).toContain('for-all-entries');
    expect(quirks).toContain('into-corresponding');
    expect(quirks).toContain('outer-join-null');
  });

  test('should match table combinations against CDS view catalog', () => {
    // VBAK + VBAP should match I_SalesOrderItem
    const select1 = parseSelect('SELECT * FROM vbak INNER JOIN vbap ON vbak~vbeln = vbap~vbeln.', 'test.abap', 1);
    const match1 = matchCdsView(select1);
    expect(match1).toBeDefined();
    expect(match1!.view).toBe('I_SalesOrderItem');
    expect(match1!.exact).toBe(true);
    expect(match1!.confidence).toBe(0.95);

    // VBAK + VBAP + KNA1 (superset of VBAK+VBAP) should match as superset (lower confidence)
    const select2 = parseSelect(
      'SELECT * FROM vbak INNER JOIN vbap ON vbak~vbeln = vbap~vbeln LEFT JOIN kna1 ON vbak~kunnr = kna1~kunnr.',
      'test.abap',
      1
    );
    const match2 = matchCdsView(select2);
    expect(match2).toBeDefined();
    expect(match2!.view).toBe('I_SalesOrderItem');
    expect(match2!.exact).toBe(false);
    expect(match2!.confidence).toBe(0.6);
  });

  test('should perform result-set diff comparisons with normalization', () => {
    const abapRows = [
      { VBELN: '0001', ERDAT: '20260617', NETWR: 150.00, ERNAM: 'SONNY' },
      { VBELN: '0002', ERDAT: '20260618', NETWR: 0, ERNAM: null } // null ERNAM should map to ''
    ];

    const targetRows = [
      { vbeln: '0001', erdat: '2026-06-17', netwr: 150.00, ernam: 'SONNY' }, // date has hyphens
      { vbeln: '0002', erdat: '2026-06-18', netwr: 0, ernam: undefined } // undefined ERNAM should map to ''
    ];

    const report = diffResultSets(abapRows, targetRows, { dateFields: ['ERDAT'] });
    expect(report.equal).toBe(true);
    expect(report.onlyInAbap).toBe(0);
    expect(report.onlyInTarget).toBe(0);
    expect(report.rowCountAbap).toBe(2);
    expect(report.rowCountTarget).toBe(2);
  });
});
