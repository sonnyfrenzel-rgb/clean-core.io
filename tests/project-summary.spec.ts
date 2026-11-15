import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { mapThumbOf, parseMapThumb, processTitleOf, summaryOf, MAP_THUMB_MAX, PROCESS_TITLE_MAX, PROJECT_SUMMARY_VERSION } from '../lib/project-summary';
import { computeProjectSummary, mapFiguresOf, refreshSummaryMap } from '../lib/project-summary-server';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { sha256Hex } from '../lib/artefact-digest';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { APP_VERSION } from '../lib/version';
import { planProjectSummary } from '../scripts/backfill-project-summary';

/**
 * 3.3.0, step 2 (ADR-123 (5), W11): the project summary My workspace's tiles
 * read — written by the server only, outside the signed run, bound to the
 * active run, its thumbnail geometry and never markup. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const demoSource = read('public/starter-examples/Z_MM_PO_APPROVAL.abap').replace(/\r\n/g, '\n');
const demoXml = () => buildBpmnExportFromSource(demoSource, { processName: 'Z_MM_PO_APPROVAL', sourceFileName: 'Z_MM_PO_APPROVAL.abap' }).xml;

test.describe('the thumbnail', () => {
  test('the demo map compacts to a few kilobytes of shapes and lines, and reads back', () => {
    const thumb = mapThumbOf(demoXml())!;
    expect(thumb).not.toBeNull();
    expect(thumb.length).toBeLessThanOrEqual(MAP_THUMB_MAX);
    // Geometry only: no name, no code, no markup.
    expect(thumb).toMatch(/^v1;V -?\d+ -?\d+ \d+ \d+(;[SEGTPFA](?: -?\d+)+)+$/);
    const parsed = parseMapThumb(thumb)!;
    expect(parsed.items.some((i) => i.kind === 'start')).toBe(true);
    expect(parsed.items.some((i) => i.kind === 'end')).toBe(true);
    expect(parsed.items.some((i) => i.kind === 'flow')).toBe(true);
  });

  test('every shipped example gets a thumbnail within the cap', () => {
    for (const e of STARTER_EXAMPLES) {
      const src = read(`public/starter-examples/${e.file}`).replace(/\r\n/g, '\n');
      const { xml } = buildBpmnExportFromSource(src, { processName: e.name, sourceFileName: e.file });
      const thumb = mapThumbOf(xml);
      expect(thumb, e.name).not.toBeNull();
      expect(thumb!.length, e.name).toBeLessThanOrEqual(MAP_THUMB_MAX);
      expect(parseMapThumb(thumb), e.name).not.toBeNull();
    }
  });

  test('a stored thumbnail that is not exactly the format is refused whole — nothing is ever put into the page as markup', () => {
    expect(parseMapThumb('v1;V 0 0 10 10;S 5 5')).not.toBeNull();
    for (const bad of [
      '<svg onload="alert(1)"/>',
      'v1;V 0 0 10 10;S 5 5;<script>',
      'v1;V 0 0 10 10;S 5 x',
      'v1;V 0 0 10 10;X 1 2',
      'v2;V 0 0 10 10;S 5 5',
      'v1;S 5 5',
      `v1;V 0 0 10 10;${'S 1 1;'.repeat(1000)}S 1 1`,
      42,
      null,
    ]) {
      expect(parseMapThumb(bad), String(bad).slice(0, 40)).toBeNull();
    }
    const tile = code('components/workspace/MapThumb.tsx');
    expect(tile).toContain('parseMapThumb(');
    expect(tile).not.toContain('dangerouslySetInnerHTML');
  });
});

test.describe('the figures', () => {
  test('the demo: its steps are the demo record\'s process steps, its rules the engine\'s', () => {
    const release = JSON.parse(read('lib/demo-release.json')) as { figures: { processSteps: number; rulesRevealed: number } };
    const s = computeProjectSummary({
      runId: 'r1',
      sourceSha256: sha256Hex(demoSource),
      source: demoSource,
      processName: 'Z_MM_PO_APPROVAL',
      sourceFileName: 'Z_MM_PO_APPROVAL.abap',
      engineVersion: APP_VERSION,
      cleanCoreScore: 40,
      recommendation: 'In-App (ABAP Cloud)',
    }, new Date('2026-11-14T00:00:00Z'));
    expect(s.version).toBe(PROJECT_SUMMARY_VERSION);
    expect(s.mapSteps).toBe(release.figures.processSteps);
    expect(s.rulesDerived).toBe(release.figures.rulesRevealed);
    expect(s.mapRevision).toBe(1);
    expect(s.cleanCoreScore).toBe(40);
    expect(s.writtenAt).toBe('2026-11-14T00:00:00.000Z');
  });

  test('the business name is the header\'s title line, read for the run\'s engine — never a model\'s (owner decision 14.11.2026)', () => {
    const at = (engineVersion: string, source = demoSource) => computeProjectSummary({
      runId: 'r1', sourceSha256: 'x', source, processName: 'My project', sourceFileName: 'Z_MM_PO_APPROVAL.abap',
      engineVersion, cleanCoreScore: null, recommendation: null,
    }).processTitle;
    // The mock-up's title, as the demo program's author wrote it under the report line.
    expect(at(APP_VERSION)).toBe('Emergency purchase approval');
    // An engine before 3.0.21 does not read the title line: the tile keeps the project's name.
    expect(at('3.0.20')).toBeNull();
    // A header without a title line gives none; it is never made up from the program's name.
    expect(at(APP_VERSION, 'REPORT z_plain.\nWRITE 1.\n')).toBeNull();
    // Every shipped example with a title line gets it, within the cap.
    for (const e of STARTER_EXAMPLES) {
      const t = at(APP_VERSION, read(`public/starter-examples/${e.file}`).replace(/\r\n/g, '\n'));
      if (t !== null) expect(t.length, e.name).toBeLessThanOrEqual(PROCESS_TITLE_MAX);
    }
    // No model is asked for it: the server half reads the engine only.
    expect(code('lib/project-summary-server.ts')).not.toMatch(/gemini|anthropic|callModel|process-naming/i);
  });

  test('a stored business name is read back as one plain line, or not at all', () => {
    expect(processTitleOf('  Emergency   purchase approval ')).toBe('Emergency purchase approval');
    for (const bad of ['', '   ', 'x'.repeat(PROCESS_TITLE_MAX + 1), 'Approval <script>', `Approval${String.fromCharCode(0)}`, 42, null]) {
      expect(processTitleOf(bad), String(bad).slice(0, 20)).toBeNull();
    }
    const base = { version: 1, runId: 'run-a', sourceSha256: 's', mapThumb: null, mapSteps: null, mapRevision: 1, rulesDerived: null, cleanCoreScore: null, recommendation: null, writtenAt: '' };
    expect(summaryOf({ activeRunId: 'run-a', summary: { ...base, processTitle: 'Delivery priority' } })?.processTitle).toBe('Delivery priority');
    // A summary written before the business name existed reads as "none" — the tile shows the project's name.
    expect(summaryOf({ activeRunId: 'run-a', summary: base })?.processTitle).toBeNull();
  });

  test('a saved drawing gives the map, the rules stay the source\'s', () => {
    const xml = demoXml();
    const s = computeProjectSummary({
      runId: 'r1', sourceSha256: 'x', source: demoSource, processName: 'P', sourceFileName: 'p.abap',
      engineVersion: APP_VERSION, cleanCoreScore: null, recommendation: null, revision: { xml, revision: 3 },
    });
    expect(s.mapRevision).toBe(3);
    expect(s.mapThumb).toBe(mapFiguresOf(xml).mapThumb);
  });
});

test.describe('bound to the active run', () => {
  const summary = { version: 1, runId: 'run-a', sourceSha256: 's', mapThumb: 'v1;V 0 0 1 1;S 0 0', mapSteps: 3, mapRevision: 1, rulesDerived: 2, cleanCoreScore: 50, recommendation: 'rap', writtenAt: '' };
  test('a summary of another run, or none, is not shown', () => {
    expect(summaryOf({ activeRunId: 'run-a', summary })?.mapSteps).toBe(3);
    expect(summaryOf({ activeRunId: 'run-b', summary })).toBeNull();
    expect(summaryOf({ summary })).toBeNull();
    expect(summaryOf({ activeRunId: 'run-a' })).toBeNull();
    expect(summaryOf({ activeRunId: 'run-a', summary: { ...summary, version: 99 } })).toBeNull();
  });

  test('a saved drawing refreshes the map of its own run, and a late refresh of an older revision changes nothing', async () => {
    // A one-document store with Firestore's transaction surface, enough for `refreshSummaryMap`.
    let doc: Record<string, unknown> = { summary: { ...summary, mapRevision: 3 } };
    const ref = { id: 'p1' };
    const db = {
      collection: () => ({ doc: () => ref }),
      runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn({
        get: async () => ({ get: (field: string) => doc[field] }),
        update: (_ref: unknown, patch: Record<string, unknown>) => {
          const next = { ...(doc.summary as Record<string, unknown>) };
          for (const [key, value] of Object.entries(patch)) next[key.replace(/^summary\./, '')] = value;
          doc = { ...doc, summary: next };
        },
      }),
    } as unknown as Parameters<typeof refreshSummaryMap>[0];
    const xml = buildBpmnExportFromSource(read('public/starter-examples/Z_MM_PO_APPROVAL.abap'), { processName: 'p', sourceFileName: 'z.abap' }).xml;
    // Revision 2's refresh arrives after revision 3's: refused, revision 3 stays.
    expect(await refreshSummaryMap(db, 'p1', 'run-a', { xml, revision: 2 })).toBe(false);
    expect((doc.summary as { mapRevision: number }).mapRevision).toBe(3);
    // The same or a newer revision is written; another run's summary is left alone.
    expect(await refreshSummaryMap(db, 'p1', 'run-a', { xml, revision: 4 })).toBe(true);
    expect((doc.summary as { mapRevision: number }).mapRevision).toBe(4);
    expect(await refreshSummaryMap(db, 'p1', 'run-b', { xml, revision: 5 })).toBe(false);
    expect((doc.summary as { mapRevision: number }).mapRevision).toBe(4);
  });
});

test.describe('written by the server only, outside the signed run', () => {
  test('firestore.rules: `summary` is on no client allowlist, and is typed as a map', () => {
    const rules = read('firestore.rules');
    const lists = [...rules.matchAll(/hasOnly\(\[([^\]]*)\]\)/g)].map((m) => m[1]);
    for (const list of lists) expect(list).not.toContain("'summary'");
    expect(rules).toContain("(!('summary' in data) || (data.summary is map))");
  });

  test('runs/create writes it after the signed transaction, not into the run', () => {
    const route = code('app/api/runs/create/route.ts');
    const write = route.indexOf('await writeProjectSummary(db, projectId, summary);');
    expect(write).toBeGreaterThan(route.indexOf('tx.set(newRunDoc, analysisRun);'));
    const runObject = route.slice(route.indexOf('const analysisRun: AnalysisRun = {'), route.indexOf('const analysisRun: AnalysisRun = {') + 6000);
    expect(runObject.slice(0, runObject.indexOf('\n    };'))).not.toMatch(/\bsummary\b/);
    // Its failure fails nothing.
    expect(route.slice(route.lastIndexOf('try {', write), write + 300)).toContain('catch (summaryErr)');
  });

  test('the revision route refreshes only the map, for the run the summary is of', () => {
    expect(code('app/api/projects/[projectId]/process-revisions/route.ts')).toContain('await refreshSummaryMap(db, gate.projectId, activeRunId, { xml: checked.xml, revision: record.revision });');
    const server = code('lib/project-summary-server.ts');
    expect(server).toContain('summary.runId !== runId) return false;');
  });

  test('no audit pack, export or run signature reads it', () => {
    for (const rel of ['lib/audit-pack.ts', 'lib/audit-pack-verify.ts', 'lib/run-signature.ts']) {
      if (!fs.existsSync(path.join(ROOT, rel))) continue;
      expect(code(rel), rel).not.toMatch(/project-summary|\.summary\b|mapThumb/);
    }
  });

  test('no client code writes it', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (rel !== 'app/api') walk(rel);
        } else if (/\.tsx?$/.test(e.name)) {
          const src = code(rel);
          if (/updateDoc\([^)]*summary|setDoc\([^)]*summary|['"]summary\.\w+['"]\s*:/.test(src) && !rel.endsWith('project-summary-server.ts')) offenders.push(rel);
        }
      }
    };
    for (const d of ['app', 'components', 'hooks', 'lib']) walk(d);
    expect(offenders).toEqual([]);
  });
});

test.describe('the backfill', () => {
  const sha = sha256Hex(demoSource);
  const project = { name: 'PO', activeRunId: 'r1', legacyCode: demoSource, auditMetadata: { inputFingerprint: { sha256: sha, fileName: 'Z_MM_PO_APPROVAL.abap' } } };
  const run = { cleanCoreScore: 40, originalRecommendation: 'rap', analyzerVersion: APP_VERSION, fileName: 'Z_MM_PO_APPROVAL.abap' };

  test('writes the run\'s summary, from the signed source only, once', () => {
    const plan = planProjectSummary({ project, run, latestRevision: null });
    expect('summary' in plan && plan.summary.runId).toBe('r1');
    expect('summary' in plan && plan.summary.cleanCoreScore).toBe(40);
    expect(planProjectSummary({ project: { ...project, activeRunId: '' }, run, latestRevision: null })).toEqual({ skip: 'no-run' });
    expect(planProjectSummary({ project, run: null, latestRevision: null })).toEqual({ skip: 'run-unreadable' });
    expect(planProjectSummary({ project: { ...project, legacyCode: demoSource + '\n* changed' }, run, latestRevision: null })).toEqual({ skip: 'source-not-signed' });
    const done = 'summary' in plan ? plan.summary : null;
    expect(planProjectSummary({ project: { ...project, summary: done }, run, latestRevision: null })).toEqual({ skip: 'has-summary' });
  });

  test('gives a summary written before the business name its name — once, from the same run', () => {
    const plan = planProjectSummary({ project, run, latestRevision: null });
    const full = 'summary' in plan ? plan.summary : null;
    expect(full?.processTitle).toBe('Emergency purchase approval');
    const { processTitle: _dropped, ...older } = full!;
    void _dropped;
    const again = planProjectSummary({ project: { ...project, summary: older }, run, latestRevision: null });
    expect('summary' in again && again.summary.processTitle).toBe('Emergency purchase approval');
    // A summary that says "no title line" (null) is complete: nothing to do.
    expect(planProjectSummary({ project: { ...project, summary: { ...full!, processTitle: null } }, run, latestRevision: null })).toEqual({ skip: 'has-summary' });
  });

  test('takes the newest drawing of the signed source, never one of another source', () => {
    const xml = demoXml();
    const mine = planProjectSummary({ project, run, latestRevision: { revision: 4, xml, sourceSha256: sha } });
    expect('summary' in mine && mine.summary.mapRevision).toBe(4);
    const other = planProjectSummary({ project, run, latestRevision: { revision: 4, xml, sourceSha256: 'other' } });
    expect('summary' in other && other.summary.mapRevision).toBe(1);
  });

  test('refuses CI and prints counts only', () => {
    const src = read('scripts/backfill-project-summary.ts');
    expect(src).toContain("Refusing to run in CI");
    expect(src).not.toMatch(/console\.log\([^)]*doc\.id/);
  });
});
