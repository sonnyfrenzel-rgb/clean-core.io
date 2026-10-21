'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { FileCode2, Tags } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcCodeSurface, { type CcCodeLine } from '@/components/cc/CodeSurface';
import CcLinkButton from '@/components/cc/LinkButton';
import CcTabs from '@/components/cc/Tabs';
import { CcEmptyState } from '@/components/cc/EmptyState';
import CcSkeleton from '@/components/cc/Skeleton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { CcRunCost } from '@/components/cc/RunIndicator';
import StartNarrativeWait from './StartNarrativeWait';
import { useIsOwner } from './BusinessRulesEditor';
import StateChoice from '@/components/process-states/StateChoice';
import { publishProcessStates, useProcessStates } from '@/hooks/useProcessStates';
import { confirmOutcomeSentence, confirmProcessStates } from '@/lib/process-states-client';
import { elementEntries, walkOrder } from '@/lib/process-walk';
import { restrictGuide, resumeStop, walkStops, WALK_TECHNICAL_SUBJECT, type WalkGuide } from '@/lib/process-walk-guide';
import { OPEN_WALK_EVENT, PROCESS_WALK_ID, takeProcessWalkRequest } from '@/lib/process-walk-request';
import ProcessWalkThrough from './ProcessWalkThrough';
import { isConfirmedState } from '@/lib/rules-editor';
import { MAX_STATE_CHOICES, type ElementState } from '@/lib/process-states';
import { namingContextOf } from '@/lib/process-naming';
import { requestProcessNaming } from '@/lib/process-naming-client';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { StartRun } from '@/hooks/useStartRun';
import { describeRunCost } from '@/lib/run-cost';
import { STARTER_EXAMPLES } from '@/lib/starter-examples';
import type { SaveProcessModelInput, SaveProcessModelResult } from '@/components/process-map/BpmnEditor';
import { useBreakpointS } from '@/hooks/useBreakpointS';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { useProcessMap } from '@/hooks/useProcessMap';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import { engineVersionOfProject } from '@/lib/run-engine-version';
import { codeCardLabel, codeCardLines, tokenizeAbapLine, type ProcessMapElement, type ProcessMapModel } from '@/lib/process-map';
import { ensureProcessBaseline, fetchLatestRevision, revisionOutcomeSentence, saveProcessRevision } from '@/lib/process-revisions-client';
import { newerBase, revisionLine } from '@/lib/process-revisions';
import type { OpenedRevision } from '@/components/process-map/BpmnEditor';
import { signedSourceAbsence, signedSourceOf } from '@/lib/signed-source';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import type { NotDetermined, WorkspaceView } from '@/lib/workspace-model';
import { bizLinesLabel, bizNamesFailed, bizShowingLines, wt } from '@/lib/workspace-messages';
import type { Project } from '@/lib/types';
import type { DraftHolder } from '@/lib/process-map-draft';

/**
 * Client only and on demand, as on the Documentation stage: the map pulls
 * bpmn-js, and a reader who never reaches the Business view should not pay
 * for it.
 */
const ProcessMap = dynamic(() => import('@/components/process-map/ProcessMap'), { ssr: false });

/** Lines of context above and below a marked range in the source column. */
const SOURCE_CONTEXT = 6;

type Range = { lineStart: number; lineEnd: number };

/**
 * The process map and its source column in the Business view of a real
 * project — mockup s1, `DESIGN.md` §5.5 and §5.7.
 *
 * **Same data path as the Documentation stage and the demo, no new engine.**
 * The source is the one the active run signed (`lib/signed-source.ts`), the
 * model comes from `useProcessMap` — the hook the Documentation stage uses —
 * and `ProcessMap` is mounted as it is. Nothing here reads the code a second
 * way.
 *
 * **Linked both ways.** Selecting a step on the map (or in the step list, or
 * the outline) marks its lines in the source column; selecting a line range in
 * the column — a step under "Steps by line", or the line of a point that is
 * not determined — selects that step on the map. The selection is held here
 * and handed to the map as a controlled prop, so the two can never disagree.
 *
 * **No map is a state, never a blank.** Loading says what is being read; a
 * project without source, without a signed run, or whose source no longer
 * matches the run says which of the three it is and offers the one action
 * that would change it.
 */
