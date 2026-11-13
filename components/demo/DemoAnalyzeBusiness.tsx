'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, RotateCcw, X } from 'lucide-react';
import StageFrame from '@/components/StageFrame';
import StageHeader from '@/components/StageHeader';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcCodeSurface, { type CcCodeLine } from '@/components/cc/CodeSurface';
import CcDisclosure from '@/components/cc/Disclosure';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import FirstLook from '@/components/workspace/FirstLook';
import BusinessNextStep from '@/components/workspace/BusinessNextStep';
import OpenQuestions from '@/components/workspace/OpenQuestions';
import DemoRulesCard from '@/components/demo/DemoRulesCard';
import DemoTourStop from '@/components/demo/DemoTourStop';
import DemoWalkThrough from '@/components/demo/DemoWalkThrough';
import { useOpenQuestions } from '@/hooks/useOpenQuestions';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useDemoTour } from '@/hooks/useDemoTour';
import { BUSINESS_MAP_ID } from '@/lib/business-layers';
import { DEMO_ANALYSIS_KEY, markAnalysisRead } from '@/lib/analysis-read';
import { codeCardLabel, codeCardLines, tokenizeAbapLine } from '@/lib/process-map';
import { plainWordingFor } from '@/lib/business-card';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import { engineVersionOfProject } from '@/lib/run-engine-version';
import { revealedRules, type SourceReading } from '@/lib/first-look';
import { nextOpenPointOf } from '@/lib/next-step';
import { programSummaryFactsOf } from '@/lib/program-summary-facts';
import { businessInShort, programSummary } from '@/lib/program-summary-text';
import { editorRules, isConfirmedState, type RulesStatus } from '@/lib/rules-editor';
import { signInLinkFor } from '@/lib/return-path';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { notDetermined, VIEW_LABELS } from '@/lib/workspace-model';
import {
  DEMO_INVITATION,
  DEMO_RESET_LABEL,
  DEMO_STRIP_NOTICE,
  DEMO_TAG,
  DEMO_UNSIGNED_NOTICE,
  DEMO_WORKSPACE_ROUTE,
} from '@/lib/demo-marks';
import {
  TOUR_INVITATION_HREF,
  nextStep,
  stationOf,
  tourInvitationShowing,
  tourPositionLabel,
  tourSlot,
  type TourPlace,
} from '@/lib/demo-tour';
import {
  clearWorkspaceDemoState,
  readWorkspaceDemoState,
  writeWorkspaceDemoState,
  type WorkspaceDemoState,
} from '@/lib/demo-workspace-state';
import type { DemoWorkspaceData } from '@/lib/demo-workspace';
import { bizLinesLabel, tourContinuesIn, tourPausedAt, wt } from '@/lib/workspace-messages';

/** The map pulls bpmn-js: client only and on demand, as in a project's Analyze. */
const ProcessMap = dynamic(() => import('@/components/process-map/ProcessMap'), { ssr: false });

/** The lines around a chosen step in the code panel, as in a project's Analyze (`WorkspaceProcess`). */
const SOURCE_CONTEXT = 6;

/** A region the tour can stand in, with its slot directly above it. */
function Place({ place, children, className }: { place: TourPlace; children: React.ReactNode; className?: string }) {
  return (
    <div data-demo-tour-place={place} className={className ?? 'mt-5'}>
      {children}
    </div>
  );
}

/**
 * The demo opens like a project: Analyze, Business, the map is the page (plan
 * `docs/design/analyze-business-first-plan.md` §4.1, AB-2, O10; ADR-109;
 * `DESIGN.md` §6.1.2).
 *
 * **The same composition as `components/analyze/AnalyzeBusiness.tsx`**, in the
 * same order and with the same hooks for the page's places: the stage header
 * (the way back to My workspace, the view switch, the seven tools), "What this
 * program does" in the engine's own sentence with the invitation — "Walk me
 * through it" and "I'll look around myself" — then the reconstructed map, and
 * below it, until 3.2.0, the First insights blocks and "Next step". IT and
 * Management of the demo keep their pages (`/demo/workspace?view=it|management`
 * and today's `/demo/analyze?view=it`), as a project's do until AB-9/AB-10.
 *
 * **Demo data, no model, no writes.** Every figure arrives in `data`, built on
 * the server by the engine of this release (`lib/demo-workspace.ts`); the first
 * insights are told there is no naming to read (`namingFrom="none"`), and the
 * map is the demo's own drawing, not a stored project's. What the reader does
 * — the answers to the rules — stays in this browser (`lib/demo-workspace-state.ts`).
 * A demo must not reach a run, a pack, an export or a write
 * (`tests/demo-project.spec.ts`, `tests/demo-shared-boundary.spec.ts`).
 *
 * **What only the demo has** stands where it stood in the demo workspace's
 * Business view: the strip (demo, nothing kept, nothing signed, the one
 * invitation), the tour's stations at their places, the levels of the map, the
 * open questions and the demo's own rules card. The one Business layer
 * (Evidence & controls) is not drawn here, as in a project's Analyze: its
 * content is IT's Run & trust (ADR-096, plan §1.1).
 *
 * For every signed-in account, like the demo workspace: without one the reader
 * is sent to sign in and returned (`lib/return-path.ts`) before anything below
 * renders — the same gate the demo workspace's lookups rely on
 * (`tests/public-no-google-before-signin-guard.spec.ts`).
 */
