'use client';

import { useState, useRef } from 'react';
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

/**
 * What stands where an answer is missing.
 *
 * Both halves of this panel are optional: the model returns checkpoints and a
 * comparison when it has them, and quite often it does not. Both used to be
 * replaced by a complete, confident set written out below — four named
 * checkpoints with a "Custom Technical Assessment" of the reader's own code, and
 * a two-track comparison with feasibility grades, pros and cons — all of it
 * decided by one boolean: whether the chosen route contains the letters "BTP".
 * Nothing had been assessed, and the reader had no way to tell which of the two
 * they were looking at (QA 0613631545b2).
 */
function NotDetermined({ what }: { what: string }) {
  return (
    <div
      data-not-determined
      className="bg-slate-50/50 border border-dashed border-slate-300 rounded-[1.5rem] p-5 text-xs text-slate-600 leading-relaxed font-medium"
    >
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 font-mono">
        Not determined for this run
      </span>
      {what} The route above stands on the evidence the analysis did produce; nothing is filled
      in here from the route itself, because that would be this panel answering its own question.
    </div>
  );
}

export default function ExtensibilityDecisionMatrix({
  extensibilityRoute,
  decisionTreeCheckpoints,
  comparativeAnalysis
}: ExtensibilityDecisionMatrixProps) {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(0);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  const isBtp = extensibilityRoute.includes('BTP');

  const checkpoints: Checkpoint[] = decisionTreeCheckpoints ?? [];
  const comparative: ComparativeAnalysis | null = comparativeAnalysis ?? null;
  // A stored answer can shrink between renders; an index past the end would read
  // `undefined` and take the panel down with it.
  const active = checkpoints.length > 0 ? Math.min(selectedCheckpoint, checkpoints.length - 1) : 0;


  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative overflow-hidden group mb-8 animate-in fade-in duration-700">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Extensibility Decision Matrix & Path</h3>
          <p className="text-xs text-slate-400 mt-1">The checkpoints and the track comparison this analysis produced — and nothing where it produced none.</p>
        </div>
        <span className="bg-slate-105 text-slate-700 border border-slate-200/60 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider font-mono shrink-0 self-start md:self-center">
          SAP Clean Core Guidelines
        </span>
      </div>

      <div className="space-y-8 animate-in fade-in duration-300">
        {checkpoints.length === 0 ? (
          <NotDetermined what="This analysis did not return the step-by-step checkpoints behind the routing decision." />
        ) : (
        /* Pathway Explorer */
        <div className="bg-slate-50/50 border border-slate-150 rounded-[1.5rem] p-5 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4 font-mono">AI Routing Decision Pathway Explorer</span>
          <div className="relative">
            {/* Horizontal progress path connecting checkpoints */}
            <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-slate-200 -translate-y-1/2 hidden md:block z-0"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
              {checkpoints.map((cp, idx) => {
                const isActive = active === idx;
                const isSideBySide = cp.resultState === 'Side-by-Side Preferred';
                const isInApp = cp.resultState === 'In-App Preferred';
                
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedCheckpoint(idx);
                      setTimeout(() => detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
                    }}
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
          <div ref={detailPanelRef} className="bg-white border border-slate-150 rounded-xl p-5 mt-5 animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-150 pb-4 mb-4">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Selected Milestone {active + 1} • {checkpoints[active].checkpointName}</span>
                <h4 className="text-sm font-extrabold text-slate-900 leading-snug">{checkpoints[active].question}</h4>
              </div>
              <span className={clsx(
                "text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-sm shrink-0 self-start md:self-auto",
                checkpoints[active].resultState === 'Side-by-Side Preferred' ? "bg-blue-600 text-white" :
                checkpoints[active].resultState === 'In-App Preferred' ? "bg-emerald-600 text-white" :
                "bg-slate-600 text-white"
              )}>
                {checkpoints[active].resultState}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1.5">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">Custom Technical Assessment</span>
                <p className="text-slate-700 font-medium">{checkpoints[active].evaluation}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1.5">
                <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest block font-mono">Clean Core Implementation Impact</span>
                <p className="text-slate-600 font-medium">{checkpoints[active].cleanCoreImpact}</p>
              </div>
            </div>
          </div>
        </div>
        )}

        {comparative === null ? (
          <NotDetermined what="This analysis did not return a side-by-side comparison of the two extensibility tracks." />
        ) : (
        /* Tailored comparative matrix */
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
        )}
      </div>
    </div>
  );
}
