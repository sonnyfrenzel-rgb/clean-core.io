import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * "Signed by the same engine as a single project" — roadmap 3.0.21 (1).
 *
 * A batch does not have a signing path of its own. Each program is signed by
 * calling the handler of `POST /api/runs/create` in-process, with the caller's
 * own token, so every gate, the quota decision, the engine, the signature and
 * the transaction are the ones a single project meets — there is no second
 * implementation to drift.
 *
 * One thing differs, and it is this module: the route's own rate limit
 * (`runs-create:{uid}`, 30 an hour) was set for a person pressing Run, and a
 * batch of 100 programs would stop at the thirtieth. While a portfolio step
 * runs, the route sees this context and leaves its hourly limit to the batch's
 * own (`lib/portfolio/limits.ts`: 100 a batch, 300 a day, five a step, one
 * batch at a time), which the step route enforces before it calls.
 *
 * The context is an `AsyncLocalStorage`: it exists only inside the step
 * route's own call, in this process, and nothing a browser sends can set it —
 * no header, no body field. A request to `/api/runs/create` from outside never
 * runs inside it.
 */

export interface PortfolioRunContext {
  uid: string;
  batchId: string;
}

const store = new AsyncLocalStorage<PortfolioRunContext>();

/** Run `fn` as part of a portfolio step for this account and batch. */
export function runInPortfolioStep<T>(context: PortfolioRunContext, fn: () => Promise<T>): Promise<T> {
  return store.run({ ...context }, fn);
}

/**
 * The step this call belongs to, when it is one and it acts for `uid` —
 * `null` otherwise. A context for another account is not this caller's.
 */
export function portfolioStepFor(uid: string): PortfolioRunContext | null {
  const context = store.getStore();
  return context && context.uid === uid ? context : null;
}
