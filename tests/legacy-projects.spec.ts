import { test, expect } from '@playwright/test';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { hydrateProject, type RunRead } from '../lib/project-loader';
import { recordGaps, HISTORICAL_FORMS } from '../lib/legacy-project';
import { legacyForms, seedLegacyForms, storedFingerprint } from './helpers/legacy-forms';
import {
  META_ABSENT,
  metaLine,
  notDetermined,
  workspaceLayers,
  workspaceStatusLine,
  workspaceTools,
} from '../lib/workspace-model';
import { workflowSteps } from '../lib/workflow-steps';
import { nextOpenPoint } from '../lib/next-step';
import { buildFirstLook } from '../lib/first-look';
import { managementAnswers, runHistoryEntry, type RunHistoryEntry } from '../lib/management-answers';
import { buildWorkspaceSearchIndex, searchWorkspace } from '../lib/workspace-search';
import { verifyRunIntegrity } from '../lib/run-signature';
import type { Project } from '../lib/types';

/**
 * Roadmap 3.0.2 — existing projects open in the workspace without losing IDs,
 * runs or signatures (C23-A02).
 *
 * Every community project was stored by *some* version of this product, and the
 * workspace opens it in that shape: nothing is migrated on the way in, no run is
 * minted, no signature is touched. So the question this spec asks, form by form,
 * is not "does it look right" but three narrower ones:
 *
 *   1. **Does it open?** Every derivation the workspace renders — meta line,
 *      seven statuses, six layers, the tools, *Not determined*, the next step,
 *      the first look, Management's answers, the search index — runs on the
 *      document exactly as it comes out of Firestore, through the loader's own
 *      hydration (`hydrateProject`), without throwing.
 *   2. **Does it tell the truth about what is missing?** What an old form does
 *      not carry comes back as *not determined* with a reason
 *      (`lib/legacy-project.ts`) — never as `0`, `undefined` or a success.
 *   3. **Is the record untouched?** The project and its runs have the same
 *      update time before and after, and every seeded signature still verifies.
 *
 * The forms are the ones the code itself records — the version comments in
 * `lib/types.ts` and `lib/types/analysis-run.ts`, the fallbacks in
 * `lib/project-loader.ts`, `lib/workflow-steps.ts` and
 * `lib/management-answers.ts` — seeded through the Admin SDK into the Firestore
 * emulator, the way they sit in production. No page and no route: the rendered
 * half is `tests/legacy-projects-page.spec.ts`, which needs the app server.
 */

const SIGNING_KEY = 'test-legacy-projects-spec-signing-key';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const pid = (form: string) => `legacy-${form}-${stamp}`;

let db: Firestore;
const FORMS = legacyForms({ owner: 'legacy-owner-uid', key: SIGNING_KEY, pid });

/** What the loader would read — the same three outcomes, from the Admin SDK instead of the client. */
async function openLikeTheLoader(projectId: string): Promise<Project> {
  const snap = await db.doc(`projects/${projectId}`).get();
  const data = snap.data() as Project;
  let run: RunRead | null = null;
  if (data.activeRunId) {
    const runSnap = await db.doc(`projects/${projectId}/runs/${data.activeRunId}`).get();
    run = runSnap.exists ? { kind: 'found', data: runSnap.data() as Record<string, unknown> } : { kind: 'missing' };
  }
  return hydrateProject(snap.id, data, run);
}

