'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { revisionTime } from '@/components/process-revisions/RevisionHistory';
import TargetAnchorNote from './TargetAnchorNote';
import type { TargetModel, TargetSubject } from '@/lib/process-target';

/**
 * The Soll — roadmap 3.6.
 *
 * It draws what `buildTargetModel` derived and derives nothing itself. That is
 * not tidiness: the moment a view starts deciding what "open" means, there are
 * two answers to it, and the one on the screen is the one nobody tested.
 *
 * Three things this view refuses to smooth over:
 *
 *   - **`clarify` and undecided are two rows of different kinds**, never one
 *     "open" bucket. One carries a name and a time, the other carries the
 *     sentence that nobody has said anything. They are counted in two places in
 *     the header for the same reason.
 *   - **A subject with no code says so**, in the same words the map uses
 *     (`Unanchored`) and with the reason underneath. `TargetAnchorNote` is where
 *     that lives, so no row here can quietly borrow a line from its neighbour.
 *   - **What was dropped is still shown**, at the bottom, with the lines its
 *     code stood at. A Soll that simply omits it would lose the one thing that
 *     is actually evidenced about it.
 *
 * Presentational: it holds nothing, fetches nothing and writes nothing. The
 * seam that wires it into a stage belongs to whoever owns that stage.
 */

const DISPOSITION_LABELS: Record<TargetSubject['disposition'], string> = {
  kept: 'Kept',
  changed: 'Changed deliberately',
  open: 'Open',
  dropped: 'Not in the target',
};

/** Muted throughout: a disposition is somebody's intention, and green would read as proof. */
const DISPOSITION_CLASSES: Record<TargetSubject['disposition'], string> = {
  kept: 'border-cc-line bg-cc-surface-muted text-cc-ink',
  changed: 'border-cc-information-border bg-cc-information-bg text-cc-information',
  open: 'border-cc-field-border bg-cc-surface text-cc-ink-muted border-dashed',
  dropped: 'border-cc-line bg-cc-surface-muted text-cc-ink-muted',
};

export interface TargetModelViewProps {
  target: TargetModel;
  /** The subject a reader has picked, if any. A selection, never a state. */
  selected?: string | null;
  /** Called with the subject a reader picked. The caller decides what it becomes. */
  onSelect?: (subject: string) => void;
  /** Opens the code card on a row's lines. Rows without an anchor never call it. */
  onOpenAnchor?: (subject: string) => void;
}

function SubjectRow({
  subject,
  selected,
  onSelect,
  onOpenAnchor,
}: {
  subject: TargetSubject;
  selected: boolean;
  onSelect?: (subject: string) => void;
  onOpenAnchor?: (subject: string) => void;
}) {
  const decision = subject.decision;
  return (
    <li
      data-target-subject={subject.subject}
      data-target-disposition={subject.disposition}
      data-target-open-reason={subject.openReason ?? undefined}
      data-target-from-ist={subject.fromIst ? 'true' : 'false'}
      className={cn(
        'flex flex-col gap-1.5 border-b border-cc-line px-3 py-2.5 last:border-b-0',
        selected ? 'bg-cc-information-bg' : null,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-target-disposition-badge={subject.disposition}
          className={cn(
            'inline-block rounded-[4px] border px-1.5 text-[11px] font-semibold leading-[18px] whitespace-nowrap',
            DISPOSITION_CLASSES[subject.disposition],
          )}
        >
          {subject.disposition === 'open' && subject.openReason === 'undecided'
            ? 'Open — nobody has said'
            : subject.disposition === 'open'
              ? 'Open — to clarify'
              : DISPOSITION_LABELS[subject.disposition]}
        </span>
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(subject.subject)}
            className="text-[13px] font-semibold text-cc-ink underline-offset-2 hover:underline"
            data-target-subject-label=""
          >
            {subject.label}
          </button>
        ) : (
          <span className="text-[13px] font-semibold text-cc-ink" data-target-subject-label="">
            {subject.label}
          </span>
        )}
        <span className="text-[12px] font-medium text-cc-ink-muted">{subject.what}</span>
        <TargetAnchorNote
          anchor={subject.anchor}
          anchorBasis={subject.anchorBasis}
          evidenceLabel={subject.evidenceLabel}
          unanchoredReason={subject.unanchoredReason}
          onOpen={subject.anchor && onOpenAnchor ? () => onOpenAnchor(subject.subject) : undefined}
        />
      </div>

      {decision ? (
        <p className="text-[12px] font-medium text-cc-ink-muted" data-target-decision={subject.subject}>
          <span data-target-decision-name="">{decision.account.name}</span>
          {', '}
          <span data-target-decision-time="" title={decision.confirmedAt}>
            {revisionTime(decision.confirmedAt)}
          </span>
          {decision.note ? <span data-target-decision-note="">{` — ${decision.note}`}</span> : null}
        </p>
      ) : (
        <p className="text-[12px] font-medium text-cc-ink-muted" data-target-undecided={subject.subject}>
          Nobody has said anything about this yet.
        </p>
      )}
    </li>
  );
}

export default function TargetModelView({ target, selected, onSelect, onOpenAnchor }: TargetModelViewProps) {
  const { counts } = target;

  return (
    <section data-process-target="" className="flex flex-col gap-3" aria-label="Target model">
      <header className="flex flex-col gap-1.5">
        <p className="text-[13px] font-semibold text-cc-ink" data-target-summary="">
          {target.summary}
        </p>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-cc-ink-muted">
          <li data-target-count="kept">{counts.kept} kept</li>
          <li data-target-count="changed">{counts.changed} changed deliberately</li>
          <li data-target-count="dropped">{counts.dropped} not in the target</li>
          <li data-target-count="clarify">{counts.clarify} to clarify</li>
          <li data-target-count="undecided">{counts.undecided} undecided</li>
          <li data-target-count="needsWithoutCode">{counts.needsWithoutCode} without code</li>
        </ul>
        <p className="text-[12px] font-medium text-cc-ink-muted" data-target-disclaimer="">
          {target.disclaimer}
        </p>
      </header>

      {target.subjects.length === 0 ? (
        <p className="text-[13px] font-medium text-cc-ink-muted" data-target-empty="">
          Nothing is in the target model.
        </p>
      ) : (
        <ul className="rounded-[4px] border border-cc-line" data-target-list="">
          {target.subjects.map((subject) => (
            <SubjectRow
              key={subject.subject}
              subject={subject}
              selected={selected === subject.subject}
              onSelect={onSelect}
              onOpenAnchor={onOpenAnchor}
            />
          ))}
        </ul>
      )}

      {target.dropped.length > 0 ? (
        <div className="flex flex-col gap-1.5" data-target-dropped="">
          <h3 className="text-[13px] font-semibold text-cc-ink">
            {DISPOSITION_LABELS.dropped} ({target.dropped.length})
          </h3>
          <p className="text-[12px] font-medium text-cc-ink-muted">
            These are out of the target model. Their line anchors stay, because the code for them was read.
          </p>
          <ul className="rounded-[4px] border border-cc-line">
            {target.dropped.map((subject) => (
              <SubjectRow
                key={subject.subject}
                subject={subject}
                selected={selected === subject.subject}
                onSelect={onSelect}
                onOpenAnchor={onOpenAnchor}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
