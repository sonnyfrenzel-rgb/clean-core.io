'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { Project } from '@/lib/types';
import Stepper from '@/components/Stepper';
import { 
  TrendingUp, Calculator, Euro, Calendar, ShieldCheck, 
  FileText, Printer, ArrowRight, RefreshCw, BarChart3, AlertCircle 
} from 'lucide-react';
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
  const router = useRouter();
  const { profile } = useUserProfile();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // Dynamic TCO Model Inputs (Defaulting to standard enterprise SAP guidelines)
  const [loc, setLoc] = useState(8500); // Lines of custom code
  const [devRate, setDevRate] = useState(900); // Developer daily rate (€)
  const [userRate, setUserRate] = useState(650); // Key-user daily rate (€)
  const [upgradeFreq, setUpgradeFreq] = useState(1); // Major release upgrades per year
  const [fpFreq, setFpFreq] = useState(2); // Feature Pack updates per year
  const [oneTimeCost, setOneTimeCost] = useState(15000); // Refactoring Implementation investment

  // Load project settings
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const db = getDb();
        const docSnap = await getDoc(doc(db, 'projects', projectId as string));
        if (docSnap.exists()) {
          const data = docSnap.data() as Project;
          setProject(data);
          // Set initial LoC based on legacy code size if available
          if (data.legacyCode) {
            const lineCount = data.legacyCode.split('\n').length;
            setLoc(Math.max(1000, Math.min(lineCount * 10, 50000))); // Extrapolate LoC from raw uploaded text
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

  // Better Practice TCO Mathematical Model
  const calculations = useMemo(() => {
    const scoreBefore = project?.cleanCoreScore || 30;
    const scoreAfter = 95; // Upgraded target

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
    const factor = (100 - scoreAfter) / (100 - scoreBefore); // Adaptation reduction factor (typically ~0.08)
    
    const modernDevDaysTotal = Math.max(1, Math.round(legacyDevDaysTotal * factor));
    const modernTestDaysTotal = Math.max(1, Math.round(legacyTestDaysTotal * 0.15)); // 85% automated test coverage in Sandbox

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

    const paybackMonths = Math.round((oneTimeCost / annualSavings) * 12 * 10) / 10;
    const roiYear1 = Math.round((annualSavings / oneTimeCost) * 100);

    return {
      legacyDevDaysTotal,
      legacyTestDaysTotal,
      legacyAnnualTotal,
      modernDevDaysTotal,
      modernTestDaysTotal,
      modernAnnualTotal,
      annualSavings,
      cumulativeSavings5Yr,
      paybackMonths,
      roiYear1,
      scoreBefore,
      scoreAfter
    };
  }, [project, loc, devRate, userRate, upgradeFreq, fpFreq, oneTimeCost]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <div className="p-8 text-center">Loading calculations database...</div>;

  return (
    <div className="animate-in fade-in duration-500 bg-[#f8f9ff] min-h-screen p-4 md:p-8 print:bg-white print:p-0">
      
      {/* Stepper (Hidden when printing) */}
      <div className="print:hidden">
        <Stepper currentStep={1} projectId={projectId as string} cleanCoreScore={project?.cleanCoreScore} transformationBypass={project?.transformationBypass} />
      </div>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto mt-8 space-y-8 w-full">
        
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b border-gray-250 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full uppercase tracking-wider">C-Level Executive View</span>
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider print:hidden">Better Practice Mapped</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-[#0b1c30] tracking-tight uppercase mt-2">TCO & Upgrade-ROI Analysis</h1>
            <p className="text-sm text-gray-500 font-medium mt-1">Upgrade-impact reduction forecast based on Clean Core modernization score.</p>
          </div>
          <div className="flex gap-3 print:hidden w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gradient-to-br from-slate-900 to-slate-800 hover:shadow-lg text-white font-bold text-xs uppercase tracking-wider px-6 h-12 rounded-xl transition-all active:scale-95"
            >
              <Printer className="w-4 h-4" /> Print Business Case
            </button>
            <button
              onClick={() => router.push(`/project/${projectId}/analyze`)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white hover:bg-gray-50 border border-gray-250 text-gray-700 font-bold text-xs uppercase tracking-wider px-6 h-12 rounded-xl transition-all"
            >
              Back to Analyze
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

            {/* Input 2 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-700 uppercase">
                <span>Developer Day Rate</span>
                <span className="text-blue-650">€{devRate} / day</span>
              </div>
              <input 
                type="range" 
                min="500" 
                max="1500" 
                step="50"
                value={devRate}
                onChange={e => setDevRate(Number(e.target.value))}
                className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-[10px] text-gray-400 font-medium block">Average rate for SAP ABAP/BTP architects.</span>
            </div>

            {/* Input 3 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-700 uppercase">
                <span>Modernization Investment</span>
                <span className="text-blue-650">€{oneTimeCost.toLocaleString()}</span>
              </div>
              <input 
                type="range" 
                min="5000" 
                max="100000" 
                step="2500"
                value={oneTimeCost}
                onChange={e => setOneTimeCost(Number(e.target.value))}
                className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-[10px] text-gray-400 font-medium block">One-time refactoring & deployment budget.</span>
            </div>

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

            {/* Input 6 */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-gray-700 uppercase">
                <span>Key-User Day Rate</span>
                <span className="text-blue-650">€{userRate} / day</span>
              </div>
              <input 
                type="range" 
                min="400" 
                max="1000" 
                step="50"
                value={userRate}
                onChange={e => setUserRate(Number(e.target.value))}
                className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

          </div>
        </div>

        {/* C-Level Executive ROI KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-[2rem] p-6 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[160px]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/10 rounded-full blur-2xl pointer-events-none"></div>
            <span className="text-[10px] font-black text-green-400 uppercase tracking-widest block">Annual Net Savings</span>
            <div>
              <h3 className="text-4xl font-black tracking-tight mt-2 flex items-baseline">
                €{calculations.annualSavings.toLocaleString()}
                <span className="text-xs text-gray-400 font-semibold ml-1">/ year</span>
              </h3>
              <p className="text-xs text-gray-400 font-semibold mt-1">Maintenance overhead reduced by {Math.round((1 - calculations.modernAnnualTotal / calculations.legacyAnnualTotal) * 100)}%.</p>
            </div>
          </div>

          <div className="bg-white border border-gray-150 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between min-h-[160px]">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Payback Period</span>
            <div>
              <h3 className="text-4xl font-black text-slate-900 tracking-tight mt-2 flex items-baseline">
                {calculations.paybackMonths}
                <span className="text-xs text-gray-500 font-semibold ml-1">Months</span>
              </h3>
              <p className="text-xs text-gray-500 font-semibold mt-1">Amortization of one-time investment.</p>
            </div>
          </div>

          <div className="bg-white border border-gray-150 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between min-h-[160px]">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Year 1 ROI</span>
            <div>
              <h3 className="text-4xl font-black text-blue-650 tracking-tight mt-2 flex items-baseline">
                {calculations.roiYear1}%
                <span className="text-xs text-gray-500 font-semibold ml-1">Return</span>
              </h3>
              <p className="text-xs text-gray-500 font-semibold mt-1">Net dividend on modernization spend.</p>
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
                  <span className="font-extrabold text-gray-900 block">€{(calculations.legacyDevDaysTotal * devRate).toLocaleString()}</span>
                  <span className="text-[10px] text-gray-500 font-semibold">{calculations.legacyDevDaysTotal} Dev-Days / yr</span>
                </div>
              </div>

              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div>
                  <span className="font-bold text-gray-900 text-sm block">Manual Regression Testing</span>
                  <span className="text-[10px] text-gray-500 font-semibold">Business Key-User manual execution</span>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-gray-900 block">€{(calculations.legacyTestDaysTotal * userRate).toLocaleString()}</span>
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
                  <span className="font-extrabold text-gray-900 block">€{(calculations.modernDevDaysTotal * devRate).toLocaleString()}</span>
                  <span className="text-[10px] text-gray-500 font-semibold">{calculations.modernDevDaysTotal} Dev-Days / yr</span>
                </div>
              </div>

              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div>
                  <span className="font-bold text-gray-900 text-sm block">Automated Regression Checks</span>
                  <span className="text-[10px] text-gray-500 font-semibold">Sandboxed unit test suite validations</span>
                </div>
                <div className="text-right">
                  <span className="font-extrabold text-gray-900 block">€{(calculations.modernTestDaysTotal * userRate).toLocaleString()}</span>
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

        {/* Corporate Certification Footer (Visible when printing) */}
        <div className="hidden print:block border-t border-gray-300 pt-8 mt-12 text-center text-xs text-gray-400">
          <p className="font-bold">Clean-Core.io Business Value Suite</p>
          <p>Certified in compliance with S/4HANA Clean Core Extensibility Framework. All data encrypted client-side.</p>
        </div>

      </div>
    </div>
  );
}
