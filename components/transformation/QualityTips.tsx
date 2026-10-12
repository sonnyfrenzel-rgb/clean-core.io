'use client';

import React from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import { CcRunCost } from '@/components/cc/RunIndicator';
import { describeRunCost } from '@/lib/run-cost';
import { wt } from '@/lib/workspace-messages';
import { QUALITY_ANCHOR, type QualityTip } from '@/lib/transformation-chain';

/**
 * "Raise the quality" — the open inputs before a generation (roadmap 3.0.12,
 * owner 12.10.2026). Optional and never blocking: the generate button stands in
 * the same card whatever is open, and the card is one line when nothing is.
 *
 * Each tip says what it changes in the generated code, the count from this
 * project, and links to the one place it is decided; the link carries
 * `?origin=transformation.quality`, so the target shows "Back to
 * Transformation, Raise the quality" and returns here, where the counts are
 * read again (`lib/transformation-chain.ts`).
 */
export default function QualityTips({
  tips,
  canGenerate,
  busy,
  regenerate,
  onGenerate,
}: {
  tips: QualityTip[];
  /** False while something the stage says elsewhere stops a generation (model off, a reader). */
  canGenerate: boolean;
  busy: boolean;
  /** A package is on record: the button replaces it, and says so. */
  regenerate: boolean;
  onGenerate: () => void;
}) {
  const cost = describeRunCost({ profile: null, metered: false, callsModel: true });
  const button = (
    <CcButton
      variant="primary"
      icon={<RefreshCw size={16} aria-hidden={true} />}
      busy={busy}
      disabled={!canGenerate}
      onClick={onGenerate}
      data-generate-now=""
    >
      {regenerate ? wt('transformation.regenerateNow') : wt('transformation.generateNow')}
    </CcButton>
  );

  if (tips.length === 0) {
    return (
      <section
        id={QUALITY_ANCHOR}
        data-quality-tips="0"
        aria-label={wt('transformation.qualityTitle')}
        className="mb-6 flex scroll-mt-28 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="m-0 min-w-0 text-[13px] font-medium text-cc-ink-muted">{wt('transformation.qualityNothingOpen')}</p>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <span className="text-[12px] font-semibold text-cc-ink-muted">
            <CcRunCost cost={cost} />
          </span>
          {button}
        </div>
      </section>
    );
  }

  return (
    <section
      id={QUALITY_ANCHOR}
      data-quality-tips={String(tips.length)}
      aria-labelledby="tf-quality-title"
      className="mb-6 scroll-mt-28 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc md:p-5"
    >
      <h2 id="tf-quality-title" className="m-0 cc-text-h2 text-cc-ink">
        {wt('transformation.qualityTitle')}
      </h2>
      <p className="m-0 mt-1 text-[13px] font-medium text-cc-ink-muted">{wt('transformation.qualityLead')}</p>
      <ol className="m-0 mt-4 flex list-none flex-col p-0">
        {tips.map((tip) => (
          <li
            key={tip.key}
            data-quality-tip={tip.key}
            className="grid min-w-0 grid-cols-1 gap-2 border-t border-cc-line py-3 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_auto] md:gap-4"
          >
            <div className="min-w-0">
              <h3 className="m-0 text-[14px] font-bold text-cc-ink">{tip.title}</h3>
              <p data-quality-count="" className="m-0 mt-1 text-[12px] font-semibold text-cc-ink">
                {tip.count ?? wt('transformation.slot.loading')}
              </p>
              <p className="m-0 mt-1 text-[13px] font-medium text-cc-ink-muted">{tip.impact}</p>
              {!tip.read ? (
                <p data-quality-not-read="" className="m-0 mt-1 text-[12px] font-semibold text-cc-ink-muted">
                  {wt('transformation.notReadYet')}
                </p>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-start gap-2 md:justify-end">
              {tip.links.map((link) => (
                <CcLinkButton
                  key={link.href}
                  href={link.href}
                  variant="secondary"
                  icon={<ArrowRight size={16} aria-hidden={true} />}
                  data-quality-link={tip.key}
                >
                  {link.label}
                </CcLinkButton>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-col gap-3 border-t border-cc-line pt-4 sm:flex-row sm:items-center sm:justify-end">
        <span className="text-[12px] font-semibold text-cc-ink-muted">
          <CcRunCost cost={cost} />
        </span>
        {button}
      </div>
    </section>
  );
}
