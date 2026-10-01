'use client';

/**
 * Options with costs — roadmap 7.4, the screen half.
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
  type EffortDays,
  type EffortProposal,
} from '@/lib/cost-assumptions';
import { CircleAlert, CircleDashed } from 'lucide-react';
import { GroupMeter } from '@/components/tco/EconomicsObjectPage';
import CcButton from '@/components/cc/Button';
import CcField from '@/components/cc/Field';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';

/**
 * The options the panel offers, by name only. A label is not a figure: every
 * effort below starts empty, and *Do nothing* is here because 7.4 requires the
 * comparison to carry it.
 */
const SEED_OPTIONS: CostOption[] = [
  {
    id: 'do-nothing',
    kind: COMPARISON_KIND,
    label: 'Do nothing',
    oneOff: null,
    perRelease: null,
    maintenanceBaselinePerYear: null,
    upgradeDelay: null,
    effortSource: 'stated',
  },
  {
    id: 'keep',
    kind: 'keep',
    label: 'Keep and maintain',
    oneOff: null,
    perRelease: null,
    maintenanceBaselinePerYear: null,
    upgradeDelay: null,
    effortSource: 'stated',
  },
  {
    id: 'standard',
    kind: 'standard',
    label: 'Move to standard',
    oneOff: null,
    perRelease: null,
    maintenanceBaselinePerYear: null,
    upgradeDelay: null,
    effortSource: 'stated',
  },
];

/**
 * The assumptions the stage starts from: every figure absent, the three options
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

function optionGroups(cost: CostComparison['costs'][number] | undefined, option: CostOption): OptionGroup[] {
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
      return 'No option can be priced until the open figures in the checklist above are filled in.';
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
 * The options, each a card with what it still lacks (or what it costs), its
 * fields behind "Fill in", and the verdict under them — or the refusal, which
 * is the point of roadmap 7.4.
 */
