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
import { Scale, AlertTriangle, Sigma } from 'lucide-react';

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
  return (
    <label className="block space-y-1">
      <span className="flex justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-700">
        <span>{label}</span>
        <span className={value === null ? 'text-amber-600' : 'text-blue-650'}>
          {value === null ? 'Your figure' : value.toLocaleString('en-GB')}
        </span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value ?? ''}
        placeholder="— enter your figure"
        data-cost-field={id}
        onChange={(e) => onChange(num(e.target.value))}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
          value === null ? 'border-amber-300' : 'border-gray-200'
        }`}
      />
      {hint ? <span className="block text-[10px] font-medium text-gray-400">{hint}</span> : null}
    </label>
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
      <legend className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</legend>
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
    <section className="space-y-6" data-cost-comparison>
      <div className="bg-white border border-gray-150 rounded-[2rem] p-6 md:p-8 shadow-sm print:hidden">
        <h2 className="text-lg font-black uppercase text-[#0b1c30] flex items-center gap-2">
          <Scale className="w-5 h-5 text-blue-600" />
          Options and costs
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Every amount below comes from one revision of the assumptions you state here — there is no
          default currency, no default day rate and no default observation period. While an option is
          missing a mandatory field, no option is called cheapest.
        </p>

        {/* The shared assumptions. */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
          <label className="block space-y-1">
            <span className="flex justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-700">
              <span>Currency</span>
              <span className={currency ? 'text-blue-650' : 'text-amber-600'}>
                {currency || 'Yours to state'}
              </span>
            </span>
            <input
              type="text"
              value={currency}
              maxLength={8}
              placeholder="e.g. EUR — no default"
              data-cost-field="currency"
              onChange={(e) => onCurrencyChange(e.target.value.trim().toUpperCase())}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                currency ? 'border-gray-200' : 'border-amber-300'
              }`}
            />
            <span className="block text-[10px] font-medium text-gray-400">
              The currency your day rates are in &mdash; for this panel and for the forecast above it.
              Nothing here assumes one.
            </span>
          </label>

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
            <label className="flex items-start gap-2 text-[11px] font-semibold text-slate-600">
              <input
                type="checkbox"
                data-cost-field="release-cadence-confirmed"
                checked={assumptions.releaseCadence?.confirmed ?? false}
                disabled={!assumptions.releaseCadence}
                onChange={(e) =>
                  patch(
                    assumptions.releaseCadence
                      ? { releaseCadence: { ...assumptions.releaseCadence, confirmed: e.target.checked } }
                      : {},
                  )
                }
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              <span>
                I confirm this cadence. Until then it is a proposal, and no amount is shown
                (ADR&#8209;035).
              </span>
            </label>
          </div>
        </div>

        {proposal ? (
          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs leading-relaxed text-amber-900" data-cost-proposal>
            <strong>A proposal, not a field.</strong> {proposal.sentence} Use the buttons on each option
            to take it over; nothing applies it for you.
          </p>
        ) : null}
      </div>

      {/* One card per option: the fields, then what it costs or why it does not. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {assumptions.options.map((option) => {
          const cost = comparison.costs.find((c) => c.optionId === option.id);
          const isComparison = option.kind === COMPARISON_KIND;
          const needsBaseline = BASELINE_KINDS.has(option.kind);
          return (
            <div
              key={option.id}
              data-cost-option={option.id}
              className={`rounded-[2rem] border bg-white p-6 shadow-sm ${
                comparison.winner === option.id ? 'border-green-500' : 'border-gray-150'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-black uppercase tracking-wide text-[#0b1c30]">{option.label}</h3>
                {isComparison ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-600">
                    Comparison option
                  </span>
                ) : null}
              </div>

              <div className="mt-4 space-y-4 print:hidden">
                <fieldset className="space-y-2">
                  <legend className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                    One-off effort (range)
                  </legend>
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
                    <button
                      type="button"
                      data-cost-apply-proposal={option.id}
                      onClick={() =>
                        patchOption(option.id, {
                          oneOff: proposal.oneOff,
                          perRelease: proposal.perRelease,
                          effortSource: 'proposal-confirmed',
                        })
                      }
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                    >
                      Take over the proposal, as my figure
                    </button>
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
                    <legend className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Upgrade deferral
                    </legend>
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
                    <button
                      type="button"
                      data-cost-delay-not-determined
                      onClick={() =>
                        patchOption(option.id, {
                          upgradeDelay: {
                            state: 'not-determined',
                            reason: 'nobody has established how far the upgrade would slip',
                          },
                        })
                      }
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                    >
                      Not determined
                    </button>
                  </fieldset>
                ) : null}
              </div>

              {/* What it costs, or the sentence that says why it does not. */}
              <div className="mt-5 border-t border-gray-100 pt-4" data-cost-option-result={option.id}>
                {cost && cost.total ? (
                  <>
                    <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Total over the observation period
                    </span>
                    <p className="mt-1 text-lg font-black text-slate-900" data-cost-option-total={option.id}>
                      {formatAmountRange(cost.total, currency)}
                    </p>
                    <dl className="mt-3 space-y-1 text-[11px] font-semibold text-slate-500">
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
                      <p className="mt-3 text-[11px] leading-relaxed text-amber-700">{cost.coverage.sentence}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-black text-amber-600" data-cost-option-not-determined={option.id}>
                      Not determined
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
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
      <div className="rounded-[2rem] border border-gray-150 bg-white p-6 md:p-8 shadow-sm">
        {comparison.winner ? (
          <div data-cost-winner={comparison.winner}>
            <span className="block text-[10px] font-black uppercase tracking-widest text-green-650">
              Lowest cost over the observation period
            </span>
            <h3 className="mt-1 text-2xl font-black text-slate-900">
              {comparison.costs.find((c) => c.optionId === comparison.winner)?.label}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Its upper bound is below every other option&rsquo;s lower bound, so the ordering does not
              depend on where inside the one-off range the effort lands. Lowest cost is not the same as
              best decision; this panel prices options and decides nothing.
            </p>
          </div>
        ) : (
          <div data-cost-no-winner={comparison.refusal?.code || 'unknown'}>
            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-600">
              <AlertTriangle className="w-4 h-4" /> No cheapest option
            </span>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{comparison.refusal?.sentence}</p>
          </div>
        )}

        <div className="mt-6 border-t border-gray-100 pt-5">
          <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
            <Sigma className="w-4 h-4" /> How far an assumption has to move before the answer changes
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
                    className={`text-[12px] leading-relaxed ${found ? 'text-amber-700 font-semibold' : 'text-slate-600'}`}
                  >
                    {point.sentence}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-[12px] leading-relaxed text-slate-500" data-cost-tipping-points-empty>
              {comparison.tippingPointsSentence}
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Each distance is solved from the figures you stated, not sampled at a chosen spread. It says
            where the answer flips, not how likely that is &mdash; nothing here knows the distribution of a day rate.
          </p>
        </div>

        <p className="mt-6 border-t border-gray-100 pt-4 text-[11px] font-semibold text-slate-500">
          Assumption revision: <code data-cost-revision className="font-mono text-slate-700">{comparison.revision}</code>
        </p>
      </div>
    </section>
  );
}
