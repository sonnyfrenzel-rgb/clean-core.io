'use client';

import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import CcLinkButton from '@/components/cc/LinkButton';
import type { BusinessRuleSet } from '@/lib/abap/business-rule-set';
import { buildProcessFacts } from '@/lib/abap/process-facts';
import { explainBusinessRules } from '@/lib/abap/business-rule-set-explain';
import { RULE_QUESTIONS_ID } from '@/lib/rule-questions';
import { questionRuleCountsOf } from '@/lib/rule-counts';
import { basketLineText, basketOther, basketUndetermined, wt } from '@/lib/workspace-messages';

/**
 * The business rules in the Business view's opening — one sentence and a way
 * into Design, never a decision (owner decision 21.10.2026: "we are in the
 * first insights, and a business user is to decide that right away?").
 *
 * "7 questions for the business cover 12 rules · 6 technical rules stay as
 * coded · 2 not determined", counted in rules from the engine's three baskets
 * (`lib/abap/business-rule-set-explain.ts`) through `lib/rule-counts.ts`, so the
 * line adds up to the business-rule count beside it (3.0.23);
 * the questions are asked in Design, the full rule register is in the IT view
 * and in the delivery package.
 */

export const RULE_BASKET_LINE_ID = 'rule-baskets';

export function RuleBasketLineView({
  questions,
  rulesAsked,
  total,
  technical,
  undetermined,
  designHref,
}: {
  questions: number;
  /** Business rules the questions cover, each once (`questionRuleCounts`). */
  rulesAsked: number;
  /** Every business rule of the program — what the line adds up to. */
  total: number;
  technical: number;
  undetermined: number;
  designHref: string | null;
}) {
  // Rules no question covers that are neither technical nor not determined: said, so the line still adds up.
  const other = Math.max(0, total - rulesAsked - technical - undetermined);
  return (
    <p
      id={RULE_BASKET_LINE_ID}
      data-rule-basket-line=""
      data-questions={questions}
      data-rules-asked={rulesAsked}
      data-rules-total={total}
      data-technical={technical}
      data-undetermined={undetermined}
      className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-snug font-semibold text-cc-ink"
    >
      <span>
        {basketLineText(questions, rulesAsked, technical)}
        {undetermined > 0 ? <span className="font-medium text-cc-ink-muted"> · {basketUndetermined(undetermined)}</span> : null}
        {other > 0 ? <span className="font-medium text-cc-ink-muted"> · {basketOther(other)}</span> : null}
      </span>
      {designHref && questions > 0 ? (
        <CcLinkButton href={designHref} variant="ghost" icon={<ArrowRight size={16} aria-hidden={true} />} data-rule-basket-design="">
          {wt('questions.openDesign')}
        </CcLinkButton>
      ) : null}
    </p>
  );
}

/** `engineVersion`: the engine `ruleSet` was read for — the project's signed run's (3.0.20). */
export default function RuleBasketLine({
  projectId,
  source,
  ruleSet,
  engineVersion,
  designHref,
}: {
  projectId: string;
  source: string;
  ruleSet: BusinessRuleSet | null;
  engineVersion: string | null;
  /**
   * Where the questions are answered: the project's Design by default; null
   * where the page answers them itself (the demo's rules card, 3.0.21) — the
   * line then counts and names no way out.
   */
  designHref?: string | null;
}) {
  const counts = useMemo(() => {
    if (!ruleSet || !source.trim() || ruleSet.rules.length === 0) return null;
    try {
      const ex = explainBusinessRules(source, ruleSet, buildProcessFacts(source), engineVersion);
      // One count source with Design's "5 questions cover 16 of the 41 business rules" (`lib/rule-counts.ts`).
      const c = questionRuleCountsOf(ex, 0);
      return { questions: c.questions, rulesAsked: c.rulesAsked, total: c.total, technical: c.technical, undetermined: c.undetermined };
    } catch {
      return null;
    }
  }, [ruleSet, source, engineVersion]);
  if (!counts) return null;
  return (
    <RuleBasketLineView
      {...counts}
      designHref={designHref === undefined ? `/project/${encodeURIComponent(projectId)}/design#${RULE_QUESTIONS_ID}` : designHref}
    />
  );
}
