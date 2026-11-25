import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { toHomeRow, type HomeRow } from '../lib/home-rows';
import { ownRowsReader, runRowSteps } from '../lib/workspace-row-flow';
import type { Project } from '../lib/types';

/**
 * The own list's two asynchronous flows, played through with answers in a chosen order (`lib/workspace-row-flow.ts`).
 * The source checks that stood here before only found the guard's text; these run the flows the list runs, with the
 * request and the project read held open until the test lets them go. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');

/** A promise the test resolves or rejects when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const rowOf = (id: string): HomeRow => toHomeRow({ id, name: id } as Project & { id: string });
const answer = (rows: HomeRow[], status = 200) =>
  new Response(JSON.stringify({ rows, truncated: false }), { status, headers: { 'content-type': 'application/json' } });

test.describe('the own rows: only the newest request writes', () => {
  const reader = () => {
    const shown: string[][] = [];
    const failed: string[] = [];
    const read = ownRowsReader({ rows: (_uid, rows) => shown.push(rows.map((r) => r.id)), failed: (uid) => failed.push(uid) });
    return { read, shown, failed };
  };

  test('an older answer arriving after a newer one does not replace its rows', async () => {
    const { read, shown, failed } = reader();
    const a = deferred<Response>();
    const b = deferred<Response>();
    const first = read('u1', () => a.promise);
    const second = read('u1', () => b.promise);
    b.resolve(answer([rowOf('new-1'), rowOf('new-2')]));
    await second;
    a.resolve(answer([rowOf('old-1')]));
    await first;
    expect(shown).toEqual([['new-1', 'new-2']]);
    expect(failed).toEqual([]);
  });

  test('an older failure arriving after a newer answer marks nothing failed — a thrown request or a refused one', async () => {
    for (const fail of [(d: ReturnType<typeof deferred<Response>>) => d.reject(new Error('offline')), (d: ReturnType<typeof deferred<Response>>) => d.resolve(answer([], 500))]) {
      const { read, shown, failed } = reader();
      const a = deferred<Response>();
      const b = deferred<Response>();
      const first = read('u1', () => a.promise);
      const second = read('u1', () => b.promise);
      b.resolve(answer([rowOf('new-1')]));
      await second;
      fail(a);
      await first;
      expect(shown).toEqual([['new-1']]);
      expect(failed).toEqual([]);
    }
  });

  test('the newest request failing is said, for the account that asked', async () => {
    const { read, shown, failed } = reader();
    await read('u2', async () => answer([], 500));
    expect(shown).toEqual([]);
    expect(failed).toEqual(['u2']);
  });

  test('the list reads its rows through this reader, one for the page', () => {
    const list = fs.readFileSync(path.join(ROOT, 'components/workspace/WorkspaceListReport.tsx'), 'utf8');
    expect(list).toContain('const [readOwnRows] = useState(() => ownRowsReader({');
    expect(list).toContain("await readOwnRows(u.uid, async () => fetch('/api/workspace-rows', { headers: await bearer(u), cache: 'no-store' }));");
  });
});

test.describe('a run from a row, cancelled while the project is read', () => {
  type P = { id: string; legacyCode?: string };
  const flow = (owned: { value: boolean }, controller: AbortController, read: Promise<P | null>) => {
    const runs: string[] = [];
    const stages: string[][] = [];
    const scopes: string[] = [];
    const done = runRowSteps<P, string[]>({
      read: () => read,
      owns: () => owned.value,
      signal: controller.signal,
      sourceOf: (p) => p.legacyCode ?? null,
      noSource: () => new Error('no source'),
      scope: (s) => scopes.push(s),
      stages: (s) => stages.push(s),
      run: async (p, _source, onStages) => {
        runs.push(p.id);
        onStages(['evidence']);
      },
    });
    return { done, runs, stages, scopes };
  };

  test('Cancel during the read, then the read arrives: no run is started and no stage is shown', async () => {
    const owned = { value: true };
    const controller = new AbortController();
    const read = deferred<P | null>();
    const { done, runs, stages, scopes } = flow(owned, controller, read.promise);
    // Cancel, as the row's button does it: the controller is aborted and the row is no longer this run's.
    controller.abort();
    owned.value = false;
    read.resolve({ id: 'p1', legacyCode: 'REPORT z.' });
    await expect(done).resolves.toBe('cancelled');
    expect(runs).toEqual([]);
    expect(stages).toEqual([]);
    expect(scopes).toEqual([]);
  });

  test('the list left during the read (the row no longer owned, nothing aborted): nothing starts either', async () => {
    const owned = { value: true };
    const read = deferred<P | null>();
    const { done, runs } = flow(owned, new AbortController(), read.promise);
    owned.value = false;
    read.resolve({ id: 'p1', legacyCode: 'REPORT z.' });
    await expect(done).resolves.toBe('cancelled');
    expect(runs).toEqual([]);
  });

  test('not cancelled: the run starts with the source and its stages are shown', async () => {
    const owned = { value: true };
    const read = deferred<P | null>();
    const { done, runs, stages, scopes } = flow(owned, new AbortController(), read.promise);
    read.resolve({ id: 'p1', legacyCode: 'REPORT z.' });
    await expect(done).resolves.toBe('ran');
    expect(runs).toEqual(['p1']);
    expect(scopes).toEqual(['REPORT z.']);
    expect(stages).toEqual([['evidence']]);
  });

  test('a project without source is refused, after the read', async () => {
    const { done, runs } = flow({ value: true }, new AbortController(), Promise.resolve({ id: 'p1', legacyCode: '  ' }));
    await expect(done).rejects.toThrow('no source');
    expect(runs).toEqual([]);
  });

  test('the row starts its run through this flow, with its own controller', () => {
    const list = fs.readFileSync(path.join(ROOT, 'components/workspace/WorkspaceListReport.tsx'), 'utf8');
    const start = list.slice(list.indexOf('const start = useCallback'), list.indexOf('const cancel = useCallback'));
    expect(start).toMatch(/const ran = await runRowSteps\(\{\s*read: \(\) => readOwnProject\(row\.id\),\s*owns,\s*signal: controller\.signal,/);
    expect(start).toContain("if (ran === 'cancelled') return;");
    expect(start).toContain('signal: controller.signal,\n              onStages,');
  });
});
