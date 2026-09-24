'use client';

import React from 'react';
import Link from 'next/link';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcWhyPopover from '@/components/cc/WhyPopover';
import { objectStatus } from '@/lib/object-status';
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
 *
 * **Every status has its "Why?"** (`DESIGN.md` §2.10, roadmap 3.0.3). The
 * reason used to live in a `title` attribute only — on record in the DOM, out
 * of reach on a phone and for a keyboard. The popover states each phase the
 * status rests on in the phase contract's own words (badge and detail) and
 * links to the stage tool that holds it, so every state the preservation
 * register's reference cases expect of a phase can be read in the workspace,
 * and every stage-internal gate they expect — a generation blocker, disabled
 * handover downloads — is one link away rather than somewhere in the product.
 * The chip at its top is the status's own provenance, or *Reconstructed* where
 * there is none: without a source worth naming, the status is this product's
 * reading of what is on record, the same statement "Next step" makes and
 * labels the same way (`lib/next-step.ts`).
 */
export default function WorkspaceStatusLine({
  statuses,
  projectId,
  toolBase,
}: {
  statuses: WorkspaceStatus[];
  projectId?: string;
  /**
   * Where the stage tools live. A project's are under `/project/{id}`; the
   * demo's under `/demo` (roadmap 3.0.7), which has no project id to put in
   * the path — a made-up one would link every "Why?" to a 404.
   */
  toolBase?: string;
}) {
  const base = toolBase ?? `/project/${projectId ?? ''}`;
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
          <CcWhyPopover
            subject={`${entry.label} ${objectStatus(entry.status).label}`}
            provenance={entry.provenance ?? 'reconstructed'}
            basis={
              entry.restsOn.length === 0 ? (
                <span data-workspace-status-basis="">{entry.detail}</span>
              ) : (
                <ul data-workspace-status-basis="" className="m-0 list-none space-y-1 p-0">
                  {entry.restsOn.map((phase) => (
                    <li key={phase.key} data-workspace-status-phase={phase.key}>
                      <span className="font-semibold">
                        {phase.label} · {phase.badge}
                      </span>
                      {' — '}
                      {phase.detail}
                    </li>
                  ))}
                </ul>
              )
            }
            evidence={
              entry.restsOn.length === 0 ? undefined : (
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {entry.restsOn.map((phase) => (
                    <Link
                      key={phase.key}
                      href={`${base}/${phase.path}`}
                      data-workspace-status-tool={phase.key}
                      className="font-semibold text-cc-ink underline underline-offset-2"
                    >
                      Open {phase.label}
                    </Link>
                  ))}
                </span>
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}
