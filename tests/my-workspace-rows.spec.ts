import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  applyWorkspaceFilter,
  EMPTY_FILTER,
  filterIsActive,
  sortWorkspaceRows,
  toWorkspaceRow,
  type WorkspaceRow,
} from '../lib/workspace-rows';
import { levelsOf, rowHasLevel, rulesOf, type RowFacts } from '../lib/workspace-row-facts';
import { yourTurnItems } from '../lib/your-turn';
import { processStepList } from '../lib/process-step-list';
import { readSource } from '../lib/first-look';
import { printHeaderLine } from '../lib/workspace-messages';
import { projectProgress, SEGMENT_CLASS } from '../lib/project-progress';
import { PHASES } from '../lib/workflow-steps';
import type { ItFindingRow } from '../lib/it-findings';
import type { Project } from '../lib/types';

/**
 * My workspace (mockup s7) and the workspace on paper (s10) — the pure half.
 *
 * Every figure the list adds can say that nothing happened: a project with no
 * run has no levels and no confirmed rules, a refused read says "not counted"
 * instead of a zero, and a filter never hides a row because its read is slow.
 */

const ROOT = path.resolve(__dirname, '..');
const DEMO = fs
  .readFileSync(path.join(ROOT, 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8')
  .replace(/\r\n/g, '\n');

function finding(level: ItFindingRow['level'], objectName: string | null = 'EBAN'): ItFindingRow {
  return {
    id: `CC-${Math.random().toString(36).slice(2, 6)}`, kind: 'x', title: 't', severity: 'Low',
    objectName, objectType: null, lineStart: 1, lineEnd: null, routine: null, level,
    releaseView: null, classificationView: null, successor: null, targetOptions: [],
    rulesCoveringLine: [], rulesInRoutine: [],
  };
}

function project(id: string, extra: Partial<Project> = {}): Project & { id: string } {
  return { id, name: id, ...extra } as Project & { id: string };
}

test.describe('levels and rules confirmed — lib/workspace-row-facts.ts', () => {
  test('levels count A–D from the findings; none graded is said in words, not drawn as zeros', () => {
    const ready = levelsOf({ rows: [finding('A'), finding('D'), finding('D'), finding('Unknown')], sourceSha256: '', rulesDerived: 0 });
    expect(ready.state).toBe('ready');
    if (ready.state === 'ready') {
      expect(ready.value.counts.A).toBe(1);
      expect(ready.value.counts.D).toBe(2);
      expect(ready.value.total).toBe(4);
    }
    expect(levelsOf({ rows: [], sourceSha256: '', rulesDerived: 0 })).toEqual({ state: 'absent', reason: 'no findings' });
    expect(levelsOf({ rows: [finding(null, null)], sourceSha256: '', rulesDerived: 0 }).state).toBe('absent');
    expect(levelsOf(null).state).toBe('absent');
  });

  test('a process nobody reconstructed has 0 of N confirmed; any other refusal is "not counted", never 0', () => {
    expect(rulesOf(null, 7, 'no-baseline')).toEqual({ state: 'ready', value: { confirmed: 0, total: 7 } });
    expect(rulesOf(null, 7, 'source-moved')).toEqual({ state: 'absent', reason: 'not counted' });
    expect(rulesOf(null, null, null)).toEqual({ state: 'absent', reason: 'not counted' });
    expect(rulesOf(null, 0, 'no-baseline').state).toBe('absent');
  });

  test('keep, change and drop count as confirmed; clarify is still open', () => {
    const account = { uid: 'u', name: 'U' };
    const entry = (subject: string, state: 'keep' | 'change' | 'drop' | 'clarify', revision = 1) => ({
      subject, kind: 'rule' as const, state, note: state === 'keep' ? null : 'why', account,
      confirmedAt: '2026-10-01T00:00:00Z', revision,
    });
    const view = {
      formatVersion: 1, revision: 2, baselineRevision: 1, links: [],
      subjects: ['BR-001', 'BR-002', 'BR-003', 'BR-004'].map((s) => ({ subject: s, kind: 'rule' as const, label: s, detail: '', anchor: null })),
      entries: [entry('BR-001', 'keep'), entry('BR-002', 'clarify'), entry('BR-002', 'drop', 2), entry('BR-003', 'clarify')],
    };
    expect(rulesOf(view, 4, null)).toEqual({ state: 'ready', value: { confirmed: 2, total: 4 } });
  });
});

test.describe('the list — lib/workspace-rows.ts', () => {
  const own = toWorkspaceRow(project('p-own', { legacyCode: 'REPORT z.', updatedAt: '2026-09-02' as never }), 'own');
  const old = toWorkspaceRow(project('p-old', { legacyCode: 'REPORT z.', updatedAt: '2026-08-01' as never }), 'own');
  const shared = toWorkspaceRow(project('p-shared', { legacyCode: 'REPORT z.' }), 'shared');
  const demo: WorkspaceRow = { ...own, id: 'demo', name: 'Demo', isDemo: true, lastChange: null };

  test('a row opens the project workspace and says whose it is', () => {
    expect(own.href).toBe('/project/p-own');
    expect(own.access).toBe('own');
    expect(shared.access).toBe('shared');
  });

  test('the access filter keeps mine or shared — and never the demo, which is neither', () => {
    const rows = [demo, own, shared];
    expect(applyWorkspaceFilter(rows, { ...EMPTY_FILTER, access: 'own' }).map((r) => r.id)).toEqual(['p-own']);
    expect(applyWorkspaceFilter(rows, { ...EMPTY_FILTER, access: 'shared' }).map((r) => r.id)).toEqual(['p-shared']);
    expect(applyWorkspaceFilter(rows, EMPTY_FILTER)).toHaveLength(3);
    expect(filterIsActive({ ...EMPTY_FILTER, access: 'shared' })).toBe(true);
    expect(filterIsActive({ ...EMPTY_FILTER, level: 'D' })).toBe(true);
  });

  test('the level filter hides only rows known to have none — a row still being read stays', () => {
    const facts: Record<string, RowFacts> = {
      'p-own': { levels: { state: 'ready', value: { counts: { A: 0, B: 0, C: 1, D: 2, Unknown: 0 }, graded: 3, total: 3 } }, rules: { state: 'loading' } },
      'p-old': { levels: { state: 'ready', value: { counts: { A: 4, B: 0, C: 0, D: 0, Unknown: 0 }, graded: 4, total: 4 } }, rules: { state: 'loading' } },
      'p-shared': { levels: { state: 'loading' }, rules: { state: 'loading' } },
    };
    const kept = applyWorkspaceFilter([own, old, shared], { ...EMPTY_FILTER, level: 'D' }, (row, level) =>
      rowHasLevel(facts[row.id], level as 'D'),
    );
    expect(kept.map((r) => r.id)).toEqual(['p-own', 'p-shared']);
  });

  test('sorting keeps the demo first, newest change next, and a project without a date last', () => {
    const undated = { ...shared, lastChange: null };
    expect(sortWorkspaceRows([old, undated, demo, own], 'last-change').map((r) => r.id)).toEqual(['demo', 'p-own', 'p-old', 'p-shared']);
    expect(sortWorkspaceRows([own, demo, old], 'name').map((r) => r.id)).toEqual(['demo', 'p-old', 'p-own']);
  });
});

test.describe('"Your turn" — lib/your-turn.ts', () => {
  test('lists the next step of own projects only, stale first — never a shared project or the demo', () => {
    const a = project('a', { legacyCode: 'REPORT z.', updatedAt: '2026-09-01' as never });
    const b = project('b', { legacyCode: 'REPORT z.', updatedAt: '2026-09-20' as never });
    const s = project('s', { legacyCode: 'REPORT z.' });
    const rows = [toWorkspaceRow(a, 'own'), toWorkspaceRow(b, 'own'), toWorkspaceRow(s, 'shared')];
    rows[0] = { ...rows[0], stale: { note: 'source changed' } };
    const items = yourTurnItems(rows, [a, b, s], null);
    expect(items.map((i) => i.row.id)).toEqual(['a', 'b']);
    for (const item of items) {
      expect(item.point.label.length).toBeGreaterThan(0);
      expect(item.point.provenance).toBe('reconstructed');
    }
  });
});

test.describe('the workspace on paper — lib/process-step-list.ts', () => {
  const reading = readSource(DEMO);
  const steps = processStepList(reading.skeleton, DEMO);

  test('a numbered list with plain names, anchors, and every decision as a question with its branches', () => {
    expect(steps.length).toBeGreaterThan(5);
    expect(steps.map((s) => s.n)).toEqual(steps.map((_, i) => i + 1));
    const decisions = steps.filter((s) => s.kind === 'decision');
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) {
      expect(d.branches.length, `${d.name} has no branch`).toBeGreaterThan(0);
      for (const b of d.branches) expect(b).toContain('→');
    }
    expect(steps.filter((s) => s.anchor !== null).length).toBeGreaterThan(steps.length / 2);
  });

  test('every node of the skeleton except start and end is a step, exactly once', () => {
    const expected = reading.skeleton.nodes.filter((n) => n.kind !== 'start' && n.kind !== 'end' && n.label.trim() !== '');
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    expect(steps.length).toBe(expected.length);
  });

  test('the header line names project, run, need revision and date — and says so when there is no run', () => {
    expect(printHeaderLine({ projectId: 'P-1', runId: 'r1', revision: 4, date: '2026-10-01' })).toBe(
      'P-1 · run r1 · need revision 4 · printed 2026-10-01',
    );
    expect(printHeaderLine({ projectId: 'P-1', runId: null, revision: null, date: '2026-10-01' })).toContain('no signed run');
  });
});

test.describe('a row a business reader understands — lib/project-progress.ts (owner feedback 01.10.2026)', () => {
  const staged = { id: 'p', name: 'p', legacyCode: 'REPORT z.' } as Project & { id: string };
  const analysed = {
    id: 'q', name: 'q', legacyCode: 'REPORT z.', activeRunId: 'run-1', status: 'analyzed',
    analysis: '{"cleanCoreScore": 40}', solutionDesign: '# design', worklist: [],
  } as unknown as Project & { id: string };

  for (const [name, project] of [['staged', staged], ['analysed', analysed], ['empty', { id: 'e', name: 'e' }]] as const) {
    test(`${name}: the count is the number of done segments, and every segment names its step`, () => {
      const progress = projectProgress(project as Project);
      const doneSegments = progress.segments.filter((s) => s.state === 'done' || s.state === 'done-verified').length;
      expect(progress.done).toBe(doneSegments);
      expect(progress.countLabel).toBe(`${doneSegments} of ${progress.total} steps done`);
      expect(progress.segments.map((s) => s.label)).toEqual(PHASES.map((p) => p.label));
      for (const s of progress.segments) expect(s.label.length).toBeGreaterThan(0);
    });
  }

  test('no done segment is drawn in the in-progress amber, and only verified work is green', () => {
    expect(SEGMENT_CLASS.done).not.toMatch(/warning|success/);
    expect(SEGMENT_CLASS['done-verified']).toMatch(/success/);
    expect(SEGMENT_CLASS['done-verified']).not.toMatch(/warning/);
    expect(SEGMENT_CLASS['in-progress']).toMatch(/warning/);
    for (const state of ['not-started', 'stale', 'done'] as const) expect(SEGMENT_CLASS[state]).not.toMatch(/success/);
    expect(SEGMENT_CLASS.stale).toMatch(/border-dashed/);
    // Five states, five different looks.
    expect(new Set(Object.values(SEGMENT_CLASS)).size).toBe(5);
  });

  test('the sentence is plain words — never a bare "draft" — and the next action says what it does', () => {
    const s = projectProgress(staged);
    expect(s.stage).toBe('not-analysed');
    expect(s.sentence).toMatch(/^Not analysed yet/);
    expect(s.sentence).not.toMatch(/\bdraft\b/i);
    expect(s.next).toEqual({ label: 'Run the analysis', path: 'analyze' });
    const e = projectProgress({ name: 'e' } as Project);
    expect(e.stage).toBe('not-started');
    expect(e.next?.label).toBe('Upload the code');
    const a = projectProgress(analysed);
    expect(a.stage).toBe('in-progress');
    expect(a.sentence).toContain(a.countLabel);
  });
});
