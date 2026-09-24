'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, CircleHelp, Keyboard, X } from 'lucide-react';

/**
 * The Help menu of the shell bar, and the "Keyboard shortcuts" it opens —
 * `DESIGN.md` §2.1 (Shell Bar: search, help, account), §5.9 item 12 (*„alle
 * Kürzel unter ‚Keyboard shortcuts' im Hilfe-Menü"*), roadmap 3.0.4.
 *
 * **Only keys that work today are listed.** §5.7 and §5.9 also name `+`, `−`,
 * `0`, `F`, `M` and `P` on the process map; none of them is wired yet, and a
 * list that promises a key which does nothing is the same claim without
 * evidence the product exists to rule out. When one of them is built, it is
 * added here in the same change. Every entry below points at the handler that
 * implements it, so the next reader can check the list against the code.
 *
 * The menu is a disclosure (a button with `aria-expanded` and a panel), not an
 * ARIA `menu`: it holds a link, and a `role="menu"` would promise arrow-key
 * navigation over `menuitem`s that a link list does not have. The dialog is a
 * native `<dialog>` opened with `showModal()`, so the page behind it is inert
 * and Escape closes it without code of ours that could forget either; the
 * focus is handed back to what opened it.
 *
 * `?` (Shift + /) opens the list from anywhere that is not a text field.
 *
 * Below `sm` the trigger is not shown: on a phone the shell bar already holds
 * the logo, the way back, the quota and the account, and a fifth element pushed
 * it past the screen. The assistant is in the account menu there, and a phone
 * has no keyboard to list shortcuts for; a tablet with one still gets `?`.
 */

interface Shortcut {
  keys: string[];
  /** Pressed together (`Ctrl` + `K`) rather than either one (`→` or `↓`). */
  chord?: boolean;
  does: string;
}

interface ShortcutGroup {
  title: string;
  where: string;
  shortcuts: Shortcut[];
}

const GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Everywhere',
    where: 'Every signed-in page.',
    shortcuts: [
      // This component.
      { keys: ['?'], does: 'Show this list of keyboard shortcuts' },
      // `app/(app)/layout.tsx` — the skip link is the first stop of every page.
      { keys: ['Tab'], does: 'First press: skip to the content of the page' },
      // Menus, popovers and dialogs of the shell and the workspace.
      { keys: ['Esc'], does: 'Close a menu, a popover or a dialog; the focus returns to what opened it' },
    ],
  },
  {
    title: 'Project workspace',
    where: 'The page of one project.',
    shortcuts: [
      // `components/workspace/CommandSearch.tsx`.
      { keys: ['Ctrl', 'K'], chord: true, does: 'Search this project (⌘K on a Mac)' },
      { keys: ['↑', '↓'], does: 'Move between search results' },
      { keys: ['Enter'], does: 'Open the chosen result' },
      // `components/cc/SegmentedControl.tsx`.
      { keys: ['←', '→'], does: 'Switch the view (Business, IT, Management) once the view control has the focus' },
    ],
  },
  {
    title: 'Process map and step list',
    where: 'Documentation — the process reconstructed from the code.',
    shortcuts: [
      // `components/process-map/ProcessMap.tsx`, `handleKeyDown`.
      { keys: ['Tab'], does: 'The map is one stop; the keys below move inside it' },
      { keys: ['→', '↓'], does: 'Next step along the flow' },
      { keys: ['←', '↑'], does: 'Previous step' },
      { keys: ['↓', '↑'], does: 'At a decision: choose the branch' },
      { keys: ['Home', 'End'], does: 'First or last element' },
      { keys: ['Enter'], does: 'Open the source of the element, or open a sub-process' },
      { keys: ['Esc'], does: 'Close the source; the focus returns to the element' },
      { keys: ['Alt', '↑'], chord: true, does: 'One level up' },
      // `components/process-map/ProcessSearch.tsx`.
      { keys: ['Ctrl', 'K'], chord: true, does: 'Search every level of the process (⌘K on a Mac)' },
    ],
  },
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