export default function DemoAnalyzeBusiness({ data }: { data: DemoWorkspaceData }) {
  const { demo, project, source, processMap } = data;
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const enabled = profile != null;
  useEffect(() => {
    if (!profileLoading && !enabled) router.replace(signInLinkFor(DEMO_WORKSPACE_ROUTE));
  }, [profileLoading, enabled, router]);

  /* ------------------------------------------------------ the reader's state */
  const [state, setState] = useState<WorkspaceDemoState>({ ruleAnswers: {}, targetConfirmed: false });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setState(readWorkspaceDemoState());
    setHydrated(true);
  }, []);
  const patch = useCallback((next: Partial<WorkspaceDemoState>) => {
    setState((prev) => ({ ...prev, ...next }));
    writeWorkspaceDemoState(next);
  }, []);
  /** The demo's rules card is answering (the product's "Decide on rules"). */
  const [rulesEditing, setRulesEditing] = useState(false);
  const reset = useCallback(() => {
    clearWorkspaceDemoState();
    setState({ ruleAnswers: {}, targetConfirmed: false });
    setRulesEditing(false);
  }, []);

  /* ------------------------------------------- what this program does (engine) */
  const engineVersion = engineVersionOfProject(project);
  const inShort = useMemo(() => {
    try {
      return businessInShort(programSummary(programSummaryFactsOf(source, { engineVersion })), { codes: false });
    } catch {
      return null;
    }
  }, [source, engineVersion]);

  /* ---------------------------------------------------- the reading, the map */
  const [reading, setReading] = useState<SourceReading | null>(null);
  const onReading = useCallback((next: SourceReading) => setReading(next), []);
  const rules = useMemo(() => (reading ? revealedRules(reading.ruleSet) : []), [reading]);
  const ruleRows = useMemo(
    () => (reading ? editorRules(reading.ruleSet, plainWordingFor(source, reading.skeleton)) : []),
    [reading, source],
  );
  const openDemoRules = useCallback(() => {
    setRulesEditing(true);
    document.getElementById('demo-rules')?.scrollIntoView({ block: 'start' });
  }, []);
  /** The demo's answers, kept in this browser, in the shape every rule action reads. A Clarify is an open question. */
  const demoRulesStatus = useMemo<RulesStatus | null>(() => {
    if (!reading) return null;
    const answered = (id: string) => {
      const s = state.ruleAnswers[id]?.state;
      return !!s && isConfirmedState(s);
    };
    return {
      total: rules.length,
      confirmed: rules.filter((r) => answered(r.id)).length,
      open: rules.filter((r) => !answered(r.id)).map((r) => r.id),
      by: [],
      lastAt: null,
    };
  }, [reading, rules, state.ruleAnswers]);
  const open = useMemo(() => notDetermined(project), [project]);
  // The demo's open questions (ADR-081): read-only, nothing to write to.
  const questions = useOpenQuestions(project, '', { open, rulesEnabled: false });
  /**
   * The next phase of the demo's own rail, by the product's rule. A demo can
   * never sign a run, so Analyze can never be "done" here; the engine's reading
   * stands in for it, and the step is the first phase after it — said so in the
   * step's own selection line rather than claimed as on record.
   */
  const demoNextPoint = useMemo(() => {
    const rail = demo.rail.map((s) => (s.key === 'analyze' ? { ...s, state: 'done' as const, done: true } : s));
    const point = nextOpenPointOf(rail, true);
    return point ? { ...point, selection: wt('demo.nextAfterReading') } : null;
  }, [demo.rail]);
  const [plane, setPlane] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // The reader has the analysis in front of them, as on a project's Analyze: the demo workspace's tool bar stops
  // saying "result ready" (ADR-090). Browser only.
  useEffect(() => {
    markAnalysisRead(DEMO_ANALYSIS_KEY);
  }, []);

  /* ------------------------------------------- the code on demand (mockup state 7) */
  // As a project's Analyze, Business: the map draws no code of its own (`layout="page"`); the chosen step's lines
  // stand in a panel beside it, closed by its own button (`WorkspaceProcess` `codeOnClick`).
  const [fullSource, setFullSource] = useState(false);
  // The lines an anchor of the summary opened, when no step of the map is chosen.
  const [anchorLines, setAnchorLines] = useState<{ lineStart: number; lineEnd: number } | null>(null);
  const selectedElement = selected ? processMap.elements.find((e) => e.id === selected) ?? null : null;
  const marked = selectedElement?.anchor ?? anchorLines;
  const codeLines: CcCodeLine[] = useMemo(() => {
    if (!marked) return [];
    if (!fullSource) return codeCardLines(source, marked, SOURCE_CONTEXT);
    return source.split(/\r\n|\r|\n/).map((text, i) => {
      const number = i + 1;
      const highlighted = number >= marked.lineStart && number <= marked.lineEnd;
      return { number, tokens: tokenizeAbapLine(text), ...(highlighted ? { highlighted: true } : {}) };
    });
  }, [source, marked, fullSource]);
  const closeCode = useCallback(() => {
    setSelected(null);
    setAnchorLines(null);
    setFullSource(false);
  }, []);
  const selectStep = useCallback((id: string | null) => {
    setAnchorLines(null);
    setSelected(id);
  }, []);
  const openAnchor = useCallback((lineStart: number, lineEnd: number) => {
    setSelected(null);
    setAnchorLines({ lineStart, lineEnd });
    document.getElementById(BUSINESS_MAP_ID)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  /* ------------------------------------------------- the invitation, the walk */
  const [walkOpen, setWalkOpen] = useState(false);
  const [lookingAround, setLookingAround] = useState(false);
  const walk = useCallback(() => setWalkOpen(true), []);

  /* ------------------------------------------------------------------ tour */
  // The demo's tour (`lib/demo-tour.ts`) has its Business stations here; a
  // station in IT or Management continues in the demo workspace's view.
  const tour = useDemoTour();
  const scrollPending = useRef(false);
  const toView = useCallback(
    (target: string) => router.push(`${DEMO_WORKSPACE_ROUTE}?view=${encodeURIComponent(target)}`),
    [router],
  );
  const next = useCallback(() => {
    if (tour.progress) {
      const after = stationOf(nextStep(tour.progress));
      if (after && after.view !== 'business') toView(after.view);
    }
    scrollPending.current = true;
    tour.next();
  }, [tour, toView]);
  const goToStation = useCallback(() => {
    const station = stationOf(tour.progress);
    if (station && station.view !== 'business') toView(station.view);
    scrollPending.current = true;
  }, [tour.progress, toView]);
  useEffect(() => {
    if (!scrollPending.current) return;
    const el = document.querySelector('[data-demo-tour-station], [data-demo-tour-invitation]');
    if (!el) return;
    scrollPending.current = false;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  });
  const stop = (place: TourPlace) => (
    <DemoTourStop slot={tourSlot(tour.progress, place, 'business')} onNext={next} onPause={tour.pause} onEnd={tour.end} />
  );
  const cardInvites = tourInvitationShowing(tour.progress, 'business');
  const waiting = stationOf(tour.progress);

  const designHref = stageHref({ base: '/demo', path: 'design', view: 'business', from: WORKSPACE_RETURN.tools });

  if (profileLoading || !enabled) {
    return (
      <div data-workspace-gate="loading" role="status" className="py-16">
        <span className="sr-only">{wt('demo.loading')}</span>
      </div>
    );
  }

  const invitation = !lookingAround;

  return (
    <StageFrame stage="analyze" className="cc pb-24" data-analyze-business="ready" data-demo-workspace="business" data-demo-ready={hydrated ? 'true' : 'false'}>
      {/* The strip: demo, nothing kept, nothing signed — and the one standing
          invitation, which steps back while the tour's card invites (§6.1.2). */}
      <div className="mt-6" data-demo-strip="" data-testid="demo-strip">
        <CcMessageStrip
          state="information"
          headline={<span data-testid="demo-notice">{DEMO_STRIP_NOTICE}</span>}
          actions={
            <CcButton onClick={reset} icon={<RotateCcw size={14} aria-hidden={true} />} data-demo-reset="">
              {DEMO_RESET_LABEL}
            </CcButton>
          }
        >
          <span data-demo-unsigned="" data-testid="demo-unsigned">{DEMO_UNSIGNED_NOTICE}</span>{' '}
          {cardInvites ? null : (
            <Link href={TOUR_INVITATION_HREF} data-demo-invitation="" className="font-semibold text-cc-ink underline underline-offset-2">
              {DEMO_INVITATION}
            </Link>
          )}
        </CcMessageStrip>
      </div>

      <StageHeader
        stage="analyze"
        tools={{ steps: demo.rail, current: 'analyze', base: '/demo' }}
        title={`${demo.title} — ${demo.rail.find((r) => r.key === 'analyze')?.label ?? 'Analyze'}`}
        eyebrow={<CcTag>{DEMO_TAG}</CcTag>}
        backToMyWorkspace
        toolsNote={wt('abiz.softGate')}
      >
        {wt('abiz.lead')}
      </StageHeader>

      {/* Where the tour is, when it is not on this screen. A line, not a station. */}
      {tour.progress && waiting ? (
        <p data-demo-tour-status="" className="m-0 mb-3 flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
          {tour.progress.state === 'paused' ? (
            <>
              {tourPausedAt(tourPositionLabel(tour.progress.index))}
              <CcButton onClick={tour.resume} data-demo-tour-resume="">
                {wt('tour.resume')}
              </CcButton>
            </>
          ) : waiting.view !== 'business' ? (
            <>
              {tourContinuesIn(tourPositionLabel(tour.progress.index), VIEW_LABELS[waiting.view])}
              <CcButton onClick={goToStation} data-demo-tour-go="">
                {wt('tour.goThere')}
              </CcButton>
            </>
          ) : null}
        </p>
      ) : tour.progress?.state === 'ended' ? (
        <p className="m-0 mb-3 text-[12px] font-medium text-cc-ink-muted">
          <CcButton onClick={tour.restart} data-demo-tour-restart="">
            {wt('tour.restart')}
          </CcButton>
        </p>
      ) : null}

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
                            label={`${wt('firstLook.sourceLine')} L${line.anchors[0].lineStart}`}
                            onOpen={() => openAnchor(line.anchors[0].lineStart, line.anchors[0].lineEnd)}
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

        {/* The guided tour on the map, as in an own project (owner decision
            21.10.2026); it asks nothing, so the demo shows it as it is. Its way
            in is the invitation above, as in a project's Analyze. */}
        <div data-demo-walk="">
          <DemoWalkThrough model={processMap} source={source} designHref={designHref} open={walkOpen} onOpenChange={setWalkOpen} entry={false} />
        </div>

        {/* The map: the first block under the summary (mockup states 3, 7, 17). */}
        <div id={BUSINESS_MAP_ID} data-analyze-map="" data-demo-business-map="" className="scroll-mt-20">
          <Place place="process-map" className="">
            <div className="max-w-3xl">{stop('process-map')}</div>
            <div
              className={
                marked
                  ? 'grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]'
                  : undefined
              }
            >
              <div className="min-w-0">
                <CcCard title={wt('demo.processMap')} meta={<CcProvenanceChip value="reconstructed" />} density="compact">
                  <ProcessMap
                    model={processMap}
                    source={source}
                    catalogTarget={catalogLookupTargetOf(project)}
                    engineVersion={engineVersion}
                    plane={plane}
                    onPlaneChange={setPlane}
                    selected={selected}
                    onSelectedChange={selectStep}
                    defaultView="map"
                    canvasControls
                    layout="page"
                    exportable={false}
                  />
                </CcCard>
                <p data-analyze-map-hint="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
                  {wt('abiz.mapHint')}
                </p>
              </div>
              {marked ? (
                <aside
                  data-workspace-source-column="panel"
                  data-analyze-code-panel=""
                  aria-labelledby="analyze-code-panel-title"
                  className="flex min-w-0 flex-col gap-3 self-start rounded-cc-card border border-cc-line bg-cc-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="m-0 text-[12px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
                        {`${wt('abiz.codeTitle')} · ${bizLinesLabel(marked.lineStart, marked.lineEnd)}`}
                      </p>
                      <h3 id="analyze-code-panel-title" className="m-0 mt-1 text-[15px] leading-snug font-bold break-words text-cc-ink">
                        {selectedElement?.label ?? processMap.fileName}
                      </h3>
                    </div>
                    <CcButton variant="ghost" onClick={closeCode} aria-label={wt('abiz.codeClose')} data-analyze-code-close="">
                      <X size={16} aria-hidden={true} />
                    </CcButton>
                  </div>
                  <div className={fullSource ? 'max-h-112 overflow-y-auto' : 'overflow-x-auto'}>
                    <CcCodeSurface lines={codeLines} label={codeCardLabel(processMap.fileName, marked, source)} />
                  </div>
                  <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('abiz.codeLine')}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <CcButton onClick={() => setFullSource((v) => !v)} aria-pressed={fullSource} data-workspace-source-full="">
                      {fullSource ? wt('biz.showMarkedOnly') : wt('biz.showFullSource')}
                    </CcButton>
                  </div>
                </aside>
              ) : null}
            </div>
          </Place>
          {lookingAround ? (
            <p data-analyze-look-around-line="" className="cc-no-print m-0 mt-2 flex flex-wrap items-center gap-2 text-[13px] leading-snug font-medium text-cc-ink-muted">
              {wt('abiz.lookAroundLine')}
              <CcButton variant="ghost" icon={<Play size={14} aria-hidden={true} />} onClick={walk} data-analyze-walk="later">
                {wt('abiz.walk')}
              </CcButton>
            </p>
          ) : null}
          <Place place="process-levels">
            {stop('process-levels')}
            <CcCard title={wt('demo.levels')} count={processMap.planes.length}>
              <ul data-demo-process-levels="" className="m-0 flex list-none flex-wrap gap-2 p-0">
                {processMap.planes.map((p) => (
                  <li key={p.id ?? 'top'}>
                    <CcButton onClick={() => setPlane(p.id)} aria-pressed={plane === p.id} data-demo-process-level={p.id ?? 'top'}>
                      {p.label} · {p.elementIds.length}
                    </CcButton>
                  </li>
                ))}
              </ul>
            </CcCard>
          </Place>
        </div>

        {/* Interim until 3.2.0, as in a project: the First insights blocks and "Next step" below the map. */}
        <section data-analyze-interim="" aria-label={wt('abiz.belowTitle')} className="flex flex-col gap-4">
          <Place place="reveal" className="">
            <div className="max-w-3xl">{stop('reveal')}</div>
            {/* The rules card stands below, with the answers this browser
                holds — the opening reads the same answers instead of a route
                the demo has no record in (owner, 03.10.2026). */}
            <FirstLook
              project={project}
              projectId="demo"
              onReading={onReading}
              namingFrom="none"
              fullMapBelow
              rulesBelow
              rulesOverride={demoRulesStatus}
              questions={questions}
              onReviewRules={openDemoRules}
              elsewhere={{
                documentation: stageHref({ base: '/demo', path: 'documentation', view: 'business', from: WORKSPACE_RETURN.tools }),
                it: `${DEMO_WORKSPACE_ROUTE}?view=it`,
              }}
            />
          </Place>
          {/* The product's one next step: while a rule has no answer it is to
              decide on the rules, and it leads to the demo's own rules card. */}
          {demoRulesStatus ? (
            <BusinessNextStep
              step={
                demoRulesStatus.open.length > 0
                  ? { kind: 'rules', open: demoRulesStatus.open, total: demoRulesStatus.total, then: demoNextPoint }
                  : demoNextPoint
                    ? { kind: 'phase', point: demoNextPoint }
                    : { kind: 'none' }
              }
              projectId="demo"
              base="/demo"
              onDecideRules={openDemoRules}
            />
          ) : null}

          {/* Folded, with its count — simple on top, complete one click deeper. */}
          <Place place="not-determined" className="">
            {stop('not-determined')}
            <CcDisclosure title={wt('oq.title')} count={questions.open} level={3}>
              <OpenQuestions questions={questions} projectId="demo" view="business" owner={false} hasRun={false} demo />
            </CcDisclosure>
          </Place>

          <Place place="confirm-rule" className="">
            <div className="max-w-3xl">{stop('confirm-rule')}</div>
            <div id="demo-rules" className="scroll-mt-24">
              {!reading ? (
                <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('demo.readingRules')}</p>
              ) : (
                <DemoRulesCard
                  rules={ruleRows}
                  answers={state.ruleAnswers}
                  editing={rulesEditing}
                  onEditingChange={setRulesEditing}
                  onRecord={(ruleAnswers) => patch({ ruleAnswers })}
                />
              )}
            </div>
          </Place>
        </section>
      </div>
    </StageFrame>
  );
}
