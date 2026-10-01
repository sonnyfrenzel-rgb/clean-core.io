'use client';

interface PlainEnglishGuideProps {
  plainEnglishActionPlan: string[];
  extensibilityRoute: string;
}

/**
 * The action plan as numbered steps. Whether the steps are the model's or the
 * page's generic guidance is said by the page directly above this list (the
 * component cannot tell); the list itself makes no claim of either kind, so it
 * carries no "Executive summary" or "Business roadmap" label that would dress
 * generic guidance up as a finding of this run.
 */
export default function PlainEnglishGuide({ plainEnglishActionPlan, extensibilityRoute }: PlainEnglishGuideProps) {
  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-4 sm:p-6">
      <ol className="m-0 p-0 list-none space-y-3">
        {plainEnglishActionPlan.map((action, aIdx) => (
          <li key={aIdx} className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 flex items-start gap-3">
            <span className="w-8 h-8 rounded-cc-row border border-cc-line bg-cc-surface text-cc-ink flex items-center justify-center shrink-0 cc-text-identifier">{aIdx + 1}</span>
            <p className="m-0 cc-text-body text-cc-ink pt-1">{action.replace(/^\d+\.\s*/, '')}</p>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-4 cc-text-meta text-cc-ink-muted">Route these steps assume: {extensibilityRoute}</p>
    </div>
  );
}
