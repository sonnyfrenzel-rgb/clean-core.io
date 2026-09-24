/**
 * Which colour a chart may use — `DESIGN.md` §1.8, as token names.
 *
 * Two palettes, and the question that picks one is *what the chart counts*:
 *
 *   - **A chart that counts states** — findings per severity, objects per
 *     clean-core level — takes the state colours, and every category carries its
 *     word or letter as well. Level: A information, B neutral, C warning, D
 *     error (ADR-024). Severity: Critical and High error, Medium warning, Low
 *     neutral, Info information (ADR-049). The colour is *read from the fixed
 *     list* (`lib/clean-core-level.ts`, `lib/severity.ts`) rather than written a
 *     second time here, so the chart and the identifier beside it cannot drift.
 *   - **Every other chart** — buckets, modules, runs over time — takes the
 *     categorical palette `--cc-chart-1 … 5`, or the sequential indigo
 *     `--cc-seq-1 … 4` for amounts, and **never a state colour**: a bar in
 *     `--cc-error` says "wrong" about a category that is only a category.
 *
 * **No chart is ever green.** `success` is not in any table below and cannot be
 * asked for: green means *proven* (ADR-007), and nothing a chart counts is a
 * proof. Level A is blue for exactly that reason.
 *
 * **The palette is tokens, never hex.** Each colour is given three ways, all
 * pointing at the same custom property in `app/globals.css`: the token name,
 * a `var(…)` for props that take a colour value (an SVG `fill` attribute, an
 * inline style, a Recharts `fill`), and the Tailwind classes — written out in
 * full because Tailwind scans source text and `bg-cc-${x}` generates nothing.
 *
 * **Colour is never the only carrier.** Every number is also text (a table or
 * an `aria-label`, §1.8), and under `forced-colors` the fills go entirely —
 * `app/globals.css` turns every `[data-chart-segment]` into an outlined box.
 *
 * Pure: no React, no DOM. Client components import it.
 */

import type { SemanticState } from './provenance';
import { cleanCoreLevel, type CleanCoreLevelValue } from './clean-core-level';
import { severity, type SeverityValue } from './severity';

/** A state a chart may paint. `success` is left out on purpose — see above. */
export type ChartState = Exclude<SemanticState, 'success'>;

export interface ChartColor {
  /** The custom property, e.g. `--cc-chart-1`. */
  token: string;
  /** `var(--cc-chart-1)` — for an SVG attribute or an inline style. */
  value: string;
  /** Fill of a block element: a bar segment, a legend swatch. */
  bg: string;
  /** Fill of an SVG shape. */
  fill: string;
  /** Stroke of an SVG line. */
  stroke: string;
}

function color(token: string, bg: string, fill: string, stroke: string): ChartColor {
  return Object.freeze({ token, value: `var(${token})`, bg, fill, stroke });
}

/* --------------------------------------------------- charts that count states */

/**
 * The solid mark of each state — the same token `components/cc/state.ts` uses
 * for the dot of an object status, and the one the level chart of the
 * Management view already paints (roadmap 3.0.10).
 */
export const STATE_CHART_COLORS: Readonly<Record<ChartState, ChartColor>> = Object.freeze({
  error: color('--cc-error', 'bg-cc-error', 'fill-cc-error', 'stroke-cc-error'),
  warning: color('--cc-warning', 'bg-cc-warning', 'fill-cc-warning', 'stroke-cc-warning'),
  neutral: color('--cc-neutral', 'bg-cc-neutral', 'fill-cc-neutral', 'stroke-cc-neutral'),
  information: color(
    '--cc-information',
    'bg-cc-information',
    'fill-cc-information',
    'stroke-cc-information',
  ),
});

export function stateChartColor(state: ChartState): ChartColor {
  const entry = STATE_CHART_COLORS[state];
  if (!entry) throw new Error(`No chart colour for state: ${String(state)}`);
  return entry;
}

/** The colour of a severity in a chart — read from `lib/severity.ts`. */
export function severityChartColor(value: SeverityValue): ChartColor {
  return stateChartColor(severity(value).state);
}

/**
 * The colour of a clean-core level in a chart — read from
 * `lib/clean-core-level.ts`. `Unknown` is not a level; a chart shows it as
 * `NOT_DETERMINED_CHART`, not as a fifth colour.
 */
export function levelChartColor(value: Exclude<CleanCoreLevelValue, 'Unknown'>): ChartColor {
  const state = cleanCoreLevel(value).state;
  if (state === 'success') throw new Error(`Level ${value} would be green — DESIGN.md §1.8`);
  return stateChartColor(state);
}

/* ------------------------------------------------------- every other chart */

/** `--cc-chart-1 … 5`, in the order a chart assigns them to its series. */
export const CATEGORICAL_CHART_COLORS: readonly ChartColor[] = Object.freeze([
  color('--cc-chart-1', 'bg-cc-chart-1', 'fill-cc-chart-1', 'stroke-cc-chart-1'),
  color('--cc-chart-2', 'bg-cc-chart-2', 'fill-cc-chart-2', 'stroke-cc-chart-2'),
  color('--cc-chart-3', 'bg-cc-chart-3', 'fill-cc-chart-3', 'stroke-cc-chart-3'),
  color('--cc-chart-4', 'bg-cc-chart-4', 'fill-cc-chart-4', 'stroke-cc-chart-4'),
  color('--cc-chart-5', 'bg-cc-chart-5', 'fill-cc-chart-5', 'stroke-cc-chart-5'),
]);

/**
 * The colour of the n-th series (0-based). Wraps after five — a chart with a
 * sixth series has a legend problem before it has a colour problem, and the
 * label beside every series keeps a wrapped colour readable.
 */
export function categoricalChartColor(index: number): ChartColor {
  if (!Number.isInteger(index) || index < 0) throw new Error(`Series index must be 0 or more: ${index}`);
  return CATEGORICAL_CHART_COLORS[index % CATEGORICAL_CHART_COLORS.length];
}

/** Indigo, light to dark — for amounts and runs over time, `--cc-seq-1 … 4`. */
export const SEQUENTIAL_CHART_COLORS: readonly ChartColor[] = Object.freeze([
  color('--cc-seq-1', 'bg-cc-seq-1', 'fill-cc-seq-1', 'stroke-cc-seq-1'),
  color('--cc-seq-2', 'bg-cc-seq-2', 'fill-cc-seq-2', 'stroke-cc-seq-2'),
  color('--cc-seq-3', 'bg-cc-seq-3', 'fill-cc-seq-3', 'stroke-cc-seq-3'),
  color('--cc-seq-4', 'bg-cc-seq-4', 'fill-cc-seq-4', 'stroke-cc-seq-4'),
]);

/* ------------------------------------------------- the area that is no category */

/**
 * *Not determined* in a chart — "no verdict", "no grade", "not read". It is
 * not a category and not a state, so it takes neither palette: a muted surface
 * with a dashed edge and a hatch, the form the Management view gave it
 * (roadmap 3.0.10). Mark the element `data-not-determined` as well, so it stays
 * dashed under `forced-colors`.
 */
export const NOT_DETERMINED_CHART = Object.freeze({
  bg: 'bg-cc-surface-muted border border-dashed border-cc-field-border',
  /** The hatch, as an inline style — a pattern survives a printer without colour. */
  hatch: Object.freeze({
    backgroundImage:
      'repeating-linear-gradient(135deg, var(--cc-field-border) 0 1px, transparent 1px 6px)',
  }),
});
