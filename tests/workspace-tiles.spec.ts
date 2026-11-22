import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { sha256Hex } from '../lib/artefact-digest';
import {
  attentionOf,
  nextStepOf,
  programNextLabel,
  programNextStep,
  tileCounts,
  tileMatches,
  toProgramTile,
  COUNTS_FROM,
  type ListedProject,
} from '../lib/workspace-tiles';
import { parseMapThumb, thumbDisplayViewBox, THUMB_MIN_VIEW } from '../lib/project-summary';
import { WORKSPACE_PAGE_MESSAGES } from '../lib/messages/workspace';
import { PRIVACY_PENDING_STORAGE_KEYS, WORKSPACE_LENS_KEY, WORKSPACE_MODE_KEY } from '../lib/workspace-prefs';

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

  test('the title is the business process name where the summary carries one, the project\'s name small below (owner decision 14.11.2026)', () => {
    const named = (title: unknown, id = 'n') => {
      const p = signed(id);
      const s = (p as unknown as { summary: Record<string, unknown> }).summary;
      (p as unknown as { summary: Record<string, unknown> }).summary = { ...s, processTitle: title };
      return toProgramTile(p);
    };
    const t = named('Emergency purchase approval');
    expect(t.title).toBe('Emergency purchase approval');
    expect(t.titleIsProcess).toBe(true);
    expect(t.projectName).toBe('Program n');
    expect(t.objectName).toBe('Z_N');
    // No business name, or one equal to the project's name: the project's name is the title, said once.
    for (const none of [null, undefined, 'Program n']) {
      const u = named(none);
      expect(u.title).toBe('Program n');
      expect(u.titleIsProcess).toBe(false);
    }
    // A summary of an earlier run names nothing.
    const stale = signed('m');
    (stale as unknown as { summary: Record<string, unknown> }).summary.processTitle = 'Old name';
    (stale as unknown as { activeRunId: string }).activeRunId = 'run-newer';
    expect(toProgramTile(stale).title).toBe('Program m');
    // Delete and Invite name the project, not the process.
    const page = code('components/workspace/WorkspaceTiles.tsx');
    expect(page).toContain('name={tile.projectName}');
    expect(page).toContain('data-tile-project-name');
    const list = code('components/workspace/WorkspaceListReport.tsx');
    expect(list).toContain('setDeleting({ id: tile.id, name: tile.projectName })');
    expect(list).toContain('setInviting({ id: tile.id, name: tile.projectName })');
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

test.describe('one next step per program, one reason for attention (owner decisions 22.11.2026)', () => {
  test('the tile, the list and the Next step card read the same next step', () => {
    const cases: Array<[ListedProject, string, string, boolean]> = [
      [project('n', { legacyCode: '' }), 'add-code', 'Add the code', false],
      [project('a'), 'analyse', 'Run the analysis', true],
      [signed('e', { legacyCode: `${SOURCE}WRITE 2.
` }), 'rerun', 'Run the analysis again', true],
      [signed('b'), 'start-redesign', 'Re-design this program', false],
      [signed('d', { targetArchitecture: 'retire', approvedByArchitect: true }), 'open-decision', 'Open the decision', false],
    ];
    for (const [p, kind, label, run] of cases) {
      const next = programNextStep(toProgramTile(p));
      expect([next.kind, programNextLabel(next), next.run], p.id).toEqual([kind, label, run]);
    }
    // The Next step card picks among the same steps, and its button says the same words.
    const { next } = nextStepOf([toProgramTile(signed('b'))]);
    expect(next?.kind).toBe('start-redesign');
    const page = code('components/workspace/WorkspaceTiles.tsx');
    expect(page).toContain('programNextLabel(programNextStep(next.tile))');
    expect(page).toContain('programNextLabel(programNextStep(tile))');
  });

  test('attention is code changed or not analysed — never a program without code, never a signed one', () => {
    expect(attentionOf(toProgramTile(project('a')))).toBe('not-analysed');
    expect(attentionOf(toProgramTile(signed('e', { legacyCode: `${SOURCE}WRITE 2.
` })))).toBe('code-changed');
    expect(attentionOf(toProgramTile(signed('b')))).toBeNull();
    expect(attentionOf(toProgramTile(project('n', { legacyCode: '' })))).toBeNull();
  });

  test('a small map is never blown up: one maximum scale, centred; a large map keeps its own frame', () => {
    const small = parseMapThumb('v1;V 0 0 100 50;S 10 25;E 90 25;F 28 25 72 25')!;
    const [x, y, w, h] = thumbDisplayViewBox(small.viewBox);
    expect([w, h]).toEqual([...THUMB_MIN_VIEW]);
    // Centred: the map's own centre stays the centre.
    expect([x + w / 2, y + h / 2]).toEqual([50, 25]);
    const large: [number, number, number, number] = [175, 75, 1356, 896];
    expect(thumbDisplayViewBox(large)).toEqual(large);
    // Wide and flat: only the missing height is added.
    expect(thumbDisplayViewBox([0, 0, 2000, 200])).toEqual([0, -150, 2000, 500]);
    expect(code('components/workspace/MapThumb.tsx')).toContain('thumbDisplayViewBox(parsed.viewBox)');
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

  test('browser storage: the two keys are registered for the Privacy Policy\'s list until its text names them (ADR-123 (7)(i))', () => {
    // Owner decision 14.11.2026: keep both; the lawyer's text is prepared separately. The register is the list that
    // text has to add — a key leaves it once the published privacy texts name it, and never stands in both.
    expect([WORKSPACE_LENS_KEY, WORKSPACE_MODE_KEY]).toEqual(['cc.workspace.lens', 'cc.workspace.mode']);
    const privacy = ['lib/legal/texts/privacy.en.ts', 'lib/legal/texts/privacy.de.ts'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
    for (const key of [WORKSPACE_LENS_KEY, WORKSPACE_MODE_KEY]) {
      const named = privacy.every((text) => text.includes(key));
      expect(named || PRIVACY_PENDING_STORAGE_KEYS.includes(key), `${key} is neither in the privacy texts nor in the register`).toBe(true);
      expect(named && PRIVACY_PENDING_STORAGE_KEYS.includes(key), `${key} is named in the privacy texts: take it off the register`).toBe(false);
    }
    // What they hold: an enum each, written by this module only.
    const prefs = code('lib/workspace-prefs.ts');
    expect(prefs.match(/localStorage\.setItem\(/g) ?? []).toHaveLength(2);
    expect(prefs).toContain('localStorage.setItem(WORKSPACE_LENS_KEY, lens)');
    expect(prefs).toContain('localStorage.setItem(WORKSPACE_MODE_KEY, mode)');
  });

  test('the stored lens, mode and demo mark are read hydration-safe — never in a useState initialiser (14.11.2026)', () => {
    // A storage read in an initialiser gives a server render and its hydration two different trees. The shell renders
    // these views in the browser only, but they no longer depend on it.
    for (const f of ['components/workspace/WorkspaceListReport.tsx', 'components/workspace/HomeFirstView.tsx', 'components/workspace/WorkspaceTiles.tsx']) {
      expect(code(f), f).not.toMatch(/useState(?:<[^>]*>)?\(\s*(?:read\w*|seenTheDemo)\s*\)/);
    }
    expect(code('components/workspace/WorkspaceListReport.tsx')).toContain('useStoredWorkspaceLens()');
    expect(code('components/workspace/HomeFirstView.tsx')).toContain('useSyncExternalStore(noSubscription, seenTheDemo, notSeenOnTheServer)');
    const prefs = code('lib/workspace-prefs.ts');
    expect(prefs).toContain("useSyncExternalStore(noSubscription, readWorkspaceLens, () => 'business' as const)");
    expect(prefs).toContain("useSyncExternalStore(noSubscription, readWorkspaceMode, () => 'tiles' as const)");
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
