'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTable from '@/components/cc/Table';
import { CcEmptyState } from '@/components/cc/EmptyState';
import { STATE_CLASSES } from '@/components/cc/state';
import { getAuth } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import type { SemanticState } from '@/lib/provenance';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import {
  chainOf,
  itFindingsView,
  type ChainLinkId,
  type ItFigure,
  type ItFindingsSource,
} from '@/lib/it-findings';

/**
 * The IT view's answers — roadmap step 8.1.
 *
 * Everything this component says is derived in `lib/it-findings.ts`; it adds no
 * sentence of its own, and the two things it would be most tempting to invent —
 * a clean core level for a finding that names no object, and a chain that looks
 * complete because the missing link was left out — it cannot, because the model
 * hands it `null` and the reason instead.
 *
 * **ADR-029 is the shape of this file.** The chain sits *above* the table, it
 * names the finding it belongs to, the table marks that finding's row, and the
 * coverage — *„Chain complete for 31 of 42 findings"* — stands beside the chain
 * rather than in a popover. A click on a link filters the table to the findings
 * whose chain says the same thing at that link, which is the other half of the
 * ADR's sentence and the reason the coverage has to be there: a filtered table
 * under a chain, without a figure saying how far the chain holds, is the defect
 * the ADR abolished.
 *
 * **The findings are read from a route, not computed here.** `buildAbapEvidence`
 * reaches the 4.3 MB merged SAP catalog, and `lib/first-look.ts` states the rule
 * this follows: the workspace route does not ship a catalog to a browser to
 * recompute an answer the server can give. `GET /api/projects/{id}/findings` runs
 * the same deterministic pass the signed run makes and answers with the rows.
 *
 * **`null` is not "none".** Three states, as in `ManagementAnswers`: `undefined`
 * while the read is in flight, `null` when it failed or was refused, an array
 * when it answered. A screen that says "no findings" while it is still asking is
 * the same fabrication as one that shows a zero for something it did not measure.
 */
