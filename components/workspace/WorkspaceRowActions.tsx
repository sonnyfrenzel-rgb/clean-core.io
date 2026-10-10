'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { CC_BUTTON_VARIANT_CLASSES } from '@/components/cc/Button';
import { cn } from '@/lib/utils';
import { wt } from '@/lib/workspace-messages';

/**
 * The actions of one row of "My workspace".
 *
 * Mockup s7 draws one button per row: open. Everything the old dashboard
 * offered per project — invite, duplicate, export, the deliverables, delete —
 * is kept (ADR-052: nothing is removed instead of rebuilt) and sits one click
 * deeper, in a small menu behind "More actions", so the row reads like the
 * mockup and loses nothing (§2.11).
 *
 * A shared project — read access only — gets the open button and nothing else:
 * every item in the menu is the owner's.
 *
 * The menu is a disclosure of buttons, not an ARIA `menu`: Tab moves through
 * it, Escape closes it and gives the focus back, and a click outside closes it.
 *
 * From `md` up both buttons say what they do — "Actions" with a caret, "Open
 * project" with the arrow — because a first-time reader could not tell what
 * the bare dots and the bare arrow would do (Sonny, 10.10.2026). On a phone
 * the row has no room and they stay icons, named for assistive technology.
 */
export interface RowActionHandlers {
  onInvite: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

const TRIGGER =
  'inline-flex h-8 min-w-8 items-center justify-center gap-2 rounded-cc-row border px-2 text-[13px] font-medium whitespace-nowrap pointer-coarse:h-11 pointer-coarse:min-w-11 md:px-3';

const ITEM =
  'flex min-h-8 w-full items-center rounded-cc-row px-2 text-left text-[13px] font-medium text-cc-ink hover:bg-cc-surface-muted pointer-coarse:min-h-11';

export default function WorkspaceRowActions({
  id,
  name,
  href,
  owner,
  handlers,
}: {
  id: string;
  name: string;
  href: string;
  /** The account owns the project. False for a shared one and for the demo. */
  owner: boolean;
  handlers?: RowActionHandlers;
}) {
  const [open, setOpen] = useState(false);
  // The table scrolls sideways (`overflow-x-auto`), which clips anything that
  // hangs out of a cell — so the panel is placed against the viewport, under
  // the button, and moves with it when the page scrolls.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    const onDown = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    // Follow the button when the page scrolls or resizes, rather than closing
    // on the first scroll event — focus moves and smooth scrolling fire them.
    const onScroll = () => {
      const box = toggleRef.current?.getBoundingClientRect();
      if (box) setAt({ top: box.bottom + 4, right: Math.max(8, window.innerWidth - box.right) });
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <span ref={wrap} className="relative inline-flex items-center gap-1" data-workspace-row-actions={id}>
      {owner && handlers ? (
        <>
          <button
            type="button"
            ref={toggleRef}
            aria-label={`${wt('myWorkspace.moreActions')} ${name}`}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => {
              const box = toggleRef.current?.getBoundingClientRect();
              if (box) setAt({ top: box.bottom + 4, right: Math.max(8, window.innerWidth - box.right) });
              setOpen((v) => !v);
            }}
            data-workspace-more={id}
            className={cn(TRIGGER, CC_BUTTON_VARIANT_CLASSES.ghost)}
          >
            <MoreHorizontal size={16} aria-hidden={true} className="md:hidden" />
            <span className="hidden md:inline">{wt('myWorkspace.actionsLabel')}</span>
            <ChevronDown size={14} aria-hidden={true} className="hidden md:inline" />
          </button>
          {open ? (
            <span
              id={panelId}
              data-workspace-more-panel={id}
              style={at ? { top: `${at.top}px`, right: `${at.right}px` } : undefined}
              className="fixed z-30 flex w-52 flex-col gap-1 rounded-cc-card border border-cc-line bg-cc-surface p-2 shadow-cc-dialog"
            >
              <button type="button" className={ITEM} onClick={run(handlers.onInvite)} data-invite-open="">
                {wt('myWorkspace.invite')}
              </button>
              <button type="button" className={ITEM} onClick={run(handlers.onDuplicate)} data-workspace-duplicate={id}>
                {wt('myWorkspace.duplicate')}
              </button>
              <button type="button" className={ITEM} onClick={run(handlers.onExport)} data-workspace-export={id}>
                {wt('myWorkspace.exportJson')}
              </button>
              <Link href={`/project/${id}/delivery`} className={`${ITEM} no-underline`} onClick={() => setOpen(false)}>
                {wt('myWorkspace.deliverables')}
              </Link>
              <button
                type="button"
                className={`${ITEM} text-cc-error`}
                onClick={run(handlers.onDelete)}
                data-workspace-delete={id}
              >
                {wt('myWorkspace.delete')}
              </button>
            </span>
          ) : null}
        </>
      ) : null}
      <Link
        href={href}
        aria-label={`${wt('myWorkspace.openProject')} ${name}`}
        data-workspace-open-button={id}
        className={cn(TRIGGER, 'no-underline', CC_BUTTON_VARIANT_CLASSES.ghost)}
      >
        <span className="hidden md:inline">{wt('myWorkspace.openLabel')}</span>
        <ChevronRight size={16} aria-hidden={true} />
      </Link>
    </span>
  );
}
