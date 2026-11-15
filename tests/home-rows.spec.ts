import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import {
  attentionRows,
  filterHomeRows,
  homeRowsOf,
  homeStatusOptions,
  programNameOf,
  sortHomeRows,
  toHomeRow,
  ATTENTION_FILTER,
  ATTENTION_SHOWN,
  EMPTY_HOME_FILTER,
  FILTERS_FROM,
  FIRST_ROWS,
  HOME_ROW_KEYS,
  type HomeRow,
} from '../lib/home-rows';
import { homeStatus, ATTENTION_LABEL, HOME_STATUS_LABEL, REDESIGN_TOTAL } from '../lib/home-status';
import { computeProjectInShort, inShortOf, inShortSentencesOf, PROJECT_IN_SHORT_VERSION } from '../lib/project-in-short';
import { HOME_FIGURES_KEY, HOME_PRIVACY_PENDING_STORAGE_KEYS } from '../lib/home-list-prefs';
import { sha256Hex, artefactDigest } from '../lib/artefact-digest';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { APP_VERSION } from '../lib/version';
import type { Project } from '../lib/types';

/**
 * The home page v2, part 2 (AB-14b) and the data of part 3 (AB-14c), the pure and source half — server-free.
 * The rendered half is `tests/home-list.spec.ts` (a seeded account with 30 projects).
 *
 * What this holds:
 *   - every project is listed (H-O9, QA `c559b61a9b31`): no `limit(25)` anywhere on the way, the rows come lean from
 *     the server — no source code in a row;
 *   - the new status words (H-O3): analysed alone is complete, re-design is named only once started, never offered;
 *   - "Needs your attention" only with one of three reasons, at most three;
 *   - "In short" is written by the server with the run, from the engine only, outside the signed run.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const DEMO = read('public/starter-examples/Z_MM_PO_APPROVAL.abap').replace(/\r\n/g, '\n');

type P = Project & { id: string };
const base = (id: string, extra: Partial<Project> = {}): P => ({ id, name: id, ...extra }) as P;
/** A project with a signed run of its own source. */
const analysed = (id: string, extra: Partial<Project> = {}, source = DEMO): P =>
  base(id, {
    legacyCode: source,
    activeRunId: `run-${id}`,
    auditMetadata: { inputFingerprint: { sha256: sha256Hex(source), lineCount: 552, fileName: 'Z_MM_PO_APPROVAL.abap' } },
    ...extra,
  } as Partial<Project>);

