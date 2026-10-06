'use client';

import React, { useMemo, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { CcRunCost } from '@/components/cc/RunIndicator';
import TargetEditionChoice from '@/components/TargetEditionChoice';
import AssessmentTargetFields from '@/components/analyze/AssessmentTargetFields';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getAuth } from '@/lib/firebase';
import { declaredTargetOf, normaliseAssessmentTarget, type AssessmentTarget } from '@/lib/assessment-target';
import { signEngineRun, START_NARRATIVE_CEILING_MS } from '@/lib/engine-run';
import { writeStartNarrative, type StartNarrative } from '@/lib/start-narrative';
import { describeRunCost } from '@/lib/run-cost';
import { sourceFileName } from '@/lib/source-file-name';
import { STARTER_EXAMPLES } from '@/lib/starter-examples';
import { staleness } from '@/lib/workflow-steps';
import { bucketMoves, type FitByPlatform, type Loaded } from '@/lib/management-overview';
import {
  normaliseRelease,
  projectTarget,
  sameTarget,
  targetChangeImpact,
  targetChangeNotice,
  targetWords,
  type TargetFacts,
} from '@/lib/target-change';
import type { TargetEdition } from '@/lib/target-edition';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { tgtBucketMove, tgtBucketMoves, tgtChanged, tgtDecisionName, tgtModelOn, wt } from '@/lib/workspace-messages';
import type { Project } from '@/lib/types';

/**
 * The owner's target change in the IT view's profile box (owner, 06.10.2026).
 *
 * Edition and release live in the signed assessment profile, which only
 * `POST /api/runs/create` writes. So this component writes nothing itself: it
 * asks, says what the change does, and then starts a new signed run under the
 * new target through `signEngineRun` — the same request a project's start
 * sends, with the model's narrative when the account's analysis stage is on
 * (`useModelAvailability`, as `useStartRun` decides it) and the engine's
 * reading alone otherwise. The route records the change as a profile change
 * (`auditMetadata.sourceChange`, `reason: 'profile'`), which is what makes the
 * tools built on the old target read as outdated.
 *
 * Two steps in one dialog: choose edition and release; then what the change
 * does — the objects that change bucket (`bucketMoves`, from the same findings
 * the Management view reads), the tools that become outdated and the decision
 * (`targetChangeImpact`, the route's own staleness mechanism run as a preview),
 * and what it costs (`describeRunCost`, the start screens' source). Cancel
 * changes nothing. After the run the page reloads, and `TargetChangeNotice`
 * says what changed, with links to the outdated tools.
 *
 * Offered to the owner only: an invited reader cannot sign a run (the route
 * refuses everyone but the owner), and the demo has no project to change.
 */
export function TargetChangeButton({
  projectId,
  project,
  fit,
}: {
  projectId: string;
  project: Project | null;
  fit: Loaded<FitByPlatform> | null;
}) {
  const [open, setOpen] = useState(false);
  const uid = typeof window === 'undefined' ? null : (getAuth().currentUser?.uid ?? null);
  const owner = !!project && !!uid && project.userId === uid;
  const hasRun = typeof project?.activeRunId === 'string' && project.activeRunId.trim().length > 0;
  const hasSource = typeof project?.legacyCode === 'string' && project.legacyCode.trim().length > 0;
  if (!project || !owner || !hasRun || !hasSource) return null;
  return <OwnerTargetChange projectId={projectId} project={project} fit={fit} open={open} setOpen={setOpen} />;
}

/**
 * The owner's half: the model answer and the account are read with the page,
 * not when the dialog opens, so the cost and the model line are known by the
 * time the owner reaches step 2 (and nobody else's page asks for them).
 */
