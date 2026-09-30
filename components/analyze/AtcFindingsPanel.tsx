'use client';

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AtcComparisonState, AtcJoinRow, AtcReport } from '@/lib/abap/atc-model';
import { joinAtcWithEvidence, summarizeAtcComparison } from '@/lib/abap/atc-join';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import { normaliseSeverity } from '@/lib/severity';
import { formatIsoDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import CcFilterBar from '@/components/cc/FilterBar';
import CcSelect from '@/components/cc/Select';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcDisclosure from '@/components/cc/Disclosure';
import { CcNoMatches } from '@/components/cc/EmptyState';
import { CcSeverity } from '@/components/cc/Identifier';
import { CcTag } from '@/components/cc/Tag';

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
 *
 * No state colour for any of the three: an overlap is not a result, so "both"
 * is not green and "ATC only" is not a warning (DESIGN.md §1.1). The word is
 * the whole signal.
 */
const STATE_META: Record<AtcComparisonState, { label: string; short: string; explain: string }> = {
  both: {
    label: 'Reported by both',
    short: 'Both',
    explain: 'ATC and the engine both name this object. This says the two overlap on the object — it does not say they found the same issue, and the two finding lists below are never combined into one count.',
  },
  'atc-only': {
    label: 'Only in the ATC import',
    short: 'ATC only',
    explain: 'ATC reported a finding here; the engine’s evidence findings do not name this object. This is not the engine missing a real defect — the engine may have no detector for what ATC checked, or never analysed this object at all.',
  },
  'engine-only': {
    label: 'Only in the engine’s findings',
    short: 'Engine only',
    explain: 'The engine reports a finding here; the imported ATC results do not name this object. Most ATC exports carry only what failed a check, so this is silence, not a pass — it does not mean ATC checked this object and found it clean.',
  },
};

const STATES = Object.keys(STATE_META) as AtcComparisonState[];

/** ATC's own priority words. Shown as ATC wrote them — they are not this product's severities. */
const PRIORITY_LABEL: Record<string, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
  unknown: 'Unknown',
};

