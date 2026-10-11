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
import { CcCleanCoreLevelExplained, CcNoLevelExplained } from '@/components/cc/LevelExplained';
import {
  calmTitle,
  filterActive,
  findingRows,
  groupHint,
  groupRows,
  lookHereFirst,
  noLevelReason,
  pageOf,
  programMap,
  SEVERITY_ORDER,
  shownGroups,
  withSuccessor,
  type FindingRow,
  type FindingsFilter,
  type GroupingKey,
  type NoLevelReason,
  type ProcessStepBand,
  type ShownSeverity,
} from '@/lib/findings-view';
import { successorSourceNote } from '@/lib/successor-source';
import FindingsFocus from './FindingsFocus';
import ProgramMap from './ProgramMap';
import PageAnchorBar from '@/components/PageAnchorBar';
import { analyzeAnchors, PAGE_ANCHOR_LABELS } from '@/lib/page-anchors';
import ObjectSection from './ObjectSection';
import { useBreakpointS } from '@/hooks/useBreakpointS';
import SourcePanel from './SourcePanel';

/**
 * The body of the Analyze object page — proposal A (owner decision
 * 01.10.2026), with B's program map for "Where in the program":
 *
 *   two columns (the anchor bar above them is the page's, `AnalyzeAnchorBar`) —
 *   main:  Look here first, Where in the program, Findings by kind (the Clean
 *          Core Score is the hero above the bar since 11.10.2026, ADR-093);
 *   side:  the route (passed in) and what was not determined (passed in) —
 *          two cards at most (DESIGN.md §2.11). The severity donut that stood
 *          between them said the Findings facet's bar a third time and went
 *          (owner 10.10.2026).
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
  { key: 'level', label: 'Level', width: '5.5rem' },
  { key: 'successor', label: 'Successor' },
] as const;

export interface LevelLookup {
  status: 'loading' | 'ready' | 'error';
  /** The level of a finding (row); null when it names no object (`noLevelReason` says why) or the lookup has not answered. */
  of: (finding: EvidenceFinding) => CloudReadinessGrade | null;
}

const NO_LEVELS: LevelLookup = { status: 'error', of: () => null };

/** The order of a group's level summary: A → D, then not determined. */
const LEVEL_ORDER: readonly string[] = ['A', 'B', 'C', 'D', 'Unknown'];

/**
 * Open a kind's group under "Findings by kind" from outside the list — the
 * table chips of the answer's data-effect sentence. A DOM event rather than
 * shared state: the answer stands above this component, and the page keeps no
 * state library and no context (CLAUDE.md).
 */
const SHOW_KIND_EVENT = 'cc-analyze-show-kind';
export function showFindingsKind(kind: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(SHOW_KIND_EVENT, { detail: kind }));
}

/**
 * Open the source at a line from outside the list — the line chips of the
 * score hero above (ADR-093). The same DOM-event route as `showFindingsKind`;
 * where no source can be shown, the line is picked in the list instead.
 */
const OPEN_LINE_EVENT = 'cc-analyze-open-line';
export function openSourceLine(line: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<number>(OPEN_LINE_EVENT, { detail: line }));
}

/** What the side column's first card may do inside the list: open the source at a line, or a kind's group. */
export interface FindingsSideApi {
  /** Undefined when there is no source to show. */
  openLine?: (line: number) => void;
  showKind: (kind: string) => void;
}

