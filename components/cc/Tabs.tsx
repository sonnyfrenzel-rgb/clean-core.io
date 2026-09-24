'use client';

import React, { useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CcDensity } from './Button';

/**
 * Tabs — block D, step D.5c. For "Source · Not determined · What it does" and
 * the tabs inside a stage.
 *
 * The WAI-ARIA tabs pattern, whole:
 *
 *   - `role="tablist"` with a name, `role="tab"` with `aria-selected` and
 *     `aria-controls`, `role="tabpanel"` named by its tab;
 *   - **roving tabindex**: Tab reaches the list once, on the chosen tab, and
 *     leaves it for the panel; inside the list ArrowLeft/ArrowRight move and
 *     wrap, Home and End jump. The move selects (automatic activation) — the
 *     panels are already in the page, so there is nothing to wait for;
 *   - the panel is focusable, so a panel that starts with text and no control
 *     can still be reached with Tab.
 *
 * Not a segmented control (§1.5). A segmented control sets a *state* of what is
 * shown — a view, a decision; tabs switch between *parts* of the same thing,
 * each with its own panel. The chosen tab is ink with a 2px ink line, never
 * green (§1.1): being on a tab proves nothing.
 *
 * Panels that are not chosen stay in the document, only not displayed (§2.11:
 * less shown, nothing lost), and print one after another (§7).
 */
export interface CcTab<T extends string> {
  value: T;
  label: string;
  /** "(3)" beside the label — how much the panel holds. */
  count?: number;
  content: React.ReactNode;
}

export interface CcTabsProps<T extends string> {
  /** Spoken name of the tab list — "About this rule". */
  label: string;
  tabs: readonly CcTab<T>[];
  /** Controlled selection; pass with `onChange`. */
  value?: T;
  onChange?: (value: T) => void;
  /** Uncontrolled first selection. Defaults to the first tab. */
  defaultValue?: T;
  density?: CcDensity;
}

const HEIGHT: Record<CcDensity, string> = {
  compact: 'min-h-8',
  cozy: 'min-h-10',
};

export default function CcTabs<T extends string>({
  label,
  tabs,
  value: valueProp,
  onChange,
  defaultValue,
  density = 'compact',
}: CcTabsProps<T>) {
  const id = useId();
  const [valueState, setValueState] = useState<T | undefined>(defaultValue ?? tabs[0]?.value);
  const value = valueProp ?? valueState;
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const select = (next: T, focus: boolean) => {
    if (valueProp === undefined) setValueState(next);
    onChange?.(next);
    if (focus) refs.current.get(next)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = tabs.findIndex((tab) => tab.value === value);
    let target: number | null = null;
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = tabs.length - 1;
    if (target === null || !tabs[target]) return;
    event.preventDefault();
    select(tabs[target].value, true);
  };

  const tabId = (v: T) => `${id}-tab-${v}`;
  const panelId = (v: T) => `${id}-panel-${v}`;

  return (
    <div data-cc-tabs="" className="flex min-w-0 flex-col">
      <div
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-4 border-b border-cc-line"
      >
        {tabs.map((tab) => {
          const selected = tab.value === value;
          return (
            <button
              key={tab.value}
              ref={(el) => {
                if (el) refs.current.set(tab.value, el);
                else refs.current.delete(tab.value);
              }}
              id={tabId(tab.value)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(tab.value)}
              tabIndex={selected ? 0 : -1}
              data-cc-tab={selected ? 'on' : 'off'}
              onClick={() => select(tab.value, false)}
              className={cn(
                '-mb-px inline-flex items-center gap-1 border-b-2 text-[13px] whitespace-nowrap pointer-coarse:min-h-11',
                HEIGHT[density],
                selected
                  ? 'border-cc-ink font-semibold text-cc-ink'
                  : 'border-transparent font-medium text-cc-ink-muted hover:text-cc-ink',
              )}
            >
              {tab.label}
              {tab.count !== undefined ? <span className="font-medium text-cc-ink-muted">({tab.count})</span> : null}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <div
            key={tab.value}
            id={panelId(tab.value)}
            role="tabpanel"
            aria-labelledby={tabId(tab.value)}
            tabIndex={0}
            data-cc-tab-panel={selected ? 'on' : 'off'}
            className={cn('pt-3', !selected && 'hidden print:block')}
          >
            {tab.content}
          </div>
        );
      })}
    </div>
  );
}
