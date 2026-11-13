'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Play } from 'lucide-react';
import StageFrame from '@/components/StageFrame';
import StageHeader from '@/components/StageHeader';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSkeleton from '@/components/cc/Skeleton';
import ProjectNoAccess from '@/components/ProjectNoAccess';
import FirstLook from '@/components/workspace/FirstLook';
import CommandSearch from '@/components/workspace/CommandSearch';
import type { SourceReading } from '@/lib/first-look';
import BusinessNextStep from '@/components/workspace/BusinessNextStep';
import TargetReferenceLine from '@/components/workspace/TargetReferenceLine';
import StartNarrativeMissing from '@/components/workspace/StartNarrativeMissing';
import UsageRecords from '@/components/workspace/UsageRecords';
import { useIsOwner } from '@/components/workspace/BusinessRulesEditor';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useStartRun } from '@/hooks/useStartRun';
import { useOpenQuestions } from '@/hooks/useOpenQuestions';
import { useCustomerTexts } from '@/hooks/useCustomerTexts';
import { useWorkspaceRevision } from '@/hooks/useWorkspaceRevision';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { firstLookSeen, markFirstLookSeen } from '@/lib/first-look';
import { requestProcessWalk } from '@/lib/process-walk-request';
import type { DraftHolder } from '@/lib/process-map-draft';
import { signedSourceOf } from '@/lib/signed-source';
import { engineVersionOfProject } from '@/lib/run-engine-version';
import { notDetermined } from '@/lib/workspace-model';
import { workflowSteps } from '@/lib/workflow-steps';
import { nextOpenPoint, nothingOpenText } from '@/lib/next-step';
import { businessNextStep } from '@/lib/business-next-step';
import { BUSINESS_MAP_ID } from '@/lib/business-layers';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { programSummaryFactsOf } from '@/lib/program-summary-facts';
import { businessInShort, programSummary } from '@/lib/program-summary-text';
import { analyzeLinesFromHash } from '@/lib/analyze-entry';
import { wt } from '@/lib/workspace-messages';
import type { Project } from '@/lib/types';

/** The map and its code panel pull bpmn-js: client only and on demand, as in the workspace. */
const WorkspaceProcess = dynamic(() => import('@/components/workspace/WorkspaceProcess'), { ssr: false });

/**
 * Analyze in the Business view — the page a project opens on (plan
 * `docs/design/analyze-business-first-plan.md` §4.1, AB-2; ADR-109; mockup
 * `docs/roadmap/analyze-business-first-mockup.html`, states 3, 7 and 17).
 *
 * **The map is the page.** Under the stage header (way back to My workspace,
 * the view switch, the seven tools with the soft-gate hint) stand two things:
 * "What this program does" in the engine's own sentence with the invitation —
 * "Walk me through it" (today's tour layer until AB-4) and "I'll look around
 * myself" — and the reconstructed BPMN map from the signed run, with its own
 * tool row (Map | Steps, zoom, fit, Full screen), legend and status below.
 * The code speaks on demand: a step or a line clicked opens its lines in a
 * panel beside the map, never over it, and `#L42` in the address opens the
 * same panel.
 *
 * **No score, no findings, no code before a click** — those are IT's
 * (`?view=it`, today's Analyze page until AB-9).
 *
 * **Interim until release 3.2.0** (release cut of 06.11.2026, so nothing a user had
 * goes missing): today's First insights blocks (`BusinessOpening`, rendered by
 * `FirstLook`, whose paced build-up retired with v3.1.0, AB-3) and `BusinessNextStep` stand unchanged below
 * the map; AB-6 and AB-4 replace them in place.
 *
 * **The start run of ADR-072 lives here** (moved from the workspace page): a
 * project with source and no run, opened with `?first=1` on its first visit,
 * is signed by the engine at once — no model call unless the account's
 * analysis stage is on, as before (`useStartRun`). A later visit offers the
 * start by hand where the map would stand.
 *
 * A project without source has nothing to draw: `fallback` (today's upload
 * and start page) stands instead. An invited reader sees the map with no
 * "Edit" and asks no model (P8): the naming, the plain wording and the start
 * run are the owner's only.
 */
