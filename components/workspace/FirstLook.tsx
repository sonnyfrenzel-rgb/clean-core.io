'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, CircleDashed, FileCode } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcDisclosure from '@/components/cc/Disclosure';
import CcSwitch from '@/components/cc/Switch';
import { CcRulePropertyTag } from '@/components/cc/Tag';
import CcCodeSurface, { type CcCodeLine } from '@/components/cc/CodeSurface';
import FirstLookBuildUp, { ExcerptSvg, type BuildUpMapState } from './FirstLookBuildUp';
import { requestRuleEditing, useIsOwner } from './BusinessRulesEditor';
import { BUILD_UP_BUDGET, buildUpStageAt } from '@/lib/first-look-buildup';
import { firstLookExcerpt } from '@/lib/first-look-excerpt';
import { rulesConfirmed, stepStrip, type StepChip } from '@/lib/rules-editor';
import { tokenizeAbapLine } from '@/lib/process-map';
import { useProcessStates } from '@/hooks/useProcessStates';
import {
  buildFirstLook,
  businessLanguageStage,
  codeReadStage,
  decisionLines,
  processNameOf,
  processStage,
  readProcess,
  readRules,
  readTableAccess,
  revealedRules,
  tablesOf,
  traceabilityOf,
  yourProcessStage,
  type DecisionLine,
  type FirstLookFigure,
  type FirstLookStage,
  type ProcessName,
  type ProcessReading,
  type SourceReading,
  type Traceability,
} from '@/lib/first-look';
import { notDetermined, type NotDetermined } from '@/lib/workspace-model';
import { applyNaming, type ProcessNamingRecord } from '@/lib/process-naming';
import { fetchProcessNaming } from '@/lib/process-naming-client';
import type { BusinessRuleSet } from '@/lib/abap/business-rule-set';
import type { TableDependency } from '@/lib/abap/table-dependencies';
import { buildBusinessCard, headlineLead, plainWordingFor, type BusinessCard, type CardFact } from '@/lib/business-card';
import type { Project } from '@/lib/types';
import {
  wt,
  firstLookMoreRules,
  firstLookOutcomes,
  firstLookOpenGroup,
  firstLookOpenTitle,
  firstLookReading,
  firstLookConfirmRules,
  firstLookOf,
} from '@/lib/workspace-messages';

/**
 * The first look — `DESIGN.md` §5.1, §5.2, roadmap 2.7.
 *
 * Four stages: *Code read · Process recognised · In business language · This is
 * your process*. Three rules decide everything below, and each of them was a way
 * of getting this wrong:
 *
 *   1. **Every number comes from the run.** The figures are built in
 *      `lib/first-look.ts` and each carries where it came from — the signed run,
 *      the engine here and now, or nowhere at all. A figure with no origin is
 *      printed as a word ("not analysed"), never as `0`. Nothing in this
 *      component computes a number of its own.
 *   2. **The work is never padded; the showing is paced** (§5.4, ADR-072). Each
 *      stage's data is produced by *its own call* — stage 1 by the table read,
 *      stage 2 by the skeleton, stage 3 by the stored naming, stage 4 by the
 *      rules — and on a small source all four land in two frames. What a
 *      reader sees is paced so it can be followed (owner, 03.10.2026: "not too
 *      fast"): every moment shows that real content, none shows a wait, and
 *      Skip and reduced motion go straight to the end.
 *   3. **A stage with nothing to show says so.** Stage 3 needs a naming from
 *      roadmap 2.4; without one it reports the reason `applyNaming` gives and
 *      the technical names stay. §5.2 calls that a valid result, so it is not
 *      painted as a failure.
 *
 * `prefers-reduced-motion` shows the **end state** — not a faster build-up: the
 * work still takes what it takes, and nothing is revealed until all of it is in,
 * so no stage ever appears and disappears under a reader who asked for less
 * movement. "Skip" reaches the same state, which is why it sets the same flag.
 *
 * What this step deliberately does not build: the process map growing out of the
 * lit source line (roadmap 2.5, 2.9) and the plain-language sentence under the
 * name (roadmap 2.4). Both belong to other rows, and a placeholder for either
 * would be the claim the *Not determined* area exists to rule out.
 */

const HAS_WINDOW = typeof window !== 'undefined';

/** How long the build-up's last moment waits for a start run that is still being signed, in ms. */
const MAP_WAIT = 12000;

/** Stage 3 without a stored naming — the technical names stay. */
const NO_NAMING: { record: ProcessNamingRecord | null } = { record: null };

