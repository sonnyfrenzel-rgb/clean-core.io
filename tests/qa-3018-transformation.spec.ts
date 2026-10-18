import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import firebaseConfig from '../firebase-config.json';
import { requestGenerationLease, type GenerationLease } from '../lib/transformation/lease-client';
import { issueLease, PROJECT_MOVED_REFUSAL } from '../lib/transformation/lease-store';
import { LEASE_COLLECTION, LEASE_WINDOW_COLLECTION } from '../lib/transformation/lease';
import { withContextDigest } from '../lib/project-loader';
import { CONTEXT_STALE_PACKAGE, staleness, testingClosureBasis, workflowSteps } from '../lib/workflow-steps';
import type { Project } from '../lib/types';

/**
 * Roadmap 3.0.18, item 2 — Transformation: Cancel, lease and reload do what
 * the screen says (QA carried findings on the Transformation page, the lease
 * route, `lib/workflow-steps.ts` and the object page). Server-free: the lease
 * client runs against a stand-in `fetch`, the lease store against a stand-in
 * Firestore, the phases are pure, the page and the route are read in source.
 */

const ROOT = path.resolve(__dirname, '..');
/** A file without its comments, so a guard reads code, not prose. */
const code = (rel: string) =>
  fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const PAGE = 'app/(app)/project/[projectId]/transformation/page.tsx';

const LEASE: GenerationLease = { projectId: 'project-1', leaseId: 'lease-1', budget: 10, used: 0, expiresAt: Date.now() + 60_000, maxInFlight: 4 };

test.describe('Cancel ends a pending lease request; a lease granted after it is closed (2894d8c8c601, 1e23c846e6a6, 9830e29be8de, ad9aaaace80d)', () => {
  const realFetch = globalThis.fetch;
  test.beforeAll(() => {
    if (!getApps().length) initializeApp(firebaseConfig);
  });
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** A lease answer that arrives only when `answer()` is called. */
  function heldFetch() {
    let answer: (lease: GenerationLease) => void = () => {};
    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      return new Promise<Response>((resolve) => {
        answer = (lease) => resolve(new Response(JSON.stringify({ lease, reused: false }), { status: 200 }));
      });
    }) as typeof fetch;
    return { answer: (l: GenerationLease) => answer(l), calls: () => calls };
  }

  test('Cancel while the request is pending ends the wait at once, and the late lease is closed, never used', async () => {
    const held = heldFetch();
    const closed: string[] = [];
    const controller = new AbortController();
    const asked = requestGenerationLease('project-1', 'token', 9, 'run-00000001', controller.signal, (l) => closed.push(l.leaseId));
    await new Promise((r) => setTimeout(r, 10));
    expect(held.calls()).toBe(1);
    controller.abort();
    await expect(asked).rejects.toMatchObject({ name: 'AbortError' });
    expect(closed).toEqual([]);
    held.answer(LEASE);
    await new Promise((r) => setTimeout(r, 10));
    expect(closed).toEqual(['lease-1']);
  });

  test('Cancel before the request asks for nothing', async () => {
    const held = heldFetch();
    const controller = new AbortController();
    controller.abort();
    await expect(requestGenerationLease('project-1', 'token', 9, 'run-00000001', controller.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' });
    expect(held.calls()).toBe(0);
  });

  test('without a cancel the lease is handed to the generation and nothing is closed', async () => {
    const held = heldFetch();
    const closed: string[] = [];
    const asked = requestGenerationLease('project-1', 'token', 9, 'run-00000001', new AbortController().signal, (l) => closed.push(l.leaseId));
    await new Promise((r) => setTimeout(r, 10));
    held.answer(LEASE);
    await expect(asked).resolves.toMatchObject({ leaseId: 'lease-1' });
    expect(closed).toEqual([]);
  });

  test('the page asks for the lease under the generation\'s signal', () => {
    const src = code(PAGE);
    const generation = src.slice(src.indexOf('const generateTransformation = useCallback'), src.indexOf('const planPending'));
    expect(generation).toContain('await fetchGenerationDecision(projectId as string, controller.signal);');
    expect(generation).toMatch(/lease = await requestGenerationLease\(projectId as string, generationToken, [^;]*newGenerationRunId\(\), controller\.signal\);/);
  });
});

