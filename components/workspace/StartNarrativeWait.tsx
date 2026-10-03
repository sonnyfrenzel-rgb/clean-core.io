'use client';

import React, { useEffect, useState } from 'react';
import CcButton from '@/components/cc/Button';
import { START_NARRATIVE_CEILING_MS } from '@/lib/engine-run';
import { wt, bizNarrativeContinueNote, bizNarrativeWaited } from '@/lib/workspace-messages';

/**
 * The wait for the start's narrative (owner decision 03.10.2026, ADR-072):
 * what is happening, how long it has taken so far, when it ends at the latest,
 * and the one way not to wait.
 *
 * The figure is the seconds actually waited, counted from the moment the start
 * asked — not a percentage, because nothing here knows how far the model is.
 * Shown in the build-up's last moment and where the map goes, so a reader who
 * skipped the build-up, or asked for less movement, is told the same.
 */
export default function StartNarrativeWait({
  since,
  onContinue,
}: {
  /** `Date.now()` when the wait began. */
  since: number;
  onContinue: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const ceiling = Math.round(START_NARRATIVE_CEILING_MS / 1000);
  return (
    <div data-start-narrative="writing" className="flex flex-col gap-2">
      <p className="m-0 text-[13px] font-semibold text-cc-ink" role="status">
        {wt('biz.narrativeWriting')}
      </p>
      <p data-start-narrative-waited={seconds} className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {bizNarrativeWaited(seconds, ceiling)}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <CcButton onClick={onContinue} data-start-narrative-continue="">
          {wt('biz.narrativeContinue')}
        </CcButton>
        <span className="text-[12px] font-medium text-cc-ink-muted">{bizNarrativeContinueNote()}</span>
      </div>
    </div>
  );
}
