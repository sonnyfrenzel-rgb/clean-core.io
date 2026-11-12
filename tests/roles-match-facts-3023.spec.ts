import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation, DOCUMENTATION_GAPS } from '../lib/process-documentation-build';
import {
  authorizationBasisOf,
  handbookRolesNote,
  notDeterminedOf,
  processDocumentationToMarkdown,
  type ProcessDocumentation,
} from '../lib/process-documentation';

/**
 * Roadmap 3.0.23 (d), extended, server-free: who may act is said from one reading.
 *   1. The delivery package's process documentation said "No AUTHORITY-CHECK" under Controls and, under "Not
 *      determined", "The source proves authorization objects (AUTHORITY-CHECK)". The Roles reason now comes from the
 *      same reading as the Controls line (`authorizationBasisOf`), and the stored document stays as it was.
 *   2. The handbook's roles block said "No AI-generated draft for roles exists for this run. The code names
 *      authorizations, not people." beside a RACI the SOP and RACI step had written. It now points to that RACI, and
 *      where none exists it says what the code shows.
 * Sources: small synthetic programs written here.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function docOf(source: string, file = 'zccio_roles_3023.abap'): ProcessDocumentation {
  const bpmn = buildBpmnExportFromSource(source, { processName: file, sourceFileName: file });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: file });
  return buildProcessDocumentation({ source, map });
}

/** A role from the program's own check, refused with 'NOT_AUTHORIZED' — no AUTHORITY-CHECK. */
const OWN_CHECK = [
  'REPORT zccio_roles_own.',
  'PARAMETERS p_role TYPE string.',
  'DATA gv_ok TYPE abap_bool.',
  'START-OF-SELECTION.',
  '  PERFORM require_role USING p_role CHANGING gv_ok.',
  '  IF gv_ok = abap_false.',
  "    MESSAGE 'NOT_AUTHORIZED' TYPE 'E'.",
  '  ENDIF.',
  '  WRITE / gv_ok.',
  'FORM require_role USING iv_role TYPE string CHANGING cv_ok TYPE abap_bool.',
  "  cv_ok = xsdbool( iv_role = 'PLANNER' ).",
  'ENDFORM.',
].join('\n');

const NO_CHECK = [
  'REPORT zccio_roles_none.',
  'PARAMETERS p_qty TYPE i.',
  'START-OF-SELECTION.',
  '  IF p_qty > 100.',
  "    MESSAGE 'Too many' TYPE 'E'.",
  '  ENDIF.',
  '  WRITE / p_qty.',
].join('\n');

const SAP_CHECK = [
  'REPORT zccio_roles_sap.',
  'PARAMETERS p_werks TYPE werks_d.',
  'START-OF-SELECTION.',
  "  AUTHORITY-CHECK OBJECT 'M_MATE_WRK' ID 'WERKS' FIELD p_werks ID 'ACTVT' FIELD '03'.",
  '  IF sy-subrc <> 0.',
  "    MESSAGE 'No authorization' TYPE 'E'.",
  '  ENDIF.',
  '  WRITE / p_werks.',
].join('\n');

const PROVES = 'The source proves authorization objects (AUTHORITY-CHECK)';

/** The Controls section and the Roles line of the Markdown file. */
function controlsAndRoles(md: string): { controls: string; roles: string } {
  const lines = md.split('\n');
  const at = lines.indexOf('### Controls');
  const end = lines.indexOf('### Who acts', at);
  return {
    controls: lines.slice(at + 1, end).filter((l) => l.trim()).join('\n'),
    roles: lines.find((l) => l.startsWith('- **Roles:**')) ?? '',
  };
}

