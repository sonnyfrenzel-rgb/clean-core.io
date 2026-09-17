'use client';

import React, { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcField from '@/components/cc/Field';
import { CcTag } from '@/components/cc/Tag';
import { revisionTime } from '@/components/process-revisions/RevisionHistory';
import {
  ELEMENT_STATES,
  NOTE_LABELS,
  STATE_LABELS,
  noteRequired,
  type DerivationMark,
  type ElementState,
  type StateEntry,
  type StateSubject,
} from '@/lib/process-states';

/**
 * One element or one rule, and the four answers to *does the business still
 * need this?* — roadmap 3.5, mockup screen s2.
 *
 * Three things this component is careful about:
 *
 *   1. **Nothing is pre-selected.** A subject with no confirmation is not in a
 *      fifth state; it has no state, and a control showing Keep as chosen would
 *      put an answer in somebody's mouth. So the radio group can be empty, and
 *      it is not `CcSegmentedControl` for exactly that reason — that control
 *      takes a required `value` and makes the chosen segment the only tab stop,
 *      which with nothing chosen is a group the keyboard cannot reach at all.
 *   2. **Keep is not "keep this code".** The word is the one most easily
 *      misread, so the help text under the note field says what the answer is
 *      about, and `STATE_MEANING` says it once per screen above the list.
 *   3. **The confirmation shows a name and a time** and nothing else — no tick,
 *      no "verified", no colour that reads as proof. An account said this at a
 *      time. That is the whole claim.
 *
 * Presentational apart from the draft a reader is holding: it fetches nothing
 * and stores nothing. `ProcessStatesPanel` wires it to the route.
 */

export interface StateChoiceProps {
  /** The subject: id, what it is called, its one line of detail, its anchor or null. */
  subject: StateSubject;
  /** The confirmation on record, or null when the subject is undecided. */
  entry: StateEntry | null;
  /** W22-A14: a rule this element was drawn from has moved. Null for a rule, and for an element nothing marks. */
  mark?: DerivationMark | null;
  /** Called with the answer. The caller decides where it goes. */
  onConfirm: (state: ElementState, note: string | null) => void | Promise<void>;
  /** A confirmation is in flight — this card's controls wait for it. */
  busy?: boolean;
  /** Why the last confirmation of *this* subject was refused. */
  error?: string | null;
}

/**
 * The draft lives in this component, so a caller that wants it to follow a
 * confirmation that went through gives the element a `key` that carries the
 * entry's revision — React then remounts it and the draft starts from the
 * record. That is the reset, rather than an effect that writes state back over
 * whatever somebody was typing.
 */
export default function StateChoice({ subject, entry, mark = null, onConfirm, busy = false, error = null }: StateChoiceProps) {
  const [chosen, setChosen] = useState<ElementState | null>(entry?.state ?? null);
  const [note, setNote] = useState(entry?.note ?? '');

  const trimmed = note.trim();
  const missingNote = chosen !== null && noteRequired(chosen) && trimmed === '';
  const moved = chosen !== null
    && (chosen !== (entry?.state ?? null) || (trimmed === '' ? null : trimmed) !== (entry?.note ?? null));

  const noteLabel = NOTE_LABELS[chosen ?? 'keep'];

  return (
    <div
      data-state-subject={subject.subject}
      data-state-kind={subject.kind}
      data-state-value={entry?.state ?? 'undecided'}
      data-state-marked={mark ? 'yes' : undefined}
      className="flex flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13px] font-bold text-cc-ink">{subject.label}</span>
        <code className="rounded-[4px] bg-cc-surface-muted px-1 text-[12px] font-medium text-cc-ink-muted">
          {subject.subject}
        </code>
        <CcTag>{subject.detail}</CcTag>
        {/* C23-A06: no anchor, no placeholder. A need without code gets no invented line. */}
        {subject.anchor ? (
          <span data-state-anchor={subject.subject} className="text-[12px] font-medium text-cc-ink-muted">
            {subject.anchor}
          </span>
        ) : null}
      </div>

      {mark ? (
        <p
          data-state-mark={subject.subject}
          data-state-mark-stale={mark.stale ? 'yes' : 'no'}
          className="flex items-start gap-1.5 text-[12px] font-medium leading-snug text-cc-warning"
        >
          <AlertTriangle size={14} aria-hidden={true} />
          <span>{mark.sentence}</span>
        </p>
      ) : null}

      <span role="radiogroup" aria-label={`Need for ${subject.label}`} className="inline-flex gap-0.5 self-start rounded-cc-row border border-cc-field-border bg-cc-surface-muted p-0.5">
        {ELEMENT_STATES.map((state, index) => {
          const selected = chosen === state;
          return (
            <button
              key={state}
              type="button"
              role="radio"
              aria-checked={selected}
              // With nothing chosen the first segment is the tab stop, so the
              // group is reachable before it has an answer.
              tabIndex={selected || (chosen === null && index === 0) ? 0 : -1}
              disabled={busy}
              data-state-option={state}
              data-state-option-on={selected ? 'yes' : 'no'}
              onClick={() => setChosen(state)}
              className={[
                'inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[12px] whitespace-nowrap disabled:opacity-60',
                selected ? 'bg-cc-ink text-cc-on-dark font-semibold' : 'bg-transparent text-cc-ink-muted font-medium',
              ].join(' ')}
            >
              {selected ? <Check size={12} aria-hidden={true} /> : null}
              {STATE_LABELS[state]}
            </button>
          );
        })}
      </span>

      {chosen ? (
        <CcField
          label={noteLabel}
          required={noteRequired(chosen)}
          help={
            chosen === 'keep'
              ? 'Keep says the business still needs this. It preserves no ABAP and decides nothing about how the need is met.'
              : undefined
          }
          valueState={missingNote || error ? 'error' : undefined}
          message={error ?? (missingNote ? `Enter the ${noteLabel.toLowerCase()} — it is stored with the revision and shown with the answer.` : undefined)}
        >
          {(control) => (
            <textarea
              id={control.id}
              aria-describedby={control.describedBy}
              aria-invalid={control.invalid}
              rows={2}
              disabled={busy}
              data-state-note={subject.subject}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={control.className}
            />
          )}
        </CcField>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <CcButton
          variant="secondary"
          disabled={busy || !moved || missingNote}
          data-state-confirm={subject.subject}
          onClick={() => {
            if (!chosen) return;
            void onConfirm(chosen, trimmed === '' ? null : trimmed);
          }}
        >
          Confirm
        </CcButton>
        {entry ? (
          <span
            data-state-confirmed={subject.subject}
            className="text-[12px] font-medium text-cc-ink-muted"
            title={entry.confirmedAt}
          >
            {STATE_LABELS[entry.state]} · confirmed by{' '}
            <span data-state-account={subject.subject} className="font-semibold text-cc-ink">{entry.account.name}</span>
            {' · '}
            <span data-state-time={subject.subject}>{revisionTime(entry.confirmedAt)}</span>
            {' · revision '}
            {entry.revision}
          </span>
        ) : (
          <span data-state-undecided={subject.subject} className="text-[12px] font-medium text-cc-ink-muted">
            Not confirmed. No answer has been given for this one.
          </span>
        )}
      </div>
    </div>
  );
}