/** Every string a derivation hands to the screen, flattened. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

/** Everything the workspace derives on open — the shell, its cards, and the search index. */
function openWorkspace(projectId: string, project: Project, history: RunHistoryEntry[]) {
  const reading = null;
  const open = notDetermined(project);
  const index = buildWorkspaceSearchIndex({ projectId, project, reading });
  return {
    meta: metaLine(project, projectId),
    statuses: workspaceStatusLine(project),
    layers: workspaceLayers(project),
    tools: workspaceTools(project),
    open,
    gaps: recordGaps(project),
    next: nextOpenPoint(project, null),
    firstLook: buildFirstLook(project),
    management: managementAnswers(project, history, open),
    search: [
      ...searchWorkspace(index, { projectId, legacyCode: project.legacyCode }, 'Z'),
      ...searchWorkspace(index, { projectId, legacyCode: project.legacyCode }, 'L5'),
      ...searchWorkspace(index, { projectId, legacyCode: project.legacyCode }, 'finding'),
    ],
  };
}

test.describe('historical project forms open in the workspace, unchanged', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const adminApp = getAdminApps()[0] ?? initAdminApp({ projectId: firebaseConfig.projectId });
    db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
    await seedLegacyForms(db, FORMS, pid);
  });

  test('every form the code names is covered by a fixture', () => {
    const covered = new Set(Object.values(FORMS).flatMap((f) => f.gaps));
    for (const form of HISTORICAL_FORMS) expect(covered, `no fixture carries ${form}`).toContain(form);
  });

  for (const [key, form] of Object.entries(FORMS)) {
    test(`${key}: ${form.name}`, async () => {
      const id = pid(key);
      const before = await storedFingerprint(db, id);

      const project = await openLikeTheLoader(id);
      const runs = await db.collection(`projects/${id}/runs`).get();
      const history = runs.docs
        .map((d) => runHistoryEntry(d.data()))
        .filter((e): e is RunHistoryEntry => e !== null);

      // 1 — it opens: nothing throws on the stored shape.
      const ws = openWorkspace(id, project, history);

      // The id is the document's, whatever the document carries.
      expect(project.id).toBe(id);
      expect(ws.meta.find((m) => m.key === 'project')?.value).toBe(id);

      // 2 — what it does not carry is named, with a reason, and only that.
      expect(ws.gaps.map((g) => g.form).sort()).toEqual([...form.gaps].sort());
      for (const gap of ws.gaps) {
        expect(gap.why.length, `${gap.form} has no reason`).toBeGreaterThan(40);
        expect(gap.why).toContain('not determined');
      }

      const provenance = ws.statuses.find((s) => s.facet === 'provenance')!;
      expect(provenance.status).toBe(form.provenance);

      // Nothing reaches the screen as `undefined`, `NaN` or `[object Object]`.
      for (const s of strings(ws)) {
        expect(s, `a derived string on ${key}`).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]/);
      }
      for (const status of ws.statuses) expect(status.detail.trim().length).toBeGreaterThan(0);
      // A layer's count and its rows are one fact.
      for (const layer of ws.layers) {
        expect(layer.count === null, `${layer.key} on ${key}`).toBe(layer.rows.length === 0);
        if (layer.count === null) expect(layer.missing.trim().length).toBeGreaterThan(0);
        for (const row of layer.rows) {
          expect(row.label.trim().length).toBeGreaterThan(0);
          expect(row.value.trim().length).toBeGreaterThan(0);
        }
      }

      // Absent is a word, never a zero: a meta value nobody recorded is `null`,
      // which the meta line prints as META_ABSENT.
      for (const entry of ws.meta) expect(entry.value === null || entry.value.trim().length > 0).toBe(true);
      expect(META_ABSENT).toBe('not recorded');

      // Green only where something signed it.
      const steps = workflowSteps(project);
      const hasReadableRun = Boolean(form.run);
      expect(steps.find((s) => s.key === 'analyze')!.proven).toBe(hasReadableRun);
      expect(steps.find((s) => s.key === 'testing')!.proven, 'a pass without a receipt painted green').toBe(false);

      // 3 — the record is untouched, and every seeded signature still verifies.
      expect(await storedFingerprint(db, id)).toEqual(before);
      for (const d of runs.docs) {
        expect(verifyRunIntegrity(d.data(), SIGNING_KEY), `run ${d.id} of ${key}`).toEqual({ valid: true });
      }
    });
  }

  test('a run that cannot be read is not a signed run on screen', async () => {
    const project = await openLikeTheLoader(pid('dangling-run'));
    expect(project._runLoadFailed).toBe(true);

    const ws = openWorkspace(pid('dangling-run'), project, []);
    const analyze = workflowSteps(project).find((s) => s.key === 'analyze')!;
    expect(analyze.state).toBe('partial');
    expect(analyze.badge).toBe('Run unreadable');

    const evidence = ws.layers.find((l) => l.key === 'evidence')!;
    expect(evidence.count).toBeNull();
    expect(evidence.provenance).toBe('not-determined');
    expect(evidence.missing).toContain('could not be read');
    expect(ws.layers.find((l) => l.key === 'costs')!.count).toBeNull();

    // The score on the document is not the run's score: Management says it is
    // not determined rather than printing the stored 39.
    expect(ws.management.trend.score).toBeNull();
    expect(ws.gaps[0].why).toContain('run-that');
  });

  test('an analysis from before signed runs is not shown as a result', async () => {
    const project = await openLikeTheLoader(pid('before-signed-runs'));
    const ws = openWorkspace(pid('before-signed-runs'), project, []);

    // The stored "completed" is not read; the stored 48 is not a score.
    expect(ws.statuses.find((s) => s.facet === 'provenance')!.detail).toContain('no signed run');
    expect(ws.layers.find((l) => l.key === 'evidence')!.count).toBeNull();
    expect(ws.layers.find((l) => l.key === 'costs')!.count).toBeNull();
    expect(ws.management.trend.score).toBeNull();
    // Two passes without a receipt are self-reported, never proven.
    expect(workflowSteps(project).find((s) => s.key === 'testing')!.badge).toBe('Self-reported');
    // The first look's finding count is "not analysed", not the stored worklist's 1.
    const findings = ws.firstLook.stages[0].figures.find((f) => f.key === 'findings');
    expect(findings?.value).toBeNull();
  });

  test('a run signed before the input manifest says its inputs are not recorded', async () => {
    const project = await openLikeTheLoader(pid('run-v110'));
    const ws = openWorkspace(pid('run-v110'), project, []);
    for (const key of ['manifest', 'revision', 'engine', 'rules', 'catalog']) {
      expect(ws.meta.find((m) => m.key === key)?.value, key).toBeNull();
    }
    // No manifest is not a mismatch: the run is not made stale after the fact.
    expect(workflowSteps(project).find((s) => s.key === 'analyze')!.state).toBe('done');
    // A Timestamp where a string used to be is skipped, not printed.
    expect(ws.layers.find((l) => l.key === 'evidence')!.rows.map((r) => r.key)).toEqual(['run', 'fingerprint']);
  });

  test('a dependency whose owner is not recorded is not called an SAP table', async () => {
    const project = await openLikeTheLoader(pid('malformed-lists'));
    const rows = workspaceLayers(project).find((l) => l.key === 'architecture')!;
    const all = [...rows.rows];
    expect(all.find((r) => r.label === '/ACME/T_ORDER')?.value).toBe('Write · ownership not determined');
    const legacy = await openLikeTheLoader(pid('before-signed-runs'));
    const legacyRows = workspaceLayers(legacy).find((l) => l.key === 'architecture')!.rows;
    expect(legacyRows.find((r) => r.label === 'EKKO')?.value).toBe('Read · ownership not recorded');
    expect(legacyRows.find((r) => r.label === 'ZPO_RELEASE')?.value).toBe('Write · custom table');
  });

  test('the current form carries no gap — the control', async () => {
    const project = await openLikeTheLoader(pid('current'));
    expect(recordGaps(project)).toEqual([]);
    expect(metaLine(project, pid('current')).find((m) => m.key === 'manifest')?.value).toMatch(/^[0-9a-f]{8}$/);
  });
});
