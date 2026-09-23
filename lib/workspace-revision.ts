import { singleFlight } from '@/lib/single-flight';

/**
 * Which revision of the process the workspace is showing — roadmap 6.9, CR-15.
 *
 * The Gegenreview c5085bb found the workspace silent about its own Stand: the
 * shell rendered a project, somebody else confirmed a state or saved a model
 * from another tab, and nothing on the open screen said so. The reader kept
 * acting on a screen that had stopped being true, and only learned it when a
 * write came back `revision-moved` — with their work already typed.
 *
 * Three things live here and nothing else does:
 *
 *   1. `revisionBadge` — the one wording of the Stand, so the badge, the banner
 *      and any later surface cannot phrase it differently;
 *   2. `standMoved` — the one comparison, including the case a `!==` gets wrong
 *      by accident: *nothing yet* is a Stand too, and going from "no revision"
 *      to "revision 1" is a change;
 *   3. `createStandProbe` — the bound. This is the part that has to be right.
 *
 * **What the probe costs, in full.** A Stand check is a Firestore read behind an
 * authenticated route, and the roadmap line asks for it at three moments —
 * window focus, reload, and before every writing action. Those three are not
 * rare: a reader who alt-tabs between the workspace and their IDE generates one
 * focus event per switch, and an unbounded check would turn that habit into a
 * read per switch, per tab, for as long as the screen is open.
 *
 * So it is bounded exactly the way `/api/health?deep=1` bounds its own probe
 * (`lib/single-flight.ts`, security audit of b88c77b): **one read per window,
 * under any concurrency**. Callers inside the window are answered from the last
 * verdict without a request; callers arriving while a read is open await that
 * same read. The cost ceiling is therefore `1000 / COOLDOWN` reads per second
 * per open tab regardless of how the three triggers fire — six reads a minute
 * in the worst case, the same figure the health probe settled on.
 *
 * **The window is claimed before the `await`, not after.** Writing the
 * timestamp once the read returns is the bug this file exists not to repeat: a
 * burst arriving together would all read a stale timestamp, all take the else
 * branch, and all issue their own read — a bounded serial flood beside an
 * unbounded concurrent one, which is the flood that matters.
 *
 * **Why the write path accepts the window rather than forcing a fresh read.**
 * The Stand check before a write is a courtesy, not a lock. The lock is on the
 * server: every write in this product carries the `baseRevision` it was made on
 * and is refused with `revision-moved` when somebody else has moved since
 * (`app/api/projects/[projectId]/process-revisions/route.ts`,
 * `.../process-states/route.ts`). Nothing here can be raced into overwriting
 * anything, because nothing here decides whether a write lands. A `force` flag
 * would buy a few hundred milliseconds of freshness and hand a caller a way to
 * drive one read per click; there is deliberately no such flag.
 *
 * Deliberately free of React, of `fetch` and of Firestore: the reading is
 * injected, so the bound can be exercised with a deferred call in a spec rather
 * than asserted by reading the source of a component.
 */

/**
 * How long one verdict stands for. Ten seconds, the same figure the health
 * probe uses, and for the same reason: shorter than any interval a person
 * generates by hand, long enough that a habit cannot become a read loop.
 */
export const STAND_COOLDOWN_MS = 10_000;

/**
 * The Stand of a project's process: the newest revision, or `null` when none
 * has been written yet. `null` is a real answer here — a project whose process
 * was never reconstructed has no revision, and saying "revision 0" would invent
 * one.
 */
export interface RevisionStand {
  revision: number | null;
}

/** The one wording of a Stand. */
export function revisionBadge(revision: number | null): string {
  return typeof revision === 'number' ? `Revision ${revision}` : 'No revision yet';
}

/**
 * Has the Stand moved away from what this screen was rendered from?
 *
 * Both halves may be `null`, and the two `null` cases mean different things: a
 * screen that has not checked yet holds nothing and must not claim a change,
 * while a project that genuinely has no revision holds `null` and gaining
 * revision 1 *is* a change. So an unchecked screen is passed as `undefined` and
 * an unwritten process as `null`, and only the second compares.
 */
export function standMoved(held: number | null | undefined, seen: number | null | undefined): boolean {
  if (held === undefined || seen === undefined) return false;
  return held !== seen;
}

/**
 * One read per window, under any concurrency.
 *
 * `read` is the actual call; `now` is injected so a spec can move the clock
 * without waiting ten seconds for it.
 */
export function createStandProbe(
  read: () => Promise<RevisionStand | null>,
  now: () => number = Date.now,
  cooldownMs: number = STAND_COOLDOWN_MS,
): () => Promise<RevisionStand | null> {
  let claimedAt = Number.NEGATIVE_INFINITY;
  let stand: RevisionStand | null = null;
  let open = false;
  const share = singleFlight<RevisionStand | null>();

  return () => {
    // `open` is why the window is asked about second. A caller arriving while a
    // read is in flight must join *that* read rather than be answered from the
    // verdict it is about to replace — otherwise claiming the window early,
    // which is the whole point, would hand nineteen of twenty concurrent
    // callers a stale answer.
    if (!open && now() - claimedAt < cooldownMs) return Promise.resolve(stand);
    return share(async () => {
      // The window is claimed here — before `read()` is awaited. Moving these
      // two lines below the await leaves the concurrent burst unbounded and
      // still passes any test that only counts sequential calls.
      claimedAt = now();
      open = true;
      try {
        stand = await read();
      } finally {
        open = false;
      }
      return stand;
    });
  };
}