function OwnerTargetChange({
  projectId,
  project,
  fit,
  open,
  setOpen,
}: {
  projectId: string;
  project: Project;
  fit: Loaded<FitByPlatform> | null;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const model = useModelAvailability();
  const { profile } = useUserProfile();
  return (
    <>
      <CcButton variant="ghost" density="compact" onClick={() => setOpen(true)} data-target-change-open="">
        {wt('tgt.change')}
      </CcButton>
      {open ? (
        <TargetChangeDialog
          projectId={projectId}
          project={project}
          fit={fit}
          model={model}
          profile={profile}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

type Phase = { state: 'idle' } | { state: 'running'; step: 'narrative' | 'signing' } | { state: 'failed'; message: string } | { state: 'done' };

function TargetChangeDialog({
  projectId,
  project,
  fit,
  model,
  profile,
  onClose,
}: {
  projectId: string;
  project: Project;
  fit: Loaded<FitByPlatform> | null;
  model: ReturnType<typeof useModelAvailability>;
  profile: ReturnType<typeof useUserProfile>['profile'];
  onClose: () => void;
}) {
  const current = useMemo(() => projectTarget(project), [project]);
  const declared = useMemo(() => declaredTargetOf(project), [project]);
  const [step, setStep] = useState<1 | 2>(1);
  const [edition, setEdition] = useState<TargetEdition>(current.edition);
  const [target, setTarget] = useState<AssessmentTarget>(declared);
  const [phase, setPhase] = useState<Phase>({ state: 'idle' });
  // As the start decides it (`useStartRun`): the narrative only with the
  // account's analysis stage on and a key available. The confirmation waits
  // for that answer, so what step 2 says is what the run then does.
  const callsModel = model.enabled('analyze');

  const parsed = normaliseAssessmentTarget(target);
  const next: TargetFacts = { edition, release: parsed.ok ? parsed.target.release : normaliseRelease(target.release) };
  const unchanged = sameTarget(current, next);
  const canContinue = parsed.ok && !unchanged;

  // Switching the edition clears a release named for the other one; switching
  // back restores the project's own.
  const chooseEdition = (value: TargetEdition) => {
    setEdition(value);
    setTarget((t) => ({ ...t, release: value === current.edition ? declared.release : '' }));
  };

  const impact = useMemo(() => targetChangeImpact(project), [project]);
  const exampleName =
    project.fromExample === true && STARTER_EXAMPLES.some((e) => e.name === project.name) ? project.name : undefined;
  // The run reads the stored source. Same as the signed one: a target change,
  // free for an example and free as a re-analysis for own code. Changed since:
  // an ordinary analysis of new source, said as one.
  const sourceMoved = staleness(project).sourceChanged;
  const cost = describeRunCost({
    profile,
    metered: true,
    callsModel,
    starterExample: exampleName,
    targetChange: !sourceMoved && !!exampleName,
    sameSourceAgain: !sourceMoved && !exampleName,
  });

  const running = phase.state === 'running' || phase.state === 'done';

  const changeTarget = async () => {
    if (!canContinue || running || cost.blocked || model.loading) return;
    const targetProfile: AssessmentTarget = parsed.ok ? parsed.target : { ...target, release: next.release };
    const fileName = sourceFileName(project) ?? 'main.abap';
    const source = typeof project.legacyCode === 'string' ? project.legacyCode : '';
    try {
      // 1. The narrative, when the model is on — bounded, and never the reason
      //    the run is not signed (the start's rule, `useStartRun`).
      let narrative: StartNarrative | null = null;
      if (callsModel) {
        setPhase({ state: 'running', step: 'narrative' });
        const controller = new AbortController();
        const ceiling = setTimeout(() => controller.abort(), START_NARRATIVE_CEILING_MS);
        try {
          narrative = await Promise.race([
            writeStartNarrative({ projectId, source, fileName, deployment: edition, targetProfile, signal: controller.signal }),
            new Promise<never>((_, reject) => {
              controller.signal.addEventListener('abort', () => reject(new DOMException('ended', 'AbortError')), { once: true });
            }),
          ]);
        } catch {
          narrative = null;
        } finally {
          clearTimeout(ceiling);
        }
      }
      // 2. The one signed run under the new target.
      setPhase({ state: 'running', step: 'signing' });
      await signEngineRun({ projectId, fileName, deployment: edition, targetProfile, narrative });
      setPhase({ state: 'done' });
      window.location.reload();
    } catch (err) {
      setPhase({ state: 'failed', message: err instanceof Error && err.message ? err.message : wt('tgt.failedHeadline') });
    }
  };

  const moves = fit?.state === 'ready' ? bucketMoves(fit.value) : [];
  const fromBucket = (m: (typeof moves)[number]) => (current.edition === 'private' ? m.privateBucket : m.publicBucket);
  const toBucket = (m: (typeof moves)[number]) => (edition === 'private' ? m.privateBucket : m.publicBucket);

  const actions =
    step === 1 ? (
      <>
        <CcButton variant="ghost" onClick={onClose} data-target-change-cancel="">
          {wt('tgt.cancel')}
        </CcButton>
        <CcButton variant="primary" disabled={!canContinue} onClick={() => setStep(2)} data-target-change-next="">
          {wt('tgt.next')}
        </CcButton>
      </>
    ) : (
      <>
        <CcButton variant="ghost" onClick={onClose} disabled={running} data-target-change-cancel="">
          {wt('tgt.cancel')}
        </CcButton>
        <CcButton variant="ghost" onClick={() => setStep(1)} disabled={running} data-target-change-back="">
          {wt('tgt.back')}
        </CcButton>
        <CcButton
          variant="primary"
          busy={running}
          disabled={cost.blocked || model.loading}
          onClick={() => void changeTarget()}
          data-target-change-confirm=""
        >
          {wt('tgt.confirm')}
        </CcButton>
      </>
    );

  return (
    <CcDialog
      open
      title={wt('tgt.dialogTitle')}
      lead={wt('tgt.dialogLead')}
      onClose={running ? () => undefined : onClose}
      actions={actions}
      data-target-change-dialog=""
      data-target-change-step={String(step)}
    >
      <p className="m-0 mb-3 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
        {step === 1 ? wt('tgt.stepChoose') : wt('tgt.stepImpact')}
      </p>
      <dl className="m-0 mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
        <dt className="font-medium text-cc-ink-muted">{wt('tgt.currentLabel')}</dt>
        <dd className="m-0 font-semibold text-cc-ink" data-target-change-current="">
          {targetWords(current)}
        </dd>
        {step === 2 ? (
          <>
            <dt className="font-medium text-cc-ink-muted">{wt('tgt.nextLabel')}</dt>
            <dd className="m-0 font-semibold text-cc-ink" data-target-change-next-target="">
              {targetWords(next)}
            </dd>
          </>
        ) : null}
      </dl>

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <TargetEditionChoice value={edition} onChange={chooseEdition} />
          <AssessmentTargetFields deployment={edition} objects={[]} value={target} onChange={setTarget} />
          {unchanged ? (
            <p data-target-change-unchanged="" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
              {wt('tgt.unchanged')}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-target-change-impact="">
          {/* Buckets — the same derivation the Management view reads. */}
          <section aria-labelledby="tgt-buckets">
            <h3 id="tgt-buckets" className="m-0 text-[13px] font-bold text-cc-ink">
              {wt('tgt.bucketsTitle')}
            </h3>
            {edition === current.edition ? (
              <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('tgt.bucketsSameEdition')}</p>
            ) : !fit || fit.state === 'loading' ? (
              <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('tgt.bucketsReading')}</p>
            ) : fit.state === 'absent' ? (
              <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{fit.reason}</p>
            ) : (
              <>
                <p data-target-change-moves={moves.length} className="m-0 mt-1 text-[13px] font-semibold text-cc-ink">
                  {tgtBucketMoves(targetWords(current), targetWords(next), moves.length)}
                </p>
                {moves.length === 0 ? (
                  <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('tgt.bucketsNone')}</p>
                ) : (
                  <ul className="m-0 mt-1 list-disc pl-5 text-[12px] font-medium text-cc-ink">
                    {moves.map((m) => (
                      <li key={m.objectName} className="[overflow-wrap:anywhere]">
                        {tgtBucketMove(m.objectName, fromBucket(m), toBucket(m))}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          {/* Outdated — the route's staleness mechanism, run as a preview. */}
          <section aria-labelledby="tgt-outdated">
            <h3 id="tgt-outdated" className="m-0 text-[13px] font-bold text-cc-ink">
              {wt('tgt.outdatedTitle')}
            </h3>
            {impact.outdated.length === 0 && !impact.decision ? (
              <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('tgt.outdatedNone')}</p>
            ) : (
              <>
                <ul data-target-change-outdated="" className="m-0 mt-1 list-disc pl-5 text-[12px] font-medium text-cc-ink">
                  {impact.outdated.map((t) => (
                    <li key={t.key} data-target-change-outdated-tool={t.key}>
                      {t.label}
                    </li>
                  ))}
                  {impact.decision ? (
                    <li data-target-change-outdated-tool="decision">
                      {tgtDecisionName(impact.decision.id)}
                      {' — '}
                      {impact.decision.status === 'confirmed' ? wt('tgt.decisionConfirmed') : wt('tgt.decisionDraft')}
                    </li>
                  ) : null}
                </ul>
                <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('tgt.outdatedNote')}</p>
              </>
            )}
          </section>

          {/* Cost — before the click, from the start screens' source. */}
          <section aria-labelledby="tgt-cost">
            <h3 id="tgt-cost" className="m-0 text-[13px] font-bold text-cc-ink">
              {wt('tgt.costTitle')}
            </h3>
            <p className="m-0 mt-1" data-target-change-cost="">
              <CcRunCost cost={cost} />
            </p>
            {/* With the model off the cost line's "No model call" says it all. */}
            {callsModel ? (
              <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {tgtModelOn(Math.round(START_NARRATIVE_CEILING_MS / 1000))}
              </p>
            ) : null}
          </section>

          <div role="status" aria-live="polite" className="min-h-0">
            {phase.state === 'running' ? (
              <p data-target-change-progress={phase.step} className="m-0 text-[13px] font-semibold text-cc-ink">
                {phase.step === 'narrative' ? wt('tgt.stepNarrative') : wt('tgt.stepSigning')}
              </p>
            ) : phase.state === 'done' ? (
              <p data-target-change-progress="done" className="m-0 text-[13px] font-semibold text-cc-ink">
                {wt('tgt.reloading')}
              </p>
            ) : null}
          </div>
          {phase.state === 'failed' ? (
            <div data-target-change-failed="">
              <CcMessageStrip state="error" headline={wt('tgt.failedHeadline')}>
                {phase.message}
              </CcMessageStrip>
            </div>
          ) : null}
        </div>
      )}
    </CcDialog>
  );
}

/**
 * After a target change: what changed, when, and the tools still built for
 * the previous target — read from the server's change record on the project,
 * so it is the same on every device and after every reload.
 */
export function TargetChangeNotice({ projectId, project }: { projectId: string; project: Project | null }) {
  const notice = useMemo(() => targetChangeNotice(project), [project]);
  if (!notice) return null;
  return (
    <div data-target-change-notice="" className="mb-3">
      <CcMessageStrip state="information" headline={tgtChanged(notice.from, notice.to, notice.day)}>
        {notice.outdated.length > 0 || notice.decisionOutdated ? (
          <div>
            <p className="m-0">{wt('tgt.noticeOutdated')}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {notice.outdated.map((t) => (
                <CcLinkButton
                  key={t.key}
                  density="compact"
                  href={stageHref({ base: `/project/${projectId}`, path: t.key, view: 'it', from: WORKSPACE_RETURN.tools })}
                  data-target-change-notice-tool={t.key}
                >
                  {t.label}
                </CcLinkButton>
              ))}
              {notice.decisionOutdated ? (
                <CcLinkButton
                  density="compact"
                  href={`/project/${encodeURIComponent(projectId)}?view=management#decision-card`}
                  data-target-change-notice-tool="decision"
                >
                  {wt('tgt.noticeDecision')}
                </CcLinkButton>
              ) : null}
            </div>
          </div>
        ) : null}
      </CcMessageStrip>
    </div>
  );
}
