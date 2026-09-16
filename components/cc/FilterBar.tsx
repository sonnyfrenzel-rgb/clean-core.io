'use client';

import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { countLabel, t } from '@/lib/cc-messages';
import CcButton from './Button';
import CcField from './Field';

/**
 * The live filter bar — `DESIGN.md` §2.5 (ADR-010).
 *
 * No "Go" and no "Adapt filters": a project has tens of findings and a
 * workspace tens of projects, so the list can just react. 200ms after the last
 * keystroke, which is long enough that a typist does not watch the table
 * flicker and short enough that it feels immediate.
 *
 * Two details that are the actual work here:
 *
 *   - **the count is a live region.** A filter that silently removes thirty
 *     rows is a filter a screen reader user cannot use; `aria-live="polite"`
 *     makes it say "12 findings" and nothing else.
 *   - **"Clear filters" appears the moment a filter is set** and not before. It
 *     is also the only way out of the no-match state, which is why that state
 *     takes the same callback.
 *
 * If a list ever becomes server-paginated it moves back to "Go" — and that is a
 * new ADR, not a quiet change here (§2.5).
 */
export interface CcFilterBarProps {
  /** What is being counted — "findings", "projects". Goes in the live region. */
  noun: string;
  /** How many rows are showing after filtering. */
  shown: number;
  /** How many there are in total. */
  total: number;
  search: string;
  onSearch: (value: string) => void;
  /** Select filters, as `CcField`-wrapped controls. */
  children?: React.ReactNode;
  /** True when any filter is set — search included. */
  active: boolean;
  onClear: () => void;
  /** Milliseconds after the last keystroke. 200 by §2.5; overridable for tests. */
  debounceMs?: number;
}

export default function CcFilterBar({
  noun,
  shown,
  total,
  search,
  onSearch,
  children,
  active,
  onClear,
  debounceMs = 200,
}: CcFilterBarProps) {
  /**
   * What is in the box, without an effect to keep it in step.
   *
   * The box has to show the keystroke immediately and the list has to wait
   * 200ms, so the two values differ for a moment — and when "Clear filters" is
   * pressed outside this component the box has to empty itself. The obvious
   * version of that is `useEffect(() => setDraft(search), [search])`, which is
   * a cascading render for every keystroke and which React's own lint rule
   * rejects.
   *
   * So the typed text is remembered together with the `search` it was typed
   * against. While the two agree the box shows what was typed; the moment the
   * parent moves `search` to something we did not publish, the box shows the
   * parent's value. Pure derivation, no effect, no second render.
   */
  const [typed, setTyped] = useState({ draft: search, against: search });
  const draft = typed.against === search ? typed.draft : search;
  const setDraft = (value: string) => setTyped({ draft: value, against: search });

  useEffect(() => {
    if (draft === search) return undefined;
    const timer = setTimeout(() => onSearch(draft), debounceMs);
    return () => clearTimeout(timer);
  }, [draft, debounceMs, onSearch, search]);

  return (
    <div data-cc-filter-bar={active ? 'active' : 'idle'} className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_repeat(auto-fit,minmax(120px,1fr))]">
        <CcField label={t('filter.search')}>
          {(control) => (
            <span className="relative flex items-center">
              <Search
                size={14}
                aria-hidden={true}
                className="pointer-events-none absolute left-2.5 text-cc-ink-muted"
              />
              <input
                id={control.id}
                type="search"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className={`${control.className} pl-8`}
              />
            </span>
          )}
        </CcField>
        {children}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-live="polite"
          data-cc-filter-count=""
          className="text-[12px] font-medium text-cc-ink-muted"
        >
          {countLabel(shown, total, noun)}
        </span>
        {active ? (
          <CcButton
            variant="ghost"
            onClick={onClear}
            icon={<X size={14} aria-hidden={true} />}
            data-cc-clear-filters=""
          >
            {t('action.clearFilters')}
          </CcButton>
        ) : null}
      </div>
    </div>
  );
}
