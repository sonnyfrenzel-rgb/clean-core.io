'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { MiniMapRow } from '@/lib/process-navigation';

/**
 * The mini map — roadmap 2.9, `DESIGN.md` §5.9 item 5.
 *
 * One row per level, one cell per step, in the outline order. Deliberately not
 * a thumbnail of the diagram: 65 BPMN shapes at a tenth of their size are a
 * grey smear, and a thumbnail would move whenever the layout engine moved,
 * which is the one thing §5.9 item 10 forbids. This is derived from the outline
 * and from nothing else, so it is the same picture on every reload, in every
 * session and on every machine — and a reader who has learnt that the credit
 * check is the fourth cell of the sixth row finds it without reading a word.
 *
 * Every cell is a button with a spoken name. It is not decoration: it is the
 * shortest way to a step that is already on screen, and it is the only view
 * that shows all eight levels at once.
 */
export interface ProcessMiniMapProps {
  rows: readonly MiniMapRow[];
  /** The level on show. */
  plane: string | null;
  selected: string | null;
  /** Elements the search left marked. */
  found: ReadonlySet<string>;
  /** Elements that do not run in the chosen variant. */
  excluded: ReadonlySet<string>;
  onSelect: (elementId: string) => void;
}

export default function ProcessMiniMap({
  rows,
  plane,
  selected,
  found,
  excluded,
  onSelect,
}: ProcessMiniMapProps) {
  return (
    <div
      data-process-minimap=""
      aria-label="Mini map — every level, every step"
      role="group"
      className="flex flex-col gap-1 rounded-cc-card border border-cc-line bg-cc-surface p-2"
    >
      {rows.map((row) => (
        <div
          key={row.plane ?? 'top'}
          data-minimap-row={row.plane ?? 'top'}
          data-open={row.plane === plane ? 'true' : 'false'}
          className={cn(
            'flex items-center gap-1.5 rounded-cc-row px-1 py-0.5',
            row.plane === plane && 'bg-cc-surface-muted',
          )}
        >
          <span className="w-8 shrink-0 truncate font-cc-mono text-[10px] font-semibold text-cc-ink-muted">
            {row.outline || '—'}
          </span>
          <span className="flex min-w-0 flex-wrap gap-0.5">
            {row.cells.map((cell) => (
              <button
                key={cell.id}
                type="button"
                data-minimap-cell={cell.id}
                data-state={
                  cell.id === selected ? 'selected'
                    : found.has(cell.id) ? 'found'
                      : excluded.has(cell.id) ? 'out'
                        : cell.unanchored ? 'unanchored'
                          : cell.decision ? 'decision' : 'step'
                }
                aria-label={`${cell.outline} in ${row.label}`}
                tabIndex={-1}
                onClick={() => onSelect(cell.id)}
                className="cc-minimap-cell"
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
