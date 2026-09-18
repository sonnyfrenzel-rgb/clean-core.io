'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import CcLinkButton from '@/components/cc/LinkButton';
import type { NextOpenPoint } from '@/lib/next-step';

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
 */
export default function NextStepCard({
  point,
  projectId,
}: {
  point: NextOpenPoint | null;
  projectId: string;
}) {
  return (
    <div data-next-step="">
      <CcCard title="Next step">
        {point === null ? (
          <p
            data-next-step-state="none"
            className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted"
          >
            Nothing is open. Every phase this product can finish is on record.
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
            <div className="mt-2.5">
              <CcLinkButton href={`/project/${projectId}/${point.path}`} variant="primary">
                Open {point.label}
              </CcLinkButton>
            </div>
          </div>
        )}
      </CcCard>
    </div>
  );
}
