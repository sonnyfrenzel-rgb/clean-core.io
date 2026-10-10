'use client';

import React from 'react';
import { Cloud } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
import CcLinkButton from '@/components/cc/LinkButton';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import GlossaryTerm from '@/components/GlossaryTerm';
import ObjectSection from '@/components/analyze/ObjectSection';
import type { RouteDriver } from '@/lib/abap/extensibility-router';
import { BTP, SIDE_BY_SIDE_LABEL, isSideBySideRoute, routeLabel } from '@/lib/sap-naming';

/**
 * The route card of the Analyze side column — proposal A, rebuilt on
 * 10.10.2026 (audit M-2, M-3):
 *
 *   the route and its target · the confidence as a neutral meter · "Driven
 *   off the stack by" with a line anchor per construct · "Holds if" with the
 *   first three assumptions open · one muted line for what the run did not
 *   record · one next action, "Decide in Management".
 *
 * Drivers and assumptions are the router's (`routeDrivers`, `assumptions` in
 * `lib/abap/extensibility-router.ts`), recomputed from the signed run's
 * evidence and shown only when the recomputation arrives at the signed route
 * and score — the caller decides that and passes `derived` or not.
 *
 * There is no route switch here any more. It wrote `extensibilityRoute` from
 * the browser without a reason, and generation stopped following it long ago
 * (`lib/generation-direction.ts`). The route is a recommendation; the program
 * decision — keep, rebuild, move to standard, retire — is made in the
 * Management view (owner decision 10.10.2026), so that is the one action.
 * A project an earlier build's switch left with another route still says so.
 */
export interface RouteCardProps {
  /** The route stored on the project, or null when none was determined. */
  route: string | null;
  /** The stored route is not the recommended one (an earlier build's switch). */
  overridden: boolean;
  /** The recommended route, named when `overridden`. */
  recommended?: string | null;
  /** The recommended route's artefact; not shown beside a route chosen instead. */
  targetArtifact?: string | null;
  /** The confidence the run signed, never a model's number. */
  confidence: number | null;
  /** The router's rationale as recorded, display-ready. */
  rationale: string | null;
  /** `public` / `private`; anything else is said as not specified. */
  deployment?: string | null;
  /**
   * The router's drivers and assumptions for this run's evidence — `null` when
   * they were not derived (no evidence) and `'differs'` when today's engine does
   * not arrive at the signed route and score, which is said instead of showing them.
   */
  derived: { drivers: readonly RouteDriver[]; assumptions: readonly string[] } | 'differs' | null;
  /** What the run did not record about its route — one muted line. */
  notRecorded: readonly string[];
  /** The workspace's Management view, where the program decision is made. */
  decideHref: string;
  /** Opens the source at a line; without it the anchors are plain text. */
  openLine?: (line: number) => void;
  /** The register's anchor for `extensibilityRoute` — the signed project only, not the demo. */
  stageOutput?: boolean;
  /** "Why this route": the decision path, one action deeper (real page only). */
  children?: React.ReactNode;
}

/** How many assumptions stand open; the rest are one action deeper. */
const ASSUMPTIONS_OPEN = 3;

