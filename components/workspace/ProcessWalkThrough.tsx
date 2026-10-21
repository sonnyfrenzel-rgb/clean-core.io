'use client';

import React from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Footprints, X } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcCodeSurface from '@/components/cc/CodeSurface';
import CcDisclosure from '@/components/cc/Disclosure';
import CcSkeleton from '@/components/cc/Skeleton';
import { CcTag } from '@/components/cc/Tag';
import StateChoice from '@/components/process-states/StateChoice';
import { AsReadFromCode, WordedChip } from './WordedText';
import { ENGINE_ONLY, type WordedSentence } from '@/lib/plain-wording';
import { codeCardLabel, codeCardLines } from '@/lib/process-map';
import { PROCESS_WALK_ID } from '@/lib/process-walk-request';
import {
  WALK_TECHNICAL_SUBJECT,
  walkSummary,
  type WalkGuide,
  type WalkGuideStep,
  type WalkLine,
  type WalkRange,
  type WalkStop,
  type WalkSummaryItem,
} from '@/lib/process-walk-guide';
import { ELEMENT_STATES, STATE_LABELS, type ElementState, type StateEntry, type StateSubject } from '@/lib/process-states';
import { CC_SEGMENTED_GROUP, ccSegmentClass } from '@/components/cc/SegmentedControl';
import {
  walkAnswered,
  walkGroupTitle,
  walkLinesLabel,
  walkPhaseChip,
  walkPhaseOf,
  walkShape,
  walkStepOf,
  walkTechnicalAnswered,
  wt,
} from '@/lib/workspace-messages';

/**
 * The guided walk-through of the Business view — roadmap "3.0.20 — with it",
 * part (1).
 *
 * The owner's report of 21.10.2026: the walk showed "Step 96 of 96:
 * Background run given or no file?" beside an ABAP excerpt, asked "Does the
 * business still need this step?" before the reader knew what the step does,
 * and sat under the map, below the fold. Now every step is **said first** —
 * what happens here, why it matters, what decides it, what data it touches,
 * what changes if it goes, each sentence with its line anchor — and **asked
 * after**. The code is one fold down. Steps are grouped by phase; technical
 * steps (logging, files, technical checks, run options, set-up) are asked once
 * as a group; the walk ends with what the business still needs.
 *
 * Presentational: the sentences come from `lib/process-walk-guide.ts`, the
 * answers from the process-states route through the caller, which stores them
 * where they always were. Nothing here writes anything itself.
 *
 * 3.0.20, owner decisions of 21.10.2026: every sentence is shown through `say`
 * — the plain wording a model proposed for it, when one held the guard
 * (`lib/plain-wording.ts`), with the engine's sentence one fold down; the
 * engine's sentence alone otherwise. `demo` is the public demo's walk: read
 * only, the answers shown and disabled, and the line "Demo: nothing is saved".
 */
export interface ProcessWalkThroughProps {
  projectId: string;
  /** The walk, read from the code; null while it is being read. */
  guide: WalkGuide | null;
  stops: readonly WalkStop[];
  /** The stop on screen, or null while the walk is closed. */
  at: number | null;
  /** The latest answer per element. */
  answers: Readonly<Record<string, StateEntry>>;
  /** The subject an answer can be stored under, or null while the need revision does not exist yet. */
  subjectOf: (id: string) => StateSubject | null;
  owner: boolean;
  answering: { subject: string; error: string | null } | null;
  onAnswer: (id: string, state: ElementState, note: string | null) => void | Promise<void>;
  onAnswerMany: (ids: readonly string[], state: ElementState, note: string | null) => void | Promise<void>;
  /** Open the walk at a stop. */
  onGo: (index: number) => void;
  onClose: () => void;
  /** Show these lines in the source column beside the map. */
  onOpenLines: (range: WalkRange) => void;
  source: string;
  fileName: string;
  /** Each engine sentence as it is shown: reworded or as written. Without it, as written. */
  say?: (text: string, anchor: WalkRange | null) => WordedSentence;
  /** The public demo: nothing is answered and nothing is saved. */
  demo?: boolean;
}

const TECHNICAL_SUBJECT = WALK_TECHNICAL_SUBJECT;

