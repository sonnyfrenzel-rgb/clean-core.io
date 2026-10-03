'use client';

import React from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcEmptyState } from '@/components/cc/EmptyState';
import type { WorkspaceLayer } from '@/lib/workspace-model';
import type { SourceReading } from '@/lib/first-look';
import type { ProcessSummary } from '@/lib/process-summary';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import type { Project } from '@/lib/types';
import BusinessRulesEditor from './BusinessRulesEditor';
import StandardFitTable from './StandardFitTable';
import { wt, layerSectionShowing } from '@/lib/workspace-messages';

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
 * as a selection — ADR-018's *"jumps to a section of the page"* — and the
 * heading is an `h2`, because the project title is the `h1` and no level is
 * skipped (§2.3).
 */
export default function WorkspaceLayerSection({
  layer,
  project = null,
  projectId = '',
  reading = null,
  process = null,
  onOpenMap,
}: {
  layer: WorkspaceLayer;
  /**
   * The map of the signed source, counted as the map counts it. *Need &
   * process* summarises it here and links to it — the map itself stands once
   * on the page (owner, 03.10.2026).
   */
  process?: ProcessSummary | null;
  /** Scrolls to the map where this view has one (Business); elsewhere the link opens Business. */
  onOpenMap?: () => void;
  /**
   * The project, its id and the first look's reading of its source. With them,
   * *Need & process* shows the business rules and their one editing mode
   * (mockup `s2`) and *Standard fit* its table (`s3`); without them both fall
   * back to the plain rows, as every other layer does.
   */
  project?: Project | null;
  projectId?: string;
  reading?: SourceReading | null;
}) {
  const empty = layer.rows.length === 0;
  const withRules = layer.key === 'need' && reading !== null && reading.ruleSet.rules.length > 0 && projectId !== '';
  const withFit = layer.key === 'standard' && !empty && projectId !== '';
  // The rules are shown by the editor; the rows that are left are the usage
  // records, which keep the plain row list below it.
  // The process row is the map's summary, rendered on its own below; the
  // rules are shown by the editor; the rows that are left are the usage
  // records, which keep the plain row list.
  const processRow = layer.key === 'need' ? (layer.rows.find((row) => row.key === 'process') ?? null) : null;
  const rows = layer.rows.filter((row) => row.key !== 'process' && !(withRules && row.key.startsWith('rule-')));

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

      {processRow ? (
        <div
          className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
          data-workspace-layer-process=""
          data-steps={process?.steps}
          data-decisions={process?.decisions}
          data-rules={reading?.ruleSet.rules.length ?? 0}
        >
          <div className="min-w-0 flex-1 basis-64">
            <p className="m-0 text-[13px] font-bold text-cc-ink">{processRow.value}</p>
            <p className="m-0 mt-0.5 text-[12px] leading-snug font-medium text-cc-ink-muted">
              {wt('layerSection.processNote')}
            </p>
          </div>
          <span className="cc-no-print">
            {onOpenMap ? (
              <CcButton onClick={onOpenMap} data-workspace-layer-open-map="">
                {wt('layerSection.showMap')}
              </CcButton>
            ) : projectId ? (
              <CcLinkButton href={`/project/${encodeURIComponent(projectId)}?view=business`} data-workspace-layer-open-map="">
                {wt('layerSection.showMapBusiness')}
              </CcLinkButton>
            ) : null}
          </span>
        </div>
      ) : null}
      {withRules ? (
        <div className="mt-2" data-workspace-layer-rules="">
          <BusinessRulesEditor project={project} projectId={projectId} reading={reading} />
        </div>
      ) : null}
      {withFit ? (
        <div className="mt-2" data-workspace-layer-fit="">
          <StandardFitTable project={project} projectId={projectId} />
        </div>
      ) : empty ? (
        // Not a blank area and not a spinner: the reason, in the same words the
        // bar uses under "More", so a reader who arrives here from either
        // direction reads one sentence rather than two versions of it.
        <div className="mt-2" data-workspace-layer-absent={layer.key}>
          <CcEmptyState title={wt('layerSection.nothingOnRecord')}>
            <span data-workspace-layer-absent-reason="">{layer.missing}</span>
          </CcEmptyState>
        </div>
      ) : rows.length === 0 ? null : (
        <>
          <ul
            data-workspace-layer-rows={layer.key}
            className="m-0 mt-2 list-none space-y-2 p-0"
          >
            {rows.map((row) => (
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
          {!withRules && layer.total > layer.rows.length && (
            // §2.11: the first five, and the count of what is behind them. A
            // statement of fact, not a button, until there is a place to open.
            <p
              data-workspace-layer-more-count=""
              className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted"
            >
              {layerSectionShowing(layer.rows.length, layer.total)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
