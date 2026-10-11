'use client';

/**
 * Options with costs — roadmap 7.4, the screen half.
 *
 * Since 03.10.2026 (owner: "you first have to find 'Take over the proposal'")
 * the module draws two steps of the guided stage: step 3, the effort per
 * option with the proposal and its take-over on the card itself, and step 4's
 * verdict. The cards no longer price anything; every amount stands once, in
 * the result.
 *
 * The shared figures (currency, day rates, time horizon, release cadence) are
 * entered once, in the stage's checklist (`EconomicsChecklist`) — they used to
 * be asked for a second time here, beside a forecast that asked for the same day
 * rates (audit 01.10.2026, row 7). This module draws what is per option — the
 * effort fields and what each option costs — and the verdict.
 *
 * Every amount on this panel comes out of one revision of stated assumptions
 * (`lib/cost-assumptions.ts`), and the panel shows which revision, one level
 * deeper. Nothing here has a default: no currency, no day rate, no observation
 * period, no effort. A field nobody filled in is a named gap, never a zero —
 * and while any option is missing a mandatory field, the comparison refuses to
 * name a cheapest one and says which option stopped it.
 *
 * `lib/tco-model.ts` and the savings forecast are a different thing and stay a
 * different thing: that is a demonstration of one modernisation against
 * assumed coefficients; this prices options against each other, including
 * doing nothing.
 */

import { useState, type ReactNode } from 'react';
import { formatDays, formatNumber } from '@/lib/format';
import {
  COMPARISON_KIND,
  BASELINE_KINDS,
  COST_ASSUMPTIONS_VERSION,
  emptyCostAssumptions,
  formatAmount,
  formatAmountRange,
  type CostAssumptions,
  type CostComparison,
  type CostOption,
  type BaselineProposal,
  type EffortDays,
  type EffortProposal,
  type EffortRange,
} from '@/lib/cost-assumptions';
import {
  EFFORT_HELP,
  PROPOSAL_STANDING,
  baselineDerivation,
  baselineUpliftText,
  costBlockers,
  effortDerivation,
  linesBasis,
  releasesInHorizonText,
  type DerivationLine,
  type FigureKind,
} from '@/lib/economics-help';
import { figureMessage, useFigureInput } from '@/components/tco/EconomicsChecklist';
import CcStateText from '@/components/cc/StateText';
import { CircleAlert } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcField from '@/components/cc/Field';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { DECISION_OPTION_LABELS } from '@/lib/decision-options';

/**
 * The options the panel offers, by name only — the four answers of the program
 * decision (ADR-079, `lib/decision-options.ts`). A label is not a figure: every
 * effort below starts empty.
 *
 * *Keep* is the comparison option 7.4 requires — "Do nothing" is Keep (owner,
 * 06.10.2026). It keeps the stored id and kind `do-nothing`, which every stored
 * cost revision and its fingerprint carry, and carries the maintenance baseline
 * and the upgrade deferral. A stored record from before ADR-079 still holds its
 * own options and is shown as it was stored.
 */
const SEED_OPTIONS: CostOption[] = [
  {
    id: 'do-nothing',
    kind: COMPARISON_KIND,
    label: DECISION_OPTION_LABELS.keep,
    oneOff: null,
    perRelease: null,
    maintenanceBaselinePerYear: null,
    upgradeDelay: null,
    effortSource: 'stated',
  },
  {
    id: 'rebuild',
    kind: 'rebuild',
    label: DECISION_OPTION_LABELS.rebuild,
    oneOff: null,
    perRelease: null,
    maintenanceBaselinePerYear: null,
    upgradeDelay: null,
    effortSource: 'stated',
  },
  {
    id: 'standard',
    kind: 'standard',
    label: DECISION_OPTION_LABELS.standard,
    oneOff: null,
    perRelease: null,
    maintenanceBaselinePerYear: null,
    upgradeDelay: null,
    effortSource: 'stated',
  },
  {
    id: 'retire',
    kind: 'retire',
    label: DECISION_OPTION_LABELS.retire,
    oneOff: null,
    perRelease: null,
    maintenanceBaselinePerYear: null,
    upgradeDelay: null,
    effortSource: 'stated',
  },
];

/**
 * The assumptions the stage starts from: every figure absent, the four options
 * by name only. The page holds them; this module only says what they are.
 */
export function initialCostAssumptions(): CostAssumptions {
  return { ...emptyCostAssumptions(), version: COST_ASSUMPTIONS_VERSION, options: SEED_OPTIONS };
}

/**
 * "Not determined", with the reason the page has always given: a statement of
 * its own, never a zero (`Stated` in `lib/cost-assumptions.ts`).
 */
const NOT_DETERMINED_DELAY: CostOption['upgradeDelay'] = {
  state: 'not-determined',
  reason: 'nobody has established how far the upgrade would slip',
};

/** A stored half-filled figure reads back as "no figure", never as NaN on screen. */
const fin = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * One corner of the one-off range, changed. An empty corner stays absent (NaN
 * inside the record), and once all four are empty the range itself is absent —
 * which is the mandatory field being missing, not a range of zero days.
 */
