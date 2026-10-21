'use client';

import React from 'react';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import type { WordedSentence } from '@/lib/plain-wording';
import { wt } from '@/lib/workspace-messages';

/**
 * The plain wording of an engine sentence, as the walk-through and the rule
 * cards show it — roadmap 3.0.20, owner decision 21.10.2026 (2).
 *
 * A reworded sentence carries the chip *Model proposal · worded*; the engine's
 * own sentence stays one fold down, "As read from the code". A sentence nobody
 * reworded carries nothing extra: it is the engine's, as it always was.
 */
export function WordedChip({ said }: { said: WordedSentence }) {
  if (!said.worded) return null;
  return (
    <span data-worded-chip="" className="ml-1 inline-flex align-middle">
      <CcProvenanceChip value="proposed" note={wt('walk.worded')} />
    </span>
  );
}

/** The engine's sentences behind the reworded ones of one step or rule — empty when nothing was reworded. */
export function AsReadFromCode({ said }: { said: readonly WordedSentence[] }) {
  const worded = said.filter((s) => s.worded);
  if (worded.length === 0) return null;
  return (
    <div data-worded-engine="">
      <CcDisclosure title={wt('walk.asRead')} count={worded.length}>
        <p className="m-0 mb-1 text-[12px] font-medium text-cc-ink-muted">{wt('walk.asReadLead')}</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {worded.map((s, i) => (
            <li key={i} data-worded-engine-sentence="" className="text-[12px] leading-snug font-medium text-cc-ink">
              {s.engine}
            </li>
          ))}
        </ul>
      </CcDisclosure>
    </div>
  );
}
