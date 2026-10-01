'use client';

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Diamond, FileCode2, ListChecks, Search, SearchCheck, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/cc-messages';
import {
  wt,
  searchFoundLabel,
  searchNothingMatches,
  searchSourceLineLabel,
} from '@/lib/workspace-messages';
import { onOpenProjectSearch, registerProjectSearch } from '@/lib/shell-context';
import CcDialog from '@/components/cc/Dialog';
import CcAnchor from '@/components/cc/Anchor';
import {
  buildWorkspaceSearchIndex,
  groupSearchResults,
  searchWorkspace,
  SEARCH_GROUP_LABEL,
  type SearchGroup,
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
 * about exactly that): the search button in the shell bar — the slot §2.1
 * gives it — is a real, tabbable, labelled control that opens the same dialog
 * for a mouse, a switch device, or a reader who has never learned the chord.
 * Since block D, D.29 that button belongs to the shell and not to this
 * component: this dialog registers itself while it is mounted, the shell shows
 * the button only then, and the button asks by a named event
 * (`lib/shell-context.ts`) — the shell never learns the index, and this
 * component never reaches into the layout.
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
 * product, and the source `DESIGN.md` §6.1 requires for an SAP term.
 *
 * **The source line is printed as the glossary wrote it.** Where SAP's synced
 * catalog backs the term it reads "Source: SAP, abap-atc-cr-cv-s4hc …"; where
 * nothing is recorded it reads "Source not recorded — …" with the reason. The
 * component does not prefix it with "Source:" of its own, because on the
 * second kind that prefix would turn a refusal into a claim.
 */
export interface CommandSearchProps {
  projectId: string;
  project: Project | null;
  /** The process reading `FirstLook` computed for this screen, if any. */
  reading: SourceReading | null;
}

/** Per group: enough to scan, never a wall of rows (mockup s9 shows one or two). */
const PER_GROUP = 4;

/** One plain icon per group (§1.7: line icons, no model-work symbols). */
const GROUP_ICON: Record<SearchGroup, React.ReactNode> = {
  process: <Workflow size={14} aria-hidden={true} />,
  decision: <Diamond size={14} aria-hidden={true} />,
  rule: <ListChecks size={14} aria-hidden={true} />,
  finding: <SearchCheck size={14} aria-hidden={true} />,
  code: <FileCode2 size={14} aria-hidden={true} />,
  glossary: <BookOpen size={14} aria-hidden={true} />,
};