test.describe('no model call without a lease once the engine planned the run (5ea9956a9e92, e14edce92cfa, fad61e53eba7, 2e0b6b134d13, 4e4d06122fab, 6e70f306bf99, 14876e8e098d, 76c57453c958, 47195a3acafd, 1cf2e306665e)', () => {
  test('a refused lease stops the generation; only a program without a scaffold reaches the single call', () => {
    const src = code(PAGE);
    const generation = src.slice(src.indexOf('const generateTransformation = useCallback'), src.indexOf('const planPending'));
    const catchBlock = generation.slice(generation.indexOf('} catch (leaseErr) {'), generation.indexOf('if (prep.ok) {'));
    // Nothing in the lease's catch lets the run go on.
    expect(catchBlock).not.toContain('fallbackReason');
    expect(catchBlock).toMatch(/throw new Error\(`\$\{e\.message \|\| 'The generation could not be prepared\.'\} Nothing was generated\.`\);/);
    // The single call's only reason is a failed scaffold.
    expect(generation.match(/fallbackReason = /g)).toHaveLength(1);
    expect(generation).toContain('fallbackReason = prep.reason;');
    // The engine-led branch needs the lease, and the single call follows it only for a failed scaffold.
    const engine = generation.slice(generation.indexOf('if (prep.ok) {'));
    expect(engine.slice(0, 300)).toContain("if (!lease) throw new Error(");
    expect(engine.indexOf('return;\n')).toBeLessThan(engine.indexOf("setGenPath('single-call');"));
  });

  test('the single call says what metering it has, not what it does not', () => {
    const raw = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
    const doc = raw.slice(raw.lastIndexOf('/**', raw.indexOf('const runSingleCall = useCallback')), raw.indexOf('const runSingleCall = useCallback'));
    expect(doc).not.toContain('or the lease is refused');
    expect(doc).not.toContain('one proxy call');
    expect(doc).toContain('A refused lease never reaches it');
    expect(doc).toContain('runs without a generation lease');
  });
});