export default function ItAnswers({ projectId }: { projectId: string }) {
  /**
   * The answer together with the project it answers for. A client navigation
   * keeps this component mounted and changes `projectId`; an answer of the
   * previous project is then `undefined` (still asking), never its findings.
   */
  const [loaded, setLoaded] = useState<{ projectId: string; source: ItFindingsSource | null } | null>(null);
  const source: ItFindingsSource | null | undefined =
    loaded && loaded.projectId === projectId ? loaded.source : undefined;
  /** The reader's chosen finding. `null` means "the first one", never "none". */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The chain link the table is filtered by, or `null`. */
  const [filterLink, setFilterLink] = useState<ChainLinkId | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!projectId) return;
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
  }, [projectId]);

  const view = useMemo(
    () => itFindingsView(source ?? null, selectedId),
    [source, selectedId],
  );

  const chain = view.chain;

  /**
   * The rows the table shows: everything, or the findings whose chain says the
   * same thing as the chosen one at the chosen link.
   *
   * A *Not determined* link filters too — the findings that also stop there —
   * because "which findings end where this one ends" is the question a reader
   * of an incomplete chain actually has.
   */
  const filtered = useMemo(() => {
    if (!filterLink || !chain) return view.rows;
    const mine = chain.links.find((link) => link.id === filterLink);
    if (!mine) return view.rows;
    return view.rows.filter(
      (row) => (chainOf(row).links.find((link) => link.id === filterLink)?.value ?? null) === mine.value,
    );
  }, [filterLink, chain, view.rows]);

  const FIRST = 5;
  const shown = showAll ? filtered : filtered.slice(0, FIRST);

  const select = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  if (source === undefined) {
    return (
      <div data-it-view="loading" role="status" className="py-8">
        <span className="sr-only">Reading the findings of this project…</span>
      </div>
    );
  }

  return (
    <section data-it-view="" aria-labelledby="it-answers-heading" className="cc">
      <h2
        id="it-answers-heading"
        data-it-headline=""
        className="m-0 text-[16px] leading-snug font-bold text-cc-ink"
      >
        {view.headline}
      </h2>
      <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {view.question} — this one program, read by the engine.
      </p>

      <ul className="m-0 mt-4 grid list-none gap-2 p-0 sm:grid-cols-3">
        {view.figures.map((figure) => (
          <Figure key={figure.key} figure={figure} />
        ))}
      </ul>

      {/* The chain — above the table, for the chosen finding, with its coverage
          beside it (ADR-029). */}
      <div className="mt-4">
        <CcCard
          title={<span data-it-chain-title="">{view.chainTitle}</span>}
          meta={
            <span
              data-it-chain-coverage=""
              className="text-[11px] font-medium text-cc-ink-muted"
            >
              {view.chainCoverage.sentence}
            </span>
          }
        >
          {chain ? (
            <>
              <p className="m-0 mb-2.5 text-[12px] leading-snug font-medium text-cc-ink-muted">
                Selecting a link filters the findings below to the ones whose chain says the same
                thing there.
              </p>
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
                {chain.links.map((link) => (
                  <li
                    key={link.id}
                    data-it-chain-link={link.id}
                    data-it-chain-link-determined={link.value === null ? 'no' : 'yes'}
                    className={cn(
                      'rounded-cc-row border bg-cc-surface px-3 py-2',
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
                      <span
                        data-it-chain-absent=""
                        className="mt-0.5 block text-[13px] font-semibold text-cc-ink-muted"
                      >
                        Not determined
                      </span>
                    ) : (
                      <span
                        data-it-chain-value=""
                        className="mt-0.5 block text-[13px] font-bold text-cc-ink"
                      >
                        {link.value}
                      </span>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {link.anchor ? <CcAnchor tone="unlinked">{link.anchor}</CcAnchor> : null}
                      <CcProvenanceChip value={link.provenance} />
                    </div>
                    <p
                      data-it-chain-reason={link.value === null ? '' : undefined}
                      className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted"
                    >
                      {link.value === null ? link.reason : link.detail}
                    </p>
                  </li>
                ))}
              </ul>
              <p
                data-it-requirement-note=""
                className="m-0 mt-2.5 text-[12px] leading-snug font-medium text-cc-ink-muted"
              >
                {view.requirementNote}
              </p>
            </>
          ) : (
            <CcEmptyState title="No chain to follow">
              <span data-it-chain-absent-reason="">
                {view.unreadable
                  ? 'The findings of this project could not be read, so no chain is shown. An empty chain would say there were none.'
                  : 'This run reported no findings, so there is nothing to trace.'}
              </span>
            </CcEmptyState>
          )}
        </CcCard>
      </div>

      {/* The level distribution — Unknown as its own slice, and the snapshot
          that answered named in the card (roadmap 6.3's own sentence). */}
      <div className="mt-4">
        <CcCard title="Clean core levels across the findings">
          <p data-it-level-sentence="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
            {view.distribution.sentence}
          </p>
          {view.distribution.graded > 0 ? (
            <div data-it-level-bar="" className="mt-2 flex w-full gap-1">
              {view.distribution.slices
                .filter((slice) => slice.count > 0)
                .map((slice) => (
                  <span
                    key={slice.grade}
                    data-it-level-slice={slice.grade}
                    style={{ flexGrow: slice.count }}
                    className={cn(
                      'rounded-cc-row border px-2 py-1 text-[12px] font-semibold whitespace-nowrap',
                      STATE_CLASSES[gradeState(slice.grade)].bg,
                      STATE_CLASSES[gradeState(slice.grade)].border,
                      STATE_CLASSES[gradeState(slice.grade)].text,
                    )}
                  >
                    {slice.grade} {slice.count}
                  </span>
                ))}
            </div>
          ) : null}
          <p
            data-it-level-coverage=""
            className="m-0 mt-2 text-[11px] leading-snug font-medium text-cc-ink-muted"
          >
            {view.distribution.coverage.sentence}
          </p>
          <p
            data-it-catalog-note=""
            className="m-0 mt-1 text-[11px] leading-snug font-medium text-cc-ink-muted"
          >
            {view.distribution.note}
          </p>
        </CcCard>
      </div>

      {/* The findings, with both catalog views side by side. */}
      <div className="mt-4">
        <CcCard
          title="Findings"
          count={view.rows.length}
          actions={
            filterLink ? (
              <CcButton onClick={() => setFilterLink(null)} data-it-clear-filter="">
                Clear filter
              </CcButton>
            ) : null
          }
        >
          {view.rows.length === 0 ? (
            <CcEmptyState title="No findings on record">
              <span data-it-findings-absent-reason="">
                {view.unreadable
                  ? 'The findings of this project could not be read. That is not the same as there being none.'
                  : 'The engine reported no finding for the source staged on this project.'}
              </span>
            </CcEmptyState>
          ) : (
            <>
              <CcTable
                caption="Findings, with both SAP catalog views and the clean core level"
                columns={COLUMNS}
                rows={shown.map((row) => ({
                  key: row.id,
                  selected: chain?.findingId === row.id,
                  cells: {
                    object: (
                      <button
                        type="button"
                        onClick={() => select(row.id)}
                        aria-pressed={chain?.findingId === row.id}
                        data-it-finding={row.id}
                        data-it-finding-selected={chain?.findingId === row.id ? 'yes' : 'no'}
                        className="block min-h-6 text-left text-[13px] font-semibold text-cc-ink"
                      >
                        {row.objectName ?? row.title}
                        <span className="mt-0.5 block text-[11px] font-medium text-cc-ink-muted">
                          {row.id} · {row.severity}
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
                          Not determined
                        </span>
                      ) : (
                        <span
                          data-it-level={row.id}
                          className={cn(
                            'inline-block rounded-cc-row border px-1.5 text-[12px] font-bold',
                            STATE_CLASSES[gradeState(row.level)].bg,
                            STATE_CLASSES[gradeState(row.level)].border,
                            STATE_CLASSES[gradeState(row.level)].text,
                          )}
                        >
                          {row.level}
                        </span>
                      ),
                    successor: (
                      <span className="text-[12px] font-medium text-cc-ink-muted">
                        {row.successor ?? 'none published'}
                      </span>
                    ),
                  },
                }))}
              />
              <p
                data-it-findings-count=""
                className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted"
              >
                Showing {shown.length} of {filtered.length}
                {filterLink ? ` findings filtered by ${filterLink}, out of ${view.rows.length}` : ' findings'}. The
                release view and the classification are the two SAP files, kept apart; the level is their merge.
              </p>
              {filtered.length > shown.length ? (
                <div className="mt-2">
                  <CcButton onClick={() => setShowAll(true)} data-it-show-all="">
                    Show all {filtered.length}
                  </CcButton>
                </div>
              ) : null}
            </>
          )}
        </CcCard>
      </div>
    </section>
  );
}

const COLUMNS = [
  { key: 'object', label: 'Object' },
  { key: 'line', label: 'Line', numeric: true },
  { key: 'release', label: 'Release view' },
  { key: 'classification', label: 'Classification' },
  { key: 'level', label: 'Level' },
  { key: 'successor', label: 'Successor API' },
] as const;

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

/** One half of the catalog answer, or the statement that it was never asked. */
function ViewCell({ value }: { value: string | null }) {
  return value === null ? (
    <span className="text-[12px] font-medium text-cc-ink-muted">Not asked — no object</span>
  ) : (
    <span className="text-[12px] font-medium text-cc-ink">{value}</span>
  );
}

/** One figure, its coverage and what it is worth — the shape `ManagementAnswers` uses. */
function Figure({ figure }: { figure: ItFigure }) {
  return (
    <li
      data-it-figure={figure.key}
      className="rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        {figure.value === null ? (
          <span data-figure-absent="" className="text-[13px] font-semibold text-cc-ink-muted">
            Not determined
          </span>
        ) : (
          <span data-figure-value="" className="text-[18px] leading-none font-bold text-cc-ink">
            {figure.value}
          </span>
        )}
        <span className="text-[12px] font-medium text-cc-ink-muted">{figure.label}</span>
        <CcProvenanceChip value={figure.provenance} />
      </div>
      {figure.value === null && figure.absentReason ? (
        <p
          data-figure-absent-reason=""
          className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted"
        >
          {figure.absentReason}
        </p>
      ) : null}
      <p data-figure-coverage="" className="m-0 mt-1 text-[11px] leading-snug font-medium text-cc-ink-muted">
        {figure.coverage.sentence}
      </p>
    </li>
  );
}
