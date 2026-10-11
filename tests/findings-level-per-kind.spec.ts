import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildAbapEvidence, type EvidenceFinding } from '../lib/abap/evidence-model';
import { gradeSapObjectUse } from '../lib/abap/catalog-service';
import type { CloudReadinessGrade } from '../lib/abap/abcd-classification';
import { accessUseOfKind, findingRows, noLevelReason } from '../lib/findings-view';

/**
 * Every kind of finding names the SAP object it is graded on, or says it is a
 * statement with no level — owner, 11.10.2026, on "Findings by kind" of a real
 * FI program: "levels are missing here". The table reads and the transaction
 * showed a level; "Classic ALV list", "File transfer through the SAP GUI" and
 * "Authorization check" showed a bare "?" and named nothing.
 *
 * Why: the ALV and file-transfer findings recorded no `objectName`, although
 * the statement calls a named function module (or class), so the lookup had
 * nothing to grade. `AUTHORITY-CHECK` is a statement of the language; the
 * authorization object it names is in neither of SAP's files, and grading it
 * would read the missing entry as level C — a level SAP never gave it.
 */

const SOURCE = `REPORT zfi_level_per_kind.
TABLES bkpf.
DATA: gt_bkpf TYPE STANDARD TABLE OF bkpf,
      gt_data TYPE STANDARD TABLE OF string,
      lv_prog TYPE progname VALUE 'ZFI_OTHER'.
START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'
    ID 'BUKRS' FIELD '1000'
    ID 'ACTVT' FIELD '03'.
  SELECT * FROM bkpf INTO TABLE gt_bkpf UP TO 10 ROWS.
  CALL FUNCTION 'GUI_UPLOAD'
    EXPORTING
      filename = 'C:\\temp\\in.txt'
    TABLES
      data_tab = gt_data.
  CALL FUNCTION 'GUI_DOWNLOAD'
    EXPORTING
      filename = 'C:\\temp\\out.txt'
    TABLES
      data_tab = gt_data.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    TABLES
      t_outtab = gt_bkpf.
  SUBMIT rfitemgl AND RETURN.
  SUBMIT (lv_prog) AND RETURN.
  COMMIT WORK.
`;

const findings = buildAbapEvidence(SOURCE, 'zfi_level_per_kind.abap').findings;
const ofKind = (kind: string) => findings.filter((f) => f.kind === kind);
/** What `/api/abcd-classify` answers for a finding — the same function, the same use. */
const levelOf = (f: EvidenceFinding): CloudReadinessGrade | null =>
  f.objectName ? gradeSapObjectUse(f.objectName.trim().toUpperCase(), accessUseOfKind(f.kind)).grade : null;

test.describe('the engine names the object a call finding is caused by', () => {
  test('the classic ALV finding names REUSE_ALV_GRID_DISPLAY and is graded on it', () => {
    const [alv] = ofKind('classic-alv');
    expect(alv?.objectName).toBe('REUSE_ALV_GRID_DISPLAY');
    expect(alv?.objectType).toBe('Function Module');
    // In neither SAP file: the residual C of docs/ARCHITECTURE.md §4.2, as for any unlisted SAP object.
    expect(levelOf(alv)).toBe('C');
  });

  test('each GUI file transfer names its function module, graded B (SAP: classicAPI)', () => {
    const gui = ofKind('gui-download');
    expect(gui.map((f) => f.objectName)).toEqual(['GUI_UPLOAD', 'GUI_DOWNLOAD']);
    for (const f of gui) expect(levelOf(f)).toBe('B');
    // Two modules, two rows of the list — not one row named after a title.
    expect(findingRows(gui)).toHaveLength(2);
  });

  test('the class form names CL_GUI_FRONTEND_SERVICES', () => {
    const src = `REPORT zx.\nDATA lv_file TYPE string.\nSTART-OF-SELECTION.\n  cl_gui_frontend_services=>gui_upload( EXPORTING filename = lv_file ).\n`;
    const [f] = buildAbapEvidence(src, 'zx.abap').findings.filter((x) => x.kind === 'gui-download');
    expect(f?.objectName).toBe('CL_GUI_FRONTEND_SERVICES');
    expect(f?.objectType).toBe('Class');
    expect(levelOf(f)).toBe('B');
  });

  test('SUBMIT names the program it calls when it is written as a name, and none when it is in a variable', () => {
    const submits = ofKind('submit');
    expect(submits.map((f) => f.objectName ?? null)).toEqual(['RFITEMGL', null]);
  });

  test('an update-task call names its update module', () => {
    const src = `REPORT zx.\nSTART-OF-SELECTION.\n  CALL FUNCTION 'Z_FI_UPDATE' IN UPDATE TASK.\n`;
    const [f] = buildAbapEvidence(src, 'zx.abap').findings.filter((x) => x.kind === 'update-task');
    expect(f?.objectName).toBe('Z_FI_UPDATE');
  });
});

