/**
 * The Economics stage as one checklist — what the stage still needs from the
 * reader, row by row (mockup v2.8 s5, "What the comparison still needs").
 *
 * Economics used to ask for the same day rates twice, in two panels, and say
 * what was missing in paragraphs: each option ended in a hundred words of "Not
 * determined …", and the verdict in four hundred (audit 01.10.2026, row 7).
 * The facts behind those paragraphs were always structured — every gap is a
 * `CostGap` with a code and a subject in `lib/cost-assumptions.ts` — so the
 * list is read from them, not worded a second time: a row is open exactly when
 * the coverage the comparison itself uses has a gap for it. Nothing here
 * decides whether an amount may be shown; `costComparison` still does.
 *
 * Pure and import-light, so the rule can be read and tested in one place.
 */
import {
  BASELINE_KINDS,
  COMPARISON_KIND,
  costAssumptionsCoverage,
  type CostAssumptions,
  type CostGap,
  type CostOption,
} from './cost-assumptions';

/**
 * How far a row has got. `done` is "stated", never "proven" — a figure the
 * reader typed in is their own, not evidence, so it is drawn in the
 * information colour and never in green (DESIGN.md §1.1).
 */
export type ChecklistStatus = 'done' | 'open' | 'draft' | 'partial' | 'assumed';

export type ChecklistRowKey =
  | 'currency'
  | 'dev-rate'
  | 'test-rate'
  | 'horizon'
  | 'cadence'
  | 'one-off'
  | 'per-release'
  | 'baseline'
  | 'upgrade-delay'
  | 'loc'
  | 'investment'
  | 'upgrades'
  | 'feature-packs';

export interface ChecklistRow {
  key: ChecklistRowKey;
  label: string;
  /** A short qualifier after the label — "no default". */
  note?: string;
  status: ChecklistStatus;
  /** What the status is about in a few words — "missing for Keep and maintain", "confirm it". */
  detail?: string;
}

const OPTION_ROWS: Record<'one-off' | 'per-release' | 'baseline', readonly CostGap['code'][]> = {
  'one-off': ['option-one-off-missing', 'option-range-inverted', 'option-effort-unconfirmed'],
  'per-release': ['option-per-release-missing'],
  baseline: ['option-baseline-missing', 'option-baseline-unexpected'],
};

function labelOf(option: CostOption): string {
  return option.label || option.id;
}

/** The subject the gap sentences use for an option — `"Keep and maintain"`. */
function subjectOf(option: CostOption): string {
  return `"${labelOf(option)}"`;
}

/** An `amount-invalid` gap about this part of this option. */
function invalidFor(gaps: CostGap[], option: CostOption, part: 'one-off' | 'per-release' | 'baseline'): boolean {
  const name = subjectOf(option);
  const prefix =
    part === 'one-off'
      ? `The one-off effort of ${name}`
      : part === 'per-release'
        ? `The effort per release of ${name}`
        : `The maintenance baseline of ${name}`;
  return gaps.some((g) => g.code === 'amount-invalid' && g.subject === prefix);
}

function optionRow(
  gaps: CostGap[],
  options: CostOption[],
  key: 'one-off' | 'per-release' | 'baseline',
  label: string,
): ChecklistRow {
  const concerned = key === 'baseline' ? options.filter((o) => BASELINE_KINDS.has(o.kind)) : options;
  const missing = concerned.filter(
    (o) =>
      gaps.some((g) => OPTION_ROWS[key].includes(g.code) && g.subject === subjectOf(o)) || invalidFor(gaps, o, key),
  );
  if (concerned.length === 0) return { key, label, status: 'open', detail: 'no option to compare' };
  if (missing.length === 0) return { key, label, status: 'done' };
  if (missing.length === concerned.length) return { key, label, status: 'open' };
  return { key, label, status: 'partial', detail: `missing for ${missing.map(labelOf).join(', ')}` };
}

