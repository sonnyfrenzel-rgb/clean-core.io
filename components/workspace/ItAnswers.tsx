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
import { CcEmptyState, CcNoMatches } from '@/components/cc/EmptyState';
import { CcCleanCoreLevel, CcSeverity } from '@/components/cc/Identifier';
import { STATE_CLASSES } from '@/components/cc/state';
import { getAuth } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { normaliseSeverity } from '@/lib/severity';
import { itAnchorLabel, itFindingsCountLabel, wt } from '@/lib/workspace-messages';
import { useFitByPlatform } from '@/hooks/useFitByPlatform';
import type { Loaded } from '@/lib/management-overview';
import type { SemanticState } from '@/lib/provenance';
import type { Project } from '@/lib/types';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import {
  CHAIN_LABELS,
  chainOf,
  itFindingsView,
  IT_QUESTION,
  type ChainLinkId,
  type ItFindingRow,
  type ItFindingsSource,
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
  isItRight,
  itAnswerHead,
  kindBreakdown,
  kindLabelOf,
  objectsOf,
  whereTo,
  type BucketKey,
  type ItFilters,
  type WhereTo,
} from '@/lib/it-view';
import ItRail from './ItRail';

/**
 * The IT view — roadmap step 8.1, rebuilt to mockup v2.8 `s4` (gap audit row 6).
 *
 * The order is the view's question, *„What exactly, where to, and is it
 * right?"*, answered top down: the answer line and the facet tiles, the next
 * step, the chain of the chosen finding, then the findings with a live filter
 * bar beside a side column holding the target profile, the route and the
 * imports. The clean core level per SAP object and every reason stand one
 * level deeper — a table and a disclosure — never removed.
 *
 * Everything this component says is derived in `lib/it-findings.ts` and
 * `lib/it-view.ts`; it adds no sentence of its own, and the two things it would
 * be most tempting to invent — a clean core level for a finding that names no
 * object, and a chain that looks complete because the missing link was left
 * out — it cannot, because the model hands it `null` and the reason instead.
 *
 * **ADR-029 is the shape of the chain.** The chain sits *above* the table, it
 * names the finding it belongs to, the table marks that finding's row, and the
 * coverage — *„Chain complete for 31 of 42 findings"* — stands beside the chain
 * rather than in a popover. A click on a link filters the table to the findings
 * whose chain says the same thing at that link.
 *
 * **The findings are read from a route, not computed here.** `buildAbapEvidence`
 * reaches the 4.3 MB merged SAP catalog, and `lib/first-look.ts` states the rule
 * this follows: the workspace route does not ship a catalog to a browser to
 * recompute an answer the server can give. `GET /api/projects/{id}/findings` runs
 * the same deterministic pass the signed run makes, under the project's target
 * profile (roadmap 7.10), and answers with the rows and the snapshot it read.
 * The buckets of "where to" come from `/api/abcd-classify` through
 * `useFitByPlatform`, named with the same target.
 *
 * **`null` is not "none".** Three states, as in `ManagementAnswers`: `undefined`
 * while the read is in flight, `null` when it failed or was refused, an array
 * when it answered. A screen that says "no findings" while it is still asking is
 * the same fabrication as one that shows a zero for something it did not measure.
 */
