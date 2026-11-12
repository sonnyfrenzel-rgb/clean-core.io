/**
 * The two asynchronous checks of the verify page (`app/(app)/verify-pack/page.tsx`), kept apart from React so their
 * ordering can be tested without a browser (tests/verify-pack-verdict-qa220.spec.ts).
 *
 * Each pack selection and each package check takes a number before its first await; an answer that arrives after a
 * newer selection or a newer package check is dropped, so a slow check of pack A is never shown, or paired, under
 * pack B. Choosing a pack also invalidates every package check still running.
 */

/** The page keeps one of these in a ref: the latest pack selection and the latest package check. */
export interface CheckCounters {
  pack: number;
  packageCheck: number;
}

export function newCheckCounters(): CheckCounters {
  return { pack: 0, packageCheck: 0 };
}

/** Verify a chosen pack: `ui.result` and `ui.end` run only while this is still the latest selection. */
export async function runPackCheck<R>(
  counters: CheckCounters,
  verify: () => Promise<R>,
  failed: (err: unknown) => R,
  ui: { begin(): void; result(r: R): void; end(): void },
): Promise<void> {
  const selection = ++counters.pack;
  counters.packageCheck++;
  ui.begin();
  try {
    const res = await verify();
    if (selection !== counters.pack) return;
    ui.result(res);
  } catch (err) {
    if (selection !== counters.pack) return;
    ui.result(failed(err));
  } finally {
    if (selection === counters.pack) ui.end();
  }
}

/** Check a delivery package: its outcome, error and end are written only while it is still the latest check. */
export async function runPackageCheck<T>(
  counters: CheckCounters,
  check: () => Promise<T>,
  ui: { begin(): void; outcome(t: T): void; error(err: unknown): void; end(): void },
): Promise<void> {
  const mine = ++counters.packageCheck;
  const current = () => mine === counters.packageCheck;
  ui.begin();
  try {
    const outcome = await check();
    if (current()) ui.outcome(outcome);
  } catch (err) {
    if (current()) ui.error(err);
  } finally {
    if (current()) ui.end();
  }
}
