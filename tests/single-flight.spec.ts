import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { singleFlight } from '../lib/single-flight';

/**
 * The mechanism, run rather than read.
 *
 * `/api/health?deep=1` bounds an unauthenticated Firestore read with a cooldown.
 * The first version wrote the cooldown's timestamp *after* the read returned, so
 * requests arriving together all saw a stale timestamp and all issued their own
 * read: the serial flood was bounded and the concurrent one was not. The fix was
 * three lines, and the guard around it asserted that those three lines were in
 * the route's source — which cannot fail for the reason the fix exists. Keep the
 * characters, perform two reads, stay green (QA review of 9e408888bfec,
 * 78b84b92aa49).
 *
 * So the sharing lives in `lib/single-flight.ts` and is exercised here with a
 * deferred call, which is the only way to observe "one run under concurrency".
 * `tests/route-hardening-b88c77b.spec.ts` keeps checking the wiring — that the
 * route's single Firestore reach goes through this and only from the deep
 * branch — because that half really is a question about the source.
 */
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test.describe('one run at a time', () => {
  test('callers that arrive while a run is open share it — one run, one value', async () => {
    const gate = deferred<boolean>();
    let runs = 0;
    const share = singleFlight<boolean>();
    const start = () =>
      share(() => {
        runs++;
        return gate.promise;
      });

    // Twenty callers before anything settles. This is the case the cooldown
    // did not cover: they are not sequential, so nothing they could read has
    // been written yet.
    const waiting = Array.from({ length: 20 }, start);
    expect(runs, 'each concurrent caller started its own run').toBe(1);

    gate.resolve(true);
    expect(await Promise.all(waiting), 'the callers did not all get the one verdict').toEqual(
      Array(20).fill(true),
    );
    expect(runs, 'more than one run happened for twenty concurrent callers').toBe(1);
  });

  test('the slot is released when the run settles, so the next caller runs again', async () => {
    let runs = 0;
    const share = singleFlight<number>();
    const run = () => share(async () => ++runs);

    expect(await run()).toBe(1);
    expect(await run(), 'the slot was never released — the first verdict is frozen in').toBe(2);
    expect(runs).toBe(2);
  });

  test('a failed run is shared too, and does not wedge the slot', async () => {
    const gate = deferred<boolean>();
    let runs = 0;
    const share = singleFlight<boolean>();
    const start = () =>
      share(() => {
        runs++;
        return gate.promise;
      });

    const a = start();
    const b = start();
    gate.reject(new Error('firestore is down'));

    // Both callers see the same failure — not one failure and one silent success.
    await expect(a).rejects.toThrow('firestore is down');
    await expect(b).rejects.toThrow('firestore is down');
    expect(runs).toBe(1);

    // And the next caller is not stuck behind a rejected promise for ever: the
    // probe has to be able to recover once Firestore does.
    let laterRuns = 0;
    const later = await share(async () => {
      laterRuns++;
      return true;
    });
    expect(later, 'the slot stayed wedged after a failure').toBe(true);
    expect(laterRuns).toBe(1);
  });

  test('the claim happens before the run is awaited — read out of the source', () => {
    // The one thing a behaviour test cannot show: that the assignment is not
    // moved back below an `await` by a later edit that still passes the tests
    // above under a fast fake. The three tests above would notice a real
    // regression; this notices the shape that causes it.
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/single-flight.ts'), 'utf8');
    expect(src, 'the slot is no longer claimed in one expression with the run').toMatch(
      /inFlight \?\?= run\(\)/,
    );
    expect(src, 'nothing releases the slot when the run settles').toMatch(/\.finally\(/);
    expect(src, 'the helper reaches for something outside itself').not.toMatch(/^import /m);
  });
});