test.describe('the status words — lib/home-status.ts (H-O3)', () => {
  test('no code, not analysed, analysed: the analysis alone is a complete result with nothing open', () => {
    const none = homeStatus(base('a'));
    expect([none.kind, none.title, none.detail, none.tone]).toEqual(['nocode', 'No code yet', 'Upload the program to start', 'waiting']);
    expect(none.next).toMatchObject({ label: 'Upload the code', tool: 'Analyze', run: false });

    const staged = homeStatus(base('b', { legacyCode: 'REPORT z.' }));
    expect([staged.kind, staged.title, staged.detail]).toEqual(['notrun', 'Not analysed yet', 'Code uploaded']);
    expect(staged.next).toMatchObject({ label: 'Run the analysis', tool: 'Analyze', run: true });

    const done = homeStatus(analysed('c'));
    expect([done.kind, done.title, done.detail, done.tone]).toEqual(['analysed', 'Analysed', 'Map, findings and score ready', 'moving']);
    // Re-design is never offered as a next step on the home page.
    expect(done.next).toBeNull();
    expect(done.attention).toBeNull();
    expect(done.stepsDone).toBeNull();
  });

  test('the code changed since the analysis: "Run the analysis again", and a reason for attention', () => {
    const s = homeStatus(analysed('d', { legacyCode: `${DEMO}\n* changed` }));
    expect([s.kind, s.title, s.detail, s.detailTone, s.tone]).toEqual(['analysed', 'Analysed', 'The code changed since', 'warn', 'outdated']);
    expect(s.next).toMatchObject({ label: 'Run the analysis again', tool: 'Analyze', run: true });
    expect(s.attention).toBe('code-changed');
  });

  test('a started re-design is named, with its own next step and the six-step count', () => {
    const s = homeStatus(analysed('e', { solutionDesign: 'A design.' }));
    expect([s.kind, s.title, s.detail]).toEqual(['redesign', 'Re-design under way', 'Design started']);
    expect(s.stepsDone).toBe(0);
    expect(s.next).toMatchObject({ label: 'Confirm the design', tool: 'Design', path: 'design', run: false });
    expect(s.attention).toBeNull();
    expect(REDESIGN_TOTAL).toBe(6);

    const signed = homeStatus(analysed('f', { solutionDesign: 'A design.', approvedByArchitect: true } as Partial<Project>));
    expect(signed.detail).toBe('1 of 6 steps done');
    expect(signed.stepsDone).toBe(1);
    expect(signed.next?.tool).toBe('Transformation');
  });

  test('a design that no longer matches the analysis needs attention, with "Bring Design up to date"', () => {
    const design = 'A design.';
    const s = homeStatus(
      analysed('g', {
        solutionDesign: design,
        auditMetadata: {
          inputFingerprint: { sha256: sha256Hex(DEMO), lineCount: 552, fileName: 'Z_MM_PO_APPROVAL.abap' },
          sourceChange: { artefacts: { solutionDesign: artefactDigest('solutionDesign', design) } },
        },
      } as Partial<Project>),
    );
    expect([s.kind, s.detail, s.detailTone, s.tone, s.attention]).toEqual([
      'redesign', 'Design no longer matches the analysis', 'warn', 'outdated', 'design-outdated',
    ]);
    expect(s.next).toMatchObject({ label: 'Bring Design up to date', tool: 'Design' });
  });

  test('handed over is said by the export on record, never by `project.status`', () => {
    const s = homeStatus(analysed('h', { auditMetadata: { auditPackExportedAt: '2026-11-01', inputFingerprint: { sha256: sha256Hex(DEMO) } } } as Partial<Project>));
    expect([s.kind, s.title, s.detail, s.next]).toEqual(['handed', 'Handed over', 'Evidence package exported', null]);
    const claimed = homeStatus(base('i', { status: 'completed' } as Partial<Project>));
    expect(claimed.kind).toBe('nocode');
    expect(code('lib/home-status.ts')).not.toMatch(/project\??\.status\b/);
  });

  test('a failed test run is a reason for attention, read from the phase contract (ADR-094 `runFailed`)', () => {
    const src = code('lib/home-status.ts');
    expect(src).toContain('testing.runFailed');
    expect(src).toContain("attention: 'test-failed'");
    expect(ATTENTION_LABEL['test-failed']).toBe('A test run failed');
  });

  test('the status filter names the words of the mockup, in the order a project moves', () => {
    expect(Object.values(HOME_STATUS_LABEL)).toEqual([
      'No code yet', 'Not analysed yet', 'Analysed', 'Re-design under way', 'Re-design done', 'Handed over',
    ]);
  });
});

