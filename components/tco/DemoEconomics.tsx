'use client';

import React, { useMemo } from 'react';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { ChecklistLine } from '@/components/tco/EconomicsChecklist';
import {
  EconomicsAnchorBar,
  EconomicsFacet,
  EconomicsSection,
  EconomicsStatus,
  InputsBar,
  InputsDonut,
  type InputTally,
} from '@/components/tco/EconomicsObjectPage';
import type { ChecklistRow } from '@/lib/economics-checklist';
import { formatNumber } from '@/lib/format';
import { tcoForecast, TCO_TARGET_SCORE } from '@/lib/tco-model';

/**
 * Economics in the demo — a scenario, and only ever a scenario, in the object
 * page of the real stage (owner decision 01.10.2026, proposal A).
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

/** A day count as a reader writes it: one decimal, like the payback months. */
function days(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

const parse = (v: string): number | null => {
  const n = Number(v);
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
};

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
    values.userRate === null && 'business tester day rate',
    values.oneTimeCost === null && 'modernisation investment',
  ].filter(Boolean) as string[];

  // The checklist of the scenario: three figures nobody may supply for the
  // reader, and two frequencies that start at a value of the model's.
  const stated = (v: number | null): ChecklistRow['status'] => (v === null ? 'open' : 'done');
  const rows: ChecklistRow[] = [
    { key: 'dev-rate', label: 'Developer day rate', status: stated(values.devRate) },
    { key: 'test-rate', label: 'Business tester day rate', status: stated(values.userRate) },
    { key: 'investment', label: 'One-time modernisation investment', status: stated(values.oneTimeCost) },
    { key: 'upgrades', label: 'Major upgrades per year', status: 'assumed' },
    { key: 'feature-packs', label: 'Feature packs per year', status: 'assumed' },
  ];
  const open = rows.filter((r) => r.status === 'open').length;
  const tally: InputTally = {
    total: rows.length,
    stated: rows.filter((r) => r.status === 'done').length,
    fromSource: 0,
    assumed: 2,
    open,
  };
  const row = (key: ChecklistRow['key']) => rows.find((r) => r.key === key)!;
  const legacyDays = forecast ? forecast.legacyDevDaysTotal + forecast.legacyTestDaysTotal : null;
  const modernDays = forecast ? forecast.modernDevDaysTotal + forecast.modernTestDaysTotal : null;

  return (
    <div data-demo-economics="">
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
        <EconomicsFacet
          id="inputs"
          label="Inputs"
          why="The rows of the checklist below: three figures only you can state, and two frequencies that start at an assumed value of the model."
          figure={tally.total - tally.open}
          figureNote={`of ${tally.total} · ${tally.open} open`}
          sub={`${tally.stated} stated · ${tally.assumed} assumed`}
          viz={<InputsBar tally={tally} />}
        />
        <EconomicsFacet
          id="measured"
          label="Measured, not assumed"
          why="The lines of the example file and the Clean Core Score of the engine run over it. The target score is the model's assumption."
          figure={formatNumber(loc) ?? String(loc)}
          figureNote="lines"
          sub={`Clean Core Score ${scoreBefore} · target ${TCO_TARGET_SCORE} is the model's`}
        />
        <EconomicsFacet
          id="effort"
          label="Maintenance effort"
          why="Days per year before and after modernisation, from the model's assumed coefficients and your figures."
          figure={legacyDays === null || modernDays === null ? 'None yet' : `${days(legacyDays)} → ${days(modernDays)}`}
          figureNote={legacyDays === null ? undefined : 'days / year'}
          sub={<CcProvenanceChip value="simulation" note={forecast ? 'a scenario' : 'missing your figures'} />}
        />
        <EconomicsFacet
          id="payback"
          label="Payback"
          why="Months until the one-time investment is paid back by the modelled saving, if it is at all."
          figure={forecast === null ? 'None yet' : forecast.paybackMonths === null ? 'Not reached' : `${forecast.paybackMonths}`}
          figureNote={forecast && forecast.paybackMonths !== null ? 'months' : undefined}
          sub="days and ratios only — the amounts belong to your own project"
        />
      </ul>
      <EconomicsStatus
        items={[
          { key: 'kind', label: 'Kind', value: 'simulation, not a quote', state: 'warning' },
          { key: 'amounts', label: 'Amounts', value: 'none in the demo', state: 'neutral' },
          { key: 'defaults', label: 'Defaults', value: 'none', state: 'neutral' },
        ]}
      />

      <EconomicsAnchorBar
        anchors={[
          { id: 'demo-economics-needs', label: 'What the scenario still needs', count: open },
          { id: 'demo-economics-effort', label: 'Maintenance effort' },
        ]}
      />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <EconomicsSection
            id="demo-economics-needs"
            title="What the scenario still needs"
            right={
              <span className="cc-text-meta font-medium text-cc-ink-muted">
                {open} of {rows.length} open
              </span>
            }
            lead="Nothing is filled in for you. The model refuses to produce a figure until the numbers behind it are yours. Open a row to enter yours."
          >
            <ul className="m-0 list-none p-0">
              <ChecklistLine row={row('dev-rate')} summary={values.devRate === null ? undefined : `${formatNumber(values.devRate)} / day`}>
                <DemoNumberField
                  id="demo-dev-rate"
                  title="Developer day rate"
                  hint="in euro, per day"
                  value={values.devRate}
                  onChange={(v) => onChange({ devRate: parse(v) })}
                />
              </ChecklistLine>
              <ChecklistLine row={row('test-rate')} summary={values.userRate === null ? undefined : `${formatNumber(values.userRate)} / day`}>
                <DemoNumberField
                  id="demo-user-rate"
                  title="Business tester day rate"
                  hint="in euro, per day"
                  value={values.userRate}
                  onChange={(v) => onChange({ userRate: parse(v) })}
                />
              </ChecklistLine>
              <ChecklistLine row={row('investment')} summary={values.oneTimeCost === null ? undefined : formatNumber(values.oneTimeCost)}>
                <DemoNumberField
                  id="demo-investment"
                  title="One-time modernisation investment"
                  hint="in euro"
                  value={values.oneTimeCost}
                  onChange={(v) => onChange({ oneTimeCost: parse(v) })}
                />
              </ChecklistLine>
              <ChecklistLine row={row('upgrades')} summary={String(values.upgradeFreq)}>
                <DemoNumberField
                  id="demo-upgrades"
                  title="Major upgrades per year"
                  hint="whole number"
                  value={values.upgradeFreq}
                  onChange={(v) => onChange({ upgradeFreq: parse(v) ?? 0 })}
                />
              </ChecklistLine>
              <ChecklistLine row={row('feature-packs')} summary={String(values.fpFreq)}>
                <DemoNumberField
                  id="demo-feature-packs"
                  title="Feature packs per year"
                  hint="whole number"
                  value={values.fpFreq}
                  onChange={(v) => onChange({ fpFreq: parse(v) ?? 0 })}
                />
              </ChecklistLine>
            </ul>
          </EconomicsSection>

          <EconomicsSection
            id="demo-economics-effort"
            title={
              <>
                Maintenance effort <CcProvenanceChip value="simulation" />
              </>
            }
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
                <Metric title="Overhead reduction" value={`${forecast.overheadReductionPct}%`} />
                <Metric
                  title="Payback"
                  value={forecast.paybackMonths === null ? 'not reached' : `${forecast.paybackMonths} months`}
                />
              </ul>
            )}
            <p className="m-0 mt-4 cc-text-cell text-cc-ink-muted">
              A scenario, not a quotation: the day counts come from your assumptions and the score the run measured,
              and the target score of {TCO_TARGET_SCORE} is an assumption of the model itself. The amounts behind
              these days appear on the Economics stage of your own project.
            </p>
          </EconomicsSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Scenario">
          <section
            aria-labelledby="demo-economics-answer"
            className="cc-card rounded-cc-card border border-cc-line bg-cc-surface p-4 text-center shadow-cc"
          >
            <h2 id="demo-economics-answer" className="cc-text-h2 text-left text-cc-ink">
              Scenario
            </h2>
            <div className="mt-3">
              <InputsDonut tally={tally} />
            </div>
            <p className="m-0 mt-3 cc-text-cell text-cc-ink">
              {forecast === null ? 'No scenario until the open rows are filled.' : 'A scenario on your figures — days, not money.'}
            </p>
          </section>
          <CcMessageStrip state="neutral">A simulation, not a quote: computed only from figures you state.</CcMessageStrip>
        </aside>
      </div>
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
