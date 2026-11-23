'use client';

import React from 'react';
import Link from 'next/link';
import { Check, CircleAlert, Minus } from 'lucide-react';
import CcTable from '@/components/cc/Table';
import FamilyChip from '@/components/family/FamilyChip';
import { cn } from '@/lib/utils';
import { DECISION_OPTIONS, DECISION_OPTION_LABELS, DECISION_OPTION_MEANINGS } from '@/lib/decision-options';
import { formatTextDate } from '@/lib/format';
import {
  STEP_MARK_LABELS,
  linesWords,
  type CheckRow,
  type DependencyRow,
  type DesignCase,
  type DesignDecision,
  type DesignObject,
  type StepMark,
  type TargetBoard,
} from '@/lib/design-views';

/**
 * The pieces of the Design tool's three views (ADR-130, `docs/roadmap/design-next-mockup.html`): the program
 * decision beside the answer, the before/after board in Analyze's phases, the object table with its Level, the
 * checklist before sign-off, the four options, Retire's dependencies. Pure presentation: everything comes in by props.
 * Sizes from the type scale of `DESIGN.md` §1.2.
 */

const LINK = 'font-semibold text-cc-information underline-offset-2 hover:underline';

/* ------------------------------------------------------------- the section */

/** One section of the page: an `h2` the "On this page" bar jumps to, a lead, the body. 24 px to the next. */
export function DesignSection({
  id,
  title,
  lead,
  aside,
  children,
}: {
  id: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} data-design-part={id} className="mt-6 min-w-0 scroll-mt-32">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={`${id}-h`} tabIndex={-1} className="m-0 cc-text-h2 text-cc-ink">
            {title}
          </h2>
          {lead ? <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{lead}</p> : null}
        </div>
        {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A white card around a section's body. */
export function DesignCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-5', className)}>{children}</div>;
}

/* ------------------------------------------------------------ the decision */

/**
 * The program decision Design works from (G2), in the answer card's side column: the option, who confirmed it, the
 * cost basis sentence (never an amount, ADR-092) and the ways to Economics and Management. Without a decision it says
 * so plainly, and that Design meanwhile designs a rebuild.
 */
export function DesignDecisionBox({
  decision,
  economicsHref,
  managementHref,
  outside,
  reading = false,
}: {
  decision: DesignDecision;
  /** The decision is still being read: said as such, never as "not taken". */
  reading?: boolean;
  economicsHref: string | null;
  managementHref: string | null;
  outside: boolean;
}) {
  const none = decision.case === 'none';
  if (reading) {
    return (
      <div data-design-decision="reading" className="flex flex-col gap-1 rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-3">
        <span className="cc-text-meta text-cc-ink-muted">Program decision</span>
        <span className="cc-text-cell text-cc-ink-muted">Reading the decision…</span>
      </div>
    );
  }
  const links = [
    economicsHref ? (
      <Link key="e" href={economicsHref} className={LINK} data-design-decision-link="economics">
        {none ? 'Open Economics' : 'Economics'}
      </Link>
    ) : null,
    managementHref ? (
      <Link key="m" href={managementHref} className={LINK} data-design-decision-link="management">
        {none ? 'Decide in Management' : 'Management'}
      </Link>
    ) : null,
  ].filter(Boolean);
  const day = decision.at ? formatTextDate(decision.at) : null;
  return (
    <div
      data-design-decision={decision.case}
      className={cn(
        'flex flex-col gap-1 rounded-cc-row border px-3 py-3',
        none ? 'border-cc-warning-border bg-cc-warning-bg' : 'border-cc-line bg-cc-surface-muted',
      )}
    >
      <span className="cc-text-meta text-cc-ink-muted">Program decision</span>
      <span className="cc-text-h3 text-cc-ink">{none ? 'Not taken yet' : decision.label}</span>
      {none ? (
        <p className="m-0 cc-text-cell text-cc-ink">
          Keep, rebuild, move to SAP standard or retire? Economics prices the options, Management decides. Design meanwhile designs a rebuild.
        </p>
      ) : (
        <>
          <p className="m-0 cc-text-cell text-cc-ink-muted">
            {decision.confirmed ? 'Confirmed in Management' : 'Chosen'}
            {decision.by ? ` by ${decision.by}` : ''}
            {day ? ` on ${day}` : ''}. A self-declaration.
          </p>
          {outside ? (
            <p className="m-0 cc-text-cell font-semibold text-cc-warning" data-design-decision-outdated="">
              Out of date: the route or the costs changed after it was priced.
            </p>
          ) : decision.costLine ? (
            <p className="m-0 cc-text-cell text-cc-ink">{decision.costLine}</p>
          ) : null}
        </>
      )}
      {links.length ? (
        <p className="m-0 flex flex-wrap gap-x-3 cc-text-cell">
          {links}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------- the board */

const MARK_CLASS: Record<StepMark | 'stop', string> = {
  stays: 'border-cc-line',
  changes: 'border-cc-information border-l-4',
  goes: 'border-cc-neutral-border border-dashed bg-cc-surface-muted',
  open: 'border-cc-warning-line border-dashed',
  stop: 'border-cc-neutral-border border-dashed bg-cc-surface-muted',
};

/** The legend over the board: each mark by its border, in words. */
function BoardLegend({ stop }: { stop: boolean }) {
  const items: Array<[StepMark | 'stop', string]> = stop
    ? [['stop', 'Stops with the program']]
    : [
        ['stays', STEP_MARK_LABELS.stays],
        ['changes', STEP_MARK_LABELS.changes],
        ['goes', STEP_MARK_LABELS.goes],
        ['open', STEP_MARK_LABELS.open],
      ];
  return (
    <div role="note" aria-label="Legend" className="mb-3 flex flex-wrap gap-x-4 gap-y-1 cc-text-cell text-cc-ink-muted">
      {items.map(([k, label]) => (
        <span key={k} className="inline-flex items-center gap-2">
          <i aria-hidden="true" className={cn('inline-block h-3 w-4 rounded-[3px] border-2 bg-cc-surface', MARK_CLASS[k])} />
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Before and after (G4): today's steps in Analyze's phases, side by side, each step marked with what the answers on
 * record do to it. A target model is not a statement about the code; the sentence under the board says so.
 * `mode="stop"` marks every step as stopping (Retire); `mode="today"` marks nothing (no answer yet, or a case that
 * changes no step here).
 */
export function DesignTargetBoardView({ board, mode = 'target' }: { board: TargetBoard; mode?: 'target' | 'today' | 'stop' }) {
  if (board.phases.length === 0) {
    return (
      <DesignCard>
        <p className="m-0 cc-text-body text-cc-ink-muted" data-design-board="empty">
          Analyze read no steps from this code, so there is no process to mark.
        </p>
      </DesignCard>
    );
  }
  const marking = mode === 'target' && board.marked;
  return (
    <DesignCard>
      {mode === 'today' ? null : <BoardLegend stop={mode === 'stop'} />}
      <ol
        data-design-board={mode}
        className="m-0 grid list-none grid-cols-4 gap-3 p-0 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1"
      >
        {board.phases.map((phase, i) => (
          <li key={`${phase.title}-${i}`} data-design-phase={i + 1} className="flex min-w-0 flex-col gap-2 rounded-cc-row bg-cc-surface-muted p-3">
            <p className="m-0 flex items-baseline justify-between gap-2 cc-text-meta text-cc-ink-muted">
              <span>
                {i + 1} · {phase.title}
              </span>
              <span className="tabular-nums">{phase.steps.length}</span>
            </p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {phase.steps.map((step, j) => {
                const mark: StepMark | 'stop' = mode === 'stop' ? 'stop' : marking ? step.mark : 'stays';
                const said = mark === 'stop' ? 'Stops' : mark === 'stays' ? null : STEP_MARK_LABELS[mark];
                return (
                  <li
                    key={`${step.anchor}-${j}`}
                    data-design-step={mark}
                    className={cn('min-w-0 rounded-cc-row border bg-cc-surface px-3 py-2', MARK_CLASS[mark])}
                  >
                    {said ? <span className="block cc-text-meta text-cc-ink-muted">{said}</span> : null}
                    <span className="block cc-text-cell font-semibold text-cc-ink">{step.text}</span>
                    {marking && step.note ? <span className="mt-1 block cc-text-cell text-cc-ink-muted">{step.note}</span> : null}
                    <span className="mt-1 block cc-text-meta text-cc-ink-muted" title="The lines this step was read from">
                      {step.anchor}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-3 cc-text-cell text-cc-ink-muted" data-design-board-disclaimer="">
        {board.disclaimer}
        {marking && board.unplaced > 0
          ? ` ${board.unplaced} ${board.unplaced === 1 ? 'answer applies' : 'answers apply'} to no single step and ${board.unplaced === 1 ? 'is' : 'are'} not marked here.`
          : ''}
      </p>
    </DesignCard>
  );
}

/* ---------------------------------------------------------- objects */

function LevelMark({ level }: { level: DesignObject['level'] }) {
  return (
    <span
      data-design-level={level}
      title={level === 'none' ? 'No grade in the SAP catalog (an own object)' : `Level ${level} from the SAP catalog`}
      className="inline-flex min-w-6 items-center justify-center rounded-cc-row border border-cc-neutral-border px-1 cc-text-cell font-bold text-cc-ink"
    >
      {level === 'none' ? 'None' : level}
    </span>
  );
}

/** Every object the code uses (G7): its Level and its released successor from the SAP catalog, never guessed. */
export function DesignObjectTable({ rows, caption, successor = true }: { rows: readonly DesignObject[]; caption: string; successor?: boolean }) {
  if (rows.length === 0) {
    return (
      <DesignCard>
        <p className="m-0 cc-text-body text-cc-ink-muted">The findings name no object for this code.</p>
      </DesignCard>
    );
  }
  const columns = [
    { key: 'object', label: 'Object' },
    { key: 'use', label: 'Use' },
    { key: 'lines', label: 'Lines' },
    { key: 'level', label: 'Level today' },
    ...(successor ? [{ key: 'successor', label: 'Released successor' }, { key: 'confidence', label: 'Confidence' }] : []),
  ];
  return (
    <div data-design-objects="" className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc">
      <CcTable
        caption={caption}
        columns={columns}
        limit={12}
        rows={rows.map((r) => ({
          key: r.name,
          cells: {
            object: <span className="cc-text-identifier">{r.name}</span>,
            use: r.uses.join(', '),
            lines: linesWords(r.lines),
            level: <LevelMark level={r.level} />,
            successor: r.successor ? (
              <span className="flex flex-col">
                <span className="cc-text-identifier">{r.successor}</span>
                {r.successorType ? <span className="cc-text-meta text-cc-ink-muted">{r.successorType}</span> : null}
              </span>
            ) : (
              <span className="text-cc-ink-muted">{r.level === 'none' ? 'Own object' : 'None named'}</span>
            ),
            confidence: r.confidence ?? <span className="text-cc-ink-muted">Not recorded</span>,
          },
        }))}
      />
    </div>
  );
}

/* ------------------------------------------------------- the checklist */

const CHECK_ICON: Record<CheckRow['mark'], React.ReactNode> = {
  ok: <Check size={16} aria-hidden={true} className="text-cc-success" />,
  open: <CircleAlert size={16} aria-hidden={true} className="text-cc-warning" />,
  na: <Minus size={16} aria-hidden={true} className="text-cc-ink-muted" />,
};
const CHECK_WORD: Record<CheckRow['mark'], string> = { ok: 'Done', open: 'Open', na: 'Not bound' };

/** Before sign-off (G8): what stands between the decision and the confirmed target. */
export function DesignChecklist({ rows }: { rows: readonly CheckRow[] }) {
  return (
    <DesignCard>
      <ul data-design-checklist="" className="m-0 flex list-none flex-col divide-y divide-cc-line p-0">
        {rows.map((r) => (
          <li key={r.key} data-design-check={r.mark} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
            <span className="mt-px inline-flex shrink-0" title={CHECK_WORD[r.mark]}>
              {CHECK_ICON[r.mark]}
              <span className="sr-only">{CHECK_WORD[r.mark]}</span>
            </span>
            <span className="min-w-0">
              <span className="block cc-text-cell font-semibold text-cc-ink">{r.label}</span>
              <span className="block cc-text-cell text-cc-ink-muted">{r.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </DesignCard>
  );
}

/* ---------------------------------------------------------- the options */

/** The four options from Management, the decided one marked (G8). Design shows what the chosen one looks like. */
export function DesignOptions({ decided, note }: { decided: DesignCase; note?: Partial<Record<DesignCase, string>> }) {
  return (
    <ul data-design-options="" className="m-0 grid list-none grid-cols-4 gap-3 p-0 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1">
      {DECISION_OPTIONS.map((o) => {
        const on = decided === o;
        return (
          <li
            key={o}
            data-design-option={o}
            aria-current={on ? 'true' : undefined}
            className={cn('flex min-w-0 flex-col gap-1 rounded-cc-row border bg-cc-surface px-3 py-3', on ? 'border-cc-ink border-2' : 'border-cc-line')}
          >
            <span className="cc-text-cell font-bold text-cc-ink">{DECISION_OPTION_LABELS[o]}</span>
            <span className="cc-text-cell text-cc-ink-muted">{note?.[o] ?? DECISION_OPTION_MEANINGS[o]}</span>
            {on ? <span className="mt-1 cc-text-meta text-cc-ink">Decided</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------- dependencies */

/** Retire (G10): what the analysis read, and beside it what it could not read — "Not determined", never "none". */
export function DesignDependencies({ read }: { read: readonly DependencyRow[] }) {
  if (read.length === 0) {
    return (
      <DesignCard>
        <p className="m-0 cc-text-body text-cc-ink-muted">The findings name no table, call or object this program depends on.</p>
      </DesignCard>
    );
  }
  return (
    <div className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc">
      <CcTable
        caption="What the analysis read"
        columns={[
          { key: 'kind', label: 'Kind' },
          { key: 'what', label: 'What' },
          { key: 'lines', label: 'Lines' },
        ]}
        limit={12}
        rows={read.map((r) => ({
          key: `${r.kind}-${r.what}`,
          cells: { kind: r.kind, what: <span className="cc-text-identifier">{r.what}</span>, lines: linesWords(r.lines) },
        }))}
      />
    </div>
  );
}

export function DesignNotRead({ rows }: { rows: ReadonlyArray<{ what: string; why: string }> }) {
  return (
    <DesignCard>
      <ul className="m-0 flex list-none flex-col divide-y divide-cc-line p-0">
        {rows.map((r) => (
          <li key={r.what} className="flex flex-wrap items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
            <span className="min-w-0">
              <span className="block cc-text-cell font-semibold text-cc-ink">{r.what}</span>
              <span className="block cc-text-cell text-cc-ink-muted">{r.why}</span>
            </span>
            <FamilyChip kind="not-determined" />
          </li>
        ))}
      </ul>
    </DesignCard>
  );
}
