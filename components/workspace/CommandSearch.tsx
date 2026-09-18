'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/cc-messages';
import CcIconButton from '@/components/cc/IconButton';
import CcTag from '@/components/cc/Tag';
import CcAnchor from '@/components/cc/Anchor';
import {
  buildWorkspaceSearchIndex,
  searchWorkspace,
  SEARCH_KIND_LABEL,
  type SearchResult,
} from '@/lib/workspace-search';
import type { SourceReading } from '@/lib/first-look';
import type { Project } from '@/lib/types';

/**
 * ⌘K — search in the project, roadmap 6.6.
 *
 * *"Suche im Projekt (⌘K) über Elemente, Regeln, Findings, Zeilen und
 * Glossar."* The index itself is built in `lib/workspace-search.ts`, kept pure
 * and framework-free so the categories it covers can be tested without a
 * browser; this component is only the dialog around it.
 *
 * **Two ways in, on purpose.** `Ctrl+K` / `⌘K` opens it from anywhere on the
 * page — the precedent is `components/process-map/ProcessSearch.tsx`, and the
 * same guard against stealing a keystroke from a text field applies here. But
 * a shortcut is never the *only* way in (the UX register carries open findings
 * about exactly that): the small button beside the project title is a real,
 * tabbable, labelled control that opens the same dialog for a mouse, a switch
 * device, or a reader who has never learned the chord.
 *
 * **A dialog in the full sense** — modelled on `components/cc/MessageBox.tsx`,
 * this product's one other true modal: portalled to `document.body` so
 * `inert` on its siblings actually reaches the whole page rather than a
 * cousin subtree, focus moves in and is trapped by a `Tab` handler, `Escape`
 * closes it, and the control that opened it gets the focus back. A focus that
 * merely starts in the dialog and can be tabbed straight back out of it is the
 * keyboard trap this pattern exists to avoid.
 *
 * **Every hit says what it is and goes somewhere** (roadmap 6.6: "a result
 * list that cannot be acted on is a list"). The kind is a plain `CcTag`, never
 * a colour standing in for a word. A glossary hit is the one kind that does
 * not navigate at all — the answer is already the whole of what selecting it
 * would show, so it is simply printed in place, with **"No model call"** next
 * to it in the same words `run.noModelCall` uses everywhere else in the
 * product, and the source `DESIGN.md` §6.1 requires for an SAP term, printed
 * honestly as "Source not yet recorded" where the entry does not carry one
 * rather than left silent.
 */
export interface CommandSearchProps {
  projectId: string;
  project: Project | null;
  /** The process reading `FirstLook` computed for this screen, if any. */
  reading: SourceReading | null;
}

/** Matches `ProcessSearch`'s own cap — enough to scan, never a wall of rows. */
const LISTED = 8;

