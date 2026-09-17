'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessMapModel } from '@/lib/process-map';
import { searchProcess, type ProcessNavigation, type ProcessSearchHit } from '@/lib/process-navigation';

/**
 * Search across every level — roadmap 2.9, `DESIGN.md` §5.9 item 9.
 *
 * This is the half of the acceptance the mouse does not need and the keyboard
 * does. On a fresh page the focus is on nothing; the tree is twenty tab stops
 * down a stage page, so *"Tab to the outline"* is not one action. `Ctrl+K`
 * (`⌘K`) is, and it lands here from anywhere on the page. Three keystrokes then
 * reach any of the 65 steps of the 1.000-line example:
 *
 *   1. `Ctrl+K` — the field takes the focus;
 *   2. the address of the step — its outline number, `16.4`, or a name;
 *   3. `Enter` — the level of the hit opens, the hit is selected and the focus
 *      lands on it.
 *
 * Step 2 is one action because it is one decision: the reader types the thing
 * they are looking for, exactly as the reader with a mouse points at the row
 * they are looking for. What makes it a *reliable* one is that an outline
 * number matches exactly one element and ranks first — a name does not, and the
 * example has 65 elements with 42 distinct names.
 *
 * `Enter` and `Shift+Enter` walk on through the hits, and the field says *"3 of
 * 7"*, so a name that matches several steps is a list to walk and not a dead
 * end.
 */
export interface ProcessSearchProps {
  model: ProcessMapModel;
  nav: ProcessNavigation;
  /** Open the level of the hit, select it, and put the focus on it. */
  onJump: (hit: ProcessSearchHit) => void;
}

/** How many hits are listed. The count above the list always names them all. */
const LISTED = 8;

export default function ProcessSearch({ model, nav, onJump }: ProcessSearchProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  const listId = useId();

  const hits = useMemo(() => searchProcess(model, nav, query), [model, nav, query]);
  const at = hits.length ? Math.min(cursor, hits.length - 1) : 0;

  /** A new query is a new list: the cursor goes back to the best hit with it. */
  const setQueryAndReset = useCallback((next: string) => {
    setQuery(next);
    setCursor(0);
  }, []);

  /**
   * `Ctrl+K` / `⌘K` from anywhere on the page.
   *
   * On `document`, not on the view: the point of the shortcut is that the
   * reader does not first have to be somewhere. It stands down inside a text
   * field so that it never eats a keystroke meant for one.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const jump = useCallback((index: number) => {
    const hit = hits[index];
    if (!hit) return;
    onJump(hit);
  }, [hits, onJump]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setQueryAndReset('');
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!hits.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setCursor((held) => (Math.min(held, hits.length - 1) + step + hits.length) % hits.length);
      return;
    }
    if (event.key !== 'Enter' || !hits.length) return;
    event.preventDefault();
    if (event.shiftKey) {
      const previous = (at - 1 + hits.length) % hits.length;
      setCursor(previous);
      jump(previous);
      return;
    }
    jump(at);
    setCursor((at + 1) % hits.length);
  }, [at, hits.length, jump, setQueryAndReset]);

  return (
    <div data-process-search="" className="flex min-w-0 flex-col gap-1">
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-cc-row border border-cc-field-border bg-cc-surface px-2 py-1',
          'focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-cc-focus',
        )}
      >
        <Search size={13} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-label="Find a step in any level (Control K)"
          placeholder="Find a step — 16.4, a name, L472  (Ctrl+K)"
          data-process-search-input=""
          value={query}
          onChange={(event) => setQueryAndReset(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-cc-ink outline-none placeholder:text-cc-ink-muted"
        />
        {query ? (
          <span data-process-search-count className="shrink-0 font-cc-mono text-[11px] font-semibold text-cc-ink-muted">
            {hits.length ? `${at + 1} of ${hits.length}` : '0 of 0'}
          </span>
        ) : null}
      </div>

      {query && hits.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          data-process-search-results=""
          className="max-h-[180px] overflow-y-auto rounded-cc-row border border-cc-line bg-cc-surface"
        >
          {hits.slice(0, LISTED).map((hit, index) => (
            <li
              key={hit.id}
              role="option"
              aria-selected={index === at}
              data-search-hit={hit.id}
              onClick={() => { setCursor(index); jump(index); }}
              className={cn(
                'flex cursor-pointer flex-wrap items-baseline gap-x-1.5 border-b border-cc-line px-2 py-1 last:border-b-0',
                index === at && 'bg-cc-surface-muted',
              )}
            >
              <span className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{hit.outline}</span>
              <span className="text-[11px] font-semibold tracking-[0.06em] text-cc-ink-muted uppercase">{hit.kind}</span>
              <span className="min-w-0 truncate text-[12px] font-semibold text-cc-ink">{hit.label}</span>
              <span className="text-[11px] font-medium text-cc-ink-muted">{hit.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
