/**
 * One run at a time: everyone who asks while a run is open gets that run.
 *
 * Pulled out of `app/api/health/route.ts` on 22.09.2026, and the reason is the
 * test rather than reuse. The route's deep probe bounds an unauthenticated
 * Firestore read with a cooldown, and the first version wrote the timestamp
 * *after* the read returned — so a hundred requests arriving together all read
 * a stale timestamp and all issued their own read. The cooldown bounded a
 * serial flood and left the concurrent one untouched, which is the flood that
 * matters.
 *
 * The fix was three lines in the route, and the guard around it read those
 * three lines out of the source. That guard cannot fail for the reason it
 * exists: a regression that keeps the characters and still performs two reads
 * passes it (QA review of 9e408888bfec, 78b84b92aa49). A route handler cannot
 * easily be driven with a deferred Firestore call from a spec; this can, so the
 * mechanism is tested by running it and the wiring is what the source guard
 * checks.
 *
 * Scope is the closure, which in a route module means one server instance. That
 * is all it claims: it bounds an instance, not a service.
 */
export function singleFlight<T>(): (run: () => Promise<T>) => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return (run) => {
    // Claimed before `run` is awaited — claiming it afterwards is the bug this
    // exists to prevent, and it looks almost the same.
    inFlight ??= run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
