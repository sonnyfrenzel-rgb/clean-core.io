'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Cog,
  Database,
  FileText,
  FileUp,
  GitBranch,
  List,
  ListChecks,
  Send,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcStateText from '@/components/cc/StateText';
import CcTable, { type CcTableColumn } from '@/components/cc/Table';
import { CcTag } from '@/components/cc/Tag';
import type { DocAnchor } from '@/lib/process-documentation';
import {
  sectionTitle,
  type PdPoint,
  type PdStep,
  type PdText,
  type ProcessDocument,
  type ProcessDocumentSection,
} from '@/lib/process-document';
import {
  REQUIREMENT_QUESTIONS,
  REQUIREMENT_QUESTION_HEAD,
  SOURCE_COLUMN,
  shortTech,
  appendixLead,
  documentOutline,
  figureText,
  gateLine,
  openQuestionAnchors,
  openQuestionDetail,
  openQuestionState,
  requirementQuestionRows,
  stepDetailLines,
  stepName,
  wordingRows,
  type PdOutline,
  type PdRow,
  type PdSectionKey,
  type PdTable,
} from '@/lib/process-document-outline';
import type { OpenQuestionGroup, OpenQuestions } from '@/lib/open-questions';
import type { HandbookRuleOutside } from '@/lib/process-handbook';
import { docRulesOutsideNotInTable, docRulesFilterAll, docRulesFilterOutside, wt } from '@/lib/workspace-messages';
import { cn } from '@/lib/utils';

/**
 * The process description on the Documentation stage — the outline of
 * `lib/process-document-outline.ts` drawn for a business reader (owner
 * 04.10.2026: "far too long … no visualisations like the other tools … much
 * smarter-looking, to the point"). The Confluence page, the Markdown and the
 * `.docx` print the same outline, so the screen and the files say the same
 * thing in the same order.
 *
 * On screen it reads like the other tools: a summary card with six key figures
 * (each a link to its section), the rules and risks to know, and the main path
 * as a strip of numbered steps; then the nine sections as cards, each with its
 * one-line lead and its first few rows — "Show all" for the rest, a step's
 * details one tap deeper. What a file moves to its appendix the screen folds
 * in place (DESIGN.md §2.11: show less, lose nothing); printed, every row
 * stands (`CcTable`'s print rule), so "Print / PDF" is this document. The
 * program's own names stand in a muted source column, never in the sentence;
 * line anchors are small chips.
 *
 * Roadmap 3.0.7 ("Documentation lean"): the rules table carries the filter
 * that was the drawer's "Rules outside the process", and section 9 is the
 * project's one list of open questions (ADR-081) with its end states — read
 * here, answered in the workspace.
 *
 * The technical trace is `ProcessDocumentAppendix`, rendered by the stage at
 * its foot — after the business layer and the map (ADR-077 amended).
 */

const CARD = 'rounded-cc-card border border-cc-line bg-cc-surface p-4 md:p-5 shadow-cc min-w-0';

/* ------------------------------------------------------------ small parts */

