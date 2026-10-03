'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import NextStepCard from './NextStepCard';
import { BUSINESS_RULES_ID, requestRuleEditing } from './BusinessRulesEditor';
import { NEXT_STEP_PROVENANCE } from '@/lib/next-step';
import type { BusinessNextStep as Step } from '@/lib/business-next-step';
import { WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { bizNextRulesAction, bizNextRulesReason, bizNextThen, wt } from '@/lib/workspace-messages';

/**
 * "Your next step" at the top of the Business view — the page's one primary
 * action, with one sentence of why (owner, 03.10.2026: "show more prominently
 * what I as a user should do here").
 *
 * It renders what `lib/business-next-step.ts` decided and decides nothing
 * itself. While rules the code hard-codes have no answer, the step is to decide
 * on them — the button opens the answering mode of the rules card on this page,
 * with the count of open rules in its label, and the phase that follows is
 * named under it. Otherwise it is the next open phase of the one phase
 * contract, drawn by `NextStepCard` exactly as before, so the Business view
 * never names a different next phase from the IT and Management views.
 *
 * Same frame, data attributes and heading in both states, so a reader and a
 * test find "Next step" in one place.
 */
export default function BusinessNextStep({
  step,
  projectId,
  onDecideRules,
  base,
}: {
  step: Step;
  projectId: string;
  /** Where the stages live — `/demo` for the demo; the project's by default. */
  base?: string;
  /** Where "Decide on n rules" leads when the page has its own rules card (the demo). */
  onDecideRules?: () => void;
}) {
  if (step.kind !== 'rules') {
    return (
      <NextStepCard
        point={step.kind === 'phase' ? step.point : null}
        projectId={projectId}
        view="business"
        level={2}
        variant="bar"
        base={base}
      />
    );
  }

  const open = () => {
    if (onDecideRules) {
      onDecideRules();
      return;
    }
    document.getElementById(BUSINESS_RULES_ID)?.scrollIntoView({ block: 'start' });
    requestRuleEditing();
  };

  return (
    <div
      id={WORKSPACE_RETURN.nextStep}
      data-next-step=""
      data-next-step-variant="bar"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-cc-card border border-l-4 border-cc-line border-l-cc-ink bg-cc-surface px-4 py-3 shadow-cc"
    >
      <div className="min-w-0 flex-1 basis-72">
        <h2 className="m-0 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">
          {wt('nextStep.title')}
        </h2>
        <div data-next-step-state="open" data-next-step-key="rules" data-open={step.open.length} data-total={step.total}>
          <p className="m-0 mt-1 text-[15px] leading-snug font-bold text-cc-ink">{wt('biz.nextRulesLabel')}</p>
          <p data-next-step-reason="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
            {bizNextRulesReason(step.open.length, step.total)}
          </p>
          {step.then ? (
            <p data-next-step-then="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
              {bizNextThen(step.then.label, step.then.action)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <CcProvenanceChip value={NEXT_STEP_PROVENANCE} />
        <span className="flex flex-col items-start gap-1">
          <CcButton variant="primary" onClick={open} data-next-step-rules="" data-open={step.open.length}>
            {bizNextRulesAction(step.open.length)}
            <ArrowRight size={16} aria-hidden={true} />
          </CcButton>
          <span className="text-[11px] font-medium text-cc-ink-muted">{wt('biz.nextRulesNote')}</span>
        </span>
      </div>
    </div>
  );
}