const confirmed = (entry: StateEntry | undefined): boolean => !!entry && entry.state !== 'clarify';

export default function ProcessWalkThrough(props: ProcessWalkThroughProps) {
  const { guide, stops, at, answers, owner, onGo } = props;
  if (!guide) {
    return (
      <section id={PROCESS_WALK_ID} data-workspace-walk-bar="" data-workspace-walk-state="reading" className={FRAME}>
        <WalkHead />
        <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('walk.preparing')}</p>
        <CcSkeleton shape="text" count={3} label={wt('walk.preparingLabel')} />
      </section>
    );
  }
  const ids = [...guide.business, ...guide.technical.flatMap((g) => g.stepIds)];
  const answered = ids.filter((id) => confirmed(answers[id])).length;
  const technicalCount = ids.length - guide.business.length;
  const resume = stops.findIndex((stop) =>
    stop.kind === 'step' ? !confirmed(answers[stop.id]) : stop.kind === 'technical' ? stop.ids.some((id) => !confirmed(answers[id])) : false,
  );
  const resumeAt = resume < 0 ? stops.length - 1 : resume;

  if (at === null || !stops[at]) {
    return (
      <section
        id={PROCESS_WALK_ID}
        data-workspace-walk-bar=""
        data-answered={answered}
        data-total={ids.length}
        aria-labelledby="workspace-walk-intro-title"
        className={FRAME}
      >
        <WalkHead titleId="workspace-walk-intro-title" />
        <p className="m-0 max-w-3xl text-[13px] leading-snug font-medium text-cc-ink">{wt('walk.lead')}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span data-workspace-walk-shape="" className="text-[13px] font-semibold text-cc-ink">
            {walkShape(guide.business.length, guide.phases.length, technicalCount)}
          </span>
          <span data-workspace-walk-progress="" className="text-[13px] font-medium text-cc-ink-muted">
            {walkAnswered(answered, ids.length)}
          </span>
        </div>
        <Progress value={answered} total={ids.length} />
        <PhaseList guide={guide} stops={stops} answers={answers} current={null} onGo={onGo} />
        <div className="cc-no-print flex flex-wrap items-center gap-3">
          <CcButton
            variant="secondary"
            icon={<Footprints size={16} aria-hidden={true} />}
            onClick={() => onGo(owner ? resumeAt : 0)}
            data-workspace-walk-start=""
          >
            {props.demo ? wt('walk.start') : !owner ? wt('walk.read') : answered > 0 ? wt('walk.continue') : wt('walk.start')}
          </CcButton>
          {props.demo ? (
            <span data-workspace-walk-demo="" className="text-[12px] font-medium text-cc-ink-muted">{wt('walk.demoNote')}</span>
          ) : !owner ? (
            <span className="text-[12px] font-medium text-cc-ink-muted">{wt('walk.readerNote')}</span>
          ) : null}
        </div>
      </section>
    );
  }

  const stop = stops[at];
  const businessStops = stops.filter((s) => s.kind === 'step').length;
  return (
    <section
      id={PROCESS_WALK_ID}
      data-workspace-walk=""
      data-walk-step={at + 1}
      data-walk-kind={stop.kind}
      aria-labelledby="workspace-walk-title"
      className={FRAME}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <WalkHead compact />
        <CcButton variant="ghost" icon={<X size={16} aria-hidden={true} />} onClick={props.onClose} data-workspace-walk-close="">
          {wt('walk.close')}
        </CcButton>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-medium text-cc-ink-muted">
          <span data-workspace-walk-position="">
            {stop.kind === 'step' ? walkStepOf(at + 1, businessStops) : null}
          </span>
          <span data-workspace-walk-progress="">{walkAnswered(answered, ids.length)}</span>
        </div>
        <Progress value={answered} total={ids.length} />
      </div>
      <PhaseList guide={guide} stops={stops} answers={answers} current={at} onGo={onGo} />
      {stop.kind === 'step' ? (
        <StepStop {...props} step={guide.byId[stop.id]} phaseIndex={guide.phases.findIndex((p) => p.id === guide.byId[stop.id]?.phase)} />
      ) : stop.kind === 'technical' ? (
        <TechnicalStop {...props} ids={stop.ids} />
      ) : (
        <SummaryStop {...props} firstOpen={resume >= 0 && stops[resume]?.kind !== 'summary' ? resume : null} />
      )}
      <div className="cc-no-print flex flex-wrap items-center justify-between gap-2 border-t border-cc-line pt-3">
        <CcButton
          icon={<ChevronLeft size={16} aria-hidden={true} />}
          onClick={at > 0 ? () => onGo(at - 1) : undefined}
          disabled={at === 0}
          data-workspace-walk-back=""
        >
          {wt('walk.back')}
        </CcButton>
        <CcButton onClick={at + 1 < stops.length ? () => onGo(at + 1) : undefined} disabled={at + 1 >= stops.length} data-workspace-walk-next="">
          {stops[at + 1]?.kind === 'summary' ? wt('walk.toSummary') : wt('walk.next')}
          <ChevronRight size={16} aria-hidden={true} />
        </CcButton>
      </div>
    </section>
  );
}