function Anchors({ anchors, max = 3 }: { anchors: readonly DocAnchor[]; max?: number }) {
  if (!anchors.length) return null;
  const shown = anchors.slice(0, max);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((a) => (
        <CcAnchor key={`${a.lineStart}-${a.lineEnd}`} label={a.lineEnd > a.lineStart ? `Source lines ${a.lineStart} to ${a.lineEnd}` : `Source line ${a.lineStart}`}>
          {a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`}
        </CcAnchor>
      ))}
      {anchors.length > max ? <span className="cc-text-meta text-cc-ink-muted">+{anchors.length - max}</span> : null}
    </span>
  );
}

/** The program's names, muted and in mono — the source column, never the sentence. */
function Tech({ children }: { children: string | null | undefined }) {
  const short = shortTech(children);
  if (!short) return null;
  return (
    <span data-doc-tech="" title={short !== children ? children ?? undefined : undefined} className="font-cc-mono text-[11px] font-medium text-cc-ink-muted [overflow-wrap:anywhere]">
      {short}
    </span>
  );
}

function Source({ row }: { row: Pick<PdRow, 'tech' | 'anchors'> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Tech>{row.tech}</Tech>
      <Anchors anchors={row.anchors} />
    </span>
  );
}

function SectionCard({ id, lead, className, children }: { id: PdSectionKey; lead: string; className?: string; children?: React.ReactNode }) {
  return (
    <section data-doc-section={id} aria-labelledby={`pd-${id}`} className={cn(CARD, 'scroll-mt-24', className)}>
      <h3 id={`pd-${id}`} className="m-0 cc-text-h2 text-cc-ink">{sectionTitle(id)}</h3>
      <p data-doc-lead="" className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{lead}</p>
      {children ? <div className="mt-3 min-w-0">{children}</div> : null}
    </section>
  );
}

/**
 * A table of the outline: its first rows, then "Show all n" (DESIGN.md §2.11).
 * The rows past the first stay in the markup, hidden on screen and printed
 * (`CcTable`'s `hidden print:table-row`), so the printed description loses none.
 */
function OutlineTable({ table }: { table: PdTable }) {
  const columns: CcTableColumn[] = [
    ...table.head.map((label, i) => ({ key: `c${i}`, label })),
    { key: 'source', label: SOURCE_COLUMN, width: '180px' },
  ];
  return (
    <div data-doc-table={table.id} className="min-w-0">
      <CcTable
        caption={table.caption}
        columns={columns}
        limit={table.first}
        rows={table.rows.map((row, r) => ({
          key: `r${r}`,
          cells: { ...Object.fromEntries(row.cells.map((cell, i) => [`c${i}`, cell])), source: <Source row={row} /> },
        }))}
      />
    </div>
  );
}

function scrollTo(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  // Scrolled to, not navigated to: the stage keeps the map's level in the
  // address (`#map=`), and a fragment would replace it.
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ------------------------------------------------------------- the summary */

function Point({ point }: { point: PdPoint }) {
  const Icon = point.kind === 'rule' ? ListChecks : TriangleAlert;
  return (
    <li data-doc-point={point.kind} className="flex min-w-0 items-start gap-2">
      <Icon size={16} aria-hidden={true} className={cn('mt-0.5 shrink-0', point.kind === 'rule' ? 'text-cc-ink-muted' : 'text-cc-warning')} />
      <span className="min-w-0 cc-text-cell text-cc-ink">
        {point.ref ? <><CcAnchor label={`Business rule ${point.ref}`}>{point.ref}</CcAnchor>{' '}</> : null}
        {point.text}{' '}
        <span className="inline-flex flex-wrap items-center gap-1 align-middle">
          <Tech>{point.detail}</Tech>
          <Anchors anchors={point.anchors} max={2} />
        </span>
      </span>
    </li>
  );
}

/** The main path as a strip of numbered steps; a decision point that can end the run is a diamond between them. */
function PathStrip({ path }: { path: ProcessDocument['overview']['path'] }) {
  return (
    <ol data-doc-path="" aria-label="Main path" className="m-0 flex list-none flex-wrap items-center gap-x-1 gap-y-2 p-0">
      {path.map((entry, i) => (
        <li key={entry.id} className="inline-flex items-center gap-1">
          {i > 0 ? <ArrowRight size={14} aria-hidden={true} className="shrink-0 text-cc-ink-muted" /> : null}
          {entry.kind === 'gate' ? (
            <span
              data-doc-path-gate=""
              className="inline-flex h-6 w-6 items-center justify-center"
              title={`${entry.label} — ${gateLine(entry)}`}
            >
              <span aria-hidden={true} className="block h-3 w-3 rotate-45 border border-cc-ink bg-cc-surface" />
              <span className="sr-only">Decision point: {entry.label} — {gateLine(entry)}</span>
            </span>
          ) : (
            <span data-doc-path-step={entry.number} className="inline-flex items-center gap-1 rounded-full border border-cc-line bg-cc-surface-muted py-0.5 pl-0.5 pr-2">
              <span aria-hidden={true} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cc-ink px-1 text-[11px] font-semibold text-cc-on-dark">{entry.number}</span>
              <span className="cc-text-meta text-cc-ink">{stepName(entry)}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function Glance({ doc, outline, extra }: { doc: ProcessDocument; outline: PdOutline; extra?: React.ReactNode }) {
  const g = outline.glance;
  return (
    <section data-doc-glance="" aria-labelledby="pd-glance" className={cn(CARD, 'md:p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 cc-text-label text-cc-ink-muted">At a glance</p>
        <CcProvenanceChip value="reconstructed" note="from the code" />
      </div>
      <h3 id="pd-glance" className="m-0 mt-1 cc-text-h2 text-cc-ink">{doc.program}</h3>
      <p className="m-0 mt-1 font-cc-mono cc-text-meta font-medium text-cc-ink-muted">
        {doc.fileName} · {doc.lineCount} lines
      </p>
      <div data-glance-summary="" className="mt-3 max-w-4xl space-y-1">
        {g.summary.map((s, i) => (
          <p key={i} className="m-0 cc-text-body text-cc-ink">{s.text}</p>
        ))}
        <p className="m-0 cc-text-cell text-cc-ink-muted">
          <span className="font-semibold text-cc-ink">Started by:</span> {g.trigger.text}
        </p>
      </div>

      <dl data-doc-figures="" className="m-0 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {g.figures.map((f) => (
          <div key={f.label} data-doc-figure={f.label} className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface px-3 py-2">
            <dt className="cc-text-label">
              {/* Each figure leads to the section it counts. */}
              <a href={`#pd-${f.section}`} onClick={(event) => scrollTo(event, `pd-${f.section}`)} className="text-cc-ink-muted underline-offset-2 hover:underline">
                {f.label}
              </a>
            </dt>
            <dd className={f.value === null ? 'm-0 cc-text-cell text-cc-ink-muted' : 'm-0 cc-text-figure text-cc-ink'}>{figureText(f)}</dd>
          </div>
        ))}
      </dl>

      {g.points.length ? (
        <div className="mt-4">
          <h4 className="m-0 cc-text-h3 text-cc-ink">Rules and risks to know</h4>
          <ul data-doc-points="" className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {g.points.map((p, i) => <Point key={i} point={p} />)}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <h4 className="m-0 mb-2 cc-text-h3 text-cc-ink">Main path</h4>
        <PathStrip path={doc.overview.path} />
      </div>

      {extra}

      <p data-doc-note="" className="m-0 mt-4 border-t border-cc-line pt-3 cc-text-meta font-medium text-cc-ink-muted">{doc.note}</p>
    </section>
  );
}

/* ------------------------------------------------------------- the sections */

function ScopeList({ title, items }: { title: string; items: PdText[] }) {
  return (
    <div className="min-w-0">
      <p className="m-0 cc-text-label text-cc-ink-muted">{title}</p>
      <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
        {items.map((s, i) => (
          <li key={i} className="min-w-0 cc-text-cell text-cc-ink">
            {s.text}{' '}
            <span className="inline-flex flex-wrap items-center gap-1 align-middle"><Tech>{s.detail}</Tech><Anchors anchors={s.anchors} max={1} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepItem({ step }: { step: PdStep }) {
  const details = stepDetailLines(step);
  const [open, setOpen] = useState(false);
  const id = `pd-step-${step.number}`;
  return (
    <li data-doc-main-step={step.number} className="relative flex min-w-0 gap-3 pb-2">
      <span aria-hidden={true} className="relative z-[1] inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-cc-ink px-1 text-[12px] font-semibold text-cc-on-dark">
        {step.number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="m-0 min-w-0 flex-1 basis-80 cc-text-cell text-cc-ink-muted">
            <span className="cc-text-identifier text-cc-ink">{stepName(step)}</span>
            {step.businessName ? <> <CcProvenanceChip value="proposed" note="name" /></> : null}
            {step.line ? <> — {step.line}</> : null}
            {details.length > 1 ? (
              <>
                {' '}
                {/* The step's details one tap deeper (DESIGN.md §2.11); a file prints them in its appendix. */}
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={id}
                  onClick={() => setOpen((v) => !v)}
                  data-doc-step-details=""
                  className="cc-text-meta text-cc-ink underline underline-offset-2"
                >
                  {open ? 'Hide details' : `Details (${details.length - 1})`}
                </button>
              </>
            ) : null}
          </p>
          <span className="inline-flex flex-wrap items-center gap-1"><Tech>{step.technicalName}</Tech><Anchors anchors={step.anchors} max={2} /></span>
        </div>
        {step.proposal ? (
          <p data-doc-proposal="" className="m-0 mt-1 cc-text-cell text-cc-ink">
            <CcProvenanceChip value="proposed" /> {step.proposal.text}
          </p>
        ) : null}
        {open ? (
          <ul id={id} className="m-0 mt-2 flex list-none flex-col gap-1 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 cc-text-cell text-cc-ink-muted">
            {details.map((line, i) => <li key={i} className="[overflow-wrap:anywhere]">{line}</li>)}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

const INTEGRATION_ICONS: Array<[RegExp, React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>]> = [
  [/BAPI/, Database],
  [/Workflow/, Workflow],
  [/File/, FileUp],
  [/Transaction/, FileText],
  [/RFC|Remote/, Send],
  [/Program/, List],
  [/Dynamic/, GitBranch],
];
const integrationIcon = (kind: string) => INTEGRATION_ICONS.find(([re]) => re.test(kind))?.[1] ?? Cog;

/** One group of the project's open questions, read-only: the workspace answers it (ADR-081). */
function OpenQuestionRow({ group }: { group: OpenQuestionGroup }) {
  const anchors = openQuestionAnchors(group);
  return (
    <li data-doc-open-question={group.action} data-doc-open-question-end={group.end} className="min-w-0 border-t border-cc-line py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="cc-text-identifier text-cc-ink">{group.title}</span>
        <span className="cc-text-meta font-medium text-cc-ink-muted">{group.count}</span>
        <CcTag>{group.owner}</CcTag>
        {group.end === 'answered' ? <CcProvenanceChip value="confirmed" /> : null}
        {group.end === 'open' ? (
          group.blocksDecision ? <CcStateText state="warning">{openQuestionState(group)}</CcStateText> : null
        ) : (
          <span className="cc-text-meta font-medium text-cc-ink-muted">{openQuestionState(group)}</span>
        )}
        <Anchors anchors={anchors} max={3} />
      </div>
      <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{openQuestionDetail(group)}</p>
    </li>
  );
}

/** Section 9: the project's one list, its end states, and where to answer it. */
function OpenQuestionsSection({ list, href, requirementsLine }: { list: OpenQuestions | null; href?: string | null; requirementsLine: string | null }) {
  return (
    <>
      {list && list.groups.length ? (
        <ul data-doc-open-questions={list.open} className="m-0 list-none p-0">
          {list.groups.map((g) => <OpenQuestionRow key={g.action} group={g} />)}
        </ul>
      ) : null}
      {list?.limits ? <p className="m-0 mt-2 cc-text-meta font-medium text-cc-ink-muted">{list.limits}</p> : null}
      {href ? (
        <p className="m-0 mt-2 cc-text-cell">
          <a href={href} data-doc-open-questions-link="" className="text-cc-ink underline underline-offset-2">{wt('doc.questionsAnswerInWorkspace')}</a>
        </p>
      ) : null}
      {requirementsLine ? (
        <p data-doc-requirement-questions="" className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
          <a href="#pd-requirement-questions" onClick={(event) => scrollTo(event, 'pd-requirement-questions')} className="text-cc-ink underline-offset-2 hover:underline">
            {requirementsLine}
          </a>
        </p>
      ) : null}
    </>
  );
}

type RulesFilter = 'all' | 'outside';

/**
 * Section 4's table with the filter that was the drawer's "Rules outside the
 * process" (roadmap 3.0.7): the rows whose rule decides at no step of the
 * drawn process, and — so nothing the drawer listed is lost — the rules of
 * that kind the table has no row for (a rule no entry point reaches), with the
 * reason in words.
 */
function RulesTable({ table, outside }: { table: PdTable; outside: readonly HandbookRuleOutside[] | null }) {
  const [filter, setFilter] = useState<RulesFilter>('all');
  const ids = useMemo(() => new Set((outside ?? []).map((r) => r.id)), [outside]);
  const filtered = useMemo<PdTable>(() => {
    if (filter === 'all') return table;
    const inTable = table.rows.filter((row) => ids.has(row.cells[0]));
    const shown = new Set(inTable.map((row) => row.cells[0]));
    const extra: PdRow[] = (outside ?? [])
      .filter((r) => !shown.has(r.id))
      .map((r) => ({ cells: [r.id, docRulesOutsideNotInTable(r.reason), r.text, '—'], tech: r.detail || null, anchors: r.anchor ? [r.anchor] : [] }));
    const rows = [...inTable, ...extra];
    return { ...table, id: 'rules-outside', caption: wt('doc.rulesOutsideCaption'), rows, first: rows.length };
  }, [filter, table, ids, outside]);
  const outsideCount = (outside ?? []).length;
  return (
    <div className="min-w-0">
      {outside && outsideCount > 0 ? (
        <div role="group" aria-label={wt('doc.rulesFilterLabel')} data-doc-rules-filter={filter} className="mb-2 flex flex-wrap items-center gap-2">
          <CcButton variant={filter === 'all' ? 'secondary' : 'ghost'} density="compact" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} data-doc-rules-filter-all="">
            {docRulesFilterAll(table.rows.length)}
          </CcButton>
          <CcButton variant={filter === 'outside' ? 'secondary' : 'ghost'} density="compact" aria-pressed={filter === 'outside'} onClick={() => setFilter('outside')} data-doc-rules-filter-outside="">
            {docRulesFilterOutside(outsideCount)}
          </CcButton>
        </div>
      ) : null}
      {filter === 'outside' ? (
        <>
          <p className="m-0 mb-2 cc-text-meta font-medium text-cc-ink-muted">{wt('doc.rulesOutsideLead')}</p>
          {filtered.rows.length ? <OutlineTable key="outside" table={filtered} /> : <p className="m-0 cc-text-cell text-cc-ink-muted">{wt('doc.rulesOutsideNone')}</p>}
        </>
      ) : (
        <OutlineTable key="all" table={table} />
      )}
    </div>
  );
}

export default function ProcessDocumentView({
  document: doc,
  mapHref,
  summary,
  openQuestions = null,
  questionsHref = null,
  rulesOutside = null,
}: {
  document: ProcessDocument;
  /** Where the live map stands on this page — the diagram of section 3. */
  mapHref?: string;
  /** Anything the stage adds to the summary card, under the main path (for example the clean-core levels of what it changes). */
  summary?: React.ReactNode;
  /** The project's one list of open questions (ADR-081) — section 9 and its key figure. */
  openQuestions?: OpenQuestions | null;
  /** Where the list is answered (the workspace); absent in the demo. */
  questionsHref?: string | null;
  /** The rules that decide at no step of the drawn process (`ProcessHandbook.rulesOutside`) — the rules table's filter. */
  rulesOutside?: readonly HandbookRuleOutside[] | null;
}) {
  const outline = useMemo(() => documentOutline(doc, { openQuestions }), [doc, openQuestions]);
  const p = doc.purpose;
  const t = outline.tables;
  const q = outline.questions;

  return (
    <div data-process-document="" className="space-y-4 min-w-0">
      <Glance doc={doc} outline={outline} extra={summary} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard id="purpose" lead={outline.leads.purpose}>
          {p.proposal ? (
            <p data-doc-proposal="" className="m-0 mb-3 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 cc-text-cell text-cc-ink">
              <CcProvenanceChip value="proposed" /> {p.proposal.text} <Anchors anchors={p.proposal.anchors} max={2} />
            </p>
          ) : null}
          <p className="m-0 mb-3 cc-text-cell text-cc-ink">
            {p.users.text} <Tech>{p.users.detail}</Tech> <Anchors anchors={p.users.anchors} max={2} />
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ScopeList title="In scope" items={p.inScope} />
            <ScopeList title="Outside this code" items={p.outOfScope} />
          </div>
        </SectionCard>

        <SectionCard id="trigger" lead={outline.leads.trigger}>
          {t.inputs || t.data ? (
            <div className="flex flex-col gap-1">
              {t.inputs ? (
                <CcDisclosure title={t.inputs.caption} count={t.inputs.rows.length} summary={t.inputs.rows.slice(0, 3).map((r) => r.cells[0]).join(' · ')} density="compact">
                  <OutlineTable table={{ ...t.inputs, first: t.inputs.rows.length }} />
                </CcDisclosure>
              ) : null}
              {t.data ? (
                <CcDisclosure title={t.data.caption} count={t.data.rows.length} summary={t.data.rows.slice(0, 3).map((r) => r.cells[0]).join(' · ')} density="compact">
                  <OutlineTable table={{ ...t.data, first: t.data.rows.length }} />
                </CcDisclosure>
              ) : null}
            </div>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard id="overview" lead={outline.leads.overview}>
        {mapHref ? <p className="m-0 mb-2 cc-text-cell"><a href={mapHref} className="text-cc-ink underline">Open the map</a></p> : null}
        <ol data-doc-steps="" className="relative m-0 list-none p-0 before:absolute before:bottom-4 before:left-3 before:top-2 before:w-px before:bg-cc-line">
          {doc.overview.path.map((entry) =>
            entry.kind === 'gate' ? (
              <li key={entry.id} data-doc-gate="" className="relative flex min-w-0 items-start gap-3 pb-2">
                <span aria-hidden={true} className="relative z-[1] inline-flex h-6 w-6 shrink-0 items-center justify-center">
                  <span className="block h-3 w-3 rotate-45 border border-cc-ink bg-cc-surface" />
                </span>
                <p className="m-0 min-w-0 cc-text-cell text-cc-ink-muted">
                  <span className="font-semibold text-cc-ink">Decision: {entry.label}</span> — {gateLine(entry)}
                  {entry.anchor ? <> <Anchors anchors={[entry.anchor]} /></> : null}
                </p>
              </li>
            ) : (
              <StepItem key={entry.id} step={entry} />
            ),
          )}
        </ol>
      </SectionCard>

      <SectionCard id="rules" lead={outline.leads.rules}>
        {t.rules ? <RulesTable table={t.rules} outside={rulesOutside} /> : null}
      </SectionCard>

      <SectionCard id="exceptions" lead={outline.leads.exceptions}>
        {t.exceptions ? <OutlineTable table={t.exceptions} /> : null}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard id="outputs" lead={outline.leads.outputs}>
          {t.outputs ? <OutlineTable table={t.outputs} /> : null}
        </SectionCard>

        <SectionCard id="integrations" lead={outline.leads.integrations}>
          {t.integrations ? (
            <ul data-doc-integrations="" className="m-0 flex list-none flex-col gap-2 p-0">
              {t.integrations.rows.map((row, i) => {
                const Icon = integrationIcon(row.cells[1]);
                return (
                  <li key={i} className="flex min-w-0 items-start gap-2">
                    <Icon size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
                    <p className="m-0 min-w-0 cc-text-cell text-cc-ink">
                      {row.cells[0]} <span className="cc-text-meta font-medium text-cc-ink-muted">· {row.cells[1]}</span>{' '}
                      <span className="inline-flex flex-wrap items-center gap-1 align-middle"><Source row={row} /></span>
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard id="controls" lead={outline.leads.controls}>
        {t.controls ? (
          <ul data-doc-controls="" className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
            {t.controls.rows.map((row, i) => (
              <li key={i} className="flex min-w-0 items-start gap-2">
                <CheckCircle2 size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
                <div className="min-w-0">
                  <p className="m-0 cc-text-cell text-cc-ink"><span className="font-semibold">{row.cells[0]}.</span> {row.cells[1]}</p>
                  <Source row={row} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>

      <SectionCard id="questions" lead={outline.leads.questions}>
        <OpenQuestionsSection list={q.list} href={questionsHref} requirementsLine={q.requirementsLine} />
      </SectionCard>
    </div>
  );
}

/**
 * The appendix of the process description — what the body says shorter, in
 * the code's own words, the sources of the open questions, and then the
 * technical trace (every element and every statement with its lines). Its own
 * block so the stage can put it last, below the business layer and the map;
 * the exports keep it last too.
 */
export function ProcessDocumentAppendix({ document: doc, children }: { document: ProcessDocument | null; children: React.ReactNode }) {
  return (
    <section data-doc-section="appendix" aria-labelledby="pd-appendix" className="min-w-0">
      <h2 id="pd-appendix" className="m-0 cc-text-h2 text-cc-ink">{sectionTitle('appendix' as ProcessDocumentSection)}</h2>
      <p className="m-0 mt-1 mb-4 max-w-3xl cc-text-cell text-cc-ink-muted">
        {doc ? appendixLead(doc.appendix) : 'Every element and every statement the engine read, grouped by routine, each with its lines.'}
      </p>
      {doc ? (
        <div className="mb-4 flex flex-col gap-1">
          <CcDisclosure title="Wording as read from the code" count={wordingRows(doc).length} density="compact">
            <CcTable
              caption="Wording as read from the code"
              columns={[{ key: 's', label: 'Section' }, { key: 'i', label: 'Item' }, { key: 'w', label: 'As read from the code' }, { key: 'l', label: 'Lines' }]}
              rows={wordingRows(doc).map((r, i) => ({ key: String(i), cells: { s: r[0], i: r[1], w: r[2], l: <Tech>{r[3]}</Tech> } }))}
            />
          </CcDisclosure>
          {doc.questions.length ? (
            <div id="pd-requirement-questions" data-doc-requirement-question-list="" className="scroll-mt-24">
              <CcDisclosure title={REQUIREMENT_QUESTIONS} count={doc.questions.length} density="compact">
                <CcTable
                  caption={REQUIREMENT_QUESTIONS}
                  columns={REQUIREMENT_QUESTION_HEAD.map((label, i) => ({ key: `c${i}`, label }))}
                  rows={requirementQuestionRows(doc).map((r, i) => ({
                    key: String(i),
                    cells: Object.fromEntries(r.map((cell, c) => [`c${c}`, c === 4 ? <Tech>{cell}</Tech> : cell])),
                  }))}
                />
              </CcDisclosure>
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