export default function OptionComparison({
  assumptions,
  comparison,
  currency,
  proposal,
  onPatchOption,
  editing,
  onToggleEdit,
}: {
  assumptions: CostAssumptions;
  comparison: CostComparison;
  proposal: EffortProposal | null;
  currency: string;
  onPatchOption: (id: string, patch: Partial<CostOption>) => void;
  /**
   * Which option cards show their fields — closed by default, so a card reads
   * as what the option still lacks first and as a form on "Fill in". Held by
   * the page, because "Take over per option" opens all of them.
   */
  editing: ReadonlySet<string>;
  onToggleEdit: (id: string) => void;
}) {
  const patchOption = onPatchOption;
  const winnerLabel = comparison.winner
    ? comparison.costs.find((c) => c.optionId === comparison.winner)?.label
    : null;
  const years = assumptions.horizonYears;
  // Open by itself once there is a lead to overturn, until the reader decides otherwise.
  const [tippingChoice, setTippingChoice] = useState<boolean | null>(null);
  const tippingOpen = tippingChoice ?? comparison.tippingPoints.length > 0;
  return (
    <div className="space-y-4" data-cost-comparison="">
      {/* One card per option: what it still lacks or what it costs, then its fields. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {assumptions.options.map((option) => {
          const cost = comparison.costs.find((c) => c.optionId === option.id);
          const isComparison = option.kind === COMPARISON_KIND;
          const needsBaseline = BASELINE_KINDS.has(option.kind);
          const groups = optionGroups(cost, option);
          const openGroups = groups.filter((g) => g.open);
          const priced = Boolean(cost && cost.total);
          const isEditing = editing.has(option.id);
          const panelId = `cost-option-fields-${option.id}`;
          return (
            <article
              key={option.id}
              data-cost-option={option.id}
              aria-labelledby={`cost-option-title-${option.id}`}
              // The lowest-cost option is outlined in ink, not green: lowest
              // cost is a priced comparison, not a proof (§1.1), and the
              // verdict below names it in words.
              className={`cc-card flex min-w-0 flex-col gap-3 rounded-cc-card border bg-cc-surface p-4 ${
                comparison.winner === option.id ? 'border-cc-ink' : 'border-cc-line'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id={`cost-option-title-${option.id}`} className="cc-text-h3 text-cc-ink">
                  {option.label}
                </h3>
                {priced ? (
                  <CcProvenanceChip value="simulation" />
                ) : (
                  // No figure is not a warning: it is the absence of a verdict,
                  // and it stands neutral (§1.1).
                  <span data-cost-option-not-determined={option.id}>
                    <CcProvenanceChip value="not-determined" />
                  </span>
                )}
              </div>

              <GroupMeter
                filled={groups.length - openGroups.length}
                total={groups.length}
                label={`${option.label}: mandatory groups stated`}
              />

              <div data-cost-option-result={option.id}>
                {cost && cost.total ? (
                  <>
                    <span className="flex flex-wrap items-center gap-2 cc-text-label text-cc-ink-muted">
                      Total over {years} year{years === 1 ? '' : 's'}
                      <CcProvenanceChip value="simulation" />
                    </span>
                    <p className="mt-1 cc-text-h2 text-cc-ink" data-cost-option-total={option.id}>
                      {formatAmountRange(cost.total, currency)}
                    </p>
                    <dl className="mt-3 space-y-1 cc-text-cell text-cc-ink-muted">
                      <div className="flex justify-between gap-2">
                        <dt>One-off</dt>
                        <dd>{formatAmountRange(cost.oneOff, currency)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Per release &times; {cost.releasesInHorizon}</dt>
                        <dd>{formatAmount(cost.runningTotal, currency)}</dd>
                      </div>
                      {needsBaseline ? (
                        <div className="flex justify-between gap-2">
                          <dt>Maintenance baseline</dt>
                          <dd>{formatAmount(cost.baselineTotal, currency)}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {cost.coverage.state === 'unconfirmed' ? (
                      // Something to check, so the warning state — with its
                      // icon, never the colour alone (§2.7).
                      <p className="mt-3 flex items-start gap-1 cc-text-cell text-cc-warning">
                        <CircleAlert size={14} aria-hidden="true" className="mt-1 shrink-0" />
                        <span>{cost.coverage.sentence}</span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">
                      {openGroups.length === 0
                        ? 'Its own figures are in; it waits for the open rows of the checklist.'
                        : `${openGroups.length} mandatory group${openGroups.length === 1 ? '' : 's'} open`}
                    </p>
                    {openGroups.length > 0 ? (
                      <ul className="m-0 mt-2 list-none space-y-1 p-0" data-cost-option-gaps={option.id}>
                        {openGroups.map((g) => (
                          <li key={g.key} className="flex items-center gap-2 cc-text-cell text-cc-ink">
                            <CircleDashed size={14} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
                            <span>{g.label}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>

              <div className="cc-no-print">
                <CcButton
                  data-cost-option-edit={option.id}
                  aria-expanded={isEditing}
                  aria-controls={panelId}
                  onClick={() => onToggleEdit(option.id)}
                >
                  {isEditing ? 'Close' : priced ? 'Change' : 'Fill in'}
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
                        onChange={(v) =>
                          patchOption(option.id, { oneOff: withOneOffCorner(option, bound, key, v) })
                        }
                      />
                    ))}
                  </div>
                  {proposal ? (
                    <CcButton
                      data-cost-apply-proposal={option.id}
                      onClick={() =>
                        patchOption(option.id, {
                          oneOff: proposal.oneOff,
                          perRelease: proposal.perRelease,
                          effortSource: 'proposal-confirmed',
                        })
                      }
                    >
                      Take over the proposal, as my figure
                    </CcButton>
                  ) : null}
                </fieldset>

                <EffortFields
                  idPrefix={`${option.id}-per-release`}
                  label="Recurring effort per release"
                  value={option.perRelease}
                  onChange={(v) => patchOption(option.id, { perRelease: v })}
                />

                {needsBaseline ? (
                  <EffortFields
                    idPrefix={`${option.id}-baseline`}
                    label="Maintenance baseline per year"
                    value={option.maintenanceBaselinePerYear}
                    onChange={(v) => patchOption(option.id, { maintenanceBaselinePerYear: v })}
                  />
                ) : null}

                {isComparison ? (
                  <fieldset className="min-w-0 space-y-2">
                    <legend className="cc-text-label text-cc-ink-muted">Upgrade deferral</legend>
                    <NumField
                      id={`${option.id}-upgrade-delay`}
                      label="Releases deferred"
                      value={
                        option.upgradeDelay?.state === 'stated'
                          ? option.upgradeDelay.value.releasesDeferred
                          : null
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
          );
        })}
      </div>

      {/* The verdict — or the refusal in a few words, with the whole reason one click deeper. */}
      <div className="border-t border-cc-line pt-4" data-cost-verdict="">
        {comparison.winner ? (
          <div data-cost-winner={comparison.winner}>
            <span className="flex flex-wrap items-center gap-2 cc-text-label text-cc-ink-muted">
              Lowest cost over the time horizon <CcProvenanceChip value="simulation" />
            </span>
            <h3 className="mt-1 cc-text-h2 text-cc-ink">{winnerLabel}</h3>
            <p className="mt-2 cc-text-body text-cc-ink-muted">
              Its upper bound is below every other option&rsquo;s lower bound, so the ordering does not
              depend on where inside the one-off range the effort lands. Lowest cost is not the same as
              best decision; this panel prices options and decides nothing.
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
