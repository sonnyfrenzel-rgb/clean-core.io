import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { sha256Hex } from '../lib/artefact-digest';
import { nextStepOf, tileCounts, tileMatches, toProgramTile, COUNTS_FROM, type ListedProject } from '../lib/workspace-tiles';
import { WORKSPACE_PAGE_MESSAGES } from '../lib/messages/workspace';

/**
 * 3.3.0, step 3a (ADR-123 (4)): a returning account's programs as tiles —
 * the model and the page's guards. Server-free; the rendered half lives in
 * `tests/workspace-tiles-rendered.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const code = (rel: string) =>
  fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SOURCE = 'REPORT z_demo.\nWRITE 1.\n';
const SHA = sha256Hex(SOURCE);

function project(id: string, extra: Partial<ListedProject> & Record<string, unknown> = {}): ListedProject {
  return {
    id,
    name: `Program ${id}`,
    status: 'uploaded',
    userId: 'u',
    legacyCode: SOURCE,
    createdAt: '2026-11-01T10:00:00.000Z',
    ...extra,
  } as unknown as ListedProject;
}

const signed = (id: string, extra: Record<string, unknown> = {}) =>
  project(id, {
    activeRunId: `run-${id}`,
    auditMetadata: { inputFingerprint: { sha256: SHA, fileName: `Z_${id.toUpperCase()}.abap`, lineCount: 2 }, modelCard: { analysisTimestamp: '2026-11-06T09:00:00.000Z' } },
    summary: { version: 1, runId: `run-${id}`, sourceSha256: SHA, mapThumb: 'v1;V 0 0 100 50;S 10 25;E 90 25;F 28 25 72 25', mapSteps: 7, mapRevision: 1, rulesDerived: 3, cleanCoreScore: 40, recommendation: 'In-App (ABAP Cloud)', writtenAt: '' },
    ...extra,
  } as Record<string, unknown>);

test.describe('one tile per program, both products', () => {
  test('a program nobody analysed: Analyse says so, Re-design waits for it, no figure is invented', () => {
    const t = toProgramTile(project('a'));
    expect(t.analyse).toEqual({ kind: 'not-analysed' });
    expect(t.redesign).toEqual({ kind: 'waits' });
    expect(t.thumb).toBeNull();
    expect(t.steps).toBeNull();
    expect(t.score).toBeNull();
    expect(t.decision).toBeNull();
  });

  test('a signed program: its summary\'s map and figures, the proposed decision, re-design not started', () => {
    const t = toProgramTile(signed('b'));
    expect(t.analyse).toEqual({ kind: 'signed', on: '6 Nov' });
    expect(t.thumb).toContain('v1;');
    expect(t.steps).toBe(7);
    expect(t.score).toBe(40);
    expect(t.decision).toEqual({ option: 'rebuild', confirmed: false });
    expect(t.redesign).toEqual({ kind: 'not-started' });
    expect(t.objectName).toBe('Z_B');
    expect(t.track).toEqual(['todo', 'todo', 'todo', 'todo', 'todo', 'todo']);
  });

  test('a summary of another run is not shown', () => {
    const p = signed('c');
    (p as unknown as { activeRunId: string }).activeRunId = 'run-newer';
    const t = toProgramTile(p);
    expect(t.thumb).toBeNull();
    expect(t.score).toBeNull();
  });

  test('W5: a decision that builds nothing says "Not needed", with its decision', () => {
    const t = toProgramTile(signed('d', { targetArchitecture: 'retire', approvedByArchitect: true }));
    expect(t.decision).toEqual({ option: 'retire', confirmed: true });
    expect(t.redesign).toEqual({ kind: 'not-needed', option: 'retire', confirmed: true });
  });

  test('changed code: Analyse is out of date and Re-design waits', () => {
    const t = toProgramTile(signed('e', { legacyCode: `${SOURCE}WRITE 2.\n` }));
    expect(t.analyse).toEqual({ kind: 'stale' });
    expect(t.redesign).toEqual({ kind: 'waits' });
  });
});

test.describe('the counts are the filter, and the next step is one', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const tiles = [
    toProgramTile(project('a', { updatedAt: '2026-11-13T10:00:00.000Z' })),
    toProgramTile(signed('b', { updatedAt: '2026-11-12T10:00:00.000Z' })),
    toProgramTile(signed('e', { legacyCode: `${SOURCE}WRITE 2.\n`, updatedAt: '2026-10-01T10:00:00.000Z' })),
    toProgramTile(signed('d', { targetArchitecture: 'retire', approvedByArchitect: true, updatedAt: '2026-11-10T10:00:00.000Z' })),
  ];

  test('five counts from the same list', () => {
    const c = tileCounts(tiles, now);
    expect(c.all).toBe(4);
    expect(c.analysed).toBe(2);
    expect(c.outOfDate).toBe(1);
    expect(c.attention).toBe(2);
    expect(c.redesign).toBe(0);
    expect(c.delivered).toBe(0);
    expect(c.changedThisWeek).toBe(3);
    expect(tiles.filter((t) => tileMatches(t, 'attention')).map((t) => t.id).sort()).toEqual(['a', 'e']);
    expect(COUNTS_FROM).toBe(3);
  });

  test('next: the program ready for re-design; also waiting: the newest that needs a run', () => {
    const { next, alsoWaiting } = nextStepOf(tiles);
    expect(next?.kind).toBe('start-redesign');
    expect(next?.tile.id).toBe('b');
    expect(alsoWaiting?.id).toBe('a');
  });

  test('a shared program is never the next step', () => {
    const shared = toProgramTile(signed('s'), 'shared');
    expect(nextStepOf([shared]).next).toBeNull();
  });
});

test.describe('the page', () => {
  const page = code('components/workspace/WorkspaceTiles.tsx');
  const model = code('lib/workspace-tiles.ts');

  test('reads the list and the summary only: no request per tile, no bpmn-js, no stored view', () => {
    for (const src of [page, model, code('components/workspace/MapThumb.tsx')]) {
      expect(src).not.toMatch(/\bfetch\(|getDoc\(|onSnapshot\(|bpmn-js|useWorkspaceRowFacts/);
    }
    // The table's per-row reads run in list mode only.
    expect(code('components/workspace/WorkspaceListReport.tsx')).toContain("const ids = mode !== 'list' ? [] :");
    // The lens and the mode live in this browser, never in Firestore.
    const prefs = code('lib/workspace-prefs.ts');
    expect(prefs).toContain("'cc.workspace.lens'");
    expect(prefs).not.toMatch(/firestore|updateDoc|setDoc/i);
  });

  test('one filled action: the next step', () => {
    expect(page.match(/variant="primary"/g) ?? []).toHaveLength(1);
    expect(page).toMatch(/variant="primary"\s+density="cozy"\s+data-ws-next-go/);
  });

  test('three sections: Next step, At a glance, Your programs — and no "launchpad", no "optional"', () => {
    for (const key of ['ws.nextStep', 'ws.atAGlance', 'ws.yourPrograms'] as const) expect(page).toContain(`wt('${key}')`);
    const ws = Object.entries(WORKSPACE_PAGE_MESSAGES).filter(([k]) => k.startsWith('ws.')).map(([, v]) => v).join('\n');
    expect(ws).not.toMatch(/launchpad|optional/i);
  });

  test('green only where it is earned: a signed run, a signed delivery', () => {
    const greens = [...page.matchAll(/text-cc-success|bg-cc-success/g)].length;
    expect(greens).toBeGreaterThan(0);
    expect(page).toMatch(/tone === 'signed' \? 'text-cc-success'/);
    expect(page).toMatch(/m === 'signed'\s*\?\s*'bg-cc-success'/);
  });
});
