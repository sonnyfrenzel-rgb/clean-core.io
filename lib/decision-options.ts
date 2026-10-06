import type { OptionKind } from './cost-assumptions';

/**
 * The four answers to the one question of the Management view — "Keep,
 * rebuild, move to SAP standard or retire this program?" (ADR-073, ADR-079).
 *
 * One vocabulary for every surface that names them: the Management option
 * cards, the decision headline, the steering one-pager, the Economics options
 * and the glossary. Before ADR-079 the same four things had eight names
 * ("Do nothing", "Keep and maintain", "Move to standard", "Cover the requirement
 * with SAP standard — build nothing", "Retire / Decommission", …) and two of the
 * four could not be chosen at all.
 *
 * **Do nothing is Keep** (owner, 06.10.2026). The Economics comparison keeps its
 * baseline option under the stored kind `do-nothing` — that kind is in every
 * stored cost revision and fingerprint — and shows it as *Keep*; a stored
 * record that still carries a separate `keep` option is read as Keep too.
 *
 * Pure and client-safe: no imports beyond a type.
 */

export const DECISION_OPTIONS = ['keep', 'rebuild', 'standard', 'retire'] as const;
export type DecisionOption = (typeof DECISION_OPTIONS)[number];

/** The words a reader sees for each option — short, plain, and the same everywhere. */
export const DECISION_OPTION_LABELS: Readonly<Record<DecisionOption, string>> = Object.freeze({
  keep: 'Keep',
  rebuild: 'Rebuild',
  standard: 'Move to SAP standard',
  retire: 'Retire',
});

/** What the option means for the program, in one sentence a business reader can act on. */
export const DECISION_OPTION_MEANINGS: Readonly<Record<DecisionOption, string>> = Object.freeze({
  keep: 'The program stays as it is and is maintained. Nothing is built; what blocks the standard stays.',
  rebuild: 'The program is rebuilt as a clean extension on released interfaces. The route is signed off in Design.',
  standard: 'SAP standard takes over what the program does. Nothing is built; the program is switched off once the standard runs.',
  retire: 'The program is switched off without a replacement. Nothing is built; whoever still needs it has to say so first.',
});

/**
 * The architecture codes a sign-off stores (`Project.targetArchitecture`) for
 * each option chosen in Management. Rebuild has four codes and is signed off in
 * Design (the route is an architecture question); the other three are chosen in
 * Management directly and build nothing.
 */
export const DIRECT_CHOICE_CODE: Readonly<Record<Exclude<DecisionOption, 'rebuild'>, 'keep' | 'standard' | 'retire'>> =
  Object.freeze({ keep: 'keep', standard: 'standard', retire: 'retire' });

/** The option a stored architecture code stands for, or `null` for an unknown code. */
export function optionOfArchitecture(code: string | null | undefined): DecisionOption | null {
  if (code === 'keep' || code === 'standard' || code === 'retire') return code;
  if (code === 'rap' || code === 'cap' || code === 'integration' || code === 'event') return 'rebuild';
  return null;
}

/** The option an Economics cost option stands for — `do-nothing` is Keep. */
export function optionOfCostKind(kind: OptionKind): DecisionOption {
  return kind === 'do-nothing' ? 'keep' : kind;
}

/** The program decision as one question about one program. */
export function decisionQuestion(subject: string): string {
  return `Keep, rebuild, move to SAP standard or retire ${subject}?`;
}