export default function RouteCard({
  route,
  overridden,
  recommended,
  targetArtifact,
  confidence,
  rationale,
  deployment,
  derived,
  notRecorded,
  decideHref,
  openLine,
  stageOutput = false,
  children,
}: RouteCardProps) {
  const btp = route ? isSideBySideRoute(route) : false;
  const drivers = derived && derived !== 'differs' && !overridden ? derived.drivers : null;
  const assumptions = derived && derived !== 'differs' && !overridden ? derived.assumptions : null;

  return (
    <ObjectSection
      side
      title="Extensibility route"
      data-route-card=""
      right={overridden ? <CcProvenanceChip value="confirmed" note="your choice" /> : <CcProvenanceChip value="reconstructed" note="fixed rules" />}
    >
      <div className="flex items-center gap-3 rounded-cc-card border border-cc-line bg-cc-surface-muted p-3">
        <span aria-hidden={true} className="grid h-10 w-10 shrink-0 place-items-center rounded-cc-card border border-cc-line bg-cc-surface text-cc-ink">
          <Cloud size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          {route ? (
            <span data-stage-output={stageOutput ? 'extensibilityRoute' : undefined} className="cc-text-h3 text-cc-ink">
              {btp ? (
                <GlossaryTerm termKey="SAP BTP" className="border-b-0 text-cc-ink">{SIDE_BY_SIDE_LABEL}</GlossaryTerm>
              ) : (
                <GlossaryTerm termKey="RAP" className="border-b-0 text-cc-ink">ABAP Cloud (RAP)</GlossaryTerm>
              )}
            </span>
          ) : (
            <span className="cc-text-h3 text-cc-ink">Not determined</span>
          )}
          {route ? (
            <p data-route-target="" className="m-0 mt-1 cc-text-meta text-cc-ink-muted">
              {/* After a switch, the recommended route's artefact is not the target
                  (QA full review of fc787674705f, 08fd882e60b3). */}
              Target: {(!overridden && targetArtifact) || (btp
                ? <GlossaryTerm termKey="CAP" className="border-b-0 text-cc-ink">{`${BTP} Node.js App (CAP)`}</GlossaryTerm>
                : <GlossaryTerm termKey="RAP" className="border-b-0 text-cc-ink">RAP Business Object</GlossaryTerm>)}
            </p>
          ) : null}
        </div>
      </div>

      {overridden ? (
        // The confidence and the reasoning belong to the route that was
        // recommended. Printed beside a route the user switched to, they read
        // as support for the opposite decision (QA review of 33471220d6e9,
        // 210bafeb4c8b).
        <>
          <p className="m-0 mt-2 cc-text-meta font-semibold text-cc-ink">Chosen by you</p>
          <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
            You changed this route. The recommendation was{' '}
            <span className="font-semibold text-cc-ink">{routeLabel(recommended ?? '')}</span>
            {confidence !== null ? ` at ${confidence}% confidence` : ''}
            {rationale ? `: ${rationale}` : '.'}
          </p>
        </>
      ) : (
        <>
          {confidence !== null ? (
            // A measurement, not a proof and not a warning: neutral ink, no
            // traffic colour (DESIGN.md §1.8).
            <div className="mt-3 flex items-center gap-2" data-route-confidence={confidence}>
              <span className="cc-text-label text-cc-ink-muted">Confidence</span>
              <span
                aria-hidden={true}
                className="h-2 w-24 overflow-hidden rounded-full border border-cc-line bg-cc-surface-muted"
              >
                <span className="block h-full rounded-full bg-cc-neutral" style={{ width: `${Math.max(0, Math.min(100, confidence))}%` }} />
              </span>
              <span className="cc-text-meta font-semibold text-cc-ink">{confidence}%</span>
            </div>
          ) : null}
          {rationale ? <p className="m-0 mt-2 cc-text-cell text-cc-ink">{rationale}</p> : null}
        </>
      )}

      {drivers ? (
        <p className="m-0 mt-3 cc-text-cell text-cc-ink" data-route-drivers={drivers.length}>
          {drivers.length === 0 ? (
            'Nothing the engine found forces it off the stack.'
          ) : (
            <>
              Driven off the stack by{' '}
              {drivers.map((d, i) => (
                <React.Fragment key={d.kind}>
                  {i > 0 ? (i === drivers.length - 1 ? ' and ' : ', ') : null}
                  {d.label}{' '}
                  <CcAnchor
                    label={`Source line ${d.firstLine}${openLine ? ', open the source' : ''}`}
                    onOpen={openLine ? () => openLine(d.firstLine) : undefined}
                  >{`L${d.firstLine}`}</CcAnchor>
                  {d.count > 1 ? <span className="cc-text-meta text-cc-ink-muted">{` +${d.count - 1}`}</span> : null}
                </React.Fragment>
              ))}
              .
            </>
          )}
        </p>
      ) : null}

      {assumptions && assumptions.length > 0 ? (
        <div className="mt-3" data-route-assumptions={assumptions.length}>
          <h3 className="m-0 cc-text-label text-cc-ink-muted">Holds if</h3>
          <ul className="m-0 mt-1 list-none space-y-1 p-0">
            {assumptions.slice(0, ASSUMPTIONS_OPEN).map((a) => (
              <li key={a} className="flex items-start gap-2 cc-text-cell text-cc-ink">
                <span aria-hidden={true} className="mt-1 h-2 w-2 shrink-0 rounded-full border border-cc-ink-muted" />
                <span className="min-w-0">{a}</span>
              </li>
            ))}
          </ul>
          {assumptions.length > ASSUMPTIONS_OPEN ? (
            <CcDisclosure title={`${assumptions.length - ASSUMPTIONS_OPEN} more`}>
              <ul className="m-0 mt-1 list-none space-y-1 p-0">
                {assumptions.slice(ASSUMPTIONS_OPEN).map((a) => (
                  <li key={a} className="flex items-start gap-2 cc-text-cell text-cc-ink">
                    <span aria-hidden={true} className="mt-1 h-2 w-2 shrink-0 rounded-full border border-cc-ink-muted" />
                    <span className="min-w-0">{a}</span>
                  </li>
                ))}
              </ul>
            </CcDisclosure>
          ) : null}
        </div>
      ) : null}

      {derived === 'differs' && !overridden ? (
        <p className="m-0 mt-3 cc-text-meta font-medium text-cc-ink-muted" data-route-derived="differs">
          What drives the route and what it assumes are not shown: today’s engine does not arrive at the route and
          score this run signed. A new run records them.
        </p>
      ) : null}

      {notRecorded.length > 0 ? (
        <p className="m-0 mt-3 cc-text-meta font-medium text-cc-ink-muted" data-route-not-recorded={notRecorded.length}>
          Not recorded for this run: {notRecorded.join(', ')}.
        </p>
      ) : null}

      <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
        Target system:{' '}
        {deployment === 'public' ? 'S/4HANA Public Cloud' : deployment === 'private' ? 'Private Cloud / RISE' : 'not specified'}
      </p>

      <div className="mt-3" data-route-next="">
        <CcLinkButton href={decideHref} variant="secondary" density="compact">
          Decide in Management
        </CcLinkButton>
        <p className="m-0 mt-1 cc-text-meta font-medium text-cc-ink-muted">
          Keep, rebuild, move to standard or retire — the program decision is made there.
        </p>
      </div>

      {children}
    </ObjectSection>
  );
}
