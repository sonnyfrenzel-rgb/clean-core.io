'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Cog,
  Database,
  FileText,
  FileUp,
  GitBranch,
  List,
  ListChecks,
  PenLine,
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
import PageAnchorBar, { type PageAnchor } from '@/components/PageAnchorBar';
import type { DocAnchor } from '@/lib/process-documentation';
import {
  linesLabel,
  sectionTitle,
  stepRef,
  type PdData,
  type PdGate,
  type PdPathEntry,
  type PdPoint,
  type PdStep,
  type PdText,
  type ProcessDocument,
} from '@/lib/process-document';
import {
  REQUIREMENT_QUESTIONS,
  REQUIREMENT_QUESTION_HEAD,
  STEP_SUMMARY_HEAD,
  actorWord,
  actorsProven,
  questionLinkText,
  sharedQuestionLead,
  SOURCE_COLUMN,
  shortTech,
  appendixLead,
  documentOutline,
  figureText,
  gateLine,
  gateSentence,
  openQuestionAnchors,
  openQuestionDetail,
  openQuestionState,
  requirementQuestionRows,
  stepDetailLines,
  stepName,
  stepSummaryRows,
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
import DecisionTables from './DecisionTables';

/**
 * The process description on the Documentation stage — the outline of
 * `lib/process-document-outline.ts` drawn for a business reader (owner
 * 04.10.2026: "far too long … no visualisations like the other tools … much
 * smarter-looking, to the point"). The Confluence page, the Markdown and the
 * `.docx` print the same outline, so the screen and the files say the same
 * thing in the same order.
 *
 * On screen it reads like the other tools: a summary card titled
 * "<project> — <PROGRAM>" with six key figures (each a link to its section),
 * the rules and risks to know, what it covers and leaves out, and two pictures
 * drawn from the code reading (owner review 10.10.2026, "more wow, nothing
 * invented"): the main path as a flow — steps and the decision points between
 * them, each a link to its row — and what the program touches in SAP, the
 * tables it reads beside the tables it changes. Then the sections (ADR-084) as
 * cards, each with its one-line lead and its first few rows — "Show all" for
 * the rest, a step's details one tap deeper. What a file moves to its appendix
 * the screen folds in place (DESIGN.md §2.11: show less, lose nothing);
 * printed, every row stands (`CcTable`'s print rule), so "Print / PDF" is this
 * document. The program's own names stand in a muted source column, never in
 * the sentence; line anchors are small chips.
 *
 * The chapter bar (`DocumentChapterBar`, owner review 10.10.2026) is the one
 * way to jump: the IT view's anchor bar with the seven chapters, the reader
 * questions the "Go to" line asked as its tooltips. The stage renders it at
 * page level so it stays in view down to the appendix.
 *
 * An open question that stands on several rows of one table is said once
 * above it (owner review 10.10.2026); a row keeps its own link only for a
 * question that is its alone.
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

function QuestionLink({ action, children }: { action: string; children: React.ReactNode }) {
  return (
    <a
      href={`#pd-oq-${action}`}
      onClick={(event) => scrollTo(event, `pd-oq-${action}`)}
      data-doc-row-question={action}
      className="cc-text-meta font-medium text-cc-ink underline underline-offset-2"
    >
      {children}
    </a>
  );
}

function Source({ row }: { row: Pick<PdRow, 'tech' | 'anchors' | 'question'> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Tech>{row.tech}</Tech>
      <Anchors anchors={row.anchors} />
      {/* ADR-084 (roadmap 3.0.7 A5): the row stands on the line of an open question that is its alone — it leads there. */}
      {row.question ? <QuestionLink action={row.question.action}>{questionLinkText(row.question)}</QuestionLink> : null}
    </span>
  );
}

/**
 * The open questions a table's rows share, said once above it (owner review
 * 10.10.2026: "Add ATC results" on six of seven integrations makes no sense
 * row by row) — one sentence and one link each.
 */
function SharedQuestions({ table }: { table: Pick<PdTable, 'shared' | 'rows' | 'id'> | null }) {
  if (!table?.shared?.length) return null;
  return (
    <ul data-doc-shared-questions={table.id} className="m-0 mb-2 flex list-none flex-col gap-1 p-0">
      {table.shared.map((q) => (
        <li key={q.action} data-doc-shared-question={q.action} className="flex min-w-0 items-start gap-2 cc-text-cell text-cc-ink-muted">
          <TriangleAlert size={14} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-warning" />
          <span className="min-w-0">
            {sharedQuestionLead(q, table.rows.length)}:{' '}
            <QuestionLink action={q.action}>{q.title}</QuestionLink>
          </span>
        </li>
      ))}
    </ul>
  );
}

