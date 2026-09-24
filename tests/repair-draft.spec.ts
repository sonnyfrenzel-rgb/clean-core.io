import { test, expect } from '@playwright/test';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import {
  REPAIR_DRAFT_COLLECTION,
  buildRepairDraft,
  candidateDigests,
  computeDraftDigest,
  decideAdoption,
  isIntactRepairDraft,
  projectRevision,
  repairBaseDigests,
  type RepairDraft,
  type RepairDraftExecution,
} from '../lib/repair-draft';
import { adoptRepairDraft, loadDraftForRun, proposeRepairDraft, recordDraftExecution } from '../lib/repair-draft-store';
import { coveringTestRunReceipt, testRunSubject, TEST_RUN_RECEIPT_VERSION, type TestRunReceipt } from '../lib/test-receipt';
import { parseGeneratedPackage } from '../lib/generated-package';

/**
 * Roadmap 8.7 (CR-10) — repair drafts on the server.
 *
 * The first half runs the decisions (`lib/repair-draft.ts`) without Firestore.
 * The second half runs the transactions (`lib/repair-draft-store.ts`) with the
 * Admin SDK against the Firestore emulator, the way `/api/projects/{id}/repair-drafts`
 * and `/api/run-tests` call them — no server, no browser. What it cannot reach is
 * the sandbox itself executing a draft; that is `tests/repair-draft-runner.spec.ts`.
 */

const PKG = JSON.stringify([
  { path: 'srv/service.ts', content: 'export const add = (a: number, b: number) => a + b;' },
  { path: 'srv/broken.ts', content: 'export const mul = (a: number, b: number) => a * b:' },
  { path: 'db/schema.cds', content: 'entity X {}' },
]);
const SUITE = "import { add } from './srv/service';\ntest('TC_001', () => {});";
const CASES = [{ id: 'TC_001', name: 'adds', status: 'Failed', message: 'x' }];

const project = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  userId: 'owner',
  activeRunId: 'run-1',
  generatedCode: PKG,
  testSuite: { code: SUITE, framework: 'node:test' },
  testCases: CASES,
  ...over,
});

const baseFrom = (p: Record<string, unknown>) => ({
  code: p.generatedCode as string,
  suite: (p.testSuite as { code: string }).code,
  parent: projectRevision(p),
  parentDraftId: null,
  depth: 0,
});

const repairBody = (p: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  ...repairBaseDigests(p),
  expectedCodeDigest: repairBaseDigests(p).codeDigest,
  expectedSuiteDigest: repairBaseDigests(p).suiteDigest,
  target: { kind: 'package', index: 1, path: 'srv/broken.ts' },
  content: 'export const mul = (a: number, b: number) => a * b;',
  ...over,
});

const actor = { uid: 'owner', now: '2026-09-24T10:00:00.000Z', projectId: 'p1' };

function cut(p: Record<string, unknown>, over: Record<string, unknown> = {}): RepairDraft {
  const built = buildRepairDraft(repairBody(p, over), baseFrom(p), actor);
  if (!built.ok) throw new Error(`${built.code}: ${built.error}`);
  return { ...built.draft, draftId: 'd1' };
}

/** The receipt `/api/run-tests` writes for a draft run — built the way the route builds it. */
function draftReceipt(p: Record<string, unknown>, d: RepairDraft, over: Partial<TestRunReceipt> = {}): TestRunReceipt {
  const subject = testRunSubject(p);
  return {
    v: TEST_RUN_RECEIPT_VERSION,
    runId: subject.runId,
    codeDigest: d.codeDigest,
    suiteDigest: d.suiteDigest,
    casesDigest: subject.casesDigest,
    environment: 'mock',
    scope: { selected: null, cases: 1 },
    stubs: [],
    executedAt: '2026-09-24T10:01:00.000Z',
    executedBy: 'owner',
    exitCode: 0,
    verdicts: [{ id: 'TC_001', status: 'Passed' }],
    draft: { id: d.draftId, digest: d.draftDigest },
    ...over,
  };
}

const execution = (p: Record<string, unknown>, d: RepairDraft, over: Partial<TestRunReceipt> = {}): RepairDraftExecution => ({
  receipt: draftReceipt(p, d, over),
  testResults: [{ id: 'TC_001', name: 'adds', status: 'Passed' }],
});

/* ================================================================ decisions */

