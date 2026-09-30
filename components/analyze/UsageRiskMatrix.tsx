'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, HelpCircle, BarChart3, Clock, X, MinusCircle } from 'lucide-react';
import { normaliseSeverity } from '@/lib/severity';
import { SEQUENTIAL_CHART_COLORS } from '@/lib/chart-colors';
import { formatIsoDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import CcButton from '@/components/cc/Button';
import CcIconButton from '@/components/cc/IconButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';
import CcTable from '@/components/cc/Table';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcSeverity } from '@/components/cc/Identifier';
import { CcTag } from '@/components/cc/Tag';
import { RETIREMENT_WINDOW_DAYS, type UsageJoinRow, type Quadrant, type UsageBucket, type Feasibility } from '@/lib/abap/usage-model';
import type { UsageReport } from '@/lib/abap/usage-model';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import type { ExtensibilityRouteReport } from '@/lib/abap/extensibility-router';
import { QUADRANT_META, joinUsageWithEvidence, usageJoinObjectNames } from '@/lib/abap/usage-join';
import { useAbcdCatalogLookup } from '@/hooks/useAbcdCatalogLookup';

interface UsageRiskMatrixProps {
  rows: UsageJoinRow[];
  usageReport: UsageReport;
}

/**
 * The join, computed inside the component rather than as a prop expression in
 * the page. The join refuses reports that mix sources; thrown here, that lands
 * in the surrounding SectionBoundary as one failed section — thrown in the
 * page's own render, it took the whole analyze page down with it.
 *
 * `hasNoReleasedApiPath` (roadmap "SAP-Katalog im Browser-Bundle") is no
 * longer imported through `usage-join.ts` — that pulled the ~4 MB
 * Cloudification Repository artifacts into this client component's bundle.
 * It is looked up here through `/api/abcd-classify` instead, and the matrix
 * is not computed until that lookup settles: showing it early with every
 * object assumed to "have a path" would silently mis-sort the very objects
 * this matrix exists to flag (heavy usage + no path = Danger).
 */
export function UsageRiskMatrixFor({
  usageReport,
  findings,
  route,
}: {
  usageReport: UsageReport;
  findings: EvidenceFinding[];
  route: ExtensibilityRouteReport;
}) {
  const objectNames = useMemo(() => usageJoinObjectNames(usageReport, { findings }), [usageReport, findings]);
  const lookupObjects = useMemo(() => objectNames.map((name) => ({ name })), [objectNames]);
  const lookup = useAbcdCatalogLookup(lookupObjects);

  // Kept as a useMemo that runs unconditionally (rules of hooks), but only
  // actually joins once the path lookup is ready — see the header comment.
  const rows = useMemo(() => {
    if (lookup.status !== 'ready') return null;
    return joinUsageWithEvidence(usageReport, { findings }, route, (name) => lookup.noPath[name] ?? false);
  }, [usageReport, findings, route, lookup.status, lookup.noPath]);

  if (lookup.status === 'loading') return <UsageRiskMatrixPending />;
  if (lookup.status === 'error' || !rows) return <UsageRiskMatrixLookupFailed />;
  return <UsageRiskMatrix rows={rows} usageReport={usageReport} />;
}

/** Visible "not loaded yet" state — never a matrix computed with a guessed feasibility. */
function UsageRiskMatrixPending() {
  return (
    <section
      data-usage-risk-matrix="loading"
      className="space-y-3 rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc"
    >
      <p className="cc-text-cell text-cc-ink-muted">
        Checking the Cloudification Repository for a released path on each object…
      </p>
      <CcSkeleton shape="table" label="Checking the Cloudification Repository" count={3} />
    </section>
  );
}

/** Visible "the lookup failed" state — never a matrix silently defaulted to "clean-core-ready". */
function UsageRiskMatrixLookupFailed() {
  return (
    <section data-usage-risk-matrix="error">
      <CcMessageStrip
        state="warning"
        actions={<CcButton variant="ghost" onClick={() => window.location.reload()}>Reload the page</CcButton>}
      >
        Could not reach the SAP catalog lookup for feasibility, so the risk matrix cannot be shown — it would
        otherwise have to guess whether each object has a released path. Reload the page to try again.
      </CcMessageStrip>
    </section>
  );
}

// ── Grid cell definitions (Usage × Feasibility) ───────────────────

type CellKey = `${UsageBucket}-${Feasibility}`;

