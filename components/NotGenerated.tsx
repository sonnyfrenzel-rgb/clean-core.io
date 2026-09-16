import { MinusCircle } from 'lucide-react';
import clsx from 'clsx';
import { NOT_GENERATED, modelAbsenceReason, type ModelAbsence, type ModelStage } from '@/lib/model-stages';

/**
 * A section that has no model output, saying so.
 *
 * Roadmap 1.2, acceptance V25-A12: *"'nicht erzeugt' statt leer"*. The failure
 * this replaces is not a crash — it is a screen that renders nothing where an
 * answer belongs, or worse, renders a zero, a dash or an empty card that a
 * reader takes for a measurement. A missing answer is a state, and a state has
 * to be on the screen.
 *
 * Deliberately colourless as far as verdicts go: grey, not red and not green.
 * Nothing failed and nothing succeeded; the section simply was not produced.
 *
 * `data-not-generated` carries the name of the missing part so a rendered guard
 * can find it, and `tests/zero-llm-path.spec.ts` reads the live page rather
 * than this file — a component can always be given a prop that empties it.
 */
export default function NotGenerated({
  what,
  absence = null,
  stage,
  why,
  hint,
  className,
}: {
  /** What is missing, as a noun phrase: "Analysis narrative". */
  what: string;
  /** Why it is missing. `why` overrides the standard sentence for the absence. */
  absence?: ModelAbsence;
  stage?: ModelStage;
  why?: string;
  /** What the reader can do about it, when there is something. */
  hint?: string;
  className?: string;
}) {
  return (
    <div
      data-not-generated={what}
      className={clsx(
        'flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-left',
        className,
      )}
    >
      <MinusCircle size={18} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-bold text-slate-800">
          {NOT_GENERATED} — {what}
        </p>
        <p className="text-xs font-medium leading-relaxed text-slate-600">
          {why ?? modelAbsenceReason(absence, stage)}
        </p>
        {hint && <p className="text-xs font-medium leading-relaxed text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}
