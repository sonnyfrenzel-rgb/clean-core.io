'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import CcLinkButton from '@/components/cc/LinkButton';
import { redesignYouDo, wt } from '@/lib/workspace-messages';

/**
 * The two endings of Analyze in the Business view (plan AB-4; owner decision 06.11.2026: "Analysis-only is a
 * complete outcome. Two equal endings"; mockup states 6, 9 and 17; ADR-118).
 *
 *   - **Re-design this program** opens Design. What happens there, what the reader does — one decision per business
 *     rule, with the count of rules the engine read (P6: a figure only where it is counted, never a duration) — and
 *     that nothing changes in SAP.
 *   - **Analyse another Z program** opens the reader's own list, where an upload or an example starts the next one.
 *
 * **Equal:** both `secondary`, side by side, the same size; neither is the page's primary action. **Nothing locks and
 * nothing is confirmed:** two links, no dialog, no write. An invited reader (P8) cannot re-design someone else's
 * program: one sentence says the owner can, and the other ending opens the reader's own list.
 *
 * `compact` is the form in the summary and on the tour's last card; `full` the section below the text around the
 * map, with what happens spelled out.
 */
export default function AnalyzeEndings({
  variant,
  owner,
  rules,
  designHref,
  anotherHref,
  children,
}: {
  variant: 'compact' | 'full';
  /** False for an invited reader (P8). */
  owner: boolean;
  /** The business rules the engine read, or null while they are read. */
  rules: number | null;
  designHref: string;
  /** The reader's own list (My workspace). */
  anotherHref: string;
  /** What stands under the full section's lead: the quiet link back to "What you can do next" (N9, state 9b). */
  children?: React.ReactNode;
}) {
  if (variant === 'compact') {
    return (
      <div data-analyze-endings="compact" className="grid min-w-0 gap-3 min-[600px]:min-w-[18rem]">
        {owner ? (
          <div data-analyze-ending="redesign" className="flex min-w-0 flex-col gap-1">
            <CcLinkButton href={designHref} variant="secondary" data-analyze-ending-open="redesign">
              {wt('abiz.redesignTitle')}
              <ArrowRight size={16} aria-hidden={true} />
            </CcLinkButton>
            <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
              {`${wt('abiz.redesignShort')} ${wt('abiz.whatYouDo')} ${redesignYouDo(rules)} ${wt('abiz.redesignNothingInSapShort')}`}
            </p>
          </div>
        ) : (
          <p data-analyze-ending="redesign-reader" className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
            {wt('abiz.redesignReader')}
          </p>
        )}
        <div data-analyze-ending="another" className="flex min-w-0 flex-col gap-1">
          <CcLinkButton href={anotherHref} variant="secondary" data-analyze-ending-open="another">
            {wt('abiz.anotherTitle')}
            <ArrowRight size={16} aria-hidden={true} />
          </CcLinkButton>
          <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('abiz.anotherShort')}</p>
        </div>
      </div>
    );
  }

  return (
    <section
      data-analyze-endings="full"
      aria-label={wt('abiz.endingsLabel')}
      className="grid grid-cols-1 items-stretch gap-3 min-[1024px]:grid-cols-[18rem_minmax(0,1fr)]"
    >
      <div className="flex min-w-0 flex-col gap-1 rounded-cc-card border border-cc-line bg-cc-surface-muted px-4 py-3">
        <p className="m-0 text-[13px] leading-snug font-bold text-cc-ink">{wt('abiz.endTitle')}</p>
        <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('abiz.endLead')}</p>
        {children}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 min-[600px]:grid-cols-2">
        <div data-analyze-ending="redesign" className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3">
          <h3 className="m-0 text-[15px] leading-snug font-bold text-cc-ink">{wt('abiz.redesignTitle')}</h3>
          {owner ? (
            <>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] leading-snug font-medium text-cc-ink">
                <li>
                  <span className="font-semibold">{wt('abiz.whatHappens')}</span> {wt('abiz.redesignHappens')}
                </li>
                <li data-analyze-ending-rules={rules === null ? '' : String(rules)}>
                  <span className="font-semibold">{wt('abiz.whatYouDo')}</span> {redesignYouDo(rules)}
                </li>
                <li>{wt('abiz.redesignNothingInSap')}</li>
              </ul>
              <span className="mt-auto">
                <CcLinkButton href={designHref} variant="secondary" data-analyze-ending-open="redesign">
                  {wt('abiz.redesignOpen')}
                  <ArrowRight size={16} aria-hidden={true} />
                </CcLinkButton>
              </span>
            </>
          ) : (
            <p data-analyze-ending-reader="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
              {wt('abiz.redesignReader')}
            </p>
          )}
        </div>
        <div data-analyze-ending="another" className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3">
          <h3 className="m-0 text-[15px] leading-snug font-bold text-cc-ink">{wt('abiz.anotherTitle')}</h3>
          <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink">{wt('abiz.anotherLead')}</p>
          <span className="mt-auto">
            <CcLinkButton href={anotherHref} variant="secondary" data-analyze-ending-open="another">
              {wt('abiz.anotherOpen')}
              <ArrowRight size={16} aria-hidden={true} />
            </CcLinkButton>
          </span>
        </div>
      </div>
    </section>
  );
}
