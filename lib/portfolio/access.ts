/**
 * Who may open the portfolio — roadmap 3.0.21 (Sonny, 11.10.2026).
 *
 * *"The portfolio — batch run and view — is open only to an account that has
 * its own model key stored and tested."* Many programs must never spend the
 * platform's budget or send code to the platform's key, and an account that
 * brought its own key has said whose contract a model step runs on. The batch
 * itself calls no model; the rule is about what comes after it, per project.
 *
 * Three facts decide it, all read on the server
 * (`lib/portfolio/access-server.ts`), never taken from a browser:
 *
 *   1. the account may bring its own key at all (`byokAllowed`, the one list
 *      the settings card and the key routes read);
 *   2. a key is stored (`user_secrets/{uid}/providers/{provider}`);
 *   3. that stored key passed the test **after** it was last saved — the test
 *      route writes `testedAt` on the record when it tests the saved key and
 *      the provider accepts it, and a save replaces the record, so a key saved
 *      again is untested until it is tested again.
 *
 * Reading a portfolio somebody shared with you is not this question: it spends
 * nothing and sends nothing to a model, so `lib/portfolio/selection.ts` answers
 * it from the invitation alone.
 *
 * Pure: no imports beyond the message part, so the page and the specs load it.
 */

import { portfolioAccessMessage } from '../messages/portfolio';

export type PortfolioAccessReason = 'open' | 'byok-not-available' | 'no-own-key' | 'key-not-tested';

export interface PortfolioAccess {
  open: boolean;
  reason: PortfolioAccessReason;
  /** The sentence the entry shows; it names the way on (Settings) when closed. */
  message: string;
}

export interface PortfolioAccessFacts {
  /** `byokAllowed()` for this account. */
  byokAllowed: boolean;
  /** A record of the provider the profile names exists. */
  keyStored: boolean;
  /** When the stored key last passed the test, in ms; `null` when never. */
  testedAtMs: number | null;
  /** When the stored key was last saved, in ms; `null` when unknown. */
  rotatedAtMs: number | null;
}

/** The code a portfolio route answers with when the account may not use it. */
export const PORTFOLIO_CLOSED_CODE = 'portfolio-needs-own-key';

export function portfolioAccessOf(facts: PortfolioAccessFacts): PortfolioAccess {
  const reason: PortfolioAccessReason = !facts.byokAllowed
    ? 'byok-not-available'
    : !facts.keyStored
      ? 'no-own-key'
      : facts.testedAtMs === null || (facts.rotatedAtMs !== null && facts.testedAtMs < facts.rotatedAtMs)
        ? 'key-not-tested'
        : 'open';
  return { open: reason === 'open', reason, message: portfolioAccessMessage(reason) };
}

/** A Firestore timestamp, a Date or an ISO string, in ms — `null` for anything else. */
export function millisOfStored(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'string') {
    const at = Date.parse(value);
    return Number.isFinite(at) ? at : null;
  }
  const toMillis = (value as { toMillis?: unknown }).toMillis;
  if (typeof toMillis === 'function') {
    const at = (toMillis as () => number).call(value);
    return Number.isFinite(at) ? at : null;
  }
  return null;
}
