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

import { useState } from 'react';
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
} from '@/lib/cost-assumptions';
import { CircleAlert, CircleDashed } from 'lucide-react';
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

const num = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
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
 * so every one carries the asterisk and `aria-required`. An empty field says
 * so once the reader has left it (§2.7: on blur, not on the first keystroke).
 */
function NumField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
}) {
  const [left, setLeft] = useState(false);
  const missing = value === null && left;
  return (
    <CcField
      label={label}
      required
      help={hint}
      valueState={missing ? 'warning' : undefined}
      message={missing ? 'Your figure — there is no default.' : undefined}
    >
      {({ id: controlId, describedBy, ariaRequired, className }) => (
        <input
          id={controlId}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={value ?? ''}
          placeholder="enter your figure"
          data-cost-field={id}
          aria-required={ariaRequired}
          aria-describedby={describedBy}
          onBlur={() => setLeft(true)}
          onChange={(e) => onChange(num(e.target.value))}
          className={className}
        />
      )}
    </CcField>
  );
}

/** A dev/test day pair. Both halves, because both day rates are mandatory. */
function EffortFields({
  idPrefix,
  label,
  value,
  onChange,
}: {
  idPrefix: string;
  label: string;
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
    <fieldset className="min-w-0 space-y-2">
      <legend className="cc-text-label text-cc-ink-muted">{label}</legend>
      <div className="grid grid-cols-2 gap-3">
        <NumField id={`${idPrefix}-dev`} label="Dev days" value={shown('devDays')} onChange={(v) => set('devDays', v)} />
        <NumField id={`${idPrefix}-test`} label="Test days" value={shown('testDays')} onChange={(v) => set('testDays', v)} />
      </div>
    </fieldset>
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

/**
 * Step 3: one card per option — where its effort stands, the proposal and the
 * one action that takes it over, what the option still lacks, and its fields
 * behind "Enter my own figures".
 */
export default function OptionComparison({
  assumptions,
  comparison,
  proposal,
  baselineProposal,
  onPatchOption,
  editing,
  onToggleEdit,
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
}) {
  const patchOption = onPatchOption;
  // A figure typed by hand is the reader's own, wherever the field started from.
  const typed = (id: string, p: Partial<CostOption>) => patchOption(id, { ...p, effortSource: 'stated' });
  const proposals: OptionProposals = { effort: proposal, baseline: baselineProposal };
  const pending = pendingProposals(assumptions.options, proposals);
  return (
    <div data-cost-comparison="">
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-3">
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
          const isEditing = editing.has(option.id);
          const panelId = `cost-option-fields-${option.id}`;
          return (
            <li key={option.id} className="min-w-0">
              <article
                data-cost-option={option.id}
                data-effort-provenance={state}
                data-baseline-provenance={baselineState ?? undefined}
                aria-labelledby={`cost-option-title-${option.id}`}
                className="cc-card flex h-full min-w-0 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id={`cost-option-title-${option.id}`} className="cc-text-h3 text-cc-ink">
                    {option.label}
                  </h3>
                  <EffortChip state={state} />
                </div>

                {baselineState ? (
                  <p
                    className="m-0 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted"
                    data-cost-option-baseline={option.id}
                  >
                    Maintenance baseline per year:
                    <EffortChip state={baselineState} data="data-baseline-chip" />
                  </p>
                ) : null}

                {parts.effort || parts.baseline ? (
                  <div className="flex flex-col gap-2" data-cost-option-proposal={option.id}>
                    {/* The gap stays named: a proposal is not yet a figure (ADR-035). */}
                    <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">
                      Proposed for {proposedFor} — not yours until you take it over
                    </p>
                    {parts.effort && proposal ? (
                      <p className="m-0 cc-text-cell text-cc-ink">{proposalWords(proposal)}</p>
                    ) : null}
                    {parts.baseline && baselineProposal ? (
                      <p className="m-0 cc-text-cell text-cc-ink" data-cost-baseline-proposal={option.id}>
                        {baselineWords(baselineProposal)}
                      </p>
                    ) : null}
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
                      <ul className="m-0 list-none space-y-1 p-0" data-cost-option-gaps={option.id}>
                        {openGroups.map((g) => (
                          <li key={g.key} className="flex items-center gap-2 cc-text-cell text-cc-ink">
                            <CircleDashed size={14} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
                            <span>{g.label}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
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
                      ? 'Close'
                      : state === 'proposal' || state === 'not-entered'
                        ? 'Enter my own figures'
                        : openGroups.length > 0
                          ? 'Fill in'
                          : 'Change figures'}
                  </CcButton>
                </div>

                <div id={panelId} hidden={!isEditing} data-cost-option-fields={option.id}>
                  <div className="space-y-4 border-t border-cc-line pt-4 print:hidden">
                    <fieldset className="min-w-0 space-y-2">
                      <legend className="cc-text-label text-cc-ink-muted">One-off effort (range)</legend>
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
                    </fieldset>

                    <EffortFields
                      idPrefix={`${option.id}-per-release`}
                      label="Recurring effort per release"
                      value={option.perRelease}
                      onChange={(v) => typed(option.id, { perRelease: v })}
                    />

                    {needsBaseline ? (
                      <EffortFields
                        idPrefix={`${option.id}-baseline`}
                        label="Maintenance baseline per year"
                        value={option.maintenanceBaselinePerYear}
                        // Typed by hand is the reader's own, wherever the field started from.
                        onChange={(v) =>
                          patchOption(option.id, { maintenanceBaselinePerYear: v, baselineSource: 'stated' })
                        }
                      />
                    ) : null}

                    {isComparison ? (
                      <fieldset className="min-w-0 space-y-2">
                        <legend className="cc-text-label text-cc-ink-muted">Upgrade deferral</legend>
                        <NumField
                          id={`${option.id}-upgrade-delay`}
                          label="Releases deferred"
                          value={
                            option.upgradeDelay?.state === 'stated' ? option.upgradeDelay.value.releasesDeferred : null
                          }
                          onChange={(v) =>
                            patchOption(option.id, {
                              upgradeDelay: v === null ? null : { state: 'stated', value: { releasesDeferred: v } },
                            })
                          }
                          hint="Not priced — nothing here knows what a deferred upgrade costs. Stated, because it is part of what doing nothing is."
                        />
                        <CcButton
                          data-cost-delay-not-determined
                          onClick={() =>
                            patchOption(option.id, {
                              upgradeDelay: {
                                state: 'not-determined',
                                reason: 'nobody has established how far the upgrade would slip',
                              },
                            })
                          }
                        >
                          Not determined
                        </CcButton>
                      </fieldset>
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
