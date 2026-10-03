'use client';

import React from 'react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import FoldedSection from '@/components/analyze/FoldedSection';
import BusinessValueAudit from '@/components/analyze/BusinessValueAudit';
import PlainEnglishGuide from '@/components/analyze/PlainEnglishGuide';
import { readStoredAnalysis } from '@/lib/money-honesty';
import { modelActionPlan } from '@/lib/action-plan';
import { routeLabel } from '@/lib/sap-naming';
import type { AnalysisData } from '@/lib/types';

/**
 * "Business value and action plan · Model proposal" — on Economics since
 * 02.10.2026 (owner decision on the Analyze clean-up). It used to be the last
 * fold of the Analyze stage, where it answered none of that stage's four
 * questions (how clean, what must change and where, which way, what is not
 * known). Economics is where a reader weighs keeping, changing or retiring the
 * code, and the model's view of what the code is worth and what to do first
 * belongs next to that — folded, and marked as the model's.
 *
 * Nothing in it is priced: the stored narrative is read through the one shared
 * reader, which masks every amount (`lib/money-honesty.ts`), and the cost line
 * says "not determined" (`BusinessValueAudit`). The figures this stage prices
 * are the reader's own, above.
 *
 * Three cases, each said as itself:
 *   - a narrative with a plan: the model's assessment and plan, marked proposed;
 *   - a narrative without a plan: the assessment, and the page's generic
 *     guidance said to be generic — the same for every analysis;
 *   - no narrative (a run without a model): "not generated", never a stand-in.
 */
export default function BusinessValuePlan({
  analysis,
  route,
}: {
  /** `project.analysis` as stored — any stored shape. */
  analysis: unknown;
  /** The route the project carries now, for the generic guidance's last step. */
  route: string | null | undefined;
}) {
  const data = analysis ? readStoredAnalysis<AnalysisData>(analysis) : null;
  // Decided once, through the helper: the fallback, the origin line and the
  // chip below all read `plan`, never the raw field (QA 44adc3b1d5b0).
  const plan = data ? modelActionPlan(data.businessValueAnalysis?.plainEnglishActionPlan) : null;
  const shownRoute = routeLabel(route || data?.extensibilityRouting?.recommendedRoute || 'Decoupled Extension');

  // Nothing to show is shown as nothing (owner, 03.10.2026): there is no
  // button that writes the assessment here, so an empty "Not generated" box
  // only asked a question the page cannot answer. A run with the model's
  // narrative — the start writes it when the model is on (ADR-072) — fills it.
  if (!data) return null;

  let body: React.ReactNode;
  {
    const biz = {
      legacyAssetScore: data.businessValueAnalysis?.legacyAssetScore ?? null,
      // The model's own level, or none — never a second reading of the score.
      technicalDebtLevel: data.businessValueAnalysis?.technicalDebtLevel ?? null,
      valueDrivers: data.businessValueAnalysis?.valueDrivers ?? null,
    };
    const steps = plan ?? [
      '1. Align redundant custom code logic with native S/4HANA Standard processes via S/4HANA Best Practice configuration.',
      '2. Decommission custom data workarounds and obsolete validation routines that are fully standard in S/4HANA.',
      `3. Decouple unique, high-value custom intellectual property into a modern, upgrade-stable ${shownRoute} architecture.`,
    ];
    body = (
      <>
        <BusinessValueAudit bizFallback={biz} />
        <div className="space-y-3">
          <div data-action-plan-origin={plan ? 'model' : 'generic'} className="flex flex-wrap items-center gap-2">
            <span className="cc-text-label text-cc-ink-muted">Action plan</span>
            {plan ? (
              <CcProvenanceChip value="proposed" />
            ) : (
              <span className="cc-text-meta text-cc-ink-muted">
                Generic guidance — no action plan was returned for this run. The steps are the same for every analysis, not derived from this code.
              </span>
            )}
          </div>
          <PlainEnglishGuide plainEnglishActionPlan={steps} extensibilityRoute={shownRoute} />
        </div>
      </>
    );
  }

  return (
    <FoldedSection
      id="economics-business-value"
      data-business-value-plan={!data ? (analysis ? 'text-report' : 'not-generated') : plan ? 'model' : 'generic'}
      title="Business value and action plan"
      aside={data ? <CcProvenanceChip value="proposed" /> : undefined}
    >
      {body}
    </FoldedSection>
  );
}
