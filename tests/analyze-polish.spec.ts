import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PASTED_SOURCE_NAME, exampleFileName, sourceFileName } from '../lib/source-file-name';
import { EXAMPLE_SNIPPETS } from '../lib/example-snippets';
import { findingRows, programMap, programMapRowCount, processStepBands, stepColumns } from '../lib/findings-view';
import { readProcess } from '../lib/first-look';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { analysisAnswer } from '../components/analyze/analysis-answer';

/**
 * Four defects on the rebuilt Analyze page, found while capturing a signed run
 * of the shipped Z_MM_PO_APPROVAL example (01.10.2026). The rendered half is
 * `tests/analyze-polish-rendered.spec.ts`; this half pins the rules.
 */
const ROOT = path.resolve(__dirname, '..');
const EXAMPLE = fs.readFileSync(path.join(ROOT, 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test.describe('1. the file name of a project started from an example', () => {
  // Exactly the fields the example gallery writes (components/StarterExamples.tsx).
  const fromGallery = { name: 'Z_MM_PO_APPROVAL', status: 'uploaded', legacyCode: EXAMPLE, fromExample: true };

  test('is the example file, not the paste placeholder', () => {
    expect(exampleFileName(fromGallery)).toBe('Z_MM_PO_APPROVAL.abap');
    expect(sourceFileName(fromGallery)).toBe('Z_MM_PO_APPROVAL.abap');
  });

  test('a run already signed with the placeholder still shows the example file', () => {
    const signedAsPasted = { ...fromGallery, auditMetadata: { inputFingerprint: { fileName: PASTED_SOURCE_NAME } } };
    expect(sourceFileName(signedAsPasted)).toBe('Z_MM_PO_APPROVAL.abap');
  });

  test('a real signed name wins, and a project that is no example gets nothing', () => {
    expect(sourceFileName({ ...fromGallery, auditMetadata: { inputFingerprint: { fileName: 'zmy_upload.abap' } } })).toBe('zmy_upload.abap');
    expect(sourceFileName({ name: 'Z_MM_PO_APPROVAL', legacyCode: EXAMPLE })).toBeNull();
    expect(sourceFileName({ name: 'My own report', legacyCode: 'REPORT z.', fromExample: true })).toBeNull();
  });

  test('a snippet is recognised by its text, before a shipped example of the same object name', () => {
    const snippet = EXAMPLE_SNIPPETS.find((s) => s.name === 'Z_SALES_ORDER_CREATOR.abap')!;
    expect(snippet, 'the snippet this case is about is gone').toBeTruthy();
    expect(sourceFileName({ name: 'Z_SALES_ORDER_CREATOR', legacyCode: snippet.code, fromExample: true })).toBe('Z_SALES_ORDER_CREATOR.abap');
    expect(sourceFileName({ name: 'Z_SALES_ORDER_CREATOR', legacyCode: 'REPORT other.', fromExample: true })).toBe('Z_SALES_ORDER_CREATOR.txt');
  });

  test('the Analyze page learns the name on load and the workspace run sends it', () => {
    const page = read('app/(app)/project/[projectId]/analyze/page.tsx');
    expect(page).toContain('setUploadedFileName(sourceFileName(hydratedProject) ?? PASTED_SOURCE_NAME)');
    expect(page).toContain('fileName: sourceFileName(project),');
    expect(page).not.toContain("'manual-input.abap'");
    expect(read('components/workspace/WorkspaceListReport.tsx')).toContain("fileName: sourceFileName(project) || 'main.abap'");
  });
});

test.describe('2. a program map row says what its dots are', () => {
  const rows = findingRows(buildAbapEvidence(EXAMPLE, 'Z_MM_PO_APPROVAL.abap', 'private').findings);
  const map = programMap(rows, EXAMPLE.split('\n').length);

  test('the EBAN write is one finding at two places, and the row says both', () => {
    const write = map.find((r) => r.kind === 'standard-table-write')!;
    expect(write.count, 'one finding per pattern and object, as the list counts it').toBe(1);
    expect(write.dots.map((d) => d.line)).toEqual([246, 455]);
    expect(programMapRowCount(write)).toBe('1 finding · 2 places in the code');
  });

  test('a row whose dots are its findings says only the findings', () => {
    expect(programMapRowCount({ count: 1, dots: [{ line: 5 } as never] })).toBe('1 finding');
    expect(programMapRowCount({ count: 2, dots: [{ line: 5 } as never, { line: 9 } as never] })).toBe('2 findings');
  });

  test('every row: places named whenever the dots outnumber the findings', () => {
    for (const r of map) {
      const places = new Set(r.dots.map((d) => d.line)).size;
      const text = programMapRowCount(r);
      if (places > r.count) expect(text, r.kind).toContain(`${places} places`);
      else expect(text, r.kind).not.toContain('places');
    }
  });
});

test.describe('3. the program map columns read 1..n left to right', () => {
  const steps = processStepBands(readProcess(EXAMPLE).skeleton, EXAMPLE);

  test('numbered by position on the line axis, with the run order said when it differs', () => {
    const { columns, runOrder } = stepColumns(steps);
    expect(columns.map((c) => c.column)).toEqual(columns.map((_, i) => i + 1));
    for (let i = 1; i < columns.length; i++) expect(columns[i].from).toBeGreaterThan(columns[i - 1].from);
    // The example writes READ_REQUISITION and CHECK_REQUISITION before CHECK_AUTHORITY, and calls it first.
    expect(columns.slice(0, 3).map((c) => c.label)).toEqual(['READ_REQUISITION', 'CHECK_REQUISITION', 'CHECK_AUTHORITY']);
    expect(runOrder?.slice(0, 4)).toEqual([3, 1, 2, 4]);
  });

  test('no run-order sentence when the code is written in the order it runs', () => {
    const inOrder = [
      { n: 1, label: 'A', from: 10, to: 20 },
      { n: 2, label: 'B', from: 30, to: 40 },
    ];
    expect(stepColumns(inOrder).runOrder).toBeNull();
  });

  test('the map draws the column number, not the run number', () => {
    const src = read('components/analyze/ProgramMap.tsx');
    expect(src).toContain('{s.column}');
    expect(src).not.toMatch(/>\s*\{s\.n\}\s*</);
    expect(src).toContain('numbered left to right as they stand in the code');
  });
});

test.describe('4. the head does not contradict itself about the model', () => {
  const counts = { total: 3, bySeverity: { Critical: 1, High: 1, Medium: 1, Low: 0 } };

  test("the answer says the evidence is the engine's, with or without a narrative — the fold says what the model wrote", () => {
    // Since 10.10.2026 the answer is one sentence (DESIGN.md §2.11): the
    // pointer to the model's summary left the prose, because the fold marks
    // the summary "Model proposal" where it stands.
    const a = analysisAnswer({ counts, lines: 669, route: null, routeChosenByReader: false });
    expect(a.detail).toContain('read all 669 lines without a model');
    expect(a.detail).not.toContain('Summary');
  });

  test('the status line keeps the evidence and the narrative apart', () => {
    const page = read('app/(app)/project/[projectId]/analyze/page.tsx');
    expect(page).not.toContain('engine, with a model narrative');
    expect(page).toContain("{ key: 'evidence', label: 'Evidence', value: 'engine only, no model'");
    // Evidence · Run · Target · Successors (owner decision 10.10.2026): the
    // narrative is not a status of its own — it says what it is where it
    // stands, folded as "Model summary" and marked "Model proposal" — and the
    // route is said by the answer and the route card, not a third time here.
    expect(page).not.toContain("key: 'narrative'");
    expect(page).not.toContain("key: 'route'");
    expect([...page.matchAll(/\{ key: '(\w+)', label: '\w+', value:/g)].map((m) => m[1])).toEqual(['evidence', 'run', 'target', 'successors']);
    expect(page).toMatch(/title="Model summary"\s*aside=\{<CcProvenanceChip value="proposed" \/>\}/);
  });
});
