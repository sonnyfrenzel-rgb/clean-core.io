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
import DemoTourStop from '@/components/demo/DemoTourStop';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useDemoTour } from '@/hooks/useDemoTour';
import { workspaceShellEnabled } from '@/lib/workspace-shell';
import {
  LAYERS,
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
  const layers = useMemo(() => workspaceLayers(project), [project]);
  const currentLayer = hashLayer ?? layers.find((l) => l.count !== null)?.key ?? LAYERS[0];
  const currentLayerSection = layers.find((l) => l.key === currentLayer) ?? layers[0];
  const statuses = useMemo(() => workspaceStatusLine(project), [project]);
  const open = useMemo(() => notDetermined(project), [project]);
  const management = useMemo(() => managementAnswers(project, [], open), [project, open]);

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
        <span className="sr-only">Loading the demo…</span>
      </div>
    );
  }
  if (!enabled) notFound();

  const standard = demo.transformation.plan.filter((p) => p.successor);

  return (
    <div className="cc" data-demo-workspace={view} data-demo-ready={hydrated ? 'true' : 'false'}>
      <nav aria-label="Path" className="flex items-center gap-1 text-[12px] font-medium text-cc-ink-muted">
        <Link href="/dashboard" className="text-cc-ink-muted no-underline hover:text-cc-ink">
          My workspace
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
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 data-workspace-title className="m-0 text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-cc-ink">
                {demo.title}
              </h1>
              <span className="rounded-cc-row border border-cc-information-border bg-cc-information-bg px-1.5 text-[11px] font-semibold text-cc-information">
                {DEMO_TAG}
              </span>
            </div>
            <p className="mt-1 text-[12px] font-medium text-cc-ink-muted">
              {demo.subject} · {demo.sourceFile} · {demo.totalLines} lines · catalog {demo.catalogVersion}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1.5">
            <CcSegmentedControl
              label="View"
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
                Tour paused at {tourPositionLabel(tour.progress.index)}.
                <CcButton onClick={tour.resume} data-demo-tour-resume="">
                  Resume tour
                </CcButton>
              </>
            ) : waiting.view !== view ? (
              <>
                Tour · {tourPositionLabel(tour.progress.index)} continues in the {VIEW_LABELS[waiting.view]} view.
                <CcButton onClick={goToStation} data-demo-tour-go="">
                  Go there
                </CcButton>
              </>
            ) : null}
          </p>
        ) : tour.progress?.state === 'ended' ? (
          <p className="mt-2 text-[12px] font-medium text-cc-ink-muted">
            <CcButton onClick={tour.restart} data-demo-tour-restart="">
              Restart tour
            </CcButton>
          </p>
        ) : null}

        {view !== 'business' ? (
          <div className="mt-4">
            <WorkspaceStatusLine statuses={statuses} />
          </div>
        ) : null}

        {/* The seven stages of the demo — the tools of this workspace (ADR-018). */}
        <nav aria-label="Stages" className="mt-4 flex flex-wrap gap-1.5" data-demo-stages="">
          {PHASES.map((p) => (
            <CcLinkButton key={p.key} href={`/demo/${p.key}`}>
              {p.label}
            </CcLinkButton>
          ))}
        </nav>
      </section>

      <div className="mt-5">
        <WorkspaceLayerBar layers={layers} current={currentLayer} onSelect={selectLayer} />
      </div>
      <div className="mt-5 max-w-3xl">
        <WorkspaceLayerSection layer={currentLayerSection} />
      </div>

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
            <NotDeterminedCard data={open} />
          </Place>

          <Place place="process-map" className="mt-5">
            <div className="max-w-3xl">{stop('process-map')}</div>
            <CcCard title="Process map" meta={<CcProvenanceChip value="reconstructed" />}>
              <p className="m-0 mb-3 text-[12px] font-medium text-cc-ink-muted">{processMap.traceability.sentence}</p>
              <ProcessMap
                model={processMap}
                source={source}
                plane={plane}
                onPlaneChange={setPlane}
                selected={selected}
                onSelectedChange={setSelected}
              />
            </CcCard>
          </Place>

          <Place place="process-levels">
            {stop('process-levels')}
            <CcCard title="Levels of this process" count={processMap.planes.length}>
              <ul data-demo-process-levels="" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
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
            <CcCard title="Rules in this code" count={reading ? rules.length : undefined}>
              {!reading ? (
                <p className="m-0 text-[13px] font-medium text-cc-ink-muted">Reading the rules out of the source…</p>
              ) : (
                <ul data-demo-rules="" className="m-0 flex list-none flex-col gap-2 p-0">
                  {rules.map((rule) => {
                    const confirmed = state.confirmedRules.includes(rule.id);
                    return (
                      <li key={rule.id} data-demo-rule={rule.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                        <CcProvenanceChip value={confirmed ? 'confirmed' : 'reconstructed'} note={confirmed ? 'this browser' : undefined} />
                        <CcRulePropertyTag value={rule.property} />
                        <code className="font-cc-mono text-[12px] text-cc-ink">{rule.label}</code>
                        {rule.anchors.map((a) => (
                          <CcAnchor key={a} label={`Source line ${a}`}>
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
                            {confirmed ? 'Withdraw' : 'Confirm'}
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
            <CcCard title="Standard fit" count={standard.length} meta={<CcProvenanceChip value="imported" />}>
              <p className="m-0 mb-2 text-[12px] font-medium text-cc-ink-muted">
                Successors SAP names for objects this code uses, with the evidence level the catalog gives them.
              </p>
              <ul data-demo-standard-fit="" className="m-0 flex list-none flex-col gap-1.5 p-0">
                {standard.slice(0, 5).map((item) => (
                  <li key={item.findingId} className="flex flex-wrap items-center gap-2 text-[13px] text-cc-ink">
                    <CcAnchor label={`Source line ${item.lineStart}`}>{`L${item.lineStart}`}</CcAnchor>
                    <span className="min-w-0">{item.title}</span>
                    <span className="font-semibold">→ {item.successor}</span>
                    <span className="text-[12px] text-cc-ink-muted">evidence: {item.successorProvenance ?? 'not stated'}</span>
                  </li>
                ))}
              </ul>
              {standard.length > 5 ? (
                <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">
                  The first 5 of {standard.length}.{' '}
                  <Link href="/demo/transformation" className="font-semibold text-cc-ink underline underline-offset-2">
                    All of them in the transformation plan
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
            <ItAnswers projectId="demo" findings={itFindings} />
          </Place>
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
            <CcCard title={management.headline}>
              <ul data-demo-management="" className="m-0 flex list-none flex-col gap-2 p-0">
                {management.answers.map((a) => (
                  <li key={a.id} className="text-[13px] text-cc-ink">
                    <b className="font-semibold">{a.headline}</b>
                    {a.figures.length ? (
                      <span className="block text-[12px] font-medium text-cc-ink-muted">
                        {a.figures.map((f) => `${f.label}: ${f.value ?? f.absentReason ?? 'not determined'}`).join(' · ')}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CcCard>
          </Place>

          <Place place="four-buckets">
            {stop('four-buckets')}
            <PublicCloudFitPanel project={project} />
          </Place>

          <Place place="costs">
            {stop('costs')}
            <CcCard title="Costs appear only as a simulation" meta={<CcProvenanceChip value="simulation" />}>
              <p className="m-0 text-[13px] font-medium text-cc-ink">
                No assumptions have been entered for this demo, so there is no amount to show. A forecast needs a day
                rate and an investment, and it is always labelled as a simulation with the assumptions it rests on.
              </p>
              <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">
                The measured starting point is the Clean Core Score of this demo run: {demo.economics.scoreBefore}.
              </p>
              <div className="mt-3">
                <CcLinkButton href="/demo/tco">Enter assumptions in Economics</CcLinkButton>
              </div>
            </CcCard>
          </Place>

          <Place place="decision">
            {stop('decision')}
            <CcCard title="Open decision" meta={<CcProvenanceChip value="proposed" />}>
              <p className="m-0 text-[13px] font-medium text-cc-ink">
                Proposed from the evidence: <b className="font-semibold">{demo.design.recommendedRoute}</b>.
              </p>
              <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">{demo.design.rationale}</p>
              <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">
                On a real project a confirmation records your account against a signed run. Here there is no run and no
                account, so it binds nothing and stays in this browser.
              </p>
              <div className="mt-3">
                <CcButton
                  variant={state.targetConfirmed ? 'ghost' : 'secondary'}
                  onClick={() => patch({ targetConfirmed: !state.targetConfirmed })}
                  aria-pressed={state.targetConfirmed}
                  data-demo-confirm-route=""
                >
                  {state.targetConfirmed ? 'Confirmed in this browser · withdraw' : `Confirm ${demo.design.recommendedRoute}`}
                </CcButton>
              </div>
            </CcCard>
          </Place>

          <Place place="handover">
            {stop('handover')}
            <CcCard title="What a real handover would still need" count={demo.delivery.missing.length}>
              <ul data-demo-handover="" className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-cc-ink">
                {demo.delivery.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <div className="mt-3">
                <CcLinkButton href="/demo/delivery">Open the delivery stage</CcLinkButton>
              </div>
            </CcCard>
          </Place>
        </>
      ) : null}
    </div>
  );
}
