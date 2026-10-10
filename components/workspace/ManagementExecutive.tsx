'use client';

import React from 'react';
import { FileText } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcLinkButton from '@/components/cc/LinkButton';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevelExplained } from '@/components/cc/LevelExplained';
import { CcTag } from '@/components/cc/Tag';
import { cn } from '@/lib/utils';
import {
  execMoreBlockersLabel,
  stdFitGroupLabel,
  stdFitLineLabel,
  stdFitMeterLabel,
  stdFitMoreLabel,
  stdFitPercentLabel,
  stdFitTitleOn,
  wt,
} from '@/lib/workspace-messages';
import { chartLabel, type ChartSegment, type SegmentTone } from '@/lib/management-overview';
import type { ExecutiveSummary, ExecutiveTarget } from '@/lib/management-executive';
import type { ProvenanceValue } from '@/lib/provenance';
import { NO_SAP_DEPENDENCY_TITLE, STANDARD_FIT_DEFINITION, type StandardFit, type StandardFitItem } from '@/lib/standard-fit';
import InfoPopover from './InfoPopover';
import { STEERING_TITLE } from '@/lib/steering-one-pager';
import GlossaryTerm from '@/components/GlossaryTerm';
import type { DecisionOptionsView, DecisionStage } from '@/lib/decision-option-signals';
import type { ObjectStatusValue } from '@/lib/object-status';

/** Where the decision stands, as the object status beside the answer (ADR-079). */
const STAGE_STATUS: Record<DecisionStage, ObjectStatusValue> = {
  'not-decided': 'open',
  chosen: 'draft',
  confirmed: 'confirmed',
  outdated: 'open',
};

/**
 * The decision panel on top of the Management view — what a manager reads in
 * ten seconds (`DESIGN.md` §2.11, ADR-029, roadmap 3.0.10 (a)).
 *
 * Two cards side by side on a wide screen, stacked on a phone (owner
 * 03.10.2026: "use the whole screen", and at most three things above the
 * fold): **the decision** — the question, where it stands, the ONE next action
 * and what is in its way — and **fit to standard** (ADR-069) — one figure, the
 * SAP objects across the four buckets, and by name what blocks the standard
 * path and what does not — and, handed in by the caller, the readiness trend
 * beside it (ADR-087, mockup s5). The four figures, the second bucket bar and
 * the evidence per phase that once stood in the "Evidence" fold are gone: each
 * repeated a number this panel, the header or the trend already says
 * (`DESIGN.md` §2.11 "nothing twice"). Everything here is handed in by `lib/management-executive.ts`
 * and `lib/standard-fit.ts`; this component lays it out and adds the words of
 * its own frame from the catalogue. It fetches nothing, so the demo workspace
 * renders the same panel from its own data.
 *
 * **Charts are also text.** Every bar is `role="img"` with every number in its
 * `aria-label`, and the list beside it carries them again. Colours per §1.8:
 * the buckets take the categorical palette and *not assigned* the dashed,
 * unfilled box. The fit figure gets no green: it is
 * a reading of imported SAP data, not a proof.
 */

/* ------------------------------------------------------- chart parts */

export const TONE_CLASS: Record<SegmentTone, string> = {
  'chart-1': 'bg-cc-chart-1',
  'chart-2': 'bg-cc-chart-2',
  'chart-3': 'bg-cc-chart-3',
  'chart-4': 'bg-cc-chart-4',
  'chart-5': 'bg-cc-chart-5',
  // §1.8: A information, B neutral, C warning, D error — the solid marks of
  // `components/cc/state.ts`, never green: a level is imported, not proven.
  'level-A': 'bg-cc-information',
  'level-B': 'bg-cc-neutral',
  'level-C': 'bg-cc-warning-mark',
  'level-D': 'bg-cc-error',
  // The one area that is not a category: no fill colour, a dashed outline —
  // a form rather than a hue, so it survives a printer without colour and a
  // contrast theme (`app/globals.css` keeps the dashes under forced-colors).
  // No hatching gradient: §1.4 keeps gradients out of the workspace (D.32).
  'not-determined': 'bg-cc-surface-muted border border-dashed border-cc-field-border',
};

export function Swatch({ tone }: { tone: SegmentTone }) {
  return (
    <span
      aria-hidden="true"
      data-chart-swatch=""
      data-not-determined={tone === 'not-determined' ? '' : undefined}
      className={cn('inline-block h-3 w-3 shrink-0 rounded-[2px] align-middle', TONE_CLASS[tone])}
    />
  );
}

