/**
 * Was `seen` ever true while `work` was still running?
 *
 * Samples in a tight loop and stops the moment the request settles, so a state
 * that exists only between two points inside the route can be observed without
 * a wall-clock guess — and a miss ends in a clear assertion rather than in a
 * twenty-second timeout. Bookkeeping that is taken and given back leaves no
 * trace once the request is over; if nobody looked while it was there, the
 * test that follows is a statement about nothing.
 *
 * Shared rather than copied: both specs that need it are racing the same route
 * at the same two points (`tests/starter-example-quota.spec.ts` for the
 * reservation it hands back, `tests/conservative-invalidity.spec.ts` for the
 * source that moves under it), and a second copy is a second sampling rule that
 * nothing compares.
 */
export async function observedWhile(
  work: Promise<unknown>,
  seen: () => Promise<boolean>,
): Promise<boolean> {
  let running = true;
  work.then(() => { running = false; }, () => { running = false; });
  while (running) {
    if (await seen()) return true;
  }
  return seen();
}
