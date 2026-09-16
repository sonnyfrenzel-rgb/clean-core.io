/**
 * How the clean-core level A–D is *shown* — `DESIGN.md` §1.8 and §4.1.
 *
 * What a level means is decided in `lib/abap/abcd-classification.ts`, and this
 * file does not repeat it: it imports that type so a fifth grade cannot appear
 * in one place and not the other. What lives here is the presentation, and two
 * decisions inside it:
 *
 *   - **The colour carries the letter** (ADR-024). A is `information`, B
 *     `neutral`, C `warning`, D `error` — and never `success`. The levels come
 *     out of SAP's classification file, so they are *Imported*, not proof, and
 *     they are never part of the signed audit pack. A green A would say
 *     "verified clean" about a row somebody else wrote down.
 *   - **The letter is always printed next to the colour.** A bar segment that is
 *     only blue says nothing on a black-and-white print, to a screen reader, or
 *     to the eight percent of men who cannot separate the C from the D.
 */

import type { CloudReadinessGrade } from './abap/abcd-classification';
import type { SemanticState } from './provenance';

export type CleanCoreLevelValue = CloudReadinessGrade;

export interface CleanCoreLevelEntry {
  value: CleanCoreLevelValue;
  key: string;
  /** What the identifier shows — the letter itself, or a dash where there is none. */
  code: string;
  label: string;
  state: SemanticState;
}

const ENTRIES: CleanCoreLevelEntry[] = [
  {
    value: 'A',
    key: 'cleanCoreLevel.a',
    code: 'A',
    label: 'released SAP APIs and extension points',
    state: 'information',
  },
  {
    value: 'B',
    key: 'cleanCoreLevel.b',
    code: 'B',
    label: 'classic SAP APIs, following SAP recommendations',
    state: 'neutral',
  },
  {
    value: 'C',
    key: 'cleanCoreLevel.c',
    code: 'C',
    label: 'internal SAP APIs — conditionally clean',
    state: 'warning',
  },
  {
    value: 'D',
    key: 'cleanCoreLevel.d',
    code: 'D',
    label: 'not recommended — modifications and retired technology',
    state: 'error',
  },
  {
    value: 'Unknown',
    key: 'cleanCoreLevel.unknown',
    code: '—',
    label: 'not determined',
    state: 'neutral',
  },
];

export const CLEAN_CORE_LEVEL: Readonly<Record<CleanCoreLevelValue, CleanCoreLevelEntry>> =
  Object.freeze(
    Object.fromEntries(ENTRIES.map((e) => [e.value, Object.freeze(e)])) as Record<
      CleanCoreLevelValue,
      CleanCoreLevelEntry
    >,
  );

/** A–D only; the legend and the distribution bar do not offer "Unknown" as a level. */
export const CLEAN_CORE_LEVEL_VALUES: readonly CleanCoreLevelValue[] = Object.freeze([
  'A',
  'B',
  'C',
  'D',
]);

export function cleanCoreLevel(value: CleanCoreLevelValue): CleanCoreLevelEntry {
  const entry = CLEAN_CORE_LEVEL[value];
  if (!entry) throw new Error(`Unknown clean-core level: ${String(value)}`);
  return entry;
}

export function isCleanCoreLevelValue(value: unknown): value is CleanCoreLevelValue {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CLEAN_CORE_LEVEL, value);
}
