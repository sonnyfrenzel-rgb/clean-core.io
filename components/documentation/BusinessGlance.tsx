'use client';

import React from 'react';
import { CircleHelp, CornerDownRight, ListChecks, PenLine } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { STATE_CLASSES } from '@/components/cc/state';
import type { BusinessCallout, CalloutKind, GlanceAnchor, GlanceEvidence, GlanceHeadline } from '@/lib/business-summary';
import { calloutTitle, calloutWhy, glanceHeadlineSentence, moreEvidence, wt } from '@/lib/workspace-messages';
import { cn } from '@/lib/utils';

/**
 * The first thing a business reader sees on the Documentation stage — owner,
 * 03.10.2026: "the business user must quickly understand where the value or
 * the problems lie".
 *
 * Left: what the process does (a sentence counted from the code) and up to
 * three callouts — tables written directly, rules hard-coded in the program,
 * early ends. Right: what is not determined, beside it and never below it
 * (`DESIGN.md` §5.1: "the doubt is answered at once"). The shape follows the
 * reveal and the not-determined box of mockup s1.
 *
 * Every callout carries its evidence — a line, a rule id, a table with its
 * line — and the rules that pick them are in `lib/business-summary.ts`. This
 * file draws; it decides nothing.
 */

export interface BusinessGlanceProps {
  headline: GlanceHeadline | null;
  callouts: BusinessCallout[];
  /** The not-determined box; null while the sweep has not answered. */
  notDetermined: BusinessCallout | null;
  /** True while the process is still being read. */
  reading: boolean;
  /** No signed source: nothing could be read or checked. */
  noSource?: boolean;
}

const ICONS: Record<CalloutKind, React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>> = {
  'direct-write': PenLine,
  'hard-coded-rules': ListChecks,
  'early-end': CornerDownRight,
  'not-determined': CircleHelp,
};

const anchorText = (a: GlanceAnchor) => (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`);
const anchorLabel = (a: GlanceAnchor) =>
  a.lineStart === a.lineEnd ? `Source line ${a.lineStart}` : `Source lines ${a.lineStart} to ${a.lineEnd}`;

function Evidence({ kind, item }: { kind: CalloutKind; item: GlanceEvidence }) {
  return (
    <li data-callout-evidence="" className="flex min-w-0 flex-wrap items-center gap-1">
      {kind === 'hard-coded-rules' && item.ref ? <CcAnchor label={`Business rule ${item.ref}`}>{item.ref}</CcAnchor> : null}
      {item.anchor ? (
        <CcAnchor label={anchorLabel(item.anchor)}>{anchorText(item.anchor)}</CcAnchor>
      ) : kind !== 'hard-coded-rules' ? (
        <CcAnchor tone="unlinked" label="No line range">no lines</CcAnchor>
      ) : null}
      {item.level !== undefined ? (
        item.level ? <CcCleanCoreLevel value={item.level} /> : <CcProvenanceChip value="not-determined" note={wt('doc.levelPending')} />
      ) : null}
      <span className="min-w-0 flex-1 basis-32 truncate cc-text-meta font-medium text-cc-ink" title={item.label}>
        {kind === 'direct-write' && item.ref && item.ref !== item.label ? (
          <>
            {item.label} <span className="font-cc-mono text-cc-ink-muted">{item.ref}</span>
          </>
        ) : (
          item.label
        )}
      </span>
    </li>
  );
}

function Callout({ callout }: { callout: BusinessCallout }) {
  const Icon = ICONS[callout.kind];
  const more = callout.count - callout.evidence.length;
  return (
    <li
      data-business-callout={callout.kind}
      data-callout-tone={callout.tone}
      className="flex min-w-0 flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3"
    >
      <div className="flex items-start gap-2">
        <Icon size={16} aria-hidden={true} className={cn('mt-0.5 shrink-0', STATE_CLASSES[callout.tone].text)} />
        <div className="min-w-0">
          <h3 className="m-0 cc-text-h3 text-cc-ink">{calloutTitle(callout)}</h3>
          <p className="m-0 mt-1 cc-text-meta font-medium text-cc-ink-muted">{calloutWhy(callout)}</p>
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {callout.evidence.map((item, i) => (
          <Evidence key={`${item.ref ?? item.label}-${i}`} kind={callout.kind} item={item} />
        ))}
        {more > 0 ? <li className="cc-text-meta font-medium text-cc-ink-muted">{moreEvidence(more)}</li> : null}
      </ul>
    </li>
  );
}

export default function BusinessGlance({ headline, callouts, notDetermined, reading, noSource = false }: BusinessGlanceProps) {
  return (
    <section
      data-business-glance=""
      aria-labelledby="business-glance-title"
      className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]"
    >
      <div className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc md:p-5">
        <p className="m-0 cc-text-label text-cc-ink-muted">{wt('doc.glanceLabel')}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 id="business-glance-title" className="m-0 cc-text-h2 text-cc-ink">{wt('doc.glanceTitle')}</h2>
          <CcProvenanceChip value="reconstructed" />
        </div>
        <p data-glance-headline="" className="m-0 mt-2 cc-text-body text-cc-ink">
          {headline ? glanceHeadlineSentence(headline) : reading ? wt('doc.glanceReading') : wt('doc.glanceNone')}
        </p>
        {callouts.length > 0 ? (
          <ul data-business-callouts="" className="m-0 mt-3 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
            {callouts.map((callout) => (
              <Callout key={callout.kind} callout={callout} />
            ))}
          </ul>
        ) : null}
        {headline ? <p className="m-0 mt-2 cc-text-meta font-medium text-cc-ink-muted">{wt('doc.glanceDerived')}</p> : null}
      </div>

      <aside
        data-glance-not-determined={notDetermined ? String(notDetermined.count) : noSource ? 'no-source' : 'reading'}
        aria-labelledby="glance-not-determined-title"
        className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface-muted p-4 md:p-5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="glance-not-determined-title" className="m-0 cc-text-h2 text-cc-ink">
            {notDetermined ? calloutTitle(notDetermined) : wt('notDetermined.title')}
          </h2>
          <CcProvenanceChip value="not-determined" />
        </div>
        {notDetermined === null ? (
          <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
            {noSource ? wt('doc.notDeterminedNoSource') : wt('doc.notDeterminedReading')}
          </p>
        ) : notDetermined.count === 0 ? (
          <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">{wt('doc.notDeterminedNone')}</p>
        ) : (
          <>
            <p className="m-0 mt-1 cc-text-meta font-medium text-cc-ink-muted">{calloutWhy(notDetermined)}</p>
            <ul data-business-callout="not-determined" className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {notDetermined.evidence.map((item, i) => (
                <Evidence key={`${item.label}-${i}`} kind="not-determined" item={item} />
              ))}
              {notDetermined.count > notDetermined.evidence.length ? (
                <li className="cc-text-meta font-medium text-cc-ink-muted">
                  {moreEvidence(notDetermined.count - notDetermined.evidence.length)}
                </li>
              ) : null}
            </ul>
          </>
        )}
      </aside>
    </section>
  );
}