/** One horizontal bar. The numbers are in its label and in the text the caller puts beside it. */
export function StackedBar({
  label,
  segments,
  chart,
  tall = false,
}: {
  label: string;
  segments: readonly ChartSegment[];
  chart: string;
  tall?: boolean;
}) {
  const total = segments.reduce((n, s) => n + s.count, 0);
  if (total === 0) return null;
  return (
    <div
      role="img"
      aria-label={chartLabel(label, segments)}
      data-overview-bar={chart}
      className={cn('flex w-full gap-[2px] overflow-hidden rounded-cc-row', tall ? 'h-6' : 'h-4')}
    >
      {segments
        .filter((s) => s.count > 0)
        .map((s) => (
          <span
            key={s.key}
            data-chart-segment={s.key}
            data-not-determined={s.notDetermined ? '' : undefined}
            style={{ flexGrow: s.count, flexBasis: 0 }}
            className={cn('block h-full min-w-[4px]', TONE_CLASS[s.tone])}
          />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------ pieces */

const LABEL = 'm-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase';
const CARD = 'cc-card min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc';

/** One object on the fit card: name, level, line, why — and where the statement comes from. */
function FitRow({ item }: { item: StandardFitItem }) {
  return (
    <li
      data-standard-fit-item={item.objectName}
      data-standard-fit-use={item.use}
      className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span data-standard-fit-object="" className="font-cc-mono text-[12px] font-semibold break-all text-cc-ink">
          {item.objectName}
        </span>
        <span data-standard-fit-level={item.level}>
          {/* Explains itself on hover, focus and tap (owner 06.10.2026), as in IT. */}
          <CcCleanCoreLevelExplained value={item.level} />
        </span>
        <span data-standard-fit-anchor={item.line ?? ''}>
          {item.line !== null ? (
            <CcAnchor label={stdFitLineLabel(item.line)}>{`L${item.line}`}</CcAnchor>
          ) : (
            <CcAnchor tone="unlinked">{wt('stdFit.noLine')}</CcAnchor>
          )}
        </span>
        <CcProvenanceChip value={item.provenance} />
      </div>
      <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink">{item.why}</p>
    </li>
  );
}

/** How many objects each list shows before "and N more". */
const SHOWN = 4;

/**
 * Something in the way that is not an SAP object — no signed run, a source
 * changed since it, an input out of date — from the ranked blockers of the
 * Management model (ADR-087: merged into "What stands in the way").
 */
export interface FitOtherBlocker {
  key: string;
  label: string;
  evidence: string;
  provenance: ProvenanceValue;
}

function FitList({
  title,
  items,
  empty,
  hook,
  moreHref,
  other = [],
}: {
  title: string;
  items: readonly StandardFitItem[];
  empty: string;
  hook: 'blocks' | 'clear';
  moreHref: string;
  other?: readonly FitOtherBlocker[];
}) {
  return (
    <section data-standard-fit-list={hook} className="min-w-0">
      <h4 className={LABEL}>{stdFitGroupLabel(title, items.length + other.length)}</h4>
      {items.length === 0 && other.length === 0 ? (
        <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">{empty}</p>
      ) : (
        <ul className="m-0 mt-2 list-none space-y-2 p-0">
          {other.map((b) => (
            <li
              key={b.key}
              data-standard-fit-blocker={b.key}
              className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-semibold text-cc-ink">{b.label}</span>
                <CcProvenanceChip value={b.provenance} />
              </div>
              {b.evidence ? (
                <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink">{b.evidence}</p>
              ) : null}
            </li>
          ))}
          {items.slice(0, SHOWN).map((item) => (
            <FitRow key={item.objectName} item={item} />
          ))}
        </ul>
      )}
      {items.length > SHOWN ? (
        <a
          href={moreHref}
          className="mt-2 inline-block text-[12px] font-semibold text-cc-ink underline underline-offset-2"
        >
          {stdFitMoreLabel(items.length - SHOWN)}
        </a>
      ) : null}
    </section>
  );
}

/**
 * The fit-to-standard card (ADR-069). The figure first, labelled as this
 * product's own measure; under it the SAP objects across the four buckets as
 * one bar in three groups — what has a released path, what blocks it, what is
 * not counted — with every count in words; then the objects by name, each
 * with its level, its line and where the statement comes from.
 */
export function StandardFitCard({
  fit,
  detailsHref,
  setTargetHref,
  otherEdition = null,
  otherBlockers = [],
}: {
  fit: StandardFit;
  /** What else stands in the way that is not an SAP object — listed first under "What stands in the way". */
  otherBlockers?: readonly FitOtherBlocker[];
  /** The same reading on the other edition, in one line (ADR-079) — or `null`. */
  otherEdition?: string | null;
  /** Where every object with its evidence stands — the bucket detail in the "Evidence" fold. */
  detailsHref: string;
  /** The way to choose a target platform, when that is what is missing. */
  setTargetHref?: string;
}) {
  const info = (
    <InfoPopover subject={wt('stdFit.title')} align="right" hook="standard-fit">
      {STANDARD_FIT_DEFINITION}
    </InfoPopover>
  );
  if (fit.state === 'not-determined') {
    return (
      <section id="standard-fit" data-standard-fit="not-determined" data-standard-fit-why={fit.why} className={CARD}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="m-0 text-[14px] leading-tight font-bold text-cc-ink">{wt('stdFit.title')}</h3>
          {info}
        </div>
        <p data-standard-fit-value="" className="m-0 mt-3 cc-text-figure leading-none text-cc-ink-muted">
          {fit.why === 'reading' ? wt('stdFit.reading') : wt('stdFit.notDetermined')}
        </p>
        <p data-standard-fit-reason="" className="m-0 mt-2 text-[13px] leading-snug font-medium text-cc-ink">
          {fit.reason}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CcProvenanceChip value="not-determined" />
          <CcTag>{wt('stdFit.ownMeasure')}</CcTag>
        </div>
        {fit.why === 'no-target' && setTargetHref ? (
          <p className="m-0 mt-3">
            <a href={setTargetHref} className="text-[12px] font-semibold text-cc-ink underline underline-offset-2">
              {wt('stdFit.setTarget')}
            </a>
          </p>
        ) : null}
      </section>
    );
  }

  if (fit.state === 'none-used') {
    // The best case, said as one (owner 03.10.2026): no SAP object, nothing in
    // the way — and no percentage, since 0 of 0 is neither 0 % nor 100 %.
    return (
      <section id="standard-fit" data-standard-fit="none-used" className={CARD}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="m-0 text-[14px] leading-tight font-bold text-cc-ink">{wt('stdFit.title')}</h3>
          {info}
        </div>
        <p data-standard-fit-value="" className="m-0 mt-3 cc-text-figure leading-none text-cc-ink">
          {NO_SAP_DEPENDENCY_TITLE}
        </p>
        <p data-standard-fit-reason="" className="m-0 mt-2 text-[13px] leading-snug font-medium text-cc-ink">
          {fit.sentence}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CcProvenanceChip value="reconstructed" />
          <CcTag>{wt('stdFit.ownMeasure')}</CcTag>
        </div>
        {fit.basis === 'demo' ? (
          <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('stdFit.demoBasis')}</p>
        ) : null}
      </section>
    );
  }

  const meterParts = fit.groups.flatMap((g) => g.segments);
  const total = meterParts.reduce((n, p) => n + p.count, 0);
  const groupTitle = (key: 'fits' | 'blocks' | 'uncounted') =>
    wt(key === 'fits' ? 'stdFit.groupFits' : key === 'blocks' ? 'stdFit.groupBlocks' : 'stdFit.groupUncounted');
  return (
    <section id="standard-fit" data-standard-fit="ready" className={CARD}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 text-[14px] leading-tight font-bold text-cc-ink">{stdFitTitleOn(fit.platformLabel)}</h3>
        {info}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
        <span
          data-standard-fit-value=""
          data-standard-fit-percent={fit.percent}
          className="cc-text-figure leading-none text-cc-ink"
        >
          {stdFitPercentLabel(fit.percent)}
        </span>
        <span
          data-standard-fit-count={`${fit.fits}/${fit.counted}`}
          className="min-w-0 flex-1 basis-56 text-[13px] leading-snug font-semibold text-cc-ink"
        >
          {fit.sentence}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CcProvenanceChip value="reconstructed" />
        <CcTag>{wt('stdFit.ownMeasure')}</CcTag>
      </div>
      {otherEdition ? (
        <p data-standard-fit-other-edition="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink">
          {otherEdition}
        </p>
      ) : null}
      {fit.basis === 'demo' ? (
        <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('stdFit.demoBasis')}</p>
      ) : null}

      {/* The meter: three groups, the four buckets inside them, every count also text. */}
      {total > 0 ? (
        <div className="mt-4">
          <div
            role="img"
            aria-label={stdFitMeterLabel(meterParts)}
            data-overview-bar="standard-fit"
            className="flex h-6 w-full gap-[2px] overflow-hidden rounded-cc-row"
          >
            {meterParts
              .filter((p) => p.count > 0)
              .map((p) => (
                <span
                  key={p.key}
                  data-chart-segment={p.key}
                  data-not-determined={p.notDetermined ? '' : undefined}
                  style={{ flexGrow: p.count, flexBasis: 0 }}
                  className={cn('block h-full min-w-[4px]', TONE_CLASS[p.tone])}
                />
              ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {fit.groups.map((g) => (
              <div key={g.key} data-standard-fit-group={g.key} className="min-w-0">
                <p className="m-0 text-[12px] font-bold text-cc-ink">{stdFitGroupLabel(groupTitle(g.key), g.count)}</p>
                <ul className="m-0 mt-1 list-none space-y-1 p-0">
                  {g.segments.map((p) => (
                    <li
                      key={p.key}
                      data-standard-fit-bucket={p.key}
                      className="flex items-center gap-2 text-[12px] font-medium text-cc-ink"
                    >
                      <Swatch tone={p.tone} />
                      <span className="min-w-0 flex-1">{p.label}</span>
                      <span className="font-semibold tabular-nums">{p.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {fit.coverage ? (
        <p data-standard-fit-coverage="" className="m-0 mt-2 text-[11px] leading-snug font-medium text-cc-ink-muted">
          {fit.coverage}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FitList
          title={wt('stdFit.blocksTitle')}
          items={fit.blockers}
          empty={wt('stdFit.nothingBlocks')}
          hook="blocks"
          moreHref={detailsHref}
          other={otherBlockers}
        />
        <FitList
          title={wt('stdFit.clearTitle')}
          items={fit.clear}
          empty={wt('stdFit.nothingClear')}
          hook="clear"
          moreHref={detailsHref}
        />
      </div>
      <p className="m-0 mt-3">
        <a href={detailsHref} className="text-[12px] font-semibold text-cc-ink underline underline-offset-2">
          {wt('stdFit.allObjects')}
        </a>
      </p>
    </section>
  );
}

/** The one next action, as the page's primary button — handed in by the caller. */
export interface ExecutivePrimary {
  label: string;
  reason: string;
  href: string;
  /** The phase it opens, for specs and the coach mark. */
  key: string;
  /** The step is already happening — the start run is with the server. Said, never offered as a button. */
  running?: boolean;
}

/* --------------------------------------------------------- component */

export default function ManagementExecutive({
  summary,
  hrefFor,
  headingId,
  fit,
  primary,
  fitDetailsHref = '#public-cloud-fit',
  setTargetHref,
  coach,
  decision,
  options,
  optionsView = null,
  otherEdition = null,
  otherBlockers = [],
  trend,
  onOpenOnePager,
}: {
  summary: ExecutiveSummary;
  /** Turns a target into a link on this surface — a stage of the project, or of the demo. */
  hrefFor: (target: ExecutiveTarget) => string;
  /** The id of the answer heading, which the section and the steering one-pager point at. */
  headingId?: string;
  fit: StandardFit;
  /**
   * The ONE next action of the page — the next open phase of
   * `lib/workflow-steps.ts` ("Run the analysis" without a signed run). Without
   * it the decision's own step takes the button.
   */
  primary?: ExecutivePrimary | null;
  fitDetailsHref?: string;
  setTargetHref?: string;
  /** The coach mark slot for "Your next step" — above the answer, where the tour starts. */
  coach?: React.ReactNode;
  /**
   * The decision record itself (`DecisionCard`), when the project has one to
   * show — a signed run. It takes the card's answer and status, and the list of
   * what stands in the way gives way to it: the decision's own conditions say
   * that, and fit to standard beside it names the objects (owner 03.10.2026:
   * "the decision must be shown, placed prominently").
   */
  decision?: React.ReactNode;
  /**
   * The four options side by side (`DecisionOptions`, ADR-079) — shown above
   * the decision record whenever the record is, and with it the question in
   * the page's heading size and the answer that names the option.
   */
  options?: React.ReactNode;
  optionsView?: DecisionOptionsView | null;
  /** The distance to standard on the other edition, in one line. */
  otherEdition?: string | null;
  /** What else stands in the way that is not an SAP object (ADR-087) — on the fit card. */
  otherBlockers?: readonly FitOtherBlocker[];
  /**
   * The readiness trend — the third block of the first screen (mockup s5,
   * ADR-087): beside the distance to SAP standard on a wide screen, under it
   * on a narrow one.
   */
  trend?: React.ReactNode;
  /**
   * Opens the steering one-pager — a secondary button at the top of the
   * decision card, where a manager looks (owner, 04.10.2026: "much better but
   * hardly findable"). Never primary: the next step keeps the page's one
   * primary button.
   */
  onOpenOnePager?: () => void;
}) {
  const s = summary;
  const onePager = onOpenOnePager ? (
    <span className="cc-no-print shrink-0">
      <CcButton
        variant="secondary"
        density="compact"
        icon={<FileText size={14} aria-hidden={true} />}
        onClick={onOpenOnePager}
        data-executive-one-pager=""
      >
        {STEERING_TITLE}
      </CcButton>
    </span>
  ) : null;
  // The decision's own step stays as a link when it goes somewhere the primary
  // button does not — never a second button saying the same thing.
  const decisionStep =
    s.next && primary && !(s.next.target.kind === 'stage' && hrefFor(s.next.target).split('?')[0] === primary.href.split('?')[0])
      ? s.next
      : null;

  const nextBox = (
        <div
          data-executive-next=""
          data-coach-target="next-step"
          className="mt-4 rounded-cc-row border border-l-4 border-cc-line border-l-cc-ink bg-cc-surface-muted p-3"
        >
          <h3 className={LABEL}>{wt('nextStep.title')}</h3>
          {primary || s.next ? (
            <>
              <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {primary ? primary.reason : s.next!.reason}
              </p>
              {primary?.running ? null : (
                <div className="mt-3">
                  <CcLinkButton
                    href={primary ? primary.href : hrefFor(s.next!.target)}
                    variant="primary"
                    data-executive-next-action=""
                    data-next-step-key={primary?.key}
                  >
                    {primary ? primary.label : s.next!.label}
                  </CcLinkButton>
                </div>
              )}
            </>
          ) : (
            <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">{wt('exec.noNextStep')}</p>
          )}
          {decisionStep ? (
            <p data-executive-decision-step="" className="m-0 mt-3 text-[12px] leading-snug font-medium text-cc-ink">
              {wt('exec.forTheDecision')}{' '}
              <a href={hrefFor(decisionStep.target)} className="font-semibold text-cc-ink underline underline-offset-2">
                {decisionStep.label}
              </a>
            </p>
          ) : null}
        </div>
  );
  const nextRow = (
    <div
      data-executive-next=""
      data-coach-target="next-step"
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-cc-row border border-l-4 border-cc-line border-l-cc-ink bg-cc-surface-muted px-3 py-2"
    >
      <span className={LABEL}>{wt('nextStep.title')}</span>
      {primary || s.next ? (
        <>
          <span className="min-w-0 flex-1 basis-48 text-[12px] leading-snug font-medium text-cc-ink-muted">
            {primary ? primary.reason : s.next!.reason}
          </span>
          {primary?.running ? null : (
            <CcLinkButton
              href={primary ? primary.href : hrefFor(s.next!.target)}
              variant="primary"
              data-executive-next-action=""
              data-next-step-key={primary?.key}
            >
              {primary ? primary.label : s.next!.label}
            </CcLinkButton>
          )}
        </>
      ) : (
        <span className="text-[12px] font-medium text-cc-ink-muted">{wt('exec.noNextStep')}</span>
      )}
      {/* The decision's own step, as in the box below (QA e2fc0565e012). */}
      {decisionStep ? (
        <span data-executive-decision-step="" className="basis-full text-[12px] leading-snug font-medium text-cc-ink">
          {wt('exec.forTheDecision')}{' '}
          <a href={hrefFor(decisionStep.target)} className="font-semibold text-cc-ink underline underline-offset-2">
            {decisionStep.label}
          </a>
        </span>
      ) : null}
    </div>
  );

  return (
    <div data-management-executive="" className="grid items-start gap-4 lg:grid-cols-12">
      {/* The decision: question, state, the one next action, what is in the way. */}
      <div
        data-executive-decision=""
        data-executive-decision-record={decision ? '' : undefined}
        className={cn(CARD, decision ? 'lg:col-span-12' : 'lg:col-span-5')}
      >
        {coach}
        {decision ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <p className={cn(LABEL, 'min-w-0 flex-1 basis-48')}>
                <GlossaryTerm termKey="Decision">{wt('exec.questionLabel')}</GlossaryTerm>
              </p>
              {onePager}
            </div>
            {/* ADR-079: the question is the heading of the page, the answer names the option. */}
            <h2 id={headingId} data-executive-question="" className="m-0 mt-1 cc-text-h2 leading-snug text-cc-ink">
              {s.question}
            </h2>
            {optionsView ? (
              <div data-decision-answer="" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[15px] leading-snug font-semibold text-cc-ink">{optionsView.answer}</span>
                <CcObjectStatus facet={wt('exec.statusFacet')} value={STAGE_STATUS[optionsView.stage]} />
                {optionsView.who ? (
                  <span data-decision-who="" className="basis-full text-[12px] leading-snug font-medium text-cc-ink-muted">
                    {optionsView.who}
                  </span>
                ) : null}
              </div>
            ) : null}
            {/* The page's one next step, as one row above the decision, so its
                tip stands at the top of the page rather than over the folds. */}
            {nextRow}
            {options ? <div className="mt-4">{options}</div> : null}
            <div className="mt-4 border-t border-cc-line pt-4">{decision}</div>
          </>
        ) : (
          <>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <p data-executive-question="" className="m-0 min-w-0 flex-1 basis-64 text-[13px] leading-snug font-semibold text-cc-ink-muted">
          <span className={cn(LABEL, 'mr-2')}>
            {/* "Decision" is the program decision only; a branch in the code is
                a decision point (owner, 03.10.2026). The term opens by tap or
                keyboard, never on hover alone. */}
            <GlossaryTerm termKey="Decision">{wt('exec.questionLabel')}</GlossaryTerm>
          </span>
          {s.question}
        </p>
        {onePager}
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <h2
            id={headingId}
            data-management-headline=""
            className="m-0 min-w-0 flex-1 basis-56 cc-text-h2 leading-snug text-cc-ink"
          >
            {s.answer}
          </h2>
          <CcObjectStatus facet={wt('exec.statusFacet')} value={s.status} />
        </div>
          </>
        )}

        {decision ? null : nextBox}

        {decision ? null : (
        <div data-executive-blockers="" className="mt-4">
          <h3 className={LABEL}>
            {wt('exec.inTheWay')}
            {s.blockerCount !== null ? ` (${s.blockerCount})` : ''}
          </h3>
          {s.blockers.length > 0 ? (
            <ol className="m-0 mt-2 list-none space-y-2 p-0">
              {s.blockers.map((b, i) => (
                <li key={b.key} data-executive-blocker={b.key} className="flex items-start gap-2">
                  <span className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted">{i + 1}.</span>
                  <span className="min-w-0 flex-1 text-[13px] leading-snug font-semibold text-cc-ink">
                    {b.label} <CcProvenanceChip value={b.provenance} />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink">
              {s.blockerCount === null
                ? wt('exec.notYetRead')
                : s.unread.length > 0
                  ? wt('exec.nothingFoundNotAllRead')
                  : wt('exec.nothingInTheWay')}
            </p>
          )}
          {s.moreBlockers > 0 ? (
            <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">{execMoreBlockersLabel(s.moreBlockers)}</p>
          ) : null}
          {s.platformOnly ? (
            <p data-executive-platform-only="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
              {s.platformOnly}
            </p>
          ) : null}
        </div>
        )}
      </div>

      <div className={cn('min-w-0', decision ? (trend ? 'lg:col-span-8' : 'lg:col-span-12') : 'lg:col-span-7')}>
        <StandardFitCard
          fit={fit}
          detailsHref={fitDetailsHref}
          setTargetHref={setTargetHref}
          otherEdition={otherEdition}
          otherBlockers={otherBlockers}
        />
      </div>
      {trend ? <div className={cn('min-w-0', decision ? 'lg:col-span-4' : 'lg:col-span-12')}>{trend}</div> : null}
    </div>
  );
}