const USAGE_LABELS: { bucket: UsageBucket; label: string; icon: React.ReactNode; explain?: string }[] = [
  { bucket: 'heavy',    label: 'Heavy Usage',    icon: <TrendingUp size={14} aria-hidden={true} /> },
  { bucket: 'moderate', label: 'Moderate',       icon: <BarChart3 size={14} aria-hidden={true} /> },
  {
    bucket: 'low',
    label: 'Low Usage',
    icon: <MinusCircle size={14} aria-hidden={true} />,
    explain: 'Below-average usage but recently active. May include business-critical periodic processes (monthly closings, year-end, audit reports). Low ≠ dormant.',
  },
  {
    bucket: 'dormant',
    label: 'Dormant',
    icon: <Clock size={14} aria-hidden={true} />,
    explain: 'Zero executions across a declared window of 13+ months, or last used 13+ months ago. Retire only after business owner confirmation — some dormant objects may be required for periodic processes.',
  },
  // Zero calls in a window too short, or undeclared, to call it disuse.
  {
    bucket: 'unobserved',
    label: 'Not seen (short window)',
    icon: <Clock size={14} aria-hidden={true} />,
    explain: 'Zero calls — but in a window shorter than 13 months, or none declared. A month-end or year-end program need not have run in it. Not a retirement candidate.',
  },
  {
    bucket: 'unknown',
    label: 'Unknown',
    icon: <HelpCircle size={14} aria-hidden={true} />,
    explain: 'No usage data in the imported export for these objects. Missing data is not evidence of non-use — verify manually before retiring.',
  },
];

const FEASIBILITY_LABELS: { key: Feasibility; label: string }[] = [
  { key: 'no-released-api-path', label: 'No Clean Path' },
  { key: 'needs-architect',      label: 'Needs Architect' },
  { key: 'clean-core-ready',     label: 'Clean Core Ready' },
];

/**
 * A cell's fill says how many objects sit in it, nothing else: an amount, so
 * the sequential palette (DESIGN.md §1.8). What a cell *means* — danger,
 * retire, prioritise — is in its row and column heads and in the quadrant
 * word of every object, not in a red or a green that would claim a verdict.
 * The number is always printed in the cell.
 */
function cellFill(count: number, max: number): string {
  if (count === 0 || max === 0) return 'bg-cc-surface text-cc-ink-muted border border-cc-line';
  const share = count / max;
  if (share <= 1 / 3) return cn(SEQUENTIAL_CHART_COLORS[0].bg, 'text-cc-ink');
  if (share <= 2 / 3) return cn(SEQUENTIAL_CHART_COLORS[1].bg, 'text-cc-ink');
  return cn(SEQUENTIAL_CHART_COLORS[3].bg, 'text-cc-on-dark');
}

const QUADRANTS = Object.keys(QUADRANT_META) as Quadrant[];

