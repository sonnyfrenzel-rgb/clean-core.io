'use client';

import React from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import type { SummaryLine } from '@/lib/program-summary-text';
import { CcTag } from '@/components/cc/Tag';
import { AUTHOR_CLAIM_LABEL, type AuthorClaim } from '@/lib/program-summary-check';
import { wt } from '@/lib/workspace-messages';

/**
 * "In short" — what the program is for, in two to four sentences, before
 * anything else a business reader sees (owner, 12.10.2026: *"the business
 * high-level texts about what a Z program does … must get clearly better"*;
 * roadmap 3.0.11). The Business view and Analyze render this one component
 * from the one text model (`lib/program-summary-text.ts`), so they say the
 * same thing; Documentation and Management render the same slots in their
 * own form.
 *
 * The level is always said: the chip *Reconstructed* and the sentence that the
 * business has not confirmed it. A model's wording of the purpose, where one
 * passed the check against the engine's facts, stands first with the chip
 * *Model proposal* — the engine's sentences stay underneath it.
 *
 * Only layout: the sentences and the anchors come in ready.
 */
export default function ProgramInShort({
  lines,
  level,
  proposal = null,
  authorClaim = null,
  headingLevel = 4,
  id = 'program-in-short-title',
}: {
  lines: readonly SummaryLine[];
  /** The level of the whole summary — "Reconstructed from the code — not confirmed by the business." */
  level: SummaryLine;
  /** A model's wording of the purpose that passed `checkPurposeProposal`; null when there is none. */
  proposal?: string | null;
  /**
   * The header comment's statement of purpose (`authorClaimOf`): quoted with
   * the tag *Author's claim* when the facts do not contradict it; otherwise
   * only the line that says it is not quoted, and why (owner, 12.10.2026).
   */
  authorClaim?: AuthorClaim | null;
  headingLevel?: 2 | 3 | 4;
  id?: string;
}) {
  if (lines.length === 0) return null;
  const Heading = headingLevel === 2 ? 'h2' : headingLevel === 3 ? 'h3' : 'h4';
  return (
    <section data-program-in-short="" aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Heading id={id} className="m-0 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">
          {wt('biz.inShortTitle')}
        </Heading>
        <CcProvenanceChip value={level.basis === 'confirmed' ? 'confirmed' : 'reconstructed'} />
      </div>
      {authorClaim?.state === 'shown' ? (
        <p data-program-in-short-author-claim="" className="m-0 flex flex-wrap items-center gap-2 text-[15px] leading-snug font-semibold text-cc-ink">
          <span className="min-w-0 break-words">{`“${authorClaim.text}”`}</span>
          <CcAnchor label={`${wt('firstLook.sourceLine')} L${authorClaim.lineStart}`}>{`L${authorClaim.lineStart}`}</CcAnchor>
          <CcTag>{AUTHOR_CLAIM_LABEL}</CcTag>
        </p>
      ) : null}
      {proposal ? (
        <p data-program-in-short-proposal="" className="m-0 flex flex-wrap items-center gap-2 text-[15px] leading-snug font-semibold text-cc-ink">
          <span className="min-w-0 break-words">{proposal}</span>
          <CcProvenanceChip value="proposed" note={wt('biz.inShortProposalNote')} />
        </p>
      ) : null}
      {proposal || authorClaim?.state === 'shown' ? (
        <p className="m-0 text-[12px] font-semibold text-cc-ink-muted">{wt('biz.inShortEngine')}</p>
      ) : null}
      <p data-program-in-short-text="" className={proposal || authorClaim?.state === 'shown' ? 'm-0 text-[13px] leading-snug font-medium text-cc-ink' : 'm-0 text-[15px] leading-snug font-semibold text-cc-ink'}>
        {lines.map((line, i) => (
          <React.Fragment key={`${line.key}-${i}`}>
            <span data-in-short-slot={line.key} className="break-words">{line.text}</span>
            {line.anchors[0] ? (
              <>
                {' '}
                <CcAnchor label={`${wt('firstLook.sourceLine')} L${line.anchors[0].lineStart}`}>{`L${line.anchors[0].lineStart}`}</CcAnchor>
              </>
            ) : null}
            {i < lines.length - 1 ? ' ' : null}
          </React.Fragment>
        ))}
      </p>
      {authorClaim?.state === 'contradicted' ? (
        <p data-program-in-short-author-claim="not-quoted" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{authorClaim.note}</p>
      ) : null}
      <p data-program-in-short-level="" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{level.text}</p>
    </section>
  );
}
