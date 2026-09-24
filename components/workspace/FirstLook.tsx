'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CircleDashed } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcRulePropertyTag } from '@/components/cc/Tag';
import {
  buildFirstLook,
  businessLanguageStage,
  codeReadStage,
  decisionLines,
  processNameOf,
  processStage,
  readProcess,
  readRules,
  readTables,
  revealedRules,
  STAGE_LABELS,
  traceabilityOf,
  yourProcessStage,
  type DecisionLine,
  type FirstLookFigure,
  type FirstLookStage,
  type FirstLookStageId,
  type ProcessName,
  type ProcessReading,
  type RevealedRule,
  type SourceReading,
  type Traceability,
} from '@/lib/first-look';
import { notDetermined, type NotDetermined } from '@/lib/workspace-model';
import { applyNaming, type ProcessNamingRecord } from '@/lib/process-naming';
import { fetchProcessNaming } from '@/lib/process-naming-client';
import type { BusinessRuleSet } from '@/lib/abap/business-rule-set';
import type { Project } from '@/lib/types';

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
 *   2. **No artificial minimum duration** (§5.4, and the six seconds of the old
 *      evidence scanner it names by name). The stages are not a timeline: each
 *      is revealed by the return of *its own call* — stage 1 by the table read,
 *      stage 2 by the skeleton, stage 3 by the stored naming, stage 4 by the
 *      rules. On a small source all four land in two frames, and that is the
 *      correct outcome rather than a missed opportunity to animate. The one
 *      thing yielded between stages is a frame, so the browser can paint what
 *      the last stage produced before the next one blocks the thread.
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

function useReducedMotion(): boolean {
  // Read in an effect, never during render: the server has no `matchMedia`, and
  // a component that guesses produces a hydration mismatch on exactly the
  // machines that asked for less movement.
  const [reduced, setReduced] = useState(false);
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
  rules: RevealedRule[];
  open: NotDetermined;
}

