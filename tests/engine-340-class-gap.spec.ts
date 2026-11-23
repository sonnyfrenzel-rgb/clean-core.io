import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { ENGINE_READS_340_FROM, engineReads340Apply } from '../lib/abap/engine-reads-340-gate';
import { readSapClassReferences, readSapTypeReferences, staticExternalReferences } from '../lib/abap/sap-class-references';
import { cleanSource } from '../lib/abap/input-hygiene';
import { buildBusinessStatements } from '../lib/abap/business-statement';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { ddicTypeGroups } from '../lib/it-findings-build';
import { readSource } from '../lib/engine4/index';
import { references } from '../lib/engine4/references';

/**
 * Roadmap 3.4.0 item (2), owner decision 22.11.2026 (ER-03; engine4.md question 18 (a); ADR-141 draft): every SAP
 * class, interface and exception class SAP's files grade C or D is one finding per object, with its lines, gated by
 * engine version; the DDIC types go to the IT view only, grouped by level. Static references only (engine review of
 * 22.11.2026). Plus the input hygiene of the same gate. Server-free.
 */
const OLD = 'v3.2.0';
const NEW = 'v3.4.0';
const ROOT = join(__dirname, '..');

const PROGRAM = `REPORT zgap.
DATA go_http TYPE REF TO if_http_client.
DATA lv_url TYPE string.
DATA lt_x TYPE STANDARD TABLE OF bapiret2.
DATA lv_bukrs TYPE bukrs.
DATA lv_kunnr TYPE kunnr.
CLASS lcl_local DEFINITION.
  PUBLIC SECTION.
    METHODS run RAISING cx_sql_exception.
ENDCLASS.
CLASS lcl_local IMPLEMENTATION.
  METHOD run.
    lv_url = cl_http_utility=>escape_url( lv_url ).
    DATA(lo_stmt) = NEW cl_sql_statement( ).
    DATA(lo_mine) = NEW zcl_my_helper( ).
    DATA(lo_local) = NEW lcl_local( ).
    lv_url = cl_http_utility=>unescape_url( lv_url ).
  ENDMETHOD.
ENDCLASS.
`;

const classFindings = (code: string, engine: string) =>
  buildAbapEvidence(code, 'zgap.abap', 'private', undefined, engine).findings.filter((f) => f.kind === 'unreleased-class');

test('the gate opens at 3.4.0 and not before', () => {
  expect(ENGINE_READS_340_FROM).toBe('3.4.0');
  expect(engineReads340Apply('v3.2.0')).toBe(false);
  expect(engineReads340Apply('v3.3.9')).toBe(false);
  expect(engineReads340Apply('v3.4.0')).toBe(true);
  expect(engineReads340Apply(null)).toBe(false);
  expect(classFindings(PROGRAM, OLD)).toEqual([]);
});

test('one finding per object, with every line it stands on; defined and customer names are left out', () => {
  const found = classFindings(PROGRAM, NEW);
  expect(found.map((f) => f.objectName).sort()).toEqual(['CL_HTTP_UTILITY', 'CL_SQL_STATEMENT', 'CX_SQL_EXCEPTION', 'IF_HTTP_CLIENT']);
  const http = found.find((f) => f.objectName === 'CL_HTTP_UTILITY')!;
  expect(http.lines).toEqual([13, 17]);
  expect(http.lineStart).toBe(13);
  expect(http.lineEnd).toBeUndefined();
  expect(http.severity).toBe('High'); // notToBeReleased
  expect(http.title).toContain('notToBeReleased');
  expect(found.find((f) => f.objectName === 'CX_SQL_EXCEPTION')!.objectType).toBe('Exception Class');
  expect(found.find((f) => f.objectName === 'CL_SQL_STATEMENT')!.severity).toBe('Medium'); // listed nowhere: residual
  // The A–D letter never enters a finding: findings go into the signed run.
  for (const f of found) {
    for (const text of [f.title, f.technicalDetail, f.cleanCoreImpact, f.recommendation]) expect(text).not.toMatch(/\blevel [A-D]\b|\b[A-D]-level\b/i);
  }
});

