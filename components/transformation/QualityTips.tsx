'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import ChainList from '@/components/transformation/ChainList';
import { tfCostLine, tfTipsMeta, wt } from '@/lib/workspace-messages';
import { GENERATION_MAX_MODEL_CALLS, QUALITY_ANCHOR, type ChainSlot, type DecisionWarning, type QualityTip } from '@/lib/transformation-chain';

/**
 * Before the run (roadmap 3.0.12, owner 12.10.2026; design §14, mockup state
 * 1): "Before the run: raise the quality" — what the reader can still do that
 * changes what the generation uses, ordered by impact, each with its count,
 * its effect on the code and the one place it is decided — and under it the
 * chain of what this generation will use.
 *
 * Never blocking: "Generate now" stands in the card whatever is open, and the
 * card is one line when nothing is. The links carry
 * `?origin=transformation.tips`, so the place they open shows "Back to
 * Transformation, Before the run" and returns here, where the counts are read
 * again.
 */
export default function QualityTips({
  tips,
  warning = null,
  settled,
  slots,
  canGenerate,
  busy,
  regenerate,
  keySource,
  onGenerate,
}: {
  tips: QualityTip[];
  /**
   * The decision warning (`decisionWarning`): a generation against the
   * decision on record, or SAP standard not weighed yet. A warning, never a
   * gate — "Generate now" stays (owner, 12.10.2026).
   */
  warning?: DecisionWarning | null;
  /** Every count has been read: "nothing open" can be said. */
  settled: boolean;
  slots: ChainSlot[];
  /** False while something the stage says elsewhere stops a generation (model off, a reader). */
  canGenerate: boolean;
  busy: boolean;
  /** A package is on record: the button replaces it, and says so. */
  regenerate: boolean;
  keySource: 'byok' | 'community' | null;
  onGenerate: () => void;
}) {
  return (
    <div data-quality-tips={settled ? String(tips.length) : 'reading'} className="mb-6 flex flex-col gap-4">
      <section
        id={QUALITY_ANCHOR}
        aria-labelledby="transformation-tips-title"
        className="scroll-mt-28 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="transformation-tips-title" className="m-0 cc-text-h2 text-cc-ink">
            {wt('transformation.tipsTitle')}
          </h2>
          {tips.length > 0 ? <span className="text-[12px] font-semibold text-cc-ink-muted">{tfTipsMeta(tips.length)}</span> : null}
        </div>
        {warning ? (
          <div data-decision-warning={warning.kind} className="mt-3">
            <CcMessageStrip
              state="warning"
              headline={warning.text}
              actions={
                <a
                  href={warning.link.href}
                  data-decision-warning-link={warning.kind}
                  className="text-[13px] font-semibold whitespace-nowrap text-cc-information underline underline-offset-2"
                >
                  {warning.link.label}
                </a>
              }
            >
              {wt('transformation.warnDecision.lead')}
            </CcMessageStrip>
          </div>
        ) : null}
        {tips.length > 0 ? (
          <>
            <p className="m-0 mt-1 text-[13px] font-medium text-cc-ink-muted">{wt('transformation.tipsLead')}</p>
            <ol className="m-0 mt-3 grid list-none gap-2 p-0">
              {tips.map((tip) => (
                <li
                  key={tip.key}
                  data-quality-tip={tip.key}
                  className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-cc-row border border-cc-line bg-cc-surface p-3 md:grid-cols-[auto_minmax(0,1fr)_auto]"
                >
                  <span
                    data-quality-count={tip.count ?? ''}
                    className="grid h-8 min-w-8 place-items-center rounded-cc-row border border-cc-warning-border bg-cc-warning-bg px-2 text-[14px] font-extrabold text-cc-warning tabular-nums"
                  >
                    {tip.count ?? <AlertTriangle size={16} aria-hidden={true} />}
                  </span>
                  <div className="min-w-0 text-[14px] font-medium text-cc-ink">
                    <b className="font-bold">{tip.title}</b> — {tip.impact}
                    <p className="m-0 mt-1 text-[13px] font-medium text-cc-ink-muted">
                      <b className="font-semibold text-cc-ink">{wt('transformation.inCode')}</b> {tip.inCode}
                    </p>
                    {!tip.read ? (
                      <p data-quality-not-read="" className="m-0 mt-1 text-[12px] font-semibold text-cc-ink-muted">
                        {wt('transformation.notReadYet')}
                      </p>
                    ) : null}
                  </div>
                  <a
                    href={tip.link.href}
                    data-quality-link={tip.key}
                    className="col-start-2 text-[13px] font-semibold whitespace-nowrap text-cc-information underline underline-offset-2 md:col-start-auto"
                  >
                    {tip.link.label}
                  </a>
                </li>
              ))}
            </ol>
          </>
        ) : settled ? (
          <p data-quality-done="" className="m-0 mt-3 rounded-cc-row border border-cc-line px-3 py-2 text-[13px] font-medium text-cc-ink">
            {wt('transformation.tipsDone')}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CcButton
            variant="primary"
            density="cozy"
            icon={<RefreshCw size={16} aria-hidden={true} />}
            busy={busy}
            disabled={!canGenerate}
            onClick={onGenerate}
            data-generate-now=""
          >
            {regenerate ? wt('transformation.regenerateNow') : wt('transformation.generateNow')}
          </CcButton>
          {tips.some((t) => t.key === 'rules') ? (
            <span className="text-[13px] font-medium text-cc-ink-muted">{wt('transformation.generateNote')}</span>
          ) : null}
        </div>
        <p data-generate-cost="" className="m-0 mt-2 text-[12px] font-semibold text-cc-ink-muted">
          {tfCostLine(GENERATION_MAX_MODEL_CALLS, keySource)}
        </p>
      </section>

      <section aria-labelledby="transformation-chain-before" className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
        <h2 id="transformation-chain-before" className="m-0 cc-text-h2 text-cc-ink">
          {wt('transformation.chainBeforeTitle')}
        </h2>
        <p className="m-0 mt-1 text-[13px] font-medium text-cc-ink-muted">{wt('transformation.chainBeforeLead')}</p>
        <ChainList slots={slots} mode="before" />
      </section>
    </div>
  );
}