export default function WorkspaceProcess({
  project,
  projectId,
  view,
  notDetermined,
  beforeWrite,
  onWritten,
  draftHolder,
  startRun,
  coach,
}: {
  project: Project | null;
  projectId: string;
  view: WorkspaceView;
  /**
   * The Stand check of roadmap 6.9 (CR-15). Saving the map writes a process
   * revision — the very thing the Stand counts — so a save from a screen that
   * has been overtaken stops before it is sent and the notice says why.
   */
  beforeWrite?: () => Promise<boolean>;
  /** A revision this screen wrote, so the Stand holds it and never reports it as somebody else's. */
  onWritten?: (revision: number) => void;
  /** The shell's hold on the unsaved drawing, so a view switch or a breakpoint does not discard it. */
  draftHolder?: DraftHolder;
  /**
   * The engine's own list — the second tab of the source column, where each
   * line opens in the first. The full card, with what the record does not
   * carry, stays in the collapsed row of the page (`#not-determined`).
   */
  notDetermined: NotDetermined;
  /**
   * The signed engine-only run a project starts with (ADR-072). Where the
   * project has source and no run, the map's place shows it being signed, why
   * it was not, or — on a later visit — the one action that signs it here,
   * with its cost said before the click.
   */
  startRun?: StartRun;
  /**
   * The tip "Select the decision point", in the flow right above the map it
   * explains — a floating tip over a map covers the very steps it asks the
   * reader to select, and takes their clicks.
   */
  coach?: React.ReactNode;
}) {
  const signed = useMemo(() => signedSourceOf(project), [project]);
  const absence = useMemo(() => signedSourceAbsence(project), [project]);
  const availability = useModelAvailability();
  // Read only: opening the workspace writes nothing (roadmap 3.0.2), so a
  // missing traceability quote is not measured from here — the map is drawn
  // from the file either way, and the Documentation stage stores the quote.
  /** Bumped after business names were stored, so the map reads them. */
  const [namingRead, setNamingRead] = useState(0);
  const map = useProcessMap(projectId || null, signed, project?.name || '', availability, {
    measure: false,
    reload: namingRead,
  });
  const owner = useIsOwner(project);
  const isS = useBreakpointS();
  const { profile } = useUserProfile();

  const [plane, setPlane] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  /** A range opened from the column itself (a not-determined line) rather than from a step. */
  const [looseRange, setLooseRange] = useState<Range | null>(null);
  const [fullSource, setFullSource] = useState(false);
  const [tab, setTab] = useState<'source' | 'open' | 'steps'>('source');
  const columnRef = useRef<HTMLDivElement>(null);

  /**
   * Business names (owner, 03.10.2026: "Also strange — and how can I generate
   * them?"). The plain names on the map are read from the code without a model
   * and are complete, so where no business names were ever asked for the map
   * shows no "Business names — Not generated" notice: an absence that is the
   * normal state read like a failure, and nothing on the page could change it.
   * A stale or empty naming keeps its notice — that one says something.
   */
  const model = useMemo(
    () =>
      map.model && map.model.naming.state === 'not-named'
        ? { ...map.model, naming: { ...map.model.naming, notice: null } }
        : map.model,
    [map.model],
  );
  /* ---- answering the steps (owner, 03.10.2026) ---- */
  const { outcome: stateOutcome, reload: reloadStates } = useProcessStates(projectId, !!signed);
  const stateView = stateOutcome?.ok ? stateOutcome.view : null;
  const answers = useMemo(() => elementEntries(stateView), [stateView]);
  const subjects = useMemo(
    () => (stateView ? new Set(stateView.subjects.filter((s) => s.kind === 'element').map((s) => s.subject)) : null),
    [stateView],
  );
  /**
   * The guided walk-through (roadmap "3.0.20 — with it", part 1): every step of
   * the map's walk said in plain words, read from the signed source in this
   * browser, as the map is. Read once per model, after the map is drawn, and
   * narrowed to the elements an answer can be stored for once the route says
   * which those are — a narrowing, not a second reading.
   */
  const [fullGuide, setFullGuide] = useState<{ model: ProcessMapModel; guide: WalkGuide } | null>(null);
  useEffect(() => {
    const current = map.model;
    if (!current || !signed) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void import('@/lib/process-walk-guide').then((m) => {
        if (cancelled) return;
        const guide = m.buildWalkGuide(signed.source, current, walkOrder(current, null));
        setFullGuide({ model: current, guide });
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [map.model, signed]);
  const guide = useMemo(
    () => (fullGuide && fullGuide.model === map.model ? restrictGuide(fullGuide.guide, subjects) : null),
    [fullGuide, map.model, subjects],
  );
  const stops = useMemo(() => (guide ? walkStops(guide) : []), [guide]);
  const [walk, setWalk] = useState<number | null>(null);
  const [answering, setAnswering] = useState<{ subject: string; error: string | null } | null>(null);
  /**
   * Answers into the same need revision as the rules — never the signed run.
   * One element, or the same answer for several in one confirmation: the
   * technical steps of the walk, answered once (`busyKey` names the control
   * that asked). Through the same route either way.
   */
  const answerSteps = useCallback(
    async (busyKey: string, ids: readonly string[], state: ElementState, note: string | null) => {
      if (!projectId || ids.length === 0) return;
      const subject = busyKey;
      setAnswering({ subject, error: null });
      let revision = stateView?.revision ?? null;
      if (revision === null) {
        // The need is stated about the reconstructed as-is process; it exists
        // once the server has rebuilt it from the signed run — the same call
        // the rules make.
        const baseline = await ensureProcessBaseline(projectId);
        if (!baseline.ok) {
          setAnswering({ subject, error: revisionOutcomeSentence(baseline) });
          return;
        }
        await reloadStates();
        revision = 0;
      }
      // In slices the route accepts; each confirmation moves the revision on.
      for (let from = 0; from < ids.length; from += MAX_STATE_CHOICES) {
        const slice = ids.slice(from, from + MAX_STATE_CHOICES);
        const result = await confirmProcessStates(
          projectId,
          revision,
          slice.map((id) => ({ subject: id, kind: 'element' as const, state, note })),
        );
        if (!result.ok) {
          setAnswering({ subject, error: confirmOutcomeSentence(result) });
          if (result.code === 'revision-moved') void reloadStates();
          return;
        }
        publishProcessStates(projectId, result.view);
        revision = result.view.revision;
      }
      setAnswering(null);
    },
    [projectId, stateView, reloadStates],
  );
  const answerStep = useCallback(
    (subject: string, state: ElementState, note: string | null) => answerSteps(subject, [subject], state, note),
    [answerSteps],
  );
  /**
   * The map's legend, as the Business view counts it: *Confirmed* is the steps
   * a business answer stands on, read from the need revision; *Proven* is left
   * out, because nothing a business reader can do in this product writes it —
   * the map file marks every element Reconstructed, and Proven would need
   * evidence from a running system the product does not import per element.
   * A counter that can never move is not shown where it cannot change.
   */
  const shownModel = useMemo(() => {
    if (!model) return model;
    const confirmed = Object.values(answers).filter((e) => isConfirmedState(e.state)).length;
    const total = model.legend.reduce((sum, entry) => sum + entry.count, 0);
    return {
      ...model,
      legend: model.legend
        .filter((entry) => entry.value !== 'proven')
        .map((entry) =>
          entry.value === 'confirmed'
            ? { ...entry, count: confirmed }
            : entry.value === 'reconstructed'
              ? { ...entry, count: Math.max(0, total - confirmed) }
              : entry,
        ),
    };
  }, [model, answers]);
  /** A stop of the walk on screen; a step is selected on the map beside it, so the two never disagree. */
  const walkRef = useRef<HTMLDivElement>(null);
  const goToStep = useCallback(
    (index: number) => {
      const stop = stops[index];
      if (!stop) return;
      setWalk(index);
      if (stop.kind === 'step') {
        const element = model?.elements.find((e) => e.id === stop.id);
        if (element) {
          setPlane(element.plane);
          setSelected(element.id);
          setLooseRange(null);
        }
      }
      const node = walkRef.current;
      if (node && node.getBoundingClientRect().top < 0) node.scrollIntoView({ block: 'start' });
    },
    [stops, model],
  );
  /**
   * "Open the walk-through" from the entry at the top of the Business view
   * (`ProcessWalkEntry`): held until the walk is read, then opened where the
   * reader left off — the first open step, or the summary — and brought into view.
   */
  const walkAsked = useRef(false);
  const openAsked = useCallback(() => {
    if (!walkAsked.current || stops.length === 0) return;
    walkAsked.current = false;
    goToStep(owner ? resumeStop(stops, answers) : 0);
    document.getElementById(PROCESS_WALK_ID)?.scrollIntoView({ block: 'start' });
  }, [stops, goToStep, owner, answers]);
  useEffect(() => {
    const hear = () => {
      if (takeProcessWalkRequest(projectId)) walkAsked.current = true;
      openAsked();
    };
    hear();
    window.addEventListener(OPEN_WALK_EVENT, hear);
    return () => window.removeEventListener(OPEN_WALK_EVENT, hear);
  }, [projectId, openAsked]);
  const [naming, setNaming] = useState<{ busy: boolean; note: { state: 'success' | 'error'; text: string } | null }>({
    busy: false,
    note: null,
  });
  /**
   * The one optional model action of the map: offered to the owner, only when
   * a model can be called for this stage right now — a key, and the naming
   * stage switched on — and only while the map has no business names. Never a
   * silent no-op: a refusal says why, beside the button.
   */
  const namesOffered =
    owner &&
    !!signed &&
    availability.known &&
    availability.keyAvailable &&
    availability.stages.naming !== false &&
    !!model &&
    model.naming.state !== 'named';
  const suggestNames = useCallback(async () => {
    if (!signed || !projectId) return;
    setNaming({ busy: true, note: null });
    const outcome = await requestProcessNaming(projectId, namingContextOf(signed.source), {
      known: availability.known,
      keyAvailable: availability.keyAvailable,
      stages: availability.stages,
    });
    if (outcome.ok) {
      setNaming({ busy: false, note: { state: 'success', text: wt('biz.namesProposed') } });
      setNamingRead((n) => n + 1);
    } else {
      setNaming({ busy: false, note: { state: 'error', text: bizNamesFailed(outcome.message) } });
    }
  }, [signed, projectId, availability.known, availability.keyAvailable, availability.stages]);
  const namesCost = describeRunCost({ profile, metered: false, callsModel: true });
  const byId = useMemo(() => {
    const out = new Map<string, ProcessMapElement>();
    for (const element of model?.elements ?? []) out.set(element.id, element);
    return out;
  }, [model]);
  const selectedElement = selected ? byId.get(selected) ?? null : null;

  /**
   * Opened where the process is (ADR-072). Many programs read as one start
   * event, one routine and an end on the top level — the whole process sits
   * one level down, and a map that opens on "Run starts → Execute BAPI
   * creation → Done" is the two-node main line the owner rejected
   * (03.10.2026). Where a level holds exactly one step and that step opens a
   * level of its own, the map opens there; the path above the map leads back
   * up. Once per model, and never against a level the reader chose.
   */
  const openedFor = useRef<ProcessMapModel | null>(null);
  useEffect(() => {
    if (!model || openedFor.current === model) return;
    openedFor.current = model;
    let level: string | null = null;
    for (let depth = 0; depth < 4; depth += 1) {
      const steps = model.elements.filter((e) => e.plane === level && !e.event);
      if (steps.length !== 1 || !steps[0].opensPlane) break;
      level = steps[0].opensPlane;
    }
    if (level !== null) setPlane((current) => (current === null ? level : current));
  }, [model]);

  /** Every anchored step, in the order of the code — the column's way back to the map. */
  const stepsByLine = useMemo(
    () =>
      (model?.elements ?? [])
        .filter((e): e is ProcessMapElement & { anchor: Range } => e.anchor !== null)
        .sort((a, b) => a.anchor.lineStart - b.anchor.lineStart || a.anchor.lineEnd - b.anchor.lineEnd),
    [model],
  );

  const selectStep = useCallback((id: string | null) => {
    setSelected(id);
    setLooseRange(null);
    if (id) setTab('source');
  }, []);

  /** From a line in the column to the step it belongs to, when there is one. */
  const openRange = useCallback(
    (range: Range) => {
      const owner = stepsByLine
        .filter((e) => e.anchor.lineStart <= range.lineStart && e.anchor.lineEnd >= range.lineEnd)
        .sort((a, b) => a.anchor.lineEnd - a.anchor.lineStart - (b.anchor.lineEnd - b.anchor.lineStart))[0];
      if (owner) {
        setPlane(owner.plane);
        setSelected(owner.id);
      }
      setLooseRange(owner ? null : range);
      setTab('source');
      columnRef.current?.scrollIntoView({ block: 'nearest' });
    },
    [stepsByLine],
  );

  const marked: Range | null = selectedElement?.anchor ?? looseRange;

  const lines: CcCodeLine[] = useMemo(() => {
    if (!signed) return [];
    if (fullSource) {
      return signed.source.split(/\r\n|\r|\n/).map((text, i) => {
        const number = i + 1;
        const highlighted = !!marked && number >= marked.lineStart && number <= marked.lineEnd;
        return { number, tokens: tokenizeAbapLine(text), ...(highlighted ? { highlighted: true } : {}) };
      });
    }
    return marked ? codeCardLines(signed.source, marked, SOURCE_CONTEXT) : [];
  }, [signed, fullSource, marked]);

  // In the full listing the marked lines are scrolled into view, not left
  // somewhere in a 700-line file.
  useEffect(() => {
    if (!fullSource || !marked) return;
    const node = columnRef.current?.querySelector('[data-cc-code-line="highlighted"]');
    node?.scrollIntoView({ block: 'center' });
  }, [fullSource, marked]);

  /**
   * Keep the draft as a revision — the same two calls the Documentation stage
   * makes, so editing here and there writes the one history (roadmap 3.2).
   */
  const baseRevision = useRef<number | null>(null);
  const save = useCallback(
    async ({ xml }: SaveProcessModelInput): Promise<SaveProcessModelResult> => {
      if (!projectId) return { ok: false, message: wt('biz.saveNoProject') };
      if (beforeWrite && !(await beforeWrite())) return { ok: false, message: wt('biz.saveOvertaken') };
      if (baseRevision.current === null) {
        const baseline = await ensureProcessBaseline(projectId);
        if (!baseline.ok) return { ok: false, message: revisionOutcomeSentence(baseline) };
        if (baseline.created) onWritten?.(baseline.record.revision);
        baseRevision.current = baseline.record.revision;
      }
      const outcome = await saveProcessRevision(projectId, xml, baseRevision.current);
      if (outcome.ok) {
        baseRevision.current = outcome.record.revision;
        onWritten?.(outcome.record.revision);
        return { ok: true, message: revisionOutcomeSentence(outcome), revisionId: String(outcome.record.revision) };
      }
      return { ok: false, message: revisionOutcomeSentence(outcome) };
    },
    [projectId, beforeWrite, onWritten],
  );

  /**
   * The newest revision, whichever screen saved it — and from now on the base
   * the next save is written against, so a save made on the Documentation stage
   * is continued here rather than refused as "moved".
   */
  const openLatest = useCallback(async (): Promise<OpenedRevision | null> => {
    if (!projectId) return null;
    const record = await fetchLatestRevision(projectId);
    if (!record) return null;
    baseRevision.current = newerBase(baseRevision.current, record.revision);
    return { revision: record.revision, xml: record.xml, line: revisionLine(record), origin: record.origin };
  }, [projectId]);

  const analyzeHref = stageHref({ base: `/project/${projectId}`, path: 'analyze', view, from: WORKSPACE_RETURN.tools });

  /* ------------------------------------------------------------ no map */

  if (!signed) {
    // No source at all: the answer card, "Next step" (Open Analyze) and the
    // empty Need & process layer below already say so — a fourth box saying
    // it again would only push the one action further down.
    if (absence === 'no-source') return <div data-workspace-process="absent" data-absence="no-source" hidden />;
    // A project with source and no run, whose owner is here: the start run is
    // being signed, was refused, or — on a later visit — can be started here
    // (ADR-072). Never an empty box that sends the reader elsewhere.
    if (absence === 'no-run' && startRun && startRun.phase !== 'none' && startRun.phase !== 'signed') {
      const exampleName =
        project?.fromExample === true && STARTER_EXAMPLES.some((e) => e.name === project?.name) ? project?.name : undefined;
      // The start calls the model when the account's analysis stage is on and a
      // key is available (owner decision 03.10.2026) — said here before the click.
      const cost = describeRunCost({ profile, metered: true, callsModel: startRun.callsModel, starterExample: exampleName });
      return (
        <section
          data-workspace-process={startRun.phase === 'running' ? 'signing' : startRun.phase === 'failed' ? 'sign-failed' : 'unsigned'}
          aria-labelledby="workspace-process-title"
          className="flex flex-col gap-3"
        >
          <h2
            id="workspace-process-title"
            className="m-0 text-[12px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase"
          >
            {wt('biz.needAndProcess')}
          </h2>
          <CcCard title={wt('biz.mapSignTitle')} level={3}>
            {startRun.phase === 'running' ? (
              <div data-workspace-process-loading="" className="flex flex-col gap-2">
                {startRun.step === 'narrative' && startRun.narrativeSince !== null ? (
                  <StartNarrativeWait since={startRun.narrativeSince} onContinue={startRun.continueWithout} />
                ) : (
                  <p className="m-0 text-[13px] font-medium text-cc-ink">
                    {startRun.callsModel ? wt('biz.mapSigningModel') : wt('biz.mapSigning')}
                  </p>
                )}
                <CcSkeleton shape="text" count={5} label={wt('biz.mapLoadingLabel')} />
              </div>
            ) : startRun.phase === 'failed' ? (
              <CcMessageStrip
                state="error"
                headline={wt('biz.mapSignFailed')}
                actions={
                  <>
                    <CcButton onClick={startRun.start} data-workspace-sign-retry="">
                      {wt('biz.mapSignRetry')}
                    </CcButton>
                    <CcLinkButton href={analyzeHref} variant="ghost">
                      {wt('biz.openAnalyze')}
                    </CcLinkButton>
                  </>
                }
              >
                {startRun.message}
              </CcMessageStrip>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="m-0 max-w-3xl text-[13px] leading-snug font-medium text-cc-ink">
                  {startRun.callsModel ? wt('biz.mapSignLeadModel') : wt('biz.mapSignLead')}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <CcButton
                    variant="secondary"
                    onClick={startRun.start}
                    disabled={cost.blocked}
                    data-workspace-sign=""
                  >
                    {wt('biz.mapSign')}
                  </CcButton>
                  <CcRunCost cost={cost} />
                </div>
              </div>
            )}
          </CcCard>
        </section>
      );
    }
    const reason =
      absence === 'no-run' ? wt('biz.mapNoRun') : wt('biz.mapChanged');
    return (
      <section data-workspace-process="absent" data-absence={absence ?? 'unknown'} aria-labelledby="workspace-process-title">
        <h2 id="workspace-process-title" className="sr-only">
          {wt('biz.mapTitle')}
        </h2>
        <CcEmptyState
          illustration={<FileCode2 size={28} aria-hidden={true} className="text-cc-ink-muted" />}
          title={wt('biz.mapAbsentTitle')}
          action={
            <CcLinkButton href={analyzeHref} variant="ghost">
              {wt('biz.openAnalyze')}
            </CcLinkButton>
          }
        >
          {reason}
        </CcEmptyState>
      </section>
    );
  }

  /* --------------------------------------------------------- the column */

  const column = (
    <div
      ref={columnRef}
      data-workspace-source-column=""
      className="flex min-w-0 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4"
    >
      <CcTabs
        label={wt('biz.columnLabel')}
        value={tab}
        onChange={setTab}
        tabs={[
          {
            value: 'source',
            label: wt('biz.tabSource'),
            content: (
              <div data-workspace-source="" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-cc-mono text-[13px] font-semibold text-cc-ink">{signed.fileName}</span>
                  {marked ? (
                    <CcAnchor label={bizLinesLabel(marked.lineStart, marked.lineEnd)}>
                      {marked.lineStart === marked.lineEnd ? `L${marked.lineStart}` : `L${marked.lineStart}-${marked.lineEnd}`}
                    </CcAnchor>
                  ) : null}
                  {selectedElement ? (
                    <span data-workspace-source-step="" className="text-[13px] font-medium text-cc-ink-muted">
                      {selectedElement.label}
                    </span>
                  ) : null}
                </div>
                {owner && selectedElement && walk === null && stateView?.subjects.some((s) => s.subject === selectedElement.id) ? (
                  <div data-workspace-step-need="" className="flex flex-col gap-2 border-b border-cc-line pb-3">
                    <p className="m-0 text-[13px] font-semibold text-cc-ink">{wt('biz.stepNeedTitle')}</p>
                    <StateChoice
                      key={selectedElement.id}
                      subject={stateView.subjects.find((s) => s.subject === selectedElement.id)!}
                      entry={answers[selectedElement.id] ?? null}
                      busy={answering?.subject === selectedElement.id && answering.error === null}
                      error={answering?.subject === selectedElement.id ? answering.error : null}
                      onConfirm={(state, note) => answerStep(selectedElement.id, state, note)}
                    />
                  </div>
                ) : null}
                {lines.length > 0 ? (
                  <div className={fullSource ? 'max-h-112 overflow-y-auto' : undefined}>
                    <CcCodeSurface
                      lines={lines}
                      label={marked ? codeCardLabel(signed.fileName, marked) : signed.fileName}
                    />
                  </div>
                ) : (
                  <p data-workspace-source-hint="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
                    {wt('biz.sourceHint')}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <CcButton onClick={() => setFullSource((v) => !v)} aria-pressed={fullSource} data-workspace-source-full="">
                    {fullSource ? wt('biz.showMarkedOnly') : wt('biz.showFullSource')}
                  </CcButton>
                  {marked && !fullSource ? (
                    <span className="text-[12px] font-medium text-cc-ink-muted">
                      {bizShowingLines(lines[0]?.number ?? marked.lineStart, lines[lines.length - 1]?.number ?? marked.lineEnd)}
                    </span>
                  ) : null}
                </div>
              </div>
            ),
          },
          {
            value: 'open',
            label: wt('biz.tabNotDetermined'),
            count: notDetermined.noSource ? undefined : notDetermined.count,
            content: (
              <div data-workspace-source-open="" className="flex flex-col gap-3">
                {notDetermined.items.length > 0 ? (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {notDetermined.items.map((item, i) => {
                      const range = rangeOf(item.anchor);
                      return (
                        <li key={`${item.anchor}-${i}`} data-workspace-source-open-item="" className="flex flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-semibold text-cc-ink">{item.label}</span>
                            {range ? (
                              <CcAnchor onOpen={() => openRange(range)} label={bizLinesLabel(range.lineStart, range.lineEnd)}>
                                {item.anchor}
                              </CcAnchor>
                            ) : (
                              <CcAnchor tone="unlinked">{item.anchor}</CcAnchor>
                            )}
                          </span>
                          <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">{item.why}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
                    {notDetermined.noSource ? wt('notDetermined.noSource') : wt('notDetermined.none')}
                  </p>
                )}
              </div>
            ),
          },
          {
            value: 'steps',
            label: wt('biz.tabStepsByLine'),
            count: stepsByLine.length,
            content: (
              <ol data-workspace-steps-by-line="" className="m-0 flex max-h-112 list-none flex-col gap-1 overflow-y-auto p-0">
                {stepsByLine.map((element) => (
                  <li key={element.id} className="flex items-center gap-2">
                    <CcAnchor
                      onOpen={() => {
                        setPlane(element.plane);
                        selectStep(element.id);
                      }}
                      tone={element.id === selected ? 'hot' : 'linked'}
                      label={`${element.label}, ${bizLinesLabel(element.anchor.lineStart, element.anchor.lineEnd)}`}
                    >
                      {element.anchor.lineStart === element.anchor.lineEnd
                        ? `L${element.anchor.lineStart}`
                        : `L${element.anchor.lineStart}-${element.anchor.lineEnd}`}
                    </CcAnchor>
                    <span className="min-w-0 truncate text-[13px] font-medium text-cc-ink">{element.label}</span>
                  </li>
                ))}
              </ol>
            ),
          },
        ]}
      />
    </div>
  );

  /* ------------------------------------------------------------ the map */

  return (
    <div data-workspace-process={model ? 'ready' : map.status} className="flex flex-col gap-4">
      {/* The eyebrow of mockup s1. The map names itself (its own title,
          legend and provenance counts), so the card around it carries none. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2
          id="workspace-process-title"
          className="m-0 text-[12px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase"
        >
          {wt('biz.needAndProcess')}
        </h2>
        {namesOffered ? (
          <div data-workspace-suggest-names="" className="cc-no-print flex flex-wrap items-center gap-2">
            <CcButton
              variant="ghost"
              icon={<Tags size={16} aria-hidden={true} />}
              busy={naming.busy}
              onClick={() => void suggestNames()}
              data-workspace-suggest-names-button=""
            >
              {naming.busy ? wt('biz.suggestingNames') : wt('biz.suggestNames')}
            </CcButton>
            <CcRunCost cost={namesCost} />
          </div>
        ) : null}
      </div>
      {namesOffered && !naming.note ? (
        <p className="m-0 max-w-3xl text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('biz.suggestNamesNote')}</p>
      ) : null}
      {naming.note ? (
        <CcMessageStrip state={naming.note.state} announce={true}>
          <span data-workspace-names-note={naming.note.state}>{naming.note.text}</span>
        </CcMessageStrip>
      ) : null}
      {/* The walk-through first (roadmap "3.0.20 — with it", part 1): the
          leading way into the process for a business reader, said in plain
          words before it asks; the map below selects the step on screen. */}
      {model ? (
        <div ref={walkRef}>
          <ProcessWalkThrough
            projectId={projectId}
            guide={guide}
            stops={stops}
            at={walk}
            answers={answers}
            subjectOf={(id) => stateView?.subjects.find((s) => s.subject === id) ?? null}
            owner={owner}
            answering={answering}
            onAnswer={answerStep}
            onAnswerMany={(ids, state, note) => answerSteps(WALK_TECHNICAL_SUBJECT, ids, state, note)}
            onGo={goToStep}
            onClose={() => setWalk(null)}
            onOpenLines={openRange}
            source={signed.source}
            fileName={signed.fileName}
          />
        </div>
      ) : null}
      {coach}
      <div data-coach-target="decision">
        <CcCard>
          {model ? (
            <ProcessMap
              key={isS ? 'steps' : 'map'}
              model={shownModel ?? model}
              source={signed.source}
              measuredAt={map.measuredAt}
              usage={project?.usageReport ?? null}
              catalogTarget={project ? catalogLookupTargetOf(project) : null}
              engineVersion={engineVersionOfProject(project)}
              plane={plane}
              onPlaneChange={setPlane}
              selected={selected}
              onSelectedChange={selectStep}
              // The map on every width (ADR-072): on a phone it opens fitted,
              // never below 40 % (`fitWhole`), with full screen and zoom; the
              // step list stays one tab away.
              defaultView="map"
              canvasControls
              save={save}
              openLatest={openLatest}
              projectId={projectId || null}
              draftHolder={draftHolder}
              canEdit={owner}
            />
          ) : map.status === 'failed' ? (
            <p data-workspace-process-failed="" className="m-0 text-[13px] font-medium text-cc-ink-muted">
              {map.reason}
            </p>
          ) : (
            <div data-workspace-process-loading="" className="flex flex-col gap-2">
              <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('biz.mapReading')}</p>
              <CcSkeleton shape="text" count={6} label={wt('biz.mapLoadingLabel')} />
            </div>
          )}
        </CcCard>
      </div>
      {model ? column : null}
    </div>
  );
}

/** `L412` or `L380-412` (also with an en dash) to a line range; null for anything else. */
function rangeOf(anchor: string): Range | null {
  const m = /^L?(\d+)(?:\s*[-–]\s*L?(\d+))?$/.exec(anchor.trim());
  if (!m) return null;
  const lineStart = Number(m[1]);
  const lineEnd = m[2] ? Number(m[2]) : lineStart;
  return lineEnd >= lineStart ? { lineStart, lineEnd } : null;
}