test.describe('the rows — lib/home-rows.ts (H-O9: every project, lean)', () => {
  /** Thirty own projects: more than the 25 the list used to read. */
  const thirty: HomeRow[] = Array.from({ length: 30 }, (_, i) =>
    toHomeRow(
      i % 3 === 0
        ? analysed(`p${i}`, { name: `Program ${i}`, updatedAt: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` } as Partial<Project>)
        : base(`p${i}`, { name: `Program ${i}`, legacyCode: `REPORT z_prog_${i}.`, updatedAt: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` } as Partial<Project>),
    ),
  );

  test('a row carries no source code, no artefact and no model text — only its own keys', () => {
    const row = toHomeRow(analysed('x', { analysis: 'model narrative', solutionDesign: 'design text' } as Partial<Project>));
    expect(Object.keys(row).sort()).toEqual([...HOME_ROW_KEYS].sort());
    const json = JSON.stringify(row);
    expect(json).not.toContain('REPORT');
    expect(json).not.toContain('model narrative');
    expect(json).not.toContain('design text');
    expect(json.length).toBeLessThan(1500);
    expect(row.program).toBe('Z_MM_PO_APPROVAL');
    expect(row.lines).toBe(552);
    expect(row.linesFromRun).toBe(true);
  });

  test('the date is "6 Nov 2026" in the list and ISO only for sorting (H-O10)', () => {
    const row = toHomeRow(base('d', { createdAt: '2026-11-06T10:00:00Z' } as Partial<Project>));
    expect(row.lastChangeText).toBe('6 Nov 2026');
    expect(row.lastChange).toBe('2026-11-06');
    expect(toHomeRow(base('n')).lastChangeText).toBeNull();
  });

  test('search, filters and sort run over all 30 — a project beyond the 25th is found', () => {
    expect(thirty).toHaveLength(30);
    const late = filterHomeRows(thirty, { ...EMPTY_HOME_FILTER, search: 'program 29' });
    expect(late.map((r) => r.id)).toEqual(['p29']);
    // By the program's name too.
    expect(filterHomeRows(thirty, { ...EMPTY_HOME_FILTER, search: 'z_mm_po' }).length).toBe(10);
    expect(filterHomeRows(thirty, { ...EMPTY_HOME_FILTER, status: 'analysed' })).toHaveLength(10);
    expect(filterHomeRows(thirty, { ...EMPTY_HOME_FILTER, status: 'notrun' })).toHaveLength(20);
    expect(sortHomeRows(thirty, 'name')[0].name).toBe('Program 0');
    expect(FILTERS_FROM).toBe(10);
    expect(FIRST_ROWS).toBe(10);
  });

  test('the level filter hides only rows known to have none', () => {
    const kept = filterHomeRows(thirty.slice(0, 3), { ...EMPTY_HOME_FILTER, level: 'D' }, (row) => (row.id === 'p0' ? false : null));
    expect(kept.map((r) => r.id)).toEqual(['p1', 'p2']);
  });

  test('"Needs your attention" lists only rows with a reason, own ones, at most three', () => {
    const changed = (id: string, day: string) =>
      toHomeRow(analysed(id, { legacyCode: `${DEMO}\n* ${id}`, updatedAt: day } as Partial<Project>));
    const rows = [...thirty, changed('c1', '2026-11-01'), changed('c2', '2026-11-03'), changed('c3', '2026-11-02'), changed('c4', '2026-10-30')];
    const shared = { ...changed('s1', '2026-11-05'), access: 'shared' as const };
    const { shown, total } = attentionRows([...rows, shared]);
    expect(total).toBe(4);
    expect(shown.map((r) => r.id)).toEqual(['c2', 'c3', 'c1']);
    expect(ATTENTION_SHOWN).toBe(3);
    // No reason, no card: thirty projects analysed or staged carry none.
    expect(attentionRows(thirty).total).toBe(0);
    // The status filter offers "Needs attention" only when there is one.
    expect(homeStatusOptions(thirty).map((o) => o.value)).not.toContain(ATTENTION_FILTER);
    expect(homeStatusOptions(rows).map((o) => o.value)).toContain(ATTENTION_FILTER);
    expect(filterHomeRows(rows, { ...EMPTY_HOME_FILTER, status: ATTENTION_FILTER })).toHaveLength(4);
  });

  test('the route\'s answer is read back strictly: a row of another shape is dropped', () => {
    const good = thirty[0];
    const parsed = homeRowsOf({ rows: [good, { ...good, id: 7 }, { ...good, status: { ...good.status, kind: 'done' } }, null, { ...good, legacyCode: 'REPORT z.' }] });
    expect(parsed).toHaveLength(2);
    // A key the row does not have is not carried on.
    expect(JSON.stringify(parsed)).not.toContain('legacyCode');
    expect(homeRowsOf(null)).toBeNull();
    expect(homeRowsOf({ rows: 'x' })).toBeNull();
  });

  test('the program name is the file without its extension', () => {
    expect(programNameOf('Z_MM_PO_APPROVAL.abap')).toBe('Z_MM_PO_APPROVAL');
    expect(programNameOf('ZREPORT.txt')).toBe('ZREPORT');
    expect(programNameOf(null)).toBeNull();
  });
});

