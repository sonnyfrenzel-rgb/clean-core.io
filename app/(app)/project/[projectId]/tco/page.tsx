'use client';

import { useState, useEffect, useMemo } from 'react';
import { tcoForecast, TCO_TARGET_SCORE, type TcoForecastRow } from '@/lib/tco-model';
import { useParams } from 'next/navigation';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import type { Project } from '@/lib/types';
import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import StageFooter from '@/components/StageFooter';
import { workflowSteps, staleness } from '@/lib/workflow-steps';
import { ShieldCheck, Printer, BarChart3, AlertCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import OptionComparison, {
  OptionVerdict,
  initialCostAssumptions,
  pendingProposals,
  takeOverPatch,
} from '@/components/tco/OptionComparison';
import { CadenceField, ChecklistLine, CurrencyField, FigureField, RangeField } from '@/components/tco/EconomicsChecklist';
import { EconomicsGuide, EconomicsStep, ProposalFactors, type EconomicsStepInfo } from '@/components/tco/EconomicsSteps';
import WorkspaceMetaLine from '@/components/workspace/MetaLine';
import StageMetaDetails from '@/components/StageMetaDetails';
import GlossaryTerm from '@/components/GlossaryTerm';
import { metaLine } from '@/lib/workspace-model';
import { costComparison, formatAmount, proposeEffort, type CostAssumptions, type CostOption } from '@/lib/cost-assumptions';
import { comparisonChecklist, forecastChecklist, type ChecklistRow } from '@/lib/economics-checklist';
import { formatDays, formatLines, formatNumber, formatPercentValue } from '@/lib/format';
import { countSourceLines } from '@/lib/source-lines';
import { SEQUENTIAL_CHART_COLORS } from '@/lib/chart-colors';
import CcButton from '@/components/cc/Button';
import CcDisclosure from '@/components/cc/Disclosure';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSkeleton from '@/components/cc/Skeleton';
import BusinessValuePlan from '@/components/tco/BusinessValuePlan';

/** A tile inside a step card: outlined, no second shadow. */
const INNER = 'cc-card rounded-cc-card border border-cc-line bg-cc-surface';

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
          {/* `v / 1000` printed as it came: "EUR 12.345k" (owner, 03.10.2026). */}
          <YAxis stroke="var(--cc-ink-muted)" tickFormatter={v => `${currency} ${formatNumber(Number(v) / 1000, { maximumFractionDigits: 1 })}k`} width={68} tick={{ fontSize: 11 }} />
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
 * Economics — a tool of the workspace (ADR-050), as a guided flow of four
 * numbered steps since 03.10.2026 (owner: "the user doesn't find their way
 * here … needs more guidance for this tool"):
 *
 *   1. Your codebase — the lines and the score of the signed run.
 *   2. Your rates — currency, the two day rates, the time horizon, the cadence.
 *   3. Effort per option — the proposal from the code size, taken over as the
 *      reader's own figure with one action, or their own figures.
 *   4. Result — the options compared over the horizon, and the savings forecast.
 *
 * A guide above the steps names the one next action. The coefficients, the
 * proposal factors and the running-cost breakdown sit in "How this is
 * calculated"; they explain a result, they do not help reach one.
 *
 * Money honesty is unchanged and visible: every amount comes from the reader's
 * own figures and carries *Simulation*; nothing has a default; no cheapest
 * option is named while an option is incomplete (`lib/cost-assumptions.ts`);
 * the savings forecast stays a demonstration model on assumed coefficients
 * (`lib/tco-model.ts`) and says so where it stands. Every number on the page
 * goes through `lib/format.ts`.
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
  // Which option cards show their fields — closed until the reader asks.
  const [editingOptions, setEditingOptions] = useState<ReadonlySet<string>>(() => new Set());
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
            const lines = countSourceLines(data.legacyCode);
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
      <StageFrame stage="tco" className="cc min-h-screen">
        <CcSkeleton shape="cards" label="the economics model" count={3} />
      </StageFrame>
    );
  }

  if (loadError) return (
    <StageFrame stage="tco" className="cc min-h-screen">
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
    </StageFrame>
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
  const row = (key: ChecklistRow['key']) => allRows.find((r) => r.key === key)!;
  const rowsDone = (keys: ChecklistRow['key'][]) =>
    keys.every((k) => {
      const r = allRows.find((x) => x.key === k);
      return !r || r.status === 'done';
    });
  // The two day rates are the forecast's too; only where there is a forecast
  // do they carry its names (the print footer and its specs read them).
  const forecastName = (name: string): Record<`data-${string}`, string> =>
    forecastPossible ? { 'data-tco-cost': name } : {};
  const forecastShown = forecastPossible && calculations !== null && Boolean(currency);
  const meta = metaLine(project, projectId as string);
  const metaEntries = [
    { key: 'lines', label: 'lines', value: sourceLoc === null ? null : formatNumber(sourceLoc) ?? String(sourceLoc) },
    ...meta.filter((m) => m.key === 'catalog' || m.key === 'engine'),
  ];
  const toggleOption = (id: string) =>
    setEditingOptions((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- The four steps and where each stands ----
  const pending = pendingProposals(assumptions.options, proposal);
  const ratesDone = rowsDone(['currency', 'dev-rate', 'test-rate', 'horizon', 'cadence']);
  const effortDone = rowsDone(['one-off', 'per-release', 'baseline', 'upgrade-delay']);
  const compared = ratesDone && effortDone;
  const forecastWaits = forecastPossible && !forecastShown;
  const steps: EconomicsStepInfo[] = [
    { n: 1, id: 'economics-step-codebase', title: 'Your codebase', state: sourceLoc === null ? 'input' : 'done' },
    { n: 2, id: 'economics-step-rates', title: 'Your rates', state: ratesDone ? 'done' : 'input' },
    {
      n: 3,
      id: 'economics-step-effort',
      title: 'Effort per option',
      state: effortDone ? 'done' : pending.length > 0 ? 'proposal' : 'input',
    },
    {
      n: 4,
      id: 'economics-step-result',
      title: 'Result',
      state: !compared ? 'waiting' : forecastWaits ? 'input' : 'done',
      waitingFor: !ratesDone && !effortDone ? 'steps 2 and 3' : !ratesDone ? 'step 2' : 'step 3',
    },
  ];
  const next = steps.slice(1).find((s) => s.state !== 'done' && s.state !== 'waiting') ?? null;
  const isNext = (n: number) => next?.n === n;

  const goTo = (id: string, focus = true) => {
    const section = document.getElementById(id);
    section?.scrollIntoView({ block: 'start' });
    if (!focus || !section) return;
    // The first field still empty, or the first field at all.
    const fields = Array.from(section.querySelectorAll<HTMLInputElement>('input:not([type=checkbox]):not([type=range])'))
      .filter((el) => el.offsetParent !== null);
    (fields.find((el) => el.value === '') ?? fields[0])?.focus({ preventScroll: true });
  };
  const takeOverAll = () => {
    if (!proposal) return;
    const ids = new Set(pending.map((o) => o.id));
    setStated((a) => ({ ...a, options: a.options.map((o) => (ids.has(o.id) ? { ...o, ...takeOverPatch(proposal) } : o)) }));
  };
  const takeOverLabel = pending.length > 1 ? `Take over all ${pending.length} proposals` : 'Take over the proposal as my figure';
  const openFirstIncomplete = () => {
    const first = assumptions.options.find((o) => {
      const cost = comparison.costs.find((c) => c.optionId === o.id);
      return !(cost && cost.total);
    });
    if (first && !editingOptions.has(first.id)) toggleOption(first.id);
    goTo('economics-step-effort', false);
  };

  const guide = (() => {
    if (next?.n === 2) {
      return {
        sentence: 'Enter your currency and what a developer day and a key-user day cost you. Nothing has a default.',
        action: <CcButton variant="primary" data-economics-next-action="" onClick={() => goTo('economics-step-rates')}>Enter your rates</CcButton>,
      };
    }
    if (next?.n === 3) {
      return pending.length > 0
        ? {
            sentence: 'Take over the effort proposed from the size of your code as your own figure — you can change it afterwards.',
            action: <CcButton variant="primary" data-economics-next-action="" data-economics-take-over-all="" onClick={() => { takeOverAll(); goTo('economics-step-effort', false); }}>{takeOverLabel}</CcButton>,
          }
        : {
            sentence: 'Fill in what each option still needs — for Keep and Do nothing, the yearly maintenance effort.',
            action: <CcButton variant="primary" data-economics-next-action="" onClick={openFirstIncomplete}>Fill in the effort</CcButton>,
          };
    }
    if (next?.n === 4) {
      return {
        sentence: 'The options are compared. Enter the one-time modernisation budget to see the savings forecast and its payback.',
        action: <CcButton variant="primary" data-economics-next-action="" onClick={() => goTo('economics-step-result')}>Enter the budget</CcButton>,
      };
    }
    return {
      sentence: 'every option is priced from your figures. Read the comparison in step 4 — a scenario, not a quote.',
      action: <CcButton variant="primary" data-economics-next-action="" onClick={() => goTo('economics-step-result', false)}>See the result</CcButton>,
    };
  })();

  return (
    // `.cc` puts the stage under the workspace's focus ring (§1.6) and its
    // print rule (§7.1). The way back to the workspace does not print either;
    // `StageHeader` marks it `cc-no-print` for every stage.
    <StageFrame stage="tco" className="cc min-h-screen print:p-0" data-economics="">
      <StageHeader tools={{ steps: phases, current: 'tco' }} projectName={project?.name} stage="tco" eyebrow={<CcProvenanceChip value="simulation" />}>
        What keeping, changing or retiring this code would cost — priced only from figures you state.
      </StageHeader>

      <div className="-mt-6" data-economics-head="">
        {/* Behind "Details" until asked for (owner 02.10.2026, DESIGN.md §2.11). */}
        <StageMetaDetails>
          <WorkspaceMetaLine entries={metaEntries} />
        </StageMetaDetails>
      </div>

      <div className="mt-4 flex flex-col gap-5">
        <EconomicsGuide
          steps={steps}
          next={next}
          sentence={guide.sentence}
          action={guide.action}
          secondary={
            pending.length > 0 && next?.n !== 3 ? (
              <CcButton variant="secondary" data-economics-take-over-all="" onClick={() => { takeOverAll(); goTo('economics-step-effort', false); }}>
                {takeOverLabel}
              </CcButton>
            ) : undefined
          }
        />

        {/* Step 1 — what the figures rest on, read from the signed run. */}
        <EconomicsStep
          step={steps[0]}
          next={false}
          guidance="Read from your signed run — nothing to do here. The lines size the effort proposal in step 3; the score is what the savings forecast starts from."
        >
          <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={`px-4 py-3 ${INNER}`}>
              <dt className="cc-text-label text-cc-ink-muted">Lines of custom code</dt>
              <dd className="m-0 mt-1 cc-text-h2 text-cc-ink">
                {/* The line count, visible without opening anything — the only
                    form the source takes on this page (preservation register). */}
                <span data-stage-output="legacyCode">{formatLines(loc)} LoC</span>
                <span className="ml-2 cc-text-meta font-medium text-cc-ink-muted">
                  {sourceLoc !== null && loc === sourceLoc ? 'from your source' : 'your figure'}
                </span>
              </dd>
            </div>
            <div className={`px-4 py-3 ${INNER}`}>
              <dt className="cc-text-label text-cc-ink-muted">Clean Core Score</dt>
              <dd className="m-0 mt-1 cc-text-h2 text-cc-ink">
                {baselineScore === null ? (
                  <span className="cc-text-body text-cc-ink-muted">No score from a signed run</span>
                ) : (
                  <>
                    {formatNumber(baselineScore, { maximumFractionDigits: 0 })}
                    <span className="ml-2 cc-text-meta font-medium text-cc-ink-muted">
                      {sourceChanged ? 'of a previous source' : 'from the signed run'}
                    </span>
                  </>
                )}
              </dd>
            </div>
          </dl>
          {forecastPossible ? (
            <ul className="m-0 mt-2 list-none p-0">
              <ChecklistLine
                row={{ ...row('loc'), label: 'Model a different size' }}
                summary={`${formatLines(loc)} lines`}
              >
                <RangeField
                  label="Lines of custom code"
                  help="The size of the estate to model. Starts at the lines of your source."
                  min={Math.min(1000, sourceLoc ?? 1000)}
                  max={Math.max(50000, sourceLoc ?? 50000)}
                  step={500}
                  value={loc}
                  onChange={setLoc}
                  readout={<span>{formatNumber(loc)} LoC</span>}
                  valueText={`${formatNumber(loc)} LoC`}
                />
              </ChecklistLine>
            </ul>
          ) : null}
        </EconomicsStep>

        {/* Step 2 — the shared figures, asked for once, in plain fields. */}
        <EconomicsStep
          step={steps[1]}
          next={isNext(2)}
          guidance={
            <>
              Enter what a developer day and a <GlossaryTerm termKey="Key-user day">key-user day</GlossaryTerm> cost
              you, in your currency, and the period to compare over. Nothing has a default: every amount on this page is
              priced from these.
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-economics-checklist="">
            <CurrencyField currency={currency} onChange={setCurrency} />
            <div className="hidden sm:block" aria-hidden={true} />
            <FigureField
              label="Developer day rate"
              hint="SAP ABAP / SAP BTP development, per day."
              value={devRate}
              onChange={setDevRate}
              suffix={currency ? `${currency} / day` : '/ day'}
              data={{ 'data-cost-field': 'dev-day-rate', ...forecastName('dev-rate') }}
            />
            <FigureField
              label="Key-user day rate"
              hint="The people who test a change by hand, per day."
              value={userRate}
              onChange={setUserRate}
              suffix={currency ? `${currency} / day` : '/ day'}
              data={{ 'data-cost-field': 'test-day-rate', ...forecastName('user-rate') }}
            />
            <FigureField
              label="Time horizon in years"
              hint="One-off and recurring effort only compare over a period you name."
              value={assumptions.horizonYears}
              onChange={(v) => patch({ horizonYears: v })}
              data={{ 'data-cost-field': 'horizon-years' }}
            />
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
          </div>
        </EconomicsStep>

        {/* Step 3 — the effort per option, with the proposal on each card. */}
        <EconomicsStep
          step={steps[2]}
          next={isNext(3)}
          guidance={
            proposal
              ? 'Each option needs its effort in days. Take over the proposal from the size of your code as your own figure, or enter your own. Keep and Do nothing also need a yearly maintenance effort.'
              : 'Each option needs its effort in days — your own figures, there is no line count to propose from. Keep and Do nothing also need a yearly maintenance effort.'
          }
          right={
            pending.length > 1 ? (
              <span className="cc-no-print">
                <CcButton variant="primary" data-economics-take-over-all="" onClick={takeOverAll}>
                  {takeOverLabel}
                </CcButton>
              </span>
            ) : undefined
          }
        >
          <OptionComparison
            assumptions={assumptions}
            comparison={comparison}
            proposal={proposal}
            onPatchOption={patchOption}
            editing={editingOptions}
            onToggleEdit={toggleOption}
          />
        </EconomicsStep>

        {/* Step 4 — the comparison, the forecast, and how both are calculated. */}
        <EconomicsStep
          step={steps[3]}
          next={isNext(4)}
          guidance={
            <>
              What each option costs over your time horizon — its <GlossaryTerm termKey="TCO">TCO</GlossaryTerm> — and
              what modernising would save, with its <GlossaryTerm termKey="Payback period">payback</GlossaryTerm>. A
              scenario on your figures, not a quote.
            </>
          }
          right={
            <span className="cc-no-print">
              <CcButton icon={<Printer size={16} aria-hidden="true" />} onClick={handlePrint}>
                Print model estimate
              </CcButton>
            </span>
          }
        >
          <div className="space-y-6">
            <section aria-labelledby="economics-compare-title">
              <h3 id="economics-compare-title" className="mb-3 flex flex-wrap items-center gap-2 cc-text-h3 text-cc-ink">
                Options compared <CcProvenanceChip value="simulation" />
              </h3>
              <OptionVerdict assumptions={assumptions} comparison={comparison} currency={currency} />
            </section>

            {/* The savings forecast — a demonstration model, said where it stands. */}
            <section aria-labelledby="economics-forecast-title" id="economics-forecast" className="border-t border-cc-line pt-5">
              <h3 id="economics-forecast-title" className="mb-3 flex flex-wrap items-center gap-2 cc-text-h3 text-cc-ink">
                Savings from modernising <CcProvenanceChip value="simulation" />
              </h3>
              <div className="space-y-4">
                {!forecastPossible ? (
                  <div className={`p-4 ${INNER}`} data-tco-no-baseline="">
                    <h4 className="cc-text-h3 text-cc-ink">No baseline to model against</h4>
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
                        Your cost figures go in; the effort per 1,000 lines, the test effect and the target score are
                        assumptions, written out under &ldquo;How this is calculated&rdquo;.
                      </CcMessageStrip>
                    </div>

                    <div className="max-w-md">
                      <FigureField
                        label="One-time modernisation budget"
                        hint="Your one-time refactoring and deployment budget."
                        value={oneTimeCost}
                        onChange={setOneTimeCost}
                        suffix={currency || undefined}
                        data={{ 'data-tco-cost': 'investment' }}
                      />
                    </div>
                    <ul className="m-0 list-none p-0">
                      <ChecklistLine row={row('upgrades')} summary={formatNumber(upgradeFreq) ?? String(upgradeFreq)}>
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
                      <ChecklistLine row={row('feature-packs')} summary={formatNumber(fpFreq) ?? String(fpFreq)}>
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

                    {/* No forecast from figures nobody entered (E12-F01-US02). */}
                    {!(calculations && currency) && (
                      <div className={`p-4 ${INNER}`} data-tco-no-forecast>
                        <h4 className="cc-text-h3 text-cc-ink">No savings forecast yet</h4>
                        <p className="cc-text-body text-cc-ink-muted mt-1">
                          {missingCosts.length > 0 ? (
                            <>
                              The model has no defaults for your cost figures. Missing:{' '}
                              <strong className="font-semibold text-cc-ink">{missingCosts.join(', ')}</strong> — the
                              rates are step 2, the budget is just above.
                            </>
                          ) : upgradeFreq + fpFreq === 0 ? (
                            <>
                              With no release upgrade and no feature pack update in a year, the model has no upgrade
                              effort to price, so there is no saving to forecast.
                            </>
                          ) : (
                            <>
                              For these inputs the model has nothing to price: below a few hundred lines the annual
                              legacy maintenance effort rounds to zero days. Set the lines of code in step 1 to the size
                              of the estate you mean to model.
                            </>
                          )}
                        </p>
                      </div>
                    )}

                    {calculations && currency && (<>
                      {/* The three headline figures, one tile style for all three:
                          green would say "proven" about a scenario (§1.1). */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className={`p-4 flex flex-col justify-between ${INNER}`}>
                          <span className="cc-text-label text-cc-ink-muted block">Annual Net Savings · Scenario</span>
                          <div>
                            <p className="cc-text-figure text-cc-ink mt-2 flex flex-wrap items-baseline gap-1">
                              {formatAmount(calculations.annualSavings, currency)}
                              <span className="cc-text-meta text-cc-ink-muted">/ year</span>
                            </p>
                            <p className="cc-text-meta text-cc-ink-muted mt-1">
                              Maintenance overhead reduced by {formatPercentValue(calculations.overheadReductionPct)}.
                            </p>
                          </div>
                        </div>

                        <div className={`p-4 flex flex-col justify-between ${INNER}`}>
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
                                  {formatNumber(calculations.paybackMonths, { maximumFractionDigits: 1 })}
                                  <span className="cc-text-meta text-cc-ink-muted">Months</span>
                                </p>
                                <p className="cc-text-meta text-cc-ink-muted mt-1">Until the one-time budget is paid back.</p>
                              </>
                            )}
                          </div>
                        </div>

                        <div className={`p-4 flex flex-col justify-between ${INNER}`}>
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
                                  {formatPercentValue(calculations.roiYear1)}
                                  <span className="cc-text-meta text-cc-ink-muted">Return</span>
                                </p>
                                <p className="cc-text-meta text-cc-ink-muted mt-1">Net return on the one-time budget.</p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="m-0 cc-text-meta text-cc-ink-muted">
                        Annual savings minus the one-time budget, added up. After five years:{' '}
                        <span className="text-cc-ink">{formatAmount(fiveYear[5]?.['Net Financial Benefit'], currency)}</span>.
                      </p>
                    </>)}
                  </>
                )}
              </div>
            </section>

            {/* The coefficients and intermediate figures: they explain a result,
                they do not help reach one (owner, 03.10.2026). */}
            <section className="border-t border-cc-line pt-4" data-economics-how="">
              <CcDisclosure title="How this is calculated">
                <div className="space-y-5">
                  {proposal ? (
                    <div>
                      <h4 className="mb-2 cc-text-h3 text-cc-ink">The proposal in step 3</h4>
                      <ProposalFactors loc={loc} />
                    </div>
                  ) : null}
                  <div>
                    <h4 className="mb-1 cc-text-h3 text-cc-ink">The cost of an option</h4>
                    <p className="m-0 cc-text-cell text-cc-ink-muted">
                      One-off effort (low and high) plus the effort per release times the releases in the time horizon,
                      plus the yearly maintenance for Keep and Do nothing — every day priced at your developer or
                      key-user day rate. Ranges stay ranges: an option is only cheapest when its upper bound is below
                      every other option&rsquo;s lower bound.
                    </p>
                  </div>
                  {forecastPossible ? (
                    <div>
                      <h4 className="mb-1 cc-text-h3 text-cc-ink">The savings forecast</h4>
                      <p className="m-0 cc-text-cell text-cc-ink-muted">
                        Effort per 1,000 lines and year: 2.5 developer days per upgrade and 0.8 per feature pack, 1.8
                        and 0.6 key-user days for testing. Modernised code is assumed to reach a score of{' '}
                        {TCO_TARGET_SCORE}, and to need 85&nbsp;% less regression testing. None of these is derived from
                        observed effort.
                      </p>
                    </div>
                  ) : null}

                  {calculations && currency ? (
                    <>
                      {/* Both sides are the same model under two assumptions — ink, not state colours. */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <section className={`p-4 ${INNER}`} aria-labelledby="tco-legacy-title">
                          <h4 id="tco-legacy-title" className="cc-text-h3 text-cc-ink mb-4 flex items-center gap-2">
                            <AlertCircle size={16} aria-hidden="true" className="text-cc-ink-muted" />
                            Running cost today, per year
                          </h4>
                          <div className="space-y-4">
                            <BreakdownRow
                              title="Adapting the code at each upgrade"
                              note="Modifications tightly coupled to the core"
                              amount={formatAmount(calculations.legacyDevDaysTotal * calculations.devRate, currency)}
                              days={`${formatDays(calculations.legacyDevDaysTotal)} developer days / yr`}
                            />
                            <BreakdownRow
                              title="Manual regression testing"
                              note="Key users test by hand"
                              amount={formatAmount(calculations.legacyTestDaysTotal * calculations.userRate, currency)}
                              days={`${formatDays(calculations.legacyTestDaysTotal)} key-user days / yr`}
                            />
                            <div className="flex justify-between items-baseline gap-4 pt-2">
                              <span className="cc-text-label text-cc-ink">Total today</span>
                              <span className="cc-text-h3 text-cc-ink">{formatAmount(calculations.legacyAnnualTotal, currency)} <span className="cc-text-meta text-cc-ink-muted">/ yr</span></span>
                            </div>
                          </div>
                        </section>

                        <section className={`p-4 ${INNER}`} aria-labelledby="tco-modern-title">
                          <h4 id="tco-modern-title" className="cc-text-h3 text-cc-ink mb-4 flex items-center gap-2">
                            <ShieldCheck size={16} aria-hidden="true" className="text-cc-ink-muted" />
                            Running cost after modernisation, per year
                          </h4>
                          <div className="space-y-4">
                            <BreakdownRow
                              title="Upgrade-safe adaptation"
                              note="Extensions on released interfaces"
                              amount={formatAmount(calculations.modernDevDaysTotal * calculations.devRate, currency)}
                              days={`${formatDays(calculations.modernDevDaysTotal)} developer days / yr`}
                            />
                            <BreakdownRow
                              title="Automated regression checks"
                              note="A test suite instead of manual runs"
                              amount={formatAmount(calculations.modernTestDaysTotal * calculations.userRate, currency)}
                              days={`${formatDays(calculations.modernTestDaysTotal)} key-user days / yr`}
                            />
                            <div className="flex justify-between items-baseline gap-4 pt-2">
                              <span className="cc-text-label text-cc-ink">Total after modernisation</span>
                              <span className="cc-text-h3 text-cc-ink">{formatAmount(calculations.modernAnnualTotal, currency)} <span className="cc-text-meta text-cc-ink-muted">/ yr</span></span>
                            </div>
                          </div>
                        </section>
                      </div>

                      <section className={`p-4 ${INNER}`} aria-labelledby="tco-forecast-title">
                        <h4 id="tco-forecast-title" className="cc-text-h3 text-cc-ink mb-4 flex items-center gap-2">
                          <BarChart3 size={16} aria-hidden="true" className="text-cc-ink-muted" />
                          Net benefit over five years
                        </h4>
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
                      </section>
                    </>
                  ) : null}
                </div>
              </CcDisclosure>
            </section>
          </div>
        </EconomicsStep>

        {/* The model's view of what the code is worth and what to do first,
            moved here from Analyze (owner decision 02.10.2026). Folded and
            marked as the model's; it prices nothing. */}
        <BusinessValuePlan analysis={project?.analysis} route={project?.extensibilityRoute} />

        {/* Printed with the estimate, so a copy cannot leave without it. */}
        <div className="hidden print:block border-t border-cc-line pt-8 mt-12 text-center cc-text-meta text-cc-ink-muted">
          <p className="font-bold">Clean-Core.io — model estimate, not a business case</p>
          {/* The inputs the estimate was priced with, so the printed page can be
              read on its own (Sonny, 30.09.2026). A cadence nobody set is the
              assumed start value and says so (carried QA finding 5666ef8155a0). */}
          <p data-tco-print-inputs="">
            Inputs: {formatNumber(loc)} LoC · developer day rate {formatAmount(devRate, currency)} · key-user day rate{' '}
            {formatAmount(userRate, currency)} · modernisation investment {formatAmount(oneTimeCost, currency)} ·{' '}
            {upgradeFreq} release upgrade{upgradeFreq === 1 ? '' : 's'}{upgradesStated ? '' : ' (assumed, not stated)'} and {fpFreq}{' '}
            feature pack update{fpFreq === 1 ? '' : 's'}{featurePacksStated ? '' : ' (assumed, not stated)'} per year.
          </p>
          <p>Priced with these cost figures; effort coefficients, the 85&nbsp;% test effect and the target score of 95 are assumptions, not observed effort. Not an official SAP certification. Requires your own review and validation.</p>
        </div>
      </div>

      <div className="mt-6 print:hidden">
        <StageFooter />
      </div>
    </StageFrame>
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
