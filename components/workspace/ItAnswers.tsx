'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTable from '@/components/cc/Table';
import CcFilterBar from '@/components/cc/FilterBar';
import CcSelect from '@/components/cc/Select';
import CcSkeleton from '@/components/cc/Skeleton';
import CcDisclosure from '@/components/cc/Disclosure';
import { CcNoMatches } from '@/components/cc/EmptyState';
import { CcSeverity } from '@/components/cc/Identifier';
import { CcCleanCoreLevelExplained } from '@/components/cc/LevelExplained';
import { STATE_CLASSES } from '@/components/cc/state';
import { getAuth } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { normaliseSeverity } from '@/lib/severity';
import {
  itFindingsCountLabel,
  itvLevelCounts,
  itvLineLabel,
  itvNoLevelLabel,
  itvUsesCoverage,
  wt,
  type WorkspaceMessageKey,
} from '@/lib/workspace-messages';
import { useFitByPlatform } from '@/hooks/useFitByPlatform';
import type { Loaded } from '@/lib/management-overview';
import type { SemanticState } from '@/lib/provenance';
import type { Project } from '@/lib/types';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import type { NotDetermined } from '@/lib/workspace-model';
import type { RecordGap } from '@/lib/legacy-project';
import type { CoachMarkId } from '@/lib/coach-marks';
import {
  CHAIN_LABELS,
  chainOf,
  itFindingsView,
  type ChainLinkId,
  type ItFindingRow,
  type ItFindingsSource,
  type ItUseRow,
} from '@/lib/it-findings';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import {
  BUCKET_KEYS,
  catalogProfile,
  BUCKET_LABELS,
  NO_FILTERS,
  NOT_ASSIGNED,
  filterRows,
  filtersActive,
  kindBreakdown,
  kindLabelOf,
  whereTo,
  type BucketKey,
  type ItFilters,
  type WhereTo,
} from '@/lib/it-view';
import { itOpening, itState, kindWord, usesSummary } from '@/lib/it-state';
import ItRail from './ItRail';
import NotDeterminedCard from './NotDeterminedCard';

/**
 * The IT view — roadmap step 8.1, mockup v2.8 `s4`, reworked on 03.10.2026 after
 * the owner's review: *"so empty and nested, and hard to operate … the
 * explanation dialogs are far too far down."*
 *
 * **One honest state, then what the engine knows.** `lib/it-state.ts` decides
 * which of five states the project is in — no source, unread, unsigned, a
 * signed run without findings, a signed run with findings — and writes one
 * headline and one reason for it. Under it stand four figures in one strip,
 * the one next action (the shell's rule-based "Next step"), and then only the
 * sections that have content: what the code uses, the findings, and *Not
 * determined*. The dashed "No chain to follow" and "No findings on record"
 * boxes are gone: a project without findings says so in its headline, and
 * names what the code uses instead.
 *
 * **What the code uses** comes from the findings route (`uses`, derived in
 * `lib/it-findings-build.ts` from the same statement reader as the process
 * map): every function module, BAPI, transaction, report and table the code
 * calls, reads or writes, each with its lines and the clean core level the
 * target profile's catalog gives it. It is why a program that calls three
 * BAPIs no longer reads "0 places in the code".
 *
 * **Not determined is one number.** The figure, the list in this view and the
 * first look below all read `notDetermined(project)` — the engine's constructs
 * it does not judge. The 3.0 tile counted findings without a level instead,
 * under the same name, and showed 0 beside a list of 5.
 *
 * **The chain belongs to a chosen finding (ADR-029).** It sits above the
 * findings table, names its finding, the table marks that row, and the
 * coverage stands beside it. Unchanged; it only lost its card.
 *
 * **The findings are read from a route, not computed here** — the 4.3 MB
 * catalog stays on the server (`lib/first-look.ts`). `null` is not "none":
 * `undefined` while the read is in flight, `null` when it failed, an answer
 * when it answered. Nothing here is stored; the level is a view.
 */
