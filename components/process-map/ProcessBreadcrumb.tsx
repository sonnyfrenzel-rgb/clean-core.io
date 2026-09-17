'use client';

import React from 'react';
import { ChevronRight, CornerLeftUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The path line above the map — roadmap 2.9, `DESIGN.md` §5.9 item 2.
 *
 * *Order audit › Decide and process actions › Set delivery block*. Every link
 * jumps back to that level, and `Alt+↑` goes one level up from anywhere in the
 * view. It is a `nav` with an ordered list rather than a row of buttons,
 * because a screen reader then says how many levels deep the reader is standing
 * without anybody writing that sentence.
 *
 * The last crumb is the level on show and is not a button: a control that does
 * nothing when pressed is worse than a word.
 */
export interface ProcessBreadcrumbCrumb {
  /** Null for the top level; otherwise the sub-process element id. */
  plane: string | null;
  label: string;
  /** The outline number of the sub-process that opens it. Empty at the top. */
  outline: string;
}

export interface ProcessBreadcrumbProps {
  crumbs: readonly ProcessBreadcrumbCrumb[];
  onOpen: (plane: string | null) => void;
}

export default function ProcessBreadcrumb({ crumbs, onOpen }: ProcessBreadcrumbProps) {
  const last = crumbs.length - 1;
  const parent = crumbs.length > 1 ? crumbs[last - 1] : null;

  return (
    <nav data-process-path="" aria-label="Level" className="flex flex-wrap items-center gap-1.5">
      <ol className="flex min-w-0 flex-wrap items-center gap-1">
        {crumbs.map((crumb, index) => (
          <li key={crumb.plane ?? 'top'} className="flex min-w-0 items-center gap-1">
            {index > 0 ? (
              <ChevronRight size={12} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
            ) : null}
            {index === last ? (
              <span
                data-process-crumb={crumb.plane ?? 'top'}
                aria-current="true"
                className="truncate text-[12px] font-semibold text-cc-ink"
              >
                {crumb.outline ? `${crumb.outline} ` : ''}{crumb.label}
              </span>
            ) : (
              <button
                type="button"
                data-process-crumb={crumb.plane ?? 'top'}
                onClick={() => onOpen(crumb.plane)}
                className={cn(
                  'truncate rounded-cc-row px-1 text-[12px] font-medium text-cc-ink-muted underline underline-offset-2',
                  'hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus',
                )}
              >
                {crumb.outline ? `${crumb.outline} ` : ''}{crumb.label}
              </button>
            )}
          </li>
        ))}
      </ol>
      {parent ? (
        <button
          type="button"
          data-process-up=""
          onClick={() => onOpen(parent.plane)}
          className={cn(
            'inline-flex items-center gap-1 rounded-cc-row border border-cc-line px-1.5 py-0.5',
            'text-[11px] font-semibold text-cc-ink-muted',
            'hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus',
          )}
        >
          <CornerLeftUp size={11} aria-hidden={true} />
          One level up (Alt+Up)
        </button>
      ) : null}
    </nav>
  );
}