function rowCells(r: FindingRow, level: CloudReadinessGrade | null, lookup: LevelLookup['status'], openSource?: (line: number) => void) {
  const ef = r.finding;
  // A finding that names no SAP object has no level whatever the lookup says
  // — a statement, or no object named — and the cell says which (owner, 11.10.2026).
  const noLevel = noLevelReason(ef);
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
    level: noLevel ? (
      <CcNoLevelExplained reason={noLevel} />
    ) : level ? (
      <CcCleanCoreLevelExplained value={level} />
    ) : lookup === 'ready' ? (
      // Named, looked up, and SAP's data holds no answer: not determined.
      <CcCleanCoreLevelExplained value="Unknown" />
    ) : (
      <span className="cc-text-meta text-cc-ink-muted" title={lookup === 'loading' ? 'Looking up the catalog' : 'The catalog lookup did not answer'}>
        —
      </span>
    ),
    successor: ef.sapReplacement?.objectName ? (
      <span className="cc-text-meta">
        <span className="font-cc-mono font-semibold text-cc-ink break-all">{ef.sapReplacement.objectName}</span>
        <span className="block text-cc-ink-muted">{successorSourceNote(ef.sapReplacement.confidence)}</span>
      </span>
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

/**
 * The anchor bar of the Analyze stage (ADR-091): `PageAnchorBar`, the one
 * in-page bar of every tool, with the sections `lib/page-anchors.ts` names.
 * The page draws it under the answer, outside this component, so it stays in
 * view through the two folds below the findings; the counts are read off the
 * same findings this component lists, by the same rules.
 */
export function AnalyzeAnchorBar({
  findings,
  sourceLines = 0,
  summary = false,
}: {
  findings: readonly EvidenceFinding[];
  sourceLines?: number;
  /** A model summary is on record. */
  summary?: boolean;
}) {
  const anchors = useMemo(() => {
    const rows = findingRows(findings);
    return analyzeAnchors({
      picks: lookHereFirst(rows).length,
      // The same condition as "Where in the program" below.
      where: programMap(rows, sourceLines).length > 0 && sourceLines > 0,
      findings: rows.length,
      summary,
    });
  }, [findings, sourceLines, summary]);
  return <PageAnchorBar anchors={anchors} label={PAGE_ANCHOR_LABELS.analyze} name="analyze-anchor" plural="analyze-anchors" />;
}

export default function EvidenceFindingsTable({
  findings,
  sourceLines = 0,
  source,
  levels = NO_LEVELS,
  steps = [],
  notAssessed = [],
  pointsOf,
  sideTop,
  sideBottom,
  fileName = 'source',
  sideTopLabel = 'Route',
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
  /**
   * What a kind of finding takes off the score — the hero's deductions, for the
   * Points column of Findings by kind (ADR-093). Absent where the deductions do
   * not add up to the signed score: then no column, rather than a second sum.
   */
  pointsOf?: (kind: string) => number;
  /** The route card, the first of the side column — a function when its line anchors open the source here. */
  sideTop?: React.ReactNode | ((api: FindingsSideApi) => React.ReactNode);
  /** What was not determined, the last of the side column. */
  sideBottom?: React.ReactNode;
  /** The source's file name, for the source panel's label. */
  fileName?: string;
  /** On a phone the route card is folded under this line — "Route · Side-by-Side" (ADR-093). */
  sideTopLabel?: string;
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
  // On a phone the full list and the route card are folded, each with its
  // count (ADR-093, the mockup's phone frame; §2.11 "show less, lose nothing").
  const phone = useBreakpointS();
  const [kindsOpen, setKindsOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);

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

  const scrollToList = (id: string) => {
    setKindsOpen(true);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  };

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

  // A table chip asks for its group; a line chip of the score hero for its line.
  const showKindRef = React.useRef(showKind);
  const openLineRef = React.useRef((line: number) => (canShowSource ? openSource(line) : showLineInList(line)));
  useEffect(() => {
    showKindRef.current = showKind;
    openLineRef.current = (line: number) => (canShowSource ? openSource(line) : showLineInList(line));
  });
  useEffect(() => {
    const onShow = (e: Event) => {
      const kind = (e as CustomEvent<string>).detail;
      if (typeof kind === 'string' && kind) showKindRef.current(kind);
    };
    const onLine = (e: Event) => {
      const line = (e as CustomEvent<number>).detail;
      if (typeof line === 'number' && line > 0) openLineRef.current(line);
    };
    window.addEventListener(SHOW_KIND_EVENT, onShow);
    window.addEventListener(OPEN_LINE_EVENT, onLine);
    return () => {
      window.removeEventListener(SHOW_KIND_EVENT, onShow);
      window.removeEventListener(OPEN_LINE_EVENT, onLine);
    };
  }, []);
  const showPoints = Boolean(pointsOf) && grouping === 'kind';
  const sideTopNode = typeof sideTop === 'function' ? sideTop({ openLine: canShowSource ? openSource : undefined, showKind }) : sideTop;

  return (
    <div data-analysis-findings="" className="min-w-0">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="flex min-w-0 flex-col gap-5">
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
            fold={phone ? { open: kindsOpen, onToggle: () => setKindsOpen((v) => !v) } : undefined}
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

                {showPoints ? (
                  // The column heads of the group rows (wide screens) — Points is the
                  // hero's deductions per kind, so the list adds up to the score.
                  <div
                    aria-hidden={true}
                    className="mt-3 hidden grid-cols-[1rem_minmax(0,1.4fr)_minmax(0,9rem)_minmax(0,7rem)_minmax(0,9rem)_3.5rem] gap-3 px-4 cc-text-label text-cc-ink-muted sm:grid"
                    data-findings-columns=""
                  >
                    <span />
                    <span>Kind</span>
                    <span>Severity</span>
                    <span>Levels</span>
                    <span>Successor named</span>
                    <span className="text-right">Points</span>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-col gap-2" data-findings-groups={shown.length}>
                  {shown.length === 0 ? (
                    <CcNoMatches onClear={clear} />
                  ) : (
                    shown.map((g) => {
                      const page = pageOf(g.matching, Boolean(expanded[g.kind]));
                      const hint = grouping === 'kind' ? groupHint(g) : '';
                      const succ = withSuccessor(g.matching);
                      // The group's levels, A → D and not determined, then the
                      // findings without a level by reason — never a bare "?".
                      const lvl = new Map<string, number>();
                      const noLevels = new Map<NoLevelReason['kind'], { reason: NoLevelReason; n: number }>();
                      for (const r of g.matching) {
                        const reason = noLevelReason(r.finding);
                        if (reason) {
                          noLevels.set(reason.kind, { reason, n: (noLevels.get(reason.kind)?.n ?? 0) + 1 });
                          continue;
                        }
                        const l = levels.of(r.finding) ?? 'Unknown';
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
                              className={clsx(
                                'grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left sm:px-4',
                                showPoints
                                  ? 'sm:grid-cols-[1rem_minmax(0,1.4fr)_minmax(0,9rem)_minmax(0,7rem)_minmax(0,9rem)_3.5rem]'
                                  : 'sm:grid-cols-[1rem_minmax(0,1.4fr)_minmax(0,9rem)_minmax(0,7rem)_minmax(0,9rem)]',
                              )}
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
                                  ? [...lvl.entries()].sort(([a], [b]) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b)).map(([l, n]) => (
                                      <span key={l} className="inline-flex items-center gap-1">
                                        {/* Bare on purpose: this summary sits inside the group's
                                            disclosure button, and a button cannot hold another.
                                            The rows below explain each level (roadmap 3.0.6). */}
                                        <CcCleanCoreLevel value={l as CloudReadinessGrade} />
                                        <span className="cc-text-meta text-cc-ink">{n}</span>
                                      </span>
                                    ))
                                  : null}
                                {[...noLevels.values()].map(({ reason, n }) => (
                                  // Not behind the lookup: having no level waits for none.
                                  // Bare here too; the rows below explain it on a tap.
                                  <span
                                    key={reason.kind}
                                    className="inline-flex items-center gap-1"
                                    data-findings-group-no-level={reason.kind}
                                    title={reason.title}
                                  >
                                    <span className="cc-text-meta font-medium text-cc-ink-muted">{reason.label}</span>
                                    <span className="sr-only">, no clean core level:</span>
                                    <span className="cc-text-meta text-cc-ink">{n}</span>
                                  </span>
                                ))}
                              </span>
                              <span className={clsx('cc-text-meta', succ ? 'text-cc-ink' : 'text-cc-ink-muted')}>
                                {succ}/{g.matching.length} with successor
                              </span>
                              {showPoints && pointsOf ? (
                                <span
                                  className="hidden text-right font-cc-mono cc-text-meta text-cc-ink tabular-nums sm:block"
                                  data-findings-group-points={pointsOf(g.kind)}
                                >
                                  <span className="sr-only">Score points: </span>
                                  {pointsOf(g.kind) > 0 ? `−${pointsOf(g.kind)}` : '0'}
                                </span>
                              ) : null}
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

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Route and what is open">
          {phone && sideTopNode ? (
            <div className="rounded-cc-card border border-cc-line bg-cc-surface shadow-cc" data-phone-fold="route">
              <h2 className="m-0">
                <button
                  type="button"
                  aria-expanded={routeOpen}
                  onClick={() => setRouteOpen((v) => !v)}
                  className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left cc-text-h2 text-cc-ink"
                >
                  <ChevronRight size={16} aria-hidden={true} className={clsx('text-cc-ink-muted motion-safe:transition-transform', routeOpen && 'rotate-90')} />
                  {sideTopLabel}
                </button>
              </h2>
              {routeOpen ? <div className="px-2 pb-2">{sideTopNode}</div> : null}
            </div>
          ) : (
            sideTopNode
          )}
          {sideBottom}
        </aside>
      </div>
    </div>
  );
}
