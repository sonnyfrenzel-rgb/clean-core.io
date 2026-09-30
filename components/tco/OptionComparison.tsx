'use client';

/**
 * Options with costs — roadmap 7.4, the screen half.
 *
 * Every amount on this panel comes out of one revision of stated assumptions
 * (`lib/cost-assumptions.ts`), and the panel shows which revision under the
 * figures. Nothing here has a default: no currency, no day rate, no observation
 * period, no effort. A field nobody filled in is a named gap with a sentence,
 * never a zero — and while any option is missing a mandatory field, the
 * comparison refuses to name a cheapest one and says which option stopped it.
 *
 * `lib/tco-model.ts` and the forecast above this panel are a different thing
 * and stay a different thing: that is a demonstration of one modernisation
 * against assumed coefficients; this prices options against each other,
 * including doing nothing.
 */

import { useMemo, useState } from 'react';
import {
  COMPARISON_KIND,
  BASELINE_KINDS,
  COST_ASSUMPTIONS_VERSION,
  costComparison,
  emptyCostAssumptions,
  formatAmount,
  formatAmountRange,
  proposeEffort,
  type CostAssumptions,
  type CostOption,
  type EffortDays,
} from '@/lib/cost-assumptions';
import { Scale, AlertTriangle, Sigma, CircleAlert } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCheckbox from '@/components/cc/Checkbox';
import CcField, { CcRequiredNote } from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { CcTag } from '@/components/cc/Tag';

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
 * The card of this stage (DESIGN.md §1.4), with the print rule of §7.1 that
 * `cc-card` carries: outlined, never torn across a page.
 */
const CARD = 'cc-card rounded-cc-card border bg-cc-surface shadow-cc';

/**
 * A figure the reader states. Every field on this panel is mandatory (ADR-035),
 * so every one carries the asterisk and `aria-required`. An empty field says
 * so once the reader has left it (§2.7: on blur, not on the first keystroke);
 * until then the option's own "Not determined" below names the gap.
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
          placeholder="— enter your figure"
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
    <fieldset className="space-y-2">
      <legend className="cc-text-label text-cc-ink-muted">{label}</legend>
      <div className="grid grid-cols-2 gap-3">
        <NumField id={`${idPrefix}-dev`} label="Dev days" value={shown('devDays')} onChange={(v) => set('devDays', v)} />
        <NumField id={`${idPrefix}-test`} label="Test days" value={shown('testDays')} onChange={(v) => set('testDays', v)} />
      </div>
    </fieldset>
  );
}

/**
 * The currency is the stage's, not the panel's (roadmap 7.11).
 *
 * It is still stated exactly once, in the field below, and still has no
 * default. What changed is where the value lives: the page holds it, so the
 * forecast above this panel prices in the same unit instead of printing a euro
 * sign nobody chose. Every other assumption here stays local to the panel —
 * the forecast above does not read a day rate of this comparison.
 */
