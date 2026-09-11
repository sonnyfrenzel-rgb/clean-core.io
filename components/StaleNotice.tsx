import { AlertTriangle } from 'lucide-react';

/**
 * Says why something on this page was built for a previous source, and what
 * has to be regenerated first (roadmap E01-F01-US02).
 *
 * Renders nothing when there is nothing to say. The reasons come from
 * `generationBlockers` / `handoverBlockers` in `lib/workflow-steps.ts`, the same
 * contract the stepper and the rail read, so this box and the amber-or-red
 * circle above it cannot disagree.
 */
export default function StaleNotice({ title, reasons }: { title: string; reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <div
      role="alert"
      data-stale-notice
      className="mb-8 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 shadow-sm"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <ul className="mt-1 space-y-0.5 text-sm leading-relaxed">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
