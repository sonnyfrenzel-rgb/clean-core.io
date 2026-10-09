'use client';

import React, { useMemo, useState } from 'react';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { usageRecordRows } from '@/lib/workspace-model';
import type { Project } from '@/lib/types';
import { layerSectionShowing, usageShowAll, wt } from '@/lib/workspace-messages';

/** §2.11: the first five, and the way to the rest. */
const FIRST = 5;

/**
 * The imported usage records — every one of them (ADR-080).
 *
 * In Business they stand beside the map, under it; in IT and Management inside
 * *Need & process*. Before, they were rows of that section after the process
 * row and every rule, and the section's five-row cut hid them on any program
 * with four rules or more — in Business without even the count of what was
 * hidden. Here the first five show and "Show all" opens the rest; nothing is
 * cut without saying so.
 *
 * Nothing when no usage is imported: usage that was never imported is
 * unknown, never "unused", and the Need status says so already.
 */
export default function UsageRecords({
  project,
  level = 3,
  className,
}: {
  project: Project | null;
  level?: 2 | 3;
  /** The space above it, given by the place it stands in. */
  className?: string;
}) {
  const rows = useMemo(() => usageRecordRows(project), [project]);
  const [all, setAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, FIRST);
  return (
    <div data-workspace-usage-records={rows.length} className={className}>
      <CcCard title={wt('usage.title')} level={level} count={rows.length} meta={<CcProvenanceChip value="imported" />}>
        <p className="m-0 mb-2 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('usage.lead')}</p>
        <ul className="m-0 list-none space-y-2 p-0">
          {shown.map((row) => (
            <li
              key={row.key}
              data-workspace-usage-record={row.key}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
            >
              <span className="text-[13px] font-bold text-cc-ink">{row.label}</span>
              <span className="text-[13px] font-medium text-cc-ink-muted">{row.value}</span>
            </li>
          ))}
        </ul>
        {rows.length > FIRST ? (
          <div className="cc-no-print mt-2 flex flex-wrap items-center gap-3">
            <span data-workspace-usage-showing="" className="text-[12px] font-medium text-cc-ink-muted">
              {layerSectionShowing(shown.length, rows.length)}
            </span>
            <CcButton onClick={() => setAll((v) => !v)} aria-expanded={all} data-workspace-usage-all="">
              {all ? wt('usage.showFirst') : usageShowAll(rows.length)}
            </CcButton>
          </div>
        ) : null}
      </CcCard>
    </div>
  );
}