test.describe('a refused contract blocks the start (c7b3dd5d1ead, a6314b4a1a6d)', () => {
  test('the plan read says the refusal and keeps Generate and the automatic start closed', () => {
    const src = code(PAGE);
    const plan = src.slice(src.indexOf('if (!planWanted) return;'));
    const refusal = plan.slice(plan.indexOf('if (!decision.ok) {'), plan.indexOf('if (!generation) {'));
    expect(refusal).toContain('setContractRefusal(decision);');
    expect(src).toContain('const canStart = canGenerate && planBlocked === null && !planPending && contractRefusal === null;');
    // The automatic start reads canStart.
    expect(src).toMatch(/if \(autoStarted\.current \|\| !nothingOpen \|\| !canStart \|\|/);
  });
});

test.describe('the Built-on record is what the generation started from (e5d4b1b69155, 7b6ed629f9d1)', () => {
  test('the basis is taken once, before any model call, and both paths store that snapshot', () => {
    const src = code(PAGE);
    const generation = src.slice(src.indexOf('const generateTransformation = useCallback'), src.indexOf('const planPending'));
    expect(generation.match(/basisNow\(\)/g)).toHaveLength(1);
    const snap = generation.indexOf('const basisAtStart = basisNow();');
    expect(snap).toBeGreaterThan(generation.indexOf('await prepareScaffold('));
    expect(snap).toBeLessThan(generation.indexOf('requestGenerationLease('));
    expect(snap).toBeLessThan(generation.indexOf('await runSingleCall('));
    expect(generation).toContain('basis: basisAtStart,');
    expect(generation).toContain('basis: () => basisAtStart,');
  });
});

test.describe('reload opens an engine-led Node package at its first step (9da3f0a5a528, 539938f7e106, 7842c6a45560, 6659cd6b4d46, bea0b7f4be83, 115844597df8)', () => {
  test('the first step wins over the service file; the service stays the default without a step', () => {
    const src = code(PAGE);
    expect(src).toContain("setSelectedFilePath(firstStep?.path || (hasServiceTs ? 'srv/service.ts' : (parsedFiles[0]?.path || '')));");
    expect(src).not.toContain("setSelectedFilePath(hasServiceTs ? 'srv/service.ts' : (firstStep?.path");
  });
});

test.describe('the lease route (66c30464de2d, ed340b18f2a6, f1814e661cb6, 91bc3fe0c5ee, 2b05ce15001c, 51052c5d2bd8, 658ed8656d3a, 3e00c34d1459, c54f51b42828, 29e80339c0f5, 044ebbb04fd1)', () => {
  const src = code('app/api/transformation/lease/route.ts');

  test('a run id is required: a new run and a retry are never the same request', () => {
    expect(src).toMatch(/if \(!\(isRunId\(runId\) && isFirestoreId\(runId\)\)\) \{\s*return NextResponse\.json\([^)]*runId[^)]*\{ status: 400 \}\);/);
    expect(src).not.toContain('runId !== undefined');
    expect(src).not.toContain('isRunId(runId) ? runId : null');
  });

  test('a charge confirmation that finds no open lease is a failure, not a lease', () => {
    const confirm = src.slice(src.indexOf('const paid = await confirmLeaseCharge('));
    expect(confirm).toMatch(/^const paid = await confirmLeaseCharge\([^;]*;\s*if \(!paid \|\| paid\.status !== 'open'\) \{\s*return NextResponse\.json\(\s*\{[^}]*code: LEASE_CODES\.closed \},\s*\{ status: 409 \},/);
    expect(src).toContain('leaseView(paid), reused: false');
    expect(src).not.toContain('paid ?? outcome.lease');
  });

  test('the lease is issued against the project version whose token was checked', () => {
    const issue = src.slice(src.indexOf('await issueLease(db, {'));
    expect(issue.slice(0, 400)).toContain('against: { ref: snap.ref, updateTime: snap.updateTime },');
  });
});

/* ------------------------------------------------ a stand-in Firestore, for issueLease */

class FakeTimestamp {
  constructor(readonly n: number) {}
  isEqual(other: FakeTimestamp) {
    return other instanceof FakeTimestamp && other.n === this.n;
  }
}

function fakeDb(projectVersion: { n: number }) {
  const docs = new Map<string, Record<string, unknown>>();
  let auto = 0;
  const docRef = (p: string) => ({ kind: 'doc' as const, path: p, id: p.split('/').pop()! });
  const collection = (p: string) => ({
    doc: (id?: string) => {
      if (id && id.includes('/')) throw new Error('nested ids are not supported');
      const ref = docRef(`${p}/${id ?? `auto-${++auto}`}`);
      return Object.assign(ref, { collection: (c: string) => collection(`${ref.path}/${c}`) });
    },
    where: (field: string, _op: string, value: unknown) => ({ kind: 'query' as const, prefix: `${p}/`, field, value }),
  });
  type Ref = ReturnType<typeof docRef>;
  type Query = { kind: 'query'; prefix: string; field: string; value: unknown };
  const snapOf = (ref: Ref) => {
    const data = docs.get(ref.path);
    return {
      exists: data !== undefined,
      data: () => data,
      updateTime: ref.path.startsWith('projects/') && ref.path.split('/').length === 2 ? new FakeTimestamp(projectVersion.n) : undefined,
    };
  };
  const tx = {
    get: async (target: Ref | Query) => {
      if (target.kind === 'doc') return snapOf(target);
      const matches = [...docs.entries()].filter(
        ([k, v]) => k.startsWith(target.prefix) && !k.slice(target.prefix.length).includes('/') && v[target.field] === target.value,
      );
      return { docs: matches.map(([, v]) => ({ data: () => v })) };
    },
    create: (ref: Ref, data: Record<string, unknown>) => docs.set(ref.path, data),
    set: (ref: Ref, data: Record<string, unknown>) => docs.set(ref.path, data),
    update: (ref: Ref, data: Record<string, unknown>) => docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data }),
  };
  const db = { collection, runTransaction: <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx) };
  docs.set('projects/p1', { userId: 'u1' });
  return { db: db as never, docs, projectRef: db.collection('projects').doc('p1') as never };
}