export default function AtcFindingsPanel({ atcReport, findings }: AtcFindingsPanelProps) {
  const rows = useMemo(() => joinAtcWithEvidence(atcReport, { findings }), [atcReport, findings]);
  // Three numbers, one per bucket — never added up into one.
  const overlap = useMemo(() => summarizeAtcComparison(rows), [rows]);
  const findingsById = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);

  const [filter, setFilter] = useState<AtcComparisonState | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const bucketSize = (state: AtcComparisonState) =>
    state === 'both' ? overlap.both : state === 'atc-only' ? overlap.atcOnly : overlap.engineOnly;

  const filtered = rows.filter((r) => {
    if (filter !== 'all' && r.state !== filter) return false;
    if (query && !r.objectName.includes(query.toUpperCase())) return false;
    return true;
  });

  const clear = () => {
    setFilter('all');
    setQuery('');
  };

  return (
    <section
      className="rounded-cc-card border border-cc-line bg-cc-surface shadow-cc"
      data-atc-findings-panel
    >
      <div className="space-y-2 px-6 pt-6 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="cc-text-label text-cc-ink-muted">ATC import</span>
          <CcProvenanceChip value="imported" note="ATC" />
        </div>
        <h3 className="cc-text-h2 text-cc-ink">ATC Findings, Compared With the Engine</h3>
        <p className="cc-text-cell max-w-3xl text-cc-ink-muted">
          Every finding below is exactly what ATC reported — this product does not verify it. Where an object
          appears in only one of the two sources, that is an observation about what each source covers, never a
          judgement of the other. Nothing here merges an ATC finding with an engine finding.
        </p>
        {/* Three separate numbers, one per bucket. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 cc-text-meta text-cc-ink" data-atc-state-summary="">
          {STATES.map((state) => (
            <li key={state} data-atc-state-count={state}>
              <span className="tabular-nums">{bucketSize(state)}</span>{' '}
              <span className="font-medium text-cc-ink-muted">{STATE_META[state].short}</span>
            </li>
          ))}
        </ul>
        <CcDisclosure title="What the three states mean">
          <dl className="mt-2 space-y-2">
            {STATES.map((state) => (
              <div key={state}>
                <dt className="cc-text-meta text-cc-ink">{STATE_META[state].label}</dt>
                <dd className="cc-text-cell text-cc-ink-muted">{STATE_META[state].explain}</dd>
              </div>
            ))}
          </dl>
        </CcDisclosure>
      </div>

      <div className="px-6 pb-4">
        <CcFilterBar
          noun="objects"
          shown={filtered.length}
          total={rows.length}
          search={query}
          onSearch={setQuery}
          active={filter !== 'all' || query !== ''}
          onClear={clear}
        >
          <CcSelect<AtcComparisonState | 'all'>
            label="Coverage"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All objects' },
              ...STATES.map((state) => ({ value: state, label: `${STATE_META[state].short} (${bucketSize(state)})` })),
            ]}
          />
        </CcFilterBar>
      </div>

      <div className="max-h-[28rem] overflow-y-auto border-t border-cc-line">
        {filtered.length === 0 ? (
          <div className="px-6 py-4">
            <CcNoMatches title="No objects match these filters" onClear={clear} />
          </div>
        ) : (
          <ul className="divide-y divide-cc-line">
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

      <p className="cc-text-meta border-t border-cc-line px-6 py-3 text-cc-ink-muted">
        {atcReport.findings.length} findings reported by ATC ·
        {atcReport.quarantined && atcReport.quarantined.length > 0 && ` ${atcReport.quarantined.length} rows rejected on import ·`}
        {' '}Imported <span className="font-cc-mono">{formatIsoDate(atcReport.importedAt) ?? 'date not recorded'}</span>
      </p>
    </section>
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
  const detailId = `atc-detail-${row.objectName}`;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        data-atc-row={row.objectName}
        className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <ChevronRight
            size={16}
            aria-hidden={true}
            className={cn('shrink-0 text-cc-ink-muted motion-safe:transition-transform', expanded && 'rotate-90')}
          />
          <CcTag>{meta.short}</CcTag>
          <span className="cc-text-identifier truncate font-cc-mono text-cc-ink">{row.objectName}</span>
        </span>
        <span className="flex shrink-0 items-center gap-4 cc-text-meta text-cc-ink-muted">
          <span>{row.atcFindings.length} ATC</span>
          <span>{row.engineFindingIds.length} engine</span>
        </span>
      </button>

      {expanded && (
        <div id={detailId} className="grid grid-cols-1 gap-4 px-6 pb-4 md:grid-cols-2">
          <div className="rounded-cc-row border border-cc-line p-3">
            <p className="cc-text-label mb-2 text-cc-ink-muted">Reported by ATC</p>
            {row.atcFindings.length === 0 ? (
              <p className="cc-text-cell text-cc-ink-muted">
                Not present in the imported ATC results. Not the same as ATC checking this object and finding it
                clean — most ATC exports carry only what failed a check.
              </p>
            ) : (
              <ul className="space-y-2">
                {row.atcFindings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 cc-text-cell text-cc-ink">
                    <CcTag>{PRIORITY_LABEL[f.priority] ?? f.priority}</CcTag>
                    <span className="min-w-0">
                      {f.checkTitle && <span className="font-semibold">{f.checkTitle}: </span>}
                      {f.message}
                      {f.line !== undefined && <span className="text-cc-ink-muted"> (line <span className="font-cc-mono">{f.line}</span>)</span>}
                      {f.exempted && <span className="ml-1 cc-text-meta text-cc-ink-muted">— exempted in ATC</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-cc-row border border-cc-line p-3">
            <p className="cc-text-label mb-2 text-cc-ink-muted">Detected by the engine</p>
            {row.engineFindingIds.length === 0 ? (
              <p className="cc-text-cell text-cc-ink-muted">
                The engine's detectors report nothing for this object. Not a statement that the engine is wrong —
                it may have no detector for what ATC's check covers.
              </p>
            ) : (
              <ul className="space-y-2">
                {row.engineFindingIds.map((id) => {
                  const f = findingsById.get(id);
                  if (!f) return null;
                  const sev = normaliseSeverity(f.severity);
                  return (
                    <li key={id} className="flex items-start gap-2 cc-text-cell text-cc-ink">
                      {sev ? <CcSeverity value={sev} /> : <span className="cc-text-meta text-cc-ink-muted">not determined</span>}
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