test('a dynamic name never feeds a finding: constants, start values, assignments and loops are not read', () => {
  const dynamic = `REPORT zdyn.
CONSTANTS gc_cls TYPE seoclsname VALUE 'CL_HTTP_UTILITY'.
DATA lv_cls TYPE seoclsname VALUE 'IF_HTTP_CLIENT'.
DATA lv_other TYPE seoclsname.
DATA lo TYPE REF TO object.
START-OF-SELECTION.
  CREATE OBJECT lo TYPE (gc_cls).
  CREATE OBJECT lo TYPE (lv_cls).
  lv_other = 'CL_SQL_STATEMENT'.
  CREATE OBJECT lo TYPE (lv_other).
  DO 2 TIMES.
    CALL METHOD (lv_other)=>escape_url.
    lv_other = 'CX_SQL_EXCEPTION'.
  ENDDO.
FORM other.
  CONSTANTS lv_x TYPE seoclsname VALUE 'CL_HTTP_UTILITY'.
  CREATE OBJECT lo TYPE (lv_x).
ENDFORM.
`;
  // The table does resolve some of them — which is exactly why the reading must not use them.
  const read = readSource(dynamic);
  const all = references(read.statements, read.tree).references.filter((r) => r.kind === 'class' || r.kind === 'classOrInterface');
  expect(all.some((r) => r.resolution !== 'static' && r.name !== null)).toBe(true);
  expect(staticExternalReferences(dynamic).filter((r) => r.kind === 'class' || r.kind === 'classOrInterface')).toEqual([]);
  expect(readSapClassReferences(dynamic)).toEqual([]);
  expect(classFindings(dynamic, NEW)).toEqual([]);
});

test('on the starters and the reference corpus, every line of every class finding holds a static reference to its object', () => {
  const sources: Array<{ name: string; code: string }> = [];
  const starters = join(ROOT, 'public', 'starter-examples');
  for (const n of readdirSync(starters).filter((x) => /\.(abap|txt)$/.test(x))) sources.push({ name: n, code: readFileSync(join(starters, n), 'utf8') });
  const korpus = join(ROOT, 'tests', 'korpus', 'cases');
  for (const id of readdirSync(korpus)) {
    for (const n of readdirSync(join(korpus, id)).filter((x) => x.endsWith('.abap'))) sources.push({ name: `${id}/${n}`, code: readFileSync(join(korpus, id, n), 'utf8') });
  }
  let findings = 0;
  for (const s of sources) {
    const code = cleanSource(s.code);
    const statics = staticExternalReferences(code);
    for (const f of classFindings(s.code, NEW)) {
      findings += 1;
      for (const line of f.lines ?? []) {
        expect(statics.some((r) => r.name === f.objectName && r.row === line), `${s.name}: ${f.objectName} at line ${line}`).toBe(true);
      }
    }
  }
  // Measured on 22.11.2026: CL_MM_INTERNAL (starter), CL_HTTP_UTILITY, CL_SQL_STATEMENT, CX_SQL_EXCEPTION (corpus).
  expect(findings).toBe(4);
});

test('an object another finding already names is said there, not twice', () => {
  const code = `REPORT zdup.
DATA lt TYPE STANDARD TABLE OF string.
START-OF-SELECTION.
  CALL FUNCTION 'GUI_DOWNLOAD' EXPORTING filename = 'C:\\temp\\a.txt' TABLES data_tab = lt.
  DATA lo TYPE REF TO cl_http_utility.
`;
  const all = buildAbapEvidence(code, 'zdup.abap', 'private', undefined, NEW).findings;
  const names = all.filter((f) => f.objectName).map((f) => `${f.kind}:${f.objectName}`);
  expect(new Set(names.map((n) => n.split(':')[1])).size).toBe(names.length);
});

