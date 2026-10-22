/**
 * The limits of the portfolio — roadmap 3.0.21 (owner decision 11.10.2026).
 *
 * One place for every number the batch run and the aggregated view hold, read
 * by the routes that enforce them and by the page that says them before the
 * click. Pure: no imports, so the browser bundle and the specs can load it.
 *
 * **Why these numbers.** The roadmap row asks to measure first and set the
 * limits from it. Measured on 22.10.2026 on the 116 benchmark programs with a
 * `source.abap` (`tests/prozess-benchmark/cases`): the engine part of a signed
 * run — `buildAbapEvidence`, `routeExtensibility`, inventory, data coupling,
 * both scores — took 60 ms on average and 261 ms at most for programs of
 * 1.8 kB on average; `app/api/runs/create/route.ts` records about a second at
 * 380 kB. A signed run stores about 10 kB of findings and inventory (24 kB at
 * most) and costs five Firestore writes per program (the project, the run, the
 * project update in the run's transaction, the clean-up, the queue item), so
 * 500 programs are about 2,500 writes and between half a minute and eight
 * minutes of engine time.
 *
 *   - **100 programs per batch.** A ZIP may hold 200 entries
 *     (`OWN_CODE_ZIP_LIMITS`), and a program usually comes with includes.
 *   - **300 programs per account and day** (rolling 24 hours). Three full
 *     batches a day; the per-account limit the roadmap names.
 *   - **One batch at a time.** A second upload waits until the first is done
 *     or cancelled, so one account never holds two queues.
 *   - **A step signs at most five programs or runs at most 20 seconds**,
 *     whichever comes first, so no request outlives Cloud Run's patience and a
 *     closed tab leaves at most five programs half done — those are picked up
 *     again after `PORTFOLIO_STALE_CLAIM_MS`.
 *   - **The view reads at most 500 projects** — the roadmap's measuring size.
 */

/** Programs one batch may hold. */
export const PORTFOLIO_BATCH_MAX_PROGRAMS = 100;

/** Programs one account may queue in a rolling 24 hours. */
export const PORTFOLIO_DAILY_MAX_PROGRAMS = 300;

/** The rolling window `PORTFOLIO_DAILY_MAX_PROGRAMS` is counted in. */
export const PORTFOLIO_DAY_MS = 24 * 60 * 60 * 1000;

/** Programs one step request signs at most. */
export const PORTFOLIO_STEP_MAX_ITEMS = 5;

/** Wall time after which a step request stops taking the next program. */
export const PORTFOLIO_STEP_BUDGET_MS = 20_000;

/** A program claimed this long ago and not finished is picked up again. */
export const PORTFOLIO_STALE_CLAIM_MS = 3 * 60 * 1000;

/** The largest body one upload request may carry (sources included). */
export const PORTFOLIO_UPLOAD_BODY_BYTES = 2 * 1024 * 1024;

/** Projects the aggregated view reads at most. */
export const PORTFOLIO_VIEW_MAX_PROJECTS = 500;

/** Projects a named selection may list. */
export const PORTFOLIO_SELECTION_MAX_PROJECTS = PORTFOLIO_VIEW_MAX_PROJECTS;

/** Named selections one account may keep. */
export const PORTFOLIO_MAX_SELECTIONS = 50;

/** Characters of a batch or selection name. */
export const PORTFOLIO_NAME_MAX_CHARS = 120;
