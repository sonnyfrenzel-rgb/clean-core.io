'use client';

import { useMemo } from 'react';
import { FileCode2, Layers, Search, Cpu, AlertTriangle, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import type { ClassModel, SupportFinding } from '@/lib/abap/class-model';
import { detectFindings, summarize } from '@/lib/abap/findings-detector';
import type { SourceFile, SupportSummary } from '@/lib/abap/findings-detector';
import { LEVEL_EMOJI } from '@/lib/abap/support-matrix';

interface PreAnalysisPreviewProps {
  code: string;
  fileName: string;
}

/**
 * Deterministic pre-analysis preview shown after code upload but before the
 * full analysis run. Zero LLM calls — pure regex + findings-detector.
 */
export default function PreAnalysisPreview({ code, fileName }: PreAnalysisPreviewProps) {
  const preview = useMemo(() => {
    if (!code || code.trim().length < 10) return null;

    const lines = code.split(/\r?\n/);
    const loc = lines.length;
    const nonEmpty = lines.filter(l => l.trim().length > 0).length;

    // Detect ABAP object type
    let objectType = 'ABAP Source';
    if (/^\s*CLASS\s+/im.test(code)) objectType = 'Class';
    else if (/^\s*INTERFACE\s+/im.test(code)) objectType = 'Interface';
    else if (/^\s*FUNCTION\s+/im.test(code)) objectType = 'Function Module';
    else if (/^\s*REPORT\s+/im.test(code)) objectType = 'Report';
    else if (/^\s*FORM\s+/im.test(code)) objectType = 'Form Routine';

    // Quick construct scan
    const constructs: { label: string; count: number; icon: string }[] = [];

    const classMatches = code.match(/^\s*CLASS\s+\w+/gim);
    if (classMatches) constructs.push({ label: 'Class Definitions', count: classMatches.length, icon: '📦' });

    const ifMatches = code.match(/^\s*INTERFACE\s+\w+/gim);
    if (ifMatches) constructs.push({ label: 'Interfaces', count: ifMatches.length, icon: '🔌' });

    const methodMatches = code.match(/^\s*METHODS?\s+\w+/gim);
    if (methodMatches) constructs.push({ label: 'Methods', count: methodMatches.length, icon: '⚙️' });

    const selectMatches = code.match(/\bSELECT\b/gi);
    if (selectMatches) constructs.push({ label: 'SELECT Statements', count: selectMatches.length, icon: '🗄️' });

    const formMatches = code.match(/^\s*FORM\s+\w+/gim);
    if (formMatches) constructs.push({ label: 'Form Routines', count: formMatches.length, icon: '📋' });

    const callMatches = code.match(/\bCALL\s+(FUNCTION|METHOD|TRANSACTION)\b/gi);
    if (callMatches) constructs.push({ label: 'External Calls', count: callMatches.length, icon: '📡' });

    // Lightweight findings detection
    const abapSources: SourceFile[] = [{ file: fileName, content: code }];
    const mockModel: ClassModel = {
      root: 'MAIN',
      nodes: {
        'MAIN': {
          key: 'MAIN', kind: 'class', source: { file: fileName, line: 1 },
          isStandard: false, isAbstract: false, isFinal: false,
          interfaces: [], friends: [], methods: [], attributes: [], events: [], aliases: []
        }
      },
      edges: [],
      linearization: ['MAIN'],
      resolved: true,
      missing: [],
      findings: []
    };

    let findings: SupportFinding[] = [];
    let summary: SupportSummary | null = null;
    try {
      findings = detectFindings(mockModel, abapSources);
      summary = summarize(findings, mockModel);
    } catch {
      // Silently fail — pre-analysis is non-critical
    }

    return { loc, nonEmpty, objectType, constructs, findings, summary };
  }, [code, fileName]);

  if (!preview) return null;

  const { loc, nonEmpty, objectType, constructs, findings, summary } = preview;
  const coveragePercent = summary
    ? Math.round(((summary.counts.fully) / Math.max(findings.length, 1)) * 100)
    : null;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pre-Analysis Preview</span>
        </div>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Deterministic · Zero LLM Calls</span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
          <FileCode2 className="w-4 h-4 text-slate-400 mx-auto mb-1" />
          <div className="text-lg font-black text-slate-900">{loc.toLocaleString()}</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Lines of Code</div>
        </div>

        <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
          <Layers className="w-4 h-4 text-slate-400 mx-auto mb-1" />
          <div className="text-lg font-black text-slate-900">{nonEmpty.toLocaleString()}</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Non-Empty Lines</div>
        </div>

        <div className="bg-white border border-slate-100 rounded-xl p-3 text-center">
          <Cpu className="w-4 h-4 text-slate-400 mx-auto mb-1" />
          <div className="text-sm font-black text-slate-900 mt-0.5">{objectType}</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Object Type</div>
        </div>

        <div className={clsx(
          "border rounded-xl p-3 text-center",
          findings.length === 0 ? "bg-emerald-50 border-emerald-100" : "bg-white border-slate-100"
        )}>
          {findings.length === 0 ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto mb-1" />
          )}
          <div className="text-lg font-black text-slate-900">{findings.length}</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Constructs Flagged</div>
        </div>
      </div>

      {/* Recognized constructs */}
      {constructs.length > 0 && (
        <div className="mb-4">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Recognized Constructs</span>
          <div className="flex flex-wrap gap-2">
            {constructs.map((c, idx) => (
              <span key={idx} className="inline-flex items-center gap-1.5 bg-white border border-slate-100 rounded-lg px-3 py-1.5 text-xs">
                <span>{c.icon}</span>
                <span className="font-bold text-slate-700">{c.count}</span>
                <span className="text-slate-500">{c.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Estimated coverage hint */}
      {findings.length > 0 && summary && (
        <div className="bg-white border border-slate-100 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Estimated Coverage Preview</span>
            <div className="flex items-center gap-3 text-xs">
              <span>{LEVEL_EMOJI['fully']} {summary.counts.fully} fully</span>
              <span>{LEVEL_EMOJI['partial']} {summary.counts.partial} review</span>
              <span>{LEVEL_EMOJI['not-supported']} {summary.counts.notSupported} flagged</span>
            </div>
          </div>
          {coveragePercent !== null && (
            <div className="text-right">
              <div className="text-2xl font-black text-slate-900">~{coveragePercent}%</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Est. Coverage</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
