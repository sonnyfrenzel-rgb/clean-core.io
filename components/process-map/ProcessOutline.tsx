'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcAnchor from '@/components/cc/Anchor';
import { CcTag } from '@/components/cc/Tag';
import type { ProcessMapElement, ProcessMapModel } from '@/lib/process-map';
import type { PlaneProblems, ProcessNavigation } from '@/lib/process-navigation';

/**
 * The outline tree — roadmap 2.9, `DESIGN.md` §5.9 items 1, 3 and 4.
 *
 * It replaces the flat step list as the way *into* a large process. The flat
 * list is still there beside the map and is still the whole of one level; this
 * is the whole of the process, and the difference is what the acceptance of 2.9
 * is about: **every step in at most three actions, by keyboard as by mouse**,
 * on a program with 65 flow nodes on 8 levels.
 *
 * How the tree pays that:
 *
 *   - **the phases open collapsed.** A sub-process is one row with a twisty, so
 *     the whole program is 23 rows on first paint rather than 65. Any step on
 *     the top level is one click; any step one level down is a click on the
 *     twisty and a click on the row. Two;
 *   - **every row carries its outline number** — `16.4`, not an id nobody can
 *     say out loud. The number is the address of the step: it is what the search
 *     field takes, what the URL carries and what a reader quotes;
 *   - **a collapsed phase says what is wrong with it** in words before it is
 *     opened: the line range, the counters (*decisions · hard-coded · not
 *     determined*) and the problem line. §5.9 item 4 — whoever reads the
 *     overview knows where to open.
 *
 * One tab stop, like the map and the step list: roving `tabindex`, arrow keys
 * inside, and `active` versus `selected` used exactly as `ProcessStepList` uses
 * them — the arrow keys move the focus, Enter opens the code card. Type-ahead
 * is what makes the keyboard path as short as the mouse one, and it deliberately
 * searches **the whole outline** rather than only the rows on screen: a reader
 * typing `16.4` means step 16.4, and a type-ahead that stopped at the collapsed
 * row above it would answer a question nobody asked.
 */
export interface ProcessOutlineProps {
  model: ProcessMapModel;
  nav: ProcessNavigation;
  /** The plane whose problem line a sub-process row shows, by plane id. */
  problems: ReadonlyMap<string | null, PlaneProblems>;
  /** Expanded sub-process element ids. */
  expanded: ReadonlySet<string>;
  onExpandedChange: (next: Set<string>) => void;
  /** The row that carries the focus. */
  active: string | null;
  onActiveChange: (elementId: string) => void;
  /** The element whose code card is open. */
  selected: string | null;
  onActivate: (elementId: string) => void;
  /** Elements the active overlays leave in. Null when no overlay is on. */
  visible: ReadonlySet<string> | null;
  /** Elements that do not run in the chosen variant. */
  excluded: ReadonlySet<string>;
  /** Elements the path highlight leaves lit. Null when no highlight is on. */
  lit: ReadonlySet<string> | null;
  /** Text identifiers the active overlays write on an element. */
  marks: ReadonlyMap<string, string[]>;
  /** Bumped by the parent when the focus should physically move to `active`. */
  focusToken: number;
}

interface Row {
  element: ProcessMapElement;
  outline: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  position: number;
  size: number;
}

