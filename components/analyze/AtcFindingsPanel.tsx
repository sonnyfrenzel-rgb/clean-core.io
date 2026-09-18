'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, HelpCircle, X, Layers, Search, ShieldQuestion } from 'lucide-react';
import clsx from 'clsx';
import type { AtcComparisonState, AtcJoinRow, AtcReport } from '@/lib/abap/atc-model';
import { joinAtcWithEvidence, summarizeAtcComparison } from '@/lib/abap/atc-join';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';

interface AtcFindingsPanelProps {
  atcReport: AtcReport;
  findings: EvidenceFinding[];
}

/**
 * The wording below is a first proposal, not a settled decision (roadmap 7.1
 * asked for the naming to be flagged rather than made silently). What must
 * not change without the same care: `'both'`/`'atc-only'`/`'engine-only'`
 * are described as coverage overlaps, never as one side confirming or
 * correcting the other (see `AtcComparisonState` in `lib/abap/atc-model.ts`).
 */
const STATE_META: Record<AtcComparisonState, { label: string; short: string; explain: string; className: string }> = {
  both: {
    label: 'Reported by both',
    short: 'Both',
    explain: 'ATC and the engine both name this object. This says the two overlap on the object — it does not say they found the same issue, and the two finding lists below are never combined into one count.',
    className: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
  'atc-only': {
    label: 'Only in the ATC import',
    short: 'ATC only',
    explain: 'ATC reported a finding here; the engine’s evidence findings do not name this object. This is not the engine missing a real defect — the engine may have no detector for what ATC checked, or never analysed this object at all.',
    className: 'bg-sky-50 border-sky-200 text-sky-800',
  },
  'engine-only': {
    label: 'Only in the engine’s findings',
    short: 'Engine only',
    explain: 'The engine reports a finding here; the imported ATC results do not name this object. Most ATC exports carry only what failed a check, so this is silence, not a pass — it does not mean ATC checked this object and found it clean.',
    className: 'bg-slate-50 border-slate-200 text-slate-600',
  },
};

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  error: { label: 'Error', className: 'bg-red-100 text-red-700' },
  warning: { label: 'Warning', className: 'bg-amber-100 text-amber-700' },
  info: { label: 'Info', className: 'bg-slate-100 text-slate-600' },
  unknown: { label: 'Unknown', className: 'bg-slate-100 text-slate-400' },
};

const SEVERITY_CLASS: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700',
  High: 'bg-orange-100 text-orange-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-slate-100 text-slate-500',
  Info: 'bg-slate-100 text-slate-400',
};

