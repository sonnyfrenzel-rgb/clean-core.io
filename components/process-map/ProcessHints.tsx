'use client';

import React, { useMemo, useState } from 'react';
import { countHints, hintSentence, type ProcessHint } from '@/lib/process-hints';

/**
 * The check hints of the editing footer — roadmap 3.3, `DESIGN.md` §2.6.
 *
 * A **Message Popover**, which in this design system means exactly one thing:
 * *"gesammelte Prüfhinweise in der Bearbeitungs-Fußleiste, mit Sprung zum
 * Element"*. So: a count in the footer, a list behind it, and every row jumps to
 * the element it is about.
 *
 * The four properties roadmap 3.3 asks a hint for, one per feature here:
 *
 *   - **readable** — one sentence per row, the rule's name above it;
 *   - **countable** — the number is on the button, before anything is opened,
 *     and it is in an `aria-live` region so a screen reader hears it change
 *     while the reader draws;
 *   - **switchable** — one checkbox turns the whole list off. Off means off:
 *     the list is empty, the count says so, and the editor behaves identically;
 *   - **named** — every row is a button carrying the element's name, and
 *     pressing it selects that element on the canvas.
 *
 * **Nothing here can stop anything.** There is no disabled state driven by a
 * hint, no confirmation, no gate in front of Save. That is the whole of the
 * step's one rule and it is easier to keep when the component that shows hints
 * has no way to reach anything that acts.
 */
export interface ProcessHintsProps {
  /** Every hint the rules produced, switched on or not. */
  hints: readonly ProcessHint[];
  /** False hides the list and empties the count — the reader's switch. */
  on: boolean;
  onOnChange: (on: boolean) => void;
  /** Select the element a row names. */
  onJump: (elementId: string) => void;
}

export default function ProcessHints({ hints, on, onOnChange, onJump }: ProcessHintsProps) {
  const [open, setOpen] = useState(false);
  const counts = useMemo(() => countHints(hints), [hints]);
  const shown = on ? hints : [];

  return (
    <div data-process-hints="" className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-hints-toggle=""
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="rounded-cc-row border border-cc-line bg-cc-surface px-2 py-0.5 text-[12px] font-semibold text-cc-ink hover:bg-cc-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
      >
        Hints (<span data-hints-count="">{on ? counts.total : 0}</span>)
      </button>

      <label className="flex items-center gap-1 text-[12px] font-medium text-cc-ink-muted">
        <input
          type="checkbox"
          data-hints-switch=""
          checked={on}
          onChange={(event) => onOnChange(event.target.checked)}
        />
        Show check hints
      </label>

      <span data-hints-sentence="" aria-live="polite" className="text-[12px] font-medium text-cc-ink-muted">
        {on ? hintSentence(counts) : 'Check hints are off. They never stopped anything while they were on.'}
      </span>

      {open ? (
        <div
          data-hints-popover=""
          role="group"
          aria-label="Check hints"
          className="w-full rounded-cc-card border border-cc-line bg-cc-surface p-2"
        >
          {shown.length === 0 ? (
            <p data-hints-empty className="text-[12px] font-medium text-cc-ink-muted">
              {on ? 'No check hints on this model.' : 'Check hints are off.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {shown.map((hint) => (
                <li key={hint.key}>
                  <button
                    type="button"
                    data-process-hint={hint.key}
                    data-hint-rule={hint.ruleId}
                    data-hint-source={hint.source}
                    data-hint-severity={hint.severity}
                    data-hint-element={hint.elementId ?? ''}
                    disabled={!hint.elementId}
                    onClick={() => hint.elementId && onJump(hint.elementId)}
                    className="block w-full rounded-cc-row px-1.5 py-0.5 text-left text-[12px] font-medium text-cc-ink-muted hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
                  >
                    <span className="font-semibold text-cc-ink">{hint.ruleLabel}</span>
                    {' — '}
                    {hint.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