export default function ItAnswers({
  projectId,
  findings,
  project = null,
  nextStep = null,
  notDetermined,
  recorded = [],
  signed = false,
  coach,
}: {
  projectId: string;
  /**
   * The answer of the findings route, when the caller already has it — the demo
   * workspace (roadmap 3.0.7) computes it on the server with the same
   * `findingsOf` the route runs, and has no project the route could read. When
   * given, nothing is fetched.
   */
  findings?: ItFindingsSource;
  /** The project, for its source, its target profile and its imports. `null` while it loads. */
  project?: Project | null;
  /** The rule-based "Next step" of the workspace — the one primary action, under the answer. */
  nextStep?: React.ReactNode;
  /**
   * The one *Not determined* of the page (`lib/workspace-model.ts`), the same
   * object the first look counts — so the figure, the list and "Your process"
   * cannot disagree.
   */
  notDetermined: NotDetermined;
  /** What a project stored by an earlier version does not carry (roadmap 3.0.2). */
  recorded?: readonly RecordGap[];
  /** A signed run is on record and readable; the demo, which carries none by design, passes `'demo'`. */
  signed?: boolean | 'demo';
  /** The coach mark for a place in this view — Not determined, in the answer at the top. */
  coach?: (slot: CoachMarkId) => React.ReactNode;
}) {
  /**
   * The answer together with the project it answers for. A client navigation
   * keeps this component mounted and changes `projectId`; an answer of the
   * previous project is then `undefined` (still asking), never its findings.
   */
  const [loaded, setLoaded] = useState<{ projectId: string; source: ItFindingsSource | null } | null>(null);
  const source: ItFindingsSource | null | undefined =
    findings ?? (loaded && loaded.projectId === projectId ? loaded.source : undefined);
  const hasSource =
    findings !== undefined || (typeof project?.legacyCode === 'string' && project.legacyCode.trim().length > 0);
  /** The reader's chosen finding. `null` means "the first one", never "none". */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The chain link the table is filtered by, or `null`. */
  const [filterLink, setFilterLink] = useState<ChainLinkId | null>(null);
  /** The filter bar (DESIGN.md §2.5) — live, no "Go". */
  const [filters, setFilters] = useState<ItFilters>(NO_FILTERS);
  /** Which halves of the catalog answer the table shows. */
  const [catalogView, setCatalogView] = useState<'both' | 'release' | 'classification'>('both');
  /** On a phone the filter bar folds behind one button, as the mockup's `s10` has it. */
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!projectId || findings || !hasSource) return;
    let cancelled = false;
    const setSource = (value: ItFindingsSource | null) => {
      if (!cancelled) setLoaded({ projectId, source: value });
    };
    (async () => {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) {
          setSource(null);
          return;
        }
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/findings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          // A refused read and a network fault look the same from here: nothing
          // is known about the findings, and the model says that rather than
          // drawing an empty table.
          setSource(null);
          return;
        }
        setSource((await res.json()) as ItFindingsSource);
      } catch {
        setSource(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, findings, hasSource]);

  /** The findings, worst level first and then by line — the order the table reads (mockup `s4`: "Level, then line"). */
  const ordered = useMemo<ItFindingsSource | null>(
    () => (source ? { ...source, rows: [...source.rows].sort(byLevelThenLine) } : null),
    [source],
  );
  const view = useMemo(() => itFindingsView(ordered, selectedId), [ordered, selectedId]);
  const kinds = useMemo(() => kindBreakdown(view.rows), [view.rows]);
  const uses = useMemo(() => usesSummary(source?.uses), [source]);

  const state = project === null && findings === undefined ? undefined : itState({ source, hasSource, signed });
  const opening = useMemo(
    () => (state ? itOpening(state, source ?? null, notDetermined.noSource ? 0 : notDetermined.count) : null),
    [state, source, notDetermined],
  );

  /**
   * Where the objects go — the four buckets under the project's target
   * profile, the same derivation Management reads. Loading until both the
   * findings and the catalog lookup have answered; never a bucket on a guess.
   */
  const findingsRead = useMemo<Loaded<ItFindingsSource>>(
    () =>
      source === undefined
        ? { state: 'loading' }
        : source === null
          ? { state: 'absent', reason: wt('it.noFindingsUnreadable') }
          : { state: 'ready', value: source },
    [source],
  );
  const fit = useFitByPlatform(findingsRead, project, wt('mgmt.lookupFailed'));
  const where: WhereTo | null = useMemo(() => (fit.state === 'ready' ? whereTo(fit.value) : null), [fit]);

  /**
   * The target profile the levels were read under: edition and release as the
   * lookups name them (`catalogLookupTargetOf`), the snapshot as the findings
   * route answered it. Without a project nothing is declared, and it says so.
   */
  const profile = useMemo(
    () =>
      catalogProfile(
        project ? catalogLookupTargetOf(project) : { edition: 'public', release: '' },
        Boolean(project?.s4Deployment),
        source?.catalog ?? null,
      ),
    [project, source],
  );

  const chain = view.chain;

  /**
   * The rows the table shows: the filter bar first, then — when a chain link
   * is chosen — the findings whose chain says the same thing at that link.
   */
  const filtered = useMemo(() => {
    const barred = filterRows(view.rows, filters, where);
    if (!filterLink || !chain) return barred;
    const mine = chain.links.find((link) => link.id === filterLink);
    if (!mine) return barred;
    return barred.filter(
      (row) => (chainOf(row).links.find((link) => link.id === filterLink)?.value ?? null) === mine.value,
    );
  }, [filters, where, filterLink, chain, view.rows]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
  }, []);
  const onSearch = useCallback((search: string) => setFilters((f) => ({ ...f, search })), []);
  const clearAll = useCallback(() => {
    setFilters(NO_FILTERS);
    setFilterLink(null);
  }, []);
  const showNoLevel = useCallback(() => {
    setFilters({ ...NO_FILTERS, level: 'none' });
    setFilterLink(null);
    setFiltersOpen(true);
    document.getElementById('it-findings')?.scrollIntoView({ block: 'start' });
  }, []);

  if (!state || !opening || (state !== 'no-source' && source === undefined)) {
    return (
      <div data-it-view="loading" className="py-4">
        <CcSkeleton shape="cards" count={4} label={wt('it.findings')} />
        <span className="sr-only" role="status">
          {wt('it.reading')}
        </span>
      </div>
    );
  }

  const read = source ?? null;
  const showContent = state !== 'no-source' && read !== null;
  const noLevel = view.rows.filter((row) => row.level === null).length;
  const columns = COLUMNS.filter(
    (c) =>
      (c.key !== 'release' || catalogView !== 'classification') &&
      (c.key !== 'classification' || catalogView !== 'release'),
  );
  const barActive = filtersActive(filters) || filterLink !== null;
  const ndCount = notDetermined.noSource ? null : notDetermined.count;

  return (
    <section data-it-view="" data-it-state={state} aria-labelledby="it-answers-heading" className="cc">
      {/* The tour's second mark points at the Not determined figure in the
          answer; the first stands at "Next step" right under it. */}
      {coach ? coach('not-determined') : null}

      {/* The answer, first (ADR-029): one state, one headline, one reason. */}
      <div data-it-answer="" className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
        <h2 id="it-answers-heading" data-it-headline="" className="m-0 cc-text-h2 text-cc-ink">
          {opening.title}
        </h2>
        <p data-it-reason="" className="m-0 mt-2 max-w-4xl text-[13px] leading-snug font-medium text-cc-ink">
          {opening.reason}
        </p>
        {view.rows.length > 0 ? (
          <p data-it-where-to="" className="m-0 mt-2 max-w-4xl text-[13px] leading-snug font-medium text-cc-ink-muted">
            <span className="font-semibold text-cc-ink">{wt('it.whereTo')}: </span>
            {where ? where.sentence : fit.state === 'absent' ? fit.reason : wt('it.whereToReading')}
          </p>
        ) : null}

        {showContent ? (
          <ul
            data-it-facts=""
            className="m-0 mt-4 grid list-none grid-cols-2 gap-px overflow-hidden rounded-cc-row border border-cc-line bg-cc-line p-0 lg:grid-cols-4"
          >
            <Fact
              id="uses"
              label={wt('itv.factUses')}
              // One per object and use — the rows of the table below, and the sum of the three counts beside it.
              value={uses && read ? String(read.uses?.length ?? 0) : null}
              coverage={uses ? itvUsesCoverage(uses.calls, uses.reads, uses.writes, uses.others) : wt('itv.usesNotRecorded')}
              provenance={uses ? 'reconstructed' : 'not-determined'}
              href="#it-uses"
            />
            <Fact
              id="findings"
              label={wt('itv.factFindings')}
              value={String(view.rows.length)}
              coverage={view.rows.length > 0 ? view.figures[0].coverage.sentence : wt('itv.findingsNone')}
              provenance="reconstructed"
              href={view.rows.length > 0 ? '#it-findings' : undefined}
            />
            <Fact
              id="level"
              label={wt('itv.factLevels')}
              value={uses ? (uses.levels.length > 0 ? itvLevelCounts(uses.levels) : wt('itv.levelsNone')) : null}
              small
              picture={
                uses && uses.levels.length > 0 ? (
                  <span data-it-level-bar="" className="mt-1 flex w-full min-w-0 flex-wrap gap-1">
                    {uses.levels.map((slice) => (
                      <span
                        key={slice.grade}
                        data-it-level-slice={slice.grade}
                        style={{ flexGrow: slice.count }}
                        className={cn(
                          'min-h-6 rounded-cc-row border px-1 text-[12px] font-semibold whitespace-nowrap',
                          STATE_CLASSES[gradeState(slice.grade)].bg,
                          STATE_CLASSES[gradeState(slice.grade)].border,
                          STATE_CLASSES[gradeState(slice.grade)].text,
                        )}
                      >
                        <CcCleanCoreLevelExplained value={slice.grade} trigger={`${slice.grade} ${slice.count}`} />
                      </span>
                    ))}
                  </span>
                ) : undefined
              }
              coverage={wt('itv.levelsCoverage')}
              provenance={uses && uses.levels.length > 0 ? 'imported' : 'not-determined'}
              href={uses && uses.objects > 0 ? '#it-uses' : undefined}
            />
            <Fact
              id="not-determined"
              label={wt('itv.factNotDetermined')}
              value={ndCount === null ? null : String(ndCount)}
              coverage={ndCount && ndCount > 0 ? wt('itv.ndCoverage') : wt('itv.ndNone')}
              provenance="not-determined"
              href="#not-determined"
              coachTarget="not-determined"
            />
          </ul>
        ) : null}
      </div>

      {/* The one next action — the shell's rule-based "Next step" (§2.3 item 5). */}
      {nextStep}

      {showContent ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            <UsesCard uses={read.uses} summary={uses} catalogNote={profile.note} />

            {view.rows.length > 0 ? (
              <div id="it-findings" className="scroll-mt-4">
                <CcCard
                  title={wt('itv.findingsTitle')}
                  count={view.rows.length}
                  actions={
                    <>
                      <span className="sm:hidden">
                        <CcButton
                          onClick={() => setFiltersOpen((v) => !v)}
                          aria-expanded={filtersOpen}
                          aria-controls="it-filter-bar"
                          icon={<SlidersHorizontal size={14} aria-hidden={true} />}
                          data-it-filter-toggle=""
                        >
                          {wt('it.filter')}
                        </CcButton>
                      </span>
                      {filterLink ? (
                        <CcButton onClick={() => setFilterLink(null)} data-it-clear-filter="">
                          {wt('it.clearFilter')}
                        </CcButton>
                      ) : null}
                    </>
                  }
                >
                  <p data-it-lead="findings" className="m-0 mb-3 text-[13px] leading-snug font-medium text-cc-ink-muted">
                    {wt('itv.findingsLead')}
                  </p>

                  {/* The chain — above the table, for the chosen finding, with
                      its coverage beside it (ADR-029). Flat: no card in the card. */}
                  {chain ? (
                    <div data-it-chain="" className="mb-4 border-y border-cc-line py-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h4 data-it-chain-title="" className="m-0 text-[13px] font-bold text-cc-ink">
                          {view.chainTitle}
                        </h4>
                        <span data-it-chain-coverage="" className="text-[12px] font-medium text-cc-ink-muted">
                          {view.chainCoverage.sentence}
                        </span>
                      </div>
                      <ol className="m-0 mt-2 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
                        {chain.links.map((link) => (
                          <li
                            key={link.id}
                            data-it-chain-link={link.id}
                            data-it-chain-link-determined={link.value === null ? 'no' : 'yes'}
                            className={cn(
                              'rounded-cc-row border bg-cc-surface-muted px-3 py-2',
                              filterLink === link.id ? 'border-cc-ink' : 'border-cc-line',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => setFilterLink(filterLink === link.id ? null : link.id)}
                              aria-pressed={filterLink === link.id}
                              className="block w-full min-h-6 text-left text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase"
                            >
                              {link.label}
                            </button>
                            {link.value === null ? (
                              <span data-it-chain-absent="" className="mt-1 block text-[13px] font-semibold text-cc-ink-muted">
                                {wt('it.notDetermined')}
                              </span>
                            ) : (
                              <span data-it-chain-value="" className="mt-1 block text-[13px] font-bold break-words text-cc-ink">
                                {link.value}
                              </span>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {link.anchor ? <CcAnchor tone="unlinked">{link.anchor}</CcAnchor> : null}
                              <CcProvenanceChip value={link.provenance} />
                            </div>
                            {/* The reason a link stopped is the trust reason and
                                stays visible; what a determined link adds is one
                                level deeper. */}
                            {link.value === null ? (
                              <p data-it-chain-reason="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                                {link.reason}
                              </p>
                            ) : (
                              <details className="mt-1">
                                <summary className="min-h-6 cursor-pointer text-[12px] font-semibold text-cc-ink">
                                  {wt('it.linkDetail')}
                                </summary>
                                <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{link.detail}</p>
                              </details>
                            )}
                          </li>
                        ))}
                      </ol>
                      <p data-it-requirement-note="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
                        {view.requirementNote}
                      </p>
                    </div>
                  ) : null}

                  {where ? (
                    <ul data-it-buckets="" className="m-0 mb-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
                      {where.counts.map((c) => (
                        <li key={c.bucket}>
                          <button
                            type="button"
                            data-it-bucket={c.bucket}
                            onClick={() => setFilters({ ...NO_FILTERS, bucket: c.bucket })}
                            className={cn(
                              'min-h-6 text-left text-[12px] leading-snug font-medium underline-offset-2 hover:underline',
                              c.bucket === NOT_ASSIGNED ? 'text-cc-ink-muted' : 'text-cc-ink',
                            )}
                          >
                            <span className="font-bold">{c.count}</span> {c.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div id="it-filter-bar" data-it-filter-bar="" className={cn('mb-3 sm:block', filtersOpen ? 'block' : 'hidden')}>
                    <CcFilterBar
                      noun={wt('it.places')}
                      shown={filtered.length}
                      total={view.rows.length}
                      search={filters.search}
                      onSearch={onSearch}
                      active={barActive}
                      onClear={clearAll}
                    >
                      <CcSelect<string>
                        label={wt('it.filterKind')}
                        value={filters.kind}
                        onChange={(kind) => setFilters((f) => ({ ...f, kind }))}
                        options={[
                          { value: '', label: wt('it.allKinds') },
                          ...kinds.map((k) => ({ value: k.kind, label: `${capitalise(k.label)} (${k.count})` })),
                        ]}
                      />
                      <CcSelect<ItFilters['level']>
                        label={wt('it.colLevel')}
                        value={filters.level}
                        onChange={(level) => setFilters((f) => ({ ...f, level }))}
                        options={[
                          { value: '', label: wt('it.allLevels') },
                          ...(['A', 'B', 'C', 'D', 'Unknown'] as const).map((g) => ({
                            value: g,
                            label: g === 'Unknown' ? wt('it.levelUnknown') : `${wt('it.levelPrefix')} ${g}`,
                          })),
                          { value: 'none', label: wt('it.levelNone') },
                        ]}
                      />
                      <CcSelect<'' | BucketKey>
                        label={where ? `${wt('it.filterTarget')} · ${where.platformLabel}` : wt('it.filterTarget')}
                        value={filters.bucket}
                        disabled={!where}
                        onChange={(bucket) => setFilters((f) => ({ ...f, bucket }))}
                        options={[
                          { value: '', label: wt('it.allTargets') },
                          ...BUCKET_KEYS.map((b) => ({ value: b, label: BUCKET_LABELS[b] })),
                        ]}
                      />
                      <CcSelect<'both' | 'release' | 'classification'>
                        label={wt('it.catalogView')}
                        value={catalogView}
                        onChange={setCatalogView}
                        options={[
                          { value: 'both', label: wt('it.bothViews') },
                          { value: 'release', label: wt('it.colRelease') },
                          { value: 'classification', label: wt('it.colClassification') },
                        ]}
                      />
                    </CcFilterBar>
                  </div>
                  {filtered.length === 0 ? (
                    <CcNoMatches onClear={clearAll} />
                  ) : (
                    <CcTable
                      caption={wt('it.tableCaption')}
                      columns={columns}
                      limit={5}
                      rows={filtered.map((row) => ({
                        key: row.id,
                        selected: chain?.findingId === row.id,
                        cells: findingCells(row, chain?.findingId === row.id, select, where),
                      }))}
                    />
                  )}
                  <p data-it-findings-count="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
                    {filterLink
                      ? itFindingsCountLabel(filtered.length, CHAIN_LABELS[filterLink].toLowerCase(), view.rows.length)
                      : wt('it.catalogViewsNote')}
                  </p>
                  {noLevel > 0 && filters.level !== 'none' ? (
                    <div className="mt-2">
                      <CcButton onClick={showNoLevel} data-it-show-no-level="">
                        {itvNoLevelLabel(noLevel)}
                      </CcButton>
                    </div>
                  ) : null}
                  <p data-it-level-coverage="" className="m-0 mt-2 text-[11px] leading-snug font-medium text-cc-ink-muted">
                    {view.distribution.sentence} {view.distribution.coverage.sentence}
                  </p>
                  {where && where.byObject.size > 0 ? (
                    <div className="mt-2">
                      <CcDisclosure title={wt('it.whyEachObject')} count={where.byObject.size}>
                        <ul data-it-object-reasons="" className="m-0 list-none p-0">
                          {[...where.byObject.values()].map((a) => (
                            <li key={a.objectName} className="border-b border-cc-line py-2 last:border-b-0">
                              <span className="font-mono text-[12px] font-semibold text-cc-ink">{a.objectName}</span>{' '}
                              <span className="text-[12px] font-semibold text-cc-ink">
                                · {a.bucket ? BUCKET_LABELS[a.bucket] : BUCKET_LABELS[NOT_ASSIGNED]}
                              </span>
                              <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                                {a.evidence ?? a.reason?.detail ?? ''}
                                {a.reviewTask ? ` ${a.reviewTask}` : ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </CcDisclosure>
                    </div>
                  ) : null}
                </CcCard>
              </div>
            ) : null}

            {/* Not determined — in this view, not at the foot of the page: the
                same object the figure above and the first look count. */}
            <div id="not-determined" className="scroll-mt-4">
              <NotDeterminedCard data={notDetermined} recorded={recorded} lead={wt('itv.ndLead')} />
            </div>
          </div>

          <ItRail
            projectId={projectId}
            project={project}
            source={read}
            profile={profile}
            demo={findings !== undefined}
            fit={fit}
          />
        </div>
      ) : null}
    </section>
  );
}

/** Worst level first (D, C, B, A, Unknown, none), then the line. */
function byLevelThenLine(a: ItFindingRow, b: ItFindingRow): number {
  const rank = (g: CloudReadinessGrade | null) => (g === null ? 5 : { D: 0, C: 1, B: 2, A: 3, Unknown: 4 }[g]);
  return rank(a.level) - rank(b.level) || a.lineStart - b.lineStart;
}

const USE_WORDS: Record<ItUseRow['use'], WorkspaceMessageKey> = {
  call: 'itv.useCall',
  read: 'itv.useRead',
  write: 'itv.useWrite',
  use: 'itv.useUse',
};

const BASIS_WORDS: Record<string, WorkspaceMessageKey> = {
  catalog: 'itv.basisCatalog',
  'catalog-residual': 'itv.basisResidual',
  'own-object': 'itv.basisOwn',
  finding: 'itv.basisFinding',
  heuristic: 'itv.basisHeuristic',
};

const USE_COLUMNS = [
  { key: 'object', label: wt('itv.colObject') },
  { key: 'use', label: wt('itv.colUse') },
  { key: 'lines', label: wt('itv.colLines') },
  { key: 'level', label: wt('itv.colLevel') },
  { key: 'catalog', label: wt('itv.colCatalog') },
  { key: 'finding', label: wt('itv.colFinding') },
] as const;

/**
 * What the code uses — one row per object and use, with its lines and the
 * level the target profile's catalog gives it. The first sentence says what the
 * list is and what a level is not, and is never folded away.
 */
function UsesCard({
  uses,
  summary,
  catalogNote,
}: {
  uses: ItUseRow[] | undefined;
  summary: ReturnType<typeof usesSummary>;
  /** Which snapshot of SAP's catalog the levels come from (`catalogProfile`). */
  catalogNote: string;
}) {
  return (
    <div id="it-uses" className="scroll-mt-4">
      <CcCard title={wt('itv.usesTitle')} count={uses ? uses.length : undefined}>
        <p data-it-lead="uses" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
          {wt('itv.usesLead')}
        </p>
        {!uses || !summary ? (
          <p data-it-uses-state="not-recorded" className="m-0 mt-2 text-[13px] leading-snug font-medium text-cc-ink">
            {wt('itv.usesNotRecorded')}
          </p>
        ) : uses.length === 0 ? (
          <p data-it-uses-state="none" className="m-0 mt-2 text-[13px] leading-snug font-medium text-cc-ink">
            {summary.sentence}
          </p>
        ) : (
          <div data-it-uses="" className="mt-3">
            <CcTable
              caption={wt('itv.usesCaption')}
              columns={USE_COLUMNS}
              limit={5}
              rows={uses.map((u) => ({
                key: `${u.object}@${u.use}`,
                cells: {
                  object: (
                    <span className="block" data-it-use={u.object} data-it-use-kind={u.kind}>
                      <span className="block font-mono text-[13px] font-semibold break-all text-cc-ink">{u.object}</span>
                      <span className="block text-[11px] font-medium text-cc-ink-muted">
                        {kindWord(u.kind)}
                        {u.custom ? ` · ${wt('itv.custom')}` : ''}
                        {u.remote ? ` · ${wt('itv.remote')}` : ''}
                      </span>
                    </span>
                  ),
                  use: <span className="text-[12px] font-semibold text-cc-ink">{wt(USE_WORDS[u.use])}</span>,
                  lines: (
                    <span className="flex flex-wrap gap-1" data-it-use-lines={u.object}>
                      {u.lines.slice(0, 4).map((line) => (
                        <CcAnchor key={line} tone="unlinked" label={itvLineLabel(u.object, line)}>
                          L{line}
                        </CcAnchor>
                      ))}
                      {u.lines.length > 4 ? (
                        <span className="text-[11px] font-medium text-cc-ink-muted">+{u.lines.length - 4}</span>
                      ) : null}
                    </span>
                  ),
                  level:
                    u.level === null ? (
                      <span className="text-[12px] font-medium text-cc-ink-muted">{wt('itv.levelNotAsked')}</span>
                    ) : (
                      <span className="block" data-it-use-level={u.object}>
                        <CcCleanCoreLevelExplained value={u.level} />
                        {u.levelBasis && BASIS_WORDS[u.levelBasis] ? (
                          <span className="mt-1 block text-[11px] font-medium text-cc-ink-muted">
                            {wt(BASIS_WORDS[u.levelBasis])}
                          </span>
                        ) : null}
                      </span>
                    ),
                  catalog: (
                    <span className="block text-[12px] font-medium text-cc-ink-muted">
                      {[u.releaseView, u.classificationView].filter(Boolean).join(' · ') || wt('itv.levelNotAsked')}
                    </span>
                  ),
                  finding: (
                    <span className="text-[12px] font-medium text-cc-ink-muted">
                      {u.findingIds.length > 0 ? u.findingIds.join(', ') : wt('itv.noFinding')}
                    </span>
                  ),
                },
              }))}
            />
            <p data-it-catalog-note="" className="m-0 mt-2 text-[11px] leading-snug font-medium text-cc-ink-muted">
              {catalogNote}
            </p>
          </div>
        )}
      </CcCard>
    </div>
  );
}

/**
 * One figure of the strip under the answer — a micro-label, the value (or *Not
 * determined*), and its coverage. A jump to the section that holds the detail,
 * by keyboard and by tap: no figure explains itself on hover only.
 */
function Fact({
  id,
  label,
  value,
  coverage,
  provenance,
  href,
  small = false,
  picture,
  coachTarget,
}: {
  id: string;
  label: string;
  value: string | null;
  coverage: string;
  provenance: React.ComponentProps<typeof CcProvenanceChip>['value'];
  href?: string;
  /** The value is a line of text (the level counts), not one number. */
  small?: boolean;
  /** The value drawn rather than written — the level counts as marks, each printing its letter and count. */
  picture?: React.ReactNode;
  coachTarget?: CoachMarkId;
}) {
  return (
    <li data-it-figure={id} data-coach-target={coachTarget} className="flex min-w-0 flex-col bg-cc-surface px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span data-coach-point="" className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
          {label}
        </span>
        <CcProvenanceChip value={provenance} />
      </div>
      {value === null ? (
        <span data-figure-absent="" className="mt-1 text-[13px] font-semibold text-cc-ink-muted">
          {wt('itv.factNotRecorded')}
        </span>
      ) : picture ? (
        // Not `role="img"` any more: each mark is a button that explains its
        // level (owner 06.10.2026), and an image hides the buttons inside it.
        // Every mark prints its letter and count, so the text is still there.
        <span data-figure-value="" className="block">
          {picture}
        </span>
      ) : (
        <span
          data-figure-value=""
          className={cn('mt-1 text-cc-ink', small ? 'text-[15px] leading-snug font-bold' : 'cc-text-figure leading-none')}
        >
          {value}
        </span>
      )}
      <p data-figure-coverage="" className="m-0 mt-auto pt-2 text-[11px] leading-snug font-medium text-cc-ink-muted">
        {coverage}
        {href ? (
          <>
            {' · '}
            {/* A button, not a `#hash` link: the hash is the layer's (ADR-018). */}
            <button
              type="button"
              onClick={() => document.getElementById(href.replace(/^#/, ''))?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
              className="inline-flex min-h-6 items-center font-semibold text-cc-ink underline underline-offset-2 pointer-coarse:min-h-11"
              data-it-figure-jump={id}
            >
              {wt('itv.factShow')}
            </button>
          </>
        ) : null}
      </p>
    </li>
  );
}


const COLUMNS = [
  { key: 'object', label: wt('it.colObject') },
  { key: 'line', label: wt('it.colLine'), numeric: true },
  { key: 'release', label: wt('it.colRelease') },
  { key: 'classification', label: wt('it.colClassification') },
  { key: 'level', label: wt('it.colLevel') },
  { key: 'successor', label: wt('it.colSuccessor') },
  { key: 'target', label: wt('it.colTarget') },
] as const;


const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function findingCells(
  row: ItFindingRow,
  selected: boolean,
  select: (id: string) => void,
  where: WhereTo | null,
): Record<string, React.ReactNode> {
  return {
    object: (
      <button
        type="button"
        onClick={() => select(row.id)}
        aria-pressed={selected}
        data-it-finding={row.id}
        data-it-finding-selected={selected ? 'yes' : 'no'}
        className="block min-h-6 text-left text-[13px] font-semibold break-all text-cc-ink"
      >
        {row.objectName ?? row.title}
        <span className="mt-1 block text-[11px] font-medium break-normal text-cc-ink-muted">
          {row.id} · <Severity value={row.severity} /> · {kindLabelOf(row)}
          {row.routine ? ` · ${row.routine}` : ''}
        </span>
      </button>
    ),
    line: <CcAnchor tone="unlinked">L{row.lineStart}</CcAnchor>,
    release: <ViewCell value={row.releaseView} />,
    classification: <ViewCell value={row.classificationView} />,
    level:
      row.level === null ? (
        <span data-it-level-absent={row.id} className="text-[12px] font-medium text-cc-ink-muted">
          {wt('it.notDetermined')}
        </span>
      ) : (
        <span data-it-level={row.id}>
          <CcCleanCoreLevelExplained value={row.level} />
          {row.objectLevel && row.objectLevel !== row.level ? (
            <span data-it-object-level={row.id} className="mt-1 block text-[11px] font-medium text-cc-ink-muted">
              {row.objectLevel} {wt('it.levelOwn')}
            </span>
          ) : null}
        </span>
      ),
    successor: (
      <span className="text-[12px] font-medium break-all text-cc-ink-muted">{row.successor ?? wt('it.successorNone')}</span>
    ),
    target: row.objectName ? (
      <BucketCell name={row.objectName} where={where} fitState={where ? 'ready' : 'loading'} />
    ) : (
      <span className="text-[12px] font-medium text-cc-ink-muted">{wt('it.noObject')}</span>
    ),
  };
}

/** The bucket of one object on the target platform, as text — never a colour alone. */
function BucketCell({
  name,
  where,
  fitState,
}: {
  name: string;
  where: WhereTo | null;
  fitState: Loaded<unknown>['state'];
}) {
  if (!where) {
    return (
      <span className="text-[12px] font-medium text-cc-ink-muted">
        {fitState === 'absent' ? wt('it.notDetermined') : wt('it.reading')}
      </span>
    );
  }
  const a = where.byObject.get(name);
  const bucket: BucketKey = a?.bucket ?? NOT_ASSIGNED;
  return (
    <span
      data-it-target={bucket}
      className={cn('text-[12px] font-semibold', bucket === NOT_ASSIGNED ? 'text-cc-ink-muted' : 'text-cc-ink')}
    >
      {BUCKET_LABELS[bucket]}
    </span>
  );
}

/**
 * The level as one of the five semantic states of `DESIGN.md` §1.1.
 *
 * Written out rather than read from `ABCD_META`, whose `badge` holds raw palette
 * classes and is therefore not a colour of this namespace — see
 * `tests/cc-token-guard.spec.ts`, which reads this file as text and would fail on
 * one even in a comment. Unknown is `neutral`, which is the point: a level the
 * catalog could not place must not wear the red of a D.
 */
function gradeState(grade: CloudReadinessGrade): SemanticState {
  switch (grade) {
    // DESIGN.md §1.8 (and the Clean-Core-Level row of the fixed vocabularies):
    // A information, B neutral — never green, because the level is imported
    // from SAP's classification file, not proven. Same mapping as the level
    // marks of `ManagementOverview.tsx`.
    case 'A':
      return 'information';
    case 'B':
      return 'neutral';
    case 'C':
      return 'warning';
    case 'D':
      return 'error';
    default:
      return 'neutral';
  }
}

/**
 * The severity of a finding as the fixed identifier (DESIGN.md §2.7). A value
 * outside the five words is *not determined*, never a guessed severity.
 */
function Severity({ value }: { value: unknown }) {
  const sev = normaliseSeverity(value);
  return sev ? <CcSeverity value={sev} /> : <>{wt('it.severityNotDetermined')}</>;
}

/** One half of the catalog answer, or the statement that it was never asked. */
function ViewCell({ value }: { value: string | null }) {
  return value === null ? (
    <span className="text-[12px] font-medium text-cc-ink-muted">{wt('it.viewNotAsked')}</span>
  ) : (
    <span className="text-[12px] font-medium text-cc-ink">{value}</span>
  );
}
