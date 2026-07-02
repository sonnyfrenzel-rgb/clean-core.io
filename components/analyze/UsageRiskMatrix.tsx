'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, TrendingUp, Trash2, HelpCircle, BarChart3, Clock, X, ExternalLink, MinusCircle } from 'lucide-react';
import clsx from 'clsx';
import type { UsageJoinRow, Quadrant, UsageBucket, Feasibility } from '@/lib/abap/usage-model';
import type { UsageReport } from '@/lib/abap/usage-model';
import { QUADRANT_META } from '@/lib/abap/usage-join';

interface UsageRiskMatrixProps {
  rows: UsageJoinRow[];
  usageReport: UsageReport;
}

// ── Grid cell definitions (Usage × Feasibility) ───────────────────

type CellKey = `${UsageBucket}-${Feasibility}`;

const USAGE_LABELS: { bucket: UsageBucket; label: string; icon: React.ReactNode }[] = [
  { bucket: 'heavy',    label: 'Heavy Usage',    icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { bucket: 'moderate', label: 'Moderate',       icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { bucket: 'low',      label: 'Low Usage',      icon: <MinusCircle className="w-3.5 h-3.5" /> },
  { bucket: 'dormant',  label: 'Dormant',        icon: <Clock className="w-3.5 h-3.5" /> },
  { bucket: 'unknown',  label: 'Unknown',        icon: <HelpCircle className="w-3.5 h-3.5" /> },
];

const FEASIBILITY_LABELS: { key: Feasibility; label: string }[] = [
  { key: 'no-released-api-path', label: 'No Clean Path' },
  { key: 'needs-architect',      label: 'Needs Architect' },
  { key: 'clean-core-ready',     label: 'Clean Core Ready' },
];

const CELL_COLORS: Record<string, string> = {
  'heavy-no-released-api-path':   'bg-red-100 border-red-300 text-red-800',
  'heavy-needs-architect':        'bg-red-50 border-red-200 text-red-700',
  'heavy-clean-core-ready':       'bg-emerald-100 border-emerald-300 text-emerald-800',
  'moderate-no-released-api-path':'bg-orange-50 border-orange-200 text-orange-700',
  'moderate-needs-architect':     'bg-amber-50 border-amber-200 text-amber-700',
  'moderate-clean-core-ready':    'bg-slate-50 border-slate-200 text-slate-600',
  'low-no-released-api-path':     'bg-yellow-50 border-yellow-200 text-yellow-700',
  'low-needs-architect':          'bg-yellow-50/50 border-yellow-100 text-yellow-600',
  'low-clean-core-ready':         'bg-slate-50 border-slate-200 text-slate-500',
  'dormant-no-released-api-path': 'bg-amber-50 border-amber-200 text-amber-700',
  'dormant-needs-architect':      'bg-amber-50/50 border-amber-100 text-amber-600',
  'dormant-clean-core-ready':     'bg-slate-50/50 border-slate-100 text-slate-500',
  'unknown-no-released-api-path': 'bg-slate-50 border-slate-200 text-slate-500',
  'unknown-needs-architect':      'bg-slate-50 border-slate-200 text-slate-500',
  'unknown-clean-core-ready':     'bg-slate-50 border-slate-200 text-slate-500',
};

export default function UsageRiskMatrix({ rows, usageReport }: UsageRiskMatrixProps) {
  const [selectedCell, setSelectedCell] = useState<CellKey | null>(null);
  const [selectedRow, setSelectedRow] = useState<UsageJoinRow | null>(null);

  // Group rows into grid cells
  const grid = useMemo(() => {
    const cells = new Map<CellKey, UsageJoinRow[]>();
    for (const row of rows) {
      const key: CellKey = `${row.usage}-${row.feasibility}`;
      const list = cells.get(key) || [];
      list.push(row);
      cells.set(key, list);
    }
    return cells;
  }, [rows]);

  // Quadrant summary counts
  const quadrantCounts = useMemo(() => {
    const counts: Record<Quadrant, number> = {
      'danger': 0, 'prioritize': 0, 'retire-candidate': 0, 'low-priority': 0, 'unknown': 0,
    };
    for (const row of rows) counts[row.quadrant]++;
    return counts;
  }, [rows]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] font-bold tracking-widest text-emerald-600 uppercase font-mono">
            v1.22 — Usage × Evidence Matrix
          </span>
        </div>
        <h4 className="text-xl font-black text-slate-900">Risk Prioritization Matrix</h4>
        <p className="text-xs text-slate-500 mt-1">
          Objects plotted by production usage intensity × technical feasibility.
          {usageReport.periodDays && (
            <span className="ml-1 font-medium">
              Based on {usageReport.periodDays} days of {usageReport.source.toUpperCase()} data
              {usageReport.measuredFrom && usageReport.measuredTo && (
                <> ({usageReport.measuredFrom} – {usageReport.measuredTo})</>
              )}.
            </span>
          )}
        </p>
      </div>

      {/* Quadrant summary badges */}
      <div className="px-6 sm:px-8 pb-4 flex flex-wrap gap-2">
        {(Object.entries(quadrantCounts) as [Quadrant, number][]).map(([q, count]) => (
          <div
            key={q}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border',
              QUADRANT_META[q].bgColor,
              QUADRANT_META[q].color,
            )}
          >
            <span>{QUADRANT_META[q].emoji}</span>
            <span>{count}</span>
            <span className="font-medium opacity-70">{QUADRANT_META[q].label}</span>
          </div>
        ))}
      </div>

      {/* 2D Grid */}
      <div className="px-4 sm:px-8 pb-6 overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Column headers */}
          <div className="grid grid-cols-[120px_1fr_1fr_1fr] gap-1 mb-1">
            <div /> {/* empty corner */}
            {FEASIBILITY_LABELS.map(f => (
              <div key={f.key} className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider py-2">
                {f.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {USAGE_LABELS.map(u => (
            <div key={u.bucket} className="grid grid-cols-[120px_1fr_1fr_1fr] gap-1 mb-1">
              {/* Row label */}
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 pr-2">
                {u.icon}
                <span>{u.label}</span>
                {u.bucket === 'dormant' && (
                  <span className="group relative">
                    <HelpCircle className="w-3 h-3 text-amber-400 cursor-help" />
                    <span className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded-lg w-56 hidden group-hover:block z-20 leading-relaxed">
                      Zero executions or last used 13+ months ago. Retire only after business owner confirmation — some dormant objects may be required for periodic processes.
                    </span>
                  </span>
                )}
                {u.bucket === 'low' && (
                  <span className="group relative">
                    <HelpCircle className="w-3 h-3 text-yellow-400 cursor-help" />
                    <span className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded-lg w-56 hidden group-hover:block z-20 leading-relaxed">
                      Below-average usage but recently active. May include business-critical periodic processes (monthly closings, year-end, audit reports). Low ≠ dormant.
                    </span>
                  </span>
                )}
                {u.bucket === 'unknown' && (
                  <span className="group relative">
                    <HelpCircle className="w-3 h-3 text-slate-400 cursor-help" />
                    <span className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] rounded-lg w-56 hidden group-hover:block z-20 leading-relaxed">
                      No usage data in the imported export for these objects. Missing data is not evidence of non-use — verify manually before retiring.
                    </span>
                  </span>
                )}
              </div>

              {/* Cells */}
              {FEASIBILITY_LABELS.map(f => {
                const key: CellKey = `${u.bucket}-${f.key}`;
                const cellRows = grid.get(key) || [];
                const isSelected = selectedCell === key;

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedCell(isSelected ? null : key)}
                    className={clsx(
                      'rounded-xl border px-3 py-3 text-center transition-all min-h-[56px]',
                      CELL_COLORS[key] || 'bg-slate-50 border-slate-200',
                      cellRows.length > 0 ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]' : 'cursor-default opacity-50',
                      isSelected && 'ring-2 ring-emerald-500 shadow-lg scale-[1.02]',
                    )}
                    disabled={cellRows.length === 0}
                  >
                    <span className="text-lg font-black">{cellRows.length}</span>
                    <span className="block text-[9px] opacity-60 mt-0.5">
                      {cellRows.length === 1 ? 'object' : 'objects'}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selected cell detail list */}
      {selectedCell && (
        <div className="border-t border-slate-100 px-6 sm:px-8 py-4 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <h5 className="text-sm font-bold text-slate-800">
              {grid.get(selectedCell)?.length || 0} objects in cell
            </h5>
            <button onClick={() => setSelectedCell(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {(grid.get(selectedCell) || []).map(row => (
              <button
                key={row.objectName}
                onClick={() => setSelectedRow(selectedRow?.objectName === row.objectName ? null : row)}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors flex items-center justify-between gap-3',
                  selectedRow?.objectName === row.objectName
                    ? 'bg-white border-emerald-300 shadow-sm'
                    : 'bg-white/50 border-transparent hover:bg-white hover:border-slate-200',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-slate-800 truncate">{row.objectName}</span>
                  <span className={clsx(
                    'text-[8px] px-1.5 py-0.5 rounded font-black uppercase shrink-0',
                    QUADRANT_META[row.quadrant].bgColor,
                    QUADRANT_META[row.quadrant].color,
                  )}>
                    {QUADRANT_META[row.quadrant].label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 shrink-0">
                  {row.callCount !== null && (
                    <span className="tabular-nums">{row.callCount.toLocaleString()} calls</span>
                  )}
                  {row.findingIds.length > 0 && (
                    <span>{row.findingIds.length} findings</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Object detail flyout */}
      {selectedRow && (
        <div className="border-t border-slate-100 px-6 sm:px-8 py-4 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-slate-900">{selectedRow.objectName}</span>
              <span className={clsx(
                'text-[9px] px-2 py-0.5 rounded-full font-black uppercase border',
                QUADRANT_META[selectedRow.quadrant].bgColor,
                QUADRANT_META[selectedRow.quadrant].color,
              )}>
                {QUADRANT_META[selectedRow.quadrant].emoji} {QUADRANT_META[selectedRow.quadrant].label}
              </span>
            </div>
            <button onClick={() => setSelectedRow(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DetailCard label="Usage" value={selectedRow.usage === 'unknown' ? 'Unknown' : selectedRow.usage} />
            <DetailCard label="Call Count" value={selectedRow.callCount !== null ? selectedRow.callCount.toLocaleString() : '—'} />
            <DetailCard label="Last Used" value={selectedRow.lastUsed || '—'} />
            <DetailCard label="Risk Level" value={selectedRow.riskLevel} />
            <DetailCard label="Feasibility" value={selectedRow.feasibility.replace(/-/g, ' ')} />
            <DetailCard label="Findings" value={String(selectedRow.findingIds.length)} />
          </div>

          {selectedRow.usage === 'unknown' && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2 text-[11px] text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                No usage data in the imported export for this object. Missing data is not evidence of non-use — verify manually before retiring.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Measurement context footer */}
      <div className="border-t border-slate-100 px-6 sm:px-8 py-3 bg-slate-50/30 flex items-center gap-2 text-[10px] text-slate-400">
        <BarChart3 className="w-3 h-3" />
        <span>
          Source: {usageReport.source.toUpperCase()} ·
          {usageReport.records.length} objects ·
          {usageReport.periodDays ? ` ${usageReport.periodDays}-day window` : ' period unknown'} ·
          Imported {new Date(usageReport.importedAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold text-slate-800 mt-0.5 capitalize">{value}</div>
    </div>
  );
}
