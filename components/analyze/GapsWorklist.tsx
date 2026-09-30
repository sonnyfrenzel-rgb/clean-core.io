'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Code2, X } from 'lucide-react';
import type { Project, WorklistItem } from '@/lib/types';
import type { SupportFinding } from '@/lib/abap/class-model';
import GapsPrioritization from './GapsPrioritization';
import { gapsUnreadableSentence } from '@/lib/model-gaps';
import { normaliseSeverity } from '@/lib/severity';
import { SEQUENTIAL_CHART_COLORS } from '@/lib/chart-colors';
import { cn } from '@/lib/utils';
import CcButton from '@/components/cc/Button';
import CcFilterBar from '@/components/cc/FilterBar';
import CcSelect from '@/components/cc/Select';
import CcTable, { type CcTableRowSpec } from '@/components/cc/Table';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcCodeSurface from '@/components/cc/CodeSurface';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcNoMatches } from '@/components/cc/EmptyState';
import { CcSeverity } from '@/components/cc/Identifier';
import { CcTag } from '@/components/cc/Tag';

interface GapsWorklistProps {
  projectId: string;
  project: Project;
  findings: SupportFinding[];
  analysisGaps: Array<{
    title: string;
    severity: 'High' | 'Medium' | 'Low';
    strategy: string;
    rationale: string;
    complexity: 'High' | 'Medium' | 'Low';
  }>;
  /** Why the narrative's gaps could not be read, from `readModelGaps`; null or absent when they could. */
  gapsUnreadable?: string | null;
  showHelpMode: boolean;
  onUpdateWorklist: (updatedWorklist: WorklistItem[]) => Promise<void>;
}

type Status = WorklistItem['status'];
type CategoryFilter = 'all' | WorklistItem['category'];
type StatusFilter = 'all' | Status;

/** The three states a backlog item moves through. Words only — no coloured dot stands in for them. */
const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' },
  { value: 'signed_off', label: 'Confirmed' },
];

/**
 * The burndown bar counts amounts of one list, not states of a finding, so it
 * takes the sequential palette (DESIGN.md §1.8) — darkest for what is done —
 * and "open" is the empty track the other two have not filled yet.
 */
const BURNDOWN = {
  signedOff: SEQUENTIAL_CHART_COLORS[3].bg,
  inReview: SEQUENTIAL_CHART_COLORS[1].bg,
};

