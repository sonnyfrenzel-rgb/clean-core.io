'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import CcLinkButton from '@/components/cc/LinkButton';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { NEXT_STEP_PROVENANCE, NOTHING_OPEN, type NextOpenPoint } from '@/lib/next-step';
import type { WorkspaceView } from '@/lib/workspace-model';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { openStageLabel, wt } from '@/lib/workspace-messages';

/**
 * "Next step" — `DESIGN.md` §2.3 item 5, §5.5, roadmap step 6.5.
 *
 * A card, not a bar (§2.3), and the one place on the screen that carries the
 * page's `primary` button: *"die Hauptaktion der Seite steht in „Next step""*
 * (§1.5). It renders exactly what `lib/next-step.ts` hands it and decides
 * nothing itself — the same split `NotDeterminedCard` and
 * `WorkspaceStatusLine` already use, so the one thing that can go wrong here
 * (a reason that reads like a pleasantry instead of a fact) is testable in the
 * pure module rather than in copies of this component.
 *
 * Two states, and they read as two different statements:
 *
 *   - **open** — a phase is not yet done. The reason is the phase contract's
 *     own sentence, never invented here, and the button only ever *opens* the
 *     phase's page — it never claims to generate anything, so it cannot be the
 *     button that only fails `lib/next-step.ts` already refuses to send a
 *     reader at.
 *   - **none** — nothing is open. Stated as a fact, not a congratulation: the
 *     module returned `null` because every phase this product can finish
 *     already is, and inventing a step here would be exactly the thing
 *     `tests/no-vacuous-tests.spec.ts` and this roadmap row both exist to rule
 *     out.
 *
 * Both states carry the same provenance chip, in the header row beside the
 * title where `CcCard` puts `meta`: *Reconstructed* (`DESIGN.md` §4), because
 * both are this module's reading of what is on record and neither was
 * confirmed by anyone. The value comes from `lib/next-step.ts`, not from a
 * literal here — a card that picked its own word would be the drift §4 exists
 * to stop, and "nothing is open" without a badge would read as the one
 * statement on the screen that nobody has to justify.
 *
 * The open state says two things and they are two elements: what is open, and
 * why it is this one rather than another. Neither is written here.
 */
export default function NextStepCard({
  point,
  projectId,
  view,
  level = 3,
  variant = 'card',
}: {
  point: NextOpenPoint | null;
  projectId: string;
  /**
   * The view the card stands in. The button carries it, and this card as its
   * origin, into the stage (`?view=…&from=next-step`, block D D.29), so "Back
   * to workspace" returns here rather than to the top of the Business view.
   */
  view: WorkspaceView;
  /**
   * The heading level of the card title. A card is an `h3` (`DESIGN.md` §2.3),
   * but in IT and Management this card stands directly under the project's
   * `h1` with no section around it, and an `h3` there skips a level.
   */
  level?: 2 | 3;
  /**
   * `bar` — the Business view's form (mockup s1): one row near the top of the
   * content, the step on the left, the chip and the one primary button on the
   * right. Same content, same data attributes, same single primary action; it
   * only stops the card from standing as tall as the answer above it.
   */
  variant?: 'card' | 'bar';
}) {
  if (variant === 'bar') {
    const Heading = level === 2 ? 'h2' : 'h3';
    return (
      <div
        id={WORKSPACE_RETURN.nextStep}
        data-next-step=""
        data-next-step-variant="bar"
        className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-cc-card border border-l-4 border-cc-line border-l-cc-ink bg-cc-surface px-4 py-3 shadow-cc"
      >
        <div className="min-w-0 flex-1 basis-72">
          <Heading className="m-0 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">
            {wt('nextStep.title')}
          </Heading>
          {point === null ? (
            <p data-next-step-state="none" className="m-0 mt-1 text-[15px] leading-snug font-bold text-cc-ink">
              {NOTHING_OPEN}
            </p>
          ) : (
            <div data-next-step-state="open" data-next-step-key={point.key}>
              <p className="m-0 mt-1 text-[15px] leading-snug font-bold text-cc-ink">{point.label}</p>
              <p data-next-step-reason="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {point.reason}
              </p>
              <p data-next-step-selection="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {point.selection}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CcProvenanceChip value={point?.provenance ?? NEXT_STEP_PROVENANCE} />
          {point !== null ? (
            <CcLinkButton
              href={stageHref({ base: `/project/${projectId}`, path: point.path, view, from: WORKSPACE_RETURN.nextStep })}
              variant="primary"
            >
              {openStageLabel(point.label)}
            </CcLinkButton>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div id={WORKSPACE_RETURN.nextStep} data-next-step="">
      <CcCard title={wt('nextStep.title')} level={level} meta={<CcProvenanceChip value={point?.provenance ?? NEXT_STEP_PROVENANCE} />}>
        {point === null ? (
          <p
            data-next-step-state="none"
            className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted"
          >
            {NOTHING_OPEN}
          </p>
        ) : (
          <div data-next-step-state="open" data-next-step-key={point.key}>
            <p className="m-0 text-[13px] font-semibold text-cc-ink">{point.label}</p>
            <p
              data-next-step-reason=""
              className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted"
            >
              {point.reason}
            </p>
            <p
              data-next-step-selection=""
              className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted"
            >
              {point.selection}
            </p>
            <div className="mt-3">
              <CcLinkButton
                href={stageHref({ base: `/project/${projectId}`, path: point.path, view, from: WORKSPACE_RETURN.nextStep })}
                variant="primary"
              >
                {openStageLabel(point.label)}
              </CcLinkButton>
            </div>
          </div>
        )}
      </CcCard>
    </div>
  );
}
