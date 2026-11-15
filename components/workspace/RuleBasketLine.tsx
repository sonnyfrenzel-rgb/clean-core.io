'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import CcLinkButton from '@/components/cc/LinkButton';
import { basketLineText, basketOther, basketUndetermined, wt } from '@/lib/workspace-messages';

/**
 * The business rules in the Business view's opening — one sentence and a way
 * into Design, never a decision (owner decision 21.10.2026: "we are in the
 * first insights, and a business user is to decide that right away?").
 *
 * "7 questions for the business cover 12 rules · 6 technical rules stay as
 * coded · 2 not determined", counted in rules from the engine's three baskets
 * (`lib/abap/business-rule-set-explain.ts`) through `lib/rule-counts.ts` — counted by `lib/around-the-map.ts` since 3.2.0 — so the
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