export default function AnalyzeBusiness({
  projectId,
  first,
  draftHolder,
  fallback,
}: {
  projectId: string;
  /** `?first=1`: arrived from a code import or an example — the start run signs at once on the first visit. */
  first: boolean;
  /** The map's unsaved drawing, held by the route so a view switch does not discard it. */
  draftHolder: DraftHolder;
  /** What stands when the project has no source: today's upload and start path (P4). */
  fallback: React.ReactNode;
}) {
  const { profile } = useUserProfile();
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

  /** Read again once the start run is signed, so the map draws from the run (ADR-072). */
  const reload = useCallback(async () => {
    try {
      const loaded = await loadProjectAndHydrate(projectId);
      if (loaded) setProject(loaded);
    } catch {
      /* the next visit reads it */
    }
  }, [projectId]);

  // The start signs by itself only on the first visit after an import or an
  // example (`?first=1`), as the workspace's build-up did; `null` until the
  // browser has been asked, so a second visit never starts it.
  const [autoStart, setAutoStart] = useState<boolean | null>(null);
  useEffect(() => {
    setAutoStart(first && !firstLookSeen(projectId));
  }, [first, projectId]);
  useEffect(() => {
    if (state === 'ready' && autoStart === true) markFirstLookSeen(projectId);
  }, [state, autoStart, projectId]);
  const startRun = useStartRun({ project, projectId, auto: state === 'ready' && autoStart === true, onSigned: reload });

  const signed = useMemo(() => signedSourceOf(project), [project]);
  const owner = useIsOwner(project);
  const stand = useWorkspaceRevision(projectId);
  const open = useMemo(() => notDetermined(project), [project]);
  const questions = useOpenQuestions(project, projectId, { open });
  const steps = useMemo(() => workflowSteps(project), [project]);

  /** What the program does, in the engine's own sentence (`businessInShort`) — no model, no wait. */
  const legacyCode = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const summarySource = signed?.source ?? legacyCode;
  const summaryEngine = engineVersionOfProject(project);
  const customerTexts = useCustomerTexts(projectId || null);
  const inShort = useMemo(() => {
    if (!summarySource.trim()) return null;
    try {
      const facts = programSummaryFactsOf(summarySource, { engineVersion: summaryEngine, customerTexts });
      return businessInShort(programSummary(facts), { codes: false });
    } catch {
      return null;
    }
  }, [summarySource, summaryEngine, customerTexts]);

  /** `#L42` or `#L40-48` in the address, and every line anchor clicked here: the code panel beside the map. */
  const [openLines, setOpenLines] = useState<{ lineStart: number; lineEnd: number; key: number } | null>(null);
  useEffect(() => {
    let asked = 0;
    const read = () => {
      const range = analyzeLinesFromHash(window.location.hash);
      if (range) setOpenLines({ ...range, key: (asked += 1) });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  /**
   * `#process-map` arrives before the map exists — a link from a stage, an old
   * workspace address sent on here (`lib/analyze-entry.ts`), a page still
   * loading — so the browser's own jump finds nothing and the reader stays at
   * the top. Wait for the map, bring it into view, and hold it there for five
   * seconds while the blocks around it settle; a wheel, a touch, a key or a
   * pointer press by the reader ends it at once — the press covers a drag of
   * the scrollbar, which sends no wheel. Moved here from the workspace's
   * Business view with v3.1.0 (AB-2): the map is this page's.
   * (`hooks/useFollowHash.ts` leaves the map's id to this follower.)
   */
  useEffect(() => {
    let frame = 0;
    let stop = false;
    const end = () => {
      stop = true;
    };
    const onMap = () => window.location.hash === `#${BUSINESS_MAP_ID}`;
    const follow = () => {
      // A new hash ends the loop that is running, whatever it points at; only
      // the map's own hash starts another.
      window.cancelAnimationFrame(frame);
      stop = true;
      if (!onMap()) return;
      stop = false;
      const started = performance.now();
      let lastTop: number | null = null;
      const tick = (now: number) => {
        if (stop || !onMap() || now - started > 5000) return;
        const map = document.getElementById(BUSINESS_MAP_ID);
        if (map) {
          const top = Math.round(map.getBoundingClientRect().top);
          if (lastTop === null || Math.abs(top - lastTop) > 1) {
            map.scrollIntoView({ block: 'start' });
            lastTop = Math.round(map.getBoundingClientRect().top);
          }
        }
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    };
    follow();
    window.addEventListener('hashchange', follow);
    window.addEventListener('wheel', end, { passive: true });
    window.addEventListener('pointerdown', end, { passive: true });
    window.addEventListener('touchmove', end, { passive: true });
    window.addEventListener('keydown', end);
    return () => {
      stop = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', follow);
      window.removeEventListener('wheel', end);
      window.removeEventListener('pointerdown', end);
      window.removeEventListener('touchmove', end);
      window.removeEventListener('keydown', end);
    };
  }, []);
  const openAnchor = useCallback((lineStart: number, lineEnd: number) => {
    setOpenLines((prev) => ({ lineStart, lineEnd, key: (prev?.key ?? 0) + 1000 }));
    document.getElementById(BUSINESS_MAP_ID)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  /**
   * The reading of the source the first insights below the map compute, handed up for the project search (⌘K,
   * roadmap 6.6) — the search the workspace's Business view carried until v3.1.0 stands here, where a project opens
   * (mockup state 3: "Search this project" in the shell bar).
   */
  const [reading, setReading] = useState<SourceReading | null>(null);

  /** "I'll look around myself": the invitation steps aside; one quiet line under the map keeps the way in. */
  const [lookingAround, setLookingAround] = useState(false);
  const walk = useCallback(() => requestProcessWalk(projectId), [projectId]);

  // The interim "Next step" bar under the map (until AB-4's two endings).
  const nothingOpen = useMemo(() => nothingOpenText(steps), [steps]);
  const businessStep = useMemo(() => {
    if (!project) return null;
    const point = nextOpenPoint(project, profile);
    const running = point && point.key === 'analyze' && startRun.phase === 'running' ? { ...point, running: true as const } : point;
    return businessNextStep({ point: running, rules: null, owner });
  }, [project, profile, startRun.phase, owner]);
  const givesAwayElsewhere = useMemo(
    () => ({
      documentation: stageHref({ base: `/project/${projectId}`, path: 'documentation', view: 'business', from: WORKSPACE_RETURN.tools }),
      it: `/project/${encodeURIComponent(projectId)}/analyze?view=it`,
    }),
    [projectId],
  );

  if (state === 'missing') return <ProjectNoAccess />;
  if (state === 'failed') {
    return (
      <div data-analyze-business="failed" className="max-w-xl py-16">
        <CcMessageStrip
          state="error"
          headline={wt('abiz.loadFailed')}
          actions={<CcButton onClick={() => window.location.reload()}>{wt('abiz.retry')}</CcButton>}
        >
          {wt('abiz.loadFailedBody')}
        </CcMessageStrip>
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div data-analyze-business="loading" role="status" className="py-16">
        <CcSkeleton shape="text" count={4} label={wt('abiz.loading')} />
      </div>
    );
  }
  // Nothing to draw yet: today's upload and start path (P4).
  if (!legacyCode.trim() && !signed) return <>{fallback}</>;

  const invitation = signed !== null && !lookingAround;

  return (
    <StageFrame stage="analyze" data-analyze-business="ready">
      {/* Search ⌘K: the dialog and its index; its button stands in the shell bar while this is mounted. */}
      <CommandSearch projectId={projectId} project={project} reading={reading} />
      <StageHeader
        tools={{ steps, current: 'analyze' }}
        projectName={project?.name}
        stage="analyze"
        backToMyWorkspace
        toolsNote={wt('abiz.softGate')}
      >
        {wt('abiz.lead')}
      </StageHeader>

      <div className="flex flex-col gap-4">
        {/* What this program does, and the one invitation (mockup state 3). */}
        <section
          data-analyze-summary=""
          data-layout-item=""
          aria-labelledby="analyze-summary-title"
          className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-4 shadow-cc"
        >
          <div className="min-w-0 flex-1 basis-80">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="analyze-summary-title" className="m-0 text-[15px] leading-snug font-bold text-cc-ink">
                {wt('abiz.summaryTitle')}
              </h2>
              {inShort && inShort.length > 0 ? <CcProvenanceChip value="reconstructed" /> : null}
            </div>
            <p data-analyze-summary-text="" className="m-0 mt-1 max-w-3xl text-[14px] leading-relaxed font-medium text-cc-ink">
              {inShort && inShort.length > 0
                ? inShort.map((line, i) => (
                    <React.Fragment key={`${line.key}-${i}`}>
                      <span className="break-words">{line.text}</span>
                      {line.anchors[0] ? (
                        <>
                          {' '}
                          <CcAnchor
                            onOpen={() => openAnchor(line.anchors[0].lineStart, line.anchors[0].lineEnd)}
                            label={`${wt('firstLook.sourceLine')} L${line.anchors[0].lineStart}`}
                          >{`L${line.anchors[0].lineStart}`}</CcAnchor>
                        </>
                      ) : null}
                      {i < inShort.length - 1 ? ' ' : null}
                    </React.Fragment>
                  ))
                : wt('abiz.summaryNone')}
            </p>
          </div>
          {invitation ? (
            <div data-analyze-invitation="" className="cc-no-print flex flex-wrap items-center gap-3 max-[600px]:w-full max-[600px]:flex-col max-[600px]:items-stretch">
              <CcButton variant="primary" icon={<Play size={16} aria-hidden={true} />} onClick={walk} data-analyze-walk="">
                {wt('abiz.walk')}
              </CcButton>
              <CcButton variant="secondary" onClick={() => setLookingAround(true)} data-analyze-look-around="">
                {wt('abiz.lookAround')}
              </CcButton>
            </div>
          ) : null}
        </section>

        {startRun.narrativeMissing ? (
          // Its way to run the narrative again is today's page, in IT.
          <StartNarrativeMissing project={project} projectId={projectId} view="it" missing={startRun.narrativeMissing} />
        ) : null}

        {/* The map: the first block under the summary (mockup states 3, 7, 17). */}
        <div id={BUSINESS_MAP_ID} data-analyze-map="" className="scroll-mt-20" data-workspace-process-block="">
          <WorkspaceProcess
            project={project}
            projectId={projectId}
            view="business"
            notDetermined={open}
            beforeWrite={stand.checkBeforeWrite}
            onWritten={stand.adopt}
            draftHolder={draftHolder}
            startRun={startRun}
            codeOnClick
            openLines={openLines}
          />
          {lookingAround && signed ? (
            <p data-analyze-look-around-line="" className="cc-no-print m-0 mt-2 flex flex-wrap items-center gap-2 text-[13px] leading-snug font-medium text-cc-ink-muted">
              {wt('abiz.lookAroundLine')}
              <CcButton variant="ghost" icon={<Play size={14} aria-hidden={true} />} onClick={walk} data-analyze-walk="later">
                {wt('abiz.walk')}
              </CcButton>
            </p>
          ) : null}
          <UsageRecords project={project} className="mt-4" />
        </div>

        {/* Interim until release 3.2.0: today's First insights blocks and "Next step", unchanged, below the map. */}
        <section data-analyze-interim="" aria-label={wt('abiz.belowTitle')} className="flex flex-col gap-4">
          <FirstLook
            project={project}
            projectId={projectId}
            fullMapBelow={signed !== null}
            rulesBelow
            onReading={setReading}
            questions={questions}
            elsewhere={givesAwayElsewhere}
          />
          {businessStep ? <BusinessNextStep step={businessStep} projectId={projectId} noneText={nothingOpen} /> : null}
          {/* The target and its SAP reference pattern, one line under "Next step" (roadmap 3.0.9, ADR-089),
              as it stood in the workspace's Business view until v3.1.0. */}
          <TargetReferenceLine project={project} />
        </section>
      </div>
    </StageFrame>
  );
}
