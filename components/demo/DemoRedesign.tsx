import React from 'react';
import StageFrame from '@/components/StageFrame';
import StageHeader from '@/components/StageHeader';
import CcMessageStrip from '@/components/cc/MessageStrip';
import DemoAbout from '@/components/demo/DemoAbout';
import { CcTag } from '@/components/cc/Tag';
import RedesignView from '@/components/redesign/RedesignView';
import type { FacetProps } from '@/components/family/AnswerCard';
import { DECISION_OPTION_LABELS, DECISION_OPTION_MEANINGS, optionOfArchitecture, type DecisionOption } from '@/lib/decision-options';
import { DEMO_ANALYZE_ROUTE, DEMO_ROUTE, DEMO_STRIP_NOTICE, DEMO_TAG, DEMO_UNSIGNED_NOTICE } from '@/lib/demo-marks';
import { REDESIGN_DECIDE_ID, redesignModel } from '@/lib/redesign';
import type { RailStep } from '@/lib/workflow-steps';

const OPTIONS: readonly DecisionOption[] = ['keep', 'rebuild', 'standard', 'retire'];

/**
 * The demo's Re-design (`/demo/redesign`, ADR-143): the same page as a project's, drawn by the same view
 * (`components/redesign/RedesignView.tsx`) from the demo's own rail. The demo has no signed run and no decision record
 * by construction, so the page says so: Analyze reads "Demo run, unsigned", the decision step lists the four options
 * without a way to choose one, and nothing here writes, signs or calls a model.
 *
 * The next step is read as if the reading were signed — the demo's point is to show the way on — while the Analyze row
 * keeps its honest state.
 */
export default function DemoRedesign({ title, rail, recommendedRoute }: { title: string; rail: RailStep[]; recommendedRoute: string | null }) {
  const indicated = optionOfArchitecture(recommendedRoute);
  const decision = { stage: 'not-decided' as const, option: null, indicated };
  const walk = redesignModel(
    rail.map((r) => (r.key === 'analyze' ? { ...r, state: 'done' as const, done: true } : r)),
    decision,
  );
  const model = {
    ...walk,
    analysed: false,
    answer:
      'In the demo nothing is priced or decided. In your own project you price the four options, decide, and the tools after it build the decided one.',
  };
  const indicatedLabel = indicated ? DECISION_OPTION_LABELS[indicated] : null;

  const facets: FacetProps[] = [
    { id: 'decision', label: 'Decision', value: 'Not taken', note: indicatedLabel ? `indicated: ${indicatedLabel}` : 'step 2', href: `#${REDESIGN_DECIDE_ID}` },
    { id: 'priced', label: 'Options priced', value: 'Not priced yet', note: 'step 1, Economics' },
    { id: 'questions', label: 'Business rules confirmed', value: 'None', note: 'answered in Design' },
    { id: 'delivery', label: 'Delivery package', value: 'Not built', note: 'step 7' },
  ];

  return (
    <StageFrame stage="redesign" className="cc pb-24" data-redesign="ready" data-demo-redesign="">
      <div className="mt-6 mb-4" data-testid="demo-strip">
        <CcMessageStrip state="information" headline={<span data-testid="demo-notice">{DEMO_STRIP_NOTICE}</span>}>
          <span data-testid="demo-unsigned">{DEMO_UNSIGNED_NOTICE}</span>
          <DemoAbout />
        </CcMessageStrip>
      </div>

      <StageHeader tools={{ steps: rail, base: DEMO_ROUTE }} projectName={title} place="redesign" eyebrow={<CcTag>{DEMO_TAG}</CcTag>}>
        Build its clean core successor from the same evidence: priced, decided, designed, built, documented, tested and delivered.
      </StageHeader>

      <RedesignView
        base={DEMO_ROUTE}
        model={model}
        facets={facets}
        condition="The demo stands on an unsigned engine reading of fictitious code. In your own project every step stands on a signed analysis run."
        analyzeWords="Demo run, unsigned"
        analyzeNote="What it does, how far it is from clean core: the engine's reading, never signed in the demo."
        indicatedLabel={indicatedLabel}
        backToAnalyzeHref={`${DEMO_ANALYZE_ROUTE}?view=management`}
        decide={
          <div data-redesign-decide="" data-demo-decide="" className="mt-3 flex flex-col gap-3">
            {indicatedLabel ? (
              <p className="m-0 cc-text-cell text-cc-ink">
                The analysis indicates <span className="font-semibold">{indicatedLabel}</span>: an indication, not a decision.
              </p>
            ) : null}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {OPTIONS.map((o) => (
                <li key={o} data-demo-decide-option={o} className="cc-text-cell text-cc-ink">
                  <span className="font-semibold">{DECISION_OPTION_LABELS[o]}</span>: {DECISION_OPTION_MEANINGS[o]}
                </li>
              ))}
            </ul>
            <p className="m-0 cc-text-cell text-cc-ink-muted">
              The demo records no decision. In your own project you choose here, recorded by your signed-in account.
            </p>
          </div>
        }
      />
    </StageFrame>
  );
}