test.describe('issueLease re-checks the project in its transaction (044ebbb04fd1)', () => {
  const args = { projectId: 'p1', uid: 'u1', generationToken: 'token', runId: 'run-00000001', plannedCalls: 9, now: Date.now(), charged: false };

  test('the project as it was checked: issued', async () => {
    const version = { n: 1 };
    const { db, docs, projectRef } = fakeDb(version);
    const outcome = await issueLease(db, { ...args, against: { ref: projectRef, updateTime: new FakeTimestamp(1) as never } });
    expect(outcome.kind).toBe('issued');
    expect([...docs.keys()].some((k) => k.startsWith(`projects/p1/${LEASE_COLLECTION}/`))).toBe(true);
  });

  test('the project changed after its token was checked: no lease, no window entry', async () => {
    const version = { n: 2 };
    const { db, docs, projectRef } = fakeDb(version);
    const outcome = await issueLease(db, { ...args, against: { ref: projectRef, updateTime: new FakeTimestamp(1) as never } });
    expect(outcome).toEqual(PROJECT_MOVED_REFUSAL);
    expect([...docs.keys()].some((k) => k.startsWith(`projects/p1/${LEASE_COLLECTION}/`))).toBe(false);
    expect(docs.has(`${LEASE_WINDOW_COLLECTION}/u1`)).toBe(false);
  });
});

/* ------------------------------------------------ Testing follows a changed generation context */

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const PACKAGE = JSON.stringify([{ path: 'src/zcl_sd_price.clas.abap', content: 'CLASS zcl_sd_price DEFINITION PUBLIC. ENDCLASS.' }]);

function tested(current: string): Project {
  return withContextDigest(
    {
      id: 'p1',
      name: 'SD pricing',
      userId: 'owner',
      legacyCode: 'REPORT z_sd_price.\nWRITE 1.',
      activeRunId: 'run-1',
      extensibilityRoute: 'Developer Extensibility (ABAP Cloud)',
      solutionDesign: 'design',
      approvedByArchitect: true,
      generatedCode: PACKAGE,
      generationBinding: { path: 'engine-led', contextDigest: A, engine: null, basis: [] },
      testSuite: { code: 'CLASS ltcl_test DEFINITION FOR TESTING. ENDCLASS.' },
      testCases: [{ id: 'TC_01', name: 'Case 1' }],
    } as unknown as Project,
    current,
  );
}

test.describe('a changed generation context makes Testing stale (eb4c435754b7, cac5ee0ed7ec, 9cd3102500c2, 815e7596cdd7, f8db029e677c)', () => {
  const testing = (p: Project) => workflowSteps(p).find((s) => s.key === 'testing')!;

  test('the same context: Testing is not stale and may be closed (ABAP Unit, no runner here)', () => {
    const p = tested(A);
    expect(testing(p).state).not.toBe('stale');
    expect(testingClosureBasis(p)).toMatchObject({ ok: true });
  });

  test('a moved context: Testing is stale, said as such, and its closure is refused', () => {
    const p = tested(B);
    expect(staleness(p)).toMatchObject({ context: true, tests: false });
    expect(testing(p)).toMatchObject({ state: 'stale', done: false });
    expect(testing(p).detail).toBe(`Test cases written for ${CONTEXT_STALE_PACKAGE} — regenerate the code, then the suite.`);
    expect(testingClosureBasis(p)).toEqual({
      ok: false,
      code: 'suite-stale',
      error: `The test suite was written for ${CONTEXT_STALE_PACKAGE}. Regenerate the code, then the suite.`,
    });
  });
});

test.describe('package rows keep a visible disclosure cue (fb9cd8006c9b, 36725b031fd5, da6b3037fd10, efc35f8aa511, 90c2b0e1fcc1, 88602eecbd4e)', () => {
  test('each row\'s summary hides the native marker only beside a chevron that turns when it opens', () => {
    const src = code('components/transformation/TransformationObjectPage.tsx');
    const row = src.slice(src.indexOf('<details className="group">'), src.indexOf('</summary>', src.indexOf('<details className="group">')));
    expect(row).toContain('[&::-webkit-details-marker]:hidden');
    expect(row).toMatch(/<ChevronRight [^>]*aria-hidden=\{true\}[^>]*group-open:rotate-90[^>]*data-package-disclosure="" \/>/);
  });
});
