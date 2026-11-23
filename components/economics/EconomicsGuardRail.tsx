import React from 'react';
import CcLinkButton from '@/components/cc/LinkButton';
import FamilyChip from '@/components/family/FamilyChip';
import { OUTSIDE_PRICED_RANGE, type EconomicsGuardRail as Rail } from '@/lib/economics-guard-rail';

/**
 * The slot Design places beside its plan (ADR-128 (6), ECO-N5): the program decision Design works from, and the range
 * Economics priced for it as the guard rail. Read-only, no amount computed here — `lib/economics-guard-rail.ts` reads
 * the stored record through the one money model. `outside` is Design's own reading of its plan
 * (`outsidePricedRange`); when it is true the slot says "Outside the priced range" and leads back to Economics.
 *
 *   ┌ Decision · Rebuild [Yours]                                       [Open Economics] ┐
 *   │ Economics priced Rebuild at EUR 4,700–6,600 over 5 years, on 2–7 days once.       │
 *   └ (Outside the priced range: re-price it in Economics.)                             ┘
 */
export default function EconomicsGuardRail({
  rail,
  economicsHref,
  managementHref,
  outside = null,
}: {
  rail: Rail;
  /** The project's Economics tool, e.g. `/project/{id}/tco`. */
  economicsHref: string;
  /** Where the decision is taken — Management's decision card. */
  managementHref?: string;
  /** Design's plan leaves the priced range (`true`), stays inside (`false`), or cannot be compared (`null`). */
  outside?: boolean | null;
}) {
  const link =
    rail.state === 'no-decision' && managementHref ? (
      <CcLinkButton href={managementHref} variant="secondary">
        Take the decision in Management
      </CcLinkButton>
    ) : (
      <CcLinkButton href={economicsHref} variant={outside ? 'primary' : 'secondary'}>
        {rail.state === 'priced' ? (outside ? 'Re-price in Economics' : 'Open Economics') : 'Price it in Economics'}
      </CcLinkButton>
    );
  return (
    <section
      aria-label="Program decision and its priced range"
      data-economics-guard-rail={rail.state}
      data-economics-guard-rail-outside={outside === null ? undefined : outside ? 'yes' : 'no'}
      className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3"
    >
      <div className="min-w-0 flex-1 basis-[20rem]">
        <p className="m-0 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
          Decision
          {rail.decision ? (
            <>
              <b className="cc-text-cell font-semibold text-cc-ink">{rail.decision.label}</b>
              <FamilyChip kind="yours" note={rail.decision.confirmed ? undefined : 'not signed off'} />
            </>
          ) : (
            <FamilyChip kind="not-determined" />
          )}
          {rail.state === 'priced' ? <FamilyChip kind="simulation" /> : null}
        </p>
        <p className="m-0 mt-1 cc-text-cell text-cc-ink" data-economics-guard-rail-sentence="">
          {rail.sentence}
        </p>
        {outside ? (
          <p className="m-0 mt-1 cc-text-cell font-semibold text-cc-warning" data-economics-guard-rail-outside-note="">
            {OUTSIDE_PRICED_RANGE}
          </p>
        ) : null}
      </div>
      <div className="cc-no-print shrink-0">{link}</div>
    </section>
  );
}