function withOneOffCorner(
  option: CostOption,
  bound: 'low' | 'high',
  key: keyof EffortDays,
  v: number | null,
): CostOption['oneOff'] {
  const current = option.oneOff ?? {
    low: { devDays: NaN, testDays: NaN },
    high: { devDays: NaN, testDays: NaN },
  };
  const next = {
    low: { ...current.low },
    high: { ...current.high },
  };
  next[bound][key] = v ?? NaN;
  const empty = [next.low.devDays, next.low.testDays, next.high.devDays, next.high.testDays].every(
    (d) => !Number.isFinite(d),
  );
  return empty ? null : next;
}

/**
 * A figure the reader states. Every field on this panel is mandatory (ADR-035),
 * so every one carries the asterisk and `aria-required`. It is read and
 * explained the way step 2 reads its figures (`useFigureInput`): an empty
 * field says so once the reader has left it, a figure the save would refuse
 * says what is wrong and what is allowed (§2.7: on blur, not on the first
 * keystroke).
 */
function NumField({
  id,
  label,
  value,
  onChange,
  hint,
  kind = 'days',
  suffix,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
  kind?: FigureKind;
  suffix?: string;
}) {
  const input = useFigureInput(value, kind, onChange);
  return (
    <CcField label={label} required help={hint} {...figureMessage(input, value)}>
      {({ id: controlId, describedBy, ariaRequired, invalid, className }) => (
        <div className="flex items-center gap-2">
          <input
            id={controlId}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={input.raw}
            placeholder="enter your figure"
            data-cost-field={id}
            aria-required={ariaRequired}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onBlur={input.onBlur}
            onChange={input.onChange}
            className={className}
          />
          {suffix ? <span className="cc-text-meta whitespace-nowrap text-cc-ink-muted">{suffix}</span> : null}
        </div>
      )}
    </CcField>
  );
}

/** A group of effort fields under a legend, with one line of what the group means. */
function EffortGroup({ legend, help, children }: { legend: string; help: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0">
      <legend className="cc-text-label text-cc-ink">{legend}</legend>
      <p className="m-0 cc-text-meta text-cc-ink-muted">{help}</p>
      {children}
    </fieldset>
  );
}

/** A dev/test day pair. Both halves, because both day rates are mandatory. */
function EffortFields({
  idPrefix,
  label,
  help,
  value,
  onChange,
}: {
  idPrefix: string;
  label: string;
  help: ReactNode;
  value: EffortDays | null;
  onChange: (v: EffortDays | null) => void;
}) {
  const set = (key: keyof EffortDays, v: number | null) => {
    const next: EffortDays = { devDays: value?.devDays ?? NaN, testDays: value?.testDays ?? NaN, [key]: v ?? NaN };
    // Both halves empty is "no figure", not "zero days".
    if (!Number.isFinite(next.devDays) && !Number.isFinite(next.testDays)) return onChange(null);
    onChange(next);
  };
  const shown = (key: keyof EffortDays) =>
    value && Number.isFinite(value[key]) ? (value[key] as number) : null;
  return (
    <EffortGroup legend={label} help={help}>
      <div className="grid grid-cols-2 gap-3">
        <NumField
          id={`${idPrefix}-dev`}
          label="Dev days"
          value={shown('devDays')}
          onChange={(v) => set('devDays', v)}
        />
        <NumField
          id={`${idPrefix}-test`}
          label="Test days"
          value={shown('testDays')}
          onChange={(v) => set('testDays', v)}
        />
      </div>
    </EffortGroup>
  );
}

/**
 * The mandatory groups of one option, each with whether it still keeps the
 * option from a price — read from the option's own gaps in the comparison's
 * coverage, so the card cannot say a group is in that the comparison counts as
 * missing. The shared figures (currency, day rates, horizon, cadence) stand in
 * the checklist, once.
 */
interface OptionGroup {
  key: 'baseline' | 'one-off' | 'per-release' | 'deferral';
  label: string;
  open: boolean;
}

