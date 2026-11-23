'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import StageFrame from '@/components/StageFrame';
import StageHeader from '@/components/StageHeader';
import AnswerCard, { type FacetProps } from '@/components/family/AnswerCard';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';
import ProjectNoAccess from '@/components/ProjectNoAccess';
import DecisionOptions from '@/components/workspace/DecisionOptions';
import DecisionCard from '@/components/workspace/DecisionCard';
import { useProgramDecision } from '@/hooks/useProgramDecision';
import { useProcessStates } from '@/hooks/useProcessStates';
import { useWorkspaceRevision } from '@/hooks/useWorkspaceRevision';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { workflowSteps } from '@/lib/workflow-steps';
import { pricedOptions } from '@/lib/economics-record';
import { rulesStatus } from '@/lib/rules-editor';
import { formatTextDate } from '@/lib/format';
import { DECISION_OPTION_LABELS } from '@/lib/decision-options';
import type { OptionPlace } from '@/lib/decision-option-signals';
import { REDESIGN_DECIDE_ID, REDESIGN_STEPS_ID, redesignModel, type RedesignStep } from '@/lib/redesign';
import { cn } from '@/lib/utils';
import type { Project } from '@/lib/types';

/**
 * Re-design — `/project/[id]/redesign` (owner request 23.11.2026, ADR-143; mock-up `mgmt-view.html`, screen 2).
 *
 * The way on from Analyze: every "go on" link of Analyze leads here, and from here into the tools. One page for every
 * reader, in the tools' family frame: the answer card ("Where is the re-design of this program?") with the one primary
 * action — the next step — and four facets; then the steps in the one tool order (`PHASES`) with the program decision
 * as step 2, after Economics has priced the options and before Design. Every state is read from the project
 * (`workflowSteps()`, the decision record of ADR-092); nothing is stored here, and no view is.
 *
 * The decision step reuses the workspace's own parts — the four options (`DecisionOptions`, ADR-079) and the decision
 * record (`DecisionCard`, ADR-092) — which write through the commands route by the signed-in account, a
 * self-declaration. Analyze shows the decision read-only.
 */