test.describe('who may act is said from one reading (3.0.23 d)', () => {
  test('own role check: the Roles reason repeats the Controls line and never claims an AUTHORITY-CHECK', () => {
    const doc = docOf(OWN_CHECK);
    const { controls, roles } = controlsAndRoles(processDocumentationToMarkdown(doc));
    expect(controls).toMatch(/^No AUTHORITY-CHECK; its own code names an authorization or a role it checks: REQUIRE_ROLE \(L5\), NOT_AUTHORIZED \(L7\)\.$/);
    expect(roles).not.toContain(PROVES);
    expect(roles).toContain(controls);
    expect(authorizationBasisOf(doc).kind).toBe('own-check');
  });

  test('no check at all: Controls and Roles say the same absence', () => {
    const doc = docOf(NO_CHECK);
    const { controls, roles } = controlsAndRoles(processDocumentationToMarkdown(doc));
    expect(controls).toBe('No AUTHORITY-CHECK and no role check in the code.');
    expect(roles).not.toContain(PROVES);
    expect(roles).toContain(controls);
    expect(authorizationBasisOf(doc).kind).toBe('none');
  });

  test('an AUTHORITY-CHECK keeps the stored reason, and the stored document does not change', () => {
    const doc = docOf(SAP_CHECK);
    expect(authorizationBasisOf(doc).kind).toBe('authority-check');
    const { controls, roles } = controlsAndRoles(processDocumentationToMarkdown(doc));
    expect(controls).not.toMatch(/No AUTHORITY-CHECK/);
    expect(roles).toContain(PROVES);
    // The reading is applied where the document is said, not where it is stored.
    for (const source of [OWN_CHECK, NO_CHECK, SAP_CHECK]) expect(docOf(source).notDetermined).toEqual(DOCUMENTATION_GAPS);
  });

  test('a document stored before role checks were recorded claims neither a check nor its absence', () => {
    const doc = docOf(OWN_CHECK);
    const older = { ...doc, facts: { ...doc.facts!, ownAuthorization: undefined } } as ProcessDocumentation;
    expect(authorizationBasisOf(older).kind).toBe('no-authority-check');
    const roles = notDeterminedOf(older).find((g) => g.subject === 'Roles')!.reason;
    expect(roles).toMatch(/^No AUTHORITY-CHECK in the code\. /);
    expect(roles).not.toMatch(/no role check/);
  });
});

test.describe('the handbook\'s roles block (3.0.23 d)', () => {
  test('with a RACI on record it points to it instead of saying no draft exists', () => {
    const note = handbookRolesNote({ namingState: 'not-named', raciRoles: ['Planner', 'Reviewer'], authorization: { kind: 'none' } });
    expect(note.raci).toBe(true);
    expect(note.text).not.toMatch(/No AI-generated draft/);
    expect(note.text).toContain('Planner, Reviewer');
  });

  test('without a RACI it says what the code shows, not a fixed "names authorizations"', () => {
    const own = handbookRolesNote({ namingState: 'not-named', raciRoles: [], authorization: authorizationBasisOf(docOf(OWN_CHECK)) });
    expect(own.text).toMatch(/^No AI-generated draft for roles exists for this run\. /);
    expect(own.text).not.toMatch(/names authorizations/);
    const none = handbookRolesNote({ namingState: 'not-named', raciRoles: [], authorization: authorizationBasisOf(docOf(NO_CHECK)) });
    expect(none.text).toMatch(/no AUTHORITY-CHECK and no role check/);
    const sap = handbookRolesNote({ namingState: 'not-named', raciRoles: [], authorization: authorizationBasisOf(docOf(SAP_CHECK)) });
    expect(sap.text).toMatch(/names authorization objects, not people/);
    expect(handbookRolesNote({ namingState: 'named', raciRoles: [], authorization: null }).text)
      .toBe('The stored AI-generated draft names no role for this chapter.');
  });

  test('the page hands the RACI on record and the reading to the handbook; the screens say gaps through the reading', () => {
    const stage = read('components/documentation/HandbookStage.tsx');
    expect(stage).toContain('handbookRolesNote(');
    expect(stage).not.toContain('The code names authorizations, not people.');
    const page = read('app/(app)/project/[projectId]/documentation/page.tsx');
    expect(page).toMatch(/rolesOfLayer\(businessLayer\)/);
    expect(page).toMatch(/raciRoles=\{handbookRaciRoles\}/);
    expect(page).toMatch(/authorization=\{handbookAuthorization\}/);
    expect(read('components/documentation/ProcessDocumentationView.tsx')).toContain('notDeterminedOf(doc).map(');
  });
});