export function optionGroups(cost: CostComparison['costs'][number] | undefined, option: CostOption): OptionGroup[] {
  const name = `"${option.label || option.id}"`;
  const gaps = (cost?.coverage.gaps ?? []).filter((g) => (g.subject ?? '').includes(name));
  const has = (code: string, subjectStart?: string) =>
    gaps.some((g) => g.code === code && (!subjectStart || (g.subject ?? '').startsWith(subjectStart)));
  const groups: OptionGroup[] = [];
  if (BASELINE_KINDS.has(option.kind)) {
    const invalid = has('amount-invalid', 'The maintenance baseline');
    groups.push({
      key: 'baseline',
      label: invalid ? 'maintenance baseline (not a figure)' : 'maintenance baseline',
      open: has('option-baseline-missing') || invalid,
    });
  } else if (has('option-baseline-unexpected')) {
    groups.push({ key: 'baseline', label: 'a maintenance baseline it does not carry', open: true });
  }
  const oneOffInvalid = has('amount-invalid', 'The one-off effort');
  groups.push({
    key: 'one-off',
    label: has('option-range-inverted')
      ? 'one-off effort range (low above high)'
      : has('option-effort-unconfirmed')
        ? 'one-off effort range (proposal not confirmed)'
        : oneOffInvalid
          ? 'one-off effort range (not a figure)'
          : 'one-off effort range',
    open:
      has('option-one-off-missing') || has('option-range-inverted') || has('option-effort-unconfirmed') || oneOffInvalid,
  });
  const perReleaseInvalid = has('amount-invalid', 'The effort per release');
  groups.push({
    key: 'per-release',
    label: perReleaseInvalid ? 'effort per release (not a figure)' : 'effort per release',
    open: has('option-per-release-missing') || perReleaseInvalid,
  });
  if (option.kind === COMPARISON_KIND) {
    groups.push({
      key: 'deferral',
      label: 'upgrade deferral',
      open: has('upgrade-delay-unstated') || has('amount-invalid', 'The upgrade deferral'),
    });
  }
  return groups;
}

/** The refusal in a few words; the whole sentence stays one click deeper. */
export function refusalHeadline(comparison: CostComparison, options: CostOption[]): string {
  const incomplete = comparison.costs.filter((c) => !c.total).map((c) => c.label);
  switch (comparison.refusal?.code) {
    case 'assumptions-incomplete':
      return 'No option can be priced until your rates (step 2) and the effort per option (step 3) are in.';
    case 'option-incomplete':
      return `Not every option is complete yet: ${incomplete.join(', ')}.`;
    case 'too-few-options':
      return 'One option on its own is not a comparison.';
    case 'ranges-overlap':
      return 'The two lowest options overlap inside their effort ranges, so neither is established as cheaper.';
    default:
      return options.length === 0 ? 'There is no option to compare.' : 'No option is established as cheapest.';
  }
}

/**
 * Where an option's effort figures stand — the provenance the card shows.
 *
 *   - `not-entered`: nothing typed, and no proposal to take over;
 *   - `proposal`: nothing typed, a proposal from the code size is on offer;
 *   - `from-proposal`: the reader took the proposal over — now their figure;
 *   - `stated`: the reader typed the figure.
 *
 * A taken-over proposal is the reader's own figure (ADR-035: the factors are
 * allowed "only as a proposal requiring confirmation"); it says where it came
 * from, and it is drawn apart from a proposal nobody accepted.
 */
export type EffortProvenance = 'not-entered' | 'proposal' | 'from-proposal' | 'stated';

export function effortProvenance(option: CostOption, proposal: EffortProposal | null): EffortProvenance {
  const entered = option.oneOff !== null || option.perRelease !== null;
  if (!entered) return proposal ? 'proposal' : 'not-entered';
  return option.effortSource === 'proposal-confirmed' ? 'from-proposal' : 'stated';
}

/**
 * Where an option's maintenance baseline stands — the same four states as its
 * effort, or `null` for a kind that carries no baseline. The proposal from the
 * code size (owner, 03.10.2026) is on offer while nothing is typed; it is never
 * in the model until the reader takes it over (ADR-035).
 */
export function baselineProvenance(option: CostOption, proposal: BaselineProposal | null): EffortProvenance | null {
  if (!BASELINE_KINDS.has(option.kind)) return null;
  if (option.maintenanceBaselinePerYear == null) return proposal ? 'proposal' : 'not-entered';
  return option.baselineSource === 'proposal-confirmed' ? 'from-proposal' : 'stated';
}

/** The two proposals the stage can offer: effort per option, and the maintenance baseline. */
export interface OptionProposals {
  effort: EffortProposal | null;
  baseline: BaselineProposal | null;
}

/** Which parts of one option a proposal could still fill — nothing typed in them yet. */
export function pendingParts(option: CostOption, proposals: OptionProposals): { effort: boolean; baseline: boolean } {
  return {
    effort: effortProvenance(option, proposals.effort) === 'proposal',
    baseline: baselineProvenance(option, proposals.baseline) === 'proposal',
  };
}

/**
 * The options with anything a proposal could still fill. One option is one
 * proposal, whichever of its parts it covers — what "Take over all N
 * proposals" counts, and what each card offers with its one button.
 */
export function pendingProposals(options: CostOption[], proposals: OptionProposals): CostOption[] {
  return options.filter((o) => {
    const p = pendingParts(o, proposals);
    return p.effort || p.baseline;
  });
}

/** What taking an option's proposal over writes into it: only the parts still open. */
export function takeOverPatch(option: CostOption, proposals: OptionProposals): Partial<CostOption> {
  const parts = pendingParts(option, proposals);
  const patch: Partial<CostOption> = {};
  if (parts.effort && proposals.effort) {
    patch.oneOff = proposals.effort.oneOff;
    patch.perRelease = proposals.effort.perRelease;
    patch.effortSource = 'proposal-confirmed';
  }
  if (parts.baseline && proposals.baseline) {
    patch.maintenanceBaselinePerYear = proposals.baseline.perYear;
    patch.baselineSource = 'proposal-confirmed';
  }
  return patch;
}