test.describe('the row source — app/api/workspace-rows/route.ts and the list', () => {
  test('the route reads every own project through the Admin SDK, behind the second factor, and sends rows only', () => {
    const route = code('app/api/workspace-rows/route.ts');
    expect(route).toContain("where('userId', '==', decodedToken.uid)");
    expect(route).toContain('assertMfaSatisfied(req, decodedToken)');
    expect(route).toContain('assertAccountActive(decodedToken.uid)');
    expect(route).toContain('withStoredArtefacts(db, d.ref, data)');
    expect(route).toContain('HOME_ROW_KEYS.map((k) => [k, row[k]])');
    expect(route).not.toMatch(/limit\(25\)/);
    expect(route).not.toMatch(/\.set\(|\.update\(|\.delete\(/);
    expect(read('tests/helpers/gated-routes.ts')).toContain("file: 'app/api/workspace-rows/route.ts'");
  });

  test('the list reads its own rows from the route, not 25 documents with their source', () => {
    const list = code('components/workspace/WorkspaceListReport.tsx');
    expect(list).not.toMatch(/limit\(\s*25\s*\)/);
    expect(list).not.toMatch(/where\('userId'/);
    expect(list).toContain("fetch('/api/workspace-rows'");
    expect(list).toContain('homeRowsOf(body)');
    // Only the newest answer is shown.
    expect(list).toMatch(/if \(mine !== seq\.current\) return;/);
  });

  test('the cap of the list is said, never silent: the route answers `truncated` past MAX_ROWS and the list prints it', () => {
    const route = code('app/api/workspace-rows/route.ts');
    expect(route).toMatch(/const MAX_ROWS = 2000;/);
    expect(route).toContain('.limit(MAX_ROWS + 1)');
    expect(route).toContain('truncated: snap.docs.length > MAX_ROWS');
    const list = code('components/workspace/WorkspaceListReport.tsx');
    expect(list).toContain('truncated: body?.truncated === true');
    expect(list).toMatch(/\{loaded\?\.truncated \? \(\s*<p[^>]*data-home-truncated=""[^>]*>\{homeTruncated\(projects\.length\)\}<\/p>/);
    expect(read('CHANGELOG.md')).toContain('My workspace lists every project up to 2,000');
  });

  test('a run from a row goes only through the confirmation dialog with cost and model (H-O12: today\'s sentence)', () => {
    const list = code('components/workspace/WorkspaceListReport.tsx');
    // The only callers of `start` are the dialog's confirm.
    const calls = list.match(/\bstart\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(list).toMatch(/onConfirm=\{\(\) => \{\s*const \{ row, callModel \} = confirming;\s*setConfirming\(null\);\s*void start\(row, callModel\);/);
    expect(list).toContain('<CcRunCost cost={costFor(confirming.callModel)} />');
  });

  test('"New analysis" is the page\'s only filled button (H-O13); the row menu has no "Open project"', () => {
    const list = code('components/workspace/WorkspaceListReport.tsx');
    expect(list.match(/variant="primary"/g) ?? []).toHaveLength(1);
    expect(list).toContain('showOpen={false}');
    expect(code('components/workspace/HomeAttentionCard.tsx')).not.toContain('variant="primary"');
    expect(code('components/workspace/HomeDoors.tsx')).not.toContain('variant="primary"');
  });

  test('the "Figures" key is held for the Privacy Policy until its list names it', () => {
    const privacy = read('lib/legal/texts/privacy.en.ts');
    expect(HOME_FIGURES_KEY).toBe('cc.workspace.figures');
    for (const key of [HOME_FIGURES_KEY]) {
      expect(privacy.includes(key) || HOME_PRIVACY_PENDING_STORAGE_KEYS.includes(key), key).toBe(true);
    }
    // A key the text already names leaves the register.
    for (const key of HOME_PRIVACY_PENDING_STORAGE_KEYS) expect(privacy, key).not.toContain(key);
  });
});

test.describe('"In short" — stored with the run, not shown yet (AB-14c data, H-O6)', () => {
  test('the engine\'s "What this program does", each sentence with its line — every shipped example', () => {
    const demo = inShortSentencesOf(DEMO, APP_VERSION);
    expect(demo.length).toBeGreaterThan(0);
    expect(demo.length).toBeLessThanOrEqual(2);
    for (const s of demo) {
      expect(s.anchor).toMatch(/^L\d+(-\d+)?$/);
      expect(s.text).toMatch(/[.!?]$/);
    }
    for (const e of STARTER_EXAMPLES) {
      const src = read(`public/starter-examples/${e.file}`).replace(/\r\n/g, '\n');
      for (const s of inShortSentencesOf(src, APP_VERSION)) expect(s.anchor, e.name).toMatch(/^L\d+(-\d+)?$/);
    }
    // Same as the Business page's "What this program does" — the same function, no model proposal.
    expect(code('lib/project-in-short.ts')).toContain('doesOf(lines, null)');
    expect(code('lib/project-in-short.ts')).not.toMatch(/gemini|anthropic|callModel|narrative/i);
  });

  test('read back only for the active run, and only in exactly the written shape', () => {
    const rec = computeProjectInShort({ runId: 'run-a', sourceSha256: 'x', source: DEMO, engineVersion: APP_VERSION }, new Date('2026-11-15T00:00:00Z'));
    expect(rec.version).toBe(PROJECT_IN_SHORT_VERSION);
    expect(rec.by).toBe('engine');
    expect(inShortOf({ activeRunId: 'run-a', inShort: rec })?.sentences).toEqual(rec.sentences);
    expect(inShortOf({ activeRunId: 'run-b', inShort: rec })).toBeNull();
    expect(inShortOf({ activeRunId: 'run-a', inShort: { ...rec, by: 'model' } })).toBeNull();
    expect(inShortOf({ activeRunId: 'run-a', inShort: { ...rec, sentences: [{ text: 'Hi <b>x</b>.', anchor: 'L1' }] } })).toBeNull();
    expect(inShortOf({ activeRunId: 'run-a', inShort: { ...rec, sentences: [{ text: 'Fine.', anchor: 'line 1' }] } })).toBeNull();
    expect(inShortOf({ activeRunId: 'run-a' })).toBeNull();
  });

  test('runs/create writes it after the signed transaction, Admin SDK only, never into the run or the audit pack', () => {
    const route = code('app/api/runs/create/route.ts');
    const write = route.indexOf('await writeProjectInShort(');
    expect(write).toBeGreaterThan(-1);
    // After the run is committed and its signature exists.
    expect(write).toBeGreaterThan(route.indexOf('signRunHashV2('));
    expect(route).toContain('computeProjectInShort({ runId, sourceSha256: hashHex, source: legacyCode, engineVersion: APP_VERSION })');
    // In its own try: a failure fails nothing.
    expect(route.slice(write - 200, write)).toMatch(/try \{\s*$/);
    expect(code('lib/project-in-short-server.ts')).toContain("update({ inShort: record })");
    for (const rel of ['lib/audit-pack.ts', 'lib/audit-pack-build.ts', 'lib/audit-pack-canonical.ts', 'lib/run-signature.ts', 'lib/input-manifest.ts']) {
      expect(code(rel), rel).not.toMatch(/inShort|project-in-short/);
    }
  });

  test('no browser can write it: `inShort` is on neither client allowlist of firestore.rules', () => {
    const rules = read('firestore.rules');
    const create = rules.slice(rules.indexOf('allow create: if isAuthenticated() &&\n                    request.resource.data.keys().hasAll'));
    expect(create.slice(0, create.indexOf(';'))).not.toContain('inShort');
    const update = rules.slice(rules.indexOf('request.resource.data.diff(resource.data).affectedKeys().hasOnly(['));
    expect(update.slice(0, update.indexOf('])'))).not.toContain('inShort');
    // No client code writes it.
    for (const rel of ['components/workspace/WorkspaceListReport.tsx', 'lib/project-in-short.ts']) {
      expect(code(rel), rel).not.toMatch(/inShort\s*:/);
    }
  });
});
