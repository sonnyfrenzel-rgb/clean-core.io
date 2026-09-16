'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * The table of `DESIGN.md` §2.4 — and §2.9's "cards instead of columns" on S.
 *
 * Four rules are built in rather than left to whoever writes the next table:
 *
 *   - **Numbers right, unit in the head.** `numeric` sets both the alignment and
 *     `tabular-nums`, so a column of figures lines up on its digits. A column of
 *     right-aligned numbers that do not line up is the reason people export a
 *     table to a spreadsheet before reading it.
 *   - **Column heads are micro-labels** — 11px, 600, uppercase, 0.08em (§1.2) —
 *     and that is the only place uppercase is allowed. Content is never
 *     uppercase here.
 *   - **On S the columns become a card**: each cell keeps its label and stacks.
 *     Done with the display utilities rather than a media query in a stylesheet,
 *     so the markup is one table and screen readers see one table.
 *   - **A row can be taken over.** `span` replaces every cell after the first,
 *     which is what a run in progress does to its row in mockup s7, and `note`
 *     is a full-width strip underneath it — the place a failed run's message
 *     strip belongs (§2.6, §2.8).
 *
 * `onOpen` makes the row clickable, and it is deliberately not the only way in:
 * a clickable `<tr>` cannot be reached from a keyboard and is invisible to a
 * screen reader. The caller puts a real link in a cell and may pass `onOpen` as
 * well, for the mouse.
 */
export interface CcTableColumn {
  key: string;
  /** The micro-label. Carries the unit, where there is one — §2.4. */
  label: string;
  /** Right-aligned and tabular. */
  numeric?: boolean;
  /** A CSS width for the column, e.g. `'160px'`. */
  width?: string;
  /** The trailing action column: no label shown, right-aligned. */
  action?: boolean;
}

export interface CcTableRowSpec {
  key: string;
  cells: Record<string, React.ReactNode>;
  /** Takes over every cell after the first one. */
  span?: React.ReactNode;
  /** A full-width row underneath this one — a strip about this row. */
  note?: React.ReactNode;
  /** Opens the row on click. Never the only way in; see the note above. */
  onOpen?: () => void;
  /** Marks the row as the reader's current one — ink, never a state colour (§1.1). */
  selected?: boolean;
}

export interface CcTableProps {
  /** The accessible name of the table. Not rendered; the toolbar carries the visible one. */
  caption: string;
  columns: readonly CcTableColumn[];
  rows: readonly CcTableRowSpec[];
}

const CELL = 'block px-3 py-2 align-top text-[13px] font-medium text-cc-ink sm:table-cell';

export default function CcTable({ caption, columns, rows }: CcTableProps) {
  const [first, ...rest] = columns;

  return (
    <div className="w-full overflow-x-auto">
      <table data-cc-table="" className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-cc-line">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={cn(
                  'px-3 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase',
                  column.numeric || column.action ? 'text-right' : 'text-left',
                )}
              >
                {column.action ? <span className="sr-only">{column.label}</span> : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <React.Fragment key={row.key}>
              <tr
                data-cc-table-row={row.key}
                onClick={row.onOpen}
                className={cn(
                  'block border-b border-cc-line sm:table-row',
                  row.selected ? 'bg-cc-surface-muted' : 'bg-cc-surface',
                  row.onOpen ? 'cursor-pointer hover:bg-cc-surface-muted' : null,
                )}
              >
                {first ? (
                  <td className={CELL} style={first.width ? { width: first.width } : undefined}>
                    {row.cells[first.key]}
                  </td>
                ) : null}

                {row.span !== undefined ? (
                  <td className={CELL} colSpan={Math.max(rest.length, 1)}>
                    {row.span}
                  </td>
                ) : (
                  rest.map((column) => (
                    <td
                      key={column.key}
                      data-cc-table-cell={column.key}
                      style={column.width ? { width: column.width } : undefined}
                      className={cn(
                        CELL,
                        column.numeric || column.action ? 'sm:text-right' : null,
                        column.numeric ? 'tabular-nums' : null,
                      )}
                    >
                      {column.action ? null : (
                        <span className="mr-2 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase sm:hidden">
                          {column.label}
                        </span>
                      )}
                      {row.cells[column.key]}
                    </td>
                  ))
                )}
              </tr>
              {row.note ? (
                <tr data-cc-table-note={row.key} className="block border-b border-cc-line sm:table-row">
                  <td className="block px-3 pt-0 pb-2.5 sm:table-cell" colSpan={columns.length}>
                    {row.note}
                  </td>
                </tr>
              ) : null}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
