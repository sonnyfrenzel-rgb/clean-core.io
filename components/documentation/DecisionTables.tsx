'use client';

import React from 'react';
import { ListChecks } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcTable, { type CcTableColumn } from '@/components/cc/Table';
import { decisionRowWhen, decisionTableTaskName, type DecisionTableLine, type DecisionTableView } from '@/lib/decision-tables';
import { decisionTableCaption, decisionTableRulesLine, wt } from '@/lib/workspace-messages';

/**
 * One decision table as one business rule task — roadmap 3.0.7
 * (ZMM_BESTELLUEBERSICHT review, recommendation 3; `DESIGN.md` §5.8, *Business
 * rule task … opens as a decision table*).
 *
 * The task's name says which field it determines, the table one row per
 * branch: the condition as the code writes it, the value it sets, and the line
 * of that assignment. Shared by the Documentation (section 4) and the
 * Business view's rules, so the two read the same. Every row keeps its anchor
 * and the task its range; the business rules standing in the table are named
 * by id, where their confirmation is stored.
 */

const lineWord = (a: DecisionTableLine) => (a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`);
const lineName = (a: DecisionTableLine) =>
  a.lineEnd > a.lineStart ? `Source lines ${a.lineStart} to ${a.lineEnd}` : `Source line ${a.lineStart}`;

export function DecisionTableTask({ table, tone = 'linked' }: { table: DecisionTableView; tone?: 'linked' | 'unlinked' }) {
  const name = decisionTableTaskName(table);
  const columns: CcTableColumn[] = [
    { key: 'when', label: wt('doc.decisionTableWhen') },
    { key: 'value', label: wt('doc.decisionTableValue'), width: '200px' },
    { key: 'lines', label: wt('doc.decisionTableLines'), width: '96px' },
  ];
  return (
    <div data-decision-table={table.id} className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <ListChecks size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('doc.businessRuleTask')}</span>
            <span className="text-[13px] font-semibold break-words text-cc-ink">{name}</span>
            <span className="flex flex-wrap items-center gap-2">
              <code className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{table.id}</code>
              {table.where ? <code className="font-cc-mono text-[11px] font-medium text-cc-ink-muted">{table.where}</code> : null}
            </span>
          </div>
        </div>
        <CcAnchor tone={tone} label={lineName(table.anchor)}>{lineWord(table.anchor)}</CcAnchor>
      </div>
      <div className="mt-2 min-w-0">
        <CcTable
          caption={decisionTableCaption(table.id, name)}
          columns={columns}
          rows={table.rows.map((row, i) => ({
            key: `${table.id}-${i}`,
            cells: {
              when: row.condition === null
                ? <span className="font-medium text-cc-ink-muted">{decisionRowWhen(table, null)}</span>
                : <code className="font-cc-mono text-[12px] font-medium break-all text-cc-ink">{decisionRowWhen(table, row.condition)}</code>,
              value: <code className="font-cc-mono text-[12px] font-semibold break-all text-cc-ink">{row.value}</code>,
              lines: <CcAnchor tone={tone} label={lineName(row.anchor)}>{lineWord(row.anchor)}</CcAnchor>,
            },
          }))}
        />
      </div>
      {table.ruleIds.length ? (
        <p data-decision-table-rules="" className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">
          {decisionTableRulesLine(table.ruleIds)}
        </p>
      ) : null}
    </div>
  );
}

/** Every decision table of a reading, under one title and lead — or nothing when there is none. */
export default function DecisionTables({
  tables,
  tone = 'linked',
  heading = 'h4',
}: {
  tables: readonly DecisionTableView[];
  tone?: 'linked' | 'unlinked';
  heading?: 'h3' | 'h4';
}) {
  if (!tables.length) return null;
  const Heading = heading;
  return (
    <div data-decision-tables={tables.length} className="flex min-w-0 flex-col gap-2">
      <Heading className="m-0 cc-text-h3 text-cc-ink">
        {wt('doc.decisionTablesTitle')} ({tables.length})
      </Heading>
      <p className="m-0 max-w-3xl text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('doc.decisionTablesLead')}</p>
      {tables.map((table) => (
        <DecisionTableTask key={table.id} table={table} tone={tone} />
      ))}
    </div>
  );
}
