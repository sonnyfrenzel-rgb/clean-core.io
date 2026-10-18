import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { writeRemainingParts } from '../lib/business-layer-parts';

/**
 * Roadmap 3.0.18, item 3 — Documentation ends cleanly. Server-free.
 *
 * - 7a654675c749 (and 83b3f57e0bfb, 36772677f40f, da4bc08e3773, c1055cb1a40f,
 *   1851ce837b65, 131b5dc5aaf6, 2d804c64d8db, 9e53a9e62f4d): after a failed
 *   part the run ended — and the lease was released — while sibling parts were
 *   still in flight.
 * - 302cd4adf10e (and 63fd71077855, 9fe273100c2b, 3a8f8685a375): a load error
 *   returned before the progress card, so its end state and *Try again* were gone.
 * - 998531746180, 92dee871371b: an absent option comparison was blamed on an
 *   older design.
 * - 69abb12523ed, b5628794687a, 98c0cfd6c4e1, e6c756fa2d63: the artefacts
 *   route said its artefacts never reach a run or an audit pack; they do.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const PAGE = 'app/(app)/project/[projectId]/documentation/page.tsx';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test.describe('the other parts settle before the run ends', () => {
  test('a failed part stops new parts, aborts, and waits for every sibling', async () => {
    const calls = new Map<number, ReturnType<typeof deferred>>();
    const started: number[] = [];
    let stops = 0;
    const run = writeRemainingParts(6, 3, (index) => {
      started.push(index);
      const d = deferred();
      calls.set(index, d);
      return d.promise;
    }, () => { stops += 1; });
    let ended = false;
    const outcome = run.then(() => 'resolved', (e: unknown) => (e instanceof Error ? e.message : String(e)))
      .finally(() => { ended = true; });

    await Promise.resolve();
    expect(started).toEqual([1, 2, 3]);
    calls.get(2)!.reject(new Error('Part 3 of 6: boom'));
    await new Promise((r) => setTimeout(r, 10));
    expect(stops).toBe(1);
    // The siblings are still in flight: the run has not ended.
    expect(ended).toBe(false);
    // A sibling that ends after the stop starts no further part.
    calls.get(1)!.resolve();
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toEqual([1, 2, 3]);
    expect(ended).toBe(false);
    calls.get(3)!.reject(new Error('aborted'));
    expect(await outcome).toBe('Part 3 of 6: boom');
    expect(ended).toBe(true);
    expect(stops).toBe(1);
  });

  test('all parts written: every index once, no stop', async () => {
    const seen: number[] = [];
    let stops = 0;
    await writeRemainingParts(5, 2, async (i) => { seen.push(i); }, () => { stops += 1; });
    expect(seen.sort()).toEqual([1, 2, 3, 4]);
    expect(stops).toBe(0);
    await writeRemainingParts(1, 3, async () => { throw new Error('never called'); }, () => { stops += 1; });
    expect(stops).toBe(0);
  });

  test('the page writes the other parts through it', () => {
    const src = read(PAGE);
    const gen = src.slice(src.indexOf('async function runBusinessGeneration'), src.indexOf('const generateBusinessDocumentation = useCallback'));
    expect(gen).toContain('await writeRemainingParts(plan.parts.length, BUSINESS_LAYER_PART_LIMITS.parallel');
    expect(gen).not.toContain('the others are not waited for');
    expect(gen).not.toMatch(/await Promise\.all\(Array\.from/);
  });
});

test('a load error keeps the progress card with its end state and Try again', () => {
  const src = read(PAGE);
  const start = src.indexOf('if (loadError) return (');
  expect(start).toBeGreaterThan(-1);
  const branch = src.slice(start, src.indexOf('</StageFrame>', start));
  expect(branch).toContain('{progressCard}');
  expect(branch).toContain('data-load-error');
  // One *Try again*: the card's (a reload for the run stage), not a second one in the strip.
  expect(branch).not.toContain('window.location.reload()');
  expect(src).toContain("if (stage === 'run' || stage === 'process') return () => window.location.reload();");
});

test('an absent option comparison is said, not explained by history', () => {
  const src = read('components/design/OptionComparison.tsx');
  expect(src).not.toContain('it was written before the design compared');
  expect(src).toContain('no comparison of the SAP standard, RAP and CAP is present in this design');
});

test('the artefacts route does not claim its artefacts stay out of runs and audit packs', () => {
  const src = read('app/api/projects/[projectId]/artefacts/route.ts');
  expect(src).not.toContain('Nothing here reaches');
  // What it says instead holds: both routes join the artefacts back.
  expect(read('app/api/audit-pack/create/route.ts')).toContain('withStoredArtefacts(db, projectDoc.ref, storedProject)');
  expect(read('app/api/runs/create/route.ts')).toContain('withStoredArtefacts(tx, projectRef,');
});
