'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import CcLinkButton from '@/components/cc/LinkButton';
import { useAnalysisRead } from '@/hooks/useAnalysisRead';
import { wt } from '@/lib/workspace-messages';

/**
 * "Your analysis is ready" — one line in the work area until this browser has
 * opened Analyze for this project (ADR-090, owner 10.10.2026).
 *
 * An addition beside "Continue with", never a second next step: the phase
 * contract still names the next phase, and this line only points back at a
 * result that is on record and has not been read. Its action is secondary —
 * the page keeps its one primary in "Next step" (`DESIGN.md` §1.5). The
 * information colour, not green: being ready to read is not evidence.
 *
 * Renders nothing on the server and nothing once Analyze has been opened
 * (`useAnalysisRead`); the caller decides whether there is a result at all
 * (`analysisReadyResult`).
 */
export default function AnalysisReady({
  readKey,
  line,
  href,
}: {
  /** The project id, or `demo`. */
  readKey: string;
  /** The sentence with the run's figures — `hubAnalysisReady` / `demoAnalysisReady`. */
  line: string;
  href: string;
}) {
  const read = useAnalysisRead(readKey);
  if (read) return null;
  return (
    <div
      data-analysis-ready=""
      className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-cc-row border border-l-4 border-cc-line border-l-cc-information bg-cc-information-bg px-4 py-3"
    >
      <div className="min-w-0 flex-1 basis-72">
        <h3 className="m-0 text-[15px] leading-snug font-bold text-cc-ink">{wt('hub.analysisReadyTitle')}</h3>
        <p className="m-0 mt-1 text-[13px] leading-snug font-medium text-cc-ink">{line}</p>
      </div>
      <span className="cc-no-print" data-analysis-ready-action="">
        <CcLinkButton variant="secondary" density="cozy" href={href}>
          {wt('hub.analysisReadyAction')}
          <ArrowRight size={16} aria-hidden={true} />
        </CcLinkButton>
      </span>
    </div>
  );
}
