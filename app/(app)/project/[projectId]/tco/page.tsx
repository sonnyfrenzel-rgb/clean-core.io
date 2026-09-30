'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { tcoForecast, TCO_TARGET_SCORE, type TcoForecastRow } from '@/lib/tco-model';
import { useParams } from 'next/navigation';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import type { Project } from '@/lib/types';
import Stepper from '@/components/Stepper';
import StageHeader from '@/components/StageHeader';
import VerificationRail from '@/components/VerificationRail';
import NavigationButtons from '@/components/NavigationButtons';
import { workflowSteps, staleness } from '@/lib/workflow-steps';
import { Calculator, ShieldCheck, Printer, BarChart3, AlertCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import OptionComparison from '@/components/tco/OptionComparison';
import { formatAmount } from '@/lib/cost-assumptions';
import { formatNumber } from '@/lib/format';
import { SEQUENTIAL_CHART_COLORS } from '@/lib/chart-colors';
import CcButton from '@/components/cc/Button';
import CcField, { CcRequiredNote } from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';
import { CcTag } from '@/components/cc/Tag';

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
  // The three cost figures start empty (E12-F01-US02: "without suitable cost
  // inputs, no savings forecast is shown"). They used to start at €900, €650 and
  // €15,000 — "standard enterprise SAP guidelines" that nobody here supplied —
  // and the page presented annual savings, a payback period and an ROI on them
  // the moment it opened. Figures a reader never entered cannot become their
  // business case by default.
  const [loc, setLoc] = useState(8500); // Lines of custom code
  const [devRate, setDevRate] = useState<number | null>(null); // Developer daily rate, in the currency stated below
  const [userRate, setUserRate] = useState<number | null>(null); // Key-user daily rate, in the same currency
  const [upgradeFreq, setUpgradeFreq] = useState(1); // Major release upgrades per year
  const [fpFreq, setFpFreq] = useState(2); // Feature Pack updates per year
  const [oneTimeCost, setOneTimeCost] = useState<number | null>(null); // Refactoring Implementation investment

  // The currency, stated once for the whole stage (roadmap 7.11).
  //
  // This half of the page used to print a fixed euro sign at six places and had
  // no field for it, while the option comparison below asked for a currency and
  // assumed none (ADR-035). Two money units on one screen, one of them
  // invented. The reader states it in "Options and costs" below: that panel
  // owns the input, this state owns the value, and both halves format through
  // `formatAmount` from the same module. Until it is stated, this half says
  // "Not determined" rather than a number, exactly as it already does for a
  // missing day rate.
  const [currency, setCurrency] = useState('');

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
          // The line count that was actually uploaded — not multiplied.
          //
          // This used to be `Math.max(1000, Math.min(lineCount * 10, 50000))`,
          // so a ten-line snippet silently became 1,000 lines and every figure
          // below was computed from it. The uploaded file is rarely the whole
          // estate, but the number to model on is the reader's to supply; the
          // field is editable and now starts from something true.
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

  // The model. A demonstration, not a business case: the effort coefficients,
  // the 85% test effect and the target score are assumptions (CR-23).
  // The forecast itself lives in `lib/tco-model.ts` — the page shows it, the
  // spec runs it, and neither carries its own copy of the arithmetic any more
  // (roadmap 0.17, QA finding f3428b0782a9).
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

  // Economics is phase 6 of 7. This page used to render the stepper with
  // `currentStep={1}` — it had no number of its own, so it claimed Upload's —
  // and had no rail at all.
  const phases = workflowSteps(project);

  if (loading) {
    return (
      <div className="cc min-h-screen bg-cc-page p-4 md:p-8">
        <div className="max-w-6xl mx-auto mt-8">
          <CcSkeleton shape="cards" label="the economics model" count={3} />
        </div>
      </div>
    );
  }

  if (loadError) return (
    <div className="cc min-h-screen bg-cc-page p-4 md:p-8">
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

  // Nothing any input could fix: no signed score, one at or above the assumed
  // target, or one that describes a previous source (QA b23daef11548 — the
  // line count below would come from the current source, the score from the
  // run before it). Everything else — missing cost figures, an estate too
  // small to price — is shown next to the inputs that would change it.
  const baselineScore = typeof project?.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
  const sourceChanged = staleness(project).sourceChanged;
  if (baselineScore === null || baselineScore >= TCO_TARGET_SCORE || sourceChanged) {
    return (
      <div className="cc min-h-screen bg-cc-page p-4 md:p-8">
        <VerificationRail steps={phases} current="tco" projectId={projectId as string} />
        <Stepper steps={phases} current="tco" projectId={projectId as string} />
        <div className={`max-w-2xl mx-auto mt-10 p-8 ${CARD}`}>
          <StageHeader title="No baseline to model against" />
          <p className="cc-text-body text-cc-ink-muted -mt-4">
            {sourceChanged && baselineScore !== null ? (
              <span data-tco-stale="">
                The source changed after the signed run, so its Clean Core score of {baselineScore} describes
                code that is no longer the code under review. Every figure here is derived from that score.
                Re-run the analysis in stage&nbsp;1.
              </span>
            ) : typeof project?.cleanCoreScore === 'number' && project.cleanCoreScore >= TCO_TARGET_SCORE ? (
              <>
                This code already scores {project.cleanCoreScore}, at or above the {TCO_TARGET_SCORE} this model
                assumes modernisation would reach. The model has no improvement to price, so it
                declines rather than pricing one. It would otherwise report a negative return &mdash;
                and at a score of exactly 100 it divided by zero and put an infinity on the chart.
                That is a statement about the assumed target, not a finding about your code.
              </>
            ) : (
              <>
                This project has no Clean Core score from a signed run, and every figure here is
                derived from one. Run the analysis in stage&nbsp;1.
              </>
            )}
          </p>
          <p className="cc-text-meta text-cc-ink-muted mt-4">
            The page used to substitute a score of 30 here and present exact annual savings,
            a payback period and an ROI percentage on the strength of it. A financial case
            built on a number nobody measured is worse than no page at all.
          </p>
        </div>
        {/* The option comparison needs no Clean Core score — its figures are the
            reader's own, not derived from one — so it stands here too. Roadmap 7.4. */}
        <div className="max-w-6xl mx-auto mt-8">
          <OptionComparison loc={loc} currency={currency} onCurrencyChange={setCurrency} />
        </div>
        <div className="max-w-2xl mx-auto print:hidden">
          <NavigationButtons
            backPath={`/project/${projectId}/testing`}
            backLabel="Back to Testing"
            proceedPath={`/project/${projectId}/delivery`}
            proceedLabel="Proceed to Delivery"
          />
        </div>
      </div>
    );
  }

  const fiveYear = calculations?.cumulativeSavings5Yr ?? [];

  return (
    // `.cc` puts the stage under the workspace's focus ring (§1.6) and its
    // print rule (§7.1). The way back to the workspace does not print either;
    // `StageHeader` marks it `cc-no-print` for every stage.
    <div className="cc min-h-screen bg-cc-page p-4 md:p-8 print:p-0">

      {/* Navigation, so neither prints. */}
      <VerificationRail steps={phases} current="tco" projectId={projectId as string} />
      <Stepper steps={phases} current="tco" projectId={projectId as string} />

      {/* Main Container */}
      <div className="max-w-6xl mx-auto mt-8 space-y-8 w-full">

        {/* "Better Practice Mapped" was a badge with nothing mapped behind it.
            The title is the stage's name from `PHASES`; what kind of page this
            is stands beside it as a tag, not as a badge of its own colour. */}
        <StageHeader
          stage="tco"
          eyebrow={<CcTag>Demonstration model</CcTag>}
          actions={
            <span className="cc-no-print">
              <CcButton icon={<Printer size={16} aria-hidden="true" />} onClick={handlePrint}>
                Print model estimate
              </CcButton>
            </span>
          }
        >
          Upgrade-effort model on assumed coefficients, priced with your own cost figures. Not a business case.
        </StageHeader>

        {/* TCO Inputs (hidden when printing) */}
        <div className="print:hidden">
          <section className={`p-4 md:p-6 ${CARD}`} aria-labelledby="tco-inputs-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id="tco-inputs-title" className="cc-text-h2 text-cc-ink flex items-center gap-2">
                <Calculator size={16} aria-hidden="true" className="text-cc-ink-muted" />
                Interactive TCO model inputs
              </h2>
              <CcRequiredNote />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Input 1 */}
              <RangeField
                label="Legacy lines of code (LoC)"
                help="Total lines of custom legacy ABAP."
                min={Math.min(1000, sourceLoc ?? 1000)}
                max={Math.max(50000, sourceLoc ?? 50000)}
                step={500}
                value={loc}
                onChange={setLoc}
                readout={<span data-stage-output="legacyCode">{formatNumber(loc)} LoC</span>}
                valueText={`${formatNumber(loc)} LoC`}
              />

              {/* Inputs 2, 3 and 6 are yours to state. Sliders cannot be empty,
                  which is how €900, €15,000 and €650 came to be "your" figures. */}
              <CostField
                currency={currency}
                field="dev-rate"
                label="Developer day rate"
                unit=" / day"
                hint="Your rate for SAP ABAP/BTP developers."
                value={devRate}
                onChange={setDevRate}
              />

              <CostField
                currency={currency}
                field="investment"
                label="Modernization investment"
                unit=""
                hint="Your one-time refactoring & deployment budget."
                value={oneTimeCost}
                onChange={setOneTimeCost}
              />

              {/* Input 4 */}
              <RangeField
                label="RISE major upgrades / yr"
                min={0}
                max={3}
                step={1}
                value={upgradeFreq}
                onChange={setUpgradeFreq}
                readout={`${upgradeFreq} Upgrade${upgradeFreq === 1 ? '' : 's'}`}
              />

              {/* Input 5 */}
              <RangeField
                label="Feature pack updates / yr"
                min={0}
                max={4}
                step={1}
                value={fpFreq}
                onChange={setFpFreq}
                readout={`${fpFreq} Updates`}
              />

              <CostField
                currency={currency}
                field="user-rate"
                label="Key-user day rate"
                unit=" / day"
                hint="Your rate for the key users who run regression tests."
                value={userRate}
                onChange={setUserRate}
              />

            </div>
          </section>
        </div>

        {/* A demonstration model, and it says so before it says anything else. */}
        <div data-tco-model-notice>
          <CcMessageStrip state="warning" headline="A demonstration model, not a business case.">
            Your cost figures go in; the rest
            stays assumption: effort per 1,000 lines (2.5 / 0.8 days development, 1.8 / 0.6 days testing
            per upgrade / feature pack), an 85&nbsp;% reduction in regression-test effort, and a target score
            of 95. None of these is derived from observed effort. Do not carry the figures below into a
            business case without replacing them with your own measurements.
          </CcMessageStrip>
        </div>

        {/* No forecast from figures nobody entered (E12-F01-US02). */}
        {!(calculations && currency) && (
          <section className={`p-4 md:p-6 ${CARD}`} data-tco-no-forecast>
            <h2 className="cc-text-h2 text-cc-ink">No savings forecast yet</h2>
            <p className="cc-text-body text-cc-ink-muted mt-2">
              {missingCosts.length > 0 ? (
                <>
                  The model needs your own cost figures and has no defaults for them. Missing:{' '}
                  <strong className="font-semibold text-cc-ink">{missingCosts.join(', ')}</strong>.
                  {!currency ? ' The currency is stated once, in "Options and costs" below, and both halves of this stage use it.' : ''}
                </>
              ) : upgradeFreq + fpFreq === 0 ? (
                <>
                  With no release upgrade and no feature pack update in a year, the model has no upgrade
                  effort to price, so there is no saving to forecast.
                </>
              ) : (
                <>
                  For these inputs the model has nothing to price: below a few hundred lines the annual
                  legacy maintenance effort rounds to zero days, and a saving measured against zero is not
                  a number. Set the lines of code to the size of the estate you mean to model.
                </>
              )}
            </p>
            <p className="cc-text-meta text-cc-ink-muted mt-3">
              The page used to fill in €900, €650 and €15,000 and show annual savings, a payback period
              and an ROI on them as soon as it opened.
            </p>
          </section>
        )}

        {calculations && currency && (<>

        {/* The three headline figures. One card style for all three: the first
            used to be a dark gradient panel with a green label, which said
            "proven" about a scenario (§1.1). */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`p-4 md:p-6 flex flex-col justify-between min-h-[160px] ${CARD}`}>
            {/* A scenario, and it says so. The cost figures are the reader's own;
                the effort coefficients and the post-modernisation score of 95 are
                assumptions nothing measured. */}
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
                  {/* The acceptance's own words (E12-F01-US02): no negative
                      payback period, but "no payback in the model". A refusal
                      is not a warning, so it stands in ink. */}
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
                  <p className="cc-text-meta text-cc-ink-muted mt-1">Amortization of one-time investment.</p>
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
                    A return needs something spent to return on. Enter an investment above.
                  </p>
                </>
              ) : (
                <>
                  <p className="cc-text-figure text-cc-ink mt-2 flex items-baseline gap-1">
                    {calculations.roiYear1}%
                    <span className="cc-text-meta text-cc-ink-muted">Return</span>
                  </p>
                  <p className="cc-text-meta text-cc-ink-muted mt-1">Net dividend on modernization spend.</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Detailed Breakdown Comparison Grid. Neither side is an error or a
            proof — both are the same model under two assumptions — so both
            stand in ink, told apart by their titles and icons. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Legacy Block */}
          <section className={`p-4 md:p-6 ${CARD}`} aria-labelledby="tco-legacy-title">
            <h3 id="tco-legacy-title" className="cc-text-h3 text-cc-ink mb-4 flex items-center gap-2">
              <AlertCircle size={16} aria-hidden="true" className="text-cc-ink-muted" />
              Pre-modernization TCO (legacy)
            </h3>

            <div className="space-y-4">
              <BreakdownRow
                title="Adaptation Maintenance"
                note="Tightly-coupled code modifications"
                amount={formatAmount(calculations.legacyDevDaysTotal * calculations.devRate, currency)}
                days={`${Math.round(calculations.legacyDevDaysTotal)} Dev-Days / yr`}
              />
              <BreakdownRow
                title="Manual Regression Testing"
                note="Business Key-User manual execution"
                amount={formatAmount(calculations.legacyTestDaysTotal * calculations.userRate, currency)}
                days={`${Math.round(calculations.legacyTestDaysTotal)} Tester-Days / yr`}
              />
              <div className="flex justify-between items-baseline gap-4 pt-2">
                <span className="cc-text-label text-cc-ink">Total Legacy TCO</span>
                <span className="cc-text-h2 text-cc-ink">{formatAmount(calculations.legacyAnnualTotal, currency)} <span className="cc-text-meta text-cc-ink-muted">/ yr</span></span>
              </div>
            </div>
          </section>

          {/* Modernized Block */}
          <section className={`p-4 md:p-6 ${CARD}`} aria-labelledby="tco-modern-title">
            <h3 id="tco-modern-title" className="cc-text-h3 text-cc-ink mb-4 flex items-center gap-2">
              <ShieldCheck size={16} aria-hidden="true" className="text-cc-ink-muted" />
              Post-modernization TCO (Clean Core)
            </h3>

            <div className="space-y-4">
              <BreakdownRow
                title="Upgrade-Safe Adaptation"
                note="Decoupled standard API routing"
                amount={formatAmount(calculations.modernDevDaysTotal * calculations.devRate, currency)}
                days={`${Math.round(calculations.modernDevDaysTotal)} Dev-Days / yr`}
              />
              <BreakdownRow
                title="Automated Regression Checks"
                note="Sandboxed unit test suite validations"
                amount={formatAmount(calculations.modernTestDaysTotal * calculations.userRate, currency)}
                days={`${Math.round(calculations.modernTestDaysTotal)} Tester-Days / yr`}
              />
              <div className="flex justify-between items-baseline gap-4 pt-2">
                <span className="cc-text-label text-cc-ink">Total Modernized TCO</span>
                <span className="cc-text-h2 text-cc-ink">{formatAmount(calculations.modernAnnualTotal, currency)} <span className="cc-text-meta text-cc-ink-muted">/ yr</span></span>
              </div>
            </div>
          </section>

        </div>

        {/* Recharts Cumulative Benefits Forecast Chart */}
        <section className={`p-4 md:p-6 ${CARD}`} aria-labelledby="tco-forecast-title">
          <h3 id="tco-forecast-title" className="cc-text-h2 text-cc-ink mb-4 flex items-center gap-2">
            <BarChart3 size={16} aria-hidden="true" className="text-cc-ink-muted" />
            5-year cumulative financial ROI forecast
          </h3>
          {/* Every figure the chart draws is also text (§1.8): the curve is
              the six points below, read out in the label. */}
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
            Cumulative financial dividend (annual savings minus one-time investment). 5-year net return: <span className="text-cc-ink">{formatAmount(fiveYear[5]?.['Net Financial Benefit'], currency)}</span>.
          </p>
        </section>
        </>)}

        {/* Options with costs (roadmap 7.4). A separate calculation from the
            forecast above and deliberately so: that one prices a single
            modernisation against assumed coefficients, this one prices options
            against each other out of one revision of stated assumptions, and it
            names no cheapest option while any of them is incomplete. */}
        <OptionComparison loc={loc} currency={currency} onCurrencyChange={setCurrency} />

        {/* Printed with the estimate, so a copy cannot leave without it. It
            used to read "Business Value Report" under figures from defaults. */}
        <div className="hidden print:block border-t border-cc-line pt-8 mt-12 text-center cc-text-meta text-cc-ink-muted">
          <p className="font-bold">Clean-Core.io — model estimate, not a business case</p>
          {/* The inputs the estimate was priced with, so the printed page can be
              read on its own (Sonny, 30.09.2026) — the input panel itself does not print. */}
          <p data-tco-print-inputs="">
            Inputs: {formatNumber(loc)} LoC · developer day rate {formatAmount(devRate, currency)} · key-user day rate{' '}
            {formatAmount(userRate, currency)} · modernisation investment {formatAmount(oneTimeCost, currency)} ·{' '}
            {upgradeFreq} release upgrade{upgradeFreq === 1 ? '' : 's'} and {fpFreq} feature pack update{fpFreq === 1 ? '' : 's'} per year.
          </p>
          <p>Priced with these cost figures; effort coefficients, the 85&nbsp;% test effect and the target score of 95 are assumptions, not observed effort. Not an official SAP certification. Requires your own review and validation.</p>
        </div>

        <div className="print:hidden">
          <NavigationButtons
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

/**
 * A slider in the field frame of §2.7: label above, hint below it, and what
 * the slider stands at said in words under the control — a range has no text
 * of its own, so without the readout a reader sees a knob and no number.
 */
function RangeField({
  label,
  help,
  min,
  max,
  step,
  value,
  onChange,
  readout,
  valueText,
}: {
  label: string;
  help?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  readout: ReactNode;
  valueText?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <CcField label={label} help={help}>
        {({ id, describedBy }) => (
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-describedby={describedBy}
            aria-valuetext={valueText ?? (typeof readout === 'string' ? readout : undefined)}
            onChange={e => onChange(Number(e.target.value))}
            className="w-full min-h-8 cursor-pointer accent-cc-ink"
          />
        )}
      </CcField>
      <span className="cc-text-meta text-cc-ink">{readout}</span>
    </div>
  );
}

/**
 * A figure the reader states, in the currency they stated. Empty until they do
 * — there is no default to fall back on, which is the point: an empty field
 * keeps the forecast away. It used to print a euro sign nobody chose.
 *
 * Required (ADR-035): the asterisk on the label, `aria-required` on the input.
 * An empty field says so once the reader has left it (§2.7 — on blur, not on
 * the first keystroke); the name of what is missing stands in "No savings
 * forecast yet" from the start.
 */
function CostField({
  currency,
  field,
  label,
  unit,
  hint,
  value,
  onChange,
}: {
  currency: string;
  field: string;
  label: string;
  unit: string;
  hint: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [left, setLeft] = useState(false);
  const missing = value === null && left;
  return (
    <CcField
      label={label}
      required
      help={
        <>
          {hint}
          {value !== null ? (
            <>
              {' '}
              <span className="text-cc-ink">{`${formatAmount(value, currency)}${unit}`}</span>
            </>
          ) : null}
        </>
      }
      valueState={missing ? 'warning' : undefined}
      message={missing ? 'Your figure — there is no default.' : undefined}
    >
      {({ id, describedBy, ariaRequired, className }) => (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={value ?? ''}
          placeholder="— enter your figure"
          data-tco-cost={field}
          aria-required={ariaRequired}
          aria-describedby={describedBy}
          onBlur={() => setLeft(true)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(null);
            const n = Number(raw);
            onChange(Number.isFinite(n) && n >= 0 ? n : null);
          }}
          className={className}
        />
      )}
    </CcField>
  );
}
