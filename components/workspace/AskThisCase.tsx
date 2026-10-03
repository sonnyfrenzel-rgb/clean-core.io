'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
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
 * **Plain words on top, the code one fold down** (owner, 03.10.2026: "Nobody
 * understands this either. What is it supposed to be for someone who can't
 * read code?"). Where the answer carries the plain wording — the decision
 * point's label as the map shows it, each branch as a sentence, the rules in
 * plain words — the card leads with it, every line with its anchor chip. The
 * code's own question (`What happens when IF sy-subrc <> 0?`) and the raw
 * branch mapping stay under "Show the code", for the IT reader. Nothing is
 * paraphrased here: the plain words are the deterministic wording the map
 * already uses, and where it has none the card falls back to the code.
 *
 * **No branch means no question.** The card then says that, rather than
 * offering a general invitation dressed as an answer.
 *
 * **Technical terms carry the glossary with them** (roadmap 6.6, `DESIGN.md`
 * §6.1): every string a reader might not know a word in goes through
 * `GlossaryText`, which underlines the terms it recognises and nothing else.
 */
export default function AskThisCase({ answer }: { answer: PreAnswered }) {
  const plain = answer.kind === 'answered' && !!answer.plainQuestion;
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
        <div
          data-ask-this-case="answered"
          data-ask-wording={plain ? 'plain' : 'code'}
          data-node={answer.nodeId}
          className="flex flex-col gap-3"
        >
          <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] leading-snug font-semibold text-cc-ink">
            <span data-ask-question="">
              <GlossaryText>{plain ? (answer.plainQuestion as string) : answer.question}</GlossaryText>
            </span>
            {answer.anchor ? (
              <CcAnchor label={`${wt('ask.sourceLine')} ${answer.anchor}`}>{answer.anchor}</CcAnchor>
            ) : (
              <CcAnchor tone="unlinked">{wt('ask.noLine')}</CcAnchor>
            )}
          </p>

          {plain ? (
            <>
              <ul data-ask-plain="" className="m-0 list-none space-y-2 p-0">
                {answer.branches.map((branch, i) =>
                  branch.plain ? (
                    <li
                      key={`${answer.nodeId}-${i}`}
                      data-ask-branch={branch.endsFlow ? 'ends-flow' : 'continues'}
                      className="flex flex-wrap items-center gap-2 text-[13px] leading-snug font-medium text-cc-ink"
                    >
                      <span className="min-w-0 break-words">
                        <GlossaryText>{branch.plain}</GlossaryText>
                      </span>
                      {branch.anchor ? (
                        <CcAnchor label={`${wt('ask.sourceLine')} ${branch.anchor}`}>{branch.anchor}</CcAnchor>
                      ) : null}
                    </li>
                  ) : null,
                )}
              </ul>
              {answer.rules.some((r) => r.sentence) ? (
                <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
                  <span>{askRulesLabel(answer.rules.length)}</span>
                  {answer.rules.map((rule) =>
                    rule.sentence ? (
                      <span key={rule.id} data-ask-rule={rule.id} className="flex items-center gap-2">
                        <span className="font-semibold text-cc-ink">
                          <GlossaryText>{rule.sentence}</GlossaryText>
                        </span>
                        {rule.anchors.slice(0, 2).map((anchor) => (
                          <CcAnchor key={anchor} label={`${wt('ask.sourceLine')} ${anchor}`}>
                            {anchor}
                          </CcAnchor>
                        ))}
                      </span>
                    ) : null,
                  )}
                </p>
              ) : null}
              <CcDisclosure title={wt('ask.showCode')} level={3}>
                <div data-ask-code="" className="flex flex-col gap-2">
                  <p data-ask-code-question="" className="m-0 font-cc-mono text-[12px] font-medium text-cc-ink">
                    {answer.question}
                  </p>
                  <CodeBranches answer={answer} />
                </div>
              </CcDisclosure>
            </>
          ) : (
            <CodeBranches answer={answer} />
          )}
        </div>
      )}
    </CcCard>
  );
}

/** The branches and rules as the code writes them — the IT reader's view of the same answer. */
function CodeBranches({ answer }: { answer: Extract<PreAnswered, { kind: 'answered' }> }) {
  return (
    <>
      <ul className="m-0 list-none space-y-2 p-0">
        {answer.branches.map((branch, i) => (
          <li
            key={`${answer.nodeId}-${i}`}
            data-ask-code-branch={branch.endsFlow ? 'ends-flow' : 'continues'}
            {...(answer.plainQuestion ? {} : { 'data-ask-branch': branch.endsFlow ? 'ends-flow' : 'continues' })}
            className="flex flex-wrap items-center gap-2 text-[13px] text-cc-ink"
          >
            <span className="font-cc-mono text-[12px]">{branch.condition ?? wt('ask.otherwise')}</span>
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
              <span className="text-[12px] font-medium text-cc-ink-muted">{wt('ask.endsFlow')}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {answer.rules.length > 0 ? (
        <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
          <span>{askRulesLabel(answer.rules.length)}</span>
          {answer.rules.map((rule) => (
            <span key={rule.id} data-ask-code-rule={rule.id} className="flex items-center gap-2">
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
    </>
  );
}
