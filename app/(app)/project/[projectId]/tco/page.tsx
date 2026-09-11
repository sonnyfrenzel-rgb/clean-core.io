'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { enforceActiveRun } from '@/lib/run-guard';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { Project } from '@/lib/types';
import Stepper from '@/components/Stepper';
import StageHeader from '@/components/StageHeader';
import VerificationRail from '@/components/VerificationRail';
import NavigationButtons from '@/components/NavigationButtons';
import { workflowSteps } from '@/lib/workflow-steps';
import { Calculator, ShieldCheck, Printer, BarChart3, AlertCircle } from 'lucide-react';
import dynamic from 'next/dynamic';

// Lazy-load recharts to reduce initial bundle size (~312KB)
const RechartsChart = dynamic(() => import('recharts').then(mod => {
  const { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = mod;
  
  function TcoChart({ data }: { data: any[] }) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="year" stroke="#94a3b8" tick={{ fontSize: 11 }} />
          <YAxis stroke="#94a3b8" tickFormatter={v => `€${(v / 1000)}k`} width={55} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => [value ? `€${Number(value).toLocaleString()}` : '', '']} labelStyle={{ color: '#0f172a', fontWeight: 'bold' }} />
          <Area type="monotone" dataKey="Net Financial Benefit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorNet)" />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  
  return TcoChart;
}), {
  ssr: false,
  loading: () => <div className="h-72 w-full flex items-center justify-center text-gray-400 text-sm">Loading chart...</div>
});