export default function OptionComparison({
  loc,
  currency,
  onCurrencyChange,
}: {
  loc: number | null;
  currency: string;
  onCurrencyChange: (currency: string) => void;
}) {
  const [stated, setStated] = useState<CostAssumptions>(() => ({
    ...emptyCostAssumptions(),
    version: COST_ASSUMPTIONS_VERSION,
    options: SEED_OPTIONS,
  }));

  // One record, and the currency in it is the stage's.
  const assumptions = useMemo<CostAssumptions>(() => ({ ...stated, currency }), [stated, currency]);

  const proposal = useMemo(() => proposeEffort(loc), [loc]);
  const comparison = useMemo(() => costComparison(assumptions), [assumptions]);

  const patch = (p: Partial<CostAssumptions>) => setStated((a) => ({ ...a, ...p }));
  const patchOption = (id: string, p: Partial<CostOption>) =>
    setStated((a) => ({ ...a, options: a.options.map((o) => (o.id === id ? { ...o, ...p } : o)) }));

  return (
    <section className="space-y-4" data-cost-comparison aria-labelledby="cost-comparison-title">
      <div className={`p-4 md:p-6 print:hidden border-cc-line ${CARD}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cost-comparison-title" className="cc-text-h2 text-cc-ink flex items-center gap-2">
            <Scale size={16} aria-hidden="true" className="text-cc-ink-muted" />
            Options and costs
          </h2>
          <CcRequiredNote />
        </div>
        <p className="mt-2 cc-text-body text-cc-ink-muted">
          Every amount below comes from one revision of the assumptions you state here — there is no
          default currency, no default day rate and no default observation period. While an option is
          missing a mandatory field, no option is called cheapest.
        </p>

        {/* The shared assumptions. */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
          <CurrencyField currency={currency} onCurrencyChange={onCurrencyChange} />

          <NumField
            id="dev-day-rate"
            label="Development day rate"
            value={assumptions.devDayRate}
            onChange={(v) => patch({ devDayRate: v })}
            hint="Your rate for development effort."
          />
          <NumField
            id="test-day-rate"
            label="Test / key-user day rate"
            value={assumptions.testDayRate}
            onChange={(v) => patch({ testDayRate: v })}
            hint="Your rate for the people who run the regression tests."
          />
          <NumField
            id="horizon-years"
            label="Observation period (years)"
            value={assumptions.horizonYears}
            onChange={(v) => patch({ horizonYears: v })}
            hint="One-off and running effort are only comparable over a period you name."
          />

          <div className="space-y-2">
            <NumField
              id="release-cadence"
              label="Releases per year"
              value={assumptions.releaseCadence?.perYear ?? null}
              onChange={(v) =>
                patch({ releaseCadence: v === null ? null : { perYear: v, confirmed: false } })
              }
              hint="How often the running effort falls due."
            />
            {/* The confirmation is part of the mandatory cadence (ADR-035). */}
            <div data-cost-field="release-cadence-confirmed">
              <CcCheckbox
                label={'I confirm this cadence. Until then it is a proposal, and no amount is shown (ADR‑035).'}
                required
                checked={assumptions.releaseCadence?.confirmed ?? false}
                disabled={!assumptions.releaseCadence}
                onChange={(checked) =>
                  patch(
                    assumptions.releaseCadence
                      ? { releaseCadence: { ...assumptions.releaseCadence, confirmed: checked } }
                      : {},
                  )
                }
              />
            </div>
          </div>
        </div>

        {proposal ? (
          <div className="mt-6" data-cost-proposal>
            <CcMessageStrip state="warning" headline="A proposal, not a field.">
              {proposal.sentence} Use the buttons on each option to take it over; nothing applies it for you.
            </CcMessageStrip>
          </div>
        ) : null}
      </div>

      {/* One card per option: the fields, then what it costs or why it does not. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {assumptions.options.map((option) => {
          const cost = comparison.costs.find((c) => c.optionId === option.id);
          const isComparison = option.kind === COMPARISON_KIND;
          const needsBaseline = BASELINE_KINDS.has(option.kind);
          return (
            <div
              key={option.id}
              data-cost-option={option.id}
              // The lowest-cost option is outlined in ink, not green: lowest
              // cost is a priced comparison, not a proof (§1.1), and the
              // verdict below names it in words.
              className={`p-4 md:p-6 ${CARD} ${
                comparison.winner === option.id ? 'border-cc-ink' : 'border-cc-line'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="cc-text-h3 text-cc-ink">{option.label}</h3>
                {isComparison ? <CcTag>Comparison option</CcTag> : null}
              </div>

              <div className="mt-4 space-y-4 print:hidden">
                <fieldset className="space-y-2">
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
                  label="Running effort per release"
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
                  <fieldset className="space-y-2">
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

              {/* What it costs, or the sentence that says why it does not. */}
              <div className="mt-4 border-t border-cc-line pt-4" data-cost-option-result={option.id}>
                {cost && cost.total ? (
                  <>
                    <span className="block cc-text-label text-cc-ink-muted">
                      Total over the observation period
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
                    {/* No figure is not a warning: it is the absence of a
                        verdict, and it stands neutral (§1.1). */}
                    <p className="cc-text-h3 text-cc-ink" data-cost-option-not-determined={option.id}>
                      Not determined
                    </p>
                    <p className="mt-1 cc-text-cell text-cc-ink-muted">
                      {cost?.coverage.sentence || 'No assumptions carry an amount for this option yet.'}
                    </p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* The verdict — or the refusal, which is the point of the step. */}
      <div className={`p-4 md:p-6 border-cc-line ${CARD}`}>
        {comparison.winner ? (
          <div data-cost-winner={comparison.winner}>
            <span className="block cc-text-label text-cc-ink-muted">
              Lowest cost over the observation period
            </span>
            <h3 className="mt-1 text-[22px] font-bold tracking-tight text-cc-ink">
              {comparison.costs.find((c) => c.optionId === comparison.winner)?.label}
            </h3>
            <p className="mt-2 cc-text-body text-cc-ink-muted">
              Its upper bound is below every other option&rsquo;s lower bound, so the ordering does not
              depend on where inside the one-off range the effort lands. Lowest cost is not the same as
              best decision; this panel prices options and decides nothing.
            </p>
          </div>
        ) : (
          <div data-cost-no-winner={comparison.refusal?.code || 'unknown'}>
            <span className="flex items-center gap-2 cc-text-label text-cc-ink-muted">
              <AlertTriangle size={16} aria-hidden="true" /> No cheapest option
            </span>
            <p className="mt-2 cc-text-body text-cc-ink">{comparison.refusal?.sentence}</p>
          </div>
        )}

        <div className="mt-6 border-t border-cc-line pt-4">
          <span className="flex items-center gap-2 cc-text-label text-cc-ink-muted">
            <Sigma size={16} aria-hidden="true" /> How far an assumption has to move before the answer changes
          </span>
          {comparison.tippingPoints.length > 0 ? (
            <ul className="mt-3 space-y-2" data-cost-tipping-points>
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
            <p className="mt-3 cc-text-cell text-cc-ink-muted" data-cost-tipping-points-empty>
              {comparison.tippingPointsSentence}
            </p>
          )}
          <p className="mt-3 cc-text-meta text-cc-ink-muted">
            Each distance is solved from the figures you stated, not sampled at a chosen spread. It says
            where the answer flips, not how likely that is &mdash; nothing here knows the distribution of a day rate.
          </p>
        </div>

        <p className="mt-6 border-t border-cc-line pt-4 cc-text-meta text-cc-ink-muted">
          Assumption revision: <code data-cost-revision className="font-cc-mono text-cc-ink">{comparison.revision}</code>
        </p>
      </div>
    </section>
  );
}

/**
 * The stage's currency (roadmap 7.11), stated here once and nowhere else.
 * Mandatory (ADR-035) and without a default; an empty field says so once the
 * reader has left it.
 */
function CurrencyField({
  currency,
  onCurrencyChange,
}: {
  currency: string;
  onCurrencyChange: (currency: string) => void;
}) {
  const [left, setLeft] = useState(false);
  const missing = !currency && left;
  return (
    <CcField
      label="Currency"
      required
      help={
        <>
          The currency your day rates are in &mdash; for this panel and for the forecast above it.
          Nothing here assumes one.
        </>
      }
      valueState={missing ? 'warning' : undefined}
      message={missing ? 'Yours to state — there is no default.' : undefined}
    >
      {({ id, describedBy, ariaRequired, className }) => (
        <input
          id={id}
          type="text"
          value={currency}
          maxLength={8}
          placeholder="e.g. EUR — no default"
          data-cost-field="currency"
          aria-required={ariaRequired}
          aria-describedby={describedBy}
          onBlur={() => setLeft(true)}
          onChange={(e) => onCurrencyChange(e.target.value.trim().toUpperCase())}
          className={className}
        />
      )}
    </CcField>
  );
}
