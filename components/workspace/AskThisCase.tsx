'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { t } from '@/lib/cc-messages';
import { wt, askRulesLabel } from '@/lib/workspace-messages';
import GlossaryText from './GlossaryText';
import type { PreAnswered } from '@/lib/ask-this-case';

/**
 * "Ask this case", already answered once — `DESIGN.md` §5.3, §6.2, roadmap 2.7.
 *
 *   > *One question is already answered. "Ask this case" shows, when first
 *   > opened, an asked question with answer and anchors — derived from the
 *   > branches of the code (chip Reconstructed), **without a model call and
 *   > without touching the user's quota**.*
 *
 * Both halves of that last clause are visible on the card and neither is a
 * promise this component makes on its own: the question and the branches come
 * from `lib/ask-this-case.ts`, which is pure and takes the skeleton and the rule
 * set the screen already holds; and the two labels are the ones
 * `lib/cc-messages.ts` already uses for a run that calls nothing and counts
 * nothing, so this card cannot invent a friendlier version of either.
 *
 * **The question is in the code's words.** `What happens when lv_amount >
 * lv_limit?` and never `What happens when the order exceeds the limit?` — the
 * second is a translation, and translating is roadmap 2.4's job with a model
 * behind it. A card that quietly paraphrased would be claiming a model call it
 * did not make.
 *
 * **No branch means no question.** The card then says that, rather than
 * offering a general invitation dressed as an answer.
 *
 * **Technical terms carry the glossary with them** (roadmap 6.6, `DESIGN.md` §6.1:
 * "Technical terms in answers carry the same underline and the same
 * popover"). Every string this card shows that a reader might not know a word
 * in — the question, each branch target, each rule label, and the sentence
 * that explains why there is no question — goes through `GlossaryText`, which
 * underlines the terms it recognises and nothing else. It changes no text: a
 * card whose words happen to name no glossary term renders exactly as before,
 * which is why this cannot quietly rewrite a question that is supposed to be
 * in the code's own words.
 */
export default function AskThisCase({ answer }: { answer: PreAnswered }) {
  return (
    <CcCard
      title={wt('ask.title')}
      meta={
        <>
          <CcProvenanceChip value="reconstructed" />
          <span data-ask-no-model="" className="text-[11px] font-semibold text-cc-ink-muted">
            {t('run.noModelCall')} · {t('run.notCounted')}
          </span>
        </>
      }
    >
      {answer.kind === 'none' ? (
        <p
          data-ask-this-case="none"
          className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted"
        >
          <GlossaryText>{answer.reason}</GlossaryText>
        </p>
      ) : (
        <div data-ask-this-case="answered" data-node={answer.nodeId} className="flex flex-col gap-3">
          <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] leading-snug font-semibold text-cc-ink">
            <span data-ask-question="">
              <GlossaryText>{answer.question}</GlossaryText>
            </span>
            {answer.anchor ? (
              <CcAnchor label={`${wt('ask.sourceLine')} ${answer.anchor}`}>{answer.anchor}</CcAnchor>
            ) : (
              <CcAnchor tone="unlinked">{wt('ask.noLine')}</CcAnchor>
            )}
          </p>

          <ul className="m-0 list-none space-y-2 p-0">
            {answer.branches.map((branch, i) => (
              <li
                key={`${answer.nodeId}-${i}`}
                data-ask-branch={branch.endsFlow ? 'ends-flow' : 'continues'}
                className="flex flex-wrap items-center gap-2 text-[13px] text-cc-ink"
              >
                <span className="font-cc-mono text-[12px]">
                  {branch.condition ?? wt('ask.otherwise')}
                </span>
                <span aria-hidden={true} className="text-cc-ink-muted">
                  {'→'}
                </span>
                <span className="font-cc-mono text-[12px]">
                  <GlossaryText>{branch.target}</GlossaryText>
                </span>
                {branch.anchor ? (
                  <CcAnchor label={`${wt('ask.sourceLine')} ${branch.anchor}`}>{branch.anchor}</CcAnchor>
                ) : null}
                {branch.endsFlow ? (
                  <span className="text-[12px] font-medium text-cc-ink-muted">
                    {wt('ask.endsFlow')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          {answer.rules.length > 0 ? (
            <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
              <span>
                {askRulesLabel(answer.rules.length)}
              </span>
              {answer.rules.map((rule) => (
                <span key={rule.id} data-ask-rule={rule.id} className="flex items-center gap-2">
                  <span className="font-cc-mono text-[12px] text-cc-ink">
                    <GlossaryText>{rule.label}</GlossaryText>
                  </span>
                  {rule.anchors.slice(0, 2).map((anchor) => (
                    <CcAnchor key={anchor} label={`${wt('ask.sourceLine')} ${anchor}`}>
                      {anchor}
                    </CcAnchor>
                  ))}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      )}
    </CcCard>
  );
}
