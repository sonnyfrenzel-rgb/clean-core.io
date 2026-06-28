'use client';

import { useState } from 'react';
import { ShieldCheck, Info, Check, Link2, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import type { SupportFinding } from '@/lib/abap/class-model';
import { LEVEL_EMOJI, LEVEL_LABEL } from '@/lib/abap/support-matrix';

interface ConstructFindingsProps {
  findings: SupportFinding[];
}

export default function ConstructFindings({ findings }: ConstructFindingsProps) {
  const [signedOffKeys, setSignedOffKeys] = useState<Set<string>>(new Set());

  if (!findings || findings.length === 0) {
    return (
      <div className="bg-emerald-50/20 border border-emerald-200/50 p-8 rounded-3xl text-center">
        <span className="text-3xl">✅</span>
        <h4 className="text-base font-extrabold text-emerald-800 mt-3">Prinstine Codebase Detected</h4>
        <p className="text-xs text-slate-500 mt-1">Staged legacy assets contain no unreleased database queries, screen flows, or dynamic call targets.</p>
      </div>
    );
  }

  const getFindingKey = (f: SupportFinding) => {
    return `${f.construct}-${f.location?.file || 'main'}-${f.location?.line || 0}`;
  };

  const toggleSignOff = (key: string) => {
    setSignedOffKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6 relative">
      <div>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <span>Statically Identified Constructs</span>
          <span className="bg-slate-100 text-slate-500 border border-slate-200/60 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono">
            {findings.length} findings
          </span>
        </h3>
        <p className="text-sm text-slate-500 mt-1">Review the architectural footprint and evidence list before confirming solution design.</p>
      </div>

      <div className="space-y-4">
        {findings.map((finding) => {
          const key = getFindingKey(finding);
          const isSignedOff = signedOffKeys.has(key);
          const level = finding.level || 'fully';
          
          const levelColors = {
            'fully': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
            'partial': 'bg-amber-50 text-amber-700 border border-amber-200',
            'not-supported': 'bg-red-50 text-red-700 border border-red-200'
          };

          return (
            <div 
              key={key}
              className={clsx(
                "border rounded-2xl p-6 transition-all duration-300 shadow-sm relative overflow-hidden group flex flex-col md:flex-row gap-6 items-start justify-between",
                isSignedOff 
                  ? "bg-emerald-50/15 border-emerald-500/40 ring-1 ring-emerald-500/10 shadow-emerald-50" 
                  : "bg-white border-slate-150 hover:border-slate-250"
              )}
            >
              {/* Left Column: Emoji + Title + Location + Explanations */}
              <div className="space-y-4 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Status Badge */}
                  <span className={clsx(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                    levelColors[level]
                  )}>
                    <span>{LEVEL_EMOJI[level]}</span>
                    <span>{LEVEL_LABEL[level]}</span>
                  </span>

                  {/* Construct Title */}
                  <h4 className="font-extrabold text-slate-900 text-base">{finding.title}</h4>

                  {/* File Location Tag */}
                  {finding.location && (
                    <span className="bg-slate-50 text-slate-500 border border-slate-150/70 px-2 py-0.5 rounded-md font-mono text-[10px] flex items-center gap-1">
                      <Link2 size={10} />
                      {finding.location.file}:{finding.location.line}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Detail */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-mono">Static Evidence</span>
                    <p className="text-slate-700 font-semibold leading-relaxed">{finding.detail}</p>
                  </div>

                  {/* Recommendation */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block font-mono">Modernization Path</span>
                    <p className="text-slate-600 font-medium leading-relaxed">{finding.recommendation}</p>
                  </div>
                </div>
              </div>

              {/* Right Column: Actions & Sign-off check */}
              <div className="flex sm:flex-row md:flex-col items-center gap-3 w-full md:w-auto shrink-0 border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 md:pl-4 self-stretch md:justify-center">
                {/* How it works Deep Link */}
                {finding.howItWorks && (
                  <a
                    href={finding.howItWorks}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 md:w-full flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-205 text-slate-600 hover:text-slate-800 text-[10px] font-black uppercase tracking-wider h-10 px-4 rounded-xl transition-all shadow-sm"
                  >
                    <span>How It Works</span>
                    <ExternalLink size={12} />
                  </a>
                )}

                {/* Sign-off Checkbox */}
                <button
                  type="button"
                  onClick={() => toggleSignOff(key)}
                  className={clsx(
                    "flex-1 md:w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-wider h-10 px-4 rounded-xl transition-all shadow-sm active:scale-95",
                    isSignedOff
                      ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-500/20"
                      : "bg-white hover:bg-slate-50 border border-slate-205 text-slate-600 hover:text-slate-800"
                  )}
                >
                  <ShieldCheck size={14} className={clsx(isSignedOff ? "animate-pulse" : "")} />
                  <span>{isSignedOff ? "Signed Off" : "Sign Off"}</span>
                </button>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