test.describe('a finding without an SAP object says why it has no level', () => {
  test('AUTHORITY-CHECK records no object and is a statement, naming the authorization object it checks', () => {
    const [auth] = ofKind('authority-check');
    expect(auth.objectName).toBeUndefined();
    const reason = noLevelReason(auth);
    expect(reason?.kind).toBe('statement');
    expect(reason?.label).toBe('Statement');
    expect(reason?.detail).toContain('AUTHORITY-CHECK');
    expect(reason?.detail).toContain('F_BKPF_BUK');
    // Never a letter, never "not determined": it says there is no level.
    expect(reason?.title).toMatch(/^No level/);
  });

  test('COMMIT WORK is a statement; a SUBMIT of a program in a variable names no object', () => {
    expect(noLevelReason(ofKind('commit-work')[0])?.kind).toBe('statement');
    const dynamic = ofKind('submit').find((f) => !f.objectName)!;
    expect(noLevelReason(dynamic)?.kind).toBe('no-object');
  });

  test('a finding that names an object has no such reason — the lookup answers it', () => {
    for (const f of findings.filter((x) => x.objectName)) expect(noLevelReason(f)).toBeNull();
  });
});

/* ------------------------------------------------------------- rendered */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'findings-level-per-kind');

type Table = (props: {
  findings: readonly EvidenceFinding[];
  levels: { status: 'ready'; of: (f: EvidenceFinding) => CloudReadinessGrade | null };
}) => React.ReactElement;
let EvidenceFindingsTable: Table;

async function loadTable(): Promise<Table> {
  if (EvidenceFindingsTable) return EvidenceFindingsTable;
  fs.mkdirSync(OUT, { recursive: true });
  // One bundle per worker: two workers writing one file read each other's half.
  const outfile = path.join(OUT, `EvidenceFindingsTable-${process.pid}.cjs`);
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'analyze', 'EvidenceFindingsTable.tsx')],
    outfile,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  EvidenceFindingsTable = require(outfile).default as Table;
  return EvidenceFindingsTable;
}

/** One group's disclosure button, tags stripped. */
function groupSummary(html: string, kind: string): string {
  const at = html.indexOf(`data-findings-group="${kind}"`);
  expect(at, `group ${kind}`).toBeGreaterThan(-1);
  const button = /<button\b[\s\S]*?<\/button>/.exec(html.slice(at))![0];
  return button.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

test('Findings by kind: every group shows a level letter or says "Statement", never a bare "?"', async () => {
  test.setTimeout(120 * 1000);
  const Table = await loadTable();
  const html = renderToStaticMarkup(
    React.createElement(Table, { findings, levels: { status: 'ready', of: levelOf } }),
  );
  // The three rows of the owner's screenshot.
  const alv = groupSummary(html, 'classic-alv');
  expect(alv).toContain('REUSE_ALV_GRID_DISPLAY');
  expect(html.slice(html.indexOf('data-findings-group="classic-alv"'))).toMatch(/data-cc-value="C"/);
  const gui = groupSummary(html, 'gui-download');
  expect(gui).toContain('GUI_UPLOAD, GUI_DOWNLOAD');
  expect(gui).toMatch(/\bB\b 2/);
  const auth = groupSummary(html, 'authority-check');
  expect(auth).toContain('Statement');
  expect(auth).toContain('no clean core level');
  // No group and no row anywhere is a lone question mark.
  const text = html.replace(/<[^>]+>/g, ' ');
  expect(text).not.toMatch(/(^|\s)\?(\s|$)/);
  // The row cell explains itself on hover, focus and tap — a button described by its explanation.
  expect(html).toMatch(/data-cc-no-level-trigger="statement"[^>]*>|<button[^>]*data-cc-no-level-trigger="statement"/);
  expect(html).toContain('data-cc-no-level-explanation="statement"');
  expect(html).toContain('data-cc-no-level-trigger="no-object"');
});
