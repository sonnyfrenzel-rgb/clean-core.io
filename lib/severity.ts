/**
 * How severe a finding is — the fifth fixed list, `DESIGN.md` §4.1 and ADR-049.
 *
 * Five values, and they are the five the engine already writes:
 * `EvidenceFinding.severity` in `lib/abap/evidence-model.ts` and
 * `ItFindingRow.severity` in `lib/it-findings.ts` are both
 * `'Critical' | 'High' | 'Medium' | 'Low' | 'Info'`. This file does not invent a
 * sixth and does not rename one; the value *is* the word, so a finding row can be
 * handed to `CcSeverity` as it comes off the wire.
 *
 * Two decisions live here:
 *
 *   - **The colour is the state of §1.8, never green.** Critical and High are
 *     `error`, Medium `warning`, Low `neutral`, Info `information`. A severity
 *     is not evidence (ADR-007), so no value reaches `success` — a green Low
 *     would read as "checked and fine", which nobody established.
 *   - **Critical and High share a colour and differ in the word.** Which is why
 *     the word is always printed: a severity that is only a colour cannot tell
 *     those two apart on screen, on paper or under `forced-colors`.
 *
 * Its form is the identifier — a 4px rectangle, like the clean-core level — so
 * a severity is never mistaken for a provenance chip (pill) or an object status
 * (text with a dot).
 *
 * **Pure, and it stays that way.** `components/cc/Identifier.tsx` is a client
 * component and imports this file.
 */

import type { SemanticState } from './provenance';

export type SeverityValue = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';

export interface SeverityEntry {
  value: SeverityValue;
  key: string;
  /** The word on the identifier. The same as the value, on purpose. */
  label: string;
  /**
   * The identifier's `title`: where the word stands on the scale and who set it.
   * Deliberately no more — the product has no written definition of what makes a
   * finding High rather than Medium beyond the engine rule that assigns it, and a
   * tooltip that invented one would be a claim nobody made.
   */
  meaning: string;
  state: Exclude<SemanticState, 'success'>;
}

const ENTRIES: SeverityEntry[] = [
  {
    value: 'Critical',
    key: 'severity.critical',
    label: 'Critical',
    meaning: '1 of 5, the most severe — as the rule that raised the finding rates it.',
    state: 'error',
  },
  {
    value: 'High',
    key: 'severity.high',
    label: 'High',
    meaning: '2 of 5 — as the rule that raised the finding rates it.',
    state: 'error',
  },
  {
    value: 'Medium',
    key: 'severity.medium',
    label: 'Medium',
    meaning: '3 of 5 — as the rule that raised the finding rates it.',
    state: 'warning',
  },
  {
    value: 'Low',
    key: 'severity.low',
    label: 'Low',
    meaning: '4 of 5 — as the rule that raised the finding rates it.',
    state: 'neutral',
  },
  {
    value: 'Info',
    key: 'severity.info',
    label: 'Info',
    meaning: '5 of 5, the least severe — a note the rule records about the code.',
    state: 'information',
  },
];

export const SEVERITY: Readonly<Record<SeverityValue, SeverityEntry>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((e) => [e.value, Object.freeze(e)])) as Record<
    SeverityValue,
    SeverityEntry
  >,
);

/** Most severe first — the order of every legend, table and chart. */
export const SEVERITY_VALUES: readonly SeverityValue[] = Object.freeze(ENTRIES.map((e) => e.value));

export function severity(value: SeverityValue): SeverityEntry {
  const entry = SEVERITY[value];
  if (!entry) throw new Error(`Unknown severity: ${String(value)}`);
  return entry;
}

export function isSeverityValue(value: unknown): value is SeverityValue {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SEVERITY, value);
}

/**
 * The fixed value for a severity string as the app writes it today.
 *
 * The engine writes `'High'`; `lib/abap/usage-model.ts` writes `'high'`; an
 * imported or stored row may carry `' HIGH '`. They are one value, and a second
 * spelling is not a second severity. Anything that is not one of the five words
 * — an ATC priority (`error`, `warning`), a process-hint level (`warn`), a
 * support level (`not-supported`), an empty field — gives `null`: that is a
 * different vocabulary, and mapping it here would decide something its owner
 * never decided. The caller shows *not determined* for `null`, not a guess.
 */
export function normaliseSeverity(input: unknown): SeverityValue | null {
  if (typeof input !== 'string') return null;
  const word = input.trim().toLowerCase();
  if (!word) return null;
  for (const value of SEVERITY_VALUES) {
    if (value.toLowerCase() === word) return value;
  }
  return null;
}

/** Critical … Info as 0 … 4, so findings sort most severe first without a local table. */
export function severityRank(value: SeverityValue): number {
  return SEVERITY_VALUES.indexOf(severity(value).value);
}

/** For `Array.prototype.sort`: most severe first. */
export function compareSeverity(a: SeverityValue, b: SeverityValue): number {
  return severityRank(a) - severityRank(b);
}
