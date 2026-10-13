'use client';

import React from 'react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import { SapCheckedText } from '@/components/SapIdentifierCheck';
import {
  COMPARED_OPTION_LABELS,
  COMPARISON_ASPECTS,
  COMPARISON_ASPECT_LABELS,
  readOptionComparison,
} from '@/lib/design-option-comparison';
import { cn } from '@/lib/utils';

/**
 * The SAP standard, an in-app RAP extension and a side-by-side CAP application,
 * compared before the design rules the standard out (roadmap 3.0.12; CO review
 * F14, F15). The comparison is the model's, grounded in the engine's option
 * facts, and is marked as a proposal once for the section. A reason that only
 * restates the route ("CAP because the target is CAP") is not shown as a
 * reason: the section says it was refused and why (`readOptionComparison`).
 */
export default function OptionComparison({ design }: { design: unknown }) {
  const view = readOptionComparison(design);
  return (
    <section
      aria-labelledby="design-options-title"
      data-design-section="options"
      data-option-comparison={view.state}
      className="flex min-w-0 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="design-options-title" className="m-0 cc-text-h3 text-cc-ink">Standard, RAP and CAP compared</h3>
        {/* Only over a comparison the model wrote: an absent or unreadable one proposes nothing (QA 5a559787: 9af97544d758). */}
        {view.state === 'absent' || view.state === 'malformed' ? null : <CcProvenanceChip value="proposed" />}
      </div>
      {view.state === 'absent' ? (
        <p data-design-not-written="Options compared" className="m-0 rounded-cc-row border border-dashed border-cc-field-border px-3 py-2 text-[13px] text-cc-ink-muted">
          Options compared: not written in this design — it was written before the design compared the SAP standard, RAP and CAP. Regenerate to have the model compare them on the engine&apos;s facts.
        </p>
      ) : view.state === 'malformed' ? (
        <p data-option-comparison-malformed="" className="m-0 rounded-cc-row border border-dashed border-cc-field-border px-3 py-2 text-[13px] text-cc-ink-muted">
          The model&apos;s comparison could not be read: {view.why} Regenerate to have it written again.
        </p>
      ) : (
        <>
          <p className="m-0 text-[13px] text-cc-ink-muted">
            Each option on target release, fit-gap, effort, running cost and data contract — the model&apos;s comparison on the engine&apos;s facts. Running cost is qualitative: amounts come only from approved cost assumptions in Economics.
          </p>
          <div className="grid min-w-0 grid-cols-1 gap-3 min-[1000px]:grid-cols-3">
            {view.options.map((o) => (
              <article
                key={o.option}
                data-option={o.option}
                aria-label={COMPARED_OPTION_LABELS[o.option]}
                className={cn(
                  'flex min-w-0 flex-col gap-2 rounded-cc-row border bg-cc-surface p-3',
                  view.recommended === o.option ? 'border-2 border-cc-ink' : 'border-cc-line',
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <b className="text-[14px] font-bold text-cc-ink">{COMPARED_OPTION_LABELS[o.option]}</b>
                  {view.recommended === o.option ? <CcTag>Proposed</CcTag> : null}
                </span>
                <dl className="m-0 grid gap-2">
                  {COMPARISON_ASPECTS.map((a) => (
                    <div key={a} data-option-aspect={a} className="min-w-0">
                      <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-cc-ink-muted">{COMPARISON_ASPECT_LABELS[a]}</dt>
                      <dd className="m-0 text-[13px] text-cc-ink [overflow-wrap:anywhere]"><SapCheckedText text={o[a]} /></dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          {view.missing.length ? (
            <p data-option-missing="" className="m-0 text-[13px] text-cc-ink-muted">
              Not compared by the model: {view.missing.map((m) => COMPARED_OPTION_LABELS[m]).join(', ')}.
            </p>
          ) : null}
          {view.reason ? (
            <div data-option-reason="" className="flex min-w-0 flex-col gap-1">
              <p className="m-0 text-[14px] text-cc-ink [overflow-wrap:anywhere]">
                <b className="font-semibold">Why {COMPARED_OPTION_LABELS[view.recommended]}:</b> <SapCheckedText text={view.reason.text} />
              </p>
              <p className="m-0 text-[14px] text-cc-ink [overflow-wrap:anywhere]">
                <b className="font-semibold">The requirement the other options miss:</b> <SapCheckedText text={view.reason.requirement} />
              </p>
            </div>
          ) : (
            <p data-option-reason-refused="" className="m-0 rounded-cc-row border border-cc-warning-border bg-cc-warning-bg px-3 py-2 text-[13px] font-medium text-cc-ink">
              The model&apos;s reason for {COMPARED_OPTION_LABELS[view.recommended]} is not shown: {view.refused} A decision needs the requirement the other options miss — regenerate, or record the reason in the decision.
            </p>
          )}
        </>
      )}
    </section>
  );
}
