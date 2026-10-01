'use client';

import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import { normaliseSeverity } from '@/lib/severity';
import { severityChartMark } from '@/lib/chart-colors';
import CcButton from '@/components/cc/Button';
import CcTable from '@/components/cc/Table';
import CcFilterBar from '@/components/cc/FilterBar';
import CcSelect from '@/components/cc/Select';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcNoMatches } from '@/components/cc/EmptyState';
import { CcSeverity, CcCleanCoreLevel } from '@/components/cc/Identifier';
import {
  calmTitle,
  filterActive,
  findingRows,
  groupHint,
  groupRows,
  lookHereFirst,
  pageOf,
  programMap,
  SEVERITY_ORDER,
  shownGroups,
  withSuccessor,
  type FindingRow,
  type FindingsFilter,
  type GroupingKey,
  type ProcessStepBand,
  type ShownSeverity,
} from '@/lib/findings-view';
import FindingsFocus from './FindingsFocus';
import ProgramMap from './ProgramMap';
import ObjectSection from './ObjectSection';
import SourcePanel from './SourcePanel';

/**
 * The body of the Analyze object page — proposal A (owner decision
 * 01.10.2026), with B's program map for "Where in the program":
 *
 *   an anchor bar (sticky under the shell bar), then two columns —
 *   main:  the Clean Core Score (passed in), Look here first, Where in the
 *          program, Findings by kind;
 *   side:  the route (passed in), severity as a donut, what was not determined
 *          (passed in).
 *
 * The findings list: one group per kind with its count, its severity mix, its
 * clean core levels and how many name a successor; critical and high groups
 * open; five rows per group and "Show all N". Search, the severity filter, a
 * dot picked on the program map and the grouping (kind, severity, line) narrow
 * or reorder the list and open every group they match.
 *
 * Every rule lives in `lib/findings-view.ts`; this file is markup.
 */
type SeverityFilter = 'All' | ShownSeverity;

const COLUMNS = [
  { key: 'line', label: 'Line', width: '5.5rem' },
  { key: 'severity', label: 'Severity', width: '6rem' },
  { key: 'what', label: 'What' },
  { key: 'level', label: 'Level', width: '4rem' },
  { key: 'successor', label: 'SAP successor' },
] as const;

export interface LevelLookup {
  status: 'loading' | 'ready' | 'error';
  /** The level of a finding (row); null when it names no object or none was found. */
  of: (finding: EvidenceFinding) => CloudReadinessGrade | null;
}

const NO_LEVELS: LevelLookup = { status: 'error', of: () => null };

function rowCells(r: FindingRow, level: CloudReadinessGrade | null, lookup: LevelLookup['status'], openSource?: (line: number) => void) {
  const ef = r.finding;
  const sev = normaliseSeverity(ef.severity);
  return {
    line: (
      <span className="inline-flex flex-wrap gap-1">
        <CcAnchor
          label={`Source line ${r.lines[0] ?? ef.lineStart}${openSource ? ', open the source' : ''}`}
          onOpen={openSource ? () => openSource(r.lines[0] ?? ef.lineStart) : undefined}
        >{`L${r.lines[0] ?? ef.lineStart}`}</CcAnchor>
        {r.lines.length > 1 ? <span className="cc-text-meta text-cc-ink-muted">+{r.lines.length - 1}</span> : null}
      </span>
    ),
    severity: sev ? <CcSeverity value={sev} /> : <span className="cc-text-meta text-cc-ink-muted">{ef.severity || '—'}</span>,
    what: (
      <span className="min-w-0">
        <span className="font-semibold text-cc-ink">{ef.objectName || calmTitle(ef.title)}</span>{' '}
        <span className="font-cc-mono cc-text-meta font-medium text-cc-ink-muted">{ef.id}</span>
        {ef.objectName ? <span className="block cc-text-meta font-medium text-cc-ink-muted">{calmTitle(ef.title)}</span> : null}
      </span>
    ),
    level: level ? (
      <CcCleanCoreLevel value={level} />
    ) : lookup === 'ready' ? (
      <span className="cc-text-meta text-cc-ink-muted" title="No level: the finding names no object">?</span>
    ) : (
      <span className="cc-text-meta text-cc-ink-muted" title={lookup === 'loading' ? 'Looking up the catalog' : 'The catalog lookup did not answer'}>
        —
      </span>
    ),
    successor: ef.sapReplacement?.objectName ? (
      <span className="font-cc-mono cc-text-meta font-semibold text-cc-ink break-all">{ef.sapReplacement.objectName}</span>
    ) : (
      <span className="cc-text-meta text-cc-ink-muted">none named</span>
    ),
  };
}

