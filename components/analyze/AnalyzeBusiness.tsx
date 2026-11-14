'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Info, Play } from 'lucide-react';
import StageFrame from '@/components/StageFrame';
import StageHeader from '@/components/StageHeader';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';
import ProjectNoAccess from '@/components/ProjectNoAccess';
import AroundTheMap, { WhatThisProgramDoes } from '@/components/analyze/AroundTheMap';
import AnalyzeEndings from '@/components/analyze/AnalyzeEndings';
import WhatNextCard from '@/components/analyze/WhatNextCard';
import CommandSearch from '@/components/workspace/CommandSearch';
import type { WalkState } from '@/components/workspace/WorkspaceProcess';
import type { ToolClick } from '@/components/workspace/ToolBar';
import TargetReferenceLine from '@/components/workspace/TargetReferenceLine';
import StartNarrativeMissing from '@/components/workspace/StartNarrativeMissing';
import UsageRecords from '@/components/workspace/UsageRecords';
import ProcessFactCharts from '@/components/analyze/ProcessFactCharts';
import { useIsOwner } from '@/components/workspace/BusinessRulesEditor';
import { useStartRun } from '@/hooks/useStartRun';
import { useAroundTheMap } from '@/hooks/useAroundTheMap';
import { useWorkspaceRevision } from '@/hooks/useWorkspaceRevision';
import { useAnalyzeProgress } from '@/hooks/useAnalyzeProgress';
import { analyzeStage, softGateShown, walkedDayLabel, whatNextShown } from '@/lib/analyze-progress';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { mapFollowGoesOn } from '@/lib/map-follow';
import { firstLookSeen, markFirstLookSeen } from '@/lib/first-look';
import { requestProcessWalk } from '@/lib/process-walk-request';
import type { DraftHolder } from '@/lib/process-map-draft';
import { signedSourceOf } from '@/lib/signed-source';
import { notDetermined } from '@/lib/workspace-model';
import { workflowSteps } from '@/lib/workflow-steps';
import { myWorkspaceHref } from '@/lib/workspace-back-href';
import { BUSINESS_MAP_ID } from '@/lib/business-layers';
import { RULE_QUESTIONS_ID } from '@/lib/rule-questions';
import { analyzeLinesFromHash } from '@/lib/analyze-entry';
import { takeRedesignAfterAnalysis } from '@/lib/home-start-handoff';
import { gateBody, gateContinue, gateLabel, walkedAll, walkedOnDay, wt } from '@/lib/workspace-messages';
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
 * **The text around the map** (AB-6, release 3.2.0; ADR-116): *What this program
 * does* above the map, and under it *How it runs*, *Why it exists*, *Who is
 * involved* and *Questions to settle with the business* (`AroundTheMap`, read by
 * `useAroundTheMap`), every sentence with its line. It replaced the interim First
 * insights blocks (`FirstLook`, `BusinessOpening`) of 3.1.0.
 *
 * **The walk-through and what follows it** (AB-4, release 3.2.0; ADR-118; mockup
 * states 4, 5, 6, 9, 9b, 10 and 17): "Walk me through it" runs the tour on the
 * page where the map stands (`ProcessTour` `inline`); the summary steps aside and
 * "How it runs" says "you are here". Its last card shows the two equal endings
 * (`AnalyzeEndings`). Once it was finished in this browser the soft-gate hint
 * goes, the summary carries the endings, and under the text stand the endings in
 * full and "What you can do next" (`WhatNextCard`), which "Hide" takes away for
 * this project. A later tool clicked before the walk-through holds for one calm
 * note — never a lock. All of it lives in the browser (`lib/analyze-progress.ts`):
 * no write, no phase change.
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

  const router = useRouter();
  /** Read again once the start run is signed, so the map draws from the run (ADR-072). */
  const reload = useCallback(async () => {
    // "Re-design an example end to end" (ADR-123, W4): the analysis is signed,
    // so Design opens on its result instead of Analyze. Taken once.
    if (takeRedesignAfterAnalysis(projectId)) {
      router.push(`/project/${encodeURIComponent(projectId)}/design`);
      return;
    }
    try {
      const loaded = await loadProjectAndHydrate(projectId);
      if (loaded) setProject(loaded);
    } catch {
      /* the next visit reads it */
    }
  }, [projectId, router]);

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
  const steps = useMemo(() => workflowSteps(project), [project]);
  const legacyCode = typeof project?.legacyCode === 'string' ? project.legacyCode : '';

  /**
   * The text around the map (AB-6): what the program does above it, how it runs, why it exists, who is involved
   * and the questions for the business below it — read once, after the first paint, from the same source. Only the
   * owner's visit may ask for a plain wording (P8).
   */
  const around = useAroundTheMap({ project, projectId, owner, source: signed?.source ?? legacyCode });

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
   * Business view with 3.1.0 (AB-2): the map is this page's.
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
      // The five seconds start when the map stands on the page, not when the address asked for it: the map
      // is drawn only after the project and its run are loaded (`lib/map-follow.ts`).
      const asked = performance.now();
      let seen: number | null = null;
      let lastTop: number | null = null;
      const tick = (now: number) => {
        if (stop || !onMap() || !mapFollowGoesOn(asked, seen, now)) return;
        const map = document.getElementById(BUSINESS_MAP_ID);
        if (map) {
          if (seen === null) seen = now;
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
   * The reading the text around the map was read from, for the project search (⌘K, roadmap 6.6) — the search the
   * workspace's Business view carried until 3.1.0 stands here, where a project opens (mockup state 3: "Search this
   * project" in the shell bar).
   */
  const reading = around.reading;

  /** "I'll look around myself": the invitation steps aside; one quiet line under the map keeps the way in. */
  const [lookingAround, setLookingAround] = useState(false);
  const walk = useCallback(() => requestProcessWalk(projectId), [projectId]);

  /* ---- the walk-through and what follows it (AB-4) ---- */
  const { progress, markWalked, setNextHidden } = useAnalyzeProgress(projectId || null);
  const [walkState, setWalkState] = useState<WalkState>({ open: false, pausedAt: null, move: null });
  const [finishedThisVisit, setFinishedThisVisit] = useState(false);
  const [walkedSteps, setWalkedSteps] = useState<number | null>(null);
  const touring = walkState.open;
  const onTourChange = useCallback(
    (next: WalkState) => {
      setWalkState(next);
      if (!next.move?.end) return;
      // O1: the last station was shown once — the walk-through is done, in this browser only.
      markWalked();
      setFinishedThisVisit(true);
      setWalkedSteps(next.move.total);
    },
    [markWalked],
  );
  const stage = analyzeStage({ progress, touring, finishedThisVisit });
  const walked = progress.walkedOn !== null;
  /** "you are here" in "How it runs": the node the station shows, else its first line. */
  const here = useMemo(() => {
    const station = walkState.move?.station ?? null;
    return station ? { nodeId: station.id, line: station.anchor?.lineStart ?? null } : null;
  }, [walkState.move]);
  /**
   * When the tour closes or pauses the focus returns to "Walk me through it" (or "Walk through again") — in the map's
   * full screen to its own (ADR-119 (d)), never to the page behind it. A focus the reader has put elsewhere (the
   * canvas, the *Edit* switch) stays where it is.
   */
  const wasTouring = useRef(false);
  useEffect(() => {
    if (wasTouring.current && !touring) {
      window.requestAnimationFrame(() => {
        const now = document.activeElement;
        if (now && now !== document.body && now.isConnected) return;
        const full = document.querySelector<HTMLElement>('[data-map-fullscreen="true"]');
        const target = full
          ? full.querySelector<HTMLElement>('[data-map-fullscreen-walk]')
          : document.querySelector<HTMLElement>('[data-analyze-walk]');
        target?.focus();
      });
    }
    wasTouring.current = touring;
  }, [touring]);

  /** The soft gate (mockup state 10): a later tool clicked before the walk-through holds for one calm note. */
  const [gate, setGate] = useState<{ label: string; href: string } | null>(null);
  const onTool = useCallback<ToolClick>(
    (tool, href, event) => {
      if (walked || tool.key === 'analyze' || !href) return;
      event.preventDefault();
      setGate({ label: tool.label, href });
    },
    [walked],
  );
  const gateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (gate) gateRef.current?.focus();
  }, [gate]);

  /** The two endings: Design for the owner (P8: a sentence for a reader), and the reader's own list. */
  const ruleCount = around.reading ? around.reading.ruleSet.rules.length : null;
  const redesignHref = `/project/${encodeURIComponent(projectId)}/design`;
  const endings = (variant: 'compact' | 'full', children?: React.ReactNode) => (
    <AnalyzeEndings variant={variant} owner={!!owner} rules={ruleCount} designHref={redesignHref} anotherHref={myWorkspaceHref()}>
      {children}
    </AnalyzeEndings>
  );
  /** Where the basket line under the questions leads: Design's questions, as the First insights' line did (3.0.21). */
  const designHref = `/project/${encodeURIComponent(projectId)}/design#${RULE_QUESTIONS_ID}`;

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
  const walkLabel = walkState.pausedAt !== null ? wt('abiz.walkContinue') : wt('abiz.walk');
  const gateNote = gate ? (
    <div
      ref={gateRef}
      tabIndex={-1}
      role="note"
      aria-label={gateLabel(gate.label)}
      data-analyze-soft-gate=""
      className="mt-1 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-cc-row border border-cc-information-border bg-cc-information-bg px-3 py-2 text-[13px] leading-snug font-medium text-cc-ink"
    >
      <Info size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-information" />
      <p className="m-0 min-w-0 flex-1 basis-60">
        <span className="font-semibold">{wt('abiz.gateTitle')}</span> {gateBody(gate.label)}
      </p>
      <span className="flex flex-wrap items-center gap-2">
        <CcButton
          variant="secondary"
          onClick={() => {
            setGate(null);
            walk();
          }}
          data-analyze-soft-gate-walk=""
        >
          {wt('abiz.gateWalk')}
        </CcButton>
        {/* Going on counts as the walk-through done (O1): the note is said once, never again. */}
        <span onClickCapture={markWalked}>
          <CcLinkButton href={gate.href} variant="ghost" data-analyze-soft-gate-continue="">
            {gateContinue(gate.label)}
          </CcLinkButton>
        </span>
      </span>
    </div>
  ) : null;

  return (
    <StageFrame stage="analyze" data-analyze-business="ready">
      {/* Search ⌘K: the dialog and its index; its button stands in the shell bar while this is mounted. */}
      <CommandSearch projectId={projectId} project={project} reading={reading} />
      <StageHeader
        tools={{ steps, current: 'analyze' }}
        projectName={project?.name}
        stage="analyze"
        backToMyWorkspace
        toolsNote={softGateShown(progress) ? wt('abiz.softGate') : null}
        toolsCompact
        onTool={onTool}
        toolsAfter={gateNote}
      >
        {wt('abiz.lead')}
      </StageHeader>

      <div className="flex flex-col gap-4">
        {/* What this program does, and the one invitation (mockup state 3); it steps aside while the tour runs (AB-4). */}
        <WhatThisProgramDoes
          text={around.text}
          state={around.state}
          say={around.say}
          onAnchor={openAnchor}
          hidden={touring}
          actions={
            signed !== null && walked ? (
              // Done, or a later visit (mockup states 9 and 17): the two endings, and the way through it again.
              <div data-analyze-walked={stage} className="cc-no-print flex min-w-0 flex-col gap-3 max-[600px]:w-full">
                <p className="m-0 flex flex-wrap items-center gap-x-2 text-[12px] leading-snug font-semibold text-cc-ink-muted">
                  <span>{stage === 'done' && walkedSteps !== null ? walkedAll(walkedSteps) : walkedOnDay(walkedDayLabel(progress.walkedOn))}</span>
                  <span aria-hidden={true}>·</span>
                  <CcButton variant="ghost" icon={<Play size={14} aria-hidden={true} />} onClick={walk} data-analyze-walk="again">
                    {wt('abiz.walkAgain')}
                  </CcButton>
                </p>
                {endings('compact')}
              </div>
            ) : invitation ? (
              <div data-analyze-invitation="" className="cc-no-print flex flex-wrap items-center gap-3 max-[600px]:w-full max-[600px]:flex-col max-[600px]:items-stretch">
                <CcButton variant="primary" icon={<Play size={16} aria-hidden={true} />} onClick={walk} data-analyze-walk="">
                  {walkLabel}
                </CcButton>
                <CcButton variant="secondary" onClick={() => setLookingAround(true)} data-analyze-look-around="">
                  {wt('abiz.lookAround')}
                </CcButton>
              </div>
            ) : null
          }
        />

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
            tourEndings={endings('compact')}
            onTourChange={onTourChange}
          />
          {lookingAround && signed && !walked && !touring ? (
            <p data-analyze-look-around-line="" className="cc-no-print m-0 mt-2 flex flex-wrap items-center gap-2 text-[13px] leading-snug font-medium text-cc-ink-muted">
              {wt('abiz.lookAroundLine')}
              <CcButton variant="ghost" icon={<Play size={14} aria-hidden={true} />} onClick={walk} data-analyze-walk="later">
                {walkLabel}
              </CcButton>
            </p>
          ) : null}
          <UsageRecords project={project} className="mt-4" />
        </div>

        {/* AB-7: the two charts under the map — how a case can end, what it changes and only reads (mockup states 8, 9). */}
        <ProcessFactCharts project={project} projectId={projectId} onOpenLines={openAnchor} />

        {/* The text around the map (AB-6, mockup states 3 and 9): how it runs, why it exists, who is involved, and the
            questions to settle with the business — every sentence with its line. */}
        <AroundTheMap
          text={around.text}
          state={around.state}
          say={around.say}
          askNow={around.askNow}
          designHref={designHref}
          onAnchor={openAnchor}
          here={here}
        />

        {/* After the walk-through (AB-4, mockup states 9 and 9b): the two endings in full, and "What you can do next"
            below them — or, once hidden for this project, the quiet link that brings it back. */}
        {signed !== null && walked && !touring ? (
          <>
            {endings(
              'full',
              progress.nextHidden ? (
                <button
                  type="button"
                  onClick={() => setNextHidden(false)}
                  data-analyze-what-next-show=""
                  className="mt-1 self-start rounded-cc-row text-left text-[13px] font-semibold text-cc-ink-muted underline underline-offset-2"
                >
                  {wt('abiz.nextShow')}
                </button>
              ) : null,
            )}
            {whatNextShown(progress) ? <WhatNextCard onHide={() => setNextHidden(true)} /> : null}
          </>
        ) : null}

        {/* The target and its SAP reference pattern, one quiet line (roadmap 3.0.9, ADR-089), as it stood in the
            workspace's Business view until 3.1.0. */}
        <TargetReferenceLine project={project} />
      </div>
    </StageFrame>
  );
}