const FRAME =
  'flex scroll-mt-20 flex-col gap-3 rounded-cc-card border border-l-4 border-cc-line border-l-cc-ink bg-cc-surface p-4 shadow-cc';

function WalkHead({ titleId, compact = false }: { titleId?: string; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="m-0 flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
        <Footprints size={14} aria-hidden={true} />
        {wt('walk.eyebrow')}
      </p>
      {compact ? null : (
        <h2 id={titleId} className="m-0 mt-1 text-[22px] leading-snug font-bold text-cc-ink">
          {wt('walk.title')}
        </h2>
      )}
    </div>
  );
}

function Progress({ value, total }: { value: number; total: number }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
      aria-label={walkAnswered(value, total)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-cc-surface-muted"
    >
      <div className="h-full rounded-full bg-cc-ink" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** The phases as a row of stops: where the reader is, and how far each phase is answered. */
function PhaseList({
  guide,
  stops,
  answers,
  current,
  onGo,
}: {
  guide: WalkGuide;
  stops: readonly WalkStop[];
  answers: Readonly<Record<string, StateEntry>>;
  current: number | null;
  onGo: (index: number) => void;
}) {
  const currentStop = current === null ? null : stops[current];
  const currentPhase = currentStop?.kind === 'step' ? guide.byId[currentStop.id]?.phase : null;
  const technicalAt = stops.findIndex((s) => s.kind === 'technical');
  const technical = technicalAt >= 0 ? stops[technicalAt] : null;
  return (
    <nav aria-label={wt('walk.phasesLabel')} className="cc-no-print">
      <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
        {guide.phases.map((phase, i) => {
          const first = stops.findIndex((s) => s.kind === 'step' && s.id === phase.stepIds[0]);
          const done = phase.stepIds.filter((id) => confirmed(answers[id])).length;
          const here = phase.id === currentPhase;
          return (
            <li key={phase.id} className="min-w-0 max-w-full">
              <CcButton
                variant={here ? 'dark' : 'ghost'}
                onClick={() => onGo(first)}
                aria-current={here ? 'step' : undefined}
                data-workspace-walk-phase={i + 1}
              >
                {/* A long phase name wraps inside its chip: on a phone a chip wider than the
                    card made the page scroll sideways (CI of 18a3d8e3, 37 px). */}
                <span className="min-w-0 text-left break-words whitespace-normal">{walkPhaseChip(phase.label, done, phase.stepIds.length)}</span>
              </CcButton>
            </li>
          );
        })}
        {technical && technical.kind === 'technical' ? (
          <li className="min-w-0 max-w-full">
            <CcButton
              variant={current === technicalAt ? 'dark' : 'ghost'}
              onClick={() => onGo(technicalAt)}
              aria-current={current === technicalAt ? 'step' : undefined}
              data-workspace-walk-phase="technical"
            >
              <span className="min-w-0 text-left break-words whitespace-normal">
                {walkPhaseChip(wt('walk.technicalTag'), technical.ids.filter((id) => confirmed(answers[id])).length, technical.ids.length)}
              </span>
            </CcButton>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}

function LineAnchor({ range, onOpen }: { range: WalkRange | null; onOpen: (range: WalkRange) => void }) {
  if (!range) return null;
  return (
    <CcAnchor onOpen={() => onOpen(range)} label={walkLinesLabel(range.lineStart, range.lineEnd)}>
      {range.lineStart === range.lineEnd ? `L${range.lineStart}` : `L${range.lineStart}-${range.lineEnd}`}
    </CcAnchor>
  );
}

function Said({ line, said, onOpen }: { line: WalkLine; said: WordedSentence; onOpen: (range: WalkRange) => void }) {
  return (
    <p data-walk-worded={said.worded ? 'yes' : 'no'} className="m-0 text-[14px] leading-relaxed font-medium text-cc-ink">
      {said.text} <LineAnchor range={line.anchor} onOpen={onOpen} />
      <WordedChip said={said} />
    </p>
  );
}

/** What the reader is told instead of an answer in the public demo: the answers, disabled, and that nothing is saved. */
function DemoAnswers() {
  return (
    <div data-workspace-walk-demo="" className="flex flex-col gap-2">
      <span role="radiogroup" aria-label={wt('walk.demoAnswersLabel')} aria-disabled={true} className={`${CC_SEGMENTED_GROUP} flex-wrap self-start`}>
        {ELEMENT_STATES.map((state) => (
          <button key={state} type="button" role="radio" aria-checked={false} disabled={true} className={ccSegmentClass(false)}>
            {STATE_LABELS[state]}
          </button>
        ))}
      </span>
      <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('walk.demoNote')}</p>
    </div>
  );
}

function Part({ name, title, children }: { name: string; title: string; children: React.ReactNode }) {
  return (
    <div data-workspace-walk-part={name} className="flex min-w-0 flex-col gap-1">
      <dt className="text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">{title}</dt>
      <dd className="m-0 flex flex-col gap-1">{children}</dd>
    </div>
  );
}

function StepStop({
  step,
  phaseIndex,
  guide,
  answers,
  subjectOf,
  owner,
  answering,
  onAnswer,
  onOpenLines,
  source,
  fileName,
  say = ENGINE_ONLY,
  demo = false,
}: ProcessWalkThroughProps & { step: WalkGuideStep | undefined; phaseIndex: number }) {
  if (!step || !guide) return null;
  const phase = guide.phases[phaseIndex];
  const subject = subjectOf(step.id);
  const entry = answers[step.id] ?? null;
  const shown = (line: WalkLine) => say(line.text, line.anchor);
  const all = [step.happens, step.matters, ...step.decides, ...(step.data ? [step.data] : []), step.ifGone].map(shown);
  return (
    <div data-workspace-walk-step-id={step.id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {phase ? (
          <p data-workspace-walk-phase-name="" className="m-0 text-[12px] font-semibold text-cc-ink-muted">
            {walkPhaseOf(phaseIndex + 1, guide.phases.length, phase.label)}
          </p>
        ) : null}
        <h3 id="workspace-walk-title" className="m-0 text-[22px] leading-snug font-bold break-words text-cc-ink">
          {step.title}
        </h3>
      </div>
      <dl className="m-0 grid gap-x-6 gap-y-4 min-[900px]:grid-cols-2">
        <Part name="happens" title={wt('walk.happens')}>
          <Said line={step.happens} said={shown(step.happens)} onOpen={onOpenLines} />
        </Part>
        <Part name="matters" title={wt('walk.matters')}>
          <Said line={step.matters} said={shown(step.matters)} onOpen={onOpenLines} />
        </Part>
        <Part name="decides" title={wt('walk.decides')}>
          {step.decides.length > 0 ? (
            step.decides.map((line, i) => <Said key={i} line={line} said={shown(line)} onOpen={onOpenLines} />)
          ) : (
            <p className="m-0 text-[14px] leading-relaxed font-medium text-cc-ink">{wt('walk.decidesNone')}</p>
          )}
        </Part>
        <Part name="data" title={wt('walk.data')}>
          {step.data ? (
            <Said line={step.data} said={shown(step.data)} onOpen={onOpenLines} />
          ) : (
            <p className="m-0 text-[14px] leading-relaxed font-medium text-cc-ink">{wt('walk.dataNone')}</p>
          )}
        </Part>
        <Part name="if-gone" title={wt('walk.ifGone')}>
          <Said line={step.ifGone} said={shown(step.ifGone)} onOpen={onOpenLines} />
        </Part>
      </dl>
      <AsReadFromCode said={all} />
      <CodeFold step={step} source={source} fileName={fileName} />
      <div data-workspace-walk-question="" className="flex flex-col gap-2 rounded-cc-row bg-cc-surface-muted p-3">
        <p className="m-0 text-[15px] font-bold text-cc-ink">{wt('walk.question')}</p>
        <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('walk.questionNote')}</p>
        {demo ? (
          <DemoAnswers />
        ) : !owner ? (
          <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('walk.readerNote')}</p>
        ) : subject ? (
          <StateChoice
            key={`${subject.subject}-${entry?.revision ?? 0}`}
            subject={subject}
            entry={entry}
            busy={answering?.subject === step.id && answering.error === null}
            error={answering?.subject === step.id ? answering.error : null}
            onConfirm={(state, note) => onAnswer(step.id, state, note)}
          />
        ) : (
          <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('walk.notAnswerable')}</p>
        )}
      </div>
    </div>
  );
}

function CodeFold({ step, source, fileName }: { step: WalkGuideStep; source: string; fileName: string }) {
  if (!step.anchor) {
    return <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('walk.noCode')}</p>;
  }
  return (
    <CcDisclosure title={wt('walk.code')} summary={walkLinesLabel(step.anchor.lineStart, step.anchor.lineEnd)}>
      <div data-workspace-walk-code="" className="flex flex-col gap-2 pt-2">
        <CcCodeSurface lines={codeCardLines(source, step.anchor, 3)} label={codeCardLabel(fileName, step.anchor)} />
        {step.engine ? (
          <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
            <span className="font-semibold text-cc-ink">{wt('walk.engineReading')}: </span>
            {step.engine.text}
          </p>
        ) : null}
      </div>
    </CcDisclosure>
  );
}

function TechnicalStop({
  guide,
  ids,
  answers,
  owner,
  answering,
  subjectOf,
  onAnswerMany,
  onOpenLines,
  say = ENGINE_ONLY,
  demo = false,
}: ProcessWalkThroughProps & { ids: readonly string[] }) {
  if (!guide) return null;
  const answerable = ids.filter((id) => subjectOf(id) !== null);
  const done = ids.filter((id) => confirmed(answers[id])).length;
  const subject: StateSubject = {
    subject: TECHNICAL_SUBJECT,
    kind: 'element',
    label: wt('walk.technicalSubject'),
    detail: wt('walk.technicalDetail'),
    anchor: null,
  };
  // The group's answer: the one all its steps share, if they share one.
  const states = new Set<ElementState | null>(ids.map((id) => answers[id]?.state ?? null));
  const shared = states.size === 1 && !states.has(null) ? answers[ids[0]] ?? null : null;
  return (
    <div data-workspace-walk-technical="" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id="workspace-walk-title" className="m-0 text-[22px] leading-snug font-bold text-cc-ink">
          {wt('walk.technicalTitle')}
        </h3>
        <p className="m-0 max-w-3xl text-[13px] leading-snug font-medium text-cc-ink">{wt('walk.technicalLead')}</p>
        <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{walkTechnicalAnswered(done, ids.length)}</p>
      </div>
      {guide.technical.map((group) => (
        <div key={group.group} data-workspace-walk-group={group.group} className="flex flex-col gap-2">
          <h4 className="m-0 text-[14px] font-bold text-cc-ink">{walkGroupTitle(group.label, group.stepIds.length)}</h4>
          <p className="m-0 max-w-3xl text-[13px] leading-snug font-medium text-cc-ink-muted">{group.why}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {group.stepIds.map((id) => {
              const step = guide.byId[id];
              return (
                <li key={id} className="flex flex-col gap-1 rounded-cc-row border border-cc-line px-3 py-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-cc-ink">{step.title}</span>
                    <LineAnchor range={step.anchor} onOpen={onOpenLines} />
                    {answers[id] ? <CcTag>{STATE_LABELS[answers[id].state]}</CcTag> : null}
                  </span>
                  <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">
                    {say(step.happens.text, step.happens.anchor).text}
                    <WordedChip said={say(step.happens.text, step.happens.anchor)} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {/* The engine's sentences behind the reworded ones, one fold down — as at a business step. */}
      <AsReadFromCode said={guide.technical.flatMap((g) => g.stepIds).map((id) => guide.byId[id]).filter(Boolean).map((s) => say(s.happens.text, s.happens.anchor))} />
      <div data-workspace-walk-question="" className="flex flex-col gap-2 rounded-cc-row bg-cc-surface-muted p-3">
        <p className="m-0 text-[15px] font-bold text-cc-ink">{wt('walk.technicalQuestion')}</p>
        <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('walk.questionNote')}</p>
        {demo ? (
          <DemoAnswers />
        ) : !owner ? (
          <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('walk.readerNote')}</p>
        ) : answerable.length > 0 ? (
          <StateChoice
            key={`${TECHNICAL_SUBJECT}-${shared?.revision ?? 0}-${shared?.state ?? ''}`}
            subject={subject}
            entry={shared}
            busy={answering?.subject === TECHNICAL_SUBJECT && answering.error === null}
            error={answering?.subject === TECHNICAL_SUBJECT ? answering.error : null}
            onConfirm={(state, note) => onAnswerMany(answerable, state, note)}
          />
        ) : (
          <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('walk.notAnswerable')}</p>
        )}
      </div>
    </div>
  );
}

function SummaryStop({
  guide,
  answers,
  stops,
  onGo,
  onOpenLines,
  firstOpen,
}: ProcessWalkThroughProps & { firstOpen: number | null }) {
  if (!guide) return null;
  const summary = walkSummary(guide, answers);
  const go = (id: string) => {
    const index = stops.findIndex((s) => s.kind === 'step' && s.id === id);
    if (index >= 0) onGo(index);
  };
  const sections: Array<{ key: string; title: string; items: WalkSummaryItem[] }> = [
    { key: 'keep', title: wt('walk.summaryKeep'), items: summary.keep },
    { key: 'change', title: wt('walk.summaryChange'), items: summary.change },
    { key: 'drop', title: wt('walk.summaryDrop'), items: summary.drop },
    { key: 'clarify', title: wt('walk.summaryClarify'), items: summary.clarify },
    { key: 'open', title: wt('walk.summaryOpen'), items: summary.open },
  ];
  return (
    <div data-workspace-walk-summary="" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id="workspace-walk-title" className="m-0 text-[22px] leading-snug font-bold text-cc-ink">
          {wt('walk.summaryTitle')}
        </h3>
        <p className="m-0 max-w-3xl text-[13px] leading-snug font-medium text-cc-ink">{wt('walk.summaryLead')}</p>
        {summary.technical.total > 0 ? (
          <p className="m-0 text-[12px] font-medium text-cc-ink-muted">
            {walkTechnicalAnswered(summary.technical.answered, summary.technical.total)}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 min-[900px]:grid-cols-2">
        {sections.map((section) => (
          <div key={section.key} data-workspace-walk-summary-part={section.key} data-count={section.items.length} className="flex flex-col gap-2">
            <h4 className="m-0 text-[14px] font-bold text-cc-ink">{walkGroupTitle(section.title, section.items.length)}</h4>
            {section.items.length === 0 ? (
              <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('walk.summaryNone')}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {section.items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => go(item.id)}
                        className="cursor-pointer border-0 bg-transparent p-0 text-left text-[13px] font-semibold text-cc-ink underline-offset-2 hover:underline"
                      >
                        {item.title}
                      </button>
                      <span className="text-[12px] font-medium text-cc-ink-muted">{item.phase}</span>
                      <LineAnchor range={item.anchor} onOpen={onOpenLines} />
                    </span>
                    {item.note ? <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">{item.note}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {firstOpen !== null ? (
        <span className="cc-no-print">
          <CcButton variant="secondary" onClick={() => onGo(firstOpen)} data-workspace-walk-first-open="">
            {wt('walk.summaryFirstOpen')}
            <ArrowRight size={16} aria-hidden={true} />
          </CcButton>
        </span>
      ) : null}
    </div>
  );
}
