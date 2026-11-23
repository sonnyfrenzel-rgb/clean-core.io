'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpenText, ChevronRight, CircleMinus, Code2, Database, Download, Eye, FileCode2, FileText, Info, Map as MapIcon, PenLine, Printer, TriangleAlert, Workflow } from 'lucide-react';
import AnswerCard, { type FacetProps } from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import PageAnchorBar from '@/components/PageAnchorBar';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcTable from '@/components/cc/Table';
import { cn } from '@/lib/utils';
import type { DocAnchor } from '@/lib/process-documentation';
import type { PdData, ProcessDocument } from '@/lib/process-document';
import { resultWord } from '@/lib/process-document-outline';
import {
  chapterOf,
  DOC_ANSWER_ID,
  DOC_APPENDIX_ID,
  DOC_CHAPTERS,
  DOC_EXPORT_ID,
  documentationAnchors,
  type DocChapterKey,
  type DocStep,
  type DocumentationPage,
} from '@/lib/documentation-page';
import { arrowHead, edgeLabelAt, figureCaption, shapeGeometry, type ProcessFigure } from '@/lib/process-figure';

/**
 * Documentation, one page for every reader in the order of the Word file — ADR-127, built as
 * `docs/roadmap/documentation-v2-mockup.html` shows (amends ADR-107; one page, ADR-126 (1)).
 *
 *   the answer         what it does, Starts · Ends · Needs a decision, *Ready to hand over* with Word first, four numbers
 *   On this page       the shared bar (ADR-126 (3)), six items, Export at its right end
 *   1                  Figure 1 (Analyze's map, read-only), the steps in Analyze's phases, a step's page in place
 *   2–4 side by side   rules · when a case stops · what it changes
 *   5                  systems and data, every object by technical name in a fold
 *   6–7 side by side   who does what (roles from the code, read-only) · open questions (Analyze's)
 *   appendix           folds with counts
 *   the end            "That is the whole description." · the next tool
 *
 * No input anywhere (owner, 10.10.2026: the tool is a help). Pure presentation: the page model comes in
 * (`lib/documentation-page.ts`), the exports, the model's RACI proposal and the appendix's folds are handed in as
 * props and slots by the stage and by the demo, so both render the same page.
 */

export type DocExportKind = 'docx' | 'html' | 'md' | 'print' | 'bpmn';

export interface DocumentationOnePageProps {
  page: DocumentationPage;
  document: ProcessDocument;
  /** The program's business name — the answer's question names it. */
  title: string;
  /** "Z_MM_PO_APPROVAL · 552 lines · signed run of 12 Nov 2026" — under the answer. */
  sourceLine?: string | null;
  /** The ways out that exist (a demo has none), and what a click does. */
  exports?: {
    kinds: readonly DocExportKind[];
    onExport: (kind: DocExportKind) => void;
    note?: React.ReactNode;
    /** The documentation is out of date: the Confluence button says so (`data-export-confluence="stale"`) and points at the note. */
    stale?: boolean;
    /** The id of the note that says it is stale. */
    staleNoteId?: string;
  } | null;
  /** Said where the exports stand when there are none (the demo). */
  noExportNote?: React.ReactNode;
  /** Analyze of this project — "Open the map in Analyze", a line's code. Null in the demo. */
  analyzeHref?: string | null;
  /** Where the open questions are answered — the project's one list. */
  questionsHref?: string | null;
  /** The next tool in the tool order (ADR-128): its name, where it is, one sentence. */
  next?: { label: string; href: string; sentence: string } | null;
  /** Under the roles of chapter 6: the model's RACI proposal, read-only, and the owner's way to ask for one. */
  roles?: React.ReactNode;
  /** The appendix's folds the stage adds: the complete appendix, revisions, the Level D register, "Read again". */
  appendix?: React.ReactNode;
  /** Something the page says above the answer — a stale strip, a status line while the code is read. */
  before?: React.ReactNode;
}

/* ------------------------------------------------------------------ small parts */

const CARD = 'min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-5 shadow-cc max-[720px]:p-4';

const lines = (a: DocAnchor) => (a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`);

/** A line anchor, quiet, in Analyze's notation; with Analyze at hand it opens the code there. */
function Anchor({ anchor, analyzeHref }: { anchor: DocAnchor; analyzeHref?: string | null }) {
  const text = lines(anchor);
  const cls = 'ml-1 inline-flex items-center rounded-cc-row border border-cc-line bg-cc-surface-muted px-1 font-cc-mono cc-text-meta font-medium text-cc-ink-muted no-underline align-baseline whitespace-nowrap';
  if (analyzeHref) {
    return (
      <a href={`${analyzeHref}#L${anchor.lineStart}`} data-doc-anchor={text} title={`Lines ${text.slice(1)} — opens the code in Analyze`} className={cn(cls, 'hover:text-cc-ink')}>
        {text}
      </a>
    );
  }
  return (
    <span data-doc-anchor={text} title={`Lines ${text.slice(1)} of the source`} className={cls}>
      {text}
    </span>
  );
}

