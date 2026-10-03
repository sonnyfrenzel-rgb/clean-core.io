'use client';

import React, { useMemo } from 'react';
import CcButton from '@/components/cc/Button';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcDisclosure from '@/components/cc/Disclosure';
import GlossaryTerm from '@/components/GlossaryTerm';
import { EconomicsGuide, EconomicsStep, type EconomicsStepInfo } from '@/components/tco/EconomicsSteps';
import { formatDays, formatLines, formatNumber, formatPercentValue } from '@/lib/format';
import { tcoForecast, TCO_TARGET_SCORE } from '@/lib/tco-model';

/**
 * Economics in the demo — a scenario, and only ever a scenario, in the same
 * guided steps as the real stage (owner, 03.10.2026).
 *
 * The inputs start empty on purpose (roadmap 0.4): no day rate, no investment,
 * so no output. The forecast is `lib/tco-model.ts`, the same function the
 * Economics stage of a real project calls, so the demo cannot show arithmetic
 * the product does not do.
 *
 * It reports the model's day counts and ratios rather than amounts. Amounts
 * belong on one screen in this product and this is not it — a demo is the last
 * place a figure with a currency on it should be able to be screenshotted.
 */
export interface DemoEconomicsValues {
  devRate: number | null;
  userRate: number | null;
  upgradeFreq: number;
  fpFreq: number;
  oneTimeCost: number | null;
}

const parse = (v: string): number | null => {
  const n = Number(v);
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
};

const days = (n: number) => formatDays(n) ?? '—';

