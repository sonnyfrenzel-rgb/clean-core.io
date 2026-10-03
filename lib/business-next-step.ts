import type { NextOpenPoint } from './next-step';
import type { RulesStatus } from './rules-editor';

/**
 * "Your next step" in the Business view — one action, derived from the record.
 *
 * Owner, 03.10.2026: the page offered "Confirm the rule" as its green primary
 * button while the one rule was already confirmed, and a second primary
 * ("Next step") stood a screen lower. Two places each decided on their own
 * what the reader should do, and one of them did not read the confirmations
 * at all. This module is the one place that decides it for the Business view,
 * and it decides from two facts that are both on record:
 *
 *   1. **the rules the code hard-codes, and how many have an answer** —
 *      `rulesStatus` in `lib/rules-editor.ts`, read from the same need
 *      revision the rules card shows;
 *   2. **the next open phase** — `nextOpenPoint` in `lib/next-step.ts`, the one
 *      phase contract the Management and IT views read as well.
 *
 * The rules come first only where answering them is possible and is the
 * owner's to do: the code has rules, at least one has no answer, a signed run
 * exists (the answers are stated about the process it reconstructed, so with
 * Analyze still open the phase step leads), and the reader owns the project.
 * Everything else is the phase step, unchanged — so the Business view never
 * names a different next phase from the other two views.
 *
 * Pure and without a model call, like `lib/next-step.ts`.
 */
export type BusinessNextStep =
  | {
      kind: 'rules';
      /** Rules without an answer, in the order of the code. */
      open: string[];
      total: number;
      /** The phase that follows once the rules are answered, or null when none is open. */
      then: NextOpenPoint | null;
    }
  | { kind: 'phase'; point: NextOpenPoint }
  | { kind: 'none' };

export function businessNextStep(input: {
  point: NextOpenPoint | null;
  rules: RulesStatus | null;
  owner: boolean;
}): BusinessNextStep {
  const { point, rules, owner } = input;
  const rulesFirst =
    owner && rules !== null && rules.total > 0 && rules.open.length > 0 && point?.key !== 'analyze';
  if (rulesFirst) return { kind: 'rules', open: rules.open, total: rules.total, then: point };
  return point ? { kind: 'phase', point } : { kind: 'none' };
}