export default function RedesignPage({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadProjectAndHydrate(projectId);
        if (cancelled) return;
        setProject(loaded);
        setState(loaded ? 'ready' : 'missing');
      } catch (err) {
        if (cancelled) return;
        const code = (err as { code?: unknown } | null)?.code;
        setState(code === 'permission-denied' ? 'missing' : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const [revision, setRevision] = useState(0);
  const onDecisionChanged = useCallback(() => setRevision((r) => r + 1), []);
  const stand = useWorkspaceRevision(projectId);
  const program = useProgramDecision(project, projectId, revision);
  const steps = useMemo(() => workflowSteps(project), [project]);
  const model = useMemo(() => redesignModel(steps, program.state), [steps, program.state]);
  const hasRun = Boolean(project?.activeRunId);
  const rules = useProcessStates(projectId, hasRun && projectId !== '');
  const rulesNow = useMemo(() => rulesStatus(rules.outcome, null), [rules.outcome]);
  const costScenario = useMemo(() => (project?._economics ? pricedOptions(project._economics) : null), [project]);

  if (state === 'missing') return <ProjectNoAccess />;
  if (state === 'failed') {
    return (
      <div data-redesign="failed" className="max-w-xl py-16">
        <CcMessageStrip
          state="error"
          headline="The project could not be read"
          actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}
        >
          Nothing was changed. Reload the page to read it again.
        </CcMessageStrip>
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div data-redesign="loading" role="status" className="py-16">
        <CcSkeleton shape="text" count={4} label="Reading the project" />
      </div>
    );
  }

  const base = `/project/${encodeURIComponent(projectId)}`;
  const hrefOf = (path: string) => (path.startsWith('#') ? path : `${base}/${path}`);
  const runDate = formatTextDate(project?.auditMetadata?.modelCard?.analysisTimestamp);
  const indicated = program.state.indicated;
  const decided = program.state.option;
  const delivery = model.steps.find((s) => s.key === 'delivery');
  const priced = costScenario;

  const facets: FacetProps[] = [
    {
      id: 'decision',
      label: 'Decision',
      value: decided ? DECISION_OPTION_LABELS[decided] : 'Not taken',
      note: decided
        ? program.state.stage === 'confirmed'
          ? 'confirmed'
          : program.state.stage === 'outdated'
            ? 'confirmed, out of date'
            : 'chosen, not confirmed'
        : indicated
          ? `indicated: ${DECISION_OPTION_LABELS[indicated]}`
          : 'step 2',
      href: `#${REDESIGN_DECIDE_ID}`,
    },
    {
      id: 'priced',
      label: 'Options priced',
      value: priced ? `${priced.priced} of ${priced.total}` : 'Not priced yet',
      note: 'step 1, Economics',
    },
    {
      id: 'questions',
      label: 'Business rules confirmed',
      value: rulesNow ? `${rulesNow.confirmed} of ${rulesNow.total}` : 'Not read yet',
      note: 'answered in Design',
    },
    {
      id: 'delivery',
      label: 'Delivery package',
      value: delivery?.state === 'done' ? 'Built' : delivery?.state === 'not-needed' ? 'Not needed' : 'Not built',
      note: 'step 7',
    },
  ];

  const hrefFor = (place: OptionPlace): string => {
    if (place === 'it') return `${base}/analyze?view=it`;
    if (place === 'standard-check') return `${base}?view=it#standard`;
    if (place === 'fit') return `${base}/analyze?view=management`;
    return `${base}/${place}`;
  };

  return (
    <StageFrame stage="redesign" data-redesign="ready">
      <StageHeader tools={{ steps }} project={project} place="redesign">
        Build its clean core successor from the same evidence: priced, decided, designed, built, documented, tested and delivered.
      </StageHeader>

      <div className="flex flex-col gap-6">
        <AnswerCard
          id="redesign-answer"
          question="Where is the re-design of this program?"
          answer={model.answer}
          condition={
            model.analysed
              ? `It builds on the signed analysis run${runDate ? ` of ${runDate}` : ''}. Not counted against your runs.`
              : 'Every step stands on a signed analysis run.'
          }
          action={
            model.next ? (
              <CcLinkButton href={hrefOf(model.next.path)} variant="primary" data-redesign-next={model.next.key}>
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
                  <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                    What it does, how far it is from clean core{runDate ? `: signed run of ${runDate}` : ''}.
                  </p>
                </div>
                <StateWords step={null} words={model.analysed ? 'Done' : 'Not signed yet'} />
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
                    {step.key === 'decide' ? (
                      <DecideStep
                        hasRun={hasRun}
                        indicated={indicated ? DECISION_OPTION_LABELS[indicated] : null}
                        options={
                          hasRun ? (
                            <DecisionOptions
                              view={program.options}
                              hrefFor={hrefFor}
                              mode="project"
                              standardConditions={program.conditions}
                              pending={program.decision.state === 'loading' ? 'reading' : program.decision.state === 'absent' ? 'unreadable' : null}
                              choice={
                                program.choice
                                  ? { ...program.choice, beforeWrite: stand.checkBeforeWrite, onChanged: onDecisionChanged }
                                  : null
                              }
                            />
                          ) : null
                        }
                        record={
                          hasRun ? (
                            <div data-redesign-record="">
                              <DecisionCard
                                projectId={projectId}
                                beforeWrite={stand.checkBeforeWrite}
                                onChanged={onDecisionChanged}
                                costScenario={costScenario}
                                revision={revision}
                              />
                            </div>
                          ) : null
                        }
                      />
                    ) : null}
                  </div>
                  <StateWords step={step} words={step.stateWords} />
                </li>
              ))}
            </ol>
            <p className="m-0 mt-3 cc-text-cell text-cc-ink-muted">
              A decision other than Rebuild builds nothing: the steps after Design read &ldquo;Not needed&rdquo;, and Design still shows what the
              decided option means for this program.
            </p>
          </section>

          <aside aria-label="Beside the page" className="flex min-w-0 flex-col gap-6 min-[1101px]:sticky min-[1101px]:top-24">
            <div className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc">
              <h2 className="m-0 cc-text-body font-bold text-cc-ink">Where you came from</h2>
              <p className="m-0 mt-1 cc-text-cell text-cc-ink">
                {indicated ? (
                  <>
                    Analyze indicated <span className="font-semibold">{DECISION_OPTION_LABELS[indicated]}</span>: an indication, not a decision.
                  </>
                ) : (
                  'Analyze reads the program; the evidence does not point to one option yet.'
                )}
              </p>
              <div className="mt-3">
                <CcLinkButton href={`${base}/analyze?view=management`} variant="ghost" data-redesign-back-to-analyze="">
                  Back to Analyze, Management
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
    </StageFrame>
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

function DecideStep({
  hasRun,
  indicated,
  options,
  record,
}: {
  hasRun: boolean;
  indicated: string | null;
  options: React.ReactNode;
  record: React.ReactNode;
}) {
  if (!hasRun) {
    return <p className="m-0 mt-2 cc-text-cell text-cc-ink">The decision opens once the program is analysed and the run is signed.</p>;
  }
  return (
    <div data-redesign-decide="" className="mt-3 flex flex-col gap-4">
      {indicated ? (
        <p className="m-0 cc-text-cell text-cc-ink">
          The analysis indicates <span className="font-semibold">{indicated}</span>: an indication, not a decision. Price the options in step 1
          before you choose.
        </p>
      ) : null}
      {options}
      {record}
    </div>
  );
}
