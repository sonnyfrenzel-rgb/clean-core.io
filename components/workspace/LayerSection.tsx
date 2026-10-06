'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
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
  aboveInView = false,
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
   * Business (owner, 03.10.2026): the map, its counts and the business rules
   * already stand above this section, each once. *Need & process* then does
   * not summarise the process or list the rules a second time — it says where
   * they are and keeps only what is its own (the usage records).
   */
  aboveInView?: boolean;
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
  const needAbove = aboveInView && layer.key === 'need';
  const withRules =
    !needAbove && layer.key === 'need' && reading !== null && reading.ruleSet.rules.length > 0 && projectId !== '';
  const withFit = layer.key === 'standard' && !empty && projectId !== '';
  // The rules are shown by the editor; the rows that are left are the usage
  // records, which keep the plain row list below it.
  // The process row is the map's summary, rendered on its own below; the
  // rules are shown by the editor; the rows that are left are the usage
  // records, which keep the plain row list.
  const processRow =
    layer.key === 'need' && !needAbove ? (layer.rows.find((row) => row.key === 'process') ?? null) : null;
  const rows = layer.rows.filter(
    (row) => row.key !== 'process' && !((withRules || needAbove) && row.key.startsWith('rule-')),
  );
  // A long section ends with the way back to its top, where the sticky bar
  // says which section this is (owner, 03.10.2026). "Long" is measured, not
  // counted: the count used to be `layer.total`, which in Business includes the
  // process and the rules this section does not render there (they stand above
  // it), so *Need & process* — one sentence tall — carried the link right under
  // its own heading, and a click had nowhere to scroll (owner, 06.10.2026:
  // "'Back to top of section' doesn't work"). The link now stands only where
  // the section is taller than the room under the sticky bars, i.e. where its
  // top can actually be out of view while the reader is at its end.
  const sectionRef = useRef<HTMLElement>(null);
  const long = useTallerThanView(sectionRef, layer.key);

  return (
    <section
      ref={sectionRef}
      id={layer.key}
      data-workspace-layer-section={layer.key}
      data-layer-empty={empty ? 'yes' : 'no'}
      aria-labelledby={`layer-title-${layer.key}`}
      className="scroll-mt-32"
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

      {needAbove && !empty ? (
        <div
          data-workspace-layer-above=""
          className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
        >
          <p className="m-0 min-w-0 flex-1 basis-64 text-[13px] leading-snug font-medium text-cc-ink-muted">
            {wt('layerSection.needAbove')}
          </p>
          {onOpenMap ? (
            <span className="cc-no-print">
              <CcButton onClick={onOpenMap} data-workspace-layer-open-map="">
                {wt('layerSection.showMap')}
              </CcButton>
            </span>
          ) : null}
        </div>
      ) : null}
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
            <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
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
          {!withRules && !needAbove && layer.total > layer.rows.length && (
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
      {long && !empty ? (
        <p className="cc-no-print m-0 mt-3">
          <a
            href={`#${layer.key}`}
            data-workspace-layer-top=""
            onClick={(event) => {
              // The fragment is the layer already; scroll instead of a second history entry.
              event.preventDefault();
              document.getElementById(layer.key)?.scrollIntoView({ block: 'start' });
            }}
            className="inline-flex min-h-6 items-center gap-1 text-[12px] font-semibold text-cc-ink underline underline-offset-2 pointer-coarse:min-h-11"
          >
            <ArrowUp size={14} aria-hidden={true} />
            {wt('layerSection.backToTop')}
          </a>
        </p>
      ) : null}
    </section>
  );
}

/**
 * Whether the section is taller than the room the viewport leaves under the
 * sticky shell bar and section bar — the room its own `scroll-margin-top`
 * (`scroll-mt-32`) reserves for them. Re-measured when the section's content
 * changes height (a table that loads, a fold that opens) and when the window
 * is resized; `false` until measured, so the server and the first paint never
 * offer a link that may lead nowhere.
 */
function useTallerThanView(ref: React.RefObject<HTMLElement | null>, key: string): boolean {
  const [tall, setTall] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const offset = parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0;
      setTall(el.getBoundingClientRect().height > window.innerHeight - offset);
    };
    check();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    observer?.observe(el);
    window.addEventListener('resize', check);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [ref, key]);
  return tall;
}
