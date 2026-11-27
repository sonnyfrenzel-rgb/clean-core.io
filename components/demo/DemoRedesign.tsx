'use client';

import React, { useMemo, useState } from 'react';
import StageFrame from '@/components/StageFrame';
import StageHeader from '@/components/StageHeader';
import CcMessageStrip from '@/components/cc/MessageStrip';
import DemoAbout from '@/components/demo/DemoAbout';
import FamilyChip from '@/components/family/FamilyChip';
import { CcTag } from '@/components/cc/Tag';
import DecideView, { DecideBar } from '@/components/redesign/DecideView';
import { initialCostAssumptions } from '@/components/tco/OptionComparison';
import { DECISION_OPTIONS, DECISION_OPTION_LABELS, DECISION_OPTION_MEANINGS, optionOfArchitecture, type DecisionOption } from '@/lib/decision-options';
import type { OptionCard } from '@/lib/decision-option-signals';
import { proposeEffort, proposeMaintenanceBaseline } from '@/lib/cost-assumptions';
import { ROUTE_WORDS, decideCostLine } from '@/lib/decide';
import { recommendationOfRoute } from '@/lib/project-commands';
import { DEMO_ROUTE, DEMO_STRIP_NOTICE, DEMO_TAG, DEMO_UNSIGNED_NOTICE } from '@/lib/demo-marks';
import type { RailStep } from '@/lib/workflow-steps';

/**
 * The demo's Decide page (`/demo/redesign`, ADR-143, ADR-145): the same page as a project's, drawn by the same view
 * (`components/redesign/DecideView.tsx`). The four options can be chosen to see what each needs, and the cost line is
 * the same simulation on typical assumptions; but the demo has no signed run and no decision record by construction,
 * so nothing is recorded: the bar says so and offers no button. Nothing here writes, signs or calls a model.
 */
export default function DemoRedesign({
  title,
  rail,
  recommendedRoute,
  loc,
  score,
}: {
  title: string;
  rail: RailStep[];
  recommendedRoute: string | null;
  loc: number | null;
  score: number | null;
}) {
  const [choice, setChoice] = useState<DecisionOption | null>(null);
  const indicated = optionOfArchitecture(recommendedRoute ? recommendationOfRoute({ recommendedRoute }) : null);
  const route = recommendedRoute ? recommendationOfRoute({ recommendedRoute }) : null;
  const cost = useMemo(
    () =>
      decideCostLine({
        stored: null,
        seed: initialCostAssumptions(),
        proposals: { effort: proposeEffort(loc), baseline: loc === null ? null : proposeMaintenanceBaseline(loc, score) },
      }),
    [loc, score],
  );
  const cards: OptionCard[] = DECISION_OPTIONS.map((o) => ({
    option: o,
    label: DECISION_OPTION_LABELS[o],
    meaning: DECISION_OPTION_MEANINGS[o],
    signal: o === indicated ? 'for' : 'not-determined',
    reason: o === indicated ? 'The engine reading of the demo code points to it.' : 'A demo is never signed, so this is not read from evidence here.',
    provenance: 'not-determined',
    place: 'analyze',
    proposed: o === indicated,
    chosen: false,
    effort: { value: null, reason: 'Not priced in the demo.', provenance: 'not-determined', note: null },
    cost: { value: null, reason: 'Not priced in the demo.', provenance: 'not-determined', note: null },
    choice: 'direct',
  }));

  return (
    <StageFrame stage="redesign" className="cc pb-24" data-redesign="ready" data-demo-redesign="" data-decide-state="demo">
      <div className="mt-6 mb-4" data-testid="demo-strip">
        <CcMessageStrip state="information" headline={<span data-testid="demo-notice">{DEMO_STRIP_NOTICE}</span>}>
          <span data-testid="demo-unsigned">{DEMO_UNSIGNED_NOTICE}</span>
          <DemoAbout />
        </CcMessageStrip>
      </div>

      <StageHeader tools={{ steps: rail, base: DEMO_ROUTE }} projectName={title} place="redesign" eyebrow={<CcTag>{DEMO_TAG}</CcTag>}>
        Keep, rebuild, move to SAP standard or retire. In your own project the signed-in account records it: a self-declaration, not a mandate.
      </StageHeader>

      <DecideView
        edition={null}
        editionSigned={false}
        cost={cost}
        economicsHref={null}
        cards={cards}
        indicated={indicated}
        choice={choice}
        onChoose={setChoice}
        note={null}
        checkHref={null}
        runDate={null}
        rebuild={
          <div data-demo-decide-rebuild="" className="flex flex-col gap-2 cc-text-cell text-cc-ink">
            <p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">Route</p>
            <p className="m-0 flex flex-wrap items-center gap-2">
              <b className="font-bold">{route ? ROUTE_WORDS[route] ?? route : 'Not determined'}</b>
              <FamilyChip kind="engine" />
            </p>
            <p className="m-0 text-cc-ink-muted">In your own project the business questions of the code are answered here, before the decision is recorded.</p>
          </div>
        }
        reason={null}
        bar={
          <DecideBar
            summary={choice ? `${DECISION_OPTION_LABELS[choice]}${choice === 'rebuild' ? '' : ' · nothing is built'}` : 'Choose one of the four options.'}
            sub="A demo is never signed, so nothing is recorded here. In your own project one confirmation records the decision."
            action={null}
          />
        }
      />
    </StageFrame>
  );
}
