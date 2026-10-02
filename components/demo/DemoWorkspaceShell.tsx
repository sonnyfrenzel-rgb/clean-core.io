'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { notFound, useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, RotateCcw } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcAnchor from '@/components/cc/Anchor';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import { CcRulePropertyTag } from '@/components/cc/Tag';
import FirstLook from '@/components/workspace/FirstLook';
import NotDeterminedCard from '@/components/workspace/NotDeterminedCard';
import WorkspaceLayerBar from '@/components/workspace/LayerBar';
import WorkspaceLayerSection from '@/components/workspace/LayerSection';
import WorkspaceStatusLine from '@/components/workspace/StatusLine';
import ItAnswers from '@/components/workspace/ItAnswers';
import PublicCloudFitPanel from '@/components/workspace/PublicCloudFitPanel';
import ManagementExecutive from '@/components/workspace/ManagementExecutive';
import CcDisclosure from '@/components/cc/Disclosure';
import { useFitByPlatform } from '@/hooks/useFitByPlatform';
import { managementExecutive, type ExecutiveTarget } from '@/lib/management-executive';
import { managementOverview, type Loaded } from '@/lib/management-overview';
import type { ItFindingsSource } from '@/lib/it-findings';
import { stageHref } from '@/lib/workspace-back-href';
import DemoTourStop from '@/components/demo/DemoTourStop';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useDemoTour } from '@/hooks/useDemoTour';
import { workspaceShellEnabled } from '@/lib/workspace-shell';
import {
  VIEW_LABELS,
  VIEW_QUESTIONS,
  WORKSPACE_VIEWS,
  layerFromHash,
  notDetermined,
  viewFromParam,
  workspaceLayers,
  workspaceStatusLine,
  type LayerKey,
  type WorkspaceView,
} from '@/lib/workspace-model';
import { managementAnswers } from '@/lib/management-answers';
import { revealedRules, type SourceReading } from '@/lib/first-look';
import { PHASES } from '@/lib/workflow-steps';
import {
  DEMO_INVITATION,
  DEMO_OBJECT_NAME,
  DEMO_RESET_LABEL,
  DEMO_STORAGE_KEY,
  DEMO_STRIP_NOTICE,
  DEMO_TAG,
  DEMO_UNSIGNED_NOTICE,
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
import type { DemoWorkspaceData } from '@/lib/demo-workspace';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import { routeLabel } from '@/lib/sap-naming';
import {
  demoConfirmRoute,
  demoEvidence,
  demoFigure,
  demoFirstFiveOf,
  demoRuleCount,
  demoSourceLineLabel,
  demoStartingPoint,
  demoSubtitle,
  tourContinuesIn,
  tourPausedAt,
  wt,
} from '@/lib/workspace-messages';

/**
 * The demo in the 3.0 workspace, with its tour — roadmap 3.0.7, `DESIGN.md` §6.1.2.
 *
 * **Same content, one view at a time.** Business, IT and Management are three
 * orderings of one demo (ADR-018), held in `?view=` and never stored. The layer
 * bar holds the layer in the URL fragment, as the workspace does. Every figure
 * on this screen arrives in `data`, built on the server by the engine of this
 * release (`lib/demo-workspace.ts`); this component adds none.
 *
 * **The workspace pieces that would fetch are handed their answer.** The IT view
 * gets its findings as a prop, the first look is told there is no naming to
 * read, and the pieces that exist only for a stored project — the decision
 * route, the access list, the revision check, the run history — are not used:
 * the demo has no project for any of them to read, and a demo must not reach a
 * run, a pack, an export or a write (`tests/demo-project.spec.ts`). Where one of
 * them would stand, this file draws the demo's own card from the same data.
 *
 * **What the reader does stays in this browser** — confirmed rules and the
 * confirmed route under the demo's key (shared with `/demo/{stage}`), the tour's
 * progress under its own (`lib/demo-tour.ts`). "Reset demo" clears the first.
 */

const ProcessMap = dynamic(() => import('@/components/process-map/ProcessMap'), { ssr: false });

/** The part of the demo's browser state this screen reads; every other field is kept as it is. */
interface WorkspaceDemoState {
  confirmedRules: string[];
  targetConfirmed: boolean;
}

function readDemoState(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function workspaceStateOf(raw: Record<string, unknown>): WorkspaceDemoState {
  return {
    confirmedRules: Array.isArray(raw.confirmedRules)
      ? raw.confirmedRules.filter((x): x is string => typeof x === 'string')
      : [],
    targetConfirmed: raw.targetConfirmed === true,
  };
}

function writeDemoState(patch: Partial<WorkspaceDemoState>): void {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...readDemoState(), ...patch }));
  } catch {
    /* A browser that refuses storage still runs the demo; it just forgets. */
  }
}