const dayRange = (low: number, high: number) => `${formatDays(low)}–${formatDays(high)}`;

/** The proposal in one sentence of days, rounded as every figure here is. */
export function proposalWords(proposal: EffortProposal): string {
  const { oneOff, perRelease } = proposal;
  return (
    `${dayRange(oneOff.low.devDays, oneOff.high.devDays)} developer days and ` +
    `${dayRange(oneOff.low.testDays, oneOff.high.testDays)} key-user days once, then ` +
    `${formatDays(perRelease.devDays)} developer and ${formatDays(perRelease.testDays)} key-user days per release.`
  );
}

/** The maintenance baseline in one sentence of days, rounded as every figure here is. */
export function baselineWords(proposal: BaselineProposal): string {
  const { perYear } = proposal;
  return `${formatDays(perYear.devDays)} developer and ${formatDays(perYear.testDays)} key-user days of maintenance per year.`;
}

function EffortChip({
  state,
  data = 'data-effort-chip',
}: {
  state: EffortProvenance;
  data?: 'data-effort-chip' | 'data-baseline-chip';
}) {
  return (
    <span {...{ [data]: state }}>
      {state === 'not-entered' ? (
        <CcProvenanceChip value="not-determined" note="not entered" />
      ) : state === 'proposal' ? (
        <CcProvenanceChip value="simulation" note="proposal" />
      ) : state === 'from-proposal' ? (
        <CcProvenanceChip value="confirmed" note="your figure, from the proposal" />
      ) : (
        <CcProvenanceChip value="confirmed" note="your figure" />
      )}
    </span>
  );
}

const days = (v: number | null | undefined) =>
  typeof v === 'number' && Number.isFinite(v) ? `${formatDays(v)}` : '—';

/** An entered one-off range in words: "1.3–3.3 developer and 0.67–1.7 test days once". */
export function oneOffWords(range: EffortRange): string {
  return `${days(range.low.devDays)}–${days(range.high.devDays)} developer and ${days(range.low.testDays)}–${days(range.high.testDays)} test days once`;
}

/** An entered dev/test pair in words: "1.7 developer and 1.2 test days per release". */
export function pairWords(pair: EffortDays, per: string): string {
  return `${days(pair.devDays)} developer and ${days(pair.testDays)} test days ${per}`;
}

/** The upgrade deferral as it stands, in words. */
export function deferralWords(delay: CostOption['upgradeDelay']): string | null {
  if (!delay) return null;
  if (delay.state === 'not-determined') return `Not determined — ${delay.reason || 'no reason given'}`;
  const n = delay.value.releasesDeferred;
  return `${formatNumber(n, { maximumFractionDigits: 1 }) ?? String(n)} release${n === 1 ? '' : 's'} deferred`;
}

/** What each open group is, why the option needs it, and the field that takes it. */
const GROUP_HELP: Record<OptionGroup['key'], { what: string; action: string; field: (id: string) => string }> = {
  baseline: {
    what: EFFORT_HELP.baseline,
    action: 'Enter the maintenance baseline',
    field: (id) => `${id}-baseline-dev`,
  },
  'one-off': {
    what: EFFORT_HELP.oneOff,
    action: 'Enter the one-off effort',
    field: (id) => `${id}-oneoff-low-dev`,
  },
  'per-release': {
    what: EFFORT_HELP.perRelease,
    action: 'Enter the effort per release',
    field: (id) => `${id}-per-release-dev`,
  },
  deferral: {
    what: EFFORT_HELP.deferral,
    action: 'Enter the upgrade deferral',
    field: (id) => `${id}-upgrade-delay`,
  },
};

/** "How is this proposed?" — the derivation of a proposal, line by line, with this project's numbers. */
function Derivation({
  title,
  lines,
  basis,
  extra,
  data,
}: {
  title: string;
  lines: DerivationLine[];
  basis: string;
  extra?: string;
  data: string;
}) {
  return (
    <div data-cost-derivation={data} className="cc-no-print">
      <CcDisclosure title={title}>
        <div className="space-y-2">
          <p className="m-0 cc-text-meta text-cc-ink-muted">From {basis}.</p>
          <ul className="m-0 list-none space-y-1 p-0">
            {lines.map((l) => (
              <li key={l.key} data-cost-derivation-line={l.key} className="cc-text-cell text-cc-ink">
                <span className="text-cc-ink-muted">{l.label}: </span>
                {l.formula} = <span className="font-semibold">{l.result}</span>
              </li>
            ))}
          </ul>
          {extra ? <p className="m-0 cc-text-meta text-cc-ink-muted">{extra}</p> : null}
          <p className="m-0 cc-text-meta text-cc-ink-muted">{PROPOSAL_STANDING}</p>
        </div>
      </CcDisclosure>
    </div>
  );
}

