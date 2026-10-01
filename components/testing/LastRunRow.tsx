'use client';

import React from 'react';
import { FlaskConical } from 'lucide-react';
import CcDateText from '@/components/cc/DateText';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { countsLine, type LastRun } from './testing-summary';

/**
 * The last run in one row — date, counts, and what the result is worth. Used in
 * the right rail of both tabs, so the tenant tab can say what the mock tab has
 * done without sending the reader there.
 */
export default function LastRunRow({ run }: { run: LastRun }) {
  let title: React.ReactNode;
  let detail: React.ReactNode;
  let chip = false;

  if (run.kind === 'recorded') {
    title = <>Last run · <CcDateText value={run.at} format="iso" /></>;
    detail = countsLine(run.counts);
    chip = true;
  } else if (run.kind === 'session') {
    title = 'Last run · this session, not recorded';
    detail = countsLine(run.counts);
    chip = true;
  } else if (run.kind === 'earlier') {
    title = <>Last recorded run · <CcDateText value={run.at} format="iso" /></>;
    detail = 'For earlier code or an earlier suite — this version has not run yet.';
  } else {
    title = 'Last run';
    detail = 'No run on record yet.';
  }

  return (
    <div data-last-run={run.kind} className="flex items-start gap-3 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-cc-row border border-cc-line bg-cc-surface text-cc-ink-muted">
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="m-0 cc-text-cell font-semibold text-cc-ink">{title}</p>
        <p className="m-0 cc-text-meta text-cc-ink-muted">{detail}</p>
        {chip ? (
          <div className="mt-1">
            <CcProvenanceChip value="demonstrated-mock" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