export default function GapsWorklist({
  projectId,
  project,
  findings,
  analysisGaps,
  gapsUnreadable = null,
  showHelpMode,
  onUpdateWorklist
}: GapsWorklistProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [expandedCodeItem, setExpandedCodeItem] = useState<string | null>(null);

  // Derive unified worklist items, lazily fallback if not present in Firestore
  const worklistItems = useMemo(() => {
    if (project.worklist && project.worklist.length > 0) {
      return project.worklist;
    }

    const items: WorklistItem[] = [];

    // 1. Map static findings
    findings.forEach((f, idx) => {
      items.push({
        id: `finding-${f.construct}-${idx}`,
        title: f.title,
        category: 'Finding',
        level: f.level === 'fully' ? 'fully' : f.level === 'partial' ? 'review' : 'out_of_scope',
        severity: f.level === 'not-supported' ? 'High' : f.level === 'partial' ? 'Medium' : 'Low',
        location: f.location ? `${f.location.file}:${f.location.line}` : 'main.abap',
        recommendation: f.recommendation,
        status: f.requiresSignOff ? 'open' : 'signed_off',
        effort: f.level === 'not-supported' ? 'High' : f.level === 'partial' ? 'Medium' : 'Low',
        targetAnchor: typeof f.targetAnchor === 'string' ? f.targetAnchor : undefined,
        detail: f.detail
      });
    });

    // 2. Map LLM functional gaps
    analysisGaps.forEach((g, idx) => {
      items.push({
        id: `gap-${idx}`,
        title: g.title,
        category: 'Functional Gap',
        severity: g.severity,
        location: 'S/4HANA Configuration',
        recommendation: g.rationale,
        strategy: g.strategy,
        status: 'open',
        effort: g.complexity
      });
    });

    return items;
  }, [project.worklist, findings, analysisGaps]);

  // Status counters for burndown rollup
  const stats = useMemo(() => {
    const total = worklistItems.length;
    const signedOff = worklistItems.filter(i => i.status === 'signed_off').length;
    const inReview = worklistItems.filter(i => i.status === 'in_review').length;
    const open = worklistItems.filter(i => i.status === 'open').length;

    const signedOffPct = total > 0 ? Math.round((signedOff / total) * 100) : 0;
    const inReviewPct = total > 0 ? Math.round((inReview / total) * 100) : 0;
    const openPct = total > 0 ? Math.round((open / total) * 100) : 0;

    return { total, signedOff, inReview, open, signedOffPct, inReviewPct, openPct };
  }, [worklistItems]);

  // Every status change sends the complete list, and every handler used to
  // build that list from the snapshot it had captured when it started. Change
  // item A, change item B while A is still saving, and B's write restored A to
  // its old status — a sign-off silently undone, with the clearance totals
  // agreeing with the wrong list (QA review of 33471220d6e9, 883625214774).
  // The writes are serialised and each one starts from what the one before it
  // actually wrote.
  const pendingWrite = useRef<Promise<void>>(Promise.resolve());
  const latestList = useRef(worklistItems);
  useEffect(() => { latestList.current = worklistItems; }, [worklistItems]);

  const handleStatusChange = async (itemId: string, newStatus: Status) => {
    setUpdatingItemId(itemId);
    const run = pendingWrite.current.then(async () => {
      const updatedList = latestList.current.map((item: WorklistItem) =>
        item.id === itemId ? { ...item, status: newStatus } : item,
      );
      await onUpdateWorklist(updatedList);
      // Only a write that went through becomes the base for the next one: a
      // rejected change used to stay in the snapshot and be replayed by the
      // following one (QA review of 146ac2e1a724, a423cd8ab43b).
      latestList.current = updatedList;
    }).catch((err: unknown) => {
      console.error('Failed to update backlog item status:', err);
    });
    pendingWrite.current = run;
    try {
      await run;
    } finally {
      setUpdatingItemId((current) => (current === itemId ? null : current));
    }
  };

  // Filtered list
  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return worklistItems.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(term) ||
        item.recommendation.toLowerCase().includes(term) ||
        item.location.toLowerCase().includes(term);

      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [worklistItems, searchTerm, statusFilter, categoryFilter]);

  const filterActive = searchTerm !== '' || statusFilter !== 'all' || categoryFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCategoryFilter('all');
  };

  // Map functional gaps category to 2x2 matrix gaps category format
  const gapsCat = useMemo(() => {
    const quickWins: any[] = [];
    const complexStandard: any[] = [];
    const strategic: any[] = [];
    const retire: any[] = [];

    analysisGaps.forEach(g => {
      const mappedGap = {
        title: g.title,
        severity: g.severity,
        strategy: g.strategy,
        complexity: g.complexity,
        rationale: g.rationale
      };
      // A model gap can arrive without a strategy; it is then sorted by its
      // complexity alone instead of taking the whole panel down.
      const strategy = (typeof g.strategy === 'string' ? g.strategy : '').toLowerCase();

      if (strategy.includes('decommission') || strategy.includes('retire')) {
        retire.push(mappedGap);
      } else if (g.complexity === 'Low') {
        quickWins.push(mappedGap);
      } else if (strategy.includes('btp') || strategy.includes('side-by-side')) {
        strategic.push(mappedGap);
      } else {
        complexStandard.push(mappedGap);
      }
    });

    return { quickWins, complexStandard, strategic, retire };
  }, [analysisGaps]);

  const rows: CcTableRowSpec[] = filteredItems.map((item) => {
    const isUpdating = updatingItemId === item.id;
    const severityValue = normaliseSeverity(item.severity);
    const canShowCode = !!(item.location && item.location.includes(':') && project?.legacyCode);
    const codeOpen = expandedCodeItem === item.id;
    return {
      key: item.id,
      cells: {
        status: (
          // Labelled per row: the column head says "Status", the name says of what.
          <select
            aria-label={`Status of ${item.title}`}
            disabled={isUpdating}
            aria-busy={isUpdating || undefined}
            value={item.status}
            onChange={(e) => handleStatusChange(item.id, e.target.value as Status)}
            data-worklist-status={item.id}
            className="min-h-8 w-36 cursor-pointer rounded-cc-row border border-cc-field-border bg-cc-surface px-2 text-[13px] font-medium text-cc-ink disabled:cursor-not-allowed disabled:bg-cc-surface-muted disabled:text-cc-ink-muted"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ),
        item: (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="cc-text-identifier text-cc-ink">{item.title}</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-cc-mono text-[12px] font-medium text-cc-ink-muted">{item.location}</span>
              {canShowCode && (
                <CcButton
                  variant="ghost"
                  aria-expanded={codeOpen}
                  onClick={() => setExpandedCodeItem(codeOpen ? null : item.id)}
                  icon={codeOpen ? <X size={14} aria-hidden={true} /> : <Code2 size={14} aria-hidden={true} />}
                >
                  {codeOpen ? 'Close code' : 'View code'}
                </CcButton>
              )}
            </div>
          </div>
        ),
        category: <CcTag>{item.category === 'Finding' ? 'Finding' : 'Gap'}</CcTag>,
        severity: severityValue ? (
          <CcSeverity value={severityValue} />
        ) : (
          <span className="cc-text-meta text-cc-ink-muted">not determined</span>
        ),
        effort: <span className="cc-text-cell text-cc-ink">{item.effort}</span>,
        action: (
          <div className="flex flex-col gap-2">
            <p className="cc-text-cell text-cc-ink">{item.recommendation}</p>
            {item.strategy && (
              <p className="cc-text-cell text-cc-ink-muted">
                <span className="font-semibold text-cc-ink">Strategy:</span> {item.strategy}{' '}
                <CcProvenanceChip value="proposed" />
              </p>
            )}
          </div>
        ),
      },
      note: codeOpen && project?.legacyCode ? <CodeContext item={item} code={project.legacyCode} onClose={() => setExpandedCodeItem(null)} /> : undefined,
    };
  });

  return (
    <div className="space-y-8">
      {gapsUnreadable ? (
        // The model sent gaps in a shape `lib/model-gaps.ts` could not read.
        // Said here, where the gaps would be, rather than left out in silence.
        <div data-gaps-unreadable="">
          <CcMessageStrip state="warning">{gapsUnreadableSentence(gapsUnreadable)}</CcMessageStrip>
        </div>
      ) : null}

      {/* Burndown rollup */}
      <section className="flex flex-col gap-6 rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc md:flex-row md:items-center md:justify-between">
        <div className="w-full space-y-2 md:max-w-md">
          <div className="flex flex-wrap items-center gap-2">
            <span className="cc-text-label text-cc-ink-muted">Migration burndown</span>
            {stats.signedOffPct === 100 && <CcTag>Cleared</CcTag>}
          </div>
          <h2 className="cc-text-h2 text-cc-ink">Project Backlog Clearance</h2>
          <p className="cc-text-cell text-cc-ink-muted">
            Resolve architectural findings and functional standard fits. All required sign-offs must be cleared to generate the final deployment bundle.
          </p>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-6 sm:flex-row sm:items-center md:w-auto">
          <div>
            <span className="cc-text-label block text-cc-ink-muted">Items signed off</span>
            <p className="mt-1 text-cc-ink">
              <span className="cc-text-title tabular-nums">{stats.signedOff}</span>
              <span className="cc-text-body text-cc-ink-muted"> / {stats.total}</span>
            </p>
            <span className="cc-text-meta text-cc-ink-muted">{stats.signedOffPct}% completed</span>
          </div>

          <div className="w-full flex-1 space-y-2 sm:w-64">
            <div
              role="img"
              aria-label={`Confirmed ${stats.signedOff}, in review ${stats.inReview}, open ${stats.open} of ${stats.total}`}
              className="flex h-3 w-full overflow-hidden rounded-cc-row border border-cc-line"
            >
              <div data-chart-segment="" className={BURNDOWN.signedOff} style={{ width: `${stats.signedOffPct}%` }} />
              <div data-chart-segment="" className={BURNDOWN.inReview} style={{ width: `${stats.inReviewPct}%` }} />
              <div className="bg-cc-surface-muted" style={{ width: `${stats.openPct}%` }} />
            </div>
            <ul className="flex flex-wrap justify-between gap-2 cc-text-meta text-cc-ink">
              <li className="flex items-center gap-1">
                <span aria-hidden={true} className={cn('inline-block h-2 w-2 shrink-0 rounded-full', BURNDOWN.signedOff)} />
                Confirmed ({stats.signedOff})
              </li>
              <li className="flex items-center gap-1">
                <span aria-hidden={true} className={cn('inline-block h-2 w-2 shrink-0 rounded-full', BURNDOWN.inReview)} />
                In review ({stats.inReview})
              </li>
              <li className="flex items-center gap-1">
                <span aria-hidden={true} className="inline-block h-2 w-2 shrink-0 rounded-full border border-cc-field-border bg-cc-surface-muted" />
                Open ({stats.open})
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Filters and list */}
      <section className="space-y-4 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc" data-gaps-worklist="">
        <h2 className="cc-text-h2 text-cc-ink">
          Gaps Backlog Worklist <span className="cc-text-meta text-cc-ink-muted">({worklistItems.length})</span>
        </h2>
        <CcFilterBar
          noun="backlog items"
          shown={filteredItems.length}
          total={worklistItems.length}
          search={searchTerm}
          onSearch={setSearchTerm}
          active={filterActive}
          onClear={clearFilters}
        >
          {/* "Statischer Finding" was half German in an otherwise English
              list, and it did not match the word the table itself uses for
              the category (UX review of 52f171091948, 0cac41894022). The
              value stays `Finding` — it is the stored category, not copy. */}
          <CcSelect<CategoryFilter>
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: 'all', label: 'All categories' },
              { value: 'Finding', label: 'Static finding' },
              { value: 'Functional Gap', label: 'Functional gap' },
            ]}
          />
          <CcSelect<StatusFilter>
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ value: 'all', label: 'All statuses' }, ...STATUS_OPTIONS]}
          />
        </CcFilterBar>

        {filteredItems.length > 0 ? (
          <CcTable
            caption="Gaps backlog worklist"
            limit={10}
            columns={[
              { key: 'status', label: 'Status', width: '160px' },
              { key: 'item', label: 'Backlog item / code location' },
              { key: 'category', label: 'Category', width: '110px' },
              { key: 'severity', label: 'Severity', width: '110px' },
              { key: 'effort', label: 'Effort', width: '90px' },
              { key: 'action', label: 'Modernization action / mitigation' },
            ]}
            rows={rows}
          />
        ) : worklistItems.length > 0 ? (
          <CcNoMatches title="No backlog items match these filters" onClear={clearFilters} />
        ) : (
          <p className="cc-text-cell text-cc-ink-muted">This analysis has no backlog items.</p>
        )}
      </section>

      {/* 2x2 Prioritization Matrix */}
      <GapsPrioritization showHelpMode={showHelpMode} gapsCat={gapsCat} />
    </div>
  );
}