export default function TcoCalculatorPage() {
  const { projectId } = useParams();
  const { profile } = useUserProfile();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // Model inputs.
  //
  // The three cost figures start empty (E12-F01-US02: "without suitable cost
  // inputs, no savings forecast is shown"). They used to start at €900, €650 and
  // €15,000 — "standard enterprise SAP guidelines" that nobody here supplied —
  // and the page presented annual savings, a payback period and an ROI on them
  // the moment it opened. Figures a reader never entered cannot become their
  // business case by default.
  const [loc, setLoc] = useState(8500); // Lines of custom code
  const [devRate, setDevRate] = useState<number | null>(null); // Developer daily rate (€)
  const [userRate, setUserRate] = useState<number | null>(null); // Key-user daily rate (€)
  const [upgradeFreq, setUpgradeFreq] = useState(1); // Major release upgrades per year
  const [fpFreq, setFpFreq] = useState(2); // Feature Pack updates per year
  const [oneTimeCost, setOneTimeCost] = useState<number | null>(null); // Refactoring Implementation investment

  const missingCosts = [
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
            setLoc(data.legacyCode.split('\n').length);
          }
        }
      } catch (err) {
        console.error("Failed to load project:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  // The model. A demonstration, not a business case: the effort coefficients,
  // the 85% test effect and the target score are assumptions (CR-23).
  const calculations = useMemo(() => {
    // No forecast from figures nobody entered.
    if (devRate === null || userRate === null || oneTimeCost === null) return null;

    // No `|| 30`. A project that was never scored has no baseline, and
    // inventing one produced a full financial case out of a number nobody
    // measured.
    const scoreBefore =
      typeof project?.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
    // An assumption, and labelled as one wherever it is shown. Nothing in the
    // run establishes what the code will score after modernisation.
    const scoreAfter = 95;

    // Without a baseline there is no model. Returning null here is the whole
    // point: the page used to substitute 30 and then present exact euro figures,
    // payback months and an ROI percentage for a project nothing had measured.
    if (scoreBefore === null) return null;

    // 1. Pre-Modernization Maintenance Efforts (Days per year)
    // Legacy custom code is tightly coupled, requiring substantial adaptation effort per upgrade
    const legacyDevDaysMajor = Math.round((loc / 1000) * 2.5 * upgradeFreq);
    const legacyDevDaysFp = Math.round((loc / 1000) * 0.8 * fpFreq);
    const legacyDevDaysTotal = legacyDevDaysMajor + legacyDevDaysFp;

    const legacyTestDaysMajor = Math.round((loc / 1000) * 1.8 * upgradeFreq);
    const legacyTestDaysFp = Math.round((loc / 1000) * 0.6 * fpFreq);
    const legacyTestDaysTotal = legacyTestDaysMajor + legacyTestDaysFp;

    const legacyDevCost = legacyDevDaysTotal * devRate;
    const legacyTestCost = legacyTestDaysTotal * userRate;
    const legacyAnnualTotal = legacyDevCost + legacyTestCost;

    // 2. Post-Modernization Maintenance Efforts (Days per year)
    // Decoupled, upgrade-safe standard API extensions require minimal maintenance (Clean Core)
    //
    // v2.8.6: guarded the two divisions downstream of this one, and not this one.
    //
    // The divisor is `100 - scoreBefore`. At a score of 100 it is
    // zero: `factor` becomes Infinity, and from there the ROI reads -Infinity,
    // the overhead reduction reads -Infinity, and the five-year chart is handed
    // Infinity for every modernised year.
    //
    // At 99 there is no division by zero and the output is worse for it, because
    // it looks like a number: factor 5, so the model claims modernising costs
    // 3.35x more, ROI -749%, "overhead reduction" -235%. Both cases have the same
    // cause — `scoreAfter` is a fixed assumption of 95, and code already at or
    // above it has nothing this model can offer.
    //
    // So the model declines instead of computing. Saying "this does not apply
    // here" is the honest output; a negative business case derived from an
    // assumed target is not a finding about the customer's code.
    if (scoreBefore >= scoreAfter) return null;

    const factor = (100 - scoreAfter) / (100 - scoreBefore); // Adaptation reduction factor (typically ~0.08)
    
    // No `Math.max(1, …)`. The floors were asymmetric: the legacy side rounds to
    // zero days for a small codebase while the modernised side was pinned at one
    // day each, so the model reported that modernising *costs* €1,550 a year and
    // pays back in −116 months. The old `lineCount * 10` extrapolation hid it by
    // never letting `loc` fall below 1,000; removing that extrapolation — the
    // right change — exposed this one underneath.
    const modernDevDaysTotal = Math.round(legacyDevDaysTotal * factor);
    const modernTestDaysTotal = Math.round(legacyTestDaysTotal * 0.15); // 85% automated test coverage in Sandbox

    const modernDevCost = modernDevDaysTotal * devRate;
    const modernTestCost = modernTestDaysTotal * userRate;
    const modernAnnualTotal = modernDevCost + modernTestCost;

    // 3. Financial Benefits & ROI
    const annualSavings = legacyAnnualTotal - modernAnnualTotal;
    const cumulativeSavings5Yr = Array.from({ length: 6 }, (_, i) => {
      if (i === 0) return { year: 'Year 0', Legacy: 0, Modernized: -oneTimeCost, NetBenefit: -oneTimeCost };
      const legacyCum = legacyAnnualTotal * i;
      const modernCum = oneTimeCost + (modernAnnualTotal * i);
      const netBenefit = legacyCum - modernCum;
      return {
        year: `Year ${i}`,
        'Legacy TCO': Math.round(legacyCum),
        'Modernized TCO': Math.round(modernCum),
        'Net Financial Benefit': Math.round(netBenefit)
      };
    });

    // Below a few hundred lines the whole model rounds to nothing: there is no
    // legacy maintenance cost to save against, so every figure downstream is a
    // division by zero wearing a euro sign. The page says so instead.
    if (legacyAnnualTotal <= 0) return null;

    // Two divisions with no guard on their divisor, both reachable from the
    // controls on this page: an investment of 0 made the ROI `Infinity`, and code
    // that already scores at the target saves nothing per year, which made the
    // payback period `Infinity` too. Both were rendered straight to the screen.
    //
    // Neither is a number, so neither is shown as one. `null` means "this figure
    // does not exist for these inputs", which is a different statement from zero
    // and the page makes it separately.
    const paybackMonths =
      annualSavings > 0 ? Math.round((oneTimeCost / annualSavings) * 12 * 10) / 10 : null;
    const roiYear1 = oneTimeCost > 0 ? Math.round((annualSavings / oneTimeCost) * 100) : null;
    const overheadReductionPct = Math.round((1 - modernAnnualTotal / legacyAnnualTotal) * 100);

    // Backstop rather than the primary defence. Every known path is guarded
    // above; this catches the next input nobody thought of, because a chart is
    // the one place a non-finite number renders without complaining.
    const everyFigureFinite = [
      legacyAnnualTotal, modernAnnualTotal, annualSavings, overheadReductionPct,
      ...cumulativeSavings5Yr.flatMap((r) => Object.values(r).filter((v) => typeof v === 'number') as number[]),
    ].every(Number.isFinite);
    if (!everyFigureFinite) return null;

    return {
      legacyDevDaysTotal,
      legacyTestDaysTotal,
      legacyAnnualTotal,
      modernDevDaysTotal,
      modernTestDaysTotal,
      modernAnnualTotal,
      annualSavings,
      overheadReductionPct,
      cumulativeSavings5Yr,
      paybackMonths,
      roiYear1,
      scoreBefore,
      scoreAfter,
      // The rates the figures were priced with — non-null here by the gate above.
      devRate,
      userRate,
    };
  }, [project, loc, devRate, userRate, upgradeFreq, fpFreq, oneTimeCost]);

  const handlePrint = () => {
    window.print();
  };

  // Economics is phase 6 of 7. This page used to render the stepper with
  // `currentStep={1}` — it had no number of its own, so it claimed Upload's —
  // and had no rail at all.
  const phases = workflowSteps(project);

  if (loading) return <div className="p-8 text-center">Loading calculations database...</div>;

  // Nothing any input could fix: no signed score, or one at or above the
  // assumed target. Everything else — missing cost figures, an estate too small
  // to price — is shown next to the inputs that would change it.
  const baselineScore = typeof project?.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
  if (baselineScore === null || baselineScore >= 95) {
    return (
      <div className="animate-in fade-in duration-500 bg-[#f8f9ff] min-h-screen p-4 md:p-8">
        <VerificationRail steps={phases} current="tco" projectId={projectId as string} />
        <Stepper steps={phases} current="tco" projectId={projectId as string} />
        <div className="max-w-2xl mx-auto mt-10 bg-white border border-amber-200 rounded-[2rem] p-8 shadow-sm">
          <StageHeader title="No baseline to model against" />
          <p className="text-sm text-slate-600 -mt-4 leading-relaxed">
            {typeof project?.cleanCoreScore === 'number' && project.cleanCoreScore >= 95 ? (
              <>
                This code already scores {project.cleanCoreScore}, at or above the {95} this model
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
          <p className="text-xs text-slate-400 mt-4 leading-relaxed">
            The page used to substitute a score of 30 here and present exact annual savings,
            a payback period and an ROI percentage on the strength of it. A financial case
            built on a number nobody measured is worse than no page at all.
          </p>
        </div>
        <div className="max-w-2xl mx-auto">
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

  return (
    <div className="animate-in fade-in duration-500 bg-[#f8f9ff] min-h-screen p-4 md:p-8 print:bg-white print:p-0">
      
      {/* Navigation, so neither prints. */}
      <VerificationRail steps={phases} current="tco" projectId={projectId as string} />
      <Stepper steps={phases} current="tco" projectId={projectId as string} />

      {/* Main Container */}
      <div className="max-w-6xl mx-auto mt-8 space-y-8 w-full">
        
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b border-gray-250 pb-6">
          <div>
            {/* "Better Practice Mapped" was a badge with nothing mapped behind it. */}
            <StageHeader
              title="TCO &amp; Upgrade-ROI Analysis"
              eyebrow={
                <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full uppercase tracking-wider">Demonstration model</span>
              }
            >
              Upgrade-effort model on assumed coefficients, priced with your own cost figures. Not a business case.
            </StageHeader>
          </div>
          <div className="flex gap-3 print:hidden w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gradient-to-br from-slate-900 to-slate-800 hover:shadow-lg text-white font-bold text-xs uppercase tracking-wider px-6 h-12 rounded-xl transition-all active:scale-95"
            >
              <Printer className="w-4 h-4" /> Print Model Estimate
            </button>
          </div>
        </div>

        {/* TCO Inputs Sliders Card (Hidden when printing) */}
        <div className="bg-white border border-gray-150 rounded-[2rem] p-6 md:p-8 shadow-sm print:hidden">
          <h2 className="text-lg font-black text-[#0b1c30] uppercase mb-6 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-600" />
            Interactive TCO Model Inputs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Input 1 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-700 uppercase">
                <span>Legacy Lines of Code (LoC)</span>
                <span className="text-blue-650">{loc.toLocaleString()} LoC</span>
              </div>
              <input 
                type="range" 
                min="1000" 
                max="50000" 
                step="500"
                value={loc}
                onChange={e => setLoc(Number(e.target.value))}
                className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-[10px] text-gray-400 font-medium block">Total lines of custom legacy ABAP.</span>
            </div>

            {/* Inputs 2, 3 and 6 are yours to state. Sliders cannot be empty,
                which is how €900, €15,000 and €650 came to be "your" figures. */}
            <CostField
              field="dev-rate"
              label="Developer Day Rate"
              unit=" / day"
              hint="Your rate for SAP ABAP/BTP developers."
              value={devRate}
              onChange={setDevRate}
            />

            <CostField
              field="investment"
              label="Modernization Investment"
              unit=""
              hint="Your one-time refactoring & deployment budget."
              value={oneTimeCost}
              onChange={setOneTimeCost}
            />

            {/* Input 4 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-700 uppercase">
                <span>RISE Major Upgrades / Yr</span>
                <span className="text-blue-650">{upgradeFreq} Upgrade</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="3" 
                step="1"
                value={upgradeFreq}
                onChange={e => setUpgradeFreq(Number(e.target.value))}
                className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Input 5 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-700 uppercase">
                <span>Feature Pack Updates / Yr</span>
                <span className="text-blue-650">{fpFreq} Updates</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="4" 
                step="1"
                value={fpFreq}
                onChange={e => setFpFreq(Number(e.target.value))}
                className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <CostField
              field="user-rate"
              label="Key-User Day Rate"
              unit=" / day"
              hint="Your rate for the key users who run regression tests."
              value={userRate}
              onChange={setUserRate}
            />

          </div>
        </div>

        {/* A demonstration model, and it says so before it says anything else. */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-900 leading-relaxed" data-tco-model-notice>
          <strong>A demonstration model, not a business case.</strong> Your cost figures go in; the rest
          stays assumption: effort per 1,000 lines (2.5 / 0.8 days development, 1.8 / 0.6 days testing
          per upgrade / feature pack), an 85&nbsp;% reduction in regression-test effort, and a target score
          of 95. None of these is derived from observed effort. Do not carry the figures below into a
          business case without replacing them with your own measurements.
        </div>

        {/* No forecast from figures nobody entered (E12-F01-US02). */}
        {!calculations && (
          <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm" data-tco-no-forecast>
            <h3 className="text-lg font-black text-[#0b1c30]">No savings forecast yet</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {missingCosts.length > 0 ? (
                <>
                  The model needs your own cost figures and has no defaults for them. Missing:{' '}
                  <strong>{missingCosts.join(', ')}</strong>.
                </>
              ) : (
                <>
                  For these inputs the model has nothing to price: below a few hundred lines the annual
                  legacy maintenance effort rounds to zero days, and a saving measured against zero is not
                  a number. Set the lines of code to the size of the estate you mean to model.
                </>
              )}
            </p>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              The page used to fill in €900, €650 and €15,000 and show annual savings, a payback period
              and an ROI on them as soon as it opened.
            </p>
          </div>
        )}

        {calculations && (<>

        {/* C-Level Executive ROI KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-[2rem] p-6 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[160px]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl pointer-events-none"></div>
            {/* A scenario, and it says so. The cost figures are the reader's own;
                the effort coefficients and the post-modernisation score of 95 are
                assumptions nothing measured. */}
            <span className="text-[10px] font-black text-green-400 uppercase tracking-widest block">Annual Net Savings · Scenario</span>
            <div>
              <h3 className="text-4xl font-black tracking-tight mt-2 flex items-baseline">
                €{calculations.annualSavings.toLocaleString()}
                <span className="text-xs text-gray-400 font-semibold ml-1">/ year</span>
              </h3>
              <p className="text-xs text-gray-400 font-semibold mt-1">Maintenance overhead reduced by {calculations.overheadReductionPct}%.</p>
            </div>
          </div>

          <div className="bg-white border border-gray-150 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between min-h-[160px]">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Payback Period</span>
            <div>
              {calculations.paybackMonths === null ? (
                <>
                  {/* The acceptance's own words (E12-F01-US02): no negative
                      payback period, but "no payback in the model". */}
                  <h3 className="text-2xl font-black text-amber-600 tracking-tight mt-2" data-tco-payback>No payback in the model</h3>
                  <p className="text-xs text-gray-500 font-semibold mt-1">
                    For these inputs the model shows no annual benefit, so there is nothing to pay the investment back with.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-4xl font-black text-slate-900 tracking-tight mt-2 flex items-baseline">
                    {calculations.paybackMonths}
                    <span className="text-xs text-gray-500 font-semibold ml-1">Months</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-semibold mt-1">Amortization of one-time investment.</p>
                </>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-150 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between min-h-[160px]">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Year 1 ROI</span>
            <div>
              {calculations.roiYear1 === null ? (
                <>
                  <h3 className="text-2xl font-black text-amber-600 tracking-tight mt-2">Not defined</h3>
                  <p className="text-xs text-gray-500 font-semibold mt-1">
                    A return needs something spent to return on. Enter an investment above.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-4xl font-black text-blue-650 tracking-tight mt-2 flex items-baseline">
                    {calculations.roiYear1}%
                    <span className="text-xs text-gray-500 font-semibold ml-1">Return</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-semibold mt-1">Net dividend on modernization spend.</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Detailed Breakdown Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Legacy Block */}
          <div className="bg-white border border-red-100 rounded-[2rem] p-6 md:p-8 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/[0.02] rounded-full blur-2xl pointer-events-none"></div>
            <h3 className="text-sm font-black text-red-600 uppercase tracking-wider mb-6 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Pre-Modernization TCO (Legacy)
            </h3>
            
            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div>
                  <span className="font-bold text-gray-900 text-sm block">Adaptation Maintenance</span>
                  <span className="text-[10px] text-gray-500 font-semibold">Tightly-coupled code modifications</span>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-gray-900 block">€{(calculations.legacyDevDaysTotal * calculations.devRate).toLocaleString()}</span>
                  <span className="text-[10px] text-gray-500 font-semibold">{calculations.legacyDevDaysTotal} Dev-Days / yr</span>
                </div>
              </div>

              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div>
                  <span className="font-bold text-gray-900 text-sm block">Manual Regression Testing</span>
                  <span className="text-[10px] text-gray-500 font-semibold">Business Key-User manual execution</span>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-gray-900 block">€{(calculations.legacyTestDaysTotal * calculations.userRate).toLocaleString()}</span>
                  <span className="text-[10px] text-gray-500 font-semibold">{calculations.legacyTestDaysTotal} Tester-Days / yr</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="font-black text-gray-900 uppercase text-xs">Total Legacy TCO</span>
                <span className="text-xl font-black text-red-600">€{calculations.legacyAnnualTotal.toLocaleString()} <span className="text-xs text-gray-500 font-semibold">/ yr</span></span>
              </div>
            </div>
          </div>

          {/* Modernized Block */}
          <div className="bg-white border border-green-150 rounded-[2rem] p-6 md:p-8 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/[0.02] rounded-full blur-2xl pointer-events-none"></div>
            <h3 className="text-sm font-black text-green-600 uppercase tracking-wider mb-6 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-600" />
              Post-Modernization TCO (Clean Core)
            </h3>
            
            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div>
                  <span className="font-bold text-gray-900 text-sm block">Upgrade-Safe Adaptation</span>
                  <span className="text-[10px] text-gray-500 font-semibold">Decoupled standard API routing</span>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-gray-900 block">€{(calculations.modernDevDaysTotal * calculations.devRate).toLocaleString()}</span>
                  <span className="text-[10px] text-gray-500 font-semibold">{calculations.modernDevDaysTotal} Dev-Days / yr</span>
                </div>
              </div>

              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div>
                  <span className="font-bold text-gray-900 text-sm block">Automated Regression Checks</span>
                  <span className="text-[10px] text-gray-500 font-semibold">Sandboxed unit test suite validations</span>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-gray-900 block">€{(calculations.modernTestDaysTotal * calculations.userRate).toLocaleString()}</span>
                  <span className="text-[10px] text-gray-500 font-semibold">{calculations.modernTestDaysTotal} Tester-Days / yr</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="font-black text-gray-900 uppercase text-xs">Total Modernized TCO</span>
                <span className="text-xl font-black text-green-600">€{calculations.modernAnnualTotal.toLocaleString()} <span className="text-xs text-gray-500 font-semibold">/ yr</span></span>
              </div>
            </div>
          </div>

        </div>

        {/* Recharts Cumulative Benefits Forecast Chart */}
        <div className="bg-white border border-gray-150 rounded-[2rem] p-6 md:p-8 shadow-sm">
          <h3 className="text-lg font-black text-[#0b1c30] uppercase mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            5-Year Cumulative Financial ROI Forecast
          </h3>
          <div className="h-64 md:h-72 w-full text-xs font-semibold overflow-x-auto">
            <div className="min-w-[400px] h-full">
              <RechartsChart data={calculations.cumulativeSavings5Yr} />
            </div>
          </div>
          <span className="text-[10px] text-gray-400 font-semibold block text-center mt-4">
            Cumulative financial dividend (annual savings minus one-time investment). 5-year net return: <span className="text-green-600 font-bold">€{calculations.cumulativeSavings5Yr[5]?.['Net Financial Benefit']?.toLocaleString() || '0'}</span>.
          </span>
        </div>
        </>)}

        {/* Printed with the estimate, so a copy cannot leave without it. It
            used to read "Business Value Report" under figures from defaults. */}
        <div className="hidden print:block border-t border-gray-300 pt-8 mt-12 text-center text-xs text-gray-400">
          <p className="font-bold">Clean-Core.io — model estimate, not a business case</p>
          <p>Priced with the cost figures entered above; effort coefficients, the 85&nbsp;% test effect and the target score of 95 are assumptions, not observed effort. Not an official SAP certification. Requires your own review and validation.</p>
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

/**
 * A euro figure the reader states. Empty until they do — there is no default to
 * fall back on, which is the point: an empty field keeps the forecast away.
 */
function CostField({
  field,
  label,
  unit,
  hint,
  value,
  onChange,
}: {
  field: string;
  label: string;
  unit: string;
  hint: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="space-y-2 block">
      <span className="flex justify-between text-xs font-bold text-gray-700 uppercase">
        <span>{label}</span>
        <span className={value === null ? 'text-amber-600' : 'text-blue-650'}>
          {value === null ? 'Your figure' : `€${value.toLocaleString()}${unit}`}
        </span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value ?? ''}
        placeholder="€ — enter your figure"
        data-tco-cost={field}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) && n >= 0 ? n : null);
        }}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
          value === null ? 'border-amber-300' : 'border-gray-200'
        }`}
      />
      <span className="text-[10px] text-gray-400 font-medium block">{hint}</span>
    </label>
  );
}