test.describe('a draft is cut from what the server holds', () => {
  test('one file of the package is replaced, every other file and the suite come through untouched', () => {
    const p = project();
    const d = cut(p);
    const files = parseGeneratedPackage(d.generatedCode)!;
    const before = parseGeneratedPackage(PKG)!;
    expect(files.map((f) => f.path)).toEqual(before.map((f) => f.path));
    expect(files[0]).toEqual(before[0]);
    expect(files[2]).toEqual(before[2]);
    expect(files[1].content).toBe('export const mul = (a: number, b: number) => a * b;');
    expect(d.suiteCode).toBe(SUITE);
    expect(d.parent).toEqual(projectRevision(p));
    expect(d.parentDraftId).toBeNull();
    expect({ codeDigest: d.codeDigest, suiteDigest: d.suiteDigest }).toEqual(candidateDigests(d.generatedCode, d.suiteCode));
    expect(d.draftDigest).toBe(computeDraftDigest(d));
    expect(isIntactRepairDraft({ ...d })).toBe(true);
  });

  test('a draft whose content no longer hashes to its digests is not intact', () => {
    const d = cut(project());
    expect(isIntactRepairDraft({ ...d, generatedCode: d.generatedCode + ' ' })).toBe(false);
    expect(isIntactRepairDraft({ ...d, parent: { ...d.parent, codeDigest: 'x' } })).toBe(false);
    expect(isIntactRepairDraft({ ...d, v: 99 })).toBe(false);
  });

  test('a repair of something other than what is stored is refused with a sentence', () => {
    const p = project();
    const moved = buildRepairDraft(repairBody(p, { expectedCodeDigest: 'f'.repeat(64) }), baseFrom(p), actor);
    expect(moved).toMatchObject({ ok: false, status: 409, code: 'base-moved' });
    expect((moved as { error: string }).error).toMatch(/Nothing was drafted/);

    const wrongFile = buildRepairDraft(repairBody(p, { target: { kind: 'package', index: 1, path: 'srv/service.ts' } }), baseFrom(p), actor);
    expect(wrongFile).toMatchObject({ ok: false, status: 409, code: 'file-moved' });

    const wholePackage = buildRepairDraft(repairBody(p, { target: { kind: 'module' } }), baseFrom(p), actor);
    expect(wholePackage).toMatchObject({ ok: false, status: 409, code: 'is-a-package' });

    const same = buildRepairDraft(repairBody(p, { content: parseGeneratedPackage(PKG)![1].content }), baseFrom(p), actor);
    expect(same).toMatchObject({ ok: false, status: 422, code: 'no-change' });

    const empty = buildRepairDraft(repairBody(p, { content: '   ' }), baseFrom(p), actor);
    expect(empty).toMatchObject({ ok: false, status: 400, code: 'empty-repair' });
  });

  test('a suite repair replaces the suite and leaves the code alone', () => {
    const p = project();
    const d = cut(p, { target: { kind: 'test' }, content: SUITE + '\n// fixed' });
    expect(d.generatedCode).toBe(PKG);
    expect(d.suiteCode).toBe(SUITE + '\n// fixed');
  });
});