function SeverityMix({ rows }: { rows: readonly FindingRow[] }) {
  const parts = SEVERITY_ORDER.map((s) => ({ s, n: rows.filter((r) => r.finding.severity === s).length })).filter((p) => p.n > 0);
  return (
    <span
      role="img"
      aria-label={`Severity: ${parts.map((p) => `${p.n} ${p.s.toLowerCase()}`).join(', ')}`}
      className="flex h-2 w-full gap-px overflow-hidden rounded-cc-row"
    >
      {parts.map((p) => {
        const sev = normaliseSeverity(p.s);
        return (
          <span
            key={p.s}
            data-chart-segment=""
            className={clsx('h-full', severityChartMark(sev, 'bg'))}
            style={{ flex: `${p.n} 0 0` }}
          />
        );
      })}
    </span>
  );
}

/** The severity donut of the side column — the counts are its name and its legend. */
function SeverityDonut({ rows }: { rows: readonly FindingRow[] }) {
  const parts = SEVERITY_ORDER.map((s) => ({ s, n: rows.filter((r) => r.finding.severity === s).length }));
  const total = rows.length;
  const size = 96;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="flex items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Findings by severity: ${parts.map((p) => `${p.n} ${p.s.toLowerCase()}`).join(', ')}.`}
        data-severity-bar=""
        className="shrink-0"
      >
        <circle r={r} cx={size / 2} cy={size / 2} fill="none" strokeWidth={stroke} className="stroke-cc-surface-muted" />
        {total > 0
          ? parts
              .filter((p) => p.n > 0)
              .map((p) => {
                const len = (p.n / total) * c;
                const sev = normaliseSeverity(p.s);
                const seg = (
                  <circle
                    key={p.s}
                    data-chart-segment=""
                    r={r}
                    cx={size / 2}
                    cy={size / 2}
                    fill="none"
                    strokeWidth={stroke}
                    strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
                    strokeDashoffset={-off}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    className={severityChartMark(sev, 'stroke')}
                  />
                );
                off += len;
                return seg;
              })
          : null}
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" className="fill-cc-ink text-[22px] font-extrabold">
          {total}
        </text>
        <text x="50%" y="68%" textAnchor="middle" className="fill-cc-ink-muted text-[11px] font-semibold">
          findings
        </text>
      </svg>
      <ul className="m-0 grid list-none gap-1 p-0">
        {parts.map((p) => {
          const sev = normaliseSeverity(p.s);
          return (
            <li key={p.s} className="grid grid-cols-[0.5rem_4.5rem_auto] items-center gap-2 cc-text-cell">
              <span aria-hidden={true} className={clsx('h-2 w-2 rounded-full', severityChartMark(sev, 'bg'))} />
              <span className="text-cc-ink">{p.s}</span>
              <span className="font-semibold tabular-nums text-cc-ink">{p.n}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const SECTIONS = [
  { id: 'analyze-score', label: 'Clean Core Score' },
  { id: 'analyze-focus', label: 'Look here first' },
  { id: 'analyze-where', label: 'Where in the program' },
  { id: 'analyze-kinds', label: 'Findings by kind' },
] as const;

/** The anchor bar of the object page, with the section in view marked. */
function AnchorBar({ counts }: { counts: Partial<Record<(typeof SECTIONS)[number]['id'], number>> }) {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-120px 0px -55% 0px' },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return (
    <nav
      aria-label="Sections"
      data-analyze-anchors=""
      className="cc-no-print sticky top-14 z-10 -mx-4 border-b border-cc-line bg-cc-surface px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0">
        {SECTIONS.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? 'location' : undefined}
              className={clsx(
                'inline-flex items-center gap-1 border-b-2 px-3 pt-3 pb-2 cc-text-cell whitespace-nowrap text-cc-ink',
                active === s.id ? 'border-cc-ink font-bold' : 'border-transparent',
              )}
            >
              {s.label}
              {counts[s.id] !== undefined ? <span className="font-medium text-cc-ink-muted">({counts[s.id]})</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function EvidenceFindingsTable({
  findings,
  sourceLines = 0,
  source,
  levels = NO_LEVELS,
  steps = [],
  notAssessed = [],
  scoreSection,
  sideTop,
  sideBottom,
  fileName = 'source',
}: {
  findings: readonly EvidenceFinding[];
  /** Lines of the source the findings point into; 0 when it is not on the page. */
  sourceLines?: number;
  /** The source text, for the code at a finding. */
  source?: string;
  levels?: LevelLookup;
  /** The process steps behind the program map. */
  steps?: readonly ProcessStepBand[];
  /** Where each kind of construct not assessed begins. */
  notAssessed?: ReadonlyArray<{ label: string; firstLine: number }>;
  /** The Clean Core Score section, the first of the main column. */
  scoreSection?: React.ReactNode;
  /** The route card, the first of the side column. */
  sideTop?: React.ReactNode;
  /** What was not determined, the last of the side column. */
  sideBottom?: React.ReactNode;
  /** The source's file name, for the source panel's label. */
  fileName?: string;
}) {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<SeverityFilter>('All');
  const [lines, setLines] = useState<{ from: number; to: number } | null>(null);
  const [grouping, setGrouping] = useState<GroupingKey>('kind');
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /** The line the source panel shows, opened from a dot or a line anchor. */
  const [sourceAt, setSourceAt] = useState<number | null>(null);
  /** What opened the panel — it gets the focus back when the panel closes. */
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  const rows = useMemo(() => findingRows(findings), [findings]);
  const groups = useMemo(() => groupRows(rows, grouping), [rows, grouping]);
  const picks = useMemo(() => lookHereFirst(rows), [rows]);
  const map = useMemo(() => programMap(rows, sourceLines), [rows, sourceLines]);

  const filter: FindingsFilter = { query, severity, lines };
  const shown = shownGroups(groups, filter, openState);
  const matchCount = shown.reduce((n, g) => n + g.matching.length, 0);
  const counts = Object.fromEntries(
    (['Critical', 'High', 'Medium', 'Low'] as const).map((s) => [s, rows.filter((r) => r.finding.severity === s).length]),
  ) as Record<ShownSeverity, number>;

  const clear = () => {
    setQuery('');
    setSeverity('All');
    setLines(null);
  };

  const scrollToList = (id: string) =>
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));

  // "Show in the list" on a focus card: group by kind, open that group and bring it into view.
  const showKind = (kind: string) => {
    clear();
    setGrouping('kind');
    setOpenState((s) => ({ ...s, [kind]: true }));
    scrollToList(`findings-group-${kind}`);
  };

  // A dot on the program map, or a line anchor: the source at that line, the
  // finding marked (owner decision 01.10.2026). The list filter is the panel's
  // secondary action.
  const canShowSource = Boolean(source) && sourceLines > 0 && map.length > 0;
  const openSource = (line: number | null) => {
    if (line === null) {
      closeSource();
      return;
    }
    setOpener(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setSourceAt(line);
    requestAnimationFrame(() => document.querySelector('[data-analyze-source-panel]')?.scrollIntoView({ block: 'nearest' }));
  };
  const closeSource = () => {
    setSourceAt(null);
    const back = opener;
    setOpener(null);
    if (back && back.isConnected) requestAnimationFrame(() => back.focus());
  };
  const showLineInList = (line: number) => {
    setLines({ from: line, to: line });
    scrollToList('analyze-kinds');
  };
  const rowsAtSource = sourceAt === null ? [] : rows.filter((r) => r.lines.includes(sourceAt));

  return (
    <div data-analysis-findings="" className="min-w-0">
      <AnchorBar counts={{ 'analyze-focus': picks.length, 'analyze-kinds': rows.length }} />

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {scoreSection}

          <ObjectSection
            id="analyze-focus"
            title={
              <>
                Look here first
                <CcProvenanceChip value="reconstructed" note="by severity and kind" />
              </>
            }
            right={
              <span className="cc-text-meta font-medium text-cc-ink-muted">
                {picks.length} of {rows.length} findings, picked by fixed rules
              </span>
            }
          >
            <FindingsFocus
              picks={picks}
              total={rows.length}
              onShow={showKind}
              levelOf={(p) => levels.of(p.row.finding)}
              source={source}
              onOpenLine={canShowSource ? openSource : undefined}
            />
          </ObjectSection>

          {map.length > 0 && sourceLines > 0 ? (
            <ObjectSection
              id="analyze-where"
              title="Where in the program"
              right={
                <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 cc-text-meta font-medium text-cc-ink-muted">
                  {(['Critical', 'High', 'Medium', 'Low'] as const).map((s) => (
                    <li key={s} className="inline-flex items-center gap-1">
                      <span aria-hidden={true} className={clsx('h-2 w-2 rounded-full', severityChartMark(s, 'bg'))} />
                      {s} {counts[s]}
                    </li>
                  ))}
                  {steps.length ? (
                    <li className="inline-flex items-center gap-1">
                      <span aria-hidden={true} className="h-2 w-3 rounded-cc-row bg-cc-seq-1" />
                      process step
                    </li>
                  ) : null}
                </ul>
              }
              lead="Every finding at its source line, one row per kind; a bigger dot is a more severe finding. Pick a dot to open the source at that line."
            >
              <ProgramMap
                rows={map}
                steps={steps}
                totalLines={sourceLines}
                notAssessed={notAssessed}
                selectedLine={sourceAt}
                onPick={openSource}
              />
              {sourceAt !== null && source ? (
                <SourcePanel
                  line={sourceAt}
                  rows={rowsAtSource}
                  source={source}
                  fileName={fileName}
                  levelOf={(f) => levels.of(f)}
                  onClose={closeSource}
                  onShowInList={() => showLineInList(sourceAt)}
                />
              ) : null}
            </ObjectSection>
          ) : null}

          <ObjectSection
            id="analyze-kinds"
            title={
              <>
                Findings by kind <span className="font-medium text-cc-ink-muted">({rows.length})</span>
              </>
            }
            right={
              rows.length ? (
                <CcSegmentedControl<GroupingKey>
                  label="Group the findings by"
                  value={grouping}
                  onChange={setGrouping}
                  segments={[
                    { value: 'kind', label: 'Kind' },
                    { value: 'severity', label: 'Severity' },
                    { value: 'line', label: 'Line' },
                  ]}
                />
              ) : null
            }
          >
            {rows.length === 0 ? (
              <p className="m-0 cc-text-cell text-cc-ink-muted">
                The evidence engine found nothing in what it checks. Its checks are not the whole program, so this is
                not a clean bill.
              </p>
            ) : (
              <>
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
                {lines ? (
                  <p className="m-0 mt-2 cc-text-meta text-cc-ink">
                    Showing line {lines.from === lines.to ? lines.from : `${lines.from}–${lines.to}`}, picked on the map.{' '}
                    <button type="button" onClick={() => setLines(null)} className="font-semibold underline underline-offset-2">
                      Show all lines
                    </button>
                  </p>
                ) : null}

                <div className="mt-3 flex flex-col gap-2" data-findings-groups={shown.length}>
                  {shown.length === 0 ? (
                    <CcNoMatches onClear={clear} />
                  ) : (
                    shown.map((g) => {
                      const page = pageOf(g.matching, Boolean(expanded[g.kind]));
                      const hint = grouping === 'kind' ? groupHint(g) : '';
                      const succ = withSuccessor(g.matching);
                      const lvl = new Map<string, number>();
                      for (const r of g.matching) {
                        const l = levels.of(r.finding) ?? '?';
                        lvl.set(l, (lvl.get(l) ?? 0) + 1);
                      }
                      const regionId = `findings-group-${g.kind}-rows`;
                      return (
                        <div
                          key={g.kind}
                          id={`findings-group-${g.kind}`}
                          data-findings-group={g.kind}
                          data-findings-group-open={g.open ? 'true' : 'false'}
                          className="scroll-mt-32 overflow-hidden rounded-cc-card border border-cc-line"
                        >
                          <h3 className={clsx('m-0', g.open && 'border-b border-cc-line bg-cc-surface-muted')}>
                            <button
                              type="button"
                              data-cc-disclosure-trigger=""
                              aria-expanded={g.open}
                              aria-controls={regionId}
                              onClick={() => setOpenState((s) => ({ ...s, [g.kind]: !g.open }))}
                              className="grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left sm:grid-cols-[1rem_minmax(0,1.4fr)_minmax(0,9rem)_minmax(0,7rem)_minmax(0,9rem)] sm:px-4"
                            >
                              <ChevronRight
                                size={16}
                                aria-hidden={true}
                                className={clsx('text-cc-ink-muted motion-safe:transition-transform', g.open && 'rotate-90')}
                              />
                              <span className="min-w-0">
                                <span className="cc-text-identifier text-cc-ink">{g.label}</span>{' '}
                                <span className="cc-text-cell text-cc-ink-muted">({g.matching.length})</span>
                                {hint ? <span className="block truncate cc-text-meta font-medium text-cc-ink-muted">{hint}</span> : null}
                              </span>
                              <span className="hidden sm:block">
                                <SeverityMix rows={g.matching} />
                              </span>
                              <span className="hidden flex-wrap items-center gap-1 sm:flex">
                                {levels.status === 'ready'
                                  ? [...lvl.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([l, n]) => (
                                      <span key={l} className="inline-flex items-center gap-1">
                                        {l === '?' ? (
                                          <span className="cc-text-meta text-cc-ink-muted">?</span>
                                        ) : (
                                          <CcCleanCoreLevel value={l as CloudReadinessGrade} />
                                        )}
                                        <span className="cc-text-meta text-cc-ink">{n}</span>
                                      </span>
                                    ))
                                  : null}
                              </span>
                              <span className={clsx('cc-text-meta', succ ? 'text-cc-ink' : 'text-cc-ink-muted')}>
                                {succ}/{g.matching.length} with successor
                              </span>
                            </button>
                          </h3>
                          <div id={regionId} className={clsx(!g.open && 'hidden print:block')}>
                            <CcTable
                              caption={`${g.label}: ${g.matching.length} finding${g.matching.length === 1 ? '' : 's'}`}
                              columns={COLUMNS}
                              rows={page.shown.map((r, idx) => ({
                                key: `${r.finding.kind}-${r.finding.objectName ?? r.finding.title}-${idx}`,
                                cells: rowCells(r, levels.of(r.finding), levels.status, canShowSource ? openSource : undefined),
                              }))}
                            />
                            {page.more > 0 ? (
                              <div className="border-t border-cc-line py-2 text-center">
                                <CcButton
                                  variant="ghost"
                                  density="compact"
                                  data-findings-more={g.kind}
                                  onClick={() => setExpanded((s) => ({ ...s, [g.kind]: true }))}
                                >
                                  Show all {g.matching.length}
                                </CcButton>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </ObjectSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Route, severity and what is open">
          {sideTop}
          <ObjectSection side title="Severity">
            <SeverityDonut rows={rows} />
          </ObjectSection>
          {sideBottom}
        </aside>
      </div>
    </div>
  );
}