/** The lines a location points at, with two lines of context either side. */
function CodeContext({ item, code, onClose }: { item: WorklistItem; code: string; onClose: () => void }) {
  // Parse line numbers from location (e.g. "main.abap:228, 656, 703")
  const locParts = (item.location || '').split(':');
  const lineNums = (locParts[1] || '').split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n));
  const codeLines = code.split('\n');
  if (lineNums.length === 0) return null;
  return (
    <div className="space-y-2" data-worklist-code={item.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="cc-text-label text-cc-ink-muted">
          Source code — {lineNums.length} occurrence{lineNums.length > 1 ? 's' : ''}
        </span>
        <CcButton variant="ghost" onClick={onClose} icon={<X size={14} aria-hidden={true} />}>
          Close
        </CcButton>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {lineNums.map((lineNum: number, i: number) => {
          const contextStart = Math.max(0, lineNum - 3);
          const contextEnd = Math.min(codeLines.length - 1, lineNum + 2);
          const lines = codeLines.slice(contextStart, contextEnd + 1).map((text, j) => ({
            number: contextStart + j + 1,
            tokens: [{ kind: 'plain' as const, text }],
            highlighted: contextStart + j + 1 === lineNum,
          }));
          return <CcCodeSurface key={i} lines={lines} label={`${locParts[0]}, line ${lineNum}`} />;
        })}
      </div>
    </div>
  );
}
