'use client';

import { useMemo } from 'react';
import { ArrowRight, Shield, BarChart3, Zap, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import type { SupportFinding } from '@/lib/abap/class-model';
import { LEVEL_EMOJI, LEVEL_LABEL } from '@/lib/abap/support-matrix';

interface RoutingRationaleProps {
  extensibilityRoute: string;
  cleanCoreScore?: number;
  s4Deployment?: 'public' | 'private';
  findings: SupportFinding[];
}

/**
 * "Why This Routing" panel — binds the Design decision back to Analyze evidence.
 * Shows the route badge, compliance score, deployment target, and the top
 * deterministic findings that drove the routing decision.
 */
export default function RoutingRationale({
  extensibilityRoute,
  cleanCoreScore,
  s4Deployment,
  findings,
}: RoutingRationaleProps) {
  const isBtp = extensibilityRoute.includes('BTP');

  // Pick the top 4 most impactful findings (not-supported first, then partial)
  const keyFindings = useMemo(() => {
    const sorted = [...findings].sort((a, b) => {
      const order = { 'not-supported': 0, 'partial': 1, 'fully': 2 };
      return (order[a.level] ?? 2) - (order[b.level] ?? 2);
    });
    return sorted.slice(0, 4);
  }, [findings]);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white rounded-3xl p-8 border border-slate-800 shadow-xl relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -ml-12 -mb-12" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] font-bold tracking-widest text-emerald-400 uppercase font-mono">
            Routing Rationale
          </span>
          <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase">
            — Design ↔ Analyze Evidence Binding
          </span>
        </div>
        <h4 className="text-xl font-black text-white mb-6">Why This Architecture Was Chosen</h4>

        {/* Key metrics row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {/* Route */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Extensibility Route</span>
            </div>
            <span className={clsx(
              "text-xs px-3 py-1.5 rounded-full font-black uppercase tracking-wider inline-block",
              isBtp
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
            )}>
              {isBtp ? '☁️ BTP Side-by-Side' : '⚙️ ABAP Cloud (RAP)'}
            </span>
          </div>

          {/* Score */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Clean Core Score</span>
            </div>
            <span className="text-2xl font-black text-white">{cleanCoreScore ?? '—'}%</span>
          </div>

          {/* Deployment */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Target Deployment</span>
            </div>
            <span className="text-sm font-black text-white">
              {s4Deployment === 'public' ? 'Public Cloud' : 'Private Cloud (RISE)'}
            </span>
          </div>
        </div>

        {/* Key evidence findings */}
        {keyFindings.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                Key Evidence Driving This Decision
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {keyFindings.map((f, idx) => (
                <div
                  key={idx}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-start gap-3 hover:bg-white/10 transition-colors"
                >
                  <span className="text-base shrink-0 mt-0.5">{LEVEL_EMOJI[f.level]}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate">{f.title}</span>
                      <span className={clsx(
                        "text-[8px] px-1.5 py-0.5 rounded font-black uppercase shrink-0",
                        f.level === 'not-supported' ? 'bg-red-500/20 text-red-300' :
                        f.level === 'partial' ? 'bg-amber-500/20 text-amber-300' :
                        'bg-emerald-500/20 text-emerald-300'
                      )}>
                        {LEVEL_LABEL[f.level]}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 leading-relaxed line-clamp-2">
                      {f.recommendation}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {findings.length > 4 && (
              <p className="text-[10px] text-slate-500 mt-3 text-right">
                + {findings.length - 4} more findings from code analysis
              </p>
            )}
          </div>
        )}

        {/* Summary rationale */}
        <div className="mt-6 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-slate-300 leading-relaxed">
              {isBtp ? (
                <>The analysis identified constructs requiring side-by-side decoupling (dynamic calls, BAdI enhancements, or screen flows).
                A <strong className="text-white">BTP CAP extension</strong> preserves core integrity while enabling full custom logic outside the ERP boundary.</>
              ) : (
                <>The analysis confirmed high standard-fit compatibility with no blocking constructs.
                An <strong className="text-white">on-stack RAP extension</strong> maximizes reuse of existing CDS views, business logic, and transactional boundaries.</>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