test.describe('adoption is a compare-and-swap', () => {
  test('an adopted draft puts exactly the executed code on the project, and its receipt covers it', () => {
    const p = project();
    const d = cut(p);
    const out = decideAdoption({ draftId: d.draftId, expectedDraftDigest: d.draftDigest }, p, {
      draft: d,
      execution: execution(p, d),
      adoptedAt: undefined,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.fields.generatedCode).toBe(d.generatedCode);
    expect(out.fields.testSuite, 'the suite did not change, so it is not rewritten').toBeUndefined();
    const after = { ...p, ...out.fields };
    // The whole point: after the swap the receipt that names the draft covers the project.
    const covering = coveringTestRunReceipt(after);
    expect(covering, 'the receipt covers what the project now holds').not.toBeNull();
    expect(covering!.draft).toEqual({ id: d.draftId, digest: d.draftDigest });
    expect((after.testCases as Array<{ status: string }>)[0].status).toBe('Passed');
  });

  test('nothing is adopted before a run shows the draft compiles', () => {
    const p = project();
    const d = cut(p);
    const out = decideAdoption({ draftId: d.draftId, expectedDraftDigest: d.draftDigest }, p, { draft: d, execution: undefined, adoptedAt: undefined });
    expect(out).toMatchObject({ ok: false, status: 409, code: 'not-executed' });
  });

  test('a project that moved since the draft was cut refuses, and names what moved', () => {
    const p = project();
    const d = cut(p);
    const exec = execution(p, d);
    const moved = project({ generatedCode: PKG.replace('entity X', 'entity Y') });
    const out = decideAdoption({ draftId: d.draftId, expectedDraftDigest: d.draftDigest }, moved, { draft: d, execution: exec, adoptedAt: undefined });
    expect(out).toMatchObject({ ok: false, status: 409, code: 'parent-moved' });
    expect((out as { error: string }).error).toContain('the generated code');
    expect((out as { error: string }).error).toContain('Nothing was adopted');

    const newRun = project({ activeRunId: 'run-2' });
    expect(decideAdoption({ draftId: d.draftId, expectedDraftDigest: d.draftDigest }, newRun, { draft: d, execution: exec, adoptedAt: undefined }))
      .toMatchObject({ ok: false, code: 'parent-moved' });
  });

  test('a receipt that did not execute this draft is not carried over', () => {
    const p = project();
    const d = cut(p);
    const wrongCode = execution(p, d, { codeDigest: testRunSubject(p).codeDigest });
    expect(decideAdoption({ draftId: d.draftId, expectedDraftDigest: d.draftDigest }, p, { draft: d, execution: wrongCode, adoptedAt: undefined }))
      .toMatchObject({ ok: false, code: 'receipt-mismatch' });
    const noDraftClaim = execution(p, d, { draft: undefined });
    expect(decideAdoption({ draftId: d.draftId, expectedDraftDigest: d.draftDigest }, p, { draft: d, execution: noDraftClaim, adoptedAt: undefined }))
      .toMatchObject({ ok: false, code: 'receipt-mismatch' });
  });

  test('the reader names the draft they saw, and it is adopted once', () => {
    const p = project();
    const d = cut(p);
    const exec = execution(p, d);
    expect(decideAdoption({ draftId: d.draftId, expectedDraftDigest: 'nope' }, p, { draft: d, execution: exec, adoptedAt: undefined }))
      .toMatchObject({ ok: false, code: 'draft-mismatch' });
    expect(decideAdoption({ draftId: d.draftId }, p, { draft: d, execution: exec, adoptedAt: undefined }))
      .toMatchObject({ ok: false, status: 400, code: 'missing-draft-digest' });
    expect(decideAdoption({ draftId: d.draftId, expectedDraftDigest: d.draftDigest }, p, { draft: d, execution: exec, adoptedAt: '2026-09-24T10:02:00.000Z' }))
      .toMatchObject({ ok: false, code: 'already-adopted' });
  });
});

/* ============================================ transactions, Firestore emulator */

const db = (): Firestore => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

async function seed(over: Record<string, unknown> = {}) {
  const id = `repair-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await db().collection('projects').doc(id).set(project(over));
  return id;
}

const draftsOf = (projectId: string) => db().collection('projects').doc(projectId).collection(REPAIR_DRAFT_COLLECTION);

test.describe('the store, against the Firestore emulator', () => {
  test.describe.configure({ mode: 'serial' });

  test('propose → run → adopt: the project ends up holding the draft and a receipt that covers it', async () => {
    const projectId = await seed();
    const stored = project();
    const proposed = await proposeRepairDraft(db(), { projectId, uid: 'owner', body: repairBody(stored), now: actor.now });
    expect(proposed.status).toBe(200);
    if (!('draft' in proposed)) return;
    const d = proposed.draft;

    const onDisk = (await draftsOf(projectId).doc(d.draftId).get()).data()!;
    expect(isIntactRepairDraft(onDisk), 'the draft on disk is the draft that was cut').toBe(true);

    const loaded = await loadDraftForRun(db(), { projectId, uid: 'owner', draftId: d.draftId });
    expect(loaded.status).toBe(200);

    // Early adoption: nothing ran yet.
    const early = await adoptRepairDraft(db(), {
      projectId, uid: 'owner', body: { draftId: d.draftId, expectedDraftDigest: d.draftDigest }, now: new Date(), actorEmail: 'o@x',
    });
    expect(early).toMatchObject({ status: 409, code: 'not-executed' });

    // What the runner does after a compiled run of the draft.
    expect(await recordDraftExecution(db(), { projectId, draftId: d.draftId, execution: execution(stored, d) })).toBe(true);
    const projectBefore = (await db().collection('projects').doc(projectId).get()).data()!;
    expect(projectBefore.generatedCode, 'running a draft writes nothing to the project').toBe(PKG);
    expect(projectBefore.testRunReceipt).toBeUndefined();

    const adopted = await adoptRepairDraft(db(), {
      projectId, uid: 'owner', body: { draftId: d.draftId, expectedDraftDigest: d.draftDigest }, now: new Date(), actorEmail: 'o@x',
    });
    expect(adopted.status).toBe(200);

    const after = (await db().collection('projects').doc(projectId).get()).data()!;
    expect(after.generatedCode).toBe(d.generatedCode);
    expect(coveringTestRunReceipt(after)?.draft).toEqual({ id: d.draftId, digest: d.draftDigest });
    expect((await draftsOf(projectId).doc(d.draftId).get()).data()!.adoptedAt).toBeTruthy();
    const journal = await db().collection('audit_events').where('action', '==', `PROJECT_REPAIR_DRAFT_ADOPTED:${projectId}:${d.draftId}`).get();
    expect(journal.size).toBe(1);

    const again = await adoptRepairDraft(db(), {
      projectId, uid: 'owner', body: { draftId: d.draftId, expectedDraftDigest: d.draftDigest }, now: new Date(), actorEmail: 'o@x',
    });
    expect(again).toMatchObject({ status: 409, code: 'already-adopted' });
    expect(await loadDraftForRun(db(), { projectId, uid: 'owner', draftId: d.draftId })).toMatchObject({ status: 409 });
    expect(await recordDraftExecution(db(), { projectId, draftId: d.draftId, execution: execution(stored, d) })).toBe(false);
  });

  test('a write between run and adoption wins, and the draft is refused', async () => {
    const projectId = await seed();
    const stored = project();
    const proposed = await proposeRepairDraft(db(), { projectId, uid: 'owner', body: repairBody(stored), now: actor.now });
    if (!('draft' in proposed)) throw new Error(proposed.error);
    const d = proposed.draft;
    await recordDraftExecution(db(), { projectId, draftId: d.draftId, execution: execution(stored, d) });

    // Another tab regenerates the code.
    const regenerated = PKG.replace('entity X', 'entity Z');
    await db().collection('projects').doc(projectId).update({ generatedCode: regenerated });

    const out = await adoptRepairDraft(db(), {
      projectId, uid: 'owner', body: { draftId: d.draftId, expectedDraftDigest: d.draftDigest }, now: new Date(), actorEmail: 'o@x',
    });
    expect(out).toMatchObject({ status: 409, code: 'parent-moved' });
    const after = (await db().collection('projects').doc(projectId).get()).data()!;
    expect(after.generatedCode, 'the newer state is kept, not overwritten by the draft').toBe(regenerated);
    expect(after.testRunReceipt).toBeUndefined();
  });

  test('a repair on a repair descends from the same project revision', async () => {
    const projectId = await seed();
    const stored = project();
    const first = await proposeRepairDraft(db(), {
      projectId, uid: 'owner', body: repairBody(stored, { content: 'export const mul = (a: number, b: number) => a * b; //1' }), now: actor.now,
    });
    if (!('draft' in first)) throw new Error(first.error);
    const d1 = first.draft;
    const second = await proposeRepairDraft(db(), {
      projectId,
      uid: 'owner',
      body: {
        parentDraftId: d1.draftId,
        ...candidateDigests(d1.generatedCode, d1.suiteCode),
        expectedCodeDigest: d1.codeDigest,
        expectedSuiteDigest: d1.suiteDigest,
        target: { kind: 'test' },
        content: SUITE + '\n// 2',
      },
      now: actor.now,
    });
    expect(second.status).toBe(200);
    if (!('draft' in second)) return;
    expect(second.draft.parentDraftId).toBe(d1.draftId);
    expect(second.draft.parent).toEqual(d1.parent);
    expect(second.draft.generatedCode, 'built on the first draft, not on the project').toBe(d1.generatedCode);
    expect(second.draft.depth).toBe(2);
  });

  test('another account reaches no draft and cuts none', async () => {
    const projectId = await seed();
    const stored = project();
    expect(await proposeRepairDraft(db(), { projectId, uid: 'stranger', body: repairBody(stored), now: actor.now }))
      .toMatchObject({ status: 404 });
    const proposed = await proposeRepairDraft(db(), { projectId, uid: 'owner', body: repairBody(stored), now: actor.now });
    if (!('draft' in proposed)) throw new Error(proposed.error);
    expect(await loadDraftForRun(db(), { projectId, uid: 'stranger', draftId: proposed.draft.draftId })).toMatchObject({ status: 404 });
    expect(
      await adoptRepairDraft(db(), {
        projectId, uid: 'stranger', body: { draftId: proposed.draft.draftId, expectedDraftDigest: proposed.draft.draftDigest }, now: new Date(), actorEmail: 's@x',
      }),
    ).toMatchObject({ status: 404 });
  });
});