function SectionCard({ id, lead, className, children }: { id: PdSectionKey; lead: string; className?: string; children?: React.ReactNode }) {
  return (
    <section id={`pd-${id}`} data-doc-section={id} aria-labelledby={`pd-${id}-title`} className={cn(CARD, 'scroll-mt-28', className)}>
      <h3 id={`pd-${id}-title`} className="m-0 cc-text-h2 text-cc-ink">{sectionTitle(id)}</h3>
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
      <SharedQuestions table={table} />
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

/* ------------------------------------------------------- the chapter bar */

/**
 * The chapter bar of the description (owner review 10.10.2026): the IT view's
 * anchor bar (`PageAnchorBar`, ADR-086) with the seven chapters — How it works,
 * Rules, Exceptions, Changes, Systems & data, Open questions, Appendix — each
 * with what it counts, the reader question it answers as its tooltip, the
 * chapter the reader is in marked as they scroll, sticky under the shell bar,
 * and on a phone a row that scrolls inside itself. It replaces the "Go to"
 * line: one way to jump. Scrolled to, not navigated to, as every link of this
 * stage (the address holds the map's level).
 *
 * The page renders it as a direct child of the stage, so it stays in view
 * from the description down to the appendix at the foot.
 */
export function DocumentChapterBar({ document: doc, openQuestions = null, className }: { document: ProcessDocument; openQuestions?: OpenQuestions | null; className?: string }) {
  const outline = useMemo(() => documentOutline(doc, { openQuestions }), [doc, openQuestions]);
  const anchors: PageAnchor[] = outline.chapters.map((c) => ({ key: c.key, target: `pd-${c.key}`, label: c.label, count: c.count, title: c.question }));
  return (
    <PageAnchorBar
      anchors={anchors}
      label={wt('doc.chaptersLabel')}
      lead={wt('doc.chaptersLead')}
      name="doc-chapter"
      plural="doc-chapters"
      className={cn('mb-3', className)}
      onJump={(event, a) => scrollTo(event, a.target)}
    />
  );
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

/** The arrow between two nodes of the flow. */
function Connector() {
  return (
    <span aria-hidden={true} className="mt-4 flex shrink-0 items-center text-cc-field-border">
      <span className="block h-px w-3 bg-cc-field-border" />
      <ChevronRight size={14} className="-ml-1" />
    </span>
  );
}

function Terminal({ end }: { end?: boolean }) {
  return (
    <span className="flex w-12 shrink-0 flex-col items-center gap-1 pt-2">
      <span aria-hidden={true} className={cn('block h-5 w-5 rounded-full bg-cc-surface', end ? 'border-[3px] border-cc-ink' : 'border border-cc-ink')} />
      <span className="text-[11px] font-medium text-cc-ink-muted">{end ? wt('doc.flowEnd') : wt('doc.flowStart')}</span>
    </span>
  );
}

function FlowGate({ gate }: { gate: PdGate }) {
  const ending = gate.outcomes.find((o) => o.ends);
  const target = `pd-gate-${gate.id}`;
  if (gate.decisionTable) {
    // Roadmap 3.0.7: a decision that only sets one field is one business rule task.
    return (
      <a
        href={`#${target}`}
        onClick={(event) => scrollTo(event, target)}
        data-doc-path-rule-task={gate.decisionTable.id}
        title={`${gate.label} — ${gateLine(gate)}`}
        className="group flex shrink-0 rounded-cc-row no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
      >
        <span className="flex w-24 flex-col items-center gap-1 rounded-cc-row p-1 text-center group-hover:bg-cc-surface-muted">
          <span aria-hidden={true} className="inline-flex h-8 w-8 items-center justify-center rounded-cc-row border border-cc-ink bg-cc-surface">
            <ListChecks size={16} className="text-cc-ink" />
          </span>
          <span className="cc-text-meta font-semibold text-cc-ink">{gate.decisionTable.id}</span>
          <span className="sr-only">{gateLine(gate)}</span>
        </span>
      </a>
    );
  }
  return (
    <a
      href={`#${target}`}
      onClick={(event) => scrollTo(event, target)}
      data-doc-path-gate=""
      title={`${gate.label} — ${gateLine(gate)}`}
      className="group flex shrink-0 rounded-cc-row no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
    >
      <span className="flex w-28 flex-col items-center gap-1 rounded-cc-row p-1 text-center group-hover:bg-cc-surface-muted">
        <span aria-hidden={true} className="flex h-8 w-8 items-center justify-center">
          <span className="block h-5 w-5 rotate-45 border border-cc-ink bg-cc-surface" />
        </span>
        <span className="line-clamp-2 text-[12px] font-semibold text-cc-ink">{gate.label}</span>
        {ending ? (
          <span data-doc-path-gate-ends="" className="text-[11px] font-medium text-cc-ink-muted">
            {ending.when}: {wt('doc.flowEnds')}
          </span>
        ) : null}
        <span className="sr-only">Decision point: {gateLine(gate)}</span>
      </span>
    </a>
  );
}

function FlowStep({ step }: { step: PdStep }) {
  const target = `pd-step-row-${step.number}`;
  const reads = step.touches?.reads.length ?? 0;
  const writes = step.touches?.writes.length ?? 0;
  return (
    <a
      href={`#${target}`}
      onClick={(event) => scrollTo(event, target)}
      data-doc-path-step={step.number}
      data-doc-path-choice={step.choice ? '' : undefined}
      title={step.line || stepName(step)}
      className="group flex shrink-0 rounded-cc-row no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
    >
      <span
        className={cn(
          'flex w-32 flex-col gap-1 rounded-cc-row border bg-cc-surface p-2 group-hover:border-cc-ink',
          step.choice ? 'border-dashed border-cc-field-border' : 'border-cc-line',
        )}
      >
      <span className="flex min-w-0 items-start gap-1">
        <span aria-hidden={true} className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cc-ink px-1 text-[11px] font-semibold text-cc-on-dark">{stepRef(step)}</span>
        <span className="line-clamp-2 min-w-0 text-[12px] font-semibold text-cc-ink">{stepName(step)}</span>
      </span>
      {reads || writes ? (
        <span data-doc-path-touches={`${reads}/${writes}`} className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-cc-ink-muted">
          {reads ? <span className="inline-flex items-center gap-1"><Database size={12} aria-hidden={true} />{reads}<span className="sr-only"> {reads === 1 ? 'table read' : 'tables read'}</span></span> : null}
          {writes ? <span className="inline-flex items-center gap-1 text-cc-ink"><PenLine size={12} aria-hidden={true} />{writes}<span className="sr-only"> {writes === 1 ? 'table changed' : 'tables changed'}</span></span> : null}
        </span>
      ) : null}
      </span>
    </a>
  );
}

/**
 * The main path as a flow (owner review 10.10.2026): start, the numbered
 * steps, the decision points between them with the answer that ends the run,
 * the end — each node a link to its row in "How the process works". Each step
 * says how many tables it reads and changes, counted from the code. On a narrow
 * screen the flow scrolls inside its own track; the page does not.
 */
type FlowItem =
  | { kind: 'entry'; entry: PdPathEntry }
  /** The alternatives of one user choice: one row per arm, the arms stacked (QA a5c979bd9e1c). */
  | { kind: 'choice'; gateId: string; arms: PdStep[][] };

/** The path as the strip draws it: consecutive steps of one user choice become one stack of alternatives. */
export function flowItems(path: readonly PdPathEntry[]): FlowItem[] {
  const items: FlowItem[] = [];
  for (const entry of path) {
    const choice = entry.kind === 'step' ? entry.choice : undefined;
    if (entry.kind === 'step' && choice) {
      const last = items[items.length - 1];
      if (last?.kind === 'choice' && last.gateId === choice.gateId) {
        const arm = last.arms.find((a) => a[0].choice?.when === choice.when);
        if (arm) arm.push(entry);
        else last.arms.push([entry]);
      } else {
        items.push({ kind: 'choice', gateId: choice.gateId, arms: [[entry]] });
      }
      continue;
    }
    items.push({ kind: 'entry', entry });
  }
  return items;
}

export function FlowStrip({ path }: { path: ProcessDocument['overview']['path'] }) {
  return (
    // `relative`: the track is the containing block of the nodes' `sr-only`
    // spans (position: absolute). Without it they escape the scroll and widen
    // the page — 1864 px at 390 (CI 38051799180, mobile-responsive).
    <div className="relative min-w-0 overflow-x-auto pb-1 [scrollbar-width:thin]">
      <ol data-doc-path="" aria-label={wt('doc.flowLabel')} className="m-0 flex w-max list-none items-start p-0">
        <li className="flex items-start"><Terminal /></li>
        {flowItems(path).map((item) => item.kind === 'choice' ? (
          <li key={`choice-${item.gateId}`} className="flex items-start">
            <Connector />
            <div
              role="group"
              data-doc-path-choices={item.gateId}
              aria-label={wt('doc.flowChoices')}
              className="flex flex-col gap-1 border-l border-dashed border-cc-field-border pl-2"
            >
              {item.arms.map((arm) => (
                <div key={arm[0].id} data-doc-path-arm="" className="flex items-start">
                  {arm.map((step, i) => (
                    <React.Fragment key={step.id}>
                      {i ? <Connector /> : null}
                      <FlowStep step={step} />
                    </React.Fragment>
                  ))}
                </div>
              ))}
            </div>
          </li>
        ) : (
          <li key={item.entry.id} className="flex items-start">
            <Connector />
            {item.entry.kind === 'gate' ? <FlowGate gate={item.entry} /> : <FlowStep step={item.entry} />}
          </li>
        ))}
        <li className="flex items-start"><Connector /><Terminal end /></li>
      </ol>
    </div>
  );
}

function TouchChip({ item, changes }: { item: PdData; changes: boolean }) {
  const word = item.meaning ?? (item.owner === 'Customer' ? wt('doc.touchesCustom') : null);
  const target = changes ? 'pd-outputs' : 'pd-data';
  return (
    <li>
      <a
        href={`#${target}`}
        onClick={(event) => scrollTo(event, target)}
        data-doc-touch={item.name}
        title={`${item.name} — ${linesLabel(item.anchors)}`}
        className="group inline-flex min-w-0 max-w-full rounded-cc-row no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
      >
        <span
          className={cn(
            'inline-flex min-w-0 max-w-full items-center gap-2 rounded-cc-row border px-2 py-1',
            changes ? 'border-cc-ink bg-cc-surface' : 'border-cc-line bg-cc-surface-muted group-hover:border-cc-ink',
          )}
        >
          {changes ? <PenLine size={12} aria-hidden={true} className="shrink-0 text-cc-ink" /> : <Database size={12} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />}
          {word ? <span className="truncate text-[12px] font-semibold text-cc-ink">{word}</span> : null}
          <span className="font-cc-mono text-[11px] font-medium text-cc-ink-muted">{item.name}</span>
        </span>
      </a>
    </li>
  );
}

const TOUCH_SHOWN = 8;

function TouchColumn({ kind, items }: { kind: 'reads' | 'changes'; items: readonly PdData[] }) {
  const changes = kind === 'changes';
  const target = changes ? 'pd-outputs' : 'pd-data';
  return (
    <div data-doc-touches-column={kind} className="min-w-0">
      <p className="m-0 mb-2 flex items-baseline gap-2 cc-text-label text-cc-ink-muted">
        {changes ? wt('doc.touchesChanges') : wt('doc.touchesReads')}
        <span className="cc-text-figure text-cc-ink">{items.length}</span>
      </p>
      {items.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
          {items.slice(0, TOUCH_SHOWN).map((item) => <TouchChip key={item.name} item={item} changes={changes} />)}
          {items.length > TOUCH_SHOWN ? (
            <li>
              <a href={`#${target}`} onClick={(event) => scrollTo(event, target)} className="inline-flex items-center px-2 py-1 cc-text-meta font-medium text-cc-ink underline underline-offset-2">
                +{items.length - TOUCH_SHOWN}
              </a>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="m-0 cc-text-cell text-cc-ink-muted">{wt('doc.touchesNone')}</p>
      )}
    </div>
  );
}

/**
 * What the program touches in SAP (owner review 10.10.2026): the tables it
 * reads on the left, the tables it changes on the right, the program between
 * them — each table with the glossary's word and its name, a link into
 * "Systems and data" (reads) or "What it changes" (changes). Counted from the
 * code; nothing is placed that the code does not name. On a phone the three
 * stack, the arrows pointing down.
 */
function SapTouches({ doc }: { doc: ProcessDocument }) {
  const reads = doc.trigger.data;
  const writes = doc.writes ?? [];
  if (!reads.length && !writes.length) return null;
  return (
    <div data-doc-touches={`${reads.length}/${writes.length}`} className="grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <TouchColumn kind="reads" items={reads} />
      <div aria-hidden={true} className="flex items-center justify-center gap-2 text-cc-ink-muted md:flex-row">
        <ArrowRight size={16} className="max-md:hidden" />
        <ArrowDown size={16} className="md:hidden" />
        <span className="rounded-cc-row border border-cc-ink bg-cc-surface-muted px-3 py-2 font-cc-mono text-[12px] font-semibold text-cc-ink">{doc.program}</span>
        <ArrowRight size={16} className="max-md:hidden" />
        <ArrowDown size={16} className="md:hidden" />
      </div>
      <TouchColumn kind="changes" items={writes} />
    </div>
  );
}

function Glance({ doc, outline, extra }: { doc: ProcessDocument; outline: PdOutline; extra?: React.ReactNode }) {
  const g = outline.glance;
  return (
    <section data-doc-glance="" aria-labelledby="pd-glance" className={cn(CARD, 'md:p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* ADR-084: the title leads with the process; the document type stands over it. */}
        <p data-doc-subtitle="" className="m-0 cc-text-label text-cc-ink-muted">{outline.subtitle} · At a glance</p>
        <CcProvenanceChip value="reconstructed" note="from the code" />
      </div>
      <h3 id="pd-glance" data-doc-title="" className="m-0 mt-1 cc-text-h2 text-cc-ink">{outline.title}</h3>
      <p className="m-0 mt-1 font-cc-mono cc-text-meta font-medium text-cc-ink-muted">
        {doc.fileName} · {doc.lineCount} lines
      </p>
      <div data-glance-summary="" className="mt-3 max-w-4xl space-y-1">
        {g.summary.map((s, i) => (
          <p key={i} className="m-0 cc-text-body text-cc-ink">{s.text}</p>
        ))}
        {g.proposal ? (
          <p data-doc-proposal="" className="m-0 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 cc-text-cell text-cc-ink">
            <CcProvenanceChip value="proposed" /> {g.proposal.text} <Anchors anchors={g.proposal.anchors} max={2} />
          </p>
        ) : null}
        <p data-doc-started-by="" className="m-0 cc-text-cell text-cc-ink-muted">
          <span className="font-semibold text-cc-ink">Started by:</span> {g.trigger.text}
        </p>
      </div>

      <dl data-doc-figures="" className="m-0 mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {g.figures.map((f) => (
          <div key={f.label} data-doc-figure={f.label} className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface px-3 py-2">
            <dt className="cc-text-label">
              {/* Each figure leads to the section (or the part of it) it counts. */}
              <a href={`#pd-${f.anchor ?? f.section}`} onClick={(event) => scrollTo(event, `pd-${f.anchor ?? f.section}`)} className="text-cc-ink-muted underline-offset-2 hover:underline">
                {f.label}
              </a>
            </dt>
            <dd className={f.value === null ? 'm-0 cc-text-cell text-cc-ink-muted' : 'm-0 cc-text-figure text-cc-ink'}>{figureText(f)}</dd>
          </div>
        ))}
      </dl>

      {/* Owner review 10.10.2026: two pictures from the code reading — the main path and what it touches in SAP. */}
      <div data-doc-visuals="" className="mt-4 flex min-w-0 flex-col gap-4">
        <div className="min-w-0">
          <h4 className="m-0 mb-2 cc-text-h3 text-cc-ink">{wt('doc.flowTitle')}</h4>
          <FlowStrip path={doc.overview.path} />
        </div>
        {doc.trigger.data.length || doc.writes?.length ? (
          <div className="min-w-0 border-t border-cc-line pt-4">
            <h4 className="m-0 mb-2 cc-text-h3 text-cc-ink">{wt('doc.touchesTitle')}</h4>
            <SapTouches doc={doc} />
          </div>
        ) : null}
      </div>

      {g.points.length ? (
        <div className="mt-4">
          <h4 className="m-0 cc-text-h3 text-cc-ink">Rules and risks to know</h4>
          <ul data-doc-points="" className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {g.points.map((p, i) => <Point key={i} point={p} />)}
          </ul>
        </div>
      ) : null}

      {/* ADR-084: purpose and scope fold into the glance, under the risks. */}
      <div data-doc-scope="" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ScopeList title={wt('doc.covers')} items={g.covers} />
        <ScopeList title={wt('doc.leaves')} items={g.leaves} />
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

function StepItem({ step, whoActs }: { step: PdStep; whoActs: boolean }) {
  const details = stepDetailLines(step, whoActs);
  const [open, setOpen] = useState(false);
  const id = `pd-step-${step.number}`;
  return (
    <li id={`pd-step-row-${step.number}`} data-doc-main-step={step.number} data-doc-step-choice={step.choice ? step.choice.gateId : undefined} className={cn('relative flex min-w-0 scroll-mt-28 gap-3 pb-2', step.choice && 'pl-4')}>
      <span aria-hidden={true} className="relative z-[1] inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-cc-ink px-1 text-[12px] font-semibold text-cc-on-dark">
        {stepRef(step)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="m-0 min-w-0 flex-1 basis-80 cc-text-cell text-cc-ink-muted">
            {step.choice ? (
              // Roadmap 3.0.7: one of the alternatives the user chooses from, not the next step.
              <span data-doc-choice="" className="mr-1 cc-text-meta font-semibold text-cc-ink-muted">
                {wt('doc.userChoice')} {step.choice.when}:
              </span>
            ) : null}
            <span className="cc-text-identifier text-cc-ink">{stepName(step)}</span>
            {step.businessName ? <> <CcProvenanceChip value="proposed" note="name" /></> : null}
            {/* ADR-084 (roadmap 3.0.7 B2): who acts, from the evidence the code proves; never a guess —
                shown only when the code proves it for at least one step (owner decision 10.10.2026). */}
            {whoActs ? (
              <>
                {' '}
                <span data-doc-actor={step.actor?.who ?? 'not-determined'} title={step.actor?.basis} className="inline-flex align-middle">
                  {step.actor?.who ? <CcTag>{step.actor.who}</CcTag> : <span className="cc-text-meta font-medium text-cc-ink-muted">{wt('doc.whoActs')}: {actorWord(step.actor)}</span>}
                </span>
              </>
            ) : null}
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
    <li id={`pd-oq-${group.action}`} data-doc-open-question={group.action} data-doc-open-question-end={group.end} className="min-w-0 scroll-mt-28 border-t border-cc-line py-2 first:border-t-0">
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

/** The open questions section: the project's one list, its end states, and where to answer it. */
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
 * The rules section's table with the filter that was the drawer's "Rules outside the
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
    return { ...table, id: 'rules-outside', caption: wt('doc.rulesOutsideCaption'), rows, first: rows.length, shared: undefined };
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

/** A part of the systems section — its own heading and anchor, so the controls and the integrations can be linked to (ADR-084). */
function SystemsPart({ id, title, lead, children }: { id: string; title: string; lead: string; children?: React.ReactNode }) {
  return (
    <div data-doc-part={id} className="min-w-0 scroll-mt-28 border-t border-cc-line pt-3 first:border-t-0 first:pt-0" id={`pd-${id}`}>
      <h4 className="m-0 cc-text-h3 text-cc-ink">{title}</h4>
      <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{lead}</p>
      {children ? <div className="mt-2 min-w-0">{children}</div> : null}
    </div>
  );
}

/** A decision point of the steps list: the plain question, the condition as the code writes it, where each answer leads. */
function GateItem({ gate }: { gate: PdGate }) {
  return (
    <li id={`pd-gate-${gate.id}`} data-doc-gate={gate.choice ? 'choice' : ''} className="relative flex min-w-0 scroll-mt-28 items-start gap-3 pb-2">
      <span aria-hidden={true} className="relative z-[1] inline-flex h-6 w-6 shrink-0 items-center justify-center">
        <span className="block h-3 w-3 rotate-45 border border-cc-ink bg-cc-surface" />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="m-0 min-w-0 flex-1 basis-80 cc-text-cell text-cc-ink-muted">
          <span className="font-semibold text-cc-ink">Decision: {gate.label}</span> — {gateLine(gate)}
        </p>
        <span className="inline-flex flex-wrap items-center gap-1">
          {gate.condition ? <span data-doc-gate-condition="" className="font-cc-mono text-[11px] font-medium text-cc-ink-muted [overflow-wrap:anywhere]">{gate.condition}</span> : null}
          {gate.anchor ? <Anchors anchors={[gate.anchor]} /> : null}
        </span>
      </div>
    </li>
  );
}

export default function ProcessDocumentView({
  document: doc,
  projectName,
  mapHref,
  summary,
  openQuestions = null,
  questionsHref = null,
  rulesOutside = null,
}: {
  document: ProcessDocument;
  /** The project's name — the title reads "<project> — <PROGRAM>" (ADR-084). */
  projectName?: string;
  /** Where the live map stands on this page — the diagram of the process section. */
  mapHref?: string;
  /** Anything the stage adds to the summary card, under the pictures (for example the clean-core levels of what it changes). */
  summary?: React.ReactNode;
  /** The project's one list of open questions (ADR-081) — its section, its key figure, and the rows that stand on one. */
  openQuestions?: OpenQuestions | null;
  /** Where the list is answered (the workspace); absent in the demo. */
  questionsHref?: string | null;
  /** The rules that decide at no step of the drawn process (`ProcessHandbook.rulesOutside`) — the rules table's filter. */
  rulesOutside?: readonly HandbookRuleOutside[] | null;
}) {
  const outline = useMemo(() => documentOutline(doc, { openQuestions, projectName }), [doc, openQuestions, projectName]);
  const t = outline.tables;
  const q = outline.questions;

  return (
    <div data-process-document="" className="space-y-4 min-w-0">
      <Glance doc={doc} outline={outline} extra={summary} />

      <SectionCard id="overview" lead={outline.leads.overview}>
        {/* ADR-084: how a run starts opens the process — the start, the selection screen, the input it does not use. */}
        <div data-doc-run-starts="" id="pd-run-starts" className="mb-4 min-w-0">
          <h4 className="m-0 cc-text-h3 text-cc-ink">{wt('doc.runStarts')}</h4>
          <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
            {doc.trigger.start.map((s, i) => (
              <li key={i} className="min-w-0 cc-text-cell text-cc-ink">
                {s.text} <Anchors anchors={s.anchors} max={2} />
              </li>
            ))}
          </ul>
          {t.inputs ? (
            <div className="mt-2">
              <CcDisclosure title={t.inputs.caption} count={t.inputs.rows.length} summary={t.inputs.rows.slice(0, 3).map((r) => r.cells[0]).join(' · ')} density="compact">
                <OutlineTable table={{ ...t.inputs, first: t.inputs.rows.length }} />
              </CcDisclosure>
            </div>
          ) : null}
          {outline.inputUse.length ? (
            <div data-doc-input-use={outline.inputUse.length} className="mt-2">
              <p className="m-0 cc-text-label text-cc-ink-muted">{wt('doc.inputUnused')}</p>
              <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                {outline.inputUse.map((s, i) => (
                  <li key={i} className="flex min-w-0 items-start gap-2 cc-text-cell text-cc-ink">
                    <TriangleAlert size={14} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-warning" />
                    <span className="min-w-0">
                      {s.text}{' '}
                      <span className="inline-flex flex-wrap items-center gap-1 align-middle"><Tech>{s.detail}</Tech><Anchors anchors={s.anchors} max={2} /></span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div id="pd-steps" className="scroll-mt-28">
          <h4 className="m-0 mb-2 cc-text-h3 text-cc-ink">{t.steps.caption}</h4>
          {outline.whoActsLine ? <p data-doc-who-acts-none="" className="m-0 mb-2 cc-text-cell text-cc-ink-muted">{outline.whoActsLine}</p> : null}
          {mapHref ? <p className="m-0 mb-2 cc-text-cell"><a href={mapHref} className="text-cc-ink underline">Open the map</a></p> : null}
          <ol data-doc-steps="" className="relative m-0 list-none p-0 before:absolute before:bottom-4 before:left-3 before:top-2 before:w-px before:bg-cc-line">
            {doc.overview.path.map((entry) =>
              entry.kind === 'gate' && entry.decisionTable ? (
                <li key={entry.id} id={`pd-gate-${entry.id}`} data-doc-rule-task={entry.decisionTable.id} className="relative flex min-w-0 scroll-mt-28 items-start gap-3 pb-2">
                  <span aria-hidden={true} className="relative z-[1] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-cc-ink bg-cc-surface">
                    <ListChecks size={14} className="text-cc-ink" />
                  </span>
                  <p className="m-0 min-w-0 cc-text-cell text-cc-ink-muted">
                    <span className="font-semibold text-cc-ink">{gateLine(entry)}</span>
                    {entry.anchor ? <> <Anchors anchors={[entry.anchor]} /></> : null}
                  </p>
                </li>
              ) : entry.kind === 'gate' ? (
                <GateItem key={entry.id} gate={entry} />
              ) : (
                <StepItem key={entry.id} step={entry} whoActs={outline.whoActs} />
              ),
            )}
          </ol>
        </div>
      </SectionCard>

      <SectionCard id="rules" lead={outline.leads.rules}>
        {t.rules || doc.decisionTables?.length ? (
          <div className="flex min-w-0 flex-col gap-4">
            {t.rules ? <RulesTable table={t.rules} outside={rulesOutside} /> : null}
            <DecisionTables tables={doc.decisionTables ?? []} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard id="exceptions" lead={outline.leads.exceptions}>
        {t.exceptions ? <OutlineTable table={t.exceptions} /> : null}
      </SectionCard>

      <SectionCard id="outputs" lead={outline.leads.outputs}>
        {t.outputs ? <OutlineTable table={t.outputs} /> : null}
      </SectionCard>

      {/* ADR-084: the data it reads, the integrations and the controls — one section, three parts. */}
      <SectionCard id="systems" lead={outline.leads.systems}>
        <div className="flex min-w-0 flex-col gap-3">
          <SystemsPart id="data" title={wt('doc.dataReads')} lead={outline.partLeads.data}>
            {t.data || t.derived ? (
              <div className="flex flex-col gap-1">
                {t.data ? (
                  <CcDisclosure title={t.data.caption} count={t.data.rows.length} summary={t.data.rows.slice(0, 3).map((r) => r.cells[0]).join(' · ')} density="compact">
                    <OutlineTable table={{ ...t.data, first: t.data.rows.length }} />
                  </CcDisclosure>
                ) : null}
                {t.derived ? (
                  <CcDisclosure title={t.derived.caption} count={t.derived.rows.length} summary={t.derived.rows.slice(0, 3).map((r) => r.cells[0]).join(' · ')} density="compact">
                    <OutlineTable table={{ ...t.derived, first: t.derived.rows.length }} />
                  </CcDisclosure>
                ) : null}
              </div>
            ) : null}
          </SystemsPart>

          <SystemsPart id="integrations" title={wt('doc.integrationsTitle')} lead={outline.partLeads.integrations}>
            {t.integrations ? (
              <>
                <SharedQuestions table={t.integrations} />
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
              </>
            ) : null}
          </SystemsPart>

          <SystemsPart id="controls" title={wt('doc.controlsTitle')} lead={outline.partLeads.controls}>
            {t.controls ? (
              <>
                <SharedQuestions table={t.controls} />
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
              </>
            ) : null}
          </SystemsPart>
        </div>
      </SectionCard>

      <SectionCard id="questions" lead={outline.leads.questions}>
        <OpenQuestionsSection list={q.list} href={questionsHref} requirementsLine={q.requirementsLine} />
      </SectionCard>
    </div>
  );
}

/* ---------------------------------------------------------------- appendix */

/** One line of a step's details: "Label: text" set as a label and its text, anything else as it is. */
function DetailLine({ line }: { line: string }) {
  const m = /^(Technical|Who acts|Model proposal|[A-Z][\w ]{2,24}):\s(.+)$/.exec(line);
  return (
    <li className="min-w-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">
      {m ? <><span className="cc-text-label text-cc-ink-muted">{m[1]}</span>{' '}{m[2]}</> : line}
    </li>
  );
}

/**
 * The appendix's first two parts (owner review 10.10.2026: "an endless list,
 * badly formatted"): one compact table of the steps — what each does, its
 * lines, how many details it holds — and then the details of each step, one
 * fold per step, the decision points between them in one line each. The
 * evidence follows complete underneath.
 */
function AppendixSteps({ doc }: { doc: ProcessDocument }) {
  const whoActs = actorsProven(doc.overview.path);
  const summary = stepSummaryRows(doc, whoActs);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const steps = doc.overview.path.filter((e): e is PdStep => e.kind === 'step');
  const openStep = (event: React.MouseEvent<HTMLAnchorElement>, n: number) => {
    setOpen((o) => ({ ...o, [n]: true }));
    scrollTo(event, `pd-a-step-${n}`);
  };
  return (
    <>
      <div data-doc-appendix-summary="" className={CARD}>
        <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">{wt('doc.appendixSummaryTitle')}</h3>
        <CcTable
          caption={wt('doc.appendixSummaryTitle')}
          columns={STEP_SUMMARY_HEAD.map((label, i) => ({ key: `c${i}`, label, numeric: i === 4, width: i === 0 ? '56px' : undefined }))}
          rows={summary.map((r, i) => {
            const step = steps[i];
            return {
              key: `s${i}`,
              cells: {
                c0: r[0],
                c1: <span className="cc-text-identifier text-cc-ink">{r[1]}</span>,
                c2: r[2],
                c3: <Anchors anchors={step?.anchors ?? []} max={2} />,
                c4: step && Number(r[4]) > 0 ? (
                  <a href={`#pd-a-step-${step.number}`} onClick={(event) => openStep(event, step.number)} data-doc-appendix-open={step.number} className="text-cc-ink underline underline-offset-2">{r[4]}</a>
                ) : r[4],
              },
            };
          })}
        />
      </div>

      <div data-doc-appendix-steps="" className={CARD}>
        <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">{wt('doc.appendixDetailsTitle')}</h3>
        <ol className="m-0 flex list-none flex-col p-0">
          {doc.overview.path.map((entry) => entry.kind === 'gate' ? (
            <li key={entry.id} data-doc-appendix-gate="" className="flex min-w-0 items-start gap-2 border-t border-cc-line py-2 cc-text-meta font-medium text-cc-ink-muted">
              <span aria-hidden={true} className="mt-1 block h-2 w-2 shrink-0 rotate-45 border border-cc-ink" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{gateSentence(entry)}</span>
            </li>
          ) : (
            <li key={entry.id} id={`pd-a-step-${entry.number}`} data-doc-appendix-step={entry.number} className="min-w-0 scroll-mt-28 border-t border-cc-line py-1 first:border-t-0">
              <CcDisclosure
                title={`${stepRef(entry)}. ${stepName(entry)}`}
                count={Math.max(0, stepDetailLines(entry, whoActs).length - 1)}
                summary={entry.line || undefined}
                open={!!open[entry.number]}
                onOpenChange={(v) => setOpen((o) => ({ ...o, [entry.number]: v }))}
                density="compact"
              >
                <ul className="m-0 mt-1 mb-2 flex list-none flex-col gap-1 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
                  {stepDetailLines(entry, whoActs).map((line, i) => <DetailLine key={i} line={line} />)}
                </ul>
              </CcDisclosure>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/**
 * The appendix of the process description (owner review 10.10.2026,
 * restructured): a compact summary of the steps first, then each step's
 * details folded, then the evidence complete — the code's own wording of what
 * the body says shorter, the questions about the requirements, and the
 * technical trace (every element and every statement with its lines) the stage
 * passes in. Its own block so the stage can put it last, below the business
 * layer and the map; the exports keep the same order (A.1 opens with the same
 * summary table).
 */
export function ProcessDocumentAppendix({ document: doc, children }: { document: ProcessDocument | null; children: React.ReactNode }) {
  return (
    <section id="pd-appendix" data-doc-section="appendix" aria-labelledby="pd-appendix-title" className="min-w-0 scroll-mt-28">
      <h2 id="pd-appendix-title" className="m-0 cc-text-h2 text-cc-ink">{sectionTitle('appendix')}</h2>
      <p className="m-0 mt-1 mb-4 max-w-3xl cc-text-cell text-cc-ink-muted">
        {doc ? appendixLead(doc.appendix) : 'Every element and every statement the engine read, grouped by routine, each with its lines.'}
      </p>
      {doc ? (
        <div className="mb-4 flex min-w-0 flex-col gap-4">
          <AppendixSteps doc={doc} />
          <div data-doc-appendix-evidence="" className="min-w-0">
            <h3 className="m-0 cc-text-h3 text-cc-ink">{wt('doc.appendixEvidenceTitle')}</h3>
            <p className="m-0 mt-1 mb-2 cc-text-cell text-cc-ink-muted">{wt('doc.appendixEvidenceLead')}</p>
            <div className="flex flex-col gap-1">
              <CcDisclosure title="Wording as read from the code" count={wordingRows(doc).length} density="compact">
                <CcTable
                  caption="Wording as read from the code"
                  columns={[{ key: 's', label: 'Section' }, { key: 'i', label: 'Item' }, { key: 'w', label: 'As read from the code' }, { key: 'l', label: 'Lines' }]}
                  rows={wordingRows(doc).map((r, i) => ({ key: String(i), cells: { s: r[0], i: r[1], w: r[2], l: <Tech>{r[3]}</Tech> } }))}
                />
              </CcDisclosure>
              {doc.questions.length ? (
                <div id="pd-requirement-questions" data-doc-requirement-question-list="" className="scroll-mt-28">
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
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