test('a RAP entity alias (`FOR order~set_status`, EML) is not an interface', () => {
  const rap = `CLASS lhc_order DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS set_status FOR DETERMINE ON MODIFY
      IMPORTING keys FOR order~set_status.
ENDCLASS.
CLASS lhc_order IMPLEMENTATION.
  METHOD set_status.
    MODIFY ENTITIES OF zi_order IN LOCAL MODE ENTITY order UPDATE FIELDS ( status ) WITH VALUE #( ( %tky = keys[ 1 ]-%tky status = 'N' ) ).
  ENDMETHOD.
ENDCLASS.
`;
  expect(readSapClassReferences(rap).map((r) => r.name)).not.toContain('ORDER');
  expect(classFindings(rap, NEW).map((f) => f.objectName)).not.toContain('ORDER');
});

test('`CLASS x DEFINITION LOAD|DEFERRED` announces an SAP class, it does not define it away', () => {
  const use = `DATA lo TYPE REF TO cl_http_utility.
DATA(lv) = cl_http_utility=>escape_url( \`a\` ).
`;
  for (const announce of ['CLASS cl_http_utility DEFINITION LOAD.', 'CLASS cl_http_utility LOAD.', 'CLASS cl_http_utility DEFINITION DEFERRED.']) {
    const code = `REPORT zload.
${announce}
${use}`;
    expect(readSapClassReferences(code).map((r) => [r.name, r.lines]), announce).toEqual([['CL_HTTP_UTILITY', [3, 4]]]);
    expect(classFindings(code, NEW).map((f) => f.objectName), announce).toContain('CL_HTTP_UTILITY');
  }
  // A local class announced first is still defined by its own definition further down.
  const local = `REPORT zlocal.
CLASS lcl_a DEFINITION DEFERRED.
DATA lo TYPE REF TO lcl_a.
CLASS lcl_a DEFINITION.
ENDCLASS.
CLASS lcl_a IMPLEMENTATION.
ENDCLASS.
`;
  expect(references(readSource(local).statements, readSource(local).tree).references.filter((r) => r.name === 'LCL_A').every((r) => r.defined)).toBe(true);
  const iface = `REPORT ziface.
INTERFACE if_http_client LOAD.
DATA go TYPE REF TO if_http_client.
`;
  expect(readSapClassReferences(iface).map((r) => r.name)).toContain('IF_HTTP_CLIENT');
});

test('route: no score point, no route change, rework on the ABAP Cloud track and named in the rationale', () => {
  for (const d of ['private', 'public'] as const) {
    const before = routeExtensibility(buildAbapEvidence(PROGRAM, 'zgap.abap', d, undefined, OLD), d, OLD);
    const after = routeExtensibility(buildAbapEvidence(PROGRAM, 'zgap.abap', d, undefined, NEW), d, NEW);
    expect(after.cleanCoreScore).toBe(before.cleanCoreScore);
    expect(after.recommendedRoute).toBe(before.recommendedRoute);
    expect(after.rationale).toContain('SAP does not release for ABAP Cloud (');
    expect(after.rationale).toContain('CL_HTTP_UTILITY');
    expect(JSON.stringify(after.comparativeAnalysis.inAppABAPCloud)).toContain('SAP classes and interfaces not released for ABAP Cloud');
  }
});

test('DDIC types: graded and grouped by level, worst first, for the IT view only — never a finding', () => {
  const types = readSapTypeReferences(PROGRAM);
  expect(types.find((t) => t.name === 'BUKRS')).toEqual({ name: 'BUKRS', level: 'C', lines: [5] });
  expect(types.find((t) => t.name === 'BAPIRET2')?.level).toBe('A');
  const groups = ddicTypeGroups(PROGRAM, undefined);
  expect(groups.map((g) => g.level)).toEqual(['C', 'A']);
  expect(groups[0].types.map((t) => t.name)).toEqual(['BUKRS', 'KUNNR']);
  const evidence = buildAbapEvidence(PROGRAM, 'zgap.abap', 'private', undefined, NEW);
  expect(evidence.findings.some((f) => f.objectName === 'BUKRS' || f.objectName === 'KUNNR')).toBe(false);
});

