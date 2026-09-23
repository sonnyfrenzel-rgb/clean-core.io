'use client';

import React from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcEmptyState } from '@/components/cc/EmptyState';
import type { WorkspaceLayer } from '@/lib/workspace-model';

/**
 * The content of the chosen layer — `DESIGN.md` §2.3 item 5, roadmap 6.2.
 *
 * The Anchor Bar above it says *where there is something to read*; this says
 * **what**. Until this step the bar was a navigation to nothing: six tabs, a
 * click, and the same page underneath. A layer that cannot be opened is a
 * promise the screen keeps making and never keeps.
 *
 * **An empty layer says so, and why** (roadmap 6.2, W22-A03). It is not hidden
 * and it is not filled with something nearby: *Standard fit* is empty on every
 * project this release can produce, and the honest rendering of that is the
 * sentence naming the artefact that is missing — not the routing recommendation
 * sitting on the project, which is a different claim (`DESIGN.md` §5.3).
 *
 * `lib/first-look.ts` is the pattern this follows one layer up: an absence is a
 * value with a reason (`origin: 'absent'`, `absentReason`), never a blank and
 * never a zero.
 *
 * The section carries `id={layer.key}` so `#evidence` is a real anchor as well
 * as a selection — ADR-018's *„springt zu einem Abschnitt der Seite"* — and the
 * heading is an `h2`, because the project title is the `h1` and no level is
 * skipped (§2.3).
 */
export default function WorkspaceLayerSection({ layer }: { layer: WorkspaceLayer }) {
  const empty = layer.rows.length === 0;

  return (
    <section
      id={layer.key}
      data-workspace-layer-section={layer.key}
      data-layer-empty={empty ? 'yes' : 'no'}
      aria-labelledby={`layer-title-${layer.key}`}
      className="scroll-mt-20"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id={`layer-title-${layer.key}`}
          data-workspace-layer-title
          className="m-0 text-[15px] leading-tight font-bold tracking-[-0.01em] text-cc-ink"
        >
          {layer.label}
        </h2>
        <CcProvenanceChip value={layer.provenance} />
      </div>

      {empty ? (
        // Not a blank area and not a spinner: the reason, in the same words the
        // bar uses under "More", so a reader who arrives here from either
        // direction reads one sentence rather than two versions of it.
        <div className="mt-2" data-workspace-layer-absent={layer.key}>
          <CcEmptyState title="Nothing on record for this layer">
            <span data-workspace-layer-absent-reason="">{layer.missing}</span>
          </CcEmptyState>
        </div>
      ) : (
        <>
          <ul
            data-workspace-layer-rows={layer.key}
            className="m-0 mt-2 list-none space-y-1.5 p-0"
          >
            {layer.rows.map((row) => (
              <li
                key={row.key}
                data-workspace-layer-row={row.key}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
              >
                <span className="text-[13px] font-bold text-cc-ink">{row.label}</span>
                <span className="text-[13px] font-medium text-cc-ink-muted">{row.value}</span>
                {row.anchor && (
                  <span className="ml-auto">
                    {/* Unlinked on purpose: the source column that would open it
                        is a later step, and a link that goes nowhere is the one
                        thing `CcAnchor`'s three tones exist to prevent. */}
                    <CcAnchor tone="unlinked">{row.anchor}</CcAnchor>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {layer.total > layer.rows.length && (
            // §2.11: the first five, and the count of what is behind them. A
            // statement of fact, not a button, until there is a place to open.
            <p
              data-workspace-layer-more-count=""
              className="m-0 mt-1.5 text-[12px] font-medium text-cc-ink-muted"
            >
              Showing {layer.rows.length} of {layer.total}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
