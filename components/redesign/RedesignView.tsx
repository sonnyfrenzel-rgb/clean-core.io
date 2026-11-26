import React from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import AnswerCard, { type FacetProps } from '@/components/family/AnswerCard';
import CcLinkButton from '@/components/cc/LinkButton';
import { REDESIGN_DECIDE_ID, REDESIGN_STEPS_ID, type RedesignModel, type RedesignStep } from '@/lib/redesign';
import { cn } from '@/lib/utils';

/**
 * The body of Re-design (ADR-143), drawn from its model alone: the answer card with the one primary action, the steps
 * in the one tool order with the decision as step 2, and the column beside them. No data is read here — the project
 * page (`RedesignPage`) and the demo (`DemoRedesign`) each hand their own model, facets and decision step, so the two
 * cannot drift apart in layout or wording.
 */
export default function RedesignView({
  base,
  model,
  facets,
  condition,
  analyzeWords,
  analyzeNote,
  decide,
  indicatedLabel,
  backToAnalyzeHref,
}: {
  /** `/project/{id}` or `/demo`: every tool link is `${base}/${path}`. */
  base: string;
  model: RedesignModel;
  facets: FacetProps[];
  condition: React.ReactNode;
  /** The Analyze row's state words ("Done", "Not signed yet", or the demo's own). */
  analyzeWords: string;
  /** The Analyze row's line under its name. */
  analyzeNote: string;
  /** What the decision step shows under its purpose line. */
  decide: React.ReactNode;
  /** The option the analysis indicates, in words, or null. */
  indicatedLabel: string | null;
  backToAnalyzeHref: string;
}) {
  const hrefOf = (path: string) => (path.startsWith('#') ? path : `${base}/${path}`);
  return (
    <div className="flex flex-col gap-6">
      <AnswerCard
        id="redesign-answer"
        question="Where is the re-design of this program?"
        answer={model.answer}
        condition={condition}
        action={
          model.next ? (
            <CcLinkButton href={hrefOf(model.next.path)} variant="primary" data-redesign-next={model.next.key} data-redesign-done={model.next.done ? '' : undefined}>
              {model.next.label}
              <ArrowRight size={16} aria-hidden={true} />
            </CcLinkButton>
          ) : null
        }
        actionNote={model.next ? model.next.note : null}
        facets={facets}
      />

      <div className="grid grid-cols-1 items-start gap-6 min-[1101px]:grid-cols-[minmax(0,1fr)_340px]">
        <section
          id={REDESIGN_STEPS_ID}
          aria-labelledby={`${REDESIGN_STEPS_ID}-h`}
          className="min-w-0 scroll-mt-24 rounded-cc-card border border-cc-line bg-cc-surface px-5 py-4 shadow-cc max-[720px]:px-4"
        >
          <h2 id={`${REDESIGN_STEPS_ID}-h`} className="m-0 cc-text-h2 text-cc-ink">
            The steps of Re-design
          </h2>
          <p className="m-0 mt-1 max-w-[860px] cc-text-cell text-cc-ink-muted">
            In order. Each state is read from the project; nothing new is stored. Every step stays reachable.
          </p>
          <ol data-redesign-steps="" className="m-0 mt-3 list-none p-0">
            <li data-redesign-step="analyze" data-redesign-step-state={model.analysed ? 'done' : 'open'} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 py-3 max-[720px]:grid-cols-[32px_minmax(0,1fr)]">
              <StepMark state={model.analysed ? 'done' : 'open'} n={0} />
              <div className="min-w-0">
                <Link href={`${base}/analyze`} className="cc-text-body font-bold text-cc-ink underline-offset-2 hover:underline">
                  Analyze
                </Link>
                <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{analyzeNote}</p>
              </div>
              <StateWords step={null} words={analyzeWords} />
            </li>
            {model.steps.map((step) => (
              <li
                key={step.key}
                id={step.key === 'decide' ? REDESIGN_DECIDE_ID : undefined}
                data-redesign-step={step.key}
                data-redesign-step-state={step.state}
                data-redesign-step-next={model.next?.key === step.key ? '' : undefined}
                className={cn(
                  'grid scroll-mt-24 grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 border-t border-cc-line py-3 max-[720px]:grid-cols-[32px_minmax(0,1fr)]',
                  step.key === 'decide' && '-mx-5 border-cc-information-border bg-cc-information-bg px-5 max-[720px]:-mx-4 max-[720px]:px-4',
                )}
              >
                <StepMark state={step.state} n={step.n} now={model.next?.key === step.key} />
                <div className="min-w-0">
                  {step.path ? (
                    <Link href={`${base}/${step.path}`} className="cc-text-body font-bold text-cc-ink underline-offset-2 hover:underline">
                      {step.key === 'tco' ? 'Economics: price the options' : step.label}
                    </Link>
                  ) : (
                    <h3 className="m-0 cc-text-body font-bold text-cc-ink">Decide</h3>
                  )}
                  <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{step.purpose}</p>
                  {step.blocked ? (
                    <p data-redesign-step-blocked="" className="m-0 mt-1 cc-text-cell text-cc-ink">
                      {step.blocked}
                    </p>
                  ) : null}
                  {step.key === 'decide' ? decide : null}
                </div>
                <StateWords step={step} words={step.stateWords} />
              </li>
            ))}
          </ol>
          <p className="m-0 mt-3 cc-text-cell text-cc-ink-muted">
            A decision other than Rebuild builds nothing: once it is confirmed, the steps after it read &ldquo;Not needed&rdquo; and Re-design is
            done. Design still shows what the decided option means for this program.
          </p>
        </section>

        <aside aria-label="Beside the page" className="flex min-w-0 flex-col gap-6 min-[1101px]:sticky min-[1101px]:top-24">
          <div className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc">
            <h2 className="m-0 cc-text-body font-bold text-cc-ink">Where you came from</h2>
            <p className="m-0 mt-1 cc-text-cell text-cc-ink">
              {indicatedLabel ? (
                <>
                  Analyze indicated <span className="font-semibold">{indicatedLabel}</span>: an indication, not a decision.
                </>
              ) : (
                'Analyze reads the program; the evidence does not point to one option yet.'
              )}
            </p>
            <div className="mt-3">
              <CcLinkButton href={backToAnalyzeHref} variant="ghost" data-redesign-back-to-analyze="">
                Back to Analyze
              </CcLinkButton>
            </div>
          </div>
          <div className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc">
            <h2 className="m-0 cc-text-body font-bold text-cc-ink">Accountability</h2>
            <p className="m-0 mt-1 cc-text-cell text-cc-ink">
              The decision and every confirmation are recorded by the signed-in account: a self-declaration, not a mandate. Business, IT and
              Management are views only, never stored on the project, a run or a pack.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepMark({ state, n, now = false }: { state: RedesignStep['state'] | 'open'; n: number; now?: boolean }) {
  const done = state === 'done';
  return (
    <span
      aria-hidden={true}
      className={cn(
        'flex size-[26px] items-center justify-center rounded-full border-2 cc-text-meta font-bold',
        done
          ? 'border-cc-success bg-cc-success-bg text-cc-success'
          : now
            ? 'border-cc-ink bg-cc-ink text-cc-on-dark'
            : 'border-cc-ink-muted bg-cc-surface text-cc-ink-muted',
      )}
    >
      {done ? <Check size={14} /> : n > 0 ? n : null}
    </span>
  );
}

function StateWords({ step, words }: { step: RedesignStep | null; words: string }) {
  return (
    <span
      data-redesign-step-words=""
      className={cn(
        'cc-text-meta font-semibold text-right max-[720px]:col-start-2 max-[720px]:text-left',
        step?.state === 'stale' ? 'text-cc-warning' : 'text-cc-ink-muted',
      )}
    >
      {words}
    </span>
  );
}
