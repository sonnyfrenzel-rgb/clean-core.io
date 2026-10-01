'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import type { SemanticState } from '@/lib/provenance';
import { normaliseSeverity } from '@/lib/severity';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcTable from '@/components/cc/Table';
import CcFilterBar from '@/components/cc/FilterBar';
import CcSelect from '@/components/cc/Select';
import CcDisclosure from '@/components/cc/Disclosure';
import { CcNoMatches } from '@/components/cc/EmptyState';
import { CcTag } from '@/components/cc/Tag';
import { CcSeverity } from '@/components/cc/Identifier';
import { STATE_CLASSES } from '@/components/cc/state';
import {
  calmRecommendation,
  calmTitle,
  filterActive,
  findingRows,
  groupByKind,
  kindDistribution,
  lookHereFirst,
  pageOf,
  severityDistribution,
  shownGroups,
  sourceBins,
  sourcePositions,
  type FindingRow,
  type FindingsFilter,
  type ShownSeverity,
} from '@/lib/findings-view';
import FindingsFocus from './FindingsFocus';
import FindingsOverview from './FindingsOverview';

/**
 * The findings of the evidence engine, focused (owner, 01.10.2026: "viel zu
 * lang … mehr Visualisierung und wo sich das Auge drauf konzentrieren soll").
 *
 * Top to bottom: "Look here first" (at most three, fixed rules), three small
 * pictures (severity, where in the program, by kind), then the list — one
 * group per kind with its count, critical and high groups open, five rows per
 * group and "Show N more". Search, the severity filter and a stretch picked on
 * the source strip narrow the list and open every group they match.
 *
 * Progressive disclosure rather than endless scroll: predictable, reachable by
 * keyboard, and every row prints (a folded region prints open, §7.1).
 *
 * Every rule lives in `lib/findings-view.ts`; this file is markup, kept minimal
 * and token-only until the visual direction for the seven tools is chosen.
 */
type SeverityFilter = 'All' | ShownSeverity;

const COLUMNS = [
  { key: 'what', label: 'What was found' },
  { key: 'severity', label: 'Severity' },
  { key: 'meaning', label: 'What it means' },
  { key: 'replacement', label: 'SAP successor' },
  { key: 'details', label: 'Details' },
] as const;

/** A catalog match is imported evidence (information); a candidate is to be checked. */
function replacementState(confidence: string | undefined): SemanticState {
  if (confidence === 'Catalog Match' || confidence === 'Verified') return 'information';
  if (confidence === 'Candidate') return 'warning';
  return 'error';
}

function sourceLabel(source: EvidenceFinding['source']): string {
  if (source === 'static-parser') return 'Parser';
  if (source === 'catalog-match') return 'Catalog';
  return 'LLM';
}

