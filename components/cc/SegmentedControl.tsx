'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Segmented control — `DESIGN.md` §1.5.
 *
 * Carries the view switch (Business | IT | Management), "Map | Steps", the IT
 * focus and the rule decision. Not a button group: the chosen segment is a
 * *state*, and the whole control is one radio group, so a keyboard reaches it
 * once and then moves inside it with the arrow keys instead of tabbing through
 * four stops.
 *
 * The selected segment takes `--cc-ink` with white text and nothing green
 * (§1.1): in the workspace, green is a proof, and "the tab you are on" is not
 * one. That single rule is why the views switcher is not the green pill it was
 * in the first mockup.
 */
export interface CcSegment<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface CcSegmentedControlProps<T extends string> {
  /** Spoken name of the group — "View", "Rule decision". */
  label: string;
  segments: readonly CcSegment<T>[];
  value: T;
  onChange: (value: T) => void;
}

export default function CcSegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
}: CcSegmentedControlProps<T>) {
  const groupId = useId();

  const move = (delta: number) => {
    const index = segments.findIndex((s) => s.value === value);
    const next = segments[(index + delta + segments.length) % segments.length];
    if (next) onChange(next.value);
  };

  return (
    <span
      role="radiogroup"
      aria-label={label}
      data-cc-segmented=""
      className="inline-flex gap-0.5 rounded-cc-row border border-cc-field-border bg-cc-surface-muted p-0.5"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <button
            key={segment.value}
            id={`${groupId}-${segment.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-cc-segment={selected ? 'on' : 'off'}
            onClick={() => onChange(segment.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[12px] whitespace-nowrap pointer-coarse:min-h-11 pointer-coarse:px-3',
              selected
                ? 'bg-cc-ink text-cc-on-dark font-semibold'
                : 'bg-transparent text-cc-ink-muted font-medium',
            )}
          >
            {segment.icon}
            {segment.label}
          </button>
        );
      })}
    </span>
  );
}
