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
/**
 * The fixed look of §1.5, exported like `CC_BUTTON_*` for the one control that
 * has to be a segment row without being this component — the need choice of
 * the process states (`components/process-states/StateChoice.tsx`) has no
 * answer until one is picked and disables itself while saving, neither of which
 * a view switch ever needs. Shared rather than copied, so the two cannot drift.
 */
export const CC_SEGMENTED_GROUP =
  'inline-flex gap-0.5 rounded-cc-row border border-cc-field-border bg-cc-surface-muted p-0.5';

export function ccSegmentClass(selected: boolean): string {
  return cn(
    'inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[12px] whitespace-nowrap pointer-coarse:min-h-11 pointer-coarse:px-3',
    'disabled:opacity-60 disabled:cursor-not-allowed',
    selected ? 'bg-cc-ink text-cc-on-dark font-semibold' : 'bg-transparent text-cc-ink-muted font-medium',
  );
}

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
  /**
   * Fill the row on breakpoint S (≤ 600 px), segments sharing it equally — the
   * view switch of the workspace on a phone (mockup s10). Off by default; at
   * 601 px and up nothing changes.
   */
  stretch?: boolean;
}

export default function CcSegmentedControl<T extends string>({
  label,
  segments,
  value,
  onChange,
  stretch = false,
}: CcSegmentedControlProps<T>) {
  const groupId = useId();

  const move = (delta: number) => {
    const index = segments.findIndex((s) => s.value === value);
    const next = segments[(index + delta + segments.length) % segments.length];
    if (!next) return;
    onChange(next.value);
    // The radio pattern moves the focus with the selection; otherwise it stays
    // on a segment that just became tabIndex -1 (QA review of a88149856dcc).
    document.getElementById(`${groupId}-${next.value}`)?.focus();
  };

  return (
    <span
      role="radiogroup"
      aria-label={label}
      data-cc-segmented=""
      data-cc-segmented-stretch={stretch ? '' : undefined}
      className={cn(CC_SEGMENTED_GROUP, stretch && 'max-[600px]:flex max-[600px]:w-full')}
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
            className={cn(ccSegmentClass(selected), stretch && 'max-[600px]:flex-1 max-[600px]:justify-center')}
          >
            {segment.icon}
            {segment.label}
          </button>
        );
      })}
    </span>
  );
}