function rowCells({ finding: ef, lines, snippets }: FindingRow) {
  const sev = normaliseSeverity(ef.severity);
  return {
    what: (
      <>
        <div className="cc-text-cell font-semibold text-cc-ink">
          {calmTitle(ef.title)}
          {lines.length > 1 ? ` (${lines.length}×)` : ''}
        </div>
        <div className="cc-text-meta text-cc-ink-muted mt-1">
          {lines.length === 1 ? 'Line' : 'Lines'} {lines.join(', ')}
        </div>
      </>
    ),
    severity: sev ? <CcSeverity value={sev} /> : <span className="cc-text-meta text-cc-ink-muted">{ef.severity || '—'}</span>,
    meaning: (
      <span className="cc-text-cell text-cc-ink-muted line-clamp-2" title={ef.cleanCoreImpact}>
        {ef.cleanCoreImpact || '—'}
      </span>
    ),
    replacement: ef.sapReplacement ? (
      <div className="inline-block min-w-0">
        <div className="cc-text-cell font-medium text-cc-ink break-all">{ef.sapReplacement.objectName}</div>
        <span className={clsx('cc-text-meta', STATE_CLASSES[replacementState(ef.sapReplacement.confidence)].text)}>
          {ef.sapReplacement.confidence}
          {ef.sapReplacement.catalogVersion && (
            <span className="text-cc-ink-muted ml-1">(v{ef.sapReplacement.catalogVersion})</span>
          )}
        </span>
      </div>
    ) : (
      <span className="cc-text-meta text-cc-ink-muted">None named</span>
    ),
    details: (
      <CcDisclosure title="Details">
        <div className="space-y-2 min-w-0">
          {ef.cleanCoreImpact && <p className="m-0 cc-text-cell text-cc-ink">{ef.cleanCoreImpact}</p>}
          {ef.recommendation && (
            <p className="m-0 cc-text-cell text-cc-ink-muted">
              <span className="font-semibold text-cc-ink">What to do: </span>
              {calmRecommendation(ef.recommendation)}
            </p>
          )}
          {snippets.slice(0, 2).map((s, i) => (
            <code
              key={i}
              className="block cc-text-meta font-medium font-cc-mono bg-cc-surface-muted border border-cc-line text-cc-ink px-2 rounded-cc-row max-w-xs overflow-hidden text-ellipsis whitespace-nowrap"
              title={s}
            >
              {s}
            </code>
          ))}
          {snippets.length > 2 && <span className="cc-text-meta text-cc-ink-muted">+{snippets.length - 2} more</span>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="cc-text-meta font-cc-mono text-cc-ink-muted">{ef.kind}</span>
            {/* Which part of the engine produced the row — a plain label, not a proof mark. */}
            <CcTag>{sourceLabel(ef.source)}</CcTag>
          </div>
          {(ef.targetOptions || []).length > 0 && (
            <p className="cc-text-meta text-cc-ink-muted">Target options: {(ef.targetOptions || []).join(' · ')}</p>
          )}
        </div>
      </CcDisclosure>
    ),
  };
}

export default function EvidenceFindingsTable({
  findings,
  sourceLines = 0,
}: {
  findings: readonly EvidenceFinding[];
  /** Lines of the source the findings point into; 0 when it is not on the page. */
  sourceLines?: number;
}) {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<SeverityFilter>('All');
  const [lines, setLines] = useState<{ from: number; to: number } | null>(null);
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => findingRows(findings), [findings]);
  const groups = useMemo(() => groupByKind(rows), [rows]);
  const picks = useMemo(() => lookHereFirst(rows), [rows]);
  const severities = useMemo(() => severityDistribution(rows), [rows]);
  const kinds = useMemo(() => kindDistribution(rows), [rows]);
  const bins = useMemo(() => sourceBins(sourcePositions(rows, sourceLines), sourceLines, 48), [rows, sourceLines]);

  const filter: FindingsFilter = { query, severity, lines };
  const shown = shownGroups(groups, filter, openState);
  const matchCount = shown.reduce((n, g) => n + g.matching.length, 0);

  if (rows.length === 0) return null;

  const clear = () => {
    setQuery('');
    setSeverity('All');
    setLines(null);
  };

  // "Show in the list" on a focus card: open that group and bring it into view.
  const showKind = (kind: string) => {
    clear();
    setOpenState((s) => ({ ...s, [kind]: true }));
    requestAnimationFrame(() => document.getElementById(`findings-group-${kind}`)?.scrollIntoView({ block: 'start' }));
  };

  const counts = Object.fromEntries(severities.map((s) => [s.key, s.count])) as Record<ShownSeverity, number>;

  return (
    <div data-analysis-findings="">
      <CcCard title="Findings" level={2} count={rows.length}>
        <div className="space-y-6">
          <FindingsFocus picks={picks} onShow={showKind} />

          <FindingsOverview
            severities={severities}
            kinds={kinds}
            bins={bins}
            totalLines={sourceLines}
            selected={lines}
            onPickLines={setLines}
          />

          <div>
            <CcFilterBar
              noun="findings"
              shown={matchCount}
              total={rows.length}
              search={query}
              onSearch={setQuery}
              active={filterActive(filter)}
              onClear={clear}
            >
              <CcSelect<SeverityFilter>
                label="Severity"
                value={severity}
                onChange={setSeverity}
                options={(['All', 'Critical', 'High', 'Medium', 'Low'] as const).map((level) => ({
                  value: level,
                  label: level === 'All' ? `All severities (${rows.length})` : `${level} (${counts[level]})`,
                }))}
              />
            </CcFilterBar>

            <div className="mt-3 space-y-2" data-findings-groups={shown.length}>
              {shown.length === 0 ? (
                <CcNoMatches onClear={clear} />
              ) : (
                shown.map((g) => {
                  const page = pageOf(g.matching, Boolean(expanded[g.kind]));
                  return (
                    <div
                      key={g.kind}
                      id={`findings-group-${g.kind}`}
                      data-findings-group={g.kind}
                      data-findings-group-open={g.open ? 'true' : 'false'}
                      className="scroll-mt-24 rounded-cc-card border border-cc-line bg-cc-surface px-3 py-2"
                    >
                      <CcDisclosure
                        title={g.label}
                        count={g.matching.length}
                        level={3}
                        open={g.open}
                        onOpenChange={(open) => setOpenState((s) => ({ ...s, [g.kind]: open }))}
                      >
                        <CcTable
                          caption={`${g.label}: ${g.matching.length} finding${g.matching.length === 1 ? '' : 's'}`}
                          columns={COLUMNS}
                          rows={page.shown.map((r, idx) => ({
                            key: `${r.finding.kind}-${r.finding.objectName ?? r.finding.title}-${idx}`,
                            cells: rowCells(r),
                          }))}
                        />
                        {page.more > 0 ? (
                          <div className="mt-2">
                            <CcButton
                              variant="ghost"
                              data-findings-more={g.kind}
                              onClick={() => setExpanded((s) => ({ ...s, [g.kind]: true }))}
                            >
                              Show {page.more} more
                            </CcButton>
                          </div>
                        ) : null}
                      </CcDisclosure>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </CcCard>
    </div>
  );
}
