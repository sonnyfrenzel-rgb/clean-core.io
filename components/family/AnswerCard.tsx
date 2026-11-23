'use client';

import React, { useId } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The answer card of the tools' family — the first thing under the header on every tool (the family mock-ups of
 * 15.11.2026; ADR-126 – ADR-132, ADR-139, ADR-140): the question the page answers with its provenance chips, the
 * answer in one or two sentences, the condition it rests on, the one primary action with its note beside it, and four
 * facets under a rule.
 *
 *   ┌──────────────────────────────────────────────────────────────┬──────────────────┐
 *   │ Is the program tested?  [Simulation]                          │ [Run the tests]  │
 *   │ Not yet. 12 of 19 business rules have a case; none ran.       │ note under it    │
 *   │ It rests on the generated package of 21.11.                   │                  │
 *   ├───────────────┬───────────────┬───────────────┬──────────────┴──────────────────┤
 *   │ Scenarios     │ Rules covered │ Result        │ Not proven                      │
 *   │ 24            │ 12 of 19      │ Not run       │ 3                               │
 *   └───────────────┴───────────────┴───────────────┴─────────────────────────────────┘
 *
 * Pure presentation: everything comes in by props, nothing is read or stored here. Sizes come from the type scale of
 * `DESIGN.md` §1.2 (owner decision 22.11.2026: the scale wins over the mock-ups): the question 12 px / 600, the answer
 * 15 px / 700, the condition 13 px / 500, a facet's figure 22 px / 800 tabular. Layout follows the family's
 * breakpoints: the action column drops under the answer below 900 px, the facets go from four columns to two below
 * 1100 px, padding 16/20 (phone 16/16), 24 px to the next section.
 */

export interface FacetProps {
  /** The facet's name, e.g. "Released targets". */
  label: React.ReactNode;
  /** The figure or the one word, e.g. "9 of 19". */
  value: React.ReactNode;
  /** A small unit after the figure, e.g. "days". */
  unit?: React.ReactNode;
  /** One line under the figure: where it comes from, or what it counts. */
  note?: React.ReactNode;
  /** A family chip in the label row (`components/family/FamilyChip.tsx`). */
  chip?: React.ReactNode;
  /** The facet jumps to its section: a link (`#s-checks`) … */
  href?: string;
  /** … or runs an action (opens a fold, a drawer). */
  onClick?: () => void;
  /** A stable hook for specs and screenshots (`data-facet`). */
  id?: string;
}

const FACET_CLASS =
  'block min-w-0 border-cc-line px-5 py-4 text-left text-cc-ink no-underline max-[720px]:px-4 max-[720px]:py-3 ' +
  // Four columns: a rule between them. Two columns below 1100 px: no rule after the second, a rule under the first two.
  'border-r last:border-r-0 max-[1100px]:[&:nth-child(2n)]:border-r-0 max-[1100px]:[&:nth-child(-n+2)]:border-b';

/** One facet. Inside `Facets` or `AnswerCard`'s `facets`. */
export function Facet({ label, value, unit, note, chip, href, onClick, id }: FacetProps) {
  const body = (
    <>
      <span className="flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
        {label}
        {chip}
      </span>
      <span className="mt-1 block cc-text-figure text-cc-ink tabular-nums whitespace-nowrap">
        {value}
        {unit ? <small className="ml-1 cc-text-identifier tracking-normal text-cc-ink-muted">{unit}</small> : null}
      </span>
      {note ? <span className="mt-1 block cc-text-cell text-cc-ink-muted">{note}</span> : null}
    </>
  );
  const interactive = 'hover:bg-cc-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cc-focus';
  if (href) {
    return (
      <Link href={href} data-facet={id ?? ''} className={cn(FACET_CLASS, interactive)}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} data-facet={id ?? ''} className={cn(FACET_CLASS, 'w-full cursor-pointer bg-transparent font-[inherit]', interactive)}>
        {body}
      </button>
    );
  }
  return (
    <div data-facet={id ?? ''} className={FACET_CLASS}>
      {body}
    </div>
  );
}