function Anchors({ anchors, analyzeHref, max = 2 }: { anchors: readonly DocAnchor[]; analyzeHref?: string | null; max?: number }) {
  const seen = new Set<string>();
  const unique = anchors.filter((a) => {
    const k = lines(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <>
      {unique.slice(0, max).map((a) => (
        <Anchor key={lines(a)} anchor={a} analyzeHref={analyzeHref} />
      ))}
      {unique.length > max ? <span className="ml-1 cc-text-meta text-cc-ink-muted">+{unique.length - max}</span> : null}
    </>
  );
}

/** The program's own name, quiet, after a business word. */
function Tech({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 font-cc-mono cc-text-meta font-medium text-cc-ink-muted [overflow-wrap:anywhere]">{children}</span>;
}

/** A chapter card: its number, its title, its chips, a link at the right, then the lead and the body. */
function Chapter({
  chapter,
  chips,
  link,
  lead,
  children,
  className,
}: {
  chapter: DocChapterKey;
  chips?: React.ReactNode;
  link?: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const c = chapterOf(chapter);
  return (
    <section id={c.id} aria-labelledby={`${c.id}-h`} data-doc-chapter={c.key} className={cn(CARD, 'scroll-mt-32', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-cc-surface-muted cc-text-meta text-cc-ink">
          {c.number}
        </span>
        <h2 id={`${c.id}-h`} tabIndex={-1} className="m-0 cc-text-h2 text-cc-ink">
          <span className="sr-only">{c.number}. </span>
          {c.title}
        </h2>
        {chips}
        {link ? <span className="ml-auto cc-no-print">{link}</span> : null}
      </div>
      {lead ? <p className="m-0 mt-2 max-w-3xl cc-text-body text-cc-ink">{lead}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

/** A fold: one line with a count, its content on a click. Open in print. */
function Fold({ title, count, icon, children, id, open }: { title: React.ReactNode; count?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; id?: string; open?: boolean }) {
  return (
    <details data-doc-fold={id ?? ''} open={open} className="group rounded-cc-row border border-cc-line bg-cc-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 cc-text-cell font-semibold text-cc-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} aria-hidden={true} className="shrink-0 transition-transform group-open:rotate-90" />
        {icon}
        <span className="min-w-0">{title}</span>
        {count !== undefined && count !== null ? <span className="ml-auto cc-text-meta text-cc-ink-muted">{count}</span> : null}
      </summary>
      <div className="border-t border-cc-line px-3 py-3">{children}</div>
    </details>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ Figure 1 */

/**
 * Figure 1 on screen: the same drawing the files carry (`lib/process-figure.ts`), a step a button that opens its page.
 * On a phone the figure steps back for a line; the steps read as the list below it (mock-up, phone).
 */
export function DocFigure({ figure, open, onStep }: { figure: ProcessFigure; open: number | null; onStep: (position: number) => void }) {
  const { x, y, width, height } = figure.box;
  return (
    <figure data-doc-figure="" className="m-0">
      <div className="overflow-x-auto rounded-cc-row border border-cc-line bg-cc-surface max-sm:hidden">
        <svg
          role="img"
          aria-label={figureCaption(figure)}
          viewBox={`${x} ${y} ${width} ${height}`}
          className="block h-auto w-full"
          style={{ minWidth: Math.min(width, Math.max(720, width * 0.6)) }}
        >
          <g fill="none" stroke="var(--cc-ink-muted)" strokeWidth={1.5}>
            {figure.edges.map((e) => (
              <path key={e.id} d={`M${e.points.map((p) => `${p.x} ${p.y}`).join(' L')}`} />
            ))}
          </g>
          <g fill="var(--cc-ink-muted)">
            {figure.edges.map((e) => (
              <path key={e.id} d={arrowHead(e.points)} />
            ))}
            {figure.edges.filter((e) => e.label).map((e) => {
              const at = edgeLabelAt(e);
              return (
                <text key={e.id} x={at.x} y={at.y} fontSize={11}>
                  {e.label}
                </text>
              );
            })}
          </g>
          {figure.shapes.map((s) => {
            const g = shapeGeometry(s);
            const o = g.outline;
            const here = s.step !== null && s.step === open;
            const stroke = here ? 'var(--cc-brand-strong)' : o.strong ? 'var(--cc-ink)' : 'var(--cc-ink-muted)';
            const strokeWidth = here || o.strong ? 3 : 1.5;
            const shape = o.kind === 'rect'
              ? <rect x={o.x} y={o.y} width={o.width} height={o.height} rx={10} fill="var(--cc-surface)" stroke={stroke} strokeWidth={strokeWidth} />
              : o.kind === 'diamond'
                ? <path d={`M${o.x + o.width / 2} ${o.y} L${o.x + o.width} ${o.y + o.height / 2} L${o.x + o.width / 2} ${o.y + o.height} L${o.x} ${o.y + o.height / 2} Z`} fill="var(--cc-surface)" stroke={stroke} strokeWidth={strokeWidth} />
                : <circle cx={o.x + o.width / 2} cy={o.y + o.height / 2} r={Math.min(o.width, o.height) / 2} fill="var(--cc-surface)" stroke={stroke} strokeWidth={strokeWidth} />;
            const body = (
              <>
                <title>{`${s.name}${s.anchor ? ` · ${s.anchor}` : ''}`}</title>
                {shape}
                {g.number ? (
                  <>
                    <circle cx={g.number.cx} cy={g.number.cy} r={9} fill="var(--cc-surface-muted)" />
                    <text x={g.number.cx} y={g.number.cy + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="var(--cc-ink)">
                      {g.number.text}
                    </text>
                  </>
                ) : null}
                {g.name.map((t, i) => (
                  <text key={i} x={t.x} y={t.y} fontSize={12} textAnchor="middle" fill="var(--cc-ink)">
                    {t.text}
                  </text>
                ))}
                {g.anchor ? (
                  <text x={g.anchor.x} y={g.anchor.y} fontSize={11} textAnchor="middle" fill="var(--cc-ink-muted)" fontFamily="var(--font-cc-mono, monospace)">
                    {g.anchor.text}
                  </text>
                ) : null}
              </>
            );
            if (s.step === null) return <g key={s.id} data-doc-figure-element={s.id}>{body}</g>;
            return (
              <g
                key={s.id}
                data-doc-figure-step={s.step}
                role="button"
                tabIndex={0}
                aria-label={`Step ${s.step}: ${s.name}${s.anchor ? `, ${s.anchor}` : ''}`}
                aria-pressed={here}
                className="cursor-pointer"
                onClick={() => onStep(s.step as number)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onStep(s.step as number);
                  }
                }}
              >
                {body}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-2 cc-text-cell text-cc-ink-muted max-sm:hidden">
        <strong className="text-cc-ink">Figure 1</strong> · {figureCaption(figure).replace(/^Figure 1 · /, '')} · the same picture as in Analyze and in every file
      </figcaption>
      <p data-doc-figure-phone="" className="m-0 hidden items-start gap-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 cc-text-cell text-cc-ink-muted max-sm:flex">
        <MapIcon size={16} aria-hidden={true} className="mt-1 shrink-0" />
        <span>Figure 1, the process map, is in every export and in Analyze. On a phone the steps read as a list.</span>
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------------ a step's page */

function ObjectList({ items, writes }: { items: DocStep['reads']; writes?: boolean }) {
  if (items.length === 0) return <span className="cc-text-cell text-cc-ink-muted">Nothing.</span>;
  return (
    <span className="flex flex-wrap gap-2">
      {items.map((o) => (
        <span key={`${o.name}-${o.line}`} className={cn('inline-flex items-center gap-1 rounded-cc-row border px-2 py-1 cc-text-cell text-cc-ink', writes ? 'border-cc-warning-border bg-cc-warning-bg' : 'border-cc-line bg-cc-surface-muted')}>
          {writes ? <PenLine size={12} aria-hidden={true} /> : <Database size={12} aria-hidden={true} />}
          {o.plain ?? o.name}
          {o.plain ? <Tech>{o.name}</Tech> : null}
        </span>
      ))}
    </span>
  );
}

/** ADR-107's step page, opened in place: one sentence, then Decides · Stops when · Reads · Changes, the code on a click. */
export function DocStepPage({
  step,
  total,
  phaseTitle,
  analyzeHref,
  onStep,
  onClose,
}: {
  step: DocStep;
  total: number;
  phaseTitle: string;
  analyzeHref?: string | null;
  onStep: (position: number) => void;
  onClose: () => void;
}) {
  const row = (label: React.ReactNode, body: React.ReactNode) => (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 border-t border-cc-line py-2 max-sm:grid-cols-1 max-sm:gap-1">
      <span className="inline-flex items-center gap-1 cc-text-meta text-cc-ink-muted">{label}</span>
      <div className="min-w-0 cc-text-cell text-cc-ink">{body}</div>
    </div>
  );
  const facts = (list: DocStep['decides'], none: string) => (list.length
    ? (
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {list.map((f, i) => (
          <li key={i}>
            {f.text}
            {f.ref ? <span className="ml-1 font-cc-mono cc-text-meta text-cc-ink-muted">{f.ref}</span> : null}
            <Anchors anchors={f.anchors} analyzeHref={analyzeHref} max={1} />
          </li>
        ))}
      </ul>
    )
    : <span className="text-cc-ink-muted">{none}</span>);
  return (
    <article data-doc-step-page={step.position} aria-labelledby={`doc-step-${step.position}-h`} className="mt-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 cc-text-meta text-cc-ink-muted">
            Step {step.position} of {total} · {phaseTitle}
            <Anchors anchors={step.anchors} analyzeHref={analyzeHref} max={1} />
          </p>
          <h3 id={`doc-step-${step.position}-h`} className="m-0 mt-1 cc-text-h3 text-cc-ink">
            {step.name}
            {step.aiName ? <span className="ml-2 align-middle"><FamilyChip kind="ai" /></span> : null}
          </h3>
        </div>
        <div className="flex gap-1 cc-no-print">
          <CcButton variant="ghost" density="compact" onClick={() => onStep(step.position - 1)} disabled={step.position <= 1} aria-label="Previous step">Back</CcButton>
          <CcButton variant="ghost" density="compact" onClick={() => onStep(step.position + 1)} disabled={step.position >= total} aria-label="Next step">Next</CcButton>
          <CcButton variant="ghost" density="compact" onClick={onClose} aria-label="Close the step">Close</CcButton>
        </div>
      </div>
      <p className="m-0 mt-2 cc-text-body text-cc-ink">{step.sentence}</p>
      <div className="mt-3">
        {row(<>◇ Decides</>, facts(step.decides, 'No decision in this step.'))}
        {row(<><CircleMinus size={12} aria-hidden={true} /> Stops when</>, facts(step.stops, 'No early end here.'))}
        {row(<><Eye size={12} aria-hidden={true} /> Reads</>, <ObjectList items={step.reads} />)}
        {row(<><PenLine size={12} aria-hidden={true} /> Changes</>, <ObjectList items={step.changes} writes />)}
      </div>
      {step.gateAfter ? (
        <p className="m-0 mt-2 flex items-start gap-2 cc-text-cell text-cc-ink-muted">
          <Info size={14} aria-hidden={true} className="mt-1 shrink-0" />
          <span>After this step: <strong className="text-cc-ink">{step.gateAfter.label}</strong> {step.gateAfter.line}</span>
        </p>
      ) : null}
      <p className="m-0 mt-2 flex flex-wrap items-center gap-2 cc-text-cell text-cc-ink-muted">
        <Code2 size={14} aria-hidden={true} />
        <span>For developers:</span>
        <Tech>{step.technicalName}</Tech>
        {analyzeHref && step.anchors[0] ? (
          <a href={`${analyzeHref}#L${step.anchors[0].lineStart}`} className="text-cc-ink underline">
            Open the code in Analyze
          </a>
        ) : null}
      </p>
    </article>
  );
}

/* ------------------------------------------------------------------ chapters */

function rulesRows(doc: ProcessDocument) {
  return doc.rules.map((r) => ({
    key: `${r.ref}|${r.condition}|${r.effect}`,
    text: r.condition && r.effect ? `${r.condition} → ${r.effect}` : r.condition || r.effect,
    ref: /^BR-\d+$/.test(r.ref) ? r.ref : null,
    anchors: r.anchors,
  }));
}

const RULES_SHOWN = 7;

function RulesChapter({ doc, businessRules, analyzeHref }: { doc: ProcessDocument; businessRules: number; analyzeHref?: string | null }) {
  const [all, setAll] = useState(false);
  const rows = rulesRows(doc);
  const shown = all ? rows : rows.slice(0, RULES_SHOWN);
  return (
    <Chapter
      chapter="rules"
      lead={rows.length
        ? <>{plural(businessRules, 'business rule')} decide the outcome{rows.length > businessRules ? <>, with {plural(rows.length - businessRules, 'more decision point')} in the code</> : null}.</>
        : 'No business rule and no decision point changes the path.'}
    >
      {rows.length ? (
        <>
          <ul className="m-0 flex list-none flex-col p-0">
            {shown.map((r) => (
              <li key={r.key} className="flex items-start justify-between gap-3 border-t border-cc-line py-2 cc-text-cell text-cc-ink first:border-t-0">
                <span className="min-w-0">{r.text}</span>
                <span className="shrink-0 text-right">
                  {r.ref ? <span className="font-cc-mono cc-text-meta text-cc-ink-muted">{r.ref}</span> : null}
                  <Anchors anchors={r.anchors} analyzeHref={analyzeHref} max={1} />
                </span>
              </li>
            ))}
          </ul>
          {rows.length > RULES_SHOWN && !all ? (
            <span className="cc-no-print">
              <CcButton variant="ghost" density="compact" onClick={() => setAll(true)} data-doc-rules-all="">
                Show all {rows.length} rules
              </CcButton>
            </span>
          ) : null}
        </>
      ) : null}
      <p className="m-0 mt-3 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
        <FamilyChip kind="engine" />
        Read from the conditions
      </p>
    </Chapter>
  );
}

function StopsChapter({ page, doc, analyzeHref }: { page: DocumentationPage; doc: ProcessDocument; analyzeHref?: string | null }) {
  const ends = page.ends;
  const max = Math.max(1, ...(ends?.rows.map((r) => r.count) ?? [1]));
  const going = doc.exceptions.filter((e) => /continues/i.test(resultWord(e.outcome))).slice(0, 4);
  return (
    <Chapter chapter="stops" lead={ends ? ends.sentence : 'The map shows no end for a case.'}>
      {ends ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ends.rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-center gap-2 cc-text-cell text-cc-ink">
              <span className="min-w-0">
                {r.label}
                {r.detail ? <small className="block cc-text-meta font-medium text-cc-ink-muted [overflow-wrap:anywhere]">{r.detail}</small> : null}
              </span>
              <span aria-hidden="true" className="h-2 rounded-full bg-cc-ink-muted" style={{ width: `${Math.max(8, Math.round((r.count / max) * 100))}%` }} />
              <span className="text-right tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {going.length ? (
        <>
          <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">Problems that do not stop the run</p>
          <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
            {going.map((e, i) => (
              <li key={i} className="flex items-start gap-2 cc-text-cell text-cc-ink">
                <TriangleAlert size={14} aria-hidden={true} className="mt-1 shrink-0 text-cc-warning" />
                <span>{e.shown ? `“${e.shown}”` : e.what}<Anchors anchors={e.anchors} analyzeHref={analyzeHref} max={1} /></span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="m-0 mt-3 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
        <FamilyChip kind="engine" />
        Counted from the map&apos;s ends and the program&apos;s messages
      </p>
    </Chapter>
  );
}

const dataWord = (d: PdData) => d.meaning ?? d.name;

function ChangesChapter({ doc, analyzeHref }: { doc: ProcessDocument; analyzeHref?: string | null }) {
  const writes = doc.writes ?? [];
  const reads = doc.trigger.data.filter((d) => !writes.some((w) => w.name === d.name));
  return (
    <Chapter
      chapter="changes"
      lead={writes.length || doc.outputs.length
        ? <>It changes <strong>{plural(writes.length, 'kind of record', 'kinds of records')}</strong>{reads.length ? <> and only reads {reads.length}</> : null}.</>
        : 'No change of data and no output in the code an entry point reaches.'}
    >
      {writes.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {writes.map((w) => (
            <li key={w.name} className="flex items-start justify-between gap-3 border-t border-cc-line py-2 cc-text-cell text-cc-ink first:border-t-0">
              <span className="min-w-0">
                <strong>{dataWord(w)}</strong>
                {w.meaning ? <Tech>{w.name}</Tech> : null}
                {w.owner === 'Customer' ? <small className="block cc-text-meta font-medium text-cc-ink-muted">the company&apos;s own table</small> : null}
              </span>
              <span className="shrink-0 cc-text-meta text-cc-warning">changes<Anchors anchors={w.anchors} analyzeHref={analyzeHref} max={1} /></span>
            </li>
          ))}
        </ul>
      ) : null}
      {doc.outputs.length ? (
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
          {doc.outputs.slice(0, 4).map((o, i) => (
            <li key={i} className="cc-text-cell text-cc-ink">
              {o.what}
              <Anchors anchors={o.anchors} analyzeHref={analyzeHref} max={1} />
            </li>
          ))}
        </ul>
      ) : null}
      {reads.length ? (
        <p className="m-0 mt-3 cc-text-cell text-cc-ink-muted">
          <strong className="text-cc-ink">Only reads:</strong> {reads.slice(0, 8).map(dataWord).join(', ')}{reads.length > 8 ? `, and ${reads.length - 8} more` : ''}.
        </p>
      ) : null}
      <p className="m-0 mt-3 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
        <FamilyChip kind="engine" />
        From the program&apos;s reads and writes
      </p>
    </Chapter>
  );
}

function SystemsChapter({ doc, analyzeHref }: { doc: ProcessDocument; analyzeHref?: string | null }) {
  const reads = doc.trigger.data;
  const own = reads.filter((d) => d.owner === 'Customer').length;
  const writes = doc.writes ?? [];
  const groups: Array<[string, Array<{ name: string; anchors: DocAnchor[] }>]> = [
    ['Reads', reads],
    ['Changes', writes],
    ['Calls', doc.integrations],
    ['Controls', doc.controls.map((c) => ({ name: c.detail ?? c.text, anchors: c.anchors }))],
  ];
  const rows = groups.filter(([, items]) => items.length > 0).map(([kind, items]) => ({
    key: kind,
    cells: {
      kind: `${kind} (${items.length})`,
      objects: <span className="font-cc-mono cc-text-meta font-medium text-cc-ink-muted [overflow-wrap:anywhere]">{items.map((i) => i.name).join(', ')}</span>,
      lines: <Anchors anchors={items.flatMap((i) => i.anchors)} analyzeHref={analyzeHref} max={2} />,
    },
  }));
  const total = reads.length + writes.length + doc.integrations.length + doc.controls.length;
  return (
    <Chapter
      chapter="systems"
      chips={<FamilyChip kind="engine" />}
      lead={reads.length || doc.integrations.length
        ? <>Reads <strong>{plural(reads.length, 'table')}</strong>{own ? <>, {own} of them the company&apos;s own</> : null}; calls <strong>{plural(doc.integrations.length, 'interface')}</strong>{writes.length ? <>; changes {plural(writes.length, 'table')}</> : null}.</>
        : 'It reads no table by name and calls no function module, transaction or other program by name.'}
    >
      {total ? (
        <Fold id="systems" title="Every table, call and control, by technical name" count={plural(total, 'object')} icon={<Database size={14} aria-hidden={true} />}>
          <CcTable
            caption="Every table, call and control, by technical name"
            columns={[{ key: 'kind', label: 'Kind' }, { key: 'objects', label: 'Objects' }, { key: 'lines', label: 'Lines' }]}
            rows={rows}
          />
        </Fold>
      ) : null}
    </Chapter>
  );
}

function RolesChapter({ page, analyzeHref, children }: { page: DocumentationPage; analyzeHref?: string | null; children?: React.ReactNode }) {
  return (
    <Chapter
      chapter="roles"
      lead={page.roles.length
        ? <>{plural(page.roles.length, 'role appears', 'roles appear')} in the code. Who does which part is a proposal for the business to confirm; who answers for the whole process is left to your own standard.</>
        : 'The code names no role. Who does which part is left to the business and to your own standard.'}
    >
      {page.roles.length ? (
        <ul className="m-0 flex list-none flex-col p-0" data-doc-roles="">
          {page.roles.map((r, i) => (
            <li key={i} className="border-t border-cc-line py-2 cc-text-cell text-cc-ink first:border-t-0">
              <strong>{r.role}</strong> {r.text}
              <Anchors anchors={r.anchors} analyzeHref={analyzeHref} max={1} />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="m-0 mt-3 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
        <FamilyChip kind="engine" note="the roles" />
        <FamilyChip kind="not-determined" note="who answers for it" />
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
    </Chapter>
  );
}

function QuestionsChapter({ page, questionsHref, analyzeHref }: { page: DocumentationPage; questionsHref?: string | null; analyzeHref?: string | null }) {
  const open = page.questions.length + page.questionsMore;
  return (
    <Chapter
      chapter="questions"
      chips={<FamilyChip kind="not-determined" />}
      link={questionsHref ? (
        <Link href={questionsHref} className="inline-flex items-center gap-1 cc-text-cell text-cc-ink underline">
          Answer them in the project&apos;s list <ArrowRight size={14} aria-hidden={true} />
        </Link>
      ) : null}
      lead={open
        ? <>{plural(open, 'question')} the code cannot answer, for the process owner: the same, in the same words, as in Analyze.</>
        : 'No question is left open.'}
    >
      {page.questions.length ? (
        <ol className="m-0 flex list-none flex-col gap-2 p-0" data-doc-questions="">
          {page.questions.map((q) => (
            <li key={q.number} className="flex items-start gap-2 cc-text-cell text-cc-ink">
              <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-cc-warning-border bg-cc-warning-bg cc-text-meta text-cc-warning">{q.number}</span>
              <span className="min-w-0">{q.text}<Anchors anchors={q.anchors} analyzeHref={analyzeHref} max={1} /></span>
            </li>
          ))}
        </ol>
      ) : null}
      {page.questionsMore ? <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">{plural(page.questionsMore, 'more question')} in the project&apos;s list.</p> : null}
    </Chapter>
  );
}

/* ------------------------------------------------------------------ the page */

const EXPORT_LABELS: Record<DocExportKind, { label: string; hint: string; icon: React.ReactNode }> = {
  docx: { label: 'Export as Word (.docx)', hint: 'cover, chapters, Figure 1, appendix', icon: <Download size={16} aria-hidden={true} /> },
  html: { label: 'Confluence', hint: 'a page to paste', icon: <BookOpenText size={16} aria-hidden={true} /> },
  md: { label: 'Markdown', hint: 'for a wiki or repo', icon: <FileCode2 size={16} aria-hidden={true} /> },
  print: { label: 'Print / PDF', hint: 'from the browser', icon: <Printer size={16} aria-hidden={true} /> },
  bpmn: { label: 'BPMN 2.0', hint: 'for SAP Signavio', icon: <Workflow size={16} aria-hidden={true} /> },
};

const EXPORT_ATTRS: Record<DocExportKind, Record<string, string>> = {
  docx: { 'data-export-process-docx': '' },
  html: { 'data-export-confluence': '' },
  md: { 'data-export-process-md': '' },
  print: { 'data-export-print': '' },
  bpmn: { 'data-export-bpmn': '' },
};

export default function DocumentationOnePage({
  page,
  document: doc,
  title,
  sourceLine,
  exports,
  noExportNote,
  analyzeHref,
  questionsHref,
  next,
  roles,
  appendix,
  before,
}: DocumentationOnePageProps) {
  const [open, setOpen] = useState<number | null>(null);
  // Printed, the page is the document (ADR-127): every fold opens for the print, the appendix included.
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const unfold = () => root.current?.querySelectorAll('details').forEach((d) => { d.open = true; });
    window.addEventListener('beforeprint', unfold);
    return () => window.removeEventListener('beforeprint', unfold);
  }, []);
  const total = page.steps.length;
  const openStep = (position: number) => {
    if (position < 1 || position > total) return;
    setOpen(position);
  };
  const jump = (id: string) => {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    const h = el.querySelector('h2');
    (h ?? el).focus?.({ preventScroll: true });
  };
  const kinds = exports?.kinds ?? [];
  const word = kinds.includes('docx');
  const others = kinds.filter((k) => k !== 'docx');
  const exportButton = (kind: DocExportKind) => (
    <CcButton
      key={kind}
      variant="secondary"
      density="cozy"
      onClick={() => exports?.onExport(kind)}
      icon={EXPORT_LABELS[kind].icon}
      title={`${EXPORT_LABELS[kind].label}: ${EXPORT_LABELS[kind].hint}`}
      aria-label={kind === 'html' ? 'Export Confluence' : kind === 'bpmn' ? 'Export BPMN 2.0' : undefined}
      {...EXPORT_ATTRS[kind]}
      {...(kind === 'html' ? { 'data-export-confluence': exports?.stale ? 'stale' : 'current', 'aria-describedby': exports?.stale ? exports.staleNoteId : undefined } : {})}
    >
      {EXPORT_LABELS[kind].label}
    </CcButton>
  );
  const facets: FacetProps[] = page.answer.counts.map((c) => ({
    id: c.key,
    label: c.label,
    value: c.value === null ? 'Not determined' : String(c.value),
    note: c.note,
    chip: <FamilyChip kind={c.source === 'reconstructed' ? 'engine' : 'not-determined'} note={`chapter ${chapterOf(c.chapter).number}`} />,
    onClick: () => jump(chapterOf(c.chapter).id),
  }));
  const anchors = documentationAnchors(page);
  const phaseTitle = (step: DocStep) => page.phases[step.phase]?.title ?? '';

  return (
    <div ref={root} data-documentation-one-page="" data-process-document="">
      {before}
      <div id={DOC_EXPORT_ID} tabIndex={-1} className="scroll-mt-32">
        <AnswerCard
          id={DOC_ANSWER_ID}
          question={<>{title} · Process description · read from the code</>}
          chips={<FamilyChip kind="engine" />}
          answer={page.answer.does.map((s) => s.text).join(' ') || 'The process description of this program, read from its code.'}
          after={(
            <>
              <dl data-doc-answer-facts="" className="m-0 grid gap-2 cc-text-cell text-cc-ink">
                {page.answer.starts ? (
                  <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2 max-sm:grid-cols-1 max-sm:gap-0">
                    <dt className="cc-text-meta text-cc-ink-muted">Starts</dt>
                    <dd className="m-0">{page.answer.starts.text}<Anchors anchors={page.answer.starts.anchors} analyzeHref={analyzeHref} max={1} /></dd>
                  </div>
                ) : null}
                <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2 max-sm:grid-cols-1 max-sm:gap-0">
                  <dt className="cc-text-meta text-cc-ink-muted">Ends</dt>
                  <dd className="m-0">{page.answer.ends}</dd>
                </div>
                {page.answer.needsDecision.length ? (
                  <div data-doc-needs-decision="" className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2 max-sm:grid-cols-1 max-sm:gap-0">
                    <dt className="cc-text-meta text-cc-warning">Needs a decision</dt>
                    <dd className="m-0">
                      {page.answer.needsDecision.map((s, i) => (
                        <span key={i} className="block">{s.text}<Anchors anchors={s.anchors} analyzeHref={analyzeHref} max={1} /></span>
                      ))}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {sourceLine ? <p data-doc-source-line="" className="m-0 mt-2 font-cc-mono cc-text-meta font-medium text-cc-ink-muted [overflow-wrap:anywhere]">{sourceLine}</p> : null}
            </>
          )}
          action={word ? (
            <CcButton variant="primary" density="cozy" onClick={() => exports?.onExport('docx')} icon={<FileText size={16} aria-hidden={true} />} {...EXPORT_ATTRS.docx}>
              {EXPORT_LABELS.docx.label}
            </CcButton>
          ) : undefined}
          actionNote={kinds.length ? (
            <span data-doc-ready="" className="flex items-start gap-2">
              <FamilyChip kind="engine" />
              <span><strong className="text-cc-ink">Ready to hand over</strong> as a description of today&apos;s program. Every format is the complete document, Figure 1 included. Left to your own standard: owner, approval, version.</span>
            </span>
          ) : noExportNote ?? undefined}
          moreActions={others.length ? (
            <div data-documentation-exports="" className="flex w-full flex-wrap gap-2">
              {others.map(exportButton)}
              {exports?.note ? <div className="basis-full">{exports.note}</div> : null}
            </div>
          ) : undefined}
          facets={facets}
        />
      </div>

      {/* A direct child of the element that runs to the page's foot, so it stays in view to the last chapter. */}
      <PageAnchorBar
        anchors={anchors}
        label="On this page"
        name="doc-nav"
        plural="doc-chapters"
        className="mt-6"
        onJump={(event, anchor) => {
          event.preventDefault();
          jump(anchor.target);
        }}
        action={word ? (
          <CcButton variant="primary" density="compact" onClick={() => jump(DOC_EXPORT_ID)} icon={<Download size={14} aria-hidden={true} />}>
            Export
          </CcButton>
        ) : undefined}
      />

      <div className="mt-6 flex flex-col gap-6">
        <Chapter
          chapter="process"
          chips={<FamilyChip kind="engine" />}
          link={analyzeHref ? (
            <a href={analyzeHref} className="inline-flex items-center gap-1 cc-text-cell text-cc-ink underline">
              <MapIcon size={14} aria-hidden={true} /> Open the map in Analyze
            </a>
          ) : null}
          lead={<>The same map as in Analyze and the same picture as in the Word file. <strong>Select a step</strong>, on the map or in the list, to read what it decides, reads and changes.</>}
        >
          {page.figure ? <DocFigure figure={page.figure} open={open} onStep={openStep} /> : null}
          <div data-doc-phases="" className={cn('mt-4 grid gap-4', page.phases.length > 1 ? 'grid-cols-2 max-[900px]:grid-cols-1' : 'grid-cols-1')}>
            {page.phases.map((phase, k) => (
              <div key={k} data-doc-phase={k + 1} className="min-w-0">
                <p className="m-0 cc-text-label text-cc-ink-muted">Phase {k + 1}</p>
                <h3 className="m-0 mt-1 cc-text-h3 text-cc-ink">{phase.title}</h3>
                {phase.sentence ? <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{phase.sentence}</p> : null}
                <ol className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                  {phase.steps.map((position) => {
                    const step = page.steps[position - 1];
                    const here = open === position;
                    return (
                      <li key={position}>
                        <button
                          type="button"
                          data-doc-step={position}
                          aria-expanded={here}
                          onClick={() => (here ? setOpen(null) : openStep(position))}
                          className={cn(
                            'grid min-h-11 w-full cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-cc-row border px-2 py-1 text-left font-[inherit] cc-text-cell text-cc-ink focus-visible:outline-2 focus-visible:outline-cc-focus',
                            here ? 'border-cc-brand-strong font-semibold' : 'border-cc-line',
                          )}
                        >
                          <span className="inline-flex size-6 items-center justify-center rounded-full bg-cc-surface-muted cc-text-meta text-cc-ink">{position}</span>
                          <span className="min-w-0">{step.name}</span>
                          <span className="font-cc-mono cc-text-meta font-medium text-cc-ink-muted">{step.anchors[0] ? lines(step.anchors[0]) : ''}</span>
                        </button>
                        {step.gateAfter ? (
                          <span className="ml-9 mt-1 block cc-text-meta font-medium text-cc-ink-muted">◇ {step.gateAfter.label}{step.gateAfter.ends ? ' → can end here' : ''}</span>
                        ) : null}
                        {here ? (
                          <DocStepPage step={step} total={total} phaseTitle={phaseTitle(step)} analyzeHref={analyzeHref} onStep={openStep} onClose={() => setOpen(null)} />
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
          <p className="m-0 mt-4 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
            <FamilyChip kind="not-determined" />
            Who carries out each step is not provable from the code: see chapter 6.
          </p>
        </Chapter>

        <div className="grid grid-cols-3 items-start gap-6 max-[1100px]:grid-cols-1">
          <RulesChapter doc={doc} businessRules={page.rules.businessRules} analyzeHref={analyzeHref} />
          <StopsChapter page={page} doc={doc} analyzeHref={analyzeHref} />
          <ChangesChapter doc={doc} analyzeHref={analyzeHref} />
        </div>

        <SystemsChapter doc={doc} analyzeHref={analyzeHref} />

        <div className="grid grid-cols-2 items-start gap-6 max-[1100px]:grid-cols-1">
          <RolesChapter page={page} analyzeHref={analyzeHref}>{roles}</RolesChapter>
          <QuestionsChapter page={page} questionsHref={questionsHref} analyzeHref={analyzeHref} />
        </div>

        <section id={DOC_APPENDIX_ID} aria-labelledby={`${DOC_APPENDIX_ID}-h`} data-doc-appendix="" className={cn(CARD, 'scroll-mt-32')}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="cc-text-label text-cc-ink-muted">Appendix</span>
            <h2 id={`${DOC_APPENDIX_ID}-h`} tabIndex={-1} className="m-0 cc-text-h2 text-cc-ink">Details and evidence</h2>
            <span className="ml-auto cc-text-meta text-cc-ink-muted">printed as the appendix of every file</span>
          </div>
          <p className="m-0 mt-2 max-w-3xl cc-text-body text-cc-ink">Each sentence once, with its lines. Nothing here is new: the chapters above are made from it.</p>
          <div className="mt-3 flex flex-col gap-2">{appendix}</div>
        </section>

        <div data-doc-end="" className="grid grid-cols-2 gap-6 max-[900px]:grid-cols-1 cc-no-print">
          <div className={CARD}>
            <h3 className="m-0 cc-text-h3 text-cc-ink">That is the whole description.</h3>
            <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{DOC_CHAPTERS.length} chapters and the appendix: exactly what the file carries.</p>
            {word ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <CcButton variant="primary" density="cozy" onClick={() => exports?.onExport('docx')} icon={<Download size={16} aria-hidden={true} />}>
                  Export as Word
                </CcButton>
                <CcButton variant="ghost" density="cozy" onClick={() => jump(DOC_EXPORT_ID)}>Other formats</CcButton>
              </div>
            ) : noExportNote ? <div className="mt-3 cc-text-cell text-cc-ink-muted">{noExportNote}</div> : null}
          </div>
          {next ? (
            <div className={CARD}>
              <h3 className="m-0 cc-text-h3 text-cc-ink">Next tool: {next.label}</h3>
              <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{next.sentence}</p>
              <div className="mt-3">
                <CcLinkButton href={next.href} variant="secondary" density="cozy">
                  Open {next.label}
                </CcLinkButton>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** One fold of the appendix — exported for the stage and the demo, so the appendix reads the same in both. */
export { Fold as DocFold };