export default function AtcFindingsPanel({ atcReport, findings }: AtcFindingsPanelProps) {
  const rows = useMemo(() => joinAtcWithEvidence(atcReport, { findings }), [atcReport, findings]);
  const counts = useMemo(() => summarizeAtcComparison(rows), [rows]);
  const findingsById = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);

  const [filter, setFilter] = useState<AtcComparisonState | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const filtered = rows.filter((r) => {
    if (filter !== 'all' && r.state !== filter) return false;
    if (query && !r.objectName.includes(query.toUpperCase())) return false;
    return true;
  });

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden" data-atc-findings-panel>
      <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] font-bold tracking-widest text-emerald-600 uppercase font-mono">
            Roadmap 7.1 — ATC Import
          </span>
        </div>
        <h4 className="text-xl font-black text-slate-900">ATC Findings, Compared With the Engine</h4>
        <p className="text-xs text-slate-500 mt-1 max-w-3xl">
          Every finding below is exactly what ATC reported — this product does not verify it. Where an object
          appears in only one of the two sources, that is an observation about what each source covers, never a
          judgement of the other. Nothing here merges an ATC finding with an engine finding.
        </p>
      </div>

      {/* State summary — three counts, never combined into one total */}
      <div className="px-6 sm:px-8 pb-4 flex flex-wrap gap-2">
        {(Object.keys(STATE_META) as AtcComparisonState[]).map((state) => {
          const count = state === 'both' ? counts.both : state === 'atc-only' ? counts.atcOnly : counts.engineOnly;
          const active = filter === state;
          return (
            <button
              key={state}
              onClick={() => setFilter(active ? 'all' : state)}
              data-atc-state-filter={state}
              className={clsx(
                'group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
                STATE_META[state].className,
                active && 'ring-2 ring-offset-1 ring-slate-400',
              )}
            >
              <span>{count}</span>
              <span className="font-medium opacity-80">{STATE_META[state].short}</span>
              <HelpCircle className="w-3 h-3 opacity-60" aria-hidden="true" />
              <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-64 rounded-lg bg-slate-800 px-2.5 py-2 text-left text-[10px] font-normal leading-relaxed text-white group-hover:block">
                {STATE_META[state].explain}
              </span>
            </button>
          );
        })}
        {filter !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-slate-400 hover:text-slate-700"
          >
            <X className="w-3 h-3" /> Clear filter
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-6 sm:px-8 pb-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by object name…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border-t border-slate-100 max-h-[28rem] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-6 sm:px-8 py-6 text-sm text-slate-400">No objects match this filter.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((row) => (
              <AtcRow
                key={row.objectName}
                row={row}
                expanded={expanded === row.objectName}
                onToggle={() => setExpanded(expanded === row.objectName ? null : row.objectName)}
                findingsById={findingsById}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 px-6 sm:px-8 py-3 bg-slate-50/30 flex items-center gap-2 text-[10px] text-slate-400">
        <Layers className="w-3 h-3" />
        <span>
          {atcReport.findings.length} findings reported by ATC ·
          {atcReport.quarantined && atcReport.quarantined.length > 0 && ` ${atcReport.quarantined.length} rows rejected on import ·`}
          Imported {new Date(atcReport.importedAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

function AtcRow({
  row,
  expanded,
  onToggle,
  findingsById,
}: {
  row: AtcJoinRow;
  expanded: boolean;
  onToggle: () => void;
  findingsById: Map<string, EvidenceFinding>;
}) {
  const meta = STATE_META[row.state];
  return (
    <li>
      <button
        onClick={onToggle}
        data-atc-row={row.objectName}
        className="w-full flex items-center justify-between gap-3 px-6 sm:px-8 py-3 text-left hover:bg-slate-50/60"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={clsx('shrink-0 text-[9px] px-2 py-0.5 rounded-full font-black uppercase border', meta.className)}>
            {meta.short}
          </span>
          <span className="font-mono font-bold text-sm text-slate-800 truncate">{row.objectName}</span>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-xs text-slate-500">
          <span>{row.atcFindings.length} ATC</span>
          <span>{row.engineFindingIds.length} engine</span>
        </div>
      </button>

      {expanded && (
        <div className="px-6 sm:px-8 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Reported by ATC</p>
            {row.atcFindings.length === 0 ? (
              <p className="flex items-start gap-1.5 text-xs text-slate-500">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                Not present in the imported ATC results. Not the same as ATC checking this object and finding it
                clean — most ATC exports carry only what failed a check.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {row.atcFindings.map((f, i) => (
                  <li key={i} className="text-xs text-slate-700 flex items-start gap-2">
                    <span className={clsx('shrink-0 px-1.5 py-0.5 rounded font-black uppercase text-[9px]', PRIORITY_META[f.priority].className)}>
                      {PRIORITY_META[f.priority].label}
                    </span>
                    <span className="min-w-0">
                      {f.checkTitle && <span className="font-semibold">{f.checkTitle}: </span>}
                      {f.message}
                      {f.line !== undefined && <span className="text-slate-400"> (line {f.line})</span>}
                      {f.exempted && <span className="ml-1 text-[10px] text-slate-400">— exempted in ATC</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Detected by the engine</p>
            {row.engineFindingIds.length === 0 ? (
              <p className="flex items-start gap-1.5 text-xs text-slate-500">
                <ShieldQuestion className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                The engine's detectors report nothing for this object. Not a statement that the engine is wrong —
                it may have no detector for what ATC's check covers.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {row.engineFindingIds.map((id) => {
                  const f = findingsById.get(id);
                  if (!f) return null;
                  return (
                    <li key={id} className="text-xs text-slate-700 flex items-start gap-2">
                      <span className={clsx('shrink-0 px-1.5 py-0.5 rounded font-black uppercase text-[9px]', SEVERITY_CLASS[f.severity] ?? 'bg-slate-100 text-slate-500')}>
                        {f.severity}
                      </span>
                      <span className="min-w-0">{f.title}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