/** The rows of the option comparison, from the comparison's own coverage. */
export function comparisonChecklist(a: CostAssumptions): ChecklistRow[] {
  const { gaps } = costAssumptionsCoverage(a);
  const has = (code: CostGap['code'], subject?: string) =>
    gaps.some((g) => g.code === code && (subject === undefined || g.subject === subject));
  const options = a.options || [];
  const doNothing = options.find((o) => o.kind === COMPARISON_KIND) ?? null;

  const shared = (
    key: ChecklistRowKey,
    label: string,
    missing: CostGap['code'],
    invalidSubject: string,
    note?: string,
  ): ChecklistRow => {
    if (has(missing)) return { key, label, note, status: 'open' };
    if (has('amount-invalid', invalidSubject)) return { key, label, note, status: 'open', detail: 'not a figure' };
    return { key, label, note, status: 'done' };
  };

  const cadence: ChecklistRow = has('cadence-missing')
    ? { key: 'cadence', label: 'Releases per year', status: 'open' }
    : has('amount-invalid', 'The release cadence')
      ? { key: 'cadence', label: 'Releases per year', status: 'open', detail: 'not a figure' }
      : has('cadence-unconfirmed')
        ? { key: 'cadence', label: 'Releases per year', status: 'draft', detail: 'confirm it' }
        : { key: 'cadence', label: 'Releases per year', status: 'done' };

  const rows: ChecklistRow[] = [
    shared('currency', 'Currency', 'currency-missing', '', 'no default'),
    shared('dev-rate', 'Developer day rate', 'dev-rate-missing', 'The development day rate'),
    shared('test-rate', 'Test and key-user day rate', 'test-rate-missing', 'The test / key-user day rate'),
    shared('horizon', 'Time horizon in years', 'horizon-missing', 'The observation period', 'no default'),
    cadence,
    optionRow(gaps, options, 'one-off', 'One-time effort per option, as a range'),
    optionRow(gaps, options, 'per-release', 'Recurring effort per release'),
    optionRow(gaps, options, 'baseline', 'Maintenance baseline for Keep and Do nothing'),
  ];

  if (doNothing) {
    const name = subjectOf(doNothing);
    rows.push(
      has('upgrade-delay-unstated', name) || has('amount-invalid', `The upgrade deferral of ${name}`)
        ? { key: 'upgrade-delay', label: 'Upgrade deferral if nothing is done', status: 'open' }
        : has('upgrade-delay-not-determined')
          ? { key: 'upgrade-delay', label: 'Upgrade deferral if nothing is done', status: 'done', detail: 'stated as not determined' }
          : { key: 'upgrade-delay', label: 'Upgrade deferral if nothing is done', status: 'done' },
    );
  }
  return rows;
}

/** The inputs of the savings forecast that the comparison does not already ask for. */
export function forecastChecklist(input: {
  loc: number;
  sourceLoc: number | null;
  oneTimeCost: number | null;
  /** Whether the reader moved the release-upgrade figure off its starting value. */
  upgradesStated: boolean;
  featurePacksStated: boolean;
}): ChecklistRow[] {
  return [
    {
      key: 'loc',
      label: 'Lines of custom code',
      status: 'done',
      detail: input.sourceLoc !== null && input.loc === input.sourceLoc ? 'from your source' : 'stated',
    },
    { key: 'investment', label: 'One-time modernisation budget', status: input.oneTimeCost === null ? 'open' : 'done' },
    // Model assumptions with a starting value: a reader can change them, and
    // until then they are said to be assumed rather than counted as stated.
    { key: 'upgrades', label: 'Release upgrades per year', status: input.upgradesStated ? 'done' : 'assumed' },
    { key: 'feature-packs', label: 'Feature pack updates per year', status: input.featurePacksStated ? 'done' : 'assumed' },
  ];
}

/** Rows that still keep an amount away — `open` and `partial`, and a cadence nobody confirmed. */
export function openRows(rows: ReadonlyArray<ChecklistRow>): ChecklistRow[] {
  return rows.filter((r) => r.status === 'open' || r.status === 'partial' || r.status === 'draft');
}
