import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import {
  INCLUDE_CLOSE_MARK,
  INCLUDE_OPEN_MARK,
  OWN_CODE_MAX_SOURCE_BYTES,
  OWN_CODE_ZIP_LIMITS,
  assembleOwnCode,
  assemblyReady,
  includesNamed,
  readSourceBytes,
  type OwnCodeFile,
} from '../lib/own-code-import';
import { readUploadedFile, readZipSources } from '../lib/own-code-zip';
import { leaveOwnCodeHandoff, takeOwnCodeHandoff } from '../lib/own-code-handoff';
import { deriveReviewTasks } from '../lib/abap/review-tasks';
import { looksLikeAbap } from '../lib/abap-input-check';
import { ownCodeIssueText } from '../lib/messages/own-code';

/**
 * Own code before a project exists — mockup 2.8 s11.
 *
 * The page reads, checks, joins and counts in the browser and writes nothing
 * until "Start analysis". These specs hold the module that does the work to
 * what the page promises: the server's limit, one file stored byte for byte,
 * includes put where SAP puts them, missing ones left Not determined, every
 * refusal named.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const read_ = read;
const enc = (text: string) => new TextEncoder().encode(text);

let seq = 0;
function file(name: string, text: string): OwnCodeFile {
  const bytes = enc(text);
  const { source, issues } = readSourceBytes(name, bytes);
  return { id: `t${++seq}`, name, bytes: bytes.length, zip: false, sources: source ? [source] : [], issues };
}

const MAIN = [
  'REPORT z_demo_main.',
  'INCLUDE z_demo_top.',
  'START-OF-SELECTION.',
  '  PERFORM check_limit.',
  'INCLUDE z_demo_f01.',
  'INCLUDE z_demo_missing.',
  '',
].join('\n');
const TOP = ['DATA gv_limit TYPE p DECIMALS 2.', 'TABLES ekko.', ''].join('\n');
const F01 = [
  'FORM check_limit.',
  '  SELECT SINGLE * FROM ekko WHERE ebeln = @gv_ebeln INTO @DATA(ls_ekko).',
  '  UPDATE zmm_po_log SET status = @abap_true WHERE ebeln = @gv_ebeln.',
  'ENDFORM.',
  '',
].join('\n');

test.describe('own code: the limits are the server’s', () => {
  test('the joined-source limit is the run route’s, to the byte', () => {
    const route = read('app/api/runs/create/route.ts');
    const m = /const MAX_ANALYSED_SOURCE_BYTES = (\d+) \* (\d+);/.exec(route);
    expect(m, 'the route no longer declares MAX_ANALYSED_SOURCE_BYTES as a product').not.toBeNull();
    expect(OWN_CODE_MAX_SOURCE_BYTES).toBe(Number(m![1]) * Number(m![2]));
    // And it is below what firestore.rules lets a project store.
    expect(read('firestore.rules')).toContain('isBoundedString(request.resource.data.legacyCode, 0, 999999)');
    expect(OWN_CODE_MAX_SOURCE_BYTES).toBeLessThan(999999);
  });

  test('a joined source above the limit is refused with both numbers', () => {
    const big = `REPORT z_big.\n${'* filler line to make the source large enough\n'.repeat(6000)}`;
    const a = assembleOwnCode([file('Z_BIG.abap', big)]);
    expect(a.tooLarge).toBe(true);
    expect(assemblyReady(a)).toBe(false);
    expect(a.counts).toBeNull();
  });
});

test.describe('own code: one file is stored as it was read', () => {
  test('a single program is the project’s source, unchanged', () => {
    const text = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');
    const a = assembleOwnCode([file('Z_MM_PO_APPROVAL.abap', text)]);
    expect(a.source).toBe(text);
    expect(a.main?.object).toBe('Z_MM_PO_APPROVAL');
    expect(assemblyReady(a)).toBe(true);
    // Its two includes were never uploaded: named, Not determined.
    expect(a.missing).toEqual(['Z_MM_PO_NOTIFY', 'Z_MM_PO_LOG']);
    expect(a.rows[0].issues.map((i) => i.kind)).toContain('missing-includes');
    expect(a.rows[0].state).toBe('warning');
  });
});

test.describe('own code: a program and its includes', () => {
  test('includes go where their INCLUDE stands, and the rest stays Not determined', () => {
    const a = assembleOwnCode([file('z_demo_main.abap', MAIN), file('Z_DEMO_F01.txt', F01), file('Z_DEMO_TOP.abap', TOP)]);
    expect(a.main?.object).toBe('Z_DEMO_MAIN');
    expect(a.objects).toEqual(['Z_DEMO_MAIN', 'Z_DEMO_TOP', 'Z_DEMO_F01']);
    expect(a.missing).toEqual(['Z_DEMO_MISSING']);
    const lines = a.source.split('\n');
    // The statement stays, as a comment, followed by the include between markers.
    const top = lines.indexOf('*INCLUDE z_demo_top.');
    expect(top).toBeGreaterThan(0);
    expect(lines[top + 1]).toBe(`${INCLUDE_OPEN_MARK} Z_DEMO_TOP · Z_DEMO_TOP.abap`);
    expect(lines[top + 2]).toBe('DATA gv_limit TYPE p DECIMALS 2.');
    expect(lines).toContain(`${INCLUDE_CLOSE_MARK} Z_DEMO_TOP`);
    // The missing include is left exactly as written.
    expect(lines).toContain('INCLUDE z_demo_missing.');
    expect(looksLikeAbap(a.source)).toBe(true);
    expect(assemblyReady(a)).toBe(true);
  });

  test('the engine then reads the uploaded includes and asks only about the missing one', () => {
    const a = assembleOwnCode([file('z_demo_main.abap', MAIN), file('Z_DEMO_TOP.abap', TOP), file('Z_DEMO_F01.abap', F01)]);
    const open = deriveReviewTasks(a.source).tasks.filter((t) => t.kind === 'include-not-read');
    expect(open.map((t) => t.anchors.find((x) => x.kind === 'name')?.label)).toEqual(['Z_DEMO_MISSING']);
  });

  test('the counts come from the joined text, before any run', () => {
    const a = assembleOwnCode([file('z_demo_main.abap', MAIN), file('Z_DEMO_TOP.abap', TOP), file('Z_DEMO_F01.abap', F01)]);
    expect(a.counts).not.toBeNull();
    expect(a.counts!.lines).toBe(a.source.split('\n').length);
    expect(a.counts!.routines).toBe(1);
    expect(a.counts!.tablesRead).toContain('EKKO');
    expect(a.counts!.tablesWritten).toEqual(['ZMM_PO_LOG']);
  });

  test('a source nobody includes is still read, after the program, and says so', () => {
    const a = assembleOwnCode([file('z_demo_main.abap', MAIN), file('Z_OTHER.abap', 'FORM other.\nENDFORM.\n')]);
    expect(a.objects).toContain('Z_OTHER');
    expect(a.source).toContain(`${INCLUDE_OPEN_MARK} Z_OTHER · Z_OTHER.abap`);
    const row = a.rows.find((r) => r.name === 'Z_OTHER.abap')!;
    expect(row.issues.map((i) => i.kind)).toEqual(['not-referenced']);
    expect(row.state).toBe('warning');
  });

  test('two programs are one too many', () => {
    const a = assembleOwnCode([file('A.abap', 'REPORT z_a.\nWRITE 1.\n'), file('B.abap', 'REPORT z_b.\nWRITE 2.\n')]);
    const b = a.rows.find((r) => r.name === 'B.abap')!;
    expect(b.state).toBe('error');
    expect(b.issues[0]).toMatchObject({ kind: 'second-program', object: 'Z_B', main: 'Z_A' });
    expect(a.source).not.toContain('z_b');
    expect(assemblyReady(a)).toBe(false);
  });

  test('includesNamed skips comments and dictionary includes', () => {
    expect(includesNamed('* INCLUDE z_no.\n  INCLUDE STRUCTURE kna1.\nINCLUDE z_yes IF FOUND.\n" INCLUDE z_no2.\n')).toEqual(['Z_YES']);
  });
});

test.describe('own code: every file is checked on its own', () => {
  test('wrong type, binary, prose, a payload and a code page are each named', () => {
    const a = assembleOwnCode([
      { id: 'pdf', name: 'approval-process.pdf', bytes: 10, zip: false, sources: [], issues: [{ kind: 'not-source' }] },
      file('notes.txt', 'Dear team, please review the attached process.'),
      file('evil.abap', 'REPORT z_evil.\n* <script>alert(1)</script>\n'),
    ]);
    expect(a.rows.map((r) => r.state)).toEqual(['error', 'error', 'error']);
    expect(a.rows[1].issues[0].kind).toBe('not-abap');
    expect(a.rows[2].issues[0].kind).toBe('blocked');
    expect(a.attention.map((r) => r.name)).toEqual(['approval-process.pdf', 'notes.txt', 'evil.abap']);

    const nul = readSourceBytes('dump.txt', new Uint8Array([82, 69, 0, 80]));
    expect(nul.issues[0].kind).toBe('binary');

    // "Prüfung" in Windows-1252: 0xFC is not valid UTF-8 on its own.
    const latin = new Uint8Array([...enc("REPORT z_cp.\nWRITE 'Pr"), 0xfc, ...enc("fung'.\n")]);
    const read1252 = readSourceBytes('Z_CP.abap', latin);
    expect(read1252.source?.encoding).toBe('windows-1252');
    expect(read1252.source?.text).toContain('Prüfung');
    expect(read1252.issues[0].kind).toBe('encoding');
  });

  test('the same object twice: identical is a note, different is a stop', () => {
    const same = assembleOwnCode([file('Z_DEMO_TOP.abap', TOP), file('z_demo_top.txt', TOP)]);
    expect(same.rows[1].issues[0]).toMatchObject({ kind: 'duplicate-same', keptFrom: 'Z_DEMO_TOP.abap' });
    expect(same.rows[1].state).toBe('warning');
    const diff = assembleOwnCode([file('Z_DEMO_TOP.abap', TOP), file('z_demo_top.txt', `${TOP}DATA x TYPE i.\n`)]);
    expect(diff.rows[1].state).toBe('error');
  });

  test('every finding has a sentence, and none is a machine string', () => {
    const kinds = [
      { kind: 'not-source' },
      { kind: 'too-large', bytes: 2 * 1024 * 1024, limit: 1024 * 1024 },
      { kind: 'binary' },
      { kind: 'not-abap' },
      { kind: 'blocked', reason: 'Security Block: x.' },
      { kind: 'encoding', encoding: 'windows-1252' },
      { kind: 'duplicate-same', object: 'Z', keptFrom: 'a.zip' },
      { kind: 'duplicate-different', object: 'Z', other: 'a.zip' },
      { kind: 'zip-unreadable' },
      { kind: 'zip-limit' },
      { kind: 'zip-empty' },
      { kind: 'zip-skipped', names: ['a.pdf'] },
      { kind: 'second-program', object: 'Z_B', main: 'Z_A' },
      { kind: 'not-referenced', object: 'Z' },
      { kind: 'missing-includes', names: ['Z_X'] },
    ] as const;
    for (const issue of kinds) {
      const text = ownCodeIssueText(issue);
      expect(text.length, issue.kind).toBeGreaterThan(10);
      expect(text, issue.kind).not.toMatch(/undefined|\[object|zip-|-source\b/);
    }
  });
});

test.describe('own code: a ZIP is opened carefully', () => {
  test('sources are read, anything else is named as not read', async () => {
    const zip = new JSZip();
    zip.file('src/z_demo_main.abap', MAIN);
    zip.file('src/Z_DEMO_TOP.abap', TOP);
    zip.file('src/Z_DEMO_F01.abap', F01);
    zip.file('docs/approval-process.pdf', 'not really a pdf');
    zip.file('__MACOSX/src/._z_demo_main.abap', 'fork');
    const { sources, issues } = await readZipSources(await zip.generateAsync({ type: 'uint8array' }));
    expect(sources.map((s) => s.object).sort()).toEqual(['Z_DEMO_F01', 'Z_DEMO_MAIN', 'Z_DEMO_TOP']);
    expect(issues).toEqual([{ kind: 'zip-skipped', names: ['docs/approval-process.pdf'] }]);
  });

  test('a ZIP that expands past its ceiling is refused, not read', async () => {
    const zip = new JSZip();
    zip.file('Z_HUGE.abap', `REPORT z_huge.\n${' '.repeat(OWN_CODE_ZIP_LIMITS.entryBytes + 10)}`);
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    expect(bytes.length).toBeLessThan(OWN_CODE_ZIP_LIMITS.archiveBytes);
    const { sources, issues } = await readZipSources(bytes);
    expect(sources).toEqual([]);
    expect(issues).toEqual([{ kind: 'zip-limit' }]);
  });

  test('a file that is not a ZIP says so', async () => {
    const { issues } = await readZipSources(enc('not a zip'));
    expect(issues).toEqual([{ kind: 'zip-unreadable' }]);
  });
});

test.describe('own code: the handoff to Analyze', () => {
  test('is taken once, and only for its own project', () => {
    leaveOwnCodeHandoff({ projectId: 'p1', personalDataKey: 'k' });
    expect(takeOwnCodeHandoff('p2')).toBeNull();
    expect(takeOwnCodeHandoff('p1')).toEqual({ projectId: 'p1', personalDataKey: 'k' });
    expect(takeOwnCodeHandoff('p1')).toBeNull();
  });

  test('lives in module memory — not in the URL, not in browser storage', () => {
    const src = read('lib/own-code-handoff.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|searchParams|location/);
    const analyze = read('app/(app)/project/[projectId]/analyze/page.tsx');
    expect(analyze).toContain('takeOwnCodeHandoff(projectId as string)');
  });

  test('the new-project page creates nothing for own code', () => {
    const np = read('components/workspace/NewProject.tsx');
    expect(np).not.toContain('Untitled project');
    expect(np).toContain("router.push('/admin/new-project/upload')");
    // The upload page writes exactly one project, with its source, on start.
    const page = read('components/workspace/OwnCodeImport.tsx');
    expect(page.match(/addDoc\(/g)?.length).toBe(1);
    expect(page).toContain('legacyCode: assembly.source');
    // Paying is a statement, never a radio the reader cannot really choose.
    expect(page).not.toContain('CcRadioGroup');
  });

  test('Analyze opens the workspace after the run only for a project the import handed over', () => {
    const analyze = read('app/(app)/project/[projectId]/analyze/page.tsx');
    const set = analyze.indexOf('openWorkspaceAfterRunRef.current = true');
    const take = analyze.indexOf('const handoff = takeOwnCodeHandoff(projectId as string);');
    expect(set).toBeGreaterThan(take);
    expect(analyze.slice(take, set)).toContain('if (handoff) {');
    // After the signed run's id is in hand, behind the workspace switch.
    const runId = analyze.indexOf('const activeRunId = runResult.runId;');
    const push = analyze.indexOf("router.push(`/project/${projectId}?first=1`)");
    expect(push).toBeGreaterThan(runId);
    expect(analyze.slice(runId, push)).toContain('openWorkspaceAfterRunRef.current && workspaceShellEnabled(profile)');
  });
});

test.describe('own code: QA review of acd1eb0d73aa', () => {
  test('7f4da1440c2b: a ZIP above the ceiling is refused by its size, before a byte is read', async () => {
    let read = 0;
    const huge = {
      name: 'everything.zip',
      size: OWN_CODE_ZIP_LIMITS.archiveBytes + 1,
      arrayBuffer: async () => {
        read++;
        return new ArrayBuffer(0);
      },
    };
    const row = await readUploadedFile(huge, 'z1');
    expect(read, 'the archive was read into memory before its size was asked').toBe(0);
    expect(row.issues).toEqual([{ kind: 'too-large', bytes: huge.size, limit: OWN_CODE_ZIP_LIMITS.archiveBytes }]);
    // And the page goes through this one door.
    const page = read_('components/workspace/OwnCodeImport.tsx');
    expect(page).toContain('readUploadedFile(file');
    expect(page).not.toContain('arrayBuffer()');
  });

  test('d1e304e51241: includes that loop stop the start and name the loop', () => {
    const a = assembleOwnCode([
      file('Z_MAIN.abap', 'REPORT z_main.\nINCLUDE z_a.\n'),
      file('Z_A.abap', 'FORM a.\nENDFORM.\nINCLUDE z_b.\n'),
      file('Z_B.abap', 'FORM b.\nENDFORM.\nINCLUDE z_a.\n'),
    ]);
    expect(assemblyReady(a)).toBe(false);
    const issues = a.rows.flatMap((r) => r.issues.map((i) => ({ row: r.name, ...i })));
    expect(issues.filter((i) => i.kind === 'include-cycle')).toEqual([
      { row: 'Z_A.abap', kind: 'include-cycle', chain: ['Z_A', 'Z_B', 'Z_A'] },
    ]);
    expect(a.attention.map((r) => r.name)).toEqual(['Z_A.abap']);
  });

  test('d1e304e51241: a loop between includes the program never names is caught too', () => {
    const a = assembleOwnCode([
      file('Z_MAIN.abap', 'REPORT z_main.\nWRITE 1.\n'),
      file('Z_A.abap', 'FORM a.\nENDFORM.\nINCLUDE z_b.\n'),
      file('Z_B.abap', 'FORM b.\nENDFORM.\nINCLUDE z_a.\n'),
    ]);
    expect(assemblyReady(a)).toBe(false);
    expect(a.rows.some((r) => r.issues.some((i) => i.kind === 'include-cycle'))).toBe(true);
  });

  test('d1e304e51241: an include named twice stops the start and names the lines', () => {
    const a = assembleOwnCode([
      file('Z_MAIN.abap', 'REPORT z_main.\nINCLUDE z_top.\nWRITE 1.\nINCLUDE z_top.\n'),
      file('Z_TOP.abap', 'DATA gv TYPE i.\n'),
    ]);
    expect(assemblyReady(a)).toBe(false);
    const main = a.rows.find((r) => r.name === 'Z_MAIN.abap')!;
    expect(main.state).toBe('error');
    expect(main.issues).toContainEqual({ kind: 'include-repeated', name: 'Z_TOP', lines: [4] });
    expect(ownCodeIssueText(main.issues.find((i) => i.kind === 'include-repeated')!)).toContain('line 4');
  });

  test('d1e304e51241: a program that includes itself is a loop', () => {
    const a = assembleOwnCode([file('Z_SELF.abap', 'REPORT z_self.\nINCLUDE z_self.\n')]);
    expect(assemblyReady(a)).toBe(false);
    expect(a.rows[0].issues).toContainEqual({ kind: 'include-cycle', chain: ['Z_SELF', 'Z_SELF'] });
  });

  test('d1e304e51241: a clean program with includes is untouched by the check', () => {
    const a = assembleOwnCode([file('z_demo_main.abap', MAIN), file('Z_DEMO_TOP.abap', TOP), file('Z_DEMO_F01.abap', F01)]);
    expect(a.rows.flatMap((r) => r.issues.map((i) => i.kind)).filter((k) => k.startsWith('include-'))).toEqual([]);
    expect(assemblyReady(a)).toBe(true);
  });
});