export default function DemoEconomics({
  loc,
  scoreBefore,
  values,
  onChange,
}: {
  loc: number;
  scoreBefore: number;
  values: DemoEconomicsValues;
  onChange: (next: Partial<DemoEconomicsValues>) => void;
}) {
  const forecast = useMemo(
    () =>
      tcoForecast({
        loc,
        devRate: values.devRate,
        userRate: values.userRate,
        upgradeFreq: values.upgradeFreq,
        fpFreq: values.fpFreq,
        oneTimeCost: values.oneTimeCost,
        scoreBefore,
      }),
    [loc, scoreBefore, values],
  );

  const missing = [
    values.devRate === null && 'developer day rate',
    values.userRate === null && 'key-user day rate',
    values.oneTimeCost === null && 'modernisation investment',
  ].filter(Boolean) as string[];

  const ratesDone = values.devRate !== null && values.userRate !== null;
  const budgetDone = values.oneTimeCost !== null;
  const steps: EconomicsStepInfo[] = [
    { n: 1, id: 'demo-economics-codebase', title: 'Your codebase', state: 'done' },
    { n: 2, id: 'demo-economics-rates', title: 'Your rates', state: ratesDone ? 'done' : 'input' },
    { n: 3, id: 'demo-economics-budget', title: 'Budget and cadence', state: budgetDone ? 'done' : 'input' },
    {
      n: 4,
      id: 'demo-economics-effort',
      title: 'Result',
      state: forecast ? 'done' : ratesDone && budgetDone ? 'input' : 'waiting',
      waitingFor: !ratesDone && !budgetDone ? 'steps 2 and 3' : !ratesDone ? 'step 2' : 'step 3',
    },
  ];
  const next = steps.slice(1).find((s) => s.state !== 'done' && s.state !== 'waiting') ?? null;
  const goTo = (id: string) => {
    const section = document.getElementById(id);
    section?.scrollIntoView({ block: 'start' });
    section?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  };
  const legacyDays = forecast ? forecast.legacyDevDaysTotal + forecast.legacyTestDaysTotal : null;
  const modernDays = forecast ? forecast.modernDevDaysTotal + forecast.modernTestDaysTotal : null;

  return (
    <div data-demo-economics="" className="flex flex-col gap-5">
      <EconomicsGuide
        title="Four steps to a scenario"
        steps={steps}
        next={next}
        sentence={
          next?.n === 2
            ? 'Enter what a developer day and a key-user day cost. Nothing is filled in for you.'
            : next?.n === 3
              ? 'Enter a one-time modernisation budget; the upgrade cadence starts at an assumed value.'
              : next?.n === 4
                ? 'The model declines these inputs — see step 4.'
                : 'the scenario is computed on your figures — in days, not money.'
        }
        action={
          <CcButton
            variant="primary"
            data-economics-next-action=""
            onClick={() => goTo(next ? next.id : 'demo-economics-effort')}
          >
            {next?.n === 2 ? 'Enter your rates' : next?.n === 3 ? 'Enter the budget' : 'See the result'}
          </CcButton>
        }
      />

      <EconomicsStep
        step={steps[0]}
        next={false}
        guidance="Measured by the engine run over the example file — nothing to do here."
      >
        <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fact title="Lines of custom code" value={formatLines(loc) ?? String(loc)} note="from the example source" />
          <Fact
            title="Clean Core Score"
            value={String(scoreBefore)}
            note={`from the engine run · target ${TCO_TARGET_SCORE} is the model's assumption`}
          />
        </dl>
      </EconomicsStep>

      <EconomicsStep
        step={steps[1]}
        next={next?.n === 2}
        guidance={
          <>
            What a developer day and a <GlossaryTerm termKey="Key-user day">key-user day</GlossaryTerm> cost. The
            model refuses to produce a figure until the numbers behind it are yours.
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DemoNumberField
            id="demo-dev-rate"
            title="Developer day rate"
            hint="per day"
            value={values.devRate}
            onChange={(v) => onChange({ devRate: parse(v) })}
          />
          <DemoNumberField
            id="demo-user-rate"
            title="Key-user day rate"
            hint="per day — the people who test by hand"
            value={values.userRate}
            onChange={(v) => onChange({ userRate: parse(v) })}
          />
        </div>
      </EconomicsStep>

      <EconomicsStep
        step={steps[2]}
        next={next?.n === 3}
        guidance="The one-time budget the payback is measured against, and how often upgrades arrive — the two frequencies start at an assumed value of the model."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DemoNumberField
            id="demo-investment"
            title="One-time modernisation investment"
            hint="your budget, once"
            value={values.oneTimeCost}
            onChange={(v) => onChange({ oneTimeCost: parse(v) })}
          />
          <DemoNumberField
            id="demo-upgrades"
            title="Major upgrades per year"
            hint="assumed 1 until you change it"
            value={values.upgradeFreq}
            onChange={(v) => onChange({ upgradeFreq: parse(v) ?? 0 })}
          />
          <DemoNumberField
            id="demo-feature-packs"
            title="Feature packs per year"
            hint="assumed 2 until you change it"
            value={values.fpFreq}
            onChange={(v) => onChange({ fpFreq: parse(v) ?? 0 })}
          />
        </div>
      </EconomicsStep>

      <EconomicsStep
        step={steps[3]}
        next={next?.n === 4}
        guidance={
          <>
            Maintenance effort before and after modernising, and the{' '}
            <GlossaryTerm termKey="Payback period">payback</GlossaryTerm>. Days and ratios only — the amounts belong to
            your own project.
          </>
        }
        right={<CcProvenanceChip value="simulation" />}
      >
        {forecast === null ? (
          <p data-testid="demo-forecast-refused" className="m-0 cc-text-body text-cc-ink-muted">
            No forecast yet
            {missing.length > 0 ? `: still missing the ${missing.join(', the ')}.` : ' — the model declines these inputs.'}{' '}
            An output built on a number nobody entered is not a scenario, it is an invention.
          </p>
        ) : (
          <ul data-testid="demo-forecast" className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
            <Metric title="Legacy effort" value={`${days(legacyDays ?? 0)} days per year`} />
            <Metric title="After modernisation" value={`${days(modernDays ?? 0)} days per year`} />
            <Metric title="Overhead reduction" value={formatPercentValue(forecast.overheadReductionPct) ?? '—'} />
            <Metric
              title="Payback"
              value={
                forecast.paybackMonths === null
                  ? 'not reached'
                  : `${formatNumber(forecast.paybackMonths, { maximumFractionDigits: 1 })} months`
              }
            />
          </ul>
        )}
        <div className="mt-4">
          <CcDisclosure title="How this is calculated">
            <p className="m-0 cc-text-cell text-cc-ink-muted">
              Effort per 1,000 lines and year: 2.5 developer days per upgrade and 0.8 per feature pack, 1.8 and 0.6
              key-user days for testing. Modernised code is assumed to reach a score of {TCO_TARGET_SCORE} and to need
              85&nbsp;% less regression testing. None of these is derived from observed effort; the score is the one
              the run measured.
            </p>
          </CcDisclosure>
        </div>
      </EconomicsStep>

      <CcMessageStrip state="neutral">A simulation, not a quote: computed only from figures you state.</CcMessageStrip>
    </div>
  );
}

function Fact({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="cc-card rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3">
      <dt className="cc-text-label text-cc-ink-muted">{title}</dt>
      <dd className="m-0 mt-1 cc-text-h2 text-cc-ink">{value}</dd>
      <dd className="m-0 cc-text-meta font-medium text-cc-ink-muted">{note}</dd>
    </div>
  );
}

/** A number the reader enters, in the field of §2.7. The test id stays on the input. */
function DemoNumberField({
  id,
  title,
  hint,
  value,
  onChange,
}: {
  id: string;
  title: string;
  hint: string;
  value: number | null;
  onChange: (v: string) => void;
}) {
  return (
    <CcField label={title} help={hint}>
      {(control) => (
        <div className="max-w-[18rem]">
          <input
            id={control.id}
            data-testid={id}
            type="number"
            min={0}
            inputMode="numeric"
            value={value === null ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="—"
            aria-describedby={control.describedBy}
            className={control.className}
          />
        </div>
      )}
    </CcField>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <li className="rounded-cc-card border border-cc-line px-4 py-3">
      <span className="cc-text-label text-cc-ink-muted">{title}</span>
      <p className="m-0 mt-1 cc-text-h2 text-cc-ink">{value}</p>
    </li>
  );
}