export default function ProcessOutline({
  model,
  nav,
  problems,
  expanded,
  onExpandedChange,
  active,
  onActiveChange,
  selected,
  onActivate,
  visible,
  excluded,
  lit,
  marks,
  focusToken,
}: ProcessOutlineProps) {
  const rows = useRef<Map<string, HTMLLIElement>>(new Map());
  const typed = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  const byId = useMemo(
    () => new Map(model.elements.map((element) => [element.id, element])),
    [model],
  );

  /**
   * The rows on screen, in outline order.
   *
   * An overlay narrows what is listed but never hides the way to what is left:
   * a sub-process whose level still holds something stays, so a filter cannot
   * strand a step behind a row that is gone.
   */
  const shown = useMemo<Row[]>(() => {
    const keep = (id: string): boolean => {
      if (!visible) return true;
      if (visible.has(id)) return true;
      return (nav.entries.get(id)?.children ?? []).some(keep);
    };
    const out: Row[] = [];
    const walk = (ids: readonly string[], depth: number) => {
      const siblings = ids.filter(keep);
      siblings.forEach((id, index) => {
        const entry = nav.entries.get(id);
        const element = byId.get(id);
        if (!entry || !element) return;
        const hasChildren = entry.children.length > 0;
        const open = hasChildren && expanded.has(id);
        out.push({
          element,
          outline: entry.outline,
          depth,
          hasChildren,
          expanded: open,
          position: index + 1,
          size: siblings.length,
        });
        if (open) walk(entry.children, depth + 1);
      });
    };
    walk(nav.roots, 1);
    return out;
  }, [byId, expanded, nav, visible]);

  const order = useMemo(() => shown.map((row) => row.element.id), [shown]);
  const roving = active && order.includes(active) ? active : order[0] ?? null;

  useEffect(() => {
    if (!focusToken || !active) return;
    rows.current.get(active)?.focus();
  }, [focusToken, active, order]);

  const setExpanded = useCallback((id: string, open: boolean) => {
    const next = new Set(expanded);
    if (open) next.add(id);
    else next.delete(id);
    onExpandedChange(next);
  }, [expanded, onExpandedChange]);

  /** Move the focus to a row that is already on screen. */
  const focusRow = useCallback((id: string | undefined) => {
    if (!id) return;
    rows.current.get(id)?.focus();
    onActiveChange(id);
  }, [onActiveChange]);

  /** Move the focus to any element of the outline, opening whatever hides it. */
  const reveal = useCallback((id: string) => {
    const ancestors = nav.entries.get(id)?.ancestors ?? [];
    if (ancestors.some((ancestor) => !expanded.has(ancestor))) {
      onExpandedChange(new Set([...expanded, ...ancestors]));
    }
    onActiveChange(id);
    // The row may not exist yet; the focus effect runs again once it does.
    rows.current.get(id)?.focus();
  }, [expanded, nav, onActiveChange, onExpandedChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const current = (event.target as HTMLElement).closest('[data-tree-node]')?.getAttribute('data-tree-node')
      ?? roving;
    const index = current ? order.indexOf(current) : -1;
    const row = index >= 0 ? shown[index] : null;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRow(order[Math.min(order.length - 1, index + 1)]);
        return;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(order[Math.max(0, index - 1)]);
        return;
      case 'Home':
        event.preventDefault();
        focusRow(order[0]);
        return;
      case 'End':
        event.preventDefault();
        focusRow(order[order.length - 1]);
        return;
      case 'ArrowRight':
        if (!row) return;
        event.preventDefault();
        if (row.hasChildren && !row.expanded) setExpanded(row.element.id, true);
        else focusRow(order[index + 1]);
        return;
      case 'ArrowLeft': {
        if (!row) return;
        event.preventDefault();
        if (row.hasChildren && row.expanded) {
          setExpanded(row.element.id, false);
          return;
        }
        for (let i = index - 1; i >= 0; i -= 1) {
          if (shown[i].depth < row.depth) {
            focusRow(shown[i].element.id);
            return;
          }
        }
        return;
      }
      case 'Enter':
      case ' ':
      case 'Spacebar':
        if (!row) return;
        event.preventDefault();
        // Enter on a sub-process opens it as its own level (§5.9 item 12) and
        // selects it, so the map follows the tree without a second key.
        if (row.hasChildren) setExpanded(row.element.id, !row.expanded);
        onActivate(row.element.id);
        return;
      default:
        break;
    }

    // Type-ahead — one printable character at a time, a second within a second
    // extending the search rather than starting a new one.
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    const now = Date.now();
    typed.current = {
      text: now - typed.current.at > 1000 ? event.key : typed.current.text + event.key,
      at: now,
    };
    const needle = typed.current.text.toLowerCase();
    const pool = visible ? nav.order.filter((id) => visible.has(id)) : nav.order;
    const from = current ? Math.max(0, pool.indexOf(current)) : 0;
    const rotated = [...pool.slice(from + 1), ...pool.slice(0, from + 1)];
    const match = rotated.find((id) => {
      const entry = nav.entries.get(id);
      const element = byId.get(id);
      if (!entry || !element) return false;
      return entry.outline.startsWith(needle) || element.label.toLowerCase().startsWith(needle);
    });
    if (match) {
      event.preventDefault();
      reveal(match);
    }
  }, [byId, focusRow, nav, onActivate, order, reveal, roving, setExpanded, shown, visible]);

  return (
    <div
      data-process-outline=""
      className="flex flex-col overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface"
    >
      <p
        data-process-outline-count
        className="border-b border-cc-line px-2 py-1 text-[11px] font-semibold text-cc-ink-muted"
      >
        {visible
          ? `Showing ${visible.size} of ${nav.order.length} elements`
          : `${nav.order.length} elements on ${nav.planes.size} levels`}
      </p>
      <ul
        role="tree"
        aria-label={`Outline of ${model.processName}`}
        data-process-outline-tree=""
        onKeyDown={handleKeyDown}
        className="max-h-[420px] overflow-y-auto md:max-h-[520px]"
      >
        {shown.map((row) => {
          const { element } = row;
          const problem = row.hasChildren ? problems.get(element.id) : undefined;
          const isSelected = element.id === selected;
          const out = excluded.has(element.id);
          const dim = lit !== null && !lit.has(element.id);
          const identifiers = marks.get(element.id) ?? [];
          return (
            <li
              key={element.id}
              ref={(node) => {
                if (node) rows.current.set(element.id, node);
                else rows.current.delete(element.id);
              }}
              role="treeitem"
              aria-level={row.depth}
              aria-posinset={row.position}
              aria-setsize={row.size}
              aria-selected={isSelected}
              aria-expanded={row.hasChildren ? row.expanded : undefined}
              aria-label={`${row.outline}. ${element.accessibleName}${problem ? ` ${problem.text}` : ''}${
                out ? ' Does not run in this variant.' : ''
              }`}
              data-tree-node={element.id}
              data-outline={row.outline}
              data-variant={out ? 'out' : 'in'}
              data-lit={dim ? 'off' : 'on'}
              tabIndex={element.id === roving ? 0 : -1}
              onFocus={() => onActiveChange(element.id)}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('[data-tree-twisty]')) return;
                // A click on a phase opens it, the way Enter and a double-click
                // on the map do (`DESIGN.md` §5.9 item 1). It never closes one:
                // the twisty is for that, and a reader who clicks a row to read
                // it does not expect the level under it to disappear.
                if (row.hasChildren && !row.expanded) setExpanded(element.id, true);
                onActiveChange(element.id);
                onActivate(element.id);
              }}
              className={cn(
                'cursor-pointer border-b border-cc-line last:border-b-0',
                'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cc-focus',
                isSelected && 'bg-cc-surface-muted',
              )}
            >
              <div
                className="flex items-start gap-1 py-1.5 pr-2"
                style={{ paddingLeft: `${4 + (row.depth - 1) * 14}px` }}
              >
                {row.hasChildren ? (
                  <button
                    type="button"
                    data-tree-twisty={element.id}
                    tabIndex={-1}
                    aria-hidden={true}
                    onClick={() => setExpanded(element.id, !row.expanded)}
                    className="mt-0.5 shrink-0 rounded-cc-row p-0.5 text-cc-ink-muted hover:text-cc-ink"
                  >
                    {row.expanded
                      ? <ChevronDown size={12} aria-hidden={true} />
                      : <ChevronRight size={12} aria-hidden={true} />}
                  </button>
                ) : (
                  <span aria-hidden={true} className="mt-0.5 w-[17px] shrink-0" />
                )}

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-1.5">
                    <span data-outline-number className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">
                      {row.outline}
                    </span>
                    <span className="text-[11px] font-semibold tracking-[0.06em] text-cc-ink-muted uppercase">
                      {element.kind}
                    </span>
                    <span className="cc-outline-label min-w-0 truncate text-[12px] font-semibold text-cc-ink">
                      {element.label}
                    </span>
                    {out ? (
                      <span data-variant-mark={element.id} className="text-[11px] font-semibold text-cc-ink-muted">
                        does not run
                      </span>
                    ) : null}
                  </span>

                  {problem ? (
                    <>
                      <span data-plane-counters className="text-[11px] font-medium text-cc-ink-muted">
                        {problem.lines ? `L${problem.lines.lineStart}–${problem.lines.lineEnd} · ` : ''}
                        {problem.counters}
                      </span>
                      <span
                        data-plane-problem={element.id}
                        data-determined={problem.determined ? 'true' : 'false'}
                        className="text-[11px] font-medium text-cc-ink-muted"
                      >
                        {problem.text}
                      </span>
                    </>
                  ) : null}

                  {identifiers.length > 0 || element.anchor === null ? (
                    <span className="flex flex-wrap items-center gap-1">
                      {element.anchor === null ? (
                        <CcAnchor tone="unlinked" label={element.unanchoredReason || undefined}>
                          {element.evidenceLabel}
                        </CcAnchor>
                      ) : null}
                      {identifiers.map((identifier) => (
                        <CcTag key={identifier}>{identifier}</CcTag>
                      ))}
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
