import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { adtLocation, parseAtcXmlText } from '../lib/abap/atc-xml';
import { ATC_MAX_FINDINGS, parseAtc, withDeclaredRunDate } from '../lib/abap/atc-parser';
import { atcRunLabel, compareAtcByLine } from '../lib/abap/atc-lines';
import { ATC_REPORT_MAX_FINDINGS, normaliseAtcReport } from '../lib/project-commands';
import { resolveIncludes } from '../lib/abap/include-resolution';
import type { AtcReport } from '../lib/abap/atc-model';

/**
 * Roadmap 3.0.21 — results of SAP's own tools as evidence: "dock on, don't
 * compete" (owner decision 22.10.2026).
 *
 * The CSV/XLSX import of roadmap 7.1 stays as it was (`tests/atc-import-guard.spec.ts`).
 * These specs hold what 3.0.21 adds: the two open XML shapes an ATC result is
 * exported in, the date of the ATC run said only where it is known, the
 * server's closed key set for the new fields, and the comparison by line —
 * through the include map, never merged, never counted together.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const WORKLIST = `<?xml version="1.0" encoding="utf-8"?>
<atcworklist:worklist atcworklist:id="0242AC1100021EDB" atcworklist:timestamp="2026-10-20T08:15:00Z" atcworklist:usedObjectSet="99999999999999999999999999999999" atcworklist:objectSetIsComplete="true" xmlns:atcworklist="http://www.sap.com/adt/atc/worklist">
  <atcworklist:objectSets>
    <atcworklist:objectSet atcworklist:name="00000000000000000000000000000000" atcworklist:title="All Objects" atcworklist:kind="ALL"/>
  </atcworklist:objectSets>
  <atcworklist:objects>
    <atcobject:object adtcore:uri="/sap/bc/adt/programs/programs/z_demo_main" adtcore:type="PROG/P" adtcore:name="Z_DEMO_MAIN" adtcore:packageName="ZDEMO" atcobject:author="MMUELLER" xmlns:adtcore="http://www.sap.com/adt/core" xmlns:atcobject="http://www.sap.com/adt/atc/object">
      <atcobject:findings>
        <atcfinding:finding adtcore:uri="/sap/bc/adt/atc/items/1" atcfinding:location="/sap/bc/adt/programs/includes/z_demo_f01/source/main#start=2,2" atcfinding:processor="HSCHMIDT" atcfinding:lastChangedBy="AWEBER" atcfinding:priority="1" atcfinding:checkId="AB12" atcfinding:checkTitle="Search problematic statements" atcfinding:messageId="0001" atcfinding:messageTitle="SELECT SINGLE * on EKKO &amp; no index" atcfinding:exemptionApproval="" atcfinding:exemptionKind="" xmlns:atcfinding="http://www.sap.com/adt/atc/finding">
          <atom:link href="/sap/bc/adt/documentation/atc/documents/itemid/1" rel="http://www.sap.com/adt/relations/documentation" xmlns:atom="http://www.w3.org/2005/Atom"/>
        </atcfinding:finding>
        <atcfinding:finding adtcore:uri="/sap/bc/adt/atc/items/2" atcfinding:location="/sap/bc/adt/programs/programs/z_demo_main/source/main#start=4,2" atcfinding:priority="3" atcfinding:checkTitle="Naming" atcfinding:messageTitle="Name does not follow convention" atcfinding:exemptionApproval="X" xmlns:atcfinding="http://www.sap.com/adt/atc/finding"/>
        <atcfinding:finding adtcore:uri="/sap/bc/adt/atc/items/3" atcfinding:location="/sap/bc/adt/programs/includes/z_demo_missing/source/main#start=7,0" atcfinding:priority="2" atcfinding:messageTitle="Obsolete statement" xmlns:atcfinding="http://www.sap.com/adt/atc/finding"/>
        <atcfinding:finding adtcore:uri="/sap/bc/adt/atc/items/4" atcfinding:location="/sap/bc/adt/programs/programs/z_demo_main/source/main#start=1,0" atcfinding:priority="9" atcfinding:messageTitle="" xmlns:atcfinding="http://www.sap.com/adt/atc/finding"/>
      </atcobject:findings>
    </atcobject:object>
  </atcworklist:objects>
</atcworklist:worklist>`;

const CHECKSTYLE = `<?xml version="1.0" encoding="UTF-8"?>
<checkstyle version="1.0">
  <file name="/sap/bc/adt/programs/includes/z_demo_f01/source/main">
    <error line="2" column="2" severity="error" message="SELECT SINGLE without index" source="CL_CI_TEST_SELECT"/>
  </file>
  <file name="src/z_demo_main.prog.abap">
    <error line="4" severity="warning" message="Obsolete MOVE"/>
    <error severity="ignore" message="Pseudo comment"/>
  </file>
</checkstyle>`;

const MAIN = ['REPORT z_demo_main.', 'INCLUDE z_demo_top.', 'START-OF-SELECTION.', '  PERFORM check_limit.', 'INCLUDE z_demo_f01.', 'INCLUDE z_demo_missing.', ''].join('\n');
const TOP = ['DATA gv_limit TYPE p DECIMALS 2.', 'TABLES ekko.', ''].join('\n');
const F01 = ['FORM check_limit.', '  SELECT SINGLE * FROM ekko WHERE ebeln = @gv_ebeln INTO @DATA(ls_ekko).', 'ENDFORM.', ''].join('\n');

test.describe('the ADT ATC worklist (XML)', () => {
  const r = parseAtcXmlText(WORKLIST);

  test('reads object, include, line, check and message as ATC wrote them, and the run date', () => {
    expect(r.format).toBe('adt-worklist-xml');
    expect(r.runAt).toBe('2026-10-20T08:15:00.000Z');
    expect(r.findings[0]).toEqual({
      objectName: 'Z_DEMO_MAIN',
      objectType: 'PROG/P',
      checkId: 'AB12',
      checkTitle: 'Search problematic statements',
      message: 'SELECT SINGLE * on EKKO & no index',
      priority: 'error',
      line: 2,
      include: 'Z_DEMO_F01',
      exempted: false,
    });
    // A finding in the main program names no include of its own.
    expect(r.findings[1]).toMatchObject({ objectName: 'Z_DEMO_MAIN', line: 4, priority: 'info', exempted: true });
    expect(r.findings[1].include).toBeUndefined();
  });

  test('a finding without a text is quarantined by position, with its reason', () => {
    expect(r.findings).toHaveLength(3);
    expect(r.quarantined).toEqual([{ row: 4, objectName: 'Z_DEMO_MAIN', reason: 'no finding text' }]);
  });

  test('no person named in the worklist reaches a finding', () => {
    expect(JSON.stringify(r.findings)).not.toMatch(/MMUELLER|HSCHMIDT|AWEBER/);
  });

  test('ADT locations: include, object and line', () => {
    expect(adtLocation('/sap/bc/adt/functions/groups/zfoo/includes/lzfoof01/source/main#start=12,4')).toEqual({ object: 'ZFOO', include: 'LZFOOF01', line: 12 });
    expect(adtLocation('/sap/bc/adt/oo/classes/zcl_x/source/main#type=CLAS%2FOM;name=RUN;start=33')).toEqual({ object: 'ZCL_X', line: 33 });
    expect(adtLocation(undefined)).toEqual({});
  });
});

test.describe('checkstyle XML', () => {
  const r = parseAtcXmlText(CHECKSTYLE);

  test('reads an ADT URI or an abapGit file name as the object, and says it carries no run date', () => {
    expect(r.format).toBe('checkstyle-xml');
    expect(r.runAt).toBeUndefined();
    expect(r.findings).toEqual([
      { objectName: 'Z_DEMO_F01', checkId: 'CL_CI_TEST_SELECT', message: 'SELECT SINGLE without index', priority: 'error', line: 2, include: undefined },
      { objectName: 'Z_DEMO_MAIN', message: 'Obsolete MOVE', priority: 'warning', line: 4 },
      { objectName: 'Z_DEMO_MAIN', message: 'Pseudo comment', priority: 'unknown' },
    ].map((f) => JSON.parse(JSON.stringify(f))));
    expect(r.warnings.join(' ')).toMatch(/carries no run date/);
    expect(r.warnings.join(' ')).toMatch(/1 severity value not recognised/);
  });
});

test.describe('XML that is not an ATC export is refused, never guessed at', () => {
  test('a document type or entity declaration is refused before anything is read', () => {
    expect(() => parseAtcXmlText('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><checkstyle/>')).toThrow(/document type or entities/);
  });
  test('another XML says which shapes are read', () => {
    expect(() => parseAtcXmlText('<report><item/></report>')).toThrow(/neither an ATC worklist .* nor checkstyle XML/);
  });
});

test.describe('parseAtc: one entry for every shape', () => {
  test('an .xml file goes to the XML reader and carries its format and run date', async () => {
    const report = await parseAtc(new File([WORKLIST], 'atc-worklist.xml', { type: 'application/xml' }));
    expect(report.format).toBe('adt-worklist-xml');
    expect(report).toMatchObject({ source: 'atc', runAt: '2026-10-20T08:15:00.000Z', runAtSource: 'file' });
    expect(report.findings).toHaveLength(3);
    expect(report.warnings.join(' ')).toMatch(/1 finding not taken over/);
  });

  test('a table keeps its earlier shape and says it is one', async () => {
    const report = await parseAtc(new File(['OBJECT_NAME;MESSAGE\nZFI;a\n'], 'atc.csv', { type: 'text/csv' }));
    expect(report.format).toBe('table');
    expect(report.runAt).toBeUndefined();
  });

  test('the parser’s ceiling on findings is the server’s', () => {
    expect(ATC_MAX_FINDINGS).toBe(ATC_REPORT_MAX_FINDINGS);
  });

  test('an export with more findings than one import keeps is refused with the number', async () => {
    const rows = Array.from({ length: ATC_MAX_FINDINGS + 1 }, (_, i) => `<error line="${i + 1}" severity="error" message="m"/>`).join('');
    const xml = `<checkstyle><file name="Z_BIG">${rows}</file></checkstyle>`;
    await expect(parseAtc(new File([xml], 'big.xml'))).rejects.toThrow(/keeps at most 20000/);
  });
});

test.describe('the date of the ATC run is said only where it is known', () => {
  const base: AtcReport = { findings: [], source: 'atc', importedAt: '2026-10-22T09:00:00.000Z', warnings: [], format: 'checkstyle-xml' };

  test('a day the reader enters is kept as declared; a future day or a non-day is not', () => {
    expect(withDeclaredRunDate(base, '2026-10-19')).toMatchObject({ runAt: '2026-10-19T00:00:00.000Z', runAtSource: 'declared' });
    expect(withDeclaredRunDate(base, '2999-01-01').runAt).toBeUndefined();
    expect(withDeclaredRunDate(base, '2026-02-30').runAt).toBeUndefined();
    const fromFile = { ...base, runAt: '2026-10-20T08:15:00.000Z', runAtSource: 'file' as const };
    expect(withDeclaredRunDate(fromFile, '2026-10-01')).toBe(fromFile);
  });

  test('the label names the run date and where it came from, or says it is not known', () => {
    expect(atcRunLabel({ ...base, format: 'adt-worklist-xml', runAt: '2026-10-20T08:15:00.000Z', runAtSource: 'file' })).toBe(
      'From your ATC run of 20 Oct 2026 · an ATC worklist (XML)',
    );
    expect(atcRunLabel({ ...base, runAt: '2026-10-19T00:00:00.000Z', runAtSource: 'declared' })).toBe(
      'From your ATC run of 19 Oct 2026 (date as entered on import) · checkstyle XML',
    );
    // A report from before 3.0.21 had no format: it was a table.
    expect(atcRunLabel({ importedAt: '2026-10-22T09:00:00.000Z' })).toBe(
      'From your ATC results, imported 22 Oct 2026 — the file does not say when ATC ran · a table export',
    );
  });
});

test.describe('the server keeps the new fields in a closed shape', () => {
  const report = (extra: Record<string, unknown>) => ({
    findings: [{ objectName: 'Z_A', message: 'm', priority: 'error', line: 2, include: 'Z_A_F01', author: 'smuggled' }],
    source: 'atc',
    importedAt: '2026-10-22T09:00:00.000Z',
    warnings: [],
    ...extra,
  });

  test('format, run date and include are stored; an unknown key in a row is not', () => {
    const r = normaliseAtcReport(report({ format: 'adt-worklist-xml', runAt: '2026-10-20T08:15:00.000Z', runAtSource: 'file' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toMatchObject({ format: 'adt-worklist-xml', runAt: '2026-10-20T08:15:00.000Z', runAtSource: 'file' });
    expect((r.report.findings as Record<string, unknown>[])[0]).toEqual({ objectName: 'Z_A', message: 'm', priority: 'error', line: 2, include: 'Z_A_F01' });
  });

  test('an unknown format, a run date in the future or without its source is refused', () => {
    expect(normaliseAtcReport(report({ format: 'pdf' }))).toMatchObject({ ok: false });
    expect(normaliseAtcReport(report({ runAt: '2999-01-01T00:00:00.000Z', runAtSource: 'declared' }))).toMatchObject({ ok: false });
    expect(normaliseAtcReport(report({ runAt: 'yesterday', runAtSource: 'declared' }))).toMatchObject({ ok: false });
    expect(normaliseAtcReport(report({ runAt: '2026-10-20T08:15:00.000Z' }))).toMatchObject({ ok: false });
    expect(normaliseAtcReport(report({ runAtSource: 'file' }))).toMatchObject({ ok: false });
    // A report from before 3.0.21 still stores.
    expect(normaliseAtcReport(report({})).ok).toBe(true);
  });
});

test.describe('ATC and the engine, by line — through the include map', () => {
  const joined = resolveIncludes({ 'z_demo_main.abap': MAIN, 'Z_DEMO_TOP.abap': TOP, 'Z_DEMO_F01.abap': F01 });
  const lines = joined.source.split('\n');
  const selectLine = lines.indexOf(F01.split('\n')[1]) + 1;
  const engine = [
    { id: 'EF-1', lineStart: selectLine, lineEnd: selectLine },
    { id: 'EF-2', lineStart: lines.indexOf('ENDFORM.') + 1 },
  ];
  const atc = { findings: parseAtcXmlText(WORKLIST).findings };

  test('a finding at line 2 of the include meets the engine on the line where that include line stands', () => {
    const c = compareAtcByLine(atc, engine, joined.source, 'z_demo_main.abap');
    expect(c.rows[0]).toMatchObject({ state: 'same-line', line: selectLine, engineFindingIds: ['EF-1'] });
    // Line 4 of the main program is the PERFORM: nothing from the engine there.
    expect(c.rows[1]).toMatchObject({ state: 'atc-only', line: lines.indexOf('  PERFORM check_limit.') + 1, engineFindingIds: [] });
    // The include that was not uploaded is not part of this source.
    expect(c.rows[2]).toMatchObject({ state: 'outside', line: null });
    expect(c.byState).toEqual({ 'same-line': 1, 'atc-only': 1, outside: 1, 'no-line': 0 });
  });

  test('engine findings ATC is silent on are counted only where ATC checked', () => {
    const c = compareAtcByLine(atc, engine, joined.source, 'z_demo_main.abap');
    expect(c.engineOnly).toEqual(['EF-2']);
    expect(c.checkedObjects.sort()).toEqual(['Z_DEMO_F01', 'Z_DEMO_MAIN']);
    // Results about another program check nothing here.
    const elsewhere = compareAtcByLine({ findings: [{ objectName: 'Z_OTHER', message: 'm', priority: 'error', line: 3 }] }, engine, joined.source, 'z_demo_main.abap');
    expect(elsewhere.byState.outside).toBe(1);
    expect(elsewhere.engineOnly).toEqual([]);
  });

  test('a single file: ATC’s line of the program is the line of the source', () => {
    const single = 'REPORT z_one.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';
    const c = compareAtcByLine(
      { findings: [{ objectName: 'Z_ONE', message: 'm', priority: 'warning', line: 2 }, { objectName: 'Z_ONE', message: 'n', priority: 'info' }] },
      [{ id: 'EF-9', lineStart: 2 }],
      single,
      'z_one.abap',
    );
    expect(c.rows.map((r) => r.state)).toEqual(['same-line', 'no-line']);
  });

  test('the panel compares by line in the source the findings count in; the counts are never added up', () => {
    const page = read('app/(app)/project/[projectId]/analyze/page.tsx');
    const at = page.indexOf('<AtcFindingsPanel');
    expect(page.slice(at, at + 600)).toMatch(/source=\{typeof project\?\.legacyCode === 'string' \? project\.legacyCode : legacyCode\}/);
    const panel = read('components/analyze/AtcFindingsPanel.tsx');
    expect(panel).toContain('compareAtcByLine(atcReport, findings, source, fileName)');
    expect(panel).toContain('data-atc-run-label');
    expect(panel).not.toMatch(/byState\['same-line'\]\s*\+/);
  });
});
