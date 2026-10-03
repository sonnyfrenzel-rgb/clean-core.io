'use client';

import React, { useEffect, useRef } from 'react';
import { ChevronRight, CornerLeftUp } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import { cn } from '@/lib/utils';
import { wt } from '@/lib/workspace-messages';

/**
 * The level path of a process map — roadmap 2.9, `DESIGN.md` §5.9 item 2 —
 * and the one way up every map shares.
 *
 * *Order audit › Decide and process actions › Set delivery block*. Every link
 * jumps back to that level, and `Alt+↑` goes one level up from anywhere in the
 * view. It is a `nav` with an ordered list rather than a row of buttons,
 * because a screen reader then says how many levels deep the reader is standing
 * without anybody writing that sentence.
 *
 * It stands in the map's own control row, beside zoom, fit and full screen, so
 * it is the same element inline and in full screen (owner 03.10.2026: "how do
 * I get one level up here", and "full screen must also go one level up and
 * down"). The reading map, the Documentation map and the editor all draw this
 * component; none of them has a way up of its own.
 *
 * The last crumb is the level on show and is not a button: a control that does
 * nothing when pressed is worse than a word. At the top level there is nothing
 * above, so the way up is not drawn at all.
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

  // The way up disappears at the top. When it had the focus, the focus would
  // fall to <body>; it moves to the level now on show instead.
  const navRef = useRef<HTMLElement | null>(null);
  const upHadFocus = useRef(false);
  useEffect(() => {
    if (parent || !upHadFocus.current) return;
    upHadFocus.current = false;
    if (!document.activeElement || document.activeElement === document.body) {
      navRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
    }
  }, [parent]);

  return (
    <nav ref={navRef} data-process-path="" aria-label={wt('map.levelNav')} className="flex min-w-0 flex-wrap items-center gap-2">
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
                tabIndex={-1}
                className="truncate text-[12px] font-semibold text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus"
              >
                {crumb.outline ? `${crumb.outline} ` : ''}{crumb.label}
              </span>
            ) : (
              <button
                type="button"
                data-process-crumb={crumb.plane ?? 'top'}
                onClick={() => onOpen(crumb.plane)}
                className={cn(
                  // A crumb is a link in a sentence; on a touch screen it is
                  // still a 44 px target (`DESIGN.md` §2.9).
                  'truncate rounded-cc-row px-1 text-[12px] font-medium text-cc-ink-muted underline underline-offset-2',
                  'pointer-coarse:min-h-11 pointer-coarse:min-w-11',
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
        <CcButton
          data-process-up=""
          aria-keyshortcuts="Alt+ArrowUp"
          title={wt('map.levelUp')}
          icon={<CornerLeftUp size={16} aria-hidden={true} />}
          onFocus={() => {
            upHadFocus.current = true;
          }}
          onBlur={() => {
            upHadFocus.current = false;
          }}
          onClick={() => {
            // Kept across the click: the button goes away when the level above is the top.
            upHadFocus.current = true;
            onOpen(parent.plane);
          }}
        >
          {wt('map.levelUpShort')}
        </CcButton>
      ) : null}
    </nav>
  );
}

/**
 * `Alt+↑` — one level up, from anywhere in the view (`DESIGN.md` §5.9 item 12).
 * Bound on the document, so it reaches a map in the browser's own full screen
 * as well as on the page. `null` binds nothing (the top level, or a map that
 * is not the one being worked on).
 */
export function useLevelUpKey(up: (() => void) | null): void {
  const upRef = useRef(up);
  useEffect(() => {
    upRef.current = up;
  });
  const bound = up !== null;
  useEffect(() => {
    if (!bound) return undefined;
    const onKey = (event: KeyboardEvent) => {
      // Not skipped when something below prevented the default: bpmn-js's
      // keyboard and the map's own arrow keys take ArrowUp for themselves.
      if (!event.altKey || event.key !== 'ArrowUp') return;
      const go = upRef.current;
      if (!go) return;
      event.preventDefault();
      go();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bound]);
}
