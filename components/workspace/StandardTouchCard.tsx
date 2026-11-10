'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import { wt } from '@/lib/workspace-messages';
import { GATE_CLASS_LABELS, STANDARD_TOUCH_LIMITS, anchorText, type StandardTouch, type TouchAnchor } from '@/lib/standard-touch';

/**
 * *Where this program touches SAP standard* — stage 1 of the fit-to-standard
 * approach (owner decision 22.10.2026). It took the place of the IT view's
 * *Standard fit* table, whose rows all read "Not determined".
 *
 * Everything on it is read from the findings of the signed run
 * (`lib/standard-touch.ts`): the SAP areas the program works in, how it departs
 * from SAP standard with its lines, and whether it is worth examining against
 * SAP standard. The limits sentence stands visibly at the top: the card shows
 * where the program touches the standard, never whether the standard does
 * what it does.
 *
 * `touch` is `undefined` while the findings are read.
 */
export default function StandardTouchCard({ touch, children }: { touch: StandardTouch | undefined; children?: React.ReactNode }) {
  const lines = (anchors: TouchAnchor[]) =>
    anchors.slice(0, 8).map((a) => (
      <CcAnchor key={`${a.lineStart}-${a.lineEnd ?? ''}`} tone="unlinked">
        {anchorText(a)}
      </CcAnchor>
    ));
  const more = (anchors: TouchAnchor[]) => (anchors.length > 8 ? <span className="text-[12px] font-medium text-cc-ink-muted">+{anchors.length - 8}</span> : null);

  return (
    <CcCard
      title={wt('itv.touchTitle')}
      meta={<CcProvenanceChip value={touch && touch.gate.outcome !== 'not-determined' ? 'reconstructed' : 'not-determined'} />}
    >
      <p data-standard-touch-limits="" className="m-0 rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2 text-[12px] leading-snug font-medium text-cc-ink">
        {STANDARD_TOUCH_LIMITS}
      </p>
      {touch === undefined ? (
        <p data-standard-touch="reading" className="m-0 mt-3 text-[13px] font-medium text-cc-ink-muted">
          {wt('itv.touchReading')}
        </p>
      ) : (
        <div data-standard-touch={touch.gate.outcome} className="mt-3 flex flex-col gap-4">
          <p data-standard-touch-sentence="" className="m-0 text-[14px] leading-snug font-semibold text-cc-ink">
            {touch.sentence}
          </p>

          <section>
            <h4 className="m-0 text-[13px] font-bold text-cc-ink">{wt('itv.touchGate')}</h4>
            {touch.gate.outcome === 'offered' ? (
              <ul className="m-0 mt-2 list-none space-y-2 p-0">
                {touch.gate.signals.map((s) => (
                  <li key={s.cls} data-standard-touch-class={s.cls} className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-cc-ink">
                    <CcTag>{GATE_CLASS_LABELS[s.cls]}</CcTag>
                    <span>{s.text}</span>
                    {lines(s.anchors)}
                    {more(s.anchors)}
                  </li>
                ))}
              </ul>
            ) : touch.gate.outcome === 'not-offered' ? (
              <p data-standard-touch-exclusion={touch.gate.exclusion} className="m-0 mt-2 flex flex-wrap items-center gap-2 text-[13px] font-medium text-cc-ink">
                <span>{touch.gate.sentence}</span>
                {lines(touch.gate.anchors)}
                {more(touch.gate.anchors)}
              </p>
            ) : (
              <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink">{touch.gate.sentence}</p>
            )}
          </section>

          <section>
            <h4 className="m-0 text-[13px] font-bold text-cc-ink">{wt('itv.touchAreas')}</h4>
            {touch.areas.length > 0 ? (
              <ul className="m-0 mt-2 list-none space-y-1 p-0">
                {touch.areas.map((a) => (
                  <li key={a.component} data-standard-touch-area={a.component} className="text-[13px] font-medium text-cc-ink">
                    <span className="font-cc-mono font-semibold">{a.component}</span>
                    <span className="text-cc-ink-muted"> · {a.objects.join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">
                {touch.areasNotRecorded ? wt('itv.touchAreasNotRecorded') : wt('itv.touchAreasNone')}
              </p>
            )}
          </section>

          <section>
            <h4 className="m-0 text-[13px] font-bold text-cc-ink">{wt('itv.touchDepartures')}</h4>
            {touch.departures.length > 0 ? (
              <ul className="m-0 mt-2 list-none space-y-2 p-0">
                {touch.departures.map((d) => (
                  <li key={d.kind} data-standard-touch-departure={d.kind} className="flex flex-wrap items-center gap-2 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2 text-[13px] font-medium text-cc-ink">
                    <span className="font-semibold">{d.label}</span>
                    {d.objects.length > 0 ? <span className="text-cc-ink-muted">{d.objects.slice(0, 4).join(', ')}</span> : null}
                    {lines(d.anchors)}
                    {more(d.anchors)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">{wt('itv.touchDeparturesNone')}</p>
            )}
          </section>

          <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('itv.touchNotSigned')}</p>
        </div>
      )}
      {children}
    </CcCard>
  );
}