/** One value of a card: what it is, its provenance once, and the value itself — never a chip without the figure. */
function CardValue({
  label,
  chip,
  children,
  data,
}: {
  label: string;
  chip?: ReactNode;
  children: ReactNode;
  data: Record<`data-${string}`, string>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1" {...data}>
      <dt className="flex flex-wrap items-center gap-2 cc-text-label text-cc-ink-muted">
        {label}
        {chip}
      </dt>
      <dd className="m-0 cc-text-cell text-cc-ink">{children}</dd>
    </div>
  );
}

/**
 * Step 3: one card per option (owner, 11.10.2026: "you don't understand at all
 * what exactly is meant, it is hidden, and it doesn't show properly when it
 * was saved / taken over"). A card reads top to bottom:
 *
 *   - its figures — the effort, Keep's maintenance baseline and upgrade
 *     deferral — each as a value with its provenance chip beside it, once;
 *     a proposal shows its figures and how they were derived;
 *   - what it still needs, each with what it is, why, and the action that
 *     opens the field for it;
 *   - its cost, or why there is none yet — with a way to the figure in step 2
 *     it waits for;
 *   - whether it is saved.
 *
 * The fields stay behind "Enter my own figures" / "Change figures"; an open
 * item's own action opens them at its field.
 */
export default function OptionComparison({
  assumptions,
  comparison,
  proposal,
  baselineProposal,
  onPatchOption,
  editing,
  onToggleEdit,
  onOpenEdit,
  onGoToField,
  loc,
  sourceLoc,
  saveStatus,
}: {
  assumptions: CostAssumptions;
  comparison: CostComparison;
  proposal: EffortProposal | null;
  /** The maintenance-baseline proposal for Keep and Do nothing, or `null` without a line count. */
  baselineProposal: BaselineProposal | null;
  onPatchOption: (id: string, patch: Partial<CostOption>) => void;
  /**
   * Which option cards show their fields — closed by default, so a card reads
   * as where its effort stands first and as a form only on request.
   */
  editing: ReadonlySet<string>;
  onToggleEdit: (id: string) => void;
  /** Opens a card's fields and puts the cursor in one of them. */
  onOpenEdit?: (id: string, field: string) => void;
  /** Scrolls to a field of step 2 by its `data-cost-field` and puts the cursor in it. */
  onGoToField?: (field: string) => void;
  /** The lines the proposals were computed from, and the lines of the source. */
  loc?: number;
  sourceLoc?: number | null;
  /** Whether one card's figures are saved. */
  saveStatus?: (optionId: string) => ReactNode;
}) {
  const patchOption = onPatchOption;
  // A figure typed by hand is the reader's own, wherever the field started from.
  const typed = (id: string, p: Partial<CostOption>) => patchOption(id, { ...p, effortSource: 'stated' });
  const proposals: OptionProposals = { effort: proposal, baseline: baselineProposal };
  const pending = pendingProposals(assumptions.options, proposals);
  const basis = typeof loc === 'number' ? linesBasis(loc, sourceLoc ?? null) : null;
  const releases = releasesInHorizonText(assumptions.releaseCadence?.perYear, assumptions.horizonYears);
  const openAt = (id: string, field: string) => {
    if (onOpenEdit) onOpenEdit(id, field);
    else if (!editing.has(id)) onToggleEdit(id);
  };
  return (
    <div data-cost-comparison="">
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
        {assumptions.options.map((option) => {
          const cost = comparison.costs.find((c) => c.optionId === option.id);
          const isComparison = option.kind === COMPARISON_KIND;
          const needsBaseline = BASELINE_KINDS.has(option.kind);
          const groups = optionGroups(cost, option);
          const state = effortProvenance(option, proposal);
          const baselineState = baselineProvenance(option, baselineProposal);
          const parts = pendingParts(option, proposals);
          // While a proposal is on offer, the groups it covers are what the button fills.
          const openGroups = groups.filter(
            (g) =>
              g.open &&
              !(parts.effort && (g.key === 'one-off' || g.key === 'per-release')) &&
              !(parts.baseline && g.key === 'baseline'),
          );
          const proposedFor = [
            parts.effort ? 'the one-off effort range and the effort per release' : null,
            parts.baseline ? 'the maintenance baseline per year' : null,
          ]
            .filter(Boolean)
            .join(', and for ');
          const priced = Boolean(cost && cost.total);
          const blockers = priced ? [] : costBlockers(cost?.coverage.gaps ?? []);
          const shared = blockers.filter((b) => b.scope === 'shared');
          const own = blockers.filter((b) => b.scope === 'own');
          const isEditing = editing.has(option.id);
          const panelId = `cost-option-fields-${option.id}`;
          const deferral = deferralWords(option.upgradeDelay);
          const effortDerived = proposal && typeof loc === 'number' && (state === 'proposal' || state === 'from-proposal');
          const baselineDerived =
            baselineProposal && typeof loc === 'number' && (baselineState === 'proposal' || baselineState === 'from-proposal');
          return (
            <li key={option.id} className="min-w-0">
              <article
                data-cost-option={option.id}
                data-effort-provenance={state}
                data-baseline-provenance={baselineState ?? undefined}
                aria-labelledby={`cost-option-title-${option.id}`}
                className="cc-card flex h-full min-w-0 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4"
              >
                <div className="flex flex-col gap-1">
                  <h3 id={`cost-option-title-${option.id}`} className="cc-text-h3 text-cc-ink">
                    {option.label}
                  </h3>
                  {saveStatus ? <div data-cost-option-save={option.id}>{saveStatus(option.id)}</div> : null}
                </div>

                <dl className="m-0 flex flex-col gap-3">
                  <CardValue label="Effort" chip={<EffortChip state={state} />} data={{ 'data-cost-option-effort': option.id }}>
                    {state === 'proposal' && proposal ? (
                      <span>{proposalWords(proposal)}</span>
                    ) : option.oneOff || option.perRelease ? (
                      <span className="flex flex-col">
                        <span>{option.oneOff ? oneOffWords(option.oneOff) : 'One-off effort: not entered'}</span>
                        <span>
                          {option.perRelease ? `then ${pairWords(option.perRelease, 'per release')}` : 'Effort per release: not entered'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-cc-ink-muted">Not entered yet.</span>
                    )}
                  </CardValue>
                  {effortDerived && basis ? (
                    <Derivation
                      title="How is this proposed?"
                      lines={effortDerivation(loc as number, proposal)}
                      basis={basis}
                      data={`effort-${option.id}`}
                    />
                  ) : null}

                  {baselineState ? (
                    <CardValue
                      label="Maintenance baseline per year"
                      chip={<EffortChip state={baselineState} data="data-baseline-chip" />}
                      data={{ 'data-cost-option-baseline': option.id }}
                    >
                      {baselineState === 'proposal' && baselineProposal ? (
                        <span data-cost-baseline-proposal={option.id}>{baselineWords(baselineProposal)}</span>
                      ) : option.maintenanceBaselinePerYear ? (
                        <span>{pairWords(option.maintenanceBaselinePerYear, 'per year')}</span>
                      ) : (
                        <span className="text-cc-ink-muted">Not entered yet.</span>
                      )}
                    </CardValue>
                  ) : null}
                  {baselineDerived && basis ? (
                    <Derivation
                      title="How is the baseline proposed?"
                      lines={baselineDerivation(loc as number, baselineProposal)}
                      basis={basis}
                      extra={baselineUpliftText(baselineProposal)}
                      data={`baseline-${option.id}`}
                    />
                  ) : null}

                  {isComparison ? (
                    <CardValue label="Upgrade deferral" data={{ 'data-cost-option-deferral': option.id }}>
                      {deferral ?? <span className="text-cc-ink-muted">Not stated yet.</span>}
                    </CardValue>
                  ) : null}
                </dl>

                {parts.effort || parts.baseline ? (
                  <div className="flex flex-col gap-2" data-cost-option-proposal={option.id}>
                    {/* The gap stays named: a proposal is not yet a figure (ADR-035). */}
                    <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">
                      Proposed for {proposedFor} — not yours until you take it over
                    </p>
                    <div className="cc-no-print">
                      <CcButton
                        variant={pending.length === 1 ? 'primary' : 'secondary'}
                        data-cost-apply-proposal={option.id}
                        onClick={() => patchOption(option.id, takeOverPatch(option, proposals))}
                      >
                        Take over the proposal as my figure
                      </CcButton>
                    </div>
                  </div>
                ) : null}

                <div data-cost-option-result={option.id} className="flex flex-col gap-2">
                  {openGroups.length > 0 ? (
                    <>
                      <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">Still needs</p>
                      <ul className="m-0 list-none space-y-3 p-0" data-cost-option-gaps={option.id}>
                        {openGroups.map((g) => (
                          <li
                            key={g.key}
                            data-cost-option-gap={g.key}
                            className="flex flex-col gap-1 rounded-cc-row border border-dashed border-cc-field-border p-3"
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              <CcStateText state="neutral" hollow>
                                Open
                              </CcStateText>
                              <span className="cc-text-cell font-semibold text-cc-ink">{g.label}</span>
                            </span>
                            <span className="cc-text-meta text-cc-ink-muted">{GROUP_HELP[g.key].what}</span>
                            <span className="cc-no-print flex flex-wrap gap-2">
                              <CcButton
                                variant="secondary"
                                data-cost-option-fill={`${option.id}:${g.key}`}
                                onClick={() => openAt(option.id, GROUP_HELP[g.key].field(option.id))}
                              >
                                {GROUP_HELP[g.key].action}
                              </CcButton>
                              {g.key === 'deferral' ? (
                                <CcButton
                                  data-cost-delay-not-determined-inline=""
                                  onClick={() => patchOption(option.id, { upgradeDelay: NOT_DETERMINED_DELAY })}
                                >
                                  Mark as not determined
                                </CcButton>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <div className="flex flex-col gap-1">
                    <p className="m-0 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
                      Cost:
                      {priced ? (
                        <span className="text-cc-ink">priced in step 4</span>
                      ) : (
                        // No figure is not a warning: it is the absence of a verdict (§1.1).
                        <span data-cost-option-not-determined={option.id}>
                          <CcProvenanceChip value="not-determined" />
                        </span>
                      )}
                    </p>
                    {!priced && blockers.length > 0 ? (
                      <div className="flex flex-col gap-1 cc-text-meta text-cc-ink-muted" data-cost-option-why={option.id}>
                        {shared.length > 0 ? (
                          <span className="flex flex-wrap items-center gap-x-1 gap-y-1">
                            <span>Waits for step 2:</span>
                            {shared.map((b, i) => (
                              <span key={b.label} className="inline-flex items-center">
                                <CcButton
                                  data-cost-option-go-to={b.field ?? ''}
                                  onClick={() => b.field && onGoToField?.(b.field)}
                                >
                                  {b.label}
                                </CcButton>
                                {i < shared.length - 1 ? <span aria-hidden={true}>,</span> : null}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        {own.length > 0 ? (
                          <span>
                            {shared.length > 0 ? 'And on this card: ' : 'Needs on this card: '}
                            {own.map((b) => b.label).join(', ')}.
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {priced && cost?.coverage.state === 'unconfirmed' ? (
                    <p className="m-0 flex items-start gap-1 cc-text-cell text-cc-warning">
                      <CircleAlert size={14} aria-hidden="true" className="mt-1 shrink-0" />
                      <span>{cost.coverage.sentence}</span>
                    </p>
                  ) : null}
                </div>

                <div className="mt-auto cc-no-print">
                  <CcButton
                    data-cost-option-edit={option.id}
                    aria-expanded={isEditing}
                    aria-controls={panelId}
                    onClick={() => onToggleEdit(option.id)}
                  >
                    {isEditing
                      ? 'Close the fields'
                      : state === 'proposal' || state === 'not-entered'
                        ? 'Enter my own figures'
                        : 'Change figures'}
                  </CcButton>
                </div>

                <div id={panelId} hidden={!isEditing} data-cost-option-fields={option.id}>
                  <div className="space-y-4 border-t border-cc-line pt-4 print:hidden">
                    <EffortGroup legend="One-off effort (range)" help={`${EFFORT_HELP.oneOff} ${EFFORT_HELP.devDays} ${EFFORT_HELP.testDays}`}>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          ['low', 'devDays', 'Low · dev days'],
                          ['low', 'testDays', 'Low · test days'],
                          ['high', 'devDays', 'High · dev days'],
                          ['high', 'testDays', 'High · test days'],
                        ] as const).map(([bound, key, label]) => (
                          <NumField
                            key={`${bound}-${key}`}
                            id={`${option.id}-oneoff-${bound}-${key === 'devDays' ? 'dev' : 'test'}`}
                            label={label}
                            value={fin(option.oneOff?.[bound][key])}
                            onChange={(v) => typed(option.id, { oneOff: withOneOffCorner(option, bound, key, v) })}
                          />
                        ))}
                      </div>
                    </EffortGroup>

                    <EffortFields
                      idPrefix={`${option.id}-per-release`}
                      label="Recurring effort per release"
                      help={`${EFFORT_HELP.perRelease} ${releases}`}
                      value={option.perRelease}
                      onChange={(v) => typed(option.id, { perRelease: v })}
                    />

                    {needsBaseline ? (
                      <EffortFields
                        idPrefix={`${option.id}-baseline`}
                        label="Maintenance baseline per year"
                        help={EFFORT_HELP.baseline}
                        value={option.maintenanceBaselinePerYear}
                        // Typed by hand is the reader's own, wherever the field started from.
                        onChange={(v) =>
                          patchOption(option.id, { maintenanceBaselinePerYear: v, baselineSource: 'stated' })
                        }
                      />
                    ) : null}

                    {isComparison ? (
                      <EffortGroup legend="Upgrade deferral" help={EFFORT_HELP.deferral}>
                        <NumField
                          id={`${option.id}-upgrade-delay`}
                          label="Releases deferred"
                          kind="deferral"
                          suffix="releases"
                          value={
                            option.upgradeDelay?.state === 'stated' ? option.upgradeDelay.value.releasesDeferred : null
                          }
                          onChange={(v) =>
                            patchOption(option.id, {
                              upgradeDelay: v === null ? null : { state: 'stated', value: { releasesDeferred: v } },
                            })
                          }
                        />
                        <CcButton
                          data-cost-delay-not-determined
                          onClick={() => patchOption(option.id, { upgradeDelay: NOT_DETERMINED_DELAY })}
                        >
                          Not determined
                        </CcButton>
                      </EffortGroup>
                    ) : null}
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Step 4's comparison: what each option costs over the time horizon, the
 * verdict — or the refusal, which is the point of roadmap 7.4 — and how far an
 * assumption may move before the answer changes.
 */
export function OptionVerdict({
  assumptions,
  comparison,
  currency,
}: {
  assumptions: CostAssumptions;
  comparison: CostComparison;
  currency: string;
}) {
  const winnerLabel = comparison.winner
    ? comparison.costs.find((c) => c.optionId === comparison.winner)?.label
    : null;
  const years = assumptions.horizonYears;
  const yearsWord =
    years === null ? '' : `${formatNumber(years, { maximumFractionDigits: 1 })} year${years === 1 ? '' : 's'}`;
  // Open by itself once there is a lead to overturn, until the reader decides otherwise.
  const [tippingChoice, setTippingChoice] = useState<boolean | null>(null);
  const tippingOpen = tippingChoice ?? comparison.tippingPoints.length > 0;
  return (
    <div className="space-y-4" data-cost-result="">
      <ul className="m-0 list-none divide-y divide-cc-line p-0" data-cost-totals="">
        {assumptions.options.map((option) => {
          const cost = comparison.costs.find((c) => c.optionId === option.id);
          const lead = comparison.winner === option.id;
          return (
            <li
              key={option.id}
              className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <span className="cc-text-identifier text-cc-ink">{option.label}</span>
                {lead ? <span className="ml-2 cc-text-meta font-semibold text-cc-ink">· lowest cost</span> : null}
                {cost && cost.total ? (
                  <span className="block cc-text-meta text-cc-ink-muted">
                    one-off {formatAmountRange(cost.oneOff, currency)} ·{' '}
                    {formatNumber(cost.releasesInHorizon, { maximumFractionDigits: 1 })} releases{' '}
                    {formatAmount(cost.runningTotal, currency)}
                    {BASELINE_KINDS.has(option.kind) ? ` · maintenance ${formatAmount(cost.baselineTotal, currency)}` : ''}
                  </span>
                ) : null}
              </div>
              {cost && cost.total ? (
                <span className="cc-text-h3 whitespace-nowrap text-cc-ink" data-cost-option-total={option.id}>
                  {formatAmountRange(cost.total, currency)}
                </span>
              ) : (
                <span>
                  <CcProvenanceChip value="not-determined" />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {yearsWord ? (
        <p className="m-0 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
          Total over {yearsWord}, as a range from the low and high one-off effort{' '}
          <CcProvenanceChip value="simulation" />
        </p>
      ) : null}

      <div className="border-t border-cc-line pt-4" data-cost-verdict="">
        {comparison.winner ? (
          <div data-cost-winner={comparison.winner}>
            <span className="flex flex-wrap items-center gap-2 cc-text-label text-cc-ink-muted">
              Lowest cost over the time horizon <CcProvenanceChip value="simulation" />
            </span>
            <h3 className="mt-1 cc-text-h2 text-cc-ink">{winnerLabel}</h3>
            <p className="mt-2 cc-text-body text-cc-ink-muted">
              Its upper bound is below every other option&rsquo;s lower bound, so the ordering does not depend on
              where inside the one-off range the effort lands. Lowest cost is not the same as the best decision.
            </p>
          </div>
        ) : (
          <div data-cost-no-winner={comparison.refusal?.code || 'unknown'}>
            <h3 className="cc-text-h3 text-cc-ink">No cheapest option yet</h3>
            <p className="mt-1 cc-text-body text-cc-ink">{refusalHeadline(comparison, assumptions.options)}</p>
            {comparison.refusal?.sentence ? (
              <div className="mt-2">
                <CcDisclosure title="The full reason">
                  <p className="cc-text-cell text-cc-ink-muted" data-cost-refusal-sentence>
                    {comparison.refusal.sentence}
                  </p>
                </CcDisclosure>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-4 border-t border-cc-line pt-3">
          <CcDisclosure
            title="How far an assumption has to move before the answer changes"
            open={tippingOpen}
            onOpenChange={setTippingChoice}
          >
            {comparison.tippingPoints.length > 0 ? (
              <ul className="space-y-2" data-cost-tipping-points>
                {comparison.tippingPoints.map((point) => {
                  const found = point.risesBy !== null || point.fallsBy !== null;
                  return (
                    <li
                      key={point.field}
                      data-cost-tipping-field={point.field}
                      data-cost-tipping-found={found ? 'yes' : 'no'}
                      className={`cc-text-cell ${found ? 'text-cc-ink font-semibold' : 'text-cc-ink-muted'}`}
                    >
                      {point.sentence}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="cc-text-cell text-cc-ink-muted" data-cost-tipping-points-empty>
                {comparison.tippingPointsSentence}
              </p>
            )}
            <p className="mt-3 cc-text-meta text-cc-ink-muted">
              Each distance is solved from the figures you stated, not sampled at a chosen spread. It says
              where the answer flips, not how likely that is &mdash; nothing here knows the distribution of a day rate.
            </p>
          </CcDisclosure>
        </div>

        {/* The revision every amount comes from — a technical name, one level deeper. */}
        <div className="mt-2">
          <CcDisclosure title="Technical details">
            <p className="cc-text-meta text-cc-ink-muted">
              Assumption revision:{' '}
              <code data-cost-revision className="font-cc-mono text-cc-ink break-all">
                {comparison.revision}
              </code>
            </p>
          </CcDisclosure>
        </div>
      </div>
    </div>
  );
}
