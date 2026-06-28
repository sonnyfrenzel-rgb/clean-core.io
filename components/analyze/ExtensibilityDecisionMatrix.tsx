'use client';

import { useState } from 'react';
import { Sparkles, Layers, Globe, Network, ShieldCheck, Terminal, Info } from 'lucide-react';
import clsx from 'clsx';

interface Checkpoint {
  checkpointName: string;
  question: string;
  evaluation: string;
  resultState: 'In-App Preferred' | 'Side-by-Side Preferred' | 'Neutral';
  cleanCoreImpact: string;
}

interface TrackFeasibility {
  technicalFeasibility: string;
  fitDetails: string;
  pros: string[];
  cons: string[];
}

interface ComparativeAnalysis {
  inAppABAPCloud: TrackFeasibility;
  sideBySideBTP: TrackFeasibility;
}

interface ExtensibilityDecisionMatrixProps {
  extensibilityRoute: string;
  decisionTreeCheckpoints?: Checkpoint[];
  comparativeAnalysis?: ComparativeAnalysis;
}

export default function ExtensibilityDecisionMatrix({
  extensibilityRoute,
  decisionTreeCheckpoints,
  comparativeAnalysis
}: ExtensibilityDecisionMatrixProps) {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(0);

  const isBtp = extensibilityRoute.includes('BTP');

  const checkpoints = decisionTreeCheckpoints || [
    {
      checkpointName: 'Transactional Coupling',
      question: 'Does the legacy logic require synchronous execution and update locks within standard S/4HANA transactional postings?',
      evaluation: isBtp 
        ? 'The custom logic executes asynchronously or independently without blocking standard ERP database threads (e.g. read-only analytics, decoupled webhooks, or scheduled updates).' 
        : 'The custom logic requires synchronous validation and real-time locking within standard SAP LUW processes (e.g., during posting of sales orders or billing items).',
      resultState: isBtp ? 'Side-by-Side Preferred' : 'In-App Preferred' as const,
      cleanCoreImpact: isBtp 
        ? 'Side-by-side execution leaves S/4HANA upgrade cycles completely unaffected.' 
        : 'In-App extensibility (RAP) is required to run within the ERP core transaction boundaries while keeping the repository clean.'
    },
    {
      checkpointName: 'UI Paradigm & Customization',
      question: 'Does the application require an external-facing portal, heavy custom branding, or tight integration with third-party SaaS services?',
      evaluation: isBtp 
        ? 'Requires a highly responsive, modern Fiori Elements or custom React UI available to external vendors and clients without exposing standard SAP ports.' 
        : 'The UI is embedded inside standard S/4HANA transaction screens for internal business users utilizing standard Fiori grids.',
      resultState: isBtp ? 'Side-by-Side Preferred' : 'In-App Preferred' as const,
      cleanCoreImpact: isBtp 
        ? 'BTP decoupled hosting allows modern web framework freedom and enterprise-grade security isolation.' 
        : 'ABAP RAP keeps the UI aligned with standard S/4HANA layouts, eliminating custom server configurations.'
    },
    {
      checkpointName: 'Data & DB Proximity',
      question: 'Does the logic perform compute-intensive joins across dozens of custom database tables or require a separate persistent schema?',
      evaluation: isBtp 
        ? 'The application relies on decoupled custom data stores, external SaaS APIs, or complex pre-aggregations that would overhead the core database.' 
        : 'Requires direct, low-latency joins and real-time reads on standard tables (e.g. BSEG, KNA1) inside standard transactional screens.',
      resultState: isBtp ? 'Side-by-Side Preferred' : 'In-App Preferred' as const,
      cleanCoreImpact: isBtp 
        ? 'Decoupling database schemas keeps the ERP core lightweight, safe, and easily upgradeable.' 
        : 'Uses standard released RAP CDS projection views and standard repository items, preserving database integrity.'
    },
    {
      checkpointName: 'Lifecycle & Resource Scaling',
      question: 'Does the solution experience highly volatile, bursty resource scaling requirements or have massive external workloads?',
      evaluation: isBtp 
        ? 'Scaling requirements are independent of core ERP compute threads, with unpredictable high-volume external webhook events.' 
        : 'Resource consumption remains flat, predictable, and fully aligned with internal S/4HANA user transaction volume.',
      resultState: isBtp ? 'Side-by-Side Preferred' : 'Neutral' as const,
      cleanCoreImpact: isBtp 
        ? 'Scale-out workloads are absorbed by BTP Cloud Foundry/Kyma, shielding the ERP core system from resource starvation.' 
        : 'ABAP Cloud leverages standard ERP server resource pools, maintaining unified resource constraints.'
    }
  ];

  const comparative = comparativeAnalysis || {
    inAppABAPCloud: {
      technicalFeasibility: isBtp ? 'Partially Compatible' : 'Highly Compatible',
      fitDetails: isBtp 
        ? 'Technically possible to implement in RAP, but transactional tight coupling would restrict SaaS integrations and UI layout options.' 
        : 'Perfect technical fit. Executes inside standard S/4HANA transaction pipelines utilizing RAP CDS views and behavior definitions.',
      pros: [
        'Zero latency database reads on core S/4HANA standard tables',
        'Synchronous transactional execution inside standard SAP LUW',
        'Direct reuse of existing standard locks and validations'
      ],
      cons: [
        'Language restricted strictly to released ABAP Cloud standard repository items',
        'No access to external SaaS libraries or Node.js frameworks',
        'Any compute overhead directly blocks ERP core system processes'
      ]
    },
    sideBySideBTP: {
      technicalFeasibility: isBtp ? 'Highly Compatible' : 'Partially Compatible',
      fitDetails: isBtp 
        ? 'Ideal architectural fit. The application runs as a fully decoupled, upgrade-safe microservice on SAP BTP using CAP and Node.js.' 
        : 'Feasible via event triggers (Event Mesh) or API destinations, but adds HTTP latency and requires destination configuration.',
      pros: [
        'Absolute lifecycle isolation - zero upgrade blockers for S/4HANA core',
        'Total development freedom with Node.js, TypeScript, and modern NPM libraries',
        'Allows external portal hosting and multi-tenant SaaS scaling'
      ],
      cons: [
        'Requires configuring standard cloud API destinations and credentials',
        'Introduces HTTP request latency for transactional processes',
        'Needs ERP-side trigger classes to capture transactional database state changes'
      ]
    }
  };

  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative overflow-hidden group mb-8 animate-in fade-in duration-700">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Extensibility Decision Matrix & Path</h3>
          <p className="text-xs text-slate-400 mt-1">Detailed comparison and dynamic AI checkpoints that determined the active modernization track.</p>
        </div>
        <span className="bg-slate-105 text-slate-700 border border-slate-200/60 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider font-mono shrink-0 self-start md:self-center">
          SAP Clean Core Guidelines
        </span>
      </div>

      <div className="space-y-8 animate-in fade-in duration-300">
        {/* Pathway Explorer */}
        <div className="bg-slate-50/50 border border-slate-150 rounded-[1.5rem] p-5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4 font-mono">AI Routing Decision Pathway Explorer</span>
          <div className="relative">
            {/* Horizontal progress path connecting checkpoints */}
            <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-slate-200 -translate-y-1/2 hidden md:block z-0"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
              {checkpoints.map((cp, idx) => {
                const isActive = selectedCheckpoint === idx;
                const isSideBySide = cp.resultState === 'Side-by-Side Preferred';
                const isInApp = cp.resultState === 'In-App Preferred';
                
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedCheckpoint(idx)}
                    className={clsx(
                      "bg-white border rounded-2xl p-4 text-left transition-all duration-300 shadow-sm relative overflow-hidden group hover:scale-[1.02] hover:shadow-md",
                      isActive 
                        ? "border-emerald-600 ring-2 ring-emerald-500/20" 
                        : "border-slate-200/85 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={clsx(
                        "w-6 h-6 rounded-full font-bold flex items-center justify-center text-[10px] shrink-0",
                        isActive 
                          ? "bg-emerald-600 text-white" 
                          : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                      )}>
                        {idx + 1}
                      </span>
                      <span className="text-[11px] font-extrabold text-slate-800 tracking-tight line-clamp-1">{cp.checkpointName}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={clsx(
                        "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                        isSideBySide ? "bg-blue-50 text-blue-700 border border-blue-100" :
                        isInApp ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                        "bg-slate-50 text-slate-600 border border-slate-100"
                      )}>
                        {cp.resultState.split(' ')[0]}
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold ml-auto group-hover:text-slate-600 transition-colors">Inspect →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Checkpoint Detail Panel */}
          <div className="bg-white border border-slate-150 rounded-xl p-5 mt-5 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-150 pb-4 mb-4">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Selected Milestone {selectedCheckpoint + 1} • {checkpoints[selectedCheckpoint].checkpointName}</span>
                <h4 className="text-sm font-extrabold text-slate-900 leading-snug">{checkpoints[selectedCheckpoint].question}</h4>
              </div>
              <span className={clsx(
                "text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm shrink-0 self-start md:self-auto",
                checkpoints[selectedCheckpoint].resultState === 'Side-by-Side Preferred' ? "bg-blue-600 text-white" :
                checkpoints[selectedCheckpoint].resultState === 'In-App Preferred' ? "bg-emerald-600 text-white" :
                "bg-slate-600 text-white"
              )}>
                {checkpoints[selectedCheckpoint].resultState}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1.5">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">Custom Technical Assessment</span>
                <p className="text-slate-700 font-medium">{checkpoints[selectedCheckpoint].evaluation}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1.5">
                <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest block font-mono">Clean Core Implementation Impact</span>
                <p className="text-slate-600 font-medium">{checkpoints[selectedCheckpoint].cleanCoreImpact}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tailored comparative matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Track 1: In-App ABAP Cloud */}
          <div className={clsx(
            "p-6 rounded-2xl border transition-all flex flex-col justify-between",
            !isBtp
              ? "bg-emerald-50/20 border-emerald-500/30 shadow-md ring-1 ring-emerald-500/10"
              : "bg-slate-50/40 border-slate-200/50 opacity-80"
          )}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={clsx("p-2 rounded-xl", !isBtp ? "bg-emerald-100/50 text-emerald-700" : "bg-slate-200 text-slate-500")}>
                    <Sparkles size={16} />
                  </div>
                  <span className="font-extrabold text-slate-900 text-sm">⚙️ In-App ABAP Cloud (RAP)</span>
                </div>
                <span className={clsx(
                  "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm",
                  comparative.inAppABAPCloud.technicalFeasibility === 'Highly Compatible' ? "bg-green-600 text-white" :
                  comparative.inAppABAPCloud.technicalFeasibility === 'Partially Compatible' ? "bg-amber-600 text-white" :
                  "bg-rose-600 text-white"
                )}>
                  {comparative.inAppABAPCloud.technicalFeasibility}
                </span>
              </div>
              
              <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium">
                {comparative.inAppABAPCloud.fitDetails}
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block font-mono mb-2">Technical Advantages (Pros)</span>
                  <ul className="space-y-2 text-[11px] text-slate-700 font-semibold">
                    {comparative.inAppABAPCloud.pros.map((pro, pIdx) => (
                      <li key={pIdx} className="flex items-start gap-1.5">
                        <span className="text-emerald-500 shrink-0 font-extrabold">✓</span>
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest block font-mono mb-2">Architectural Limitations (Cons)</span>
                  <ul className="space-y-2 text-[11px] text-slate-500 font-medium">
                    {comparative.inAppABAPCloud.cons.map((con, cIdx) => (
                      <li key={cIdx} className="flex items-start gap-1.5">
                        <span className="text-rose-500 shrink-0 font-extrabold">✗</span>
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            
            {!isBtp && (
              <div className="border-t border-emerald-500/20 pt-4 mt-6 text-[10px] text-emerald-800 font-bold uppercase tracking-widest font-mono">
                Target: Released CDS Views & RAP Business Objects
              </div>
            )}
          </div>

          {/* Track 2: Side-by-Side SAP BTP */}
          <div className={clsx(
            "p-6 rounded-2xl border transition-all flex flex-col justify-between",
            isBtp
              ? "bg-blue-50/20 border-blue-500/30 shadow-md ring-1 ring-blue-500/10"
              : "bg-slate-50/40 border-slate-200/50 opacity-80"
          )}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={clsx("p-2 rounded-xl", isBtp ? "bg-blue-100/50 text-blue-700" : "bg-slate-200 text-slate-500")}>
                    <Layers size={16} />
                  </div>
                  <span className="font-extrabold text-slate-900 text-sm">☁️ Side-by-Side SAP BTP (CAP)</span>
                </div>
                <span className={clsx(
                  "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm",
                  comparative.sideBySideBTP.technicalFeasibility === 'Highly Compatible' ? "bg-green-600 text-white" :
                  comparative.sideBySideBTP.technicalFeasibility === 'Partially Compatible' ? "bg-amber-600 text-white" :
                  "bg-rose-600 text-white"
                )}>
                  {comparative.sideBySideBTP.technicalFeasibility}
                </span>
              </div>
              
              <p className="text-xs text-slate-600 leading-relaxed mb-6 font-medium">
                {comparative.sideBySideBTP.fitDetails}
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block font-mono mb-2">Technical Advantages (Pros)</span>
                  <ul className="space-y-2 text-[11px] text-slate-700 font-semibold">
                    {comparative.sideBySideBTP.pros.map((pro, pIdx) => (
                      <li key={pIdx} className="flex items-start gap-1.5">
                        <span className="text-emerald-500 shrink-0 font-extrabold">✓</span>
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest block font-mono mb-2">Architectural Limitations (Cons)</span>
                  <ul className="space-y-2 text-[11px] text-slate-500 font-medium">
                    {comparative.sideBySideBTP.cons.map((con, cIdx) => (
                      <li key={cIdx} className="flex items-start gap-1.5">
                        <span className="text-rose-500 shrink-0 font-extrabold">✗</span>
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            
            {isBtp && (
              <div className="border-t border-blue-500/20 pt-4 mt-6 text-[10px] text-blue-800 font-bold uppercase tracking-widest font-mono">
                Target: CAP OData APIs & Decoupled BTP Microservices
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
