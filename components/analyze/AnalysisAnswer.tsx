'use client';

import { HelpCircle } from 'lucide-react';
import CcIconButton from '@/components/cc/IconButton';
import CcButton from '@/components/cc/Button';
import type { AnalysisAnswerText, FindingCounts } from './analysis-answer';

/**
 * The answer of the Analyze stage: one sentence, then four figures (ADR-029,
 * §2.11, mockup s4's facet tiles).
 *
 * The Clean Core Score is shown as what it is — a grade from 0 to 100, "a
 * grade, not a compliance percentage" (DESIGN.md §6.1, glossary B) — and never
 * as a percentage or a ring that fills up to one. Nothing here comes from a
 * model; the page derives every word in `analysis-answer.ts`.
 */
export default function AnalysisAnswer({
  answer,
  counts,
  score,
  routeLabel,
  routeChosenByReader,
  notDetermined,
  onExplainScore,
  onShowNotDetermined,
}: {
  answer: AnalysisAnswerText;
  counts: FindingCounts;
  /** The signed score, or null when the run computed none. */
  score: number | null;
  /** The short route, or null when none is determined. */
  routeLabel: string | null;
  routeChosenByReader: boolean;
  notDetermined: number;
  onExplainScore: () => void;
  onShowNotDetermined: () => void;
}) {
  const critical = counts.bySeverity.Critical;
  const high = counts.bySeverity.High;
  const serious = [critical ? `${critical} critical` : null, high ? `${high} high` : null].filter(Boolean);

  return (
    <section
      data-analysis-answer=""
      aria-labelledby="analysis-answer-title"
      className="rounded-cc-card border border-cc-line bg-cc-surface shadow-cc p-4 sm:p-6"
    >
      <p className="m-0 cc-text-label text-cc-ink-muted">What the analysis found · evidence engine, no model</p>
      <h2 id="analysis-answer-title" className="m-0 mt-1 cc-text-h2 text-cc-ink text-balance">
        {answer.headline}
      </h2>
      <p className="mt-2 cc-text-body text-cc-ink max-w-3xl">{answer.detail}</p>

      <dl className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3 m-0">
        <Figure label="Findings" sub={serious.length ? serious.join(' · ') : 'none rated critical or high'}>
          {counts.total}
        </Figure>

        <Figure
          label="Clean Core Score"
          help={
            <CcIconButton label="What the Clean Core Score is" title="What the Clean Core Score is" onClick={onExplainScore}>
              <HelpCircle size={16} aria-hidden="true" />
            </CcIconButton>
          }
          sub={score !== null ? 'A grade, not a compliance percentage' : 'This run computed no score'}
        >
          {score !== null ? (
            <>
              {score}
              <span className="cc-text-cell text-cc-ink-muted"> of 100</span>
            </>
          ) : (
            'Not yet computed'
          )}
        </Figure>

        <Figure
          label="Extensibility route"
          sub={routeLabel ? (routeChosenByReader ? 'Your choice' : 'Recommended by fixed rules') : 'See the list at the end'}
        >
          {routeLabel ?? 'Not determined'}
        </Figure>

        <Figure
          label="Not determined"
          sub={
            notDetermined > 0 ? (
              <CcButton variant="ghost" density="compact" onClick={onShowNotDetermined}>
                Show the list
              </CcButton>
            ) : (
              'Nothing listed for this run'
            )
          }
        >
          {notDetermined}
        </Figure>
      </dl>
    </section>
  );
}

function Figure({
  label,
  help,
  sub,
  children,
}: {
  label: string;
  help?: React.ReactNode;
  sub: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-3">
      <dt className="flex items-center gap-1 cc-text-label text-cc-ink-muted">
        <span>{label}</span>
        {help}
      </dt>
      <dd className="m-0 mt-1 cc-text-title text-cc-ink break-words">{children}</dd>
      <dd className="m-0 mt-1 cc-text-meta text-cc-ink-muted">{sub}</dd>
    </div>
  );
}