export default function FirstLook({
  project,
  projectId,
  buildUp = true,
  onReading,
  namingFrom = 'project',
}: {
  project: Project | null;
  projectId: string;
  /**
   * False on a second visit — *„Ein zweiter Besuch hat keinen Aufbau"* (§5.2).
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
}) {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const hasSource = source.trim().length > 0;
  const sourceName =
    project?.auditMetadata?.inputFingerprint?.fileName || project?.name || projectId;
  const reduced = useReducedMotion();

  const [skipped, setSkipped] = useState(false);
  const [tables, setTables] = useState<ReadonlySet<string> | null>(null);
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
    setTables(null);
    setProcess(null);
    setNaming(null);
    setRules(null);
    setSkipped(false);
  }

  /* ---- stage 1's work ---- */
  useEffect(() => {
    if (!hasSource) return;
    return afterPaint(() => setTables(readTables(source)));
  }, [source, hasSource]);

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

  const named = useMemo(
    () => (process && naming ? applyNaming(process.context, naming.record) : null),
    [process, naming],
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
    if (!hasSource || !process || !named || !rules) return null;
    return {
      processName: processNameOf(rules),
      traceability: traceabilityOf(named),
      decisions: decisionLines(process.skeleton),
      rules: revealedRules(rules),
      open: notDetermined(project),
    };
  }, [hasSource, process, named, rules, project]);

  const finalStage = useMemo<FirstLookStage | null>(
    () => (result ? yourProcessStage(result.rules, result.traceability, result.open) : null),
    [result],
  );

  const complete = !hasSource || result !== null;

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
  const latest = [...shown].reverse().find((s): s is FirstLookStage => s !== null) ?? null;
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
        <section data-first-look="waiting" data-reduced-motion={reduced ? 'true' : 'false'} className="max-w-3xl">
          <CcCard title="Reading your code" level={2} meta={<CcProvenanceChip value="reconstructed" />}>
            <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
              Reading {sourceName}.
            </p>
          </CcCard>
        </section>
        {live}
      </>
    );
  }

  /* ------------------------------------------------------------ the build-up */

  if (!complete) {
    const nextId = (['code-read', 'process-recognised', 'business-language', 'your-process'] as const)[
      Math.min(reached, 3)
    ] as FirstLookStageId;

    return (
      <>
      <section data-first-look="building" data-reached={reached} className="max-w-3xl">
        <CcCard
          title="Reading your code"
          level={2}
          meta={<CcProvenanceChip value="reconstructed" />}
          actions={
            <CcButton onClick={skip} data-first-look-skip="">
              Skip
            </CcButton>
          }
        >
          <ol data-first-look-stages="building" className="m-0 flex list-none flex-col gap-1.5 p-0">
            {shown.map((stage, i) => (
              <StageRow key={stage?.id ?? `pending-${i}`} stage={stage} />
            ))}
          </ol>
          {/* No spinner and no bar: the line says what is being read (§5.1). */}
          <p className="m-0 mt-2 text-[13px] leading-snug font-medium text-cc-ink-muted">
            {STAGE_LABELS[nextId]} — reading {sourceName}.
          </p>
        </CcCard>
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
      className="max-w-3xl"
    >
      <CcCard
        title={STAGE_LABELS['your-process']}
        level={2}
        meta={<CcProvenanceChip value="reconstructed" />}
      >
        {result ? (
          <div data-first-look-result="" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                data-first-look-process-name={result.processName.name ? 'named' : 'unnamed'}
                className="m-0 font-cc-mono text-[18px] leading-tight font-bold text-cc-ink"
              >
                {result.processName.name ?? 'No program name in this source'}
              </h3>
            </div>
            {result.processName.reason ? (
              <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {result.processName.reason}
              </p>
            ) : null}

            {/* Traceability — the quote the phase's "Fertig, wenn" list asks for. */}
            <p
              data-first-look-traceability=""
              data-anchored={result.traceability.anchored}
              data-nodes={result.traceability.nodes}
              className="m-0 text-[13px] leading-snug font-medium text-cc-ink"
            >
              {result.traceability.sentence}
            </p>

            {/* The reveal line — §5.1. It says the rule stands in the program and
                nothing about whether anyone wrote it down (`lib/rule-property.ts`). */}
            <div data-first-look-reveal="" data-count={result.rules.length}>
              <p className="m-0 text-[13px] leading-snug font-semibold text-cc-ink">
                {finalStage?.result}
              </p>
              {result.rules.length > 0 ? (
                <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
                  {result.rules.slice(0, 6).map((rule) => (
                    <li
                      key={rule.id}
                      data-first-look-rule={rule.id}
                      className="flex flex-wrap items-center gap-2 text-[13px] text-cc-ink"
                    >
                      <span className="font-cc-mono text-[12px]">{rule.label}</span>
                      <CcRulePropertyTag value={rule.property} />
                      {rule.anchors.slice(0, 4).map((anchor) => (
                        <CcAnchor key={anchor} label={`Source line ${anchor}`}>
                          {anchor}
                        </CcAnchor>
                      ))}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.rules.length > 6 ? (
                <p className="m-0 mt-1.5 text-[12px] font-medium text-cc-ink-muted">
                  Showing 6 of {result.rules.length} rules.
                </p>
              ) : null}
            </div>

            {/* The decisions, with the condition as the source writes it. */}
            <div data-first-look-decisions="" data-count={result.decisions.length}>
              <p className="m-0 text-[13px] leading-snug font-semibold text-cc-ink">
                {result.decisions.length === 0
                  ? 'No decision — this source has no branch the engine draws as a gateway.'
                  : `${result.decisions.length} ${result.decisions.length === 1 ? 'decision' : 'decisions'}, each with the condition as your code writes it.`}
              </p>
              {result.decisions.length > 0 ? (
                <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
                  {result.decisions.slice(0, 5).map((decision) => (
                    <li
                      key={decision.nodeId}
                      data-first-look-decision={decision.nodeId}
                      className="flex flex-wrap items-center gap-2 text-[13px] text-cc-ink"
                    >
                      <span className="font-cc-mono text-[12px]">{decision.label}</span>
                      {decision.anchor ? (
                        <CcAnchor label={`Source line ${decision.anchor}`}>
                          {decision.anchor}
                        </CcAnchor>
                      ) : (
                        <CcAnchor tone="unlinked">no line</CcAnchor>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.decisions.length > 5 ? (
                <p className="m-0 mt-1.5 text-[12px] font-medium text-cc-ink-muted">
                  Showing 5 of {result.decisions.length} decisions.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p data-first-look-result="none" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
            No source has been staged, so there is no process to show. This is not a result.
          </p>
        )}

        {/* The four stages stay on the page after the build-up: they are the
            receipt for the numbers above, not a loading screen. */}
        <ol
          data-first-look-stages={endStateOnly ? 'end-state' : 'built'}
          className="m-0 mt-4 flex list-none flex-col gap-1.5 border-t border-cc-line p-0 pt-3"
        >
          {shown.map((stage, i) => (
            <StageRow key={stage?.id ?? `done-${i}`} stage={stage} />
          ))}
        </ol>
      </CcCard>
    </section>
    {live}
    </>
  );
}