export default function ShellHelpMenu({
  assistantLabel,
}: {
  /** "Ask this case" inside a project, "Ask the assistant" elsewhere — the layout decides. */
  assistantLabel: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const panelId = useId();
  const titleId = useId();

  const openShortcuts = useCallback((opener: HTMLElement | null) => {
    openerRef.current = opener;
    setMenuOpen(false);
    setDialogOpen(true);
  }, []);

  // The native dialog does the modality; React only says whether it is open.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!dialogOpen && dialog.open) {
      dialog.close();
    }
  }, [dialogOpen]);

  const onDialogClose = useCallback(() => {
    setDialogOpen(false);
    const back = openerRef.current ?? triggerRef.current;
    // After the dialog has left the top layer, or the browser moves the focus
    // back to <body> behind our call.
    window.requestAnimationFrame(() => back?.focus());
  }, []);

  // `?` from anywhere that is not a text field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || dialogRef.current?.open) return;
      event.preventDefault();
      openShortcuts(document.activeElement as HTMLElement | null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openShortcuts]);

  // Escape and a click elsewhere close the menu; Escape gives the focus back.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.parentElement?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [menuOpen]);

  const item =
    'flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm font-bold text-gray-700 transition-all hover:bg-gray-50 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus';

  return (
    <div className="relative" data-help-menu="">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? panelId : undefined}
        data-help-menu-trigger=""
        className="hidden min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full sm:flex border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition-all hover:border-green-200 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
      >
        <CircleHelp size={16} aria-hidden={true} />
        Help
        <ChevronDown size={14} aria-hidden={true} />
      </button>

      {menuOpen && (
        <div
          id={panelId}
          data-help-menu-panel=""
          className="absolute right-0 z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-100 bg-white p-2 shadow-2xl"
        >
          <button
            type="button"
            data-help-shortcuts-open=""
            onClick={() => openShortcuts(triggerRef.current)}
            className={item}
          >
            <Keyboard size={18} aria-hidden={true} /> Keyboard shortcuts
            <span className="ml-auto font-mono text-xs text-gray-500" aria-hidden={true}>
              ?
            </span>
          </button>
          <button
            type="button"
            data-assistant-trigger="help"
            onClick={() => {
              setMenuOpen(false);
              window.dispatchEvent(new CustomEvent('open-chatbot', { detail: { returnFocusTo: triggerRef.current } }));
            }}
            className={item}
          >
            <CircleHelp size={18} aria-hidden={true} /> {assistantLabel}
          </button>
          <Link href="/how-it-works" onClick={() => setMenuOpen(false)} className={item}>
            <CircleHelp size={18} aria-hidden={true} /> How it works
          </Link>
        </div>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        data-keyboard-shortcuts=""
        onClose={onDialogClose}
        className="cc m-auto w-[min(40rem,calc(100vw-2rem))] max-h-[calc(100vh-4rem)] rounded-cc-card border border-cc-line bg-cc-surface p-0 text-cc-ink shadow-cc-dialog backdrop:bg-cc-overlay/45"
      >
        {dialogOpen && (
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="m-0 text-[15px] leading-tight font-bold text-cc-ink">
                Keyboard shortcuts
              </h2>
              <button
                type="button"
                aria-label="Close keyboard shortcuts"
                data-keyboard-shortcuts-close=""
                onClick={() => dialogRef.current?.close()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-cc-row border border-cc-field-border bg-cc-surface text-cc-ink-muted pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <X size={16} aria-hidden={true} />
              </button>
            </div>
            <p className="m-0 mt-1 text-[13px] leading-snug font-medium text-cc-ink-muted">
              Every key listed here works today. Nothing on this list needs a mouse.
            </p>
            {GROUPS.map((group) => (
              <section key={group.title} className="mt-4" data-keyboard-shortcuts-group={group.title}>
                <h3 className="m-0 text-[14px] leading-tight font-bold text-cc-ink">{group.title}</h3>
                <p className="m-0 mt-0.5 text-[12px] font-medium text-cc-ink-muted">{group.where}</p>
                <dl className="m-0 mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
                  {group.shortcuts.map((shortcut) => (
                    <React.Fragment key={`${group.title}-${shortcut.keys.join('+')}-${shortcut.does}`}>
                      <dt className="m-0 flex flex-wrap items-center gap-1">
                        {shortcut.keys.map((key, i) => (
                          <React.Fragment key={`${key}-${i}`}>
                            {i > 0 ? (
                              <span className="text-[11px] font-medium text-cc-ink-muted">
                                {shortcut.chord ? '+' : 'or'}
                              </span>
                            ) : null}
                            <kbd className="rounded-[4px] border border-cc-field-border bg-cc-surface-muted px-1.5 font-cc-mono text-[12px] leading-[20px] font-semibold text-cc-ink">
                              {key}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </dt>
                      <dd className="m-0 text-[13px] leading-snug font-medium text-cc-ink">{shortcut.does}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}
      </dialog>
    </div>
  );
}