function QuadrantTag({ quadrant }: { quadrant: Quadrant }) {
  return (
    <span title={QUADRANT_META[quadrant].description} data-usage-quadrant={quadrant}>
      <CcTag>{QUADRANT_META[quadrant].label}</CcTag>
    </span>
  );
}

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

  const maxInCell = useMemo(() => {
    let max = 0;
    grid.forEach((list) => { max = Math.max(max, list.length); });
    return max;
  }, [grid]);

  // Quadrant summary counts
  const quadrantCounts = useMemo(() => {
    const counts: Record<Quadrant, number> = {
      'danger': 0, 'prioritize': 0, 'retire-candidate': 0, 'low-priority': 0, 'unknown': 0,
    };
    for (const row of rows) counts[row.quadrant]++;
    return counts;
  }, [rows]);

  const cellLabel = (key: CellKey) => {
    const [u, f] = [USAGE_LABELS.find((x) => key.startsWith(`${x.bucket}-`)), FEASIBILITY_LABELS.find((x) => key.endsWith(`-${x.key}`))];
    return `${u?.label ?? ''} × ${f?.label ?? ''}`;
  };

  const selectedRows = selectedCell ? grid.get(selectedCell) || [] : [];
  const selectedSeverity = selectedRow ? normaliseSeverity(selectedRow.riskLevel) : null;

  return (
    <section
      data-usage-risk-matrix="ready"
      className="rounded-cc-card border border-cc-line bg-cc-surface shadow-cc"
    >
      {/* Header */}
      <div className="space-y-2 px-6 pt-6 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="cc-text-label text-cc-ink-muted">Usage × Evidence Matrix</span>
          <CcProvenanceChip value="imported" note="usage" />
        </div>
        <h3 className="cc-text-h2 text-cc-ink">Risk Prioritization Matrix</h3>
        <p className="cc-text-cell text-cc-ink-muted">
          Objects plotted by production usage intensity × technical feasibility.
          {/* The span the export shows, not the window it was taken over — the
              export does not say how long monitoring ran, and calling the gap
              between the first and last execution a measurement period reported
              "two days" for a year of data. */}
          {usageReport.observedSpanDays && (
            <span className="ml-1 font-semibold text-cc-ink">
              Covering {usageReport.observedSpanDays} days of observed {usageReport.source.toUpperCase()} activity
              {(usageReport.observedFrom ?? usageReport.measuredFrom) && (usageReport.observedTo ?? usageReport.measuredTo) && (
                <> (<span className="font-cc-mono">{usageReport.observedFrom ?? usageReport.measuredFrom}</span> – <span className="font-cc-mono">{usageReport.observedTo ?? usageReport.measuredTo}</span>)</>
              )}.
            </span>
          )}
        </p>
        {/* The window as declared at import (E03-F02). Without one, or with one
            shorter than 13 months, a zero count is shown as "not seen", never as
            dormant — a year-end program need not run in a six-week export. */}
        <p className="cc-text-meta" data-usage-window>
          {usageReport.window ? (
            <span className={usageReport.window.days < RETIREMENT_WINDOW_DAYS ? 'text-cc-warning' : 'text-cc-ink-muted'}>
              Monitoring window, as declared: {usageReport.window.from} – {usageReport.window.to} ({usageReport.window.days} days)
              {usageReport.window.days < RETIREMENT_WINDOW_DAYS && ' — shorter than 13 months, so no zero count is read as disuse.'}
            </span>
          ) : (
            <span className="text-cc-warning">
              No monitoring window declared — no zero count is read as disuse.
            </span>
          )}
        </p>
      </div>

      {/* Quadrant summary */}
      <ul className="flex flex-wrap gap-x-4 gap-y-2 px-6 pb-4" data-usage-quadrant-summary="">
        {QUADRANTS.map((q) => (
          <li key={q} className="flex items-center gap-2 cc-text-meta text-cc-ink">
            <span className="tabular-nums">{quadrantCounts[q]}</span>
            <QuadrantTag quadrant={q} />
          </li>
        ))}
      </ul>

      {/* 2D Grid */}
      <div className="overflow-x-auto px-4 pb-4 sm:px-6">
        <div className="min-w-[600px]" role="group" aria-label="Objects by usage and feasibility">
          {/* Column headers */}
          <div className="mb-1 grid grid-cols-[140px_1fr_1fr_1fr] gap-1">
            <div />
            {FEASIBILITY_LABELS.map(f => (
              <div key={f.key} className="cc-text-label py-2 text-center text-cc-ink-muted">
                {f.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {USAGE_LABELS.map(u => (
            <div key={u.bucket} className="mb-1 grid grid-cols-[140px_1fr_1fr_1fr] gap-1">
              <div className="flex items-center gap-2 pr-2 cc-text-meta text-cc-ink">
                <span className="shrink-0 text-cc-ink-muted">{u.icon}</span>
                <span>{u.label}</span>
              </div>

              {FEASIBILITY_LABELS.map(f => {
                const key: CellKey = `${u.bucket}-${f.key}`;
                const cellRows = grid.get(key) || [];
                const isSelected = selectedCell === key;
                const n = cellRows.length;

                return (
                  <button
                    key={key}
                    type="button"
                    data-usage-cell={key}
                    aria-pressed={isSelected}
                    aria-label={`${cellLabel(key)}: ${n} ${n === 1 ? 'object' : 'objects'}`}
                    onClick={() => {
                      // The open object detail belonged to the cell that was
                      // selected before; it used to stay on screen under a
                      // different cell's list, or under no cell at all
                      // (QA review of 33471220d6e9, 989dafdac359).
                      setSelectedRow(null);
                      setSelectedCell(isSelected ? null : key);
                    }}
                    disabled={n === 0}
                    className={cn(
                      'block w-full rounded-cc-row disabled:cursor-default',
                      isSelected && 'ring-2 ring-cc-ink ring-offset-1',
                    )}
                  >
                    <span
                      data-chart-segment=""
                      className={cn('flex min-h-[56px] flex-col items-center justify-center rounded-cc-row px-3 py-2', cellFill(n, maxInCell))}
                    >
                      <span className="cc-text-h2 tabular-nums">{n}</span>
                      <span className="cc-text-meta">{n === 1 ? 'object' : 'objects'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 pb-4">
        <CcDisclosure title="What the usage rows mean">
          <dl className="mt-2 space-y-2">
            {USAGE_LABELS.filter((u) => u.explain).map((u) => (
              <div key={u.bucket}>
                <dt className="cc-text-meta text-cc-ink">{u.label}</dt>
                <dd className="cc-text-cell text-cc-ink-muted">{u.explain}</dd>
              </div>
            ))}
          </dl>
        </CcDisclosure>
      </div>

      {/* Selected cell detail list */}
      {selectedCell && (
        <div className="space-y-3 border-t border-cc-line bg-cc-surface-muted px-6 py-4" data-usage-cell-detail="">
          <div className="flex items-center justify-between gap-2">
            <h4 className="cc-text-h3 text-cc-ink">
              {selectedRows.length} objects in cell <span className="cc-text-meta text-cc-ink-muted">· {cellLabel(selectedCell)}</span>
            </h4>
            {/* An icon-only button has no accessible name of its own: a screen
                reader announces "button" and nothing about what it closes, and
                this panel has two of them (UX review of 52f171091948,
                f320972178fb). */}
            <CcIconButton label="Close cell details" onClick={() => setSelectedCell(null)}>
              <X size={16} aria-hidden={true} />
            </CcIconButton>
          </div>
          <CcTable
            caption="Objects in the selected cell"
            limit={5}
            columns={[
              { key: 'object', label: 'Object' },
              { key: 'quadrant', label: 'Quadrant' },
              { key: 'calls', label: 'Calls', numeric: true },
              { key: 'findings', label: 'Findings', numeric: true },
            ]}
            rows={selectedRows.map((row) => {
              const open = selectedRow?.objectName === row.objectName;
              return {
                key: row.objectName,
                selected: open,
                cells: {
                  object: (
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setSelectedRow(open ? null : row)}
                      data-usage-object={row.objectName}
                      className="cc-text-identifier font-cc-mono text-cc-ink underline underline-offset-2"
                    >
                      {row.objectName}
                    </button>
                  ),
                  quadrant: <QuadrantTag quadrant={row.quadrant} />,
                  calls: row.callCount !== null ? formatNumber(row.callCount) : '—',
                  findings: formatNumber(row.findingIds.length),
                },
              };
            })}
          />
        </div>
      )}

      {/* Object detail */}
      {selectedRow && (
        <div className="space-y-3 border-t border-cc-line px-6 py-4" data-usage-object-detail="">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="cc-text-identifier font-cc-mono text-cc-ink">{selectedRow.objectName}</h4>
              <QuadrantTag quadrant={selectedRow.quadrant} />
            </div>
            <CcIconButton label="Close object details" onClick={() => setSelectedRow(null)}>
              <X size={16} aria-hidden={true} />
            </CcIconButton>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DetailCard label="Usage" value={selectedRow.usage === 'unknown' ? 'Unknown' : selectedRow.usage} />
            <DetailCard label="Call Count" value={selectedRow.callCount !== null ? formatNumber(selectedRow.callCount) ?? '—' : '—'} />
            <DetailCard label="Last Used" value={selectedRow.lastUsed || '—'} mono />
            <DetailCard
              label="Risk Level"
              value={selectedSeverity ? <CcSeverity value={selectedSeverity} /> : selectedRow.riskLevel}
            />
            <DetailCard label="Feasibility" value={selectedRow.feasibility.replace(/-/g, ' ')} />
            <DetailCard label="Findings" value={String(selectedRow.findingIds.length)} />
          </dl>

          {selectedRow.usage === 'unknown' && (
            <CcMessageStrip state="warning">
              No usage data in the imported export for this object. Missing data is not evidence of non-use — verify manually before retiring.
            </CcMessageStrip>
          )}
          {selectedRow.usage === 'unobserved' && (
            <CcMessageStrip state="warning">
              Zero calls, in a monitoring window shorter than 13 months or not declared at all. Periodic programs may not have run in it — this is not evidence of disuse.
            </CcMessageStrip>
          )}
        </div>
      )}

      {/* Measurement context footer */}
      <p className="flex items-center gap-2 border-t border-cc-line px-6 py-3 cc-text-meta text-cc-ink-muted">
        <BarChart3 size={14} aria-hidden={true} className="shrink-0" />
        <span>
          Source: {usageReport.source.toUpperCase()} ·
          {usageReport.records.length} objects ·
          {usageReport.observedSpanDays ? ` ${usageReport.observedSpanDays} days observed` : ' activity span unknown'} ·
          {usageReport.quarantined && usageReport.quarantined.length > 0 && ` ${usageReport.quarantined.length} rows rejected ·`}
          {' '}Imported <span className="font-cc-mono">{formatIsoDate(usageReport.importedAt) ?? 'date not recorded'}</span>
        </span>
      </p>
    </section>
  );
}

function DetailCard({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2">
      <dt className="cc-text-label text-cc-ink-muted">{label}</dt>
      <dd className={cn('cc-text-identifier mt-1 text-cc-ink capitalize', mono && 'font-cc-mono')}>{value}</dd>
    </div>
  );
}