test('input hygiene from 3.4.0: a byte order mark and lone CR line ends no longer hide a program', () => {
  const lf = readFileSync(join(ROOT, 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
  const mangled = `\uFEFF${lf.replace(/\n/g, '\r')}`;
  expect(cleanSource(mangled)).toBe(lf);
  expect(cleanSource('a\r\nb')).toBe('a\r\nb');
  // Before the gate the old reading stays as it was signed: no finding and a "complete" coverage.
  const old = buildAbapEvidence(mangled, 'z.abap', 'private', undefined, OLD);
  expect(old.findings.length).toBe(0);
  const now = buildAbapEvidence(mangled, 'z.abap', 'private', undefined, NEW);
  expect(JSON.stringify(now)).toBe(JSON.stringify(buildAbapEvidence(lf, 'z.abap', 'private', undefined, NEW)));
  expect(buildProcessSkeleton(mangled, { engineVersion: NEW }).nodes.length).toBe(buildProcessSkeleton(lf, { engineVersion: NEW }).nodes.length);
  expect(buildProcessSkeleton(mangled, { engineVersion: OLD }).nodes.length).toBe(0);
});

test('input hygiene reaches the business statements and the documentation when an engine is named (QA 3813c52d1c6c)', () => {
  const lf = readFileSync(join(ROOT, 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
  const mangled = `\uFEFF${lf.replace(/\n/g, '\r')}`;
  const want = JSON.stringify(buildBusinessStatements(lf));
  expect(JSON.parse(want).length).toBeGreaterThan(0);
  expect(JSON.stringify(buildBusinessStatements(mangled, { engineVersion: NEW }))).toBe(want);
  // An earlier engine, and a call naming none (the frozen business digests), read the source as given.
  expect(buildBusinessStatements(mangled, { engineVersion: OLD }).length).toBe(0);
  expect(buildBusinessStatements(mangled).length).toBe(0);
  const doc = (source: string) => buildProcessDocumentation({ source, map: { elements: [], lanes: [], processName: 'p', fileName: 'z.abap', overview: null, traceability: {}, naming: {} } as never, engineVersion: NEW }).statements.length;
  expect(doc(mangled)).toBe(doc(lf));
});

test('from 3.4.0, INSERT REPORT is no write to a table REPORT (engine review probe); before, the signed reading stays', () => {
  const code = `REPORT zins.
DATA lt_src TYPE STANDARD TABLE OF string.
INSERT REPORT 'ZGEN' FROM lt_src.
`;
  const writes = (engine: string) =>
    buildAbapEvidence(code, 'zins.abap', 'private', undefined, engine).findings.filter((f) => f.kind === 'standard-table-write').map((f) => f.objectName);
  expect(writes(OLD)).toEqual(['REPORT']);
  expect(writes(NEW)).toEqual([]);
  expect(buildAbapEvidence(code, 'zins.abap', 'private', undefined, NEW).findings.some((f) => f.kind === 'security-review')).toBe(true);
});

test('a class named on a continuation line is anchored on its statement start, as every finding is', () => {
  // Findings name the line a statement starts on, so a re-wrapped source keeps its findings (abap-metamorphic).
  const code = `REPORT zcont.
DATA lv_url TYPE string.
lv_url =
  cl_http_utility=>unescape_url( lv_url ).
`;
  const http = classFindings(code, NEW).find((f) => f.objectName === 'CL_HTTP_UTILITY')!;
  expect(http.lines).toEqual([3]);
  expect(http.lineStart).toBe(3);
  expect(http.snippet).toContain('cl_http_utility');
});
