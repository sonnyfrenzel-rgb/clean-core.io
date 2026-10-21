import { ruleRegisterFromView, ruleStateCounts, type RuleRowState } from './rule-register';
import type { StatesReadOutcome } from './process-states-client';
import { APP_VERSION } from './version';

/**
 * How many of the program's business rules are still open, approved or
 * changed on purpose — for Management's "In short" (owner, 12.10.2026: *"also
 * count open points, e.g. '66 business rules … 66 still open' — use the rule
 * register states so counts match the delivery package"*).
 *
 * The same reading the delivery package's STATUS.md and rule register make
 * (`lib/delivery-facts.ts`, CO review F16): with a confirmation record, its
 * register; with none yet (`no-baseline`), every rule read from the source is
 * open; anything else is not known, and then no count is said at all.
 */
export type RuleTally = { total: number } & Record<RuleRowState, number>;

export function ruleTallyOf(
  outcome: StatesReadOutcome | null,
  sourceRuleCount: number | null,
  /** The engine of the project's signed run, handed to the register (3.0.20); it reads no source here. */
  engineVersion: string | null = APP_VERSION,
): RuleTally | null {
  if (!outcome) return null;
  if (outcome.ok) {
    const register = ruleRegisterFromView(outcome.view, undefined, undefined, null, engineVersion);
    if (register.state === 'read') return { total: register.rows.length, ...ruleStateCounts(register.rows) };
    if (register.state === 'not-detected') return { total: 0, open: 0, approved: 0, 'changed-on-purpose': 0 };
    return null;
  }
  if (outcome.code === 'no-baseline' && sourceRuleCount !== null) {
    return { total: sourceRuleCount, open: sourceRuleCount, approved: 0, 'changed-on-purpose': 0 };
  }
  return null;
}
