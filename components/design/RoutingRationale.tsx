'use client';

import { useMemo } from 'react';
import { ArrowRight, Shield, BarChart3, Zap, AlertTriangle, Cloud, Code2 } from 'lucide-react';
import type { SupportFinding } from '@/lib/abap/class-model';
import SupportLevelMark from '@/components/analyze/SupportLevelMark';
import { bandRange, scoreBand } from '@/lib/clean-core-score';
import { BTP, SIDE_BY_SIDE_LABEL, isSideBySideRoute } from '@/lib/sap-naming';
import type { TargetArchitectureCode } from '@/lib/project-commands';
import { REFERENCE_OF_TARGET, REFERENCE_WORDING, eventSourceSentence } from '@/lib/sap-reference-architectures';
import { SapReferenceList } from '@/components/design/SapReference';

interface RoutingRationaleProps {
  /** Optional: absent on runs created before the extensibility router (pre-v1.14). */
  extensibilityRoute?: string;
  cleanCoreScore?: number;
  s4Deployment?: 'public' | 'private';
  /** Optional: defaults to [] — never crash the page on legacy runs. */
  findings?: SupportFinding[];
  /**
   * The target the "SAP reference" row names (roadmap 3.0.9): the signed-off
   * target, else the recommendation. Without it the row reads the route —
   * `cap` side-by-side, `rap` in-app. The row only reads the target; it never
   * changes the route, its drivers or the score.
   */
  targetArchitecture?: TargetArchitectureCode | null;
}

/**
 * "Why This Routing" panel — binds the Design decision back to Analyze evidence.
 * Shows the route badge, Clean Core Score, deployment target, and the top
 * deterministic findings that drove the routing decision.
 */
export default function RoutingRationale({
  extensibilityRoute,
  cleanCoreScore,
  s4Deployment,
  findings = [],
  targetArchitecture = null,
}: RoutingRationaleProps) {
  // Guard: legacy projects/runs analyzed before the extensibility router carry no
  // route on the run document. Render nothing instead of crashing the page —
  // consistent with every other design section component.
  // Pick the top 4 most impactful findings (not-supported first, then partial).
  // This runs before the early return below: a project loads asynchronously, so
  // the same component instance renders once without a route and again with one.
  // With the guard above the hook, React sees a different hook count on the
  // second render and throws instead of quietly showing nothing.
  const keyFindings = useMemo(() => {
    const sorted = [...findings].sort((a, b) => {
      const order = { 'not-supported': 0, 'partial': 1, 'fully': 2 };
      return (order[a.level] ?? 2) - (order[b.level] ?? 2);
    });
    return sorted.slice(0, 4);
  }, [findings]);

  if (!extensibilityRoute) return null;

  const isBtp = isSideBySideRoute(extensibilityRoute);
  const target: TargetArchitectureCode = targetArchitecture ?? (isBtp ? 'cap' : 'rap');

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="cc-text-label text-cc-ink-muted">Routing Rationale</span>
        <span className="cc-text-meta text-cc-ink-muted">— Design ↔ Analyze Evidence Binding</span>
      </div>
      <h4 className="cc-text-h2 text-cc-ink mb-6">Why This Architecture Was Chosen</h4>

      {/* Key metrics row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {/* Route */}
        <div className="bg-cc-surface-muted border border-cc-line rounded-cc-row p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
            <span className="cc-text-label text-cc-ink-muted">Extensibility Route</span>
          </div>
          <span className="inline-flex items-center gap-2 cc-text-h3 text-cc-ink">
            {isBtp ? <Cloud className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" /> : <Code2 className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />}
            {isBtp ? SIDE_BY_SIDE_LABEL : 'ABAP Cloud (RAP)'}
          </span>
        </div>

        {/* Score */}
        <div className="bg-cc-surface-muted border border-cc-line rounded-cc-row p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
            <span className="cc-text-label text-cc-ink-muted">Clean Core Score</span>
          </div>
          {/* A grade out of 100 with Clean-Core.io's band — never a percentage. */}
          <span className="text-[22px] font-bold leading-tight text-cc-ink tabular-nums">
            {typeof cleanCoreScore === 'number' ? `${cleanCoreScore} of 100` : 'Not determined'}
          </span>
          {typeof cleanCoreScore === 'number' ? (
            <span className="mt-1 block cc-text-meta text-cc-ink-muted">
              {scoreBand(cleanCoreScore).label} ({bandRange(scoreBand(cleanCoreScore))})
            </span>
          ) : null}
        </div>

        {/* Deployment */}
        <div className="bg-cc-surface-muted border border-cc-line rounded-cc-row p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
            <span className="cc-text-label text-cc-ink-muted">Target Deployment</span>
          </div>
          <span className="cc-text-h3 text-cc-ink">
            {/* An undefined deployment used to render as "Private Cloud (RISE)" —
                a specific claim about the customer's landscape, made because a
                value was missing. */}
            {s4Deployment === 'public'
              ? 'Public Cloud'
              : s4Deployment === 'private'
                ? 'Private Cloud (RISE)'
                : 'Not specified'}
          </span>
        </div>
      </div>

      {/* SAP reference (roadmap 3.0.9, ADR-089): the pattern SAP documents for
          the target — badge, linked title, SAP's date, and the reason beside
          the badge, not in a tooltip. Read after the route, never before it. */}
      <div data-routing-sap-reference={target} className="mb-8 bg-cc-surface-muted border border-cc-line rounded-cc-row p-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
          <span className="cc-text-label text-cc-ink-muted">SAP reference</span>
          <span className="cc-text-meta text-cc-ink-muted">— {REFERENCE_WORDING}, not a statement by SAP about this code</span>
        </div>
        <SapReferenceList bindings={REFERENCE_OF_TARGET[target]} />
        {target === 'event' ? (
          <p data-routing-event-source="" className="m-0 mt-2 cc-text-cell text-cc-ink">
            {eventSourceSentence(s4Deployment)}
          </p>
        ) : null}
      </div>

      {/* Key evidence findings */}
      {keyFindings.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
            <span className="cc-text-label text-cc-ink-muted">
              Key Evidence Driving This Decision
            </span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {keyFindings.map((f, idx) => (
              <li
                key={idx}
                className="bg-cc-surface border border-cc-line rounded-cc-row px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="cc-text-h3 text-cc-ink truncate">{f.title}</span>
                  <SupportLevelMark level={f.level} />
                </div>
                <p className="cc-text-cell text-cc-ink-muted mt-1 line-clamp-2">
                  {f.recommendation}
                </p>
              </li>
            ))}
          </ul>

          {findings.length > 4 && (
            <p className="cc-text-meta text-cc-ink-muted mt-3 text-right">
              + {findings.length - 4} more findings from code analysis
            </p>
          )}
        </div>
      )}

      {/* Summary rationale */}
      <div className="mt-6 bg-cc-surface-muted border border-cc-line rounded-cc-row p-4">
        <div className="flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-cc-ink-muted shrink-0" aria-hidden="true" />
          <p className="cc-text-cell text-cc-ink">
            {isBtp ? (
              <>The analysis identified constructs requiring side-by-side decoupling (dynamic calls, BAdI enhancements, or screen flows).
              An <strong className="font-semibold">{`${BTP} CAP extension`}</strong> preserves core integrity while enabling full custom logic outside the ERP boundary.</>
            ) : (
              <>The analysis confirmed high standard-fit compatibility with no blocking constructs.
              An <strong className="font-semibold">on-stack RAP extension</strong> maximizes reuse of existing CDS views, business logic, and transactional boundaries.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