function clearDemoState(): void {
  try {
    window.localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* Nothing to clear. */
  }
}

/** A region the tour can stand in, with its slot directly above it. */
function Place({
  place,
  children,
  className,
}: {
  place: TourPlace;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-demo-tour-place={place} className={className ?? 'mt-5 max-w-3xl'}>
      {children}
    </div>
  );
}

export default function DemoWorkspaceShell({ data }: { data: DemoWorkspaceData }) {
  const { demo, project, source, processMap, itFindings } = data;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading: profileLoading } = useUserProfile();
  const enabled = workspaceShellEnabled(profile);

  const view = viewFromParam(searchParams?.get('view'));
  const setView = useCallback(
    (next: WorkspaceView) => {
      const query = new URLSearchParams(searchParams?.toString() ?? '');
      query.set('view', next);
      router.push(`?${query.toString()}${typeof window === 'undefined' ? '' : window.location.hash}`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  /* ---------------------------------------------------------------- layers */
  const [hashLayer, setHashLayer] = useState<LayerKey | null>(null);
  useEffect(() => {
    const read = () => setHashLayer(layerFromHash(window.location.hash));
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const selectLayer = useCallback((next: LayerKey) => {
    window.location.hash = next;
    setHashLayer(next);
  }, []);
  const layersOfModel = useMemo(() => workspaceLayers(project), [project]);
  // The demo opens on Need & process, with the map (mockup 2.8 s15). The first
  // layer with a count would be Architecture & dependencies — a list of FORM
  // routines — because the demo has no usage import to count under Need, while
  // its process map is the one thing it shows best.
  const currentLayer: LayerKey = hashLayer ?? 'need';
  // The demo's own rail, not `workflowSteps` over a project-shaped object: the
  // demo has no run, no code and no tests on record by construction, and its
  // rail says what it does have on each stage (`lib/demo-project.ts`).
  const statuses = useMemo(() => workspaceStatusLine(project, demo.rail), [project, demo.rail]);
  const open = useMemo(() => notDetermined(project), [project]);
  const management = useMemo(() => managementAnswers(project, [], open), [project, open]);

  /* ------------------------------------------- the decision panel (Management) */
  // The same panel the workspace leads its Management view with, from the
  // demo's own data: the findings arrive with the page, the buckets come
  // from the same derivation, and there is no run and no decision record —
  // which the panel says, and then names the step that would change it.
  const findingsRead = useMemo<Loaded<ItFindingsSource>>(() => ({ state: 'ready', value: itFindings }), [itFindings]);
  const fit = useFitByPlatform(findingsRead, project, wt('mgmt.lookupFailed'));
  const executive = useMemo(() => {
    const decision = { state: 'absent' as const, reason: wt('demo.noDecisionRecord') };
    const overview = managementOverview({ view: management, fit, findings: findingsRead, decision }, { hasSource: true, hasRun: false });
    return managementExecutive({
      subject: DEMO_OBJECT_NAME,
      mode: 'demo',
      hasSource: true,
      hasRun: false,
      steps: demo.rail,
      overview,
      fit,
      costs: { state: 'not-entered', reason: wt('demo.costsNotEntered') },
      proposal: routeLabel(demo.design.recommendedRoute),
    });
  }, [management, fit, findingsRead, demo.rail, demo.design.recommendedRoute]);
  const executiveHref = useCallback(
    (target: ExecutiveTarget): string =>
      target.kind === 'stage'
        ? stageHref({ base: '/demo', path: target.path, view: 'management' })
        : target.kind === 'anchor'
          ? `#${target.id}`
          : TOUR_INVITATION_HREF,
    [],
  );

  /* ------------------------------------------------------ the reader's state */
  const [state, setState] = useState<WorkspaceDemoState>({ confirmedRules: [], targetConfirmed: false });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setState(workspaceStateOf(readDemoState()));
    setHydrated(true);
  }, []);
  const patch = useCallback((next: Partial<WorkspaceDemoState>) => {
    setState((prev) => ({ ...prev, ...next }));
    writeDemoState(next);
  }, []);
  const reset = useCallback(() => {
    clearDemoState();
    setState({ confirmedRules: [], targetConfirmed: false });
  }, []);

  /* ---------------------------------------------------- the reading, the map */
  const [reading, setReading] = useState<SourceReading | null>(null);
  const onReading = useCallback((next: SourceReading) => setReading(next), []);
  const rules = useMemo(() => (reading ? revealedRules(reading.ruleSet) : []), [reading]);
  // Need & process holds the map and the rules here; the layer model counts
  // usage imports under it, which a demo has none of, and would mark it "empty".
  const layers = useMemo(
    () =>
      layersOfModel.map((l) =>
        l.key === 'need'
          ? { ...l, count: reading ? demoRuleCount(rules.length) : wt('demo.needLayerMap'), provenance: 'reconstructed' as const }
          : l,
      ),
    [layersOfModel, reading, rules.length],
  );
  const currentLayerSection = layers.find((l) => l.key === currentLayer) ?? layers[0];
  const [plane, setPlane] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  /* ------------------------------------------------------------------ tour */
  const tour = useDemoTour();
  const scrollPending = useRef(false);
  const next = useCallback(() => {
    if (tour.progress) {
      const after = stationOf(nextStep(tour.progress));
      if (after && after.view !== view) setView(after.view);
    }
    scrollPending.current = true;
    tour.next();
  }, [tour, view, setView]);
  const goToStation = useCallback(() => {
    const station = stationOf(tour.progress);
    if (station && station.view !== view) setView(station.view);
    scrollPending.current = true;
  }, [tour.progress, view, setView]);
  useEffect(() => {
    if (!scrollPending.current) return;
    const el = document.querySelector('[data-demo-tour-station], [data-demo-tour-invitation]');
    if (!el) return;
    scrollPending.current = false;
    el.scrollIntoView({ block: 'center' });
  });

  const stop = (place: TourPlace) => (
    <DemoTourStop slot={tourSlot(tour.progress, place, view)} onNext={next} onPause={tour.pause} onEnd={tour.end} />
  );
  const cardInvites = tourInvitationShowing(tour.progress, view);
  const waiting = stationOf(tour.progress);

  if (profileLoading) {
    return (
      <div data-workspace-gate="loading" role="status" className="py-16">
        <span className="sr-only">{wt('demo.loading')}</span>
      </div>
    );
  }
  if (!enabled) notFound();

  const standard = demo.transformation.plan.filter((p) => p.successor);

  /* The process map is what Need & process holds in the demo. The layer
     model's own Need section speaks of usage imports and would say the process
     "is not here yet" beside a map of it, so under Need the demo shows the map
     instead; any other layer shows its section, and Business keeps the map below. */
  const mapCard = (
    <CcCard title={wt('demo.processMap')} meta={<CcProvenanceChip value="reconstructed" />}>
      <ProcessMap
        model={processMap}
        source={source}
        catalogTarget={catalogLookupTargetOf(project)}
        plane={plane}
        onPlaneChange={setPlane}
        selected={selected}
        onSelectedChange={setSelected}
        exportable={false}
      />
    </CcCard>
  );
  const layerBar = (
    <div className="mt-5">
      <WorkspaceLayerBar layers={layers} current={currentLayer} onSelect={selectLayer} />
    </div>
  );
  const layerSection =
    currentLayer === 'need' ? null : (
      <div className="mt-5 max-w-3xl">
        <WorkspaceLayerSection layer={currentLayerSection} />
      </div>
    );

  return (
    <div className="cc" data-demo-workspace={view} data-demo-ready={hydrated ? 'true' : 'false'}>
      <nav aria-label={wt('demo.pathNav')} className="flex items-center gap-1 text-[12px] font-medium text-cc-ink-muted">
        <Link href="/dashboard" className="text-cc-ink-muted no-underline hover:text-cc-ink">
          {wt('demo.myWorkspace')}
        </Link>
        <ChevronRight size={14} aria-hidden={true} />
        <span className="font-semibold text-cc-ink">{demo.title}</span>
      </nav>

      {/* The strip: demo, nothing kept, nothing signed — and the one standing
          invitation, which steps back while the tour's card invites (§6.1.2). */}
      <div className="mt-3" data-demo-strip="">
        <CcMessageStrip
          state="information"
          headline={DEMO_STRIP_NOTICE}
          actions={
            <CcButton onClick={reset} icon={<RotateCcw size={14} aria-hidden={true} />} data-demo-reset="">
              {DEMO_RESET_LABEL}
            </CcButton>
          }
        >
          <span data-demo-unsigned="">{DEMO_UNSIGNED_NOTICE}</span>{' '}
          {cardInvites ? null : (
            <Link
              href={TOUR_INVITATION_HREF}
              data-demo-invitation=""
              className="font-semibold text-cc-ink underline underline-offset-2"
            >
              {DEMO_INVITATION}
            </Link>
          )}
        </CcMessageStrip>
      </div>

      <section className="mt-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          {/* A basis, so the view switch wraps under the title on a phone instead
              of squeezing it to one word a line and drawing over it. */}
          <div className="min-w-0 grow basis-80">
            <div className="flex flex-wrap items-center gap-2">
              <h1 data-workspace-title className="m-0 text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-cc-ink">
                {demo.title}
              </h1>
              <span className="rounded-cc-row border border-cc-information-border bg-cc-information-bg px-2 text-[11px] font-semibold text-cc-information">
                {DEMO_TAG}
              </span>
            </div>
            <p className="mt-1 text-[12px] font-medium text-cc-ink-muted" title={demo.catalogVersion}>
              {demoSubtitle(demo.subject, demo.sourceFile, demo.totalLines, demo.catalogVersion)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2">
            <CcSegmentedControl
              label={wt('demo.viewLabel')}
              value={view}
              onChange={setView}
              segments={WORKSPACE_VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
            />
            <p className="m-0 max-w-xs text-[12px] leading-snug font-medium text-cc-ink-muted">{VIEW_QUESTIONS[view]}</p>
          </div>
        </div>

        {/* Where the tour is, when it is not on this screen. A line, not a station. */}
        {tour.progress && waiting ? (
          <p data-demo-tour-status="" className="mt-2 flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
            {tour.progress.state === 'paused' ? (
              <>
                {tourPausedAt(tourPositionLabel(tour.progress.index))}
                <CcButton onClick={tour.resume} data-demo-tour-resume="">
                  {wt('tour.resume')}
                </CcButton>
              </>
            ) : waiting.view !== view ? (
              <>
                {tourContinuesIn(tourPositionLabel(tour.progress.index), VIEW_LABELS[waiting.view])}
                <CcButton onClick={goToStation} data-demo-tour-go="">
                  {wt('tour.goThere')}
                </CcButton>
              </>
            ) : null}
          </p>
        ) : tour.progress?.state === 'ended' ? (
          <p className="mt-2 text-[12px] font-medium text-cc-ink-muted">
            <CcButton onClick={tour.restart} data-demo-tour-restart="">
              {wt('tour.restart')}
            </CcButton>
          </p>
        ) : null}

        {view !== 'business' ? (
          <div className="mt-4">
            <WorkspaceStatusLine statuses={statuses} toolBase="/demo" />
          </div>
        ) : null}

        {/* The seven stages of the demo — the tools of this workspace (ADR-018). */}
        <nav aria-label={wt('demo.stagesNav')} className="mt-4 flex flex-wrap gap-2" data-demo-stages="">
          {PHASES.map((p) => (
            <CcLinkButton key={p.key} href={`/demo/${p.key}`}>
              {p.label}
            </CcLinkButton>
          ))}
        </nav>
      </section>


      {/* ------------------------------------------------------ Business */}
      {view === 'business' ? (
        <>
          <Place place="reveal" className="mt-5">
            <div className="max-w-3xl">{stop('reveal')}</div>
            <FirstLook
              project={project}
              projectId="demo"
              buildUp={false}
              onReading={onReading}
              namingFrom="none"
            />
          </Place>

          <Place place="not-determined">
            {stop('not-determined')}
            {/* Folded, with its count: nine reasons in full pushed the map two
                screens down. Simple on top, complete one click deeper. */}
            <CcDisclosure title={wt('demo.notDeterminedPoints')} count={open.count} level={3}>
              <NotDeterminedCard data={open} />
            </CcDisclosure>
          </Place>

          {layerBar}
          {layerSection}

          {/* Under Need & process the map is the layer's content, and says so. */}
          <div data-workspace-layer-section={currentLayer === 'need' ? 'need' : undefined}>
            <Place place="process-map" className="mt-5">
              <div className="max-w-3xl">{stop('process-map')}</div>
              {mapCard}
            </Place>
          </div>

          <Place place="process-levels">
            {stop('process-levels')}
            <CcCard title={wt('demo.levels')} count={processMap.planes.length}>
              <ul data-demo-process-levels="" className="m-0 flex list-none flex-wrap gap-2 p-0">
                {processMap.planes.map((p) => (
                  <li key={p.id ?? 'top'}>
                    <CcButton
                      onClick={() => setPlane(p.id)}
                      aria-pressed={plane === p.id}
                      data-demo-process-level={p.id ?? 'top'}
                    >
                      {p.label} · {p.elementIds.length}
                    </CcButton>
                  </li>
                ))}
              </ul>
            </CcCard>
          </Place>

          <Place place="confirm-rule">
            {stop('confirm-rule')}
            <CcCard title={wt('demo.rules')} count={reading ? rules.length : undefined}>
              {!reading ? (
                <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('demo.readingRules')}</p>
              ) : (
                <ul data-demo-rules="" className="m-0 flex list-none flex-col gap-2 p-0">
                  {rules.map((rule) => {
                    const confirmed = state.confirmedRules.includes(rule.id);
                    return (
                      <li key={rule.id} data-demo-rule={rule.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                        <CcProvenanceChip value={confirmed ? 'confirmed' : 'reconstructed'} note={confirmed ? wt('demo.thisBrowser') : undefined} />
                        <CcRulePropertyTag value={rule.property} />
                        <code className="font-cc-mono text-[12px] text-cc-ink">{rule.label}</code>
                        {rule.anchors.map((a) => (
                          <CcAnchor key={a} label={demoSourceLineLabel(a)}>
                            {a}
                          </CcAnchor>
                        ))}
                        <span className="ml-auto">
                          <CcButton
                            onClick={() =>
                              patch({
                                confirmedRules: confirmed
                                  ? state.confirmedRules.filter((id) => id !== rule.id)
                                  : [...state.confirmedRules, rule.id],
                              })
                            }
                            aria-pressed={confirmed}
                            data-demo-confirm-rule={rule.id}
                          >
                            {wt(confirmed ? 'demo.withdraw' : 'demo.confirm')}
                          </CcButton>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CcCard>
          </Place>

          <Place place="standard-fit">
            {stop('standard-fit')}
            <CcCard title={wt('demo.standardFit')} count={standard.length} meta={<CcProvenanceChip value="imported" />}>
              <p className="m-0 mb-2 text-[12px] font-medium text-cc-ink-muted">
                {wt('demo.standardFitLead')}
              </p>
              <ul data-demo-standard-fit="" className="m-0 flex list-none flex-col gap-2 p-0">
                {standard.slice(0, 5).map((item) => (
                  <li key={item.findingId} className="flex flex-wrap items-center gap-2 text-[13px] text-cc-ink">
                    <CcAnchor label={demoSourceLineLabel(item.lineStart)}>{`L${item.lineStart}`}</CcAnchor>
                    <span className="min-w-0">{item.title}</span>
                    <span className="font-semibold">→ {item.successor}</span>
                    <span className="text-[12px] text-cc-ink-muted">{demoEvidence(item.successorProvenance)}</span>
                  </li>
                ))}
              </ul>
              {standard.length > 5 ? (
                <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">
                  {demoFirstFiveOf(standard.length)}{' '}
                  <Link href="/demo/transformation" className="font-semibold text-cc-ink underline underline-offset-2">
                    {wt('demo.allInPlan')}
                  </Link>
                </p>
              ) : null}
            </CcCard>
          </Place>
        </>
      ) : null}

      {/* ------------------------------------------------------------ IT */}
      {view === 'it' ? (
        <>
          <Place place="it-chain" className="mt-5">
            <div className="max-w-3xl">{stop('it-chain')}</div>
            <ItAnswers projectId="demo" findings={itFindings} project={project} />
          </Place>
          {/* The IT answer first, then the layers, as in Management. */}
          {layerBar}
          {layerSection ?? (
            <div className="mt-5" data-workspace-layer-section="need">
              {mapCard}
            </div>
          )}
          <div className="mt-5 max-w-3xl">
            <NotDeterminedCard data={open} />
          </div>
        </>
      ) : null}

      {/* ---------------------------------------------------- Management */}
      {view === 'management' ? (
        <>
          <Place place="management">
            {stop('management')}
            <ManagementExecutive summary={executive} hrefFor={executiveHref} />
            <div className="mt-4">
              <CcDisclosure title={wt('demo.answersDetail')} count={management.answers.length} level={3}>
                <CcCard title={management.headline}>
                  <ul data-demo-management="" className="m-0 flex list-none flex-col gap-2 p-0">
                    {management.answers.map((a) => (
                      <li key={a.id} className="text-[13px] text-cc-ink">
                        <b className="font-semibold">{a.headline}</b>
                        {a.figures.length ? (
                          <span className="block text-[12px] font-medium text-cc-ink-muted">
                            {a.figures.map((f) => demoFigure(f.label, f.value, f.absentReason)).join(' · ')}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CcCard>
              </CcDisclosure>
            </div>
          </Place>

          <Place place="four-buckets">
            {stop('four-buckets')}
            <PublicCloudFitPanel project={project} />
          </Place>

          <Place place="costs">
            {stop('costs')}
            <CcCard title={wt('demo.costsTitle')} meta={<CcProvenanceChip value="simulation" />}>
              <p className="m-0 text-[13px] font-medium text-cc-ink">
                {wt('demo.costsNoAssumptions')}
              </p>
              <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">
                {demoStartingPoint(demo.economics.scoreBefore)}
              </p>
              <div className="mt-3">
                <CcLinkButton href="/demo/tco">{wt('demo.enterAssumptions')}</CcLinkButton>
              </div>
            </CcCard>
          </Place>

          <Place place="decision">
            {stop('decision')}
            <CcCard title={wt('demo.openDecision')} meta={<CcProvenanceChip value="proposed" />}>
              <p className="m-0 text-[13px] font-medium text-cc-ink">
                {wt('demo.proposedFromEvidence')} <b className="font-semibold">{routeLabel(demo.design.recommendedRoute)}</b>.
              </p>
              <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">{demo.design.rationale}</p>
              <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">
                {wt('demo.realProjectNote')}
              </p>
              <div className="mt-3">
                <CcButton
                  variant={state.targetConfirmed ? 'ghost' : 'secondary'}
                  onClick={() => patch({ targetConfirmed: !state.targetConfirmed })}
                  aria-pressed={state.targetConfirmed}
                  data-demo-confirm-route=""
                >
                  {state.targetConfirmed ? wt('demo.confirmedWithdraw') : demoConfirmRoute(routeLabel(demo.design.recommendedRoute))}
                </CcButton>
              </div>
            </CcCard>
          </Place>

          <Place place="handover">
            {stop('handover')}
            <CcCard title={wt('demo.handoverTitle')} count={demo.delivery.missing.length}>
              <ul data-demo-handover="" className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-cc-ink">
                {demo.delivery.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <div className="mt-3">
                <CcLinkButton href="/demo/delivery">{wt('demo.openDelivery')}</CcLinkButton>
              </div>
            </CcCard>
          </Place>
          {layerBar}
          {layerSection ?? (
            <div className="mt-5" data-workspace-layer-section="need">
              {mapCard}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
