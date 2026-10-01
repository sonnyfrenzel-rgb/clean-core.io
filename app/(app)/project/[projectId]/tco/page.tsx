'use client';

import { useState, useEffect, useMemo } from 'react';
import { tcoForecast, TCO_TARGET_SCORE, type TcoForecastRow } from '@/lib/tco-model';
import { useParams } from 'next/navigation';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import type { Project } from '@/lib/types';
import StageProgress from '@/components/StageProgress';
import StageHeader from '@/components/StageHeader';
import StageFooter from '@/components/StageFooter';
import { workflowSteps, staleness } from '@/lib/workflow-steps';
import { ShieldCheck, Printer, BarChart3, AlertCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import OptionComparison, { initialCostAssumptions } from '@/components/tco/OptionComparison';
import {
  CadenceField,
  ChecklistLine,
  CurrencyField,
  FigureField,
  OptionRowLabel,
  RangeField,
} from '@/components/tco/EconomicsChecklist';
import {
  costComparison,
  formatAmount,
  formatAmountRange,
  proposeEffort,
  type CostAssumptions,
  type CostOption,
} from '@/lib/cost-assumptions';
import { comparisonChecklist, forecastChecklist, openRows, type ChecklistRow } from '@/lib/economics-checklist';
import { formatNumber } from '@/lib/format';
import { SEQUENTIAL_CHART_COLORS } from '@/lib/chart-colors';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSkeleton from '@/components/cc/Skeleton';

/**
 * The card of this stage, as the workspace draws one (DESIGN.md §1.4): 12 px,
 * a 1 px line, the flat shadow. `cc-card` gives it the print rule of §7.1 —
 * outlined instead of shadowed, never torn across a page.
 */
const CARD = 'cc-card rounded-cc-card border border-cc-line bg-cc-surface shadow-cc';

/**
 * The forecast is an amount over time, so it takes the sequential indigo of
 * `lib/chart-colors.ts` (§1.8) — never a state colour. It used to be green,
 * and green means *proven*; a forecast on assumed coefficients is not.
 */
const LINE = SEQUENTIAL_CHART_COLORS[2];
const WASH = SEQUENTIAL_CHART_COLORS[0];

// Lazy-load recharts to reduce initial bundle size (~312KB)
const RechartsChart = dynamic(() => import('recharts').then(mod => {
  const { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = mod;

  function TcoChart({ data, currency }: { data: TcoForecastRow[]; currency: string }) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={WASH.value} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={WASH.value} stopOpacity={0.0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--cc-line)" />
          <XAxis dataKey="year" stroke="var(--cc-ink-muted)" tick={{ fontSize: 11 }} />
          <YAxis stroke="var(--cc-ink-muted)" tickFormatter={v => `${currency} ${(v / 1000)}k`} width={68} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => [value ? formatAmount(Number(value), currency) : '', '']} labelStyle={{ color: 'var(--cc-ink)', fontWeight: 'bold' }} />
          <Area type="monotone" dataKey="Net Financial Benefit" stroke={LINE.value} strokeWidth={3} fillOpacity={1} fill="url(#colorNet)" />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return TcoChart;
}), {
  ssr: false,
  loading: () => <CcSkeleton shape="text" label="the forecast chart" count={4} />,
});

/**
 * Economics — a tool of the workspace (ADR-050; mockup s8 for the frame, s5 for
 * "What the comparison still needs").
 *
 * The stage leads with its answer — is there a cost winner, and if not, how
 * many of the figures it needs are still open — and then asks for those
 * figures **once**, as one checklist. It used to ask twice: an "Interactive TCO
 * model" panel and an "Options and costs" panel, both for a developer and a
 * key-user day rate, and each option ended in a paragraph of "Not determined"
 * (audit 01.10.2026, row 7). The day rates are now one pair of fields, read by
 * both the option comparison and the savings forecast.
 *
 * Money honesty is unchanged and visible: every amount comes from the reader's
 * own figures and carries *Simulation*; nothing has a default; no cheapest
 * option is named while an option is incomplete (`lib/cost-assumptions.ts`);
 * the savings forecast stays a demonstration model on assumed coefficients
 * (`lib/tco-model.ts`) and says so where it stands.
 */
export default function TcoCalculatorPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  // A read that failed is not a project without a score (QA ffddf6b4fee6).
  const [loadError, setLoadError] = useState(false);
  // The line count of the uploaded source, so the slider's range can hold it
  // (QA 246b1ea24dbc): a 420-line upload used to be drawn at 1,000.
  const [sourceLoc, setSourceLoc] = useState<number | null>(null);

  // Model inputs.
  //
  // The cost figures start empty (E12-F01-US02: "without suitable cost inputs,
  // no savings forecast is shown"). They used to start at €900, €650 and
  // €15,000 — "standard enterprise SAP guidelines" that nobody here supplied.
  // The two day rates are the comparison's too: one field each, for both.
  const [loc, setLoc] = useState(8500); // Lines of custom code
  const [devRate, setDevRate] = useState<number | null>(null); // Developer day rate, in the currency stated
  const [userRate, setUserRate] = useState<number | null>(null); // Test and key-user day rate, same currency
  const [upgradeFreq, setUpgradeFreq] = useState(1); // Release upgrades per year — an assumption until moved
  const [fpFreq, setFpFreq] = useState(2); // Feature pack updates per year — an assumption until moved
  const [upgradesStated, setUpgradesStated] = useState(false);
  const [featurePacksStated, setFeaturePacksStated] = useState(false);
  const [oneTimeCost, setOneTimeCost] = useState<number | null>(null); // One-time modernisation budget

  // The currency, stated once for the whole stage (roadmap 7.11), no default.
  const [currency, setCurrency] = useState('');

  // The comparison's own assumptions: time horizon, cadence and the options.
  // The shared figures above are folded in, so there is one revision for all.
  const [stated, setStated] = useState<CostAssumptions>(initialCostAssumptions);
  const assumptions = useMemo<CostAssumptions>(
    () => ({ ...stated, currency, devDayRate: devRate, testDayRate: userRate }),
    [stated, currency, devRate, userRate],
  );
  const comparison = useMemo(() => costComparison(assumptions), [assumptions]);
  const proposal = useMemo(() => proposeEffort(loc), [loc]);
  const patch = (p: Partial<CostAssumptions>) => setStated((a) => ({ ...a, ...p }));
  const patchOption = (id: string, p: Partial<CostOption>) =>
    setStated((a) => ({ ...a, options: a.options.map((o) => (o.id === id ? { ...o, ...p } : o)) }));

  const missingCosts = [
    !currency && 'currency',
    devRate === null && 'developer day rate',
    userRate === null && 'key-user day rate',
    oneTimeCost === null && 'modernisation investment',
  ].filter(Boolean) as string[];

  // Load project settings
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const data = await loadProjectAndHydrate(projectId as string);
        if (!enforceActiveRun(data, projectId as string)) return;
        if (data) {
          setProject(data);
          // The line count that was actually uploaded — not multiplied. The
          // uploaded file is rarely the whole estate, but the number to model
          // on is the reader's to supply; the field starts from something true.
          if (data.legacyCode) {
            const lines = data.legacyCode.split('\n').length;
            setLoc(lines);
            setSourceLoc(lines);
          }
        }
      } catch (err) {
        console.error("Failed to load project:", err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  // The forecast. A demonstration, not a business case: the effort
  // coefficients, the 85% test effect and the target score are assumptions
  // (CR-23). It lives in `lib/tco-model.ts` — the page shows it, the spec runs
  // it, and neither carries its own copy of the arithmetic (roadmap 0.17).
  const calculations = useMemo(
    () => tcoForecast({
      loc,
      devRate,
      userRate,
      upgradeFreq,
      fpFreq,
      oneTimeCost,
      scoreBefore: typeof project?.cleanCoreScore === 'number' ? project.cleanCoreScore : null,
    }),
    [project, loc, devRate, userRate, upgradeFreq, fpFreq, oneTimeCost],
  );

  // Paper gets §7.1 from the `.cc` wrapper below: ink on white, cards
  // outlined, no tool bars. The page itself adds nothing for print.
  const handlePrint = () => {
    window.print();
  };

  const phases = workflowSteps(project);

  if (loading) {
    return (
      <div className="cc min-h-screen">
        <CcSkeleton shape="cards" label="the economics model" count={3} />
      </div>
    );
  }

  if (loadError) return (
    <div className="cc min-h-screen">
      <div className="max-w-xl" data-tco-load-error="">
        <CcMessageStrip
          state="error"
          headline="This stage could not be opened"
          actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}
        >
          The project could not be loaded. This is usually a permissions or connectivity issue; it says
          nothing about whether a signed score exists.
        </CcMessageStrip>
      </div>
    </div>
  );

  // The savings forecast needs a baseline nothing any input could fix: a signed
  // score below the assumed target, for the source under review (QA
  // b23daef11548). Without one the forecast declines, and the stage still
  // compares options — their figures are the reader's own, not derived from a
  // score (roadmap 7.4).
  const baselineScore = typeof project?.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
  const sourceChanged = staleness(project).sourceChanged;
  const forecastPossible = !(baselineScore === null || baselineScore >= TCO_TARGET_SCORE || sourceChanged);
  const fiveYear = calculations?.cumulativeSavings5Yr ?? [];

  const comparisonRows = comparisonChecklist(assumptions);
  const forecastRows = forecastPossible
    ? forecastChecklist({ loc, sourceLoc, oneTimeCost, upgradesStated, featurePacksStated })
    : [];
  const allRows = [...comparisonRows, ...forecastRows];
  const open = openRows(allRows);
  const row = (key: ChecklistRow['key']) => allRows.find((r) => r.key === key)!;
  const winner = comparison.winner ? comparison.costs.find((c) => c.optionId === comparison.winner) : null;
  // The two day rates are the forecast's too; only where there is a forecast
  // do they carry its names (the print footer and its specs read them).
  const forecastName = (name: string): Record<`data-${string}`, string> =>
    forecastPossible ? { 'data-tco-cost': name } : {};

  return (
    // `.cc` puts the stage under the workspace's focus ring (§1.6) and its
    // print rule (§7.1). The way back to the workspace does not print either;
    // `StageHeader` marks it `cc-no-print` for every stage.
    <div className="cc min-h-screen print:p-0" data-economics="">
      <StageProgress steps={phases} current="tco" projectId={projectId as string} />

      <StageHeader
        projectName={project?.name}
        stage="tco"
        eyebrow={<CcProvenanceChip value="simulation" />}
        actions={
          <span className="cc-no-print">
            <CcButton icon={<Printer size={16} aria-hidden="true" />} onClick={handlePrint}>
              Print model estimate
            </CcButton>
          </span>
        }
      >
        What keeping, changing or retiring this code would cost — priced only from figures you state. A
        simulation, not a quote.
      </StageHeader>

      <div className="space-y-6">
        {/* The answer first (ADR-050: each stage leads with its answer). */}
        <section className={`p-4 md:p-6 ${CARD}`} data-economics-answer={winner ? 'winner' : 'open'} aria-labelledby="economics-answer">
          {winner ? (
            <>
              <h2 id="economics-answer" className="cc-text-h2 text-cc-ink">
                Lowest cost over {assumptions.horizonYears} year{assumptions.horizonYears === 1 ? '' : 's'}: {winner.label}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-2 cc-text-body text-cc-ink">
                {formatAmountRange(winner.total, currency)} <CcProvenanceChip value="simulation" />
              </p>
              <p className="mt-1 cc-text-meta text-cc-ink-muted">
                From your figures only. Lowest cost is not the same as the best decision — this stage prices options and decides nothing.
              </p>
            </>
          ) : (
            <>
              <h2 id="economics-answer" className="cc-text-h2 text-cc-ink">
                No cost winner yet — {open.length} of {allRows.length} inputs open
              </h2>
              <p className="mt-1 cc-text-body text-cc-ink-muted">
                Nothing here has a default: no currency, no day rate, no effort. Fill in the open rows below and
                the options are priced; until every option is complete, none is called cheapest.
              </p>
            </>
          )}
        </section>

        {/* One checklist of every figure the stage needs, each with its field. */}
        <section className={`p-4 md:p-6 print:hidden ${CARD}`} aria-labelledby="economics-needs" data-economics-checklist="">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="economics-needs" className="cc-text-h2 text-cc-ink">What the comparison still needs</h2>
            <span className="cc-text-meta text-cc-ink-muted" data-economics-open-count="">
              {open.length} of {allRows.length} open
            </span>
          </div>

          <ul className="mt-2 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
            <ChecklistLine row={row('currency')}>
              <CurrencyField currency={currency} onChange={setCurrency} />
            </ChecklistLine>
            <ChecklistLine row={row('dev-rate')}>
              <FigureField
                label="Developer day rate"
                hint="Your rate for SAP ABAP / BTP development, per day."
                value={devRate}
                onChange={setDevRate}
                suffix={currency ? `${currency} / day` : '/ day'}
                data={{ 'data-cost-field': 'dev-day-rate', ...forecastName('dev-rate') }}
              />
            </ChecklistLine>
            <ChecklistLine row={row('test-rate')}>
              <FigureField
                label="Test and key-user day rate"
                hint="Your rate for the people who run the regression tests, per day."
                value={userRate}
                onChange={setUserRate}
                suffix={currency ? `${currency} / day` : '/ day'}
                data={{ 'data-cost-field': 'test-day-rate', ...forecastName('user-rate') }}
              />
            </ChecklistLine>
            <ChecklistLine row={row('horizon')}>
              <FigureField
                label="Time horizon in years"
                note="no default"
                hint="One-off and recurring effort are only comparable over a period you name."
                value={assumptions.horizonYears}
                onChange={(v) => patch({ horizonYears: v })}
                data={{ 'data-cost-field': 'horizon-years' }}
              />
            </ChecklistLine>
            <ChecklistLine row={row('cadence')}>
              <CadenceField
                perYear={assumptions.releaseCadence?.perYear ?? null}
                confirmed={assumptions.releaseCadence?.confirmed ?? false}
                onPerYear={(v) => patch({ releaseCadence: v === null ? null : { perYear: v, confirmed: false } })}
                onConfirmed={(checked) =>
                  patch(
                    assumptions.releaseCadence
                      ? { releaseCadence: { ...assumptions.releaseCadence, confirmed: checked } }
                      : {},
                  )
                }
              />
            </ChecklistLine>
            {(['one-off', 'per-release', 'baseline', 'upgrade-delay'] as const).map((key) => {
              const r = allRows.find((x) => x.key === key);
              return r ? (
                <ChecklistLine key={key} row={r}>
                  <OptionRowLabel row={r} target="economics-options" />
                </ChecklistLine>
              ) : null;
            })}
          </ul>

          {forecastPossible ? (
            <>
              <h3 className="mt-6 cc-text-h3 text-cc-ink">For the savings forecast</h3>
              <ul className="mt-1 grid grid-cols-1 gap-x-8 lg:grid-cols-2">
                <ChecklistLine row={row('loc')}>
                  <RangeField
                    label="Lines of custom code"
                    help="The size of the estate to model. Starts at the lines of your source."
                    min={Math.min(1000, sourceLoc ?? 1000)}
                    max={Math.max(50000, sourceLoc ?? 50000)}
                    step={500}
                    value={loc}
                    onChange={setLoc}
                    readout={<span data-stage-output="legacyCode">{formatNumber(loc)} LoC</span>}
                    valueText={`${formatNumber(loc)} LoC`}
                  />
                </ChecklistLine>
                <ChecklistLine row={row('investment')}>
                  <FigureField
                    label="One-time modernisation budget"
                    hint="Your one-time refactoring and deployment budget."
                    value={oneTimeCost}
                    onChange={setOneTimeCost}
                    suffix={currency || undefined}
                    data={{ 'data-tco-cost': 'investment' }}
                  />
                </ChecklistLine>
                <ChecklistLine row={row('upgrades')}>
                  <RangeField
                    label="Release upgrades per year"
                    help="Starts at an assumed 1 — set it to yours."
                    min={0}
                    max={3}
                    step={1}
                    value={upgradeFreq}
                    onChange={(v) => { setUpgradeFreq(v); setUpgradesStated(true); }}
                    readout={`${upgradeFreq} upgrade${upgradeFreq === 1 ? '' : 's'}`}
                  />
                </ChecklistLine>
                <ChecklistLine row={row('feature-packs')}>
                  <RangeField
                    label="Feature pack updates per year"
                    help="Starts at an assumed 2 — set it to yours."
                    min={0}
                    max={4}
                    step={1}
                    value={fpFreq}
                    onChange={(v) => { setFpFreq(v); setFeaturePacksStated(true); }}
                    readout={`${fpFreq} update${fpFreq === 1 ? '' : 's'}`}
                  />
                </ChecklistLine>
              </ul>
            </>
          ) : null}

          <p className="mt-3 cc-text-body font-semibold text-cc-ink">
            {comparison.winner ? 'Every figure is in.' : 'No cost winner until these are filled.'}
          </p>
        </section>

        {/* The options, each with its own effort, and the verdict. */}
        <div id="economics-options" className="scroll-mt-24">
          <OptionComparison
            assumptions={assumptions}
            comparison={comparison}
            proposal={proposal}
            currency={currency}
            onPatchOption={patchOption}
          />
        </div>

        {/* The savings forecast — a demonstration model, said where it stands. */}
        <section aria-labelledby="tco-forecast-section" className="space-y-4">
          <h2 id="tco-forecast-section" className="flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink">
            Savings forecast <CcProvenanceChip value="simulation" />
          </h2>

          {!forecastPossible ? (
            <div className={`p-4 md:p-6 ${CARD}`} data-tco-no-baseline="">
              <h3 className="cc-text-h3 text-cc-ink">No baseline to model against</h3>
              <p className="mt-1 cc-text-body text-cc-ink-muted">
                {sourceChanged && baselineScore !== null ? (
                  <span data-tco-stale="">
                    The source changed after the signed run, so its Clean Core score of {baselineScore} describes
                    code that is no longer the code under review. The forecast is derived from that score. Run the
                    analysis again.
                  </span>
                ) : baselineScore !== null && baselineScore >= TCO_TARGET_SCORE ? (
                  <>
                    This code already scores {baselineScore}, at or above the {TCO_TARGET_SCORE} this model assumes
                    modernisation would reach, so the model has no improvement to price and declines. That is a
                    statement about the assumed target, not a finding about your code.
                  </>
                ) : (
                  <>
                    This project has no Clean Core score from a signed run, and the forecast is derived from one.
                    Run the analysis first. The option comparison above does not need it.
                  </>
                )}
              </p>
            </div>
          ) : (
            <>
              {/* A demonstration model, and it says so before it says anything else. */}
              <div data-tco-model-notice>
                <CcMessageStrip state="warning" headline="A demonstration model, not a business case.">
                  Your cost figures go in; the rest stays assumption: effort per 1,000 lines (2.5 / 0.8 days
                  development, 1.8 / 0.6 days testing per upgrade / feature pack), an 85&nbsp;% reduction in
                  regression-test effort, and a target score of 95. None of these is derived from observed effort.
                </CcMessageStrip>
              </div>

              {/* No forecast from figures nobody entered (E12-F01-US02). */}
              {!(calculations && currency) && (
                <div className={`p-4 md:p-6 ${CARD}`} data-tco-no-forecast>
                  <h3 className="cc-text-h3 text-cc-ink">No savings forecast yet</h3>
                  <p className="cc-text-body text-cc-ink-muted mt-1">
                    {missingCosts.length > 0 ? (
                      <>
                        The model has no defaults for your cost figures. Missing:{' '}
                        <strong className="font-semibold text-cc-ink">{missingCosts.join(', ')}</strong> — each is a
                        row of the checklist above.
                      </>
                    ) : upgradeFreq + fpFreq === 0 ? (
                      <>
                        With no release upgrade and no feature pack update in a year, the model has no upgrade
                        effort to price, so there is no saving to forecast.
                      </>
                    ) : (
                      <>
                        For these inputs the model has nothing to price: below a few hundred lines the annual
                        legacy maintenance effort rounds to zero days. Set the lines of code to the size of the
                        estate you mean to model.
                      </>
                    )}
                  </p>
                </div>
              )}

              {calculations && currency && (<>
                {/* The three headline figures, one card style for all three:
                    green would say "proven" about a scenario (§1.1). */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className={`p-4 md:p-6 flex flex-col justify-between min-h-[160px] ${CARD}`}>
                    <span className="cc-text-label text-cc-ink-muted block">Annual Net Savings · Scenario</span>
                    <div>
                      <p className="cc-text-figure text-cc-ink mt-2 flex items-baseline gap-1">
                        {formatAmount(calculations.annualSavings, currency)}
                        <span className="cc-text-meta text-cc-ink-muted">/ year</span>
                      </p>
                      <p className="cc-text-meta text-cc-ink-muted mt-1">Maintenance overhead reduced by {calculations.overheadReductionPct}%.</p>
                    </div>
                  </div>

                  <div className={`p-4 md:p-6 flex flex-col justify-between min-h-[160px] ${CARD}`}>
                    <span className="cc-text-label text-cc-ink-muted block">Payback Period</span>
                    <div>
                      {calculations.paybackMonths === null ? (
                        <>
                          {/* No negative payback period, but "no payback in the
                              model" (E12-F01-US02). A refusal is not a warning. */}
                          <p className="cc-text-h2 text-cc-ink mt-2" data-tco-payback>No payback in the model</p>
                          <p className="cc-text-meta text-cc-ink-muted mt-1">
                            For these inputs the model shows no annual benefit, so there is nothing to pay the investment back with.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="cc-text-figure text-cc-ink mt-2 flex items-baseline gap-1">
                            {calculations.paybackMonths}
                            <span className="cc-text-meta text-cc-ink-muted">Months</span>
                          </p>
                          <p className="cc-text-meta text-cc-ink-muted mt-1">Until the one-time budget is paid back.</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className={`p-4 md:p-6 flex flex-col justify-between min-h-[160px] ${CARD}`}>
                    <span className="cc-text-label text-cc-ink-muted block">Year 1 ROI</span>
                    <div>
                      {calculations.roiYear1 === null ? (
                        <>
                          <p className="cc-text-h2 text-cc-ink mt-2">Not defined</p>
                          <p className="cc-text-meta text-cc-ink-muted mt-1">
                            A return needs something spent to return on. Enter a budget above.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="cc-text-figure text-cc-ink mt-2 flex items-baseline gap-1">
                            {calculations.roiYear1}%
                            <span className="cc-text-meta text-cc-ink-muted">Return</span>
                          </p>
                          <p className="cc-text-meta text-cc-ink-muted mt-1">Net return on the one-time budget.</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Both sides are the same model under two assumptions — ink, not state colours. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <section className={`p-4 md:p-6 ${CARD}`} aria-labelledby="tco-legacy-title">
                    <h3 id="tco-legacy-title" className="cc-text-h3 text-cc-ink mb-4 flex items-center gap-2">
                      <AlertCircle size={16} aria-hidden="true" className="text-cc-ink-muted" />
                      Running cost today, per year
                    </h3>
                    <div className="space-y-4">
                      <BreakdownRow
                        title="Adapting the code at each upgrade"
                        note="Modifications tightly coupled to the core"
                        amount={formatAmount(calculations.legacyDevDaysTotal * calculations.devRate, currency)}
                        days={`${Math.round(calculations.legacyDevDaysTotal)} developer days / yr`}
                      />
                      <BreakdownRow
                        title="Manual regression testing"
                        note="Key users test by hand"
                        amount={formatAmount(calculations.legacyTestDaysTotal * calculations.userRate, currency)}
                        days={`${Math.round(calculations.legacyTestDaysTotal)} tester days / yr`}
                      />
                      <div className="flex justify-between items-baseline gap-4 pt-2">
                        <span className="cc-text-label text-cc-ink">Total today</span>
                        <span className="cc-text-h2 text-cc-ink">{formatAmount(calculations.legacyAnnualTotal, currency)} <span className="cc-text-meta text-cc-ink-muted">/ yr</span></span>
                      </div>
                    </div>
                  </section>

                  <section className={`p-4 md:p-6 ${CARD}`} aria-labelledby="tco-modern-title">
                    <h3 id="tco-modern-title" className="cc-text-h3 text-cc-ink mb-4 flex items-center gap-2">
                      <ShieldCheck size={16} aria-hidden="true" className="text-cc-ink-muted" />
                      Running cost after modernisation, per year
                    </h3>
                    <div className="space-y-4">
                      <BreakdownRow
                        title="Upgrade-safe adaptation"
                        note="Extensions on released interfaces"
                        amount={formatAmount(calculations.modernDevDaysTotal * calculations.devRate, currency)}
                        days={`${Math.round(calculations.modernDevDaysTotal)} developer days / yr`}
                      />
                      <BreakdownRow
                        title="Automated regression checks"
                        note="A test suite instead of manual runs"
                        amount={formatAmount(calculations.modernTestDaysTotal * calculations.userRate, currency)}
                        days={`${Math.round(calculations.modernTestDaysTotal)} tester days / yr`}
                      />
                      <div className="flex justify-between items-baseline gap-4 pt-2">
                        <span className="cc-text-label text-cc-ink">Total after modernisation</span>
                        <span className="cc-text-h2 text-cc-ink">{formatAmount(calculations.modernAnnualTotal, currency)} <span className="cc-text-meta text-cc-ink-muted">/ yr</span></span>
                      </div>
                    </div>
                  </section>
                </div>

                <section className={`p-4 md:p-6 ${CARD}`} aria-labelledby="tco-forecast-title">
                  <h3 id="tco-forecast-title" className="cc-text-h3 text-cc-ink mb-4 flex items-center gap-2">
                    <BarChart3 size={16} aria-hidden="true" className="text-cc-ink-muted" />
                    Net benefit over five years
                  </h3>
                  {/* Every figure the chart draws is also text (§1.8). */}
                  <div
                    role="img"
                    aria-label={`Cumulative net financial benefit by year: ${fiveYear
                      .map((p) => `${p.year}: ${formatAmount(Number(p['Net Financial Benefit']), currency)}`)
                      .join('; ')}.`}
                    className="h-64 md:h-72 w-full cc-text-meta overflow-x-auto"
                  >
                    <div className="min-w-[400px] h-full">
                      <RechartsChart data={fiveYear} currency={currency} />
                    </div>
                  </div>
                  <p className="cc-text-meta text-cc-ink-muted text-center mt-4">
                    Annual savings minus the one-time budget, added up. After five years: <span className="text-cc-ink">{formatAmount(fiveYear[5]?.['Net Financial Benefit'], currency)}</span>.
                  </p>
                </section>
              </>)}
            </>
          )}
        </section>

        {/* Printed with the estimate, so a copy cannot leave without it. */}
        <div className="hidden print:block border-t border-cc-line pt-8 mt-12 text-center cc-text-meta text-cc-ink-muted">
          <p className="font-bold">Clean-Core.io — model estimate, not a business case</p>
          {/* The inputs the estimate was priced with, so the printed page can be
              read on its own (Sonny, 30.09.2026) — the checklist does not print. */}
          <p data-tco-print-inputs="">
            Inputs: {formatNumber(loc)} LoC · developer day rate {formatAmount(devRate, currency)} · key-user day rate{' '}
            {formatAmount(userRate, currency)} · modernisation investment {formatAmount(oneTimeCost, currency)} ·{' '}
            {upgradeFreq} release upgrade{upgradeFreq === 1 ? '' : 's'} and {fpFreq} feature pack update{fpFreq === 1 ? '' : 's'} per year.
          </p>
          <p>Priced with these cost figures; effort coefficients, the 85&nbsp;% test effect and the target score of 95 are assumptions, not observed effort. Not an official SAP certification. Requires your own review and validation.</p>
        </div>

        <div className="print:hidden">
          <StageFooter
            backPath={`/project/${projectId}/testing`}
            backLabel="Back to Testing"
            proceedPath={`/project/${projectId}/delivery`}
            proceedLabel="Proceed to Delivery"
          />
        </div>
      </div>
    </div>
  );
}

/** One line of a breakdown: what, why, how much, how many days. */
function BreakdownRow({ title, note, amount, days }: { title: string; note: string; amount: string; days: string }) {
  return (
    <div className="flex justify-between items-center gap-4 border-b border-cc-line pb-3">
      <div>
        <span className="cc-text-identifier text-cc-ink block">{title}</span>
        <span className="cc-text-meta text-cc-ink-muted">{note}</span>
      </div>
      <div className="text-right">
        <span className="cc-text-identifier text-cc-ink block">{amount}</span>
        <span className="cc-text-meta text-cc-ink-muted">{days}</span>
      </div>
    </div>
  );
}
