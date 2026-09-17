'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { t } from '@/lib/cc-messages';
import type { PreAnswered } from '@/lib/ask-this-case';

/**
 * "Ask this case", already answered once — `DESIGN.md` §5.3, §6.2, roadmap 2.7.
 *
 *   > *Eine Frage ist schon beantwortet. „Ask this case" zeigt beim ersten
 *   > Öffnen eine gestellte Frage mit Antwort und Ankern — abgeleitet aus den
 *   > Verzweigungen des Codes (Chip Reconstructed), **ohne Modellaufruf und ohne
 *   > das Kontingent des Nutzers anzutasten**.*
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
 */
export default function AskThisCase({ answer }: { answer: PreAnswered }) {
  return (
    <CcCard
      title="Ask this case"
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
          {answer.reason}
        </p>
      ) : (
        <div data-ask-this-case="answered" data-node={answer.nodeId} className="flex flex-col gap-2.5">
          <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] leading-snug font-semibold text-cc-ink">
            <span data-ask-question="">{answer.question}</span>
            {answer.anchor ? (
              <CcAnchor label={`Source line ${answer.anchor}`}>{answer.anchor}</CcAnchor>
            ) : (
              <CcAnchor tone="unlinked">no line</CcAnchor>
            )}
          </p>

          <ul className="m-0 list-none space-y-1.5 p-0">
            {answer.branches.map((branch, i) => (
              <li
                key={`${answer.nodeId}-${i}`}
                data-ask-branch={branch.endsFlow ? 'ends-flow' : 'continues'}
                className="flex flex-wrap items-center gap-2 text-[13px] text-cc-ink"
              >
                <span className="font-cc-mono text-[12px]">
                  {branch.condition ?? 'otherwise'}
                </span>
                <span aria-hidden={true} className="text-cc-ink-muted">
                  &rarr;
                </span>
                <span className="font-cc-mono text-[12px]">{branch.target}</span>
                {branch.anchor ? (
                  <CcAnchor label={`Source line ${branch.anchor}`}>{branch.anchor}</CcAnchor>
                ) : null}
                {branch.endsFlow ? (
                  <span className="text-[12px] font-medium text-cc-ink-muted">
                    ends the flow here
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          {answer.rules.length > 0 ? (
            <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
              <span>
                {answer.rules.length === 1
                  ? 'One rule stands on this decision:'
                  : `${answer.rules.length} rules stand on this decision:`}
              </span>
              {answer.rules.map((rule) => (
                <span key={rule.id} data-ask-rule={rule.id} className="flex items-center gap-1.5">
                  <span className="font-cc-mono text-[12px] text-cc-ink">{rule.label}</span>
                  {rule.anchors.slice(0, 2).map((anchor) => (
                    <CcAnchor key={anchor} label={`Source line ${anchor}`}>
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
