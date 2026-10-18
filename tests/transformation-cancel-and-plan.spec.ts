import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import firebaseConfig from '../firebase-config.json';
import { fetchGenerationDecision } from '../lib/generation-contract-client';

/**
 * The Transformation start and its Cancel — QA review of 9056c6a018b4, shipped
 * with the QA leftovers of hotfix 2 (roadmap 3.0.13):
 *
 *   - *Cancel* while the contract is read ends that read: the generation's
 *     signal reaches `fetchGenerationDecision`, and an aborted read is a cancel
 *     (`AbortError`), never a refusal the screen would show as the contract's
 *     answer. Since 3.0.18 the lease request is under the same signal: the wait
 *     ends at once, and a lease that arrives after the cancel is closed by the
 *     client (`tests/qa-3018-transformation.spec.ts`);
 *   - *Generate* waits until the plan before the click has loaded: `canStart`
 *     is false while it is read, and after a generation, until it is read again.
 *
 * Server-free: the client function runs against a stand-in `fetch`; the page is
 * read in its source.
 */

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'app/(app)/project/[projectId]/transformation/page.tsx');
const page = () =>
  fs.readFileSync(PAGE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

test.describe('the contract read under the generation\'s signal', () => {
  const realFetch = globalThis.fetch;
  test.beforeAll(() => {
    if (!getApps().length) initializeApp(firebaseConfig);
  });
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** A fetch that answers only when told, and honours its signal as the browser's does. */
  function pendingFetch() {
    const seen: { signal?: AbortSignal | null } = {};
    globalThis.fetch = ((_url: unknown, init?: { signal?: AbortSignal | null }) => {
      seen.signal = init?.signal;
      return new Promise((_resolve, reject) => {
        const s = init?.signal;
        if (!s) return;
        const stop = () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
        if (s.aborted) stop();
        else s.addEventListener('abort', stop, { once: true });
      });
    }) as typeof fetch;
    return seen;
  }

  test('Cancel during the read ends it with an AbortError, not a refusal', async () => {
    const seen = pendingFetch();
    const controller = new AbortController();
    const read = fetchGenerationDecision('project-1', controller.signal);
    await new Promise((r) => setTimeout(r, 10));
    expect(seen.signal).toBe(controller.signal);
    controller.abort();
    await expect(read).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('a cancel that lands while the answer is read is a cancel too', async () => {
    const controller = new AbortController();
    globalThis.fetch = (async () => {
      controller.abort();
      return new Response(JSON.stringify({ decision: { ok: true, isAbapCloud: true, sentence: 's' }, contract: null, generation: null }), { status: 200 });
    }) as typeof fetch;
    await expect(fetchGenerationDecision('project-1', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('without a cancel, a transport failure is still a refusal, as before', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const answer = await fetchGenerationDecision('project-1', new AbortController().signal);
    expect(answer.decision).toMatchObject({ ok: false, code: 'no-contract' });
  });
});

test.describe('the page', () => {
  test('the generation and the plan read the contract under their own signal; the lease request under the generation\'s', () => {
    const src = page();
    const generation = src.slice(src.indexOf('const generateTransformation = useCallback'), src.indexOf('const planPending'));
    expect(generation).toContain('await fetchGenerationDecision(projectId as string, controller.signal);');
    // 3.0.18: Cancel ends the wait for the lease; the client closes a lease that arrives after it.
    expect(generation).toMatch(/lease = await requestGenerationLease\(projectId as string, generationToken, [^;]*newGenerationRunId\(\), controller\.signal\);/);
    const plan = src.slice(src.indexOf('if (!planWanted) return;'));
    expect(plan.slice(0, 600)).toContain('await fetchGenerationDecision(projectId as string, controller.signal);');
  });

  test('Generate waits while the plan is read, and after a generation until it is read again', () => {
    const src = page();
    expect(src).toContain("const planPending = planWanted && (planView === undefined || planView?.state === 'reading');");
    expect(src).toContain('const canStart = canGenerate && planBlocked === null && !planPending && contractRefusal === null;');
    // `planWanted` is known where `canStart` is computed.
    expect(src.indexOf('const planWanted =')).toBeLessThan(src.indexOf('const planPending ='));
    // A finished generation drops the plan it started from before reading it again.
    const fin = src.slice(src.indexOf('generationInFlight.current = false;'));
    expect(fin.indexOf('setPlanView(undefined);')).toBeGreaterThan(-1);
    expect(fin.indexOf('setPlanView(undefined);')).toBeLessThan(fin.indexOf('setPlanNonce((n) => n + 1);'));
    // Every start goes through canStart.
    expect(src).toMatch(/const startGeneration = \(\) => \{\s*if \(!canStart\) return;/);
  });
});