export default function CommandSearch({ projectId, project, reading }: CommandSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const listId = useId();
  const router = useRouter();

  const index = useMemo(
    () => buildWorkspaceSearchIndex({ projectId, project, reading }),
    [projectId, project, reading],
  );

  const results = useMemo(
    () => searchWorkspace(index, { projectId, legacyCode: project?.legacyCode }, query),
    [index, project?.legacyCode, projectId, query],
  );
  // Grouped by what the reader is looking for (§2.10, mockup s9), each group
  // in the ranking the search gave it; the cursor walks the groups in order.
  const groups = useMemo(
    () => groupSearchResults(results).map((g) => ({ ...g, results: g.results.slice(0, PER_GROUP) })),
    [results],
  );
  const shown = useMemo(() => groups.flatMap((g) => g.results), [groups]);
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
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /** The shell's search button: present while this dialog is, and opening it by event. */
  useEffect(() => {
    const unregister = registerProjectSearch();
    const stop = onOpenProjectSearch(() => setOpen(true));
    return () => {
      stop();
      unregister();
    };
  }, []);

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

  // The modal part — the dimmed page going `inert`, the focus starting in the
  // field and held inside, Escape, and the focus going back to the button (or
  // the place Ctrl+K was pressed) — is `CcDialog`'s, the one modal of the
  // product (§2.6; block D, D.32). Its layer carries `data-command-search`.
  return (
    <CcDialog open={open} title={wt('search.title')} onClose={close} data-command-search="">
      <div className="flex flex-col gap-3">
        {/* The input is the field — its border and its focus ring (§1.6, the
            product's one ring) are its own; the icon sits inside it. */}
        <div className="relative flex items-center gap-2">
          <Search
            size={14}
            aria-hidden={true}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-cc-ink-muted"
          />
          <input
              type="search"
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls={listId}
            /* The arrow keys move a cursor the focus never follows, so
               the field names the option it points at (QA full review
               of v2.20.0). */
            aria-activedescendant={shown.length > 0 ? `${listId}-option-${at}` : undefined}
            aria-label={wt('search.fieldName')}
            placeholder={wt('search.placeholder')}
            data-command-search-input=""
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={onInputKeyDown}
            className="min-w-0 flex-1 rounded-cc-row border border-cc-field-border bg-cc-surface py-2 pr-3 pl-8 text-[13px] font-medium text-cc-ink placeholder:text-cc-ink-muted"
          />
          {query ? (
            <span className="shrink-0 font-cc-mono text-[11px] font-semibold text-cc-ink-muted">
              {searchFoundLabel(results.length)}
            </span>
          ) : null}
        </div>

        {query && shown.length === 0 ? (
          <p data-command-search-empty="" className="m-0 text-[12px] font-medium text-cc-ink-muted">
            {searchNothingMatches(query)}
          </p>
        ) : null}

        {shown.length > 0 ? (
          <div
            id={listId}
            role="listbox"
            aria-label={wt('search.results')}
            data-command-search-results=""
            className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto"
          >
            {groups.map(({ group, results: hits }) => (
              <div key={group} role="group" aria-labelledby={`${listId}-${group}`} data-command-search-group={group}>
                <p
                  id={`${listId}-${group}`}
                  className="m-0 mb-1 px-1 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase"
                >
                  {SEARCH_GROUP_LABEL[group]}
                </p>
                <ul role="presentation" className="m-0 flex list-none flex-col gap-1 p-0">
                  {hits.map((result) => {
                    const i = shown.indexOf(result);
                    return (
                      <li
                        key={result.id}
                        id={`${listId}-option-${i}`}
                        role="option"
                        aria-selected={i === at}
                        data-command-search-hit={result.kind}
                        className={cn(
                          'rounded-cc-row px-2 py-1',
                          i === at ? 'bg-cc-surface-muted' : 'bg-cc-surface',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => launch(result)}
                          onMouseEnter={() => setCursor(i)}
                          disabled={!result.href}
                          title={result.technical ?? undefined}
                          className={cn(
                            'flex min-h-8 w-full items-center gap-2 bg-transparent text-left',
                            result.href ? 'cursor-pointer' : 'cursor-default',
                          )}
                        >
                          <span className="shrink-0 text-cc-ink-muted">{GROUP_ICON[group]}</span>
                          {group === 'code' ? (
                            <span className="min-w-0 flex-1 truncate font-cc-mono text-[12px] font-medium text-cc-ink">
                              {result.detail}
                            </span>
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-cc-ink">
                              {result.title}
                            </span>
                          )}
                          {group === 'rule' ? (
                            <span className="shrink-0 font-cc-mono text-[11px] font-semibold text-cc-ink-muted">
                              {result.id.replace(/^rule:/, '')}
                            </span>
                          ) : null}
                          {result.anchor ? (
                            <span className="shrink-0">
                              <CcAnchor label={searchSourceLineLabel(result.anchor)}>{result.anchor}</CcAnchor>
                            </span>
                          ) : null}
                        </button>

                        {result.kind === 'glossary' ? (
                          <div data-command-search-glossary-answer="" className="mt-1 mb-1 space-y-1 pl-6">
                            <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink">
                              {result.glossaryAnswer}
                            </p>
                            <p className="m-0 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-cc-ink-muted">
                              <span data-command-search-no-model-call="">{t('run.noModelCall')}</span>
                              <span aria-hidden={true}>·</span>
                              <span
                                data-command-search-glossary-source=""
                                data-source-origin={result.glossarySourceOrigin ?? 'absent'}
                              >
                                {result.glossarySource}
                              </span>
                            </p>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        <p data-command-search-footer="" className="m-0 text-[12px] font-medium text-cc-ink-muted">
          {wt('search.footer')}
        </p>
      </div>
    </CcDialog>
  );
}