function useReducedMotion(): boolean {
  // Read once when the state is created, so not a single frame of the
  // build-up is painted for a reader who asked for less movement (ADR-072:
  // "the end state at once"). Both callers render this component only on the
  // client — after the profile has loaded — so there is no server render to
  // disagree with; without `matchMedia` the answer is "not reduced", and the
  // effect below follows any later change.
  const [reduced, setReduced] = useState(() => {
    if (!HAS_WINDOW || typeof window.matchMedia !== 'function') return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!HAS_WINDOW || typeof window.matchMedia !== 'function') return;
    let query: MediaQueryList;
    try {
      query = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Runs `work` after the next paint, so the previous stage is visible first. */
function afterPaint(work: () => void): () => void {
  if (!HAS_WINDOW || typeof window.requestAnimationFrame !== 'function') {
    work();
    return () => {};
  }
  const handle = window.requestAnimationFrame(() => work());
  return () => window.cancelAnimationFrame(handle);
}

function Figure({ figure }: { figure: FirstLookFigure }) {
  return (
    <span
      data-first-look-figure={figure.key}
      data-origin={figure.origin}
      className="text-[12px] font-medium text-cc-ink-muted"
    >
      {figure.label}{' '}
      {figure.value === null ? (
        <span data-first-look-absent="" className="font-medium text-cc-ink-muted">
          {figure.absentReason}
        </span>
      ) : (
        <b className="font-bold text-cc-ink">{figure.value}</b>
      )}
    </span>
  );
}

function StageRow({ stage }: { stage: FirstLookStage | null; }) {
  if (!stage) return null;
  return (
    <li
      data-first-look-stage={stage.id}
      data-state={stage.state}
      className="flex items-start gap-2 text-[13px] leading-snug"
    >
      <span
        aria-hidden={true}
        className={
          stage.state === 'measured' ? 'mt-0.5 shrink-0 text-cc-success' : 'mt-0.5 shrink-0 text-cc-ink-muted'
        }
      >
        {stage.state === 'measured' ? <Check size={16} /> : <CircleDashed size={16} />}
      </span>
      <span className="min-w-0">
        <span className="font-semibold text-cc-ink">{stage.label}</span>
        <span className="text-cc-ink-muted"> — {stage.result}</span>
        {stage.figures.length > 0 ? (
          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {stage.figures.map((figure) => (
              <Figure key={figure.key} figure={figure} />
            ))}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** What the last stage of the build-up produces, once every call has returned. */
interface Result {
  processName: ProcessName;
  traceability: Traceability;
  decisions: DecisionLine[];
  ruleCount: number;
  open: NotDetermined;
  /** The same reading, re-cut for a business reader (`lib/business-card.ts`). */
  card: BusinessCard;
  /** The first steps of the first entry, in plain words — the strip of moment 4. */
  steps: { steps: StepChip[]; more: boolean };
}

export default function FirstLook({
  project,
  projectId,
  buildUp = true,
  onReading,
  namingFrom = 'project',
  proposedName = null,
  onOpenMap,
  map = 'unsigned',
  fullMapBelow = false,
  onSettled,
}: {
  project: Project | null;
  projectId: string;
  /**
   * False on a second visit — *"A second visit has no build-up"* (§5.2).
   * The four calls still run in the same order; only the staged reveal is gone,
   * which is the same thing `prefers-reduced-motion` and "Skip" ask for.
   */
  buildUp?: boolean;
  /**
   * The reading, handed up once every call has returned, so the screen around
   * this card can use the same skeleton and the same rule set instead of
   * parsing the source a second time.
   */
  onReading?: (reading: SourceReading) => void;
  /**
   * Where stage 3's naming comes from. `'none'` for the demo (roadmap 3.0.7):
   * it has no project document to read a naming from and calls no model, so
   * the stage reports the absence instead of asking a route that would refuse.
   */
  namingFrom?: 'project' | 'none';
  /**
   * A process name the model proposed, when one exists. Shown as the title
   * with the chip *Model proposal · name*; the program's own name stays under
   * it. Without one, the program's name is the title.
   */
  proposedName?: string | null;
  /**
   * Scrolls to the full process map, where the screen has one (Business). The
   * picture in this card is the main line only; this is the way to the rest.
   */
  onOpenMap?: () => void;
  /**
   * Where the full map stands (ADR-072): drawn from a signed run, being signed
   * by the start run, refused, or not signed. The build-up's last moment says
   * which, and waits — briefly — for a start run that is still being signed,
   * so it ends on the map rather than on an empty place for it.
   */
  map?: BuildUpMapState;
  /**
   * True where the signed map stands directly under this card (Business). The
   * picture of the main line then gives way to it: the same process twice,
   * one of them a two-node excerpt, was what the owner read as "a small main
   * line" (03.10.2026). Without the map below, the picture stays (ADR-059).
   */
  fullMapBelow?: boolean;
  /** Told when the build-up is over (end state on screen) — the tips wait for it. */
  onSettled?: (settled: boolean) => void;
}) {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const hasSource = source.trim().length > 0;
  const sourceName =
    project?.auditMetadata?.inputFingerprint?.fileName || project?.name || projectId;
  const reduced = useReducedMotion();

  const [skipped, setSkipped] = useState(false);
  const [access, setAccess] = useState<TableDependency[] | null>(null);
  const [process, setProcess] = useState<ProcessReading | null>(null);
  const [naming, setNaming] = useState<{ record: ProcessNamingRecord | null } | null>(null);
  const [rules, setRules] = useState<BusinessRuleSet | null>(null);

  /**
   * Every stage above holds a reading of *one* source, and nothing in them says
   * which. If this instance is ever handed a different project or a different
   * source, the four would still be full of the last one's answer until the
   * effects below have run — and the screen would show a process name, a
   * traceability quote, decisions and rules belonging to a program the reader is
   * not looking at. That is the one thing this whole screen exists to prevent:
   * every number here is supposed to come from this run.
   *
   * So the reading is tied to what it was read from, and a change throws it away
   * during the render that brings it, before anything is painted (React's
   * "adjusting state when a prop changes"). Today the page fetches once per
   * `projectId` and a full navigation remounts, so this is a guard rather than a
   * fix for a reachable bug — which is the point: the next caller that keeps the
   * instance alive should not have to discover this.
   */
  const readingKey = `${projectId} ${source}`;
  const [readFor, setReadFor] = useState(readingKey);
  if (readFor !== readingKey) {
    setReadFor(readingKey);
    setAccess(null);
    setProcess(null);
    setNaming(null);
    setRules(null);
    setSkipped(false);
  }

  /* ---- stage 1's work ---- */
  useEffect(() => {
    if (!hasSource) return;
    return afterPaint(() => setAccess(readTableAccess(source)));
  }, [source, hasSource]);
  const tables = useMemo(() => (access ? tablesOf(access) : null), [access]);

  /* ---- stage 2's work, once stage 1 has been painted ---- */
  useEffect(() => {
    if (!hasSource || tables === null) return;
    return afterPaint(() => setProcess(readProcess(source)));
  }, [source, hasSource, tables]);

  /* ---- stage 3's work: the stored naming of roadmap 2.4, or none ---- */
  useEffect(() => {
    if (!hasSource) return;
    if (namingFrom === 'none') {
      setNaming({ record: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      const record = await fetchProcessNaming(projectId);
      if (!cancelled) setNaming({ record });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, hasSource, namingFrom]);

  /* ---- stage 4's work ---- */
  useEffect(() => {
    if (!hasSource || !process) return;
    return afterPaint(() => setRules(readRules(source, process)));
  }, [source, hasSource, process]);

  /**
   * "The model does not hold up the build-up" (mockup s0, DESIGN.md §5.2): the stored naming
   * is one network read, and once the build-up's budget is spent — or the reader
   * skipped — the end state does not wait for it. The process stands with the
   * names it has; a naming that arrives later changes them once.
   */
  const [elapsed, setElapsed] = useState(0);
  const namingNow = naming ?? (skipped || elapsed >= BUILD_UP_BUDGET.endAt ? NO_NAMING : null);
  const named = useMemo(
    () => (process && namingNow ? applyNaming(process.context, namingNow.record) : null),
    [process, namingNow],
  );

  const stages = useMemo<(FirstLookStage | null)[]>(() => {
    if (!hasSource) {
      // Nothing was staged: all four stages are `did-not-run`, and they say so
      // in one pass because there is no work to wait for.
      return buildFirstLook(project).stages;
    }
    return [
      tables ? codeReadStage(project, tables) : null,
      process ? processStage(process.skeleton) : null,
      named ? businessLanguageStage(named) : null,
      null,
    ];
  }, [hasSource, project, tables, process, named]);

  const result = useMemo<Result | null>(() => {
    if (!hasSource || !process || !named || !rules || !access) return null;
    const traceability = traceabilityOf(named);
    const open = notDetermined(project);
    return {
      processName: processNameOf(rules),
      traceability,
      decisions: decisionLines(process.skeleton),
      ruleCount: rules.rules.length,
      open,
      card: buildBusinessCard({
        skeleton: process.skeleton,
        ruleSet: rules,
        dependencies: access,
        traceability,
        open,
        wording: plainWordingFor(source, process.skeleton),
      }),
      steps: stepStrip(process.skeleton, source),
    };
  }, [hasSource, source, process, named, rules, access, project]);

  const finalStage = useMemo<FirstLookStage | null>(
    () =>
      result && rules
        ? yourProcessStage(revealedRules(rules), result.traceability, result.open)
        : null,
    [result, rules],
  );

  const complete = !hasSource || result !== null;

  /**
   * The process the build-up drew, kept in the end state (owner, 02.10.2026:
   * "The process always has to be shown … with first look — the process was
   * there briefly and then gone"). The build-up grows this drawing beside
   * the code; the end state used to drop it for the step strip, so the one
   * picture of the process on the first screen vanished after ~2.4 s. Same
   * skeleton, same layout, plain names, every node with its line — nothing is
   * added (`lib/first-look-excerpt.ts`).
   */
  const drawing = useMemo(() => firstLookExcerpt(process?.skeleton ?? null, source), [process, source]);

  useEffect(() => {
    if (!process || !rules || tables === null) return;
    onReading?.({
      skeleton: process.skeleton,
      context: process.context,
      ruleSet: rules,
      tables,
    });
  }, [process, rules, tables, onReading]);

  const skip = useCallback(() => setSkipped(true), []);

  /**
   * The build-up's clock — at a pace a reader can follow (ADR-072).
   *
   * Runs only when a build-up was asked for and nobody asked for less movement
   * or pressed Skip. The moments follow the budget in
   * `lib/first-look-buildup.ts`; the end state takes over at its end, or as
   * soon as the engine is done if that is later, or once the start run is
   * signed if the map is still being signed then — at most MAP_WAIT later.
   */
  const animate = buildUp && !reduced && !skipped && hasSource;
  const mapRef = React.useRef(map);
  useEffect(() => {
    mapRef.current = map;
  }, [map]);
  useEffect(() => {
    if (!animate || !HAS_WINDOW || typeof window.requestAnimationFrame !== 'function') return;
    let handle = 0;
    const start = window.performance.now();
    const tick = (now: number) => {
      const next = now - start;
      setElapsed(next);
      const waiting = mapRef.current === 'running' && next < BUILD_UP_BUDGET.endAt + MAP_WAIT;
      if (next < BUILD_UP_BUDGET.endAt || waiting) handle = window.requestAnimationFrame(tick);
    };
    handle = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(handle);
  }, [animate, readingKey]);
  // The last moment holds while the start run is still being signed — up to
  // MAP_WAIT, never longer: a slow server is said where the map goes, not by
  // a build-up that does not end.
  const waitingForMap = map === 'running' && elapsed < BUILD_UP_BUDGET.endAt + MAP_WAIT;
  const playing = animate && (elapsed < BUILD_UP_BUDGET.endAt || !complete || waitingForMap);
  useEffect(() => {
    onSettled?.(!playing);
  }, [playing, onSettled]);

  const owner = useIsOwner(project);
  const [sourceOpen, setSourceOpen] = useState(false);

  /** The lines the card points to — the rules and the decisions — for "Show source". */
  const sourceListing = useMemo<CcCodeLine[]>(() => {
    if (!result) return [];
    const all = source.split(/\r\n|\r|\n/);
    const wanted = new Set<number>();
    const add = (anchor: string | null) => {
      const m = anchor ? /^L(\d+)(?:-(\d+))?$/.exec(anchor) : null;
      if (!m) return;
      const from = Number(m[1]);
      const to = m[2] ? Math.min(Number(m[2]), from + 2) : from;
      for (let n = from; n <= to; n += 1) wanted.add(n);
    };
    for (const rule of result.card.rules) rule.anchors.slice(0, 2).forEach(add);
    for (const decision of result.card.decisions) add(decision.anchor);
    return [...wanted]
      .sort((a, b) => a - b)
      .slice(0, 48)
      .map((n) => ({ number: n, tokens: tokenizeAbapLine(all[n - 1] ?? ''), highlighted: true }));
  }, [result, source]);
  const { outcome: states } = useProcessStates(projectId, hasSource);
  // No reconstructed baseline yet means nobody has confirmed anything: 0 of n,
  // which is a fact. Only a read that failed leaves the figure not determined.
  const confirmed = useMemo(() => {
    if (states?.ok) return rulesConfirmed(states.view);
    if (states && states.code === 'no-baseline' && rules) return { confirmed: 0, total: rules.rules.length };
    return null;
  }, [states, rules]);

  const reached = stages.filter(Boolean).length + (finalStage ? 1 : 0);

  const shown: (FirstLookStage | null)[] = hasSource
    ? [stages[0], stages[1], stages[2], finalStage]
    : stages;

  /**
   * One announcement per stage, and only the newest (`DESIGN.md` §2.8, §8;
   * roadmap 3.0.4). The region used to hold every stage reached so far, so each
   * new stage made a screen reader repeat the ones before it — four stages, ten
   * announcements. It also lived inside whichever branch below was rendering,
   * so the region itself was replaced as the build-up moved on, and a live
   * region that is inserted together with its text is not reliably read at all.
   * It now stands once, after the card, for the whole life of this component.
   */
  // While the build-up plays, the stage on the screen is the one announced —
  // the engine is usually done long before the picture is, and announcing its
  // fourth stage while the first is painted would read the screen out of order.
  const playingStage = playing ? buildUpStageAt(elapsed) : null;
  const playingIndex =
    playingStage === null
      ? null
      : playingStage === 'code-read'
        ? 0
        : playingStage === 'process-recognised'
          ? 1
          : playingStage === 'business-language'
            ? 2
            : 3;
  const latest =
    (playingIndex !== null ? shown.slice(0, playingIndex + 1) : shown)
      .slice()
      .reverse()
      .find((s): s is FirstLookStage => s !== null) ?? null;
  const announcement = latest ? `${latest.label}: ${latest.result}` : '';
  const live = (
    <span aria-live="polite" data-first-look-live="" className="sr-only">
      {announcement}
    </span>
  );

  /**
   * Reduced motion and Skip both mean *the end state*. Until the engine has it
   * there is nothing to show but what is being read — §5.1 is explicit that a
   * slow engine says what it is reading rather than drawing a progress bar.
   */
  const endStateOnly = reduced || skipped || !buildUp;

  if (!complete && endStateOnly) {
    // `level={2}`: in Business this card is the first thing under the
    // project's `h1` (§2.9), and a card title there would skip a level (§2.3).
    return (
      <>
        <section data-first-look="waiting" data-reduced-motion={reduced ? 'true' : 'false'}>
          <CcCard title={wt('firstLook.title')} level={2} meta={<CcProvenanceChip value="reconstructed" />}>
            <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
              {firstLookReading(sourceName)}
            </p>
          </CcCard>
        </section>
        {live}
      </>
    );
  }

  /* ------------------------------------------------------------ the build-up */

  if (playing) {
    return (
      <>
        <section data-first-look="building" data-reached={reached}>
          <div className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
            <FirstLookBuildUp
              source={source}
              sourceName={sourceName}
              access={access}
              skeleton={process?.skeleton ?? null}
              named={named}
              elapsed={elapsed}
              onSkip={skip}
              card={result?.card ?? null}
              map={map}
            />
          </div>
        </section>
        {live}
      </>
    );
  }

  /* ---------------------------------------------------------- the end state */

  return (
    <>
      <section
        data-first-look={endStateOnly ? 'end-state' : 'complete'}
        data-reduced-motion={reduced ? 'true' : 'false'}
      >
        <CcCard
          title={wt('firstLook.cardTitle')}
          level={2}
          // No chip on "nothing to show": a provenance says where a statement
          // came from, and an empty project makes none (audit row 17).
          meta={result ? <CcProvenanceChip value="reconstructed" /> : null}
          actions={
            result && sourceListing.length > 0 ? (
              <span className="cc-no-print">
                <CcButton
                  variant="ghost"
                  icon={<FileCode size={16} aria-hidden={true} />}
                  aria-expanded={sourceOpen}
                  onClick={() => setSourceOpen((v) => !v)}
                  data-first-look-show-source=""
                >
                  {sourceOpen ? wt('firstLook.hideSource') : wt('firstLook.showSource')}
                </CcButton>
              </span>
            ) : null
          }
        >
          {result ? (
            <div
              className={
                fullMapBelow && !sourceOpen
                  ? 'grid grid-cols-1 gap-4'
                  : 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]'
              }
            >
              <EndState result={result} proposedName={proposedName} confirmed={confirmed} owner={owner} mapBelow={fullMapBelow} />
              <div className="flex min-w-0 flex-col gap-4">
                {/* The full map stands right under this card where it is
                    signed (ADR-072); the two-node main line would only be the
                    same process again, smaller. */}
                {fullMapBelow ? null : <FirstLookProcess drawing={drawing} onOpenMap={onOpenMap} />}
                {sourceOpen ? (
                  <div data-first-look-source="" className="min-w-0">
                    <CcCodeSurface lines={sourceListing} label={wt('firstLook.sourceLabel')} />
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <p data-first-look-result="none" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
              {wt('firstLook.noSource')}
            </p>
          )}

          {/* The four stages stay on the page after the build-up: they are the
              receipt for every figure above. Folded, not removed — the process
              owner reads the answer, the sceptic opens the receipt. Open when
              there is no answer, because then the stages are all there is. */}
          <div className="mt-4 border-t border-cc-line pt-2">
            <CcDisclosure title={wt('firstLook.derivedTitle')} defaultOpen={!result} level={3}>
              <ol
                data-first-look-stages={endStateOnly ? 'end-state' : 'built'}
                className="m-0 flex list-none flex-col gap-2 p-0"
              >
                {shown.map((stage, i) => (
                  <StageRow key={stage?.id ?? `done-${i}`} stage={stage} />
                ))}
              </ol>
              {result ? (
                <dl data-first-look-meanings="" className="m-0 mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
                  {result.card.facts.map((fact) => (
                    <React.Fragment key={fact.key}>
                      <dt className="text-[12px] font-semibold text-cc-ink">{fact.label}</dt>
                      <dd className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{fact.explanation}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              ) : null}
            </CcDisclosure>
          </div>
        </CcCard>
      </section>
      {live}
    </>
  );
}

/* ------------------------------------------------------- the end state, parts */

/**
 * The picture of the process in the end state — the drawing the build-up
 * grew, whole and with plain names. A source the engine could not draw says
 * so in one sentence; it never leaves an empty frame.
 */
function FirstLookProcess({
  drawing,
  onOpenMap,
}: {
  drawing: ReturnType<typeof firstLookExcerpt>;
  onOpenMap?: () => void;
}) {
  if (drawing.nodes.length === 0) {
    return (
      <p data-first-look-process="none" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
        {wt('firstLook.processNone')}
      </p>
    );
  }
  return (
    <figure data-first-look-process="drawn" className="m-0 flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line p-3">
      <figcaption className="text-[12px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
        {wt('firstLook.processTitle')}
      </figcaption>
      <ExcerptSvg drawing={drawing} grown={drawing.nodes.length} named fit label={wt('firstLook.processLabel')} />
      {onOpenMap ? (
        <span className="cc-no-print">
          <CcButton variant="ghost" onClick={onOpenMap} data-first-look-open-map="">
            {wt('firstLook.openMap')}
          </CcButton>
        </span>
      ) : null}
    </figure>
  );
}

/** A line anchor chip, labelled for a screen reader. */
function Anchor({ anchor }: { anchor: string | null }) {
  return anchor ? (
    <CcAnchor label={`${wt('firstLook.sourceLine')} ${anchor}`}>{anchor}</CcAnchor>
  ) : (
    <CcAnchor tone="unlinked">{wt('firstLook.noLine')}</CcAnchor>
  );
}

/** Code shown as code — the fallback when the wording has no plain words. */
function CodeText({ children }: { children: string }) {
  return <code className="font-cc-mono text-[12px] font-medium text-cc-ink">{children}</code>;
}

/**
 * One key figure. The traceability figure carries the counts it was made of
 * as data attributes, so a check can recompute the percentage from them.
 */
function Fact({ fact, label, traceability }: { fact: CardFact; label: string; traceability?: Traceability }) {
  return (
    <li
      data-first-look-fact={fact.key}
      data-origin={fact.origin}
      {...(traceability
        ? {
            'data-first-look-traceability': '',
            'data-anchored': traceability.anchored,
            'data-nodes': traceability.nodes,
          }
        : {})}
      className="text-[13px] font-medium text-cc-ink-muted"
    >
      {label}{' '}
      {fact.value === null ? (
        <b className="font-semibold text-cc-ink-muted">{wt('decision.notDetermined')}</b>
      ) : (
        <b className="font-bold text-cc-ink">{fact.value}</b>
      )}
    </li>
  );
}

/**
 * The answer, for a business reader — `lib/business-card.ts`.
 *
 * Top: the name, one plain sentence, the rules found in the code in one
 * sentence beside what is not determined, and four figures. Below, folded:
 * every rule and every decision in plain words, each with its line, and the
 * code behind it on request. Nothing on the top needs ABAP to read; nothing
 * the first look knew is gone.
 */
function EndState({
  result,
  proposedName,
  confirmed,
  owner,
  mapBelow = false,
}: {
  result: Result;
  /** The full map stands right under the card, so the one-row strip of its first steps is not repeated. */
  mapBelow?: boolean;
  proposedName: string | null;
  /** "Rules confirmed x of n" from the need revision, or null when it could not be read. */
  confirmed: { confirmed: number; total: number } | null;
  /** Only the owner confirms; a reader is offered to review. */
  owner: boolean;
}) {
  const { card } = result;
  const [showCode, setShowCode] = useState(false);
  const more = card.rules.length - card.featured.length;
  const trace = card.facts.find((f) => f.key === 'traceability');
  const others = card.facts.filter((f) => f.key !== 'traceability');
  const openRules = () => {
    // The rules live in the Need & process layer; the layer is chosen by the
    // address (ADR-018), and the editor opens there for the owner.
    window.location.hash = 'need';
    requestRuleEditing();
  };
  // The switch shows the code *behind* a plain line; where every line is
  // already code it would switch nothing, so it is not offered.
  const anyPlain = card.rules.some((r) => r.sentence) || card.decisions.some((d) => d.question);

  return (
    <div data-first-look-result="" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {proposedName ? (
          <div className="flex flex-wrap items-center gap-2">
            <h3
              data-first-look-proposed-name=""
              className="m-0 text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-cc-ink"
            >
              {proposedName}
            </h3>
            <CcProvenanceChip value="proposed" note={wt('firstLook.nameNote')} />
          </div>
        ) : null}
        {proposedName ? (
          <p
            data-first-look-process-name={result.processName.name ? 'named' : 'unnamed'}
            className="m-0 font-cc-mono text-[12px] leading-tight font-medium text-cc-ink-muted"
          >
            {result.processName.name ?? wt('firstLook.noProgramName')}
          </p>
        ) : (
          <h3
            data-first-look-process-name={result.processName.name ? 'named' : 'unnamed'}
            className="m-0 font-cc-mono text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-cc-ink"
          >
            {result.processName.name ?? wt('firstLook.noProgramName')}
          </h3>
        )}
        {result.processName.reason ? (
          <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{result.processName.reason}</p>
        ) : null}
        <p data-first-look-summary={card.summary.kind} className="m-0 text-[15px] leading-snug font-medium text-cc-ink">
          {card.summary.sentence}
        </p>
        {showCode && card.summary.technical ? (
          <p data-first-look-code="" className="m-0">
            <CodeText>{card.summary.technical}</CodeText>
          </p>
        ) : null}
      </div>

      {/* Found in the code, and beside it what is not determined (§5.1: "The
          doubt is answered at once"). Stacked on a phone. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div
          data-first-look-reveal=""
          data-count={result.ruleCount}
          className="rounded-cc-card border border-cc-line px-4 py-3"
        >
          <p className="m-0 mb-1 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">
            {wt('firstLook.foundInCode')}
          </p>
          <p className="m-0 text-[15px] leading-relaxed font-semibold text-cc-ink">
            {headlineLead(result.ruleCount)}
            {card.featured.length > 0 ? ' — ' : null}
            {card.featured.map((rule, i) => (
              <React.Fragment key={rule.id}>
                {i > 0 ? ', ' : null}
                <span data-first-look-featured={rule.id}>
                  {rule.phrase ?? <CodeText>{rule.code}</CodeText>} <Anchor anchor={rule.anchors[0] ?? null} />
                </span>
              </React.Fragment>
            ))}
            {more > 0 ? `, ${firstLookMoreRules(more)}` : null}
            {card.featured.length > 0 ? '.' : null}
          </p>
        </div>
        <div
          data-first-look-open={card.open.noSource ? 'no-source' : String(card.open.count)}
          className="rounded-cc-card border border-cc-line bg-cc-surface-muted px-4 py-3"
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="m-0 text-[15px] leading-tight font-bold text-cc-ink">{firstLookOpenTitle(card.open.count)}</p>
            <CcProvenanceChip value="not-determined" />
          </div>
          {card.open.count === 0 ? (
            <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink">{wt('firstLook.nothingOpen')}</p>
          ) : (
            <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink">
              {card.open.groups.map((group, i) => (
                <React.Fragment key={group.label}>
                  {i > 0 ? ' · ' : null}
                  <span data-first-look-open-group={group.count}>
                    {group.count > 1 ? firstLookOpenGroup(group.label, group.count) : group.label}{' '}
                    {group.anchors.map((anchor) => (
                      <React.Fragment key={anchor}>
                        <Anchor anchor={anchor} />{' '}
                      </React.Fragment>
                    ))}
                    {group.count > group.anchors.length ? '…' : null}
                  </span>
                </React.Fragment>
              ))}
              {' · '}
              {wt('firstLook.openReasons')}
            </p>
          )}
        </div>
      </div>

      {/* The figures in one line (mockup s0, moment 4): traceability, rules
          confirmed, and the engine's counts. What each means is one click
          deeper, under "How this was derived". */}
      <ul
        aria-label={wt('firstLook.keyFacts')}
        className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 border-y border-cc-line p-0 py-2"
      >
        {trace ? <Fact fact={trace} label={wt('firstLook.stripTrace')} traceability={result.traceability} /> : null}
        <li data-first-look-fact="rules-confirmed" data-origin={confirmed ? 'engine' : 'absent'} className="text-[13px] font-medium text-cc-ink-muted">
          {wt('firstLook.stripConfirmed')}{' '}
          <b className="font-bold text-cc-ink">
            {confirmed ? firstLookOf(confirmed.confirmed, confirmed.total) : wt('firstLook.stripNotDetermined')}
          </b>
        </li>
        {others.map((fact) => (
          <Fact
            key={fact.key}
            fact={fact}
            label={
              fact.key === 'rules'
                ? wt('firstLook.stripRules')
                : fact.key === 'decisions'
                  ? wt('firstLook.stripDecisions')
                  : wt('firstLook.stripOpen')
            }
          />
        ))}
      </ul>

      {/* The first steps, in plain words and with their lines — the map in one
          row. The full map is the process layer's; this only says it exists. */}
      {result.steps.steps.length > 0 && !mapBelow ? (
        <ol
          aria-label={wt('firstLook.stepsLabel')}
          data-first-look-steps=""
          className="m-0 flex list-none flex-wrap items-center gap-x-1 gap-y-2 p-0"
        >
          {result.steps.steps.map((step, i) => (
            <li key={step.id} className="flex items-center gap-1">
              {i > 0 ? (
                <span aria-hidden={true} className="text-[12px] text-cc-ink-muted">
                  →
                </span>
              ) : null}
              <span
                data-first-look-step={step.decision ? 'decision' : 'step'}
                className={
                  step.decision
                    ? 'inline-flex items-center gap-1 rounded-cc-row border border-dashed border-cc-information px-2 py-1 text-[12px] font-semibold text-cc-ink'
                    : 'inline-flex items-center gap-1 rounded-cc-row border border-cc-information-border px-2 py-1 text-[12px] font-semibold text-cc-ink'
                }
              >
                {step.label}
                {step.anchor ? (
                  <span className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{step.anchor}</span>
                ) : null}
              </span>
            </li>
          ))}
          {result.steps.more ? (
            <li aria-hidden={true} className="text-[12px] text-cc-ink-muted">
              → …
            </li>
          ) : null}
        </ol>
      ) : null}

      {card.rules.length > 0 ? (
        <div className="cc-no-print flex flex-wrap items-center gap-3">
          <CcButton
            variant={owner ? 'primary' : 'secondary'}
            onClick={openRules}
            data-first-look-confirm-rules=""
          >
            {firstLookConfirmRules(card.rules.length, owner)}
            <ArrowRight size={16} aria-hidden={true} />
          </CcButton>
          <span className="text-[12px] font-medium text-cc-ink-muted">{wt('firstLook.confirmNote')}</span>
        </div>
      ) : null}

      {/* One click deeper: every rule and every decision in plain words, each
          with its line — and the code it was read from, on request. */}
      <div className="flex flex-col gap-1 border-t border-cc-line pt-2">
        {anyPlain ? (
        <div className="pt-1">
          <CcSwitch label={wt('firstLook.showCode')} checked={showCode} onChange={setShowCode} />
        </div>
        ) : null}
        <CcDisclosure title={wt('firstLook.rulesTitle')} count={card.rules.length} level={3}>
          {card.rules.length === 0 ? (
            <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('firstLook.noRulesInList')}</p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {card.rules.map((rule) => (
                <li key={rule.id} data-first-look-rule={rule.id} className="flex flex-col gap-1 text-[13px] text-cc-ink">
                  <span className="flex flex-wrap items-center gap-2">
                    {rule.sentence ? (
                      <span className="font-medium">{rule.sentence}</span>
                    ) : (
                      <CodeText>{rule.code}</CodeText>
                    )}
                    {rule.anchors.slice(0, 4).map((anchor) => (
                      <Anchor key={anchor} anchor={anchor} />
                    ))}
                  </span>
                  {showCode && rule.sentence ? (
                    <span data-first-look-code="" className="flex flex-wrap items-center gap-2">
                      <CodeText>{rule.code}</CodeText>
                      <CcRulePropertyTag value="hard-coded" />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CcDisclosure>

        <div data-first-look-decisions="" data-count={card.decisions.length}>
          <CcDisclosure title={wt('firstLook.decisionsTitle')} count={card.decisions.length} level={3}>
            {card.decisions.length === 0 ? (
              <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('firstLook.noDecision')}</p>
            ) : (
              <ul className="m-0 list-none space-y-2 p-0">
                {card.decisions.map((decision) => (
                  <li
                    key={decision.nodeId}
                    data-first-look-decision={decision.nodeId}
                    className="flex flex-col gap-1 text-[13px] text-cc-ink"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      {decision.question ? (
                        <span className="font-medium">{decision.question}</span>
                      ) : (
                        <CodeText>{decision.code}</CodeText>
                      )}
                      <Anchor anchor={decision.anchor} />
                    </span>
                    {decision.outcomes.length > 0 ? (
                      <span className="text-[12px] font-medium text-cc-ink-muted">
                        {firstLookOutcomes(decision.outcomes)}
                      </span>
                    ) : null}
                    {showCode && decision.question ? (
                      <span data-first-look-code="">
                        <CodeText>{decision.code}</CodeText>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CcDisclosure>
        </div>

      </div>
    </div>
  );
}
