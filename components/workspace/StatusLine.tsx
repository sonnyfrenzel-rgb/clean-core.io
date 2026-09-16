'use client';

import React from 'react';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import type { WorkspaceStatus } from '@/lib/workspace-model';

/**
 * The seven statuses of `DESIGN.md` §2.3 — roadmap 1.4.
 *
 * Provenance · Need · Standard · Costs · Confirmed · Execution · Handover, each
 * an **object status**: a word with a state dot, no outline, no icon. Beside it,
 * where the statement has a source worth naming, a **provenance chip**. The two
 * never merge and never look alike (ADR-023): a status says *how far*, a chip
 * says *where from*.
 *
 * This component decides nothing. Every value arrives from
 * `workspaceStatusLine()`, which derives five of the seven from the phase
 * contract roadmap 1.7 made the single rule, and says plainly of the other two
 * that this release records no artefact for them. The rendering is deliberately
 * dumb so that the honesty is testable in one place instead of seven.
 *
 * `data-workspace-status` carries the facet and `data-status` the value, so a
 * rendered guard can read what an empty project actually paints rather than
 * what a source file claims it would.
 */
export default function WorkspaceStatusLine({ statuses }: { statuses: WorkspaceStatus[] }) {
  return (
    <ul
      data-workspace-status-line=""
      aria-label="Project status"
      className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-2 p-0"
    >
      {statuses.map((entry) => (
        <li
          key={entry.facet}
          data-workspace-status={entry.facet}
          data-status={entry.status}
          title={entry.detail}
          className="flex items-center gap-1.5"
        >
          <CcObjectStatus value={entry.status} facet={entry.label} />
          {entry.provenance ? <CcProvenanceChip value={entry.provenance} /> : null}
        </li>
      ))}
    </ul>
  );
}