/**
 * The row of facets — four in the family. Flush with the card's edges under a rule; use it inside `AnswerCard`
 * (which draws it from `facets`) or inside another card with `px-5` padding.
 */
export function Facets({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      data-facets=""
      className={cn(
        '-mx-5 mt-4 grid grid-cols-4 border-t border-cc-line max-[1100px]:grid-cols-2 max-[720px]:-mx-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface AnswerCardProps {
  /** The question the page answers, e.g. "What would each choice cost over 5 years?". */
  question: React.ReactNode;
  /** Family chips beside the question — where the answer comes from. */
  chips?: React.ReactNode;
  /** The answer, one or two sentences. */
  answer: React.ReactNode;
  /** The condition the answer rests on, in one line. */
  condition?: React.ReactNode;
  /** More of the left column under the condition (paths, a short list). Keep it short. */
  after?: React.ReactNode;
  /** The one primary action of the page (a `CcButton`/`CcLinkButton`, `variant="primary"`). */
  action?: React.ReactNode;
  /** A note under the action: what it does, what it needs. */
  actionNote?: React.ReactNode;
  /** Further actions under the primary one (ghost or secondary): Analyze's "Add evidence" and "Export" (ADR-140). */
  moreActions?: React.ReactNode;
  /** The four facets. */
  facets?: readonly FacetProps[];
  /** Inside the card, under the facets: an edit panel that opens in place. */
  children?: React.ReactNode;
  /** `id` of the card; the question's heading id derives from it. */
  id?: string;
  className?: string;
}

/**
 * The answer card. Renders a `<section>` named by its question; the question is not a heading of the page outline
 * (the `h1` is the program), the answer is what the card says.
 */
export default function AnswerCard({
  question,
  chips,
  answer,
  condition,
  after,
  action,
  actionNote,
  moreActions,
  facets,
  children,
  id,
  className,
}: AnswerCardProps) {
  const auto = useId();
  const qid = `${id ?? `answer${auto.replace(/[^a-zA-Z0-9_-]/g, '')}`}-q`;
  const side = action || actionNote || moreActions;
  return (
    <section
      id={id}
      aria-labelledby={qid}
      data-answer-card=""
      className={cn(
        'min-w-0 rounded-cc-card border border-cc-line bg-cc-surface px-5 pt-4 shadow-cc max-[720px]:px-4',
        facets && facets.length > 0 ? 'pb-0' : 'pb-4',
        className,
      )}
    >
      <div
        className={cn(
          'grid items-start gap-x-8 gap-y-3',
          side ? 'grid-cols-[minmax(0,1fr)_auto] max-[900px]:grid-cols-1' : 'grid-cols-1',
        )}
      >
        <div className="min-w-0">
          <p id={qid} data-answer-question="" className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 cc-text-meta text-cc-ink-muted">
            {question}
            {chips}
          </p>
          <p data-answer="" className="m-0 mt-2 max-w-[980px] cc-text-h2 text-cc-ink text-pretty">
            {answer}
          </p>
          {condition ? (
            <p data-answer-condition="" className="m-0 mt-2 max-w-[980px] cc-text-cell text-cc-ink-muted">
              {condition}
            </p>
          ) : null}
          {after ? <div className="mt-2">{after}</div> : null}
        </div>
        {side ? (
          <div
            data-answer-next=""
            className="flex w-[290px] min-w-[250px] flex-col items-stretch gap-2 max-[900px]:w-auto max-[900px]:max-w-[420px] max-[900px]:min-w-0 max-[720px]:max-w-none"
          >
            {action}
            {actionNote ? <p className="m-0 cc-text-cell text-cc-ink-muted">{actionNote}</p> : null}
            {moreActions ? <div className="flex flex-wrap gap-2">{moreActions}</div> : null}
          </div>
        ) : null}
      </div>
      {facets && facets.length > 0 ? (
        <Facets>
          {facets.map((f, i) => (
            <Facet key={f.id ?? i} {...f} />
          ))}
        </Facets>
      ) : null}
      {children}
    </section>
  );
}
