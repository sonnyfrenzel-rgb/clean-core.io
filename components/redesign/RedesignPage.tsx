'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import StageFrame from '@/components/StageFrame';
import StageHeader from '@/components/StageHeader';
import { type FacetProps } from '@/components/family/AnswerCard';
import RedesignView from '@/components/redesign/RedesignView';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';
import ProjectNoAccess from '@/components/ProjectNoAccess';
import DecisionOptions from '@/components/workspace/DecisionOptions';
import DecisionCard from '@/components/workspace/DecisionCard';
import { useProgramDecision } from '@/hooks/useProgramDecision';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useProcessStates } from '@/hooks/useProcessStates';
import { useNeedProcessLine } from '@/hooks/useNeedProcessLine';
import { useWorkspaceRevision } from '@/hooks/useWorkspaceRevision';
import { useFollowHash } from '@/hooks/useFollowHash';
import WorkspaceRevisionStand from '@/components/workspace/RevisionStand';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { workflowSteps } from '@/lib/workflow-steps';
import { pricedOptions } from '@/lib/economics-record';
import { rulesStatus } from '@/lib/rules-editor';
import { formatTextDate } from '@/lib/format';
import { DECISION_OPTION_LABELS } from '@/lib/decision-options';
import type { OptionPlace } from '@/lib/decision-option-signals';
import { REDESIGN_DECIDE_ID, redesignModel } from '@/lib/redesign';
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
  // `#decide` (Analyze's way into the decision) arrives before the step exists: the page reads the project first, so
  // the browser's own jump finds nothing. The follow waits for the place and brings it into view.
  useFollowHash();

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
  // The account's own model switches: a step a switched-off model would write says so (as the "Next step" rule did).
  const { profile } = useUserProfile();
  const model = useMemo(() => redesignModel(steps, program.state, profile), [steps, program.state, profile]);
  const hasRun = Boolean(project?.activeRunId);
  const rules = useProcessStates(projectId, hasRun && projectId !== '');
  const rulesNow = useMemo(() => rulesStatus(rules.outcome, null), [rules.outcome]);
  // The decision's Need row says the process the map counts, in one line (ADR-087).
  const processLine = useNeedProcessLine(project, rules.outcome);
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
      <StageHeader
        tools={{ steps }}
        project={project}
        place="redesign"
        // The Stand this page was drawn from, and the notice when it has moved (CR-15): the decision step writes, and
        // a write the Stand holds back must say so rather than do nothing.
        eyebrow={<WorkspaceRevisionStand held={stand.held} seen={stand.seen} moved={stand.moved} onKeep={stand.keep} onRefresh={stand.refresh} />}
      >
        Build its clean core successor from the same evidence: priced, decided, designed, built, documented, tested and delivered.
      </StageHeader>

      <RedesignView
        base={base}
        model={model}
        facets={facets}
        condition={
          model.analysed
            ? `It builds on the signed analysis run${runDate ? ` of ${runDate}` : ''}. Not counted against your runs.`
            : 'Every step stands on a signed analysis run.'
        }
        analyzeWords={model.analysed ? 'Done' : 'Not signed yet'}
        analyzeNote={`What it does, how far it is from clean core${runDate ? `: signed run of ${runDate}` : ''}.`}
        indicatedLabel={indicated ? DECISION_OPTION_LABELS[indicated] : null}
        backToAnalyzeHref={`${base}/analyze?view=management`}
        decide={
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
                    process={processLine}
                  />
                </div>
              ) : null
            }
          />
        }
      />
    </StageFrame>
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
