'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { revisionTime } from '@/components/process-revisions/RevisionHistory';
import TargetAnchorNote from './TargetAnchorNote';
import { COMPARISON_VERDICTS, VERDICT_LABELS, type Comparison, type ComparisonRow, type ComparisonVerdict } from '@/lib/process-target';

/**
 * Ist against Soll — roadmap 3.6: what stays, what changes, what goes, what is
 * open, what was added.
 *
 * Five groups in a fixed order, every one of them shown even when it is empty.
 * A comparison that hides its empty groups tells a reader that the question was
 * never asked; "0 added without code" is a result and reads as one.
 *
 * **Added is its own group and never sits with the confirmed ones** (C23-A06).
 * An element that exists only in the Soll is somebody's need: it carries no line
 * anchor, it says so in the same words the map uses, and no amount of
 * confirmation moves it into "stays". The mirror case sits in "Not in the
 * target" and keeps its lines, because the code for it was read.
 *
 * Presentational: it holds nothing and fetches nothing.
 */

const VERDICT_CLASSES: Record<ComparisonVerdict, string> = {
  stays: 'border-cc-line bg-cc-surface-muted text-cc-ink',
  changes: 'border-cc-information-border bg-cc-information-bg text-cc-information',
  goes: 'border-cc-line bg-cc-surface-muted text-cc-ink-muted',
  open: 'border-cc-field-border bg-cc-surface text-cc-ink-muted border-dashed',
  added: 'border-cc-field-border bg-cc-surface text-cc-ink-muted border-dashed',
};

export interface IstSollComparisonProps {
  comparison: Comparison;
  /** The subject a reader has picked, if any. A selection, never a state. */
  selected?: string | null;
  onSelect?: (subject: string) => void;
  /** Opens the code card on a row's lines. Rows without an anchor never call it. */
  onOpenAnchor?: (subject: string) => void;
  /** Which groups to draw, in this order. Defaults to all five. */
  verdicts?: readonly ComparisonVerdict[];
}

function Row({
  row,
  selected,
  onSelect,
  onOpenAnchor,
}: {
  row: ComparisonRow;
  selected: boolean;
  onSelect?: (subject: string) => void;
  onOpenAnchor?: (subject: string) => void;
}) {
  return (
    <li
      data-comparison-row={row.subject}
      data-comparison-verdict={row.verdict}
      data-comparison-open-reason={row.openReason ?? undefined}
      data-comparison-in-ist={row.inIst ? 'true' : 'false'}
      className={cn(
        'flex flex-col gap-1.5 border-b border-cc-line px-3 py-2.5 last:border-b-0',
        selected ? 'bg-cc-information-bg' : null,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(row.subject)}
            className="text-[13px] font-semibold text-cc-ink underline-offset-2 hover:underline"
            data-comparison-label=""
          >
            {row.label}
          </button>
        ) : (
          <span className="text-[13px] font-semibold text-cc-ink" data-comparison-label="">
            {row.label}
          </span>
        )}
        <span className="text-[12px] font-medium text-cc-ink-muted">{row.what}</span>
        <TargetAnchorNote
          anchor={row.anchor}
          anchorBasis={row.anchorBasis}
          evidenceLabel={row.evidenceLabel}
          unanchoredReason={row.unanchoredReason}
          onOpen={row.anchor && onOpenAnchor ? () => onOpenAnchor(row.subject) : undefined}
        />
      </div>
      <p className="text-[12px] font-medium text-cc-ink-muted" data-comparison-sentence="">
        {row.sentence}
      </p>
      {row.decision ? (
        <p className="text-[12px] font-medium text-cc-ink-muted" data-comparison-decision={row.subject}>
          <span data-comparison-decision-name="">{row.decision.account.name}</span>
          {', '}
          <span data-comparison-decision-time="" title={row.decision.confirmedAt}>
            {revisionTime(row.decision.confirmedAt)}
          </span>
          {row.decision.note ? <span data-comparison-decision-note="">{` — ${row.decision.note}`}</span> : null}
        </p>
      ) : null}
    </li>
  );
}

export default function IstSollComparison({
  comparison,
  selected,
  onSelect,
  onOpenAnchor,
  verdicts = COMPARISON_VERDICTS,
}: IstSollComparisonProps) {
  const { counts } = comparison;

  return (
    <section data-ist-soll="" className="flex flex-col gap-3" aria-label="The reconstructed process against the target model">
      <header className="flex flex-col gap-1.5">
        <p className="text-[13px] font-semibold text-cc-ink" data-ist-soll-summary="">
          {comparison.summary}
        </p>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-cc-ink-muted">
          <li data-ist-soll-count="stays">{counts.stays} stay</li>
          <li data-ist-soll-count="changes">{counts.changes} change</li>
          <li data-ist-soll-count="goes">{counts.goes} go</li>
          <li data-ist-soll-count="clarify">{counts.clarify} to clarify</li>
          <li data-ist-soll-count="undecided">{counts.undecided} undecided</li>
          <li data-ist-soll-count="added">{counts.added} added without code</li>
        </ul>
        <p className="text-[12px] font-medium text-cc-ink-muted" data-ist-soll-disclaimer="">
          {comparison.disclaimer}
        </p>
      </header>

      {verdicts.map((verdict) => {
        const rows = comparison.byVerdict[verdict];
        return (
          <div key={verdict} data-ist-soll-group={verdict} className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-cc-ink">
              <span
                className={cn(
                  'inline-block rounded-[4px] border px-1.5 text-[11px] font-semibold leading-[18px] whitespace-nowrap',
                  VERDICT_CLASSES[verdict],
                )}
              >
                {VERDICT_LABELS[verdict]}
              </span>
              <span data-ist-soll-group-count={verdict}>{rows.length}</span>
            </h3>
            {rows.length === 0 ? (
              <p className="text-[12px] font-medium text-cc-ink-muted" data-ist-soll-group-empty={verdict}>
                None.
              </p>
            ) : (
              <ul className="rounded-[4px] border border-cc-line">
                {rows.map((row) => (
                  <Row
                    key={row.subject}
                    row={row}
                    selected={selected === row.subject}
                    onSelect={onSelect}
                    onOpenAnchor={onOpenAnchor}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