export default function CommandSearch({ projectId, project, reading }: CommandSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const listId = useId();
  const titleId = useId();
  const router = useRouter();

  const index = useMemo(
    () => buildWorkspaceSearchIndex({ projectId, project, reading }),
    [projectId, project, reading],
  );

  const results = useMemo(
    () => searchWorkspace(index, { projectId, legacyCode: project?.legacyCode }, query),
    [index, project?.legacyCode, projectId, query],
  );
  const shown = results.slice(0, LISTED);
  const at = shown.length ? Math.min(cursor, shown.length - 1) : 0;

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setCursor(0);
  }, []);

  const launch = useCallback(
    (result: SearchResult) => {
      // A glossary hit answers in place — there is nowhere for it to navigate
      // to, and forcing one would be exactly the kind of "look, it does
      // something" decoration `DESIGN.md` warns against.
      if (!result.href) return;
      close();
      router.push(result.href);
    },
    [close, router],
  );

  /** `Ctrl+K` / `⌘K` from anywhere on the page — never inside a text field. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      event.preventDefault();
      openerRef.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /** The focus trap, the `inert` siblings, and giving the focus back on close. */
  useEffect(() => {
    if (!open) return undefined;

    inputRef.current?.focus();

    const container = dialogRef.current?.parentElement;
    const releasedSiblings: HTMLElement[] = [];
    if (container) {
      for (const node of Array.from(document.body.children)) {
        if (node === container || !(node instanceof HTMLElement) || node.hasAttribute('inert')) continue;
        node.setAttribute('inert', '');
        releasedSiblings.push(node);
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = [
        ...root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'),
      ].filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      for (const node of releasedSiblings) node.removeAttribute('inert');
      openerRef.current?.focus();
    };
  }, [open, close]);

  const onInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!shown.length) return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setCursor((held) => (Math.min(held, shown.length - 1) + step + shown.length) % shown.length);
        return;
      }
      if (event.key === 'Enter' && shown[at] && shown[at].href) {
        event.preventDefault();
        launch(shown[at]);
      }
    },
    [at, launch, shown],
  );

  return (
    <>
      <CcIconButton
        label="Search this project (Ctrl K)"
        data-command-search-trigger=""
        onClick={() => {
          openerRef.current = document.activeElement as HTMLElement | null;
          setOpen(true);
        }}
      >
        <Search size={16} aria-hidden={true} />
      </CcIconButton>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div data-command-search-layer="" className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[12vh]">
              <div
                data-cc-scrim=""
                aria-hidden={true}
                onClick={close}
                className="absolute inset-0 bg-cc-overlay/45"
              />
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                data-command-search=""
                className="relative flex w-full max-w-xl flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc-dialog"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 id={titleId} className="m-0 text-[13px] font-bold text-cc-ink">
                    Search this project
                  </h2>
                  <CcIconButton label="Close search" onClick={close}>
                    <X size={16} aria-hidden={true} />
                  </CcIconButton>
                </div>

                <div
                  className={cn(
                    'flex items-center gap-2 rounded-cc-row border border-cc-field-border bg-cc-surface px-3 py-2',
                    'focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-cc-focus',
                  )}
                >
                  <Search size={14} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
                  <input
                    ref={inputRef}
                    type="search"
                    role="combobox"
                    aria-expanded={shown.length > 0}
                    aria-controls={listId}
                    aria-label="Find an element, a rule, a finding, a source line or a glossary term"
                    placeholder="Find an element, a rule, a finding, L231, or a glossary term"
                    data-command-search-input=""
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setCursor(0);
                    }}
                    onKeyDown={onInputKeyDown}
                    className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-cc-ink outline-none placeholder:text-cc-ink-muted"
                  />
                  {query ? (
                    <span className="shrink-0 font-cc-mono text-[11px] font-semibold text-cc-ink-muted">
                      {results.length ? `${results.length} found` : '0 found'}
                    </span>
                  ) : null}
                </div>

                {query && shown.length === 0 ? (
                  <p data-command-search-empty="" className="m-0 text-[12px] font-medium text-cc-ink-muted">
                    Nothing in this project matches &ldquo;{query}&rdquo;.
                  </p>
                ) : null}

                {shown.length > 0 ? (
                  <ul
                    id={listId}
                    role="listbox"
                    aria-label="Search results"
                    data-command-search-results=""
                    className="m-0 flex max-h-[50vh] list-none flex-col gap-1.5 overflow-y-auto p-0"
                  >
                    {shown.map((result, i) => (
                      <li
                        key={result.id}
                        role="option"
                        aria-selected={i === at}
                        data-command-search-hit={result.kind}
                        className={cn(
                          'rounded-cc-row border border-cc-line px-3 py-2',
                          i === at ? 'bg-cc-surface-muted' : 'bg-cc-surface',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => launch(result)}
                          onMouseEnter={() => setCursor(i)}
                          disabled={!result.href}
                          className={cn(
                            'flex w-full flex-wrap items-center gap-2 bg-transparent text-left',
                            result.href ? 'cursor-pointer' : 'cursor-default',
                          )}
                        >
                          <CcTag>{SEARCH_KIND_LABEL[result.kind]}</CcTag>
                          <span className="text-[13px] font-semibold text-cc-ink">{result.title}</span>
                          {result.anchor ? (
                            <CcAnchor label={`Source line ${result.anchor}`}>{result.anchor}</CcAnchor>
                          ) : null}
                          {result.detail ? (
                            <span className="min-w-0 truncate text-[12px] font-medium text-cc-ink-muted">
                              {result.detail}
                            </span>
                          ) : null}
                        </button>

                        {result.kind === 'glossary' ? (
                          <div data-command-search-glossary-answer="" className="mt-1.5 space-y-1 pl-1">
                            <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink">
                              {result.glossaryAnswer}
                            </p>
                            <p className="m-0 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-cc-ink-muted">
                              <span data-command-search-no-model-call="">{t('run.noModelCall')}</span>
                              <span aria-hidden={true}>·</span>
                              <span data-command-search-glossary-source="">
                                {result.glossarySource ? `Source: ${result.glossarySource}` : 'Source not yet recorded'}
                              </span>
                            </p>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
