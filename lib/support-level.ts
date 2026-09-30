/**
 * How a support level of the static detector is *shown* — a fixed list in the
 * sense of `DESIGN.md` §4.1, like `lib/clean-core-level.ts` and
 * `lib/severity.ts`.
 *
 * What a level means is decided in `lib/abap/support-matrix.ts` (the matrix and
 * its `LEVEL_LABEL`); this file does not repeat it, it imports the type. What
 * lives here is the presentation, and one decision inside it:
 *
 *   - **"Fully supported" is neutral, not green.** It is the detector's reading
 *     of one construct against the support matrix, not a proof that the program
 *     runs on the target (ADR-007, §1.1). Partial is `warning`, not supported is
 *     `error`.
 *   - **The word and an icon always travel with the colour.** The icon is named
 *     here (lucide, by name — the same convention as `lib/provenance.ts`), so a
 *     reader without colour, on paper or under `forced-colors` still has the
 *     level. The matrix used to carry an emoji for it (`LEVEL_EMOJI`); emoji are
 *     not interface symbols (§3.1), and the list went in block D, step D.29.
 *
 * Moved here from `components/analyze/CoverageVerdict.tsx` (D.29), where five
 * other surfaces imported it from inside a verdict panel. The one component
 * that draws it is `components/analyze/SupportLevelMark.tsx`.
 *
 * Pure: no React, no DOM.
 */

import type { SupportLevel } from './abap/support-matrix';
import type { ChartState } from './chart-colors';

export type SupportLevelIcon = 'circle-check' | 'circle-alert' | 'circle-x';

export interface SupportLevelEntry {
  value: SupportLevel;
  /** A state a chart may paint — `success` is not one of them. */
  state: ChartState;
  icon: SupportLevelIcon;
}

const ENTRIES: SupportLevelEntry[] = [
  { value: 'fully', state: 'neutral', icon: 'circle-check' },
  { value: 'partial', state: 'warning', icon: 'circle-alert' },
  { value: 'not-supported', state: 'error', icon: 'circle-x' },
];

export const SUPPORT_LEVEL: Readonly<Record<SupportLevel, SupportLevelEntry>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((e) => [e.value, Object.freeze(e)])) as Record<SupportLevel, SupportLevelEntry>,
);

/** The state of each level, for a mark that has no room for the word (a dot on a code line). */
export const SUPPORT_LEVEL_STATE: Readonly<Record<SupportLevel, ChartState>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((e) => [e.value, e.state])) as Record<SupportLevel, ChartState>,
);

/** In the matrix's order: fully, partial, not supported. */
export const SUPPORT_LEVEL_VALUES: readonly SupportLevel[] = Object.freeze(ENTRIES.map((e) => e.value));