export default function ItAnswers({
  projectId,
  findings,
  project = null,
  nextStep = null,
}: {
  projectId: string;
  /**
   * The answer of the findings route, when the caller already has it — the demo
   * workspace (roadmap 3.0.7) computes it on the server with the same
   * `findingsOf` the route runs, and has no project the route could read. When
   * given, nothing is fetched.
   */
  findings?: ItFindingsSource;
  /** The project, for its target profile and its imports. `null` while it loads. */
  project?: Project | null;
  /**
   * The rule-based "Next step" card of the workspace, placed under the answer
   * as mockup `s4` has it — rendered by the shell, never decided here.
   */
  nextStep?: React.ReactNode;
}) {
  /**
   * The answer together with the project it answers for. A client navigation
   * keeps this component mounted and changes `projectId`; an answer of the
   * previous project is then `undefined` (still asking), never its findings.
   */
  const [loaded, setLoaded] = useState<{ projectId: string; source: ItFindingsSource | null } | null>(null);
  const source: ItFindingsSource | null | undefined =
    findings ?? (loaded && loaded.projectId === projectId ? loaded.source : undefined);
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
    if (!projectId || findings) return;
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
          // A refused read, a project with no source and a network fault look
          // the same from here: nothing is known about the findings, and the
          // model says that rather than drawing an empty table.
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
  }, [projectId, findings]);

  const view = useMemo(() => itFindingsView(source ?? null, selectedId), [source, selectedId]);
  const head = useMemo(() => itAnswerHead(source ?? null), [source]);
  const kinds = useMemo(() => kindBreakdown(view.rows), [view.rows]);
  const objects = useMemo(() => objectsOf(view.rows), [view.rows]);

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
  const showNotDetermined = useCallback(() => {
    setFilters({ ...NO_FILTERS, level: 'none' });
    setFilterLink(null);
    setFiltersOpen(true);
    document.getElementById('it-findings')?.scrollIntoView({ block: 'start' });
  }, []);

  if (source === undefined) {
    return (
      <div data-it-view="loading" className="py-4">
        <CcSkeleton shape="cards" count={4} label={wt('it.findings')} />
        <span className="sr-only" role="status">
          {wt('it.reading')}
        </span>
      </div>
    );
  }

  const noObject = view.rows.filter((row) => row.level === null).length;
  const columns = COLUMNS.filter(
    (c) =>
      (c.key !== 'release' || catalogView !== 'classification') &&
      (c.key !== 'classification' || catalogView !== 'release'),
  );
  const barActive = filtersActive(filters) || filterLink !== null;

  return (
    <section data-it-view="" aria-labelledby="it-answers-heading" className="cc">
      {/* The answer, first (ADR-029): what exactly, where to, and is it right. */}
      <div data-it-answer="" className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
        <p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{IT_QUESTION}</p>
        <h2 id="it-answers-heading" data-it-headline="" className="m-0 mt-1 cc-text-h2 text-cc-ink">
          {head.title}
        </h2>
        <p data-it-answer-coverage="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
          {head.coverage}
        </p>
        <dl className="m-0 mt-3 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
          <dt className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
            {wt('it.whereTo')}
          </dt>
          <dd data-it-where-to="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
            {where
              ? where.sentence
              : fit.state === 'absent'
                ? fit.reason
                : wt('it.whereToReading')}
          </dd>
          <dt className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
            {wt('it.isItRight')}
          </dt>
          <dd data-it-is-right="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
            {isItRight(view)}
          </dd>
        </dl>
      </div>

      {/* The facet tiles — mockup `s4`'s row of four, each with its coverage. */}
      <ul className="m-0 mt-4 grid grid-flow-row-dense list-none grid-cols-2 gap-2 p-0 lg:grid-cols-4">
        <Facet
          id="findings"
          label={wt('it.facetFindings')}
          value={view.unreadable ? null : String(view.rows.length)}
          absent={view.figures[0].absentReason}
          provenance={view.figures[0].provenance}
          coverage={view.figures[0].coverage.sentence}
        >
          {kinds.length > 0 ? (
            <ul data-it-kinds="" className="m-0 mt-1 hidden list-none p-0 sm:block">
              {kinds.slice(0, 3).map((k) => (
                <li key={k.kind} className="text-[12px] leading-snug font-medium text-cc-ink">
                  <button
                    type="button"
                    onClick={() => setFilters({ ...NO_FILTERS, kind: k.kind })}
                    className="min-h-6 text-left underline-offset-2 hover:underline"
                    data-it-kind={k.kind}
                  >
                    {k.count} {k.label}
                  </button>
                </li>
              ))}
              {kinds.length > 3 ? (
                <li className="text-[12px] font-medium text-cc-ink-muted">
                  {wt('it.moreKindsLead')} {kinds.length - 3} {kinds.length - 3 === 1 ? wt('it.kind') : wt('it.kinds')}
                </li>
              ) : null}
            </ul>
          ) : null}
        </Facet>

        <Facet
          id="level"
          wide
          label={wt('it.facetLevels')}
          value={null}
          absent={view.distribution.graded === 0 ? view.distribution.sentence : undefined}
          provenance={view.figures[2].provenance}
          coverage={view.distribution.coverage.sentence}
          hideValue={view.distribution.graded > 0}
        >
          {view.distribution.graded > 0 ? (
            <div data-it-level-bar="" className="mt-1 flex w-full gap-1">
              {view.distribution.slices
                .filter((slice) => slice.count > 0)
                .map((slice) => (
                  <button
                    type="button"
                    key={slice.grade}
                    data-it-level-slice={slice.grade}
                    onClick={() => setFilters({ ...NO_FILTERS, level: slice.grade })}
                    aria-label={`${wt('it.colLevel')} ${slice.grade}: ${slice.count}`}
                    style={{ flexGrow: slice.count }}
                    className={cn(
                      'min-h-6 rounded-cc-row border px-1 text-left text-[12px] font-semibold whitespace-nowrap',
                      STATE_CLASSES[gradeState(slice.grade)].bg,
                      STATE_CLASSES[gradeState(slice.grade)].border,
                      STATE_CLASSES[gradeState(slice.grade)].text,
                    )}
                  >
                    {slice.grade} {slice.count}
                  </button>
                ))}
            </div>
          ) : null}
        </Facet>

        <Facet
          id="target"
          wide
          label={where ? `${wt('it.facetTarget')} · ${where.platformLabel}` : wt('it.facetTarget')}
          value={null}
          hideValue={where !== null}
          absent={
            where
              ? undefined
              : fit.state === 'absent'
                ? fit.reason
                : wt('it.whereToReading')
          }
          provenance={where ? 'imported' : 'not-determined'}
          coverage={
            where
              ? `${where.byObject.size} ${where.byObject.size === 1 ? wt('it.objectSingular') : wt('it.objectPlural')} · ${
                  where.declared ? wt('it.targetDeclared') : wt('it.targetDefault')
                }`
              : wt('it.objectsNotPlaced')
          }
        >
          {where ? (
            <ul data-it-buckets="" className="m-0 mt-1 grid list-none grid-cols-2 gap-x-3 p-0">
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
        </Facet>

        <Facet
          id="not-determined"
          label={wt('it.notDetermined')}
          value={view.unreadable ? null : String(noObject)}
          absent={view.unreadable ? view.figures[0].absentReason : undefined}
          provenance="not-determined"
          coverage={`${noObject} ${wt('it.ofLower')} ${view.rows.length} ${wt('it.findings')}`}
        >
          <p className="m-0 mt-1 hidden text-[12px] leading-snug font-medium text-cc-ink-muted sm:block">{wt('it.noLevelReason')}</p>
          {noObject > 0 ? (
            <div className="mt-2">
              <CcButton onClick={showNotDetermined} data-it-show-not-determined="">
                {wt('it.showThem')}
              </CcButton>
            </div>
          ) : null}
        </Facet>
      </ul>

      {/* "Next step" — the shell's rule-based card, under the answer (§2.3 item 5). */}
      {nextStep}

      {/* The chain — above the table, for the chosen finding, with its coverage
          beside it (ADR-029). */}
      <div className="mt-4">
        <CcCard
          title={<span data-it-chain-title="">{view.chainTitle}</span>}
          meta={
            <span data-it-chain-coverage="" className="text-[11px] font-medium text-cc-ink-muted">
              {view.chainCoverage.sentence}
            </span>
          }
        >
          {chain ? (
            <>
              <p className="m-0 mb-3 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('it.chainHint')}</p>
              <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
                {chain.links.map((link) => (
                  <li
                    key={link.id}
                    data-it-chain-link={link.id}
                    data-it-chain-link-determined={link.value === null ? 'no' : 'yes'}
                    className={cn(
                      'rounded-cc-row border bg-cc-surface px-3 py-2',
                      filterLink === link.id ? 'border-cc-ink' : 'border-cc-field-border',
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
                    {/* The reason a link stopped is the trust reason and stays
                        visible; what a determined link adds is one level deeper. */}
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
              <p data-it-requirement-note="" className="m-0 mt-3 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {view.requirementNote}
              </p>
            </>
          ) : (
            <CcEmptyState title={wt('it.noChainTitle')}>
              <span data-it-chain-absent-reason="">
                {view.unreadable ? wt('it.noChainUnreadable') : wt('it.noChainEmpty')}
              </span>
            </CcEmptyState>
          )}
        </CcCard>
      </div>

      {/* Findings and the objects beside the side column — L: content + 360 px
          (DESIGN.md §2.9); M and S: one column, the side column underneath. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div id="it-findings" className="scroll-mt-4">
            <CcCard
              title={wt('it.findingsTitle')}
              count={view.rows.length}
              actions={
                <>
                  {view.rows.length > 0 ? (
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
                  ) : null}
                  {filterLink ? (
                    <CcButton onClick={() => setFilterLink(null)} data-it-clear-filter="">
                      {wt('it.clearFilter')}
                    </CcButton>
                  ) : null}
                </>
              }
            >
              {view.rows.length === 0 ? (
                <CcEmptyState title={wt('it.noFindingsTitle')}>
                  <span data-it-findings-absent-reason="">
                    {view.unreadable ? wt('it.noFindingsUnreadable') : wt('it.noFindingsEmpty')}
                  </span>
                </CcEmptyState>
              ) : (
                <>
                  <div id="it-filter-bar" data-it-filter-bar="" className={cn('mb-3 sm:block', filtersOpen ? 'block' : 'hidden')}>
                    <CcFilterBar
                      noun={wt('it.findings')}
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
                </>
              )}
            </CcCard>
          </div>

          {/* The clean core level per SAP object — the target profile's catalog,
              one row per object, the reasons for its bucket one level deeper. */}
          {objects.objects.length > 0 ? (
            <CcCard title={wt('it.objectsTitle')} count={objects.objects.length}>
              <p data-it-level-sentence="" className="m-0 mb-1 text-[13px] leading-snug font-medium text-cc-ink">
                {view.distribution.sentence}
              </p>
              <p data-it-level-coverage="" className="m-0 mb-3 text-[11px] leading-snug font-medium text-cc-ink-muted">
                {view.distribution.coverage.sentence}
              </p>
              <CcTable
                caption={wt('it.objectsCaption')}
                columns={OBJECT_COLUMNS}
                limit={8}
                rows={objects.objects.map((o) => ({
                  key: o.name,
                  cells: {
                    object: (
                      <span className="block">
                        <span className="block font-mono text-[13px] font-semibold break-all text-cc-ink">{o.name}</span>
                        {o.type ? (
                          <span className="block text-[11px] font-medium text-cc-ink-muted">{o.type}</span>
                        ) : null}
                      </span>
                    ),
                    lines: (
                      <span className="flex flex-wrap gap-1">
                        {o.findings.slice(0, 4).map((f) => (
                          <CcAnchor key={f.id} tone="unlinked" label={itAnchorLabel(f.id, f.line)}>
                            L{f.line}
                          </CcAnchor>
                        ))}
                        {o.findings.length > 4 ? (
                          <span className="text-[11px] font-medium text-cc-ink-muted">+{o.findings.length - 4}</span>
                        ) : null}
                      </span>
                    ),
                    level:
                      o.levels.length === 0 ? (
                        <span className="text-[12px] font-medium text-cc-ink-muted">{wt('it.notDetermined')}</span>
                      ) : (
                        <span className="flex flex-wrap gap-1" data-it-object-level={o.name}>
                          {o.levels.map((g) => (
                            <CcCleanCoreLevel key={g} value={g} />
                          ))}
                        </span>
                      ),
                    successor: (
                      <span className="text-[12px] font-medium break-all text-cc-ink-muted">
                        {o.successor ?? wt('it.successorNone')}
                      </span>
                    ),
                    target: <BucketCell name={o.name} where={where} fitState={fit.state} />,
                  },
                }))}
              />
              <p data-it-catalog-note="" className="m-0 mt-2 text-[11px] leading-snug font-medium text-cc-ink-muted">
                {profile.note}
              </p>
              {where ? (
                <div className="mt-3">
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
          ) : (
            <p data-it-level-coverage="" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
              {view.distribution.sentence} {view.distribution.coverage.sentence}
            </p>
          )}
        </div>

        <ItRail projectId={projectId} project={project} source={source} profile={profile} demo={findings !== undefined} />
      </div>
    </section>
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

const OBJECT_COLUMNS = [
  { key: 'object', label: wt('it.colSapObject') },
  { key: 'lines', label: wt('it.colLines') },
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
          <CcCleanCoreLevel value={row.level} />
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

/**
 * One facet tile — mockup `s4`'s `.facet`: a micro-label, the figure (or *Not
 * determined* with its reason), what it is worth and its coverage.
 */
function Facet({
  id,
  label,
  value,
  absent,
  provenance,
  coverage,
  hideValue = false,
  wide = false,
  children,
}: {
  id: string;
  /** Spans both columns on a phone — a bar or a list that needs the width. */
  wide?: boolean;
  label: string;
  value: string | null;
  absent?: string;
  provenance: React.ComponentProps<typeof CcProvenanceChip>['value'];
  coverage: string;
  /** The tile's figure is its picture (a bar, a list) rather than one number. */
  hideValue?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      data-it-figure={id}
      className={cn(
        'flex min-w-0 flex-col rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc',
        wide ? 'col-span-2 sm:col-span-1' : null,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{label}</span>
        <CcProvenanceChip value={provenance} />
      </div>
      {hideValue ? null : value === null ? (
        <span data-figure-absent="" className="mt-1 text-[13px] font-semibold text-cc-ink-muted">
          {wt('it.notDetermined')}
        </span>
      ) : (
        <span data-figure-value="" className="mt-1 cc-text-figure leading-none text-cc-ink">
          {value}
        </span>
      )}
      {absent ? (
        <p data-figure-absent-reason="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
          {absent}
        </p>
      ) : null}
      {children}
      <p data-figure-coverage="" className="m-0 mt-auto pt-2 text-[11px] leading-snug font-medium text-cc-ink-muted">
        {coverage}
      </p>
    </li>
  );
}
