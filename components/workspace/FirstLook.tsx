'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CircleDashed } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcDisclosure from '@/components/cc/Disclosure';
import CcSwitch from '@/components/cc/Switch';
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
  readTableAccess,
  revealedRules,
  tablesOf,
  STAGE_LABELS,
  traceabilityOf,
  yourProcessStage,
  type DecisionLine,
  type FirstLookFigure,
  type FirstLookStage,
  type FirstLookStageId,
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
  firstLookReadingNext,
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
  ruleCount: number;
  open: NotDetermined;
  /** The same reading, re-cut for a business reader (`lib/business-card.ts`). */
  card: BusinessCard;
}

export default function FirstLook({
  project,
  projectId,
  buildUp = true,
  onReading,
  namingFrom = 'project',
  proposedName = null,
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
  /**
   * A process name the model proposed, when one exists. Shown as the title
   * with the chip *Model proposal · name*; the program's own name stays under
   * it. Without one, the program's name is the title.
   */
  proposedName?: string | null;
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

  if (!complete) {
    const nextId = (['code-read', 'process-recognised', 'business-language', 'your-process'] as const)[
      Math.min(reached, 3)
    ] as FirstLookStageId;

    return (
      <>
      <section data-first-look="building" data-reached={reached} className="max-w-3xl">
        <CcCard
          title={wt('firstLook.title')}
          level={2}
          meta={<CcProvenanceChip value="reconstructed" />}
          actions={
            <CcButton onClick={skip} data-first-look-skip="">
              {wt('firstLook.skip')}
            </CcButton>
          }
        >
          <ol data-first-look-stages="building" className="m-0 flex list-none flex-col gap-2 p-0">
            {shown.map((stage, i) => (
              <StageRow key={stage?.id ?? `pending-${i}`} stage={stage} />
            ))}
          </ol>
          {/* No spinner and no bar: the line says what is being read (§5.1). */}
          <p className="m-0 mt-2 text-[13px] leading-snug font-medium text-cc-ink-muted">
            {firstLookReadingNext(STAGE_LABELS[nextId], sourceName)}
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
      <CcCard title={wt('firstLook.cardTitle')} level={2} meta={<CcProvenanceChip value="reconstructed" />}>
        {result ? (
          <EndState result={result} proposedName={proposedName} />
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
          </CcDisclosure>
        </div>
      </CcCard>
    </section>
    {live}
    </>
  );
}

/* ------------------------------------------------------- the end state, parts */

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
function Fact({ fact, traceability }: { fact: CardFact; traceability?: Traceability }) {
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
      className="flex min-w-0 flex-col gap-1"
    >
      {fact.value === null ? (
        <span className="text-[13px] leading-tight font-medium text-cc-ink-muted">{wt('decision.notDetermined')}</span>
      ) : (
        <span className="text-[22px] leading-tight font-extrabold text-cc-ink">{fact.value}</span>
      )}
      <span className="text-[13px] leading-snug font-semibold text-cc-ink">{fact.label}</span>
      <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">{fact.explanation}</span>
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
function EndState({ result, proposedName }: { result: Result; proposedName: string | null }) {
  const { card } = result;
  const [showCode, setShowCode] = useState(false);
  const more = card.rules.length - card.featured.length;
  const trace = card.facts.find((f) => f.key === 'traceability');
  const others = card.facts.filter((f) => f.key !== 'traceability');
  // The switch shows the code *behind* a plain line; where every line is
  // already code it would switch nothing, so it is not offered.
  const anyPlain = card.rules.some((r) => r.sentence) || card.decisions.some((d) => d.question);

  return (
    <div data-first-look-result="" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {proposedName ? (
          <div className="flex flex-wrap items-center gap-2">
            <h3 data-first-look-proposed-name="" className="m-0 text-[15px] leading-tight font-bold text-cc-ink">
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
            className="m-0 font-cc-mono text-[15px] leading-tight font-bold text-cc-ink"
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

      {/* Found in the code, and beside it what is not determined (§5.1: "Der
          Zweifel wird sofort beantwortet"). Stacked on a phone. */}
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

      {/* Four figures, each with the one line that explains it. */}
      <ul aria-label={wt('firstLook.keyFacts')} className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-3 p-0 sm:grid-cols-4">
        {others.map((fact) => (
          <Fact key={fact.key} fact={fact} />
        ))}
        {trace ? <Fact fact={trace} traceability={result.traceability} /> : null}
      </ul>

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
