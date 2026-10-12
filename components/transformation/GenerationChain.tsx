'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleDashed, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcLinkButton from '@/components/cc/LinkButton';
import { newlyDoneAnnouncement } from '@/components/cc/run-announcement';
import { formatElapsed } from '@/lib/generation-progress';
import { tfAttempt, tfElapsed, tfTook, wt } from '@/lib/workspace-messages';
import type { ChainSlot, GenerationCheck, GenerationStage } from '@/lib/transformation-chain';

/**
 * The generation screen of the Transformation tool (roadmap 3.0.12, owner
 * 12.10.2026) — what replaced the progress bar and the log.
 *
 * Two lists, both from `lib/transformation-chain.ts`:
 *
 *   - **what this generation builds on** — the slots of the tools before
 *     Transformation, in workflow order. A slot is drawn "Reading…" until its
 *     contribution has been read in this generation, then it lights: the
 *     facts, the level chip, the date, the way to its tool. Nothing is
 *     staged for effect — a slot lights when the page has the value, which
 *     may be at once.
 *   - **what happens to it** — the stages that exist today: the contract, the
 *     original's facts, the model's answer with the time it has taken (one
 *     answer, so no percentage), the checks on it, the store. Later stages are
 *     entries in the same list.
 *
 * Motion explains a change of state only (§1.7): a slot fades and settles in
 * 200 ms when it lights, and stands still under `prefers-reduced-motion`. The
 * live region names each slot once when it is read and each stage once when
 * it ends, at most one announcement every 1.5 s (§2.8).
 *
 * The links open in a new tab: the generation runs in this one, and leaving it
 * would lose the answer the model is writing.
 */
const ANNOUNCE_EVERY_MS = 1_500;

export default function GenerationChain({
  slots,
  stages,
  now,
  phaseKey,
}: {
  slots: ChainSlot[];
  stages: GenerationStage[];
  /** The clock the elapsed times are drawn against. */
  now: number;
  /** `data-generation-phase`, kept for the specs and the progress contract. */
  phaseKey: string;
}) {
  const announcement = useThrottledAnnouncement(slots, stages);
  return (
    <section
      aria-busy="true"
      aria-labelledby="transformation-progress-title"
      data-generation-screen=""
      data-generation-phase={phaseKey}
      className="mt-6 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc md:p-6"
    >
      <h2 id="transformation-progress-title" className="m-0 cc-text-h2 text-cc-ink">
        {wt('transformation.generatingTitle')}
      </h2>
      <p data-generation-caption="" className="m-0 mt-1 text-[13px] font-medium text-cc-ink-muted">
        {wt('transformation.chainCaption')}
      </p>

      <div className="mt-5 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <h3 className="m-0 text-[14px] font-bold text-cc-ink">{wt('transformation.chainTitle')}</h3>
          <ol data-generation-chain="" className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {slots.map((slot) => (
              <SlotRow key={slot.key} slot={slot} />
            ))}
          </ol>
        </div>
        <div className="min-w-0">
          <h3 className="m-0 text-[14px] font-bold text-cc-ink">{wt('transformation.stagesTitle')}</h3>
          <ol data-generation-stages="" className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {stages.map((stage) => (
              <StageRow key={stage.key} stage={stage} now={now} />
            ))}
          </ol>
        </div>
      </div>

      <span aria-live="polite" data-generation-live="" className="sr-only">
        {announcement}
      </span>
    </section>
  );
}

function SlotRow({ slot }: { slot: ChainSlot }) {
  const lit = slot.state !== 'loading';
  return (
    <li
      data-chain-slot={slot.key}
      data-chain-state={slot.state}
      className={cn(
        'min-w-0 rounded-cc-row border px-3 py-3',
        'motion-safe:transition-[opacity,transform,border-color] motion-safe:duration-200 motion-safe:ease-out',
        lit ? 'border-cc-line bg-cc-surface opacity-100 translate-y-0' : 'border-dashed border-cc-line bg-cc-surface-muted opacity-70 motion-safe:translate-y-1',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="m-0 text-[13px] font-bold text-cc-ink">{slot.title}</p>
        {lit ? <CcProvenanceChip value={slot.provenance} /> : null}
        {slot.state === 'stale' ? (
          <span className="text-[12px] font-semibold text-cc-warning">{wt('transformation.slot.stale')}</span>
        ) : null}
        {slot.state === 'missing' ? (
          <span className="text-[12px] font-semibold text-cc-ink-muted">{wt('transformation.slot.missing')}</span>
        ) : null}
        {slot.state === 'unread' ? (
          <span className="text-[12px] font-semibold text-cc-ink-muted">{wt('transformation.slot.unread')}</span>
        ) : null}
      </div>
      {!lit ? (
        <p className="m-0 mt-1 text-[12px] font-semibold text-cc-ink-muted">{wt('transformation.slot.loading')}</p>
      ) : (
        <>
          {slot.facts.length > 0 ? (
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {slot.facts.map((fact) => (
                <li key={fact.key} data-chain-fact={fact.key} className="min-w-0 text-[13px] font-medium text-cc-ink [overflow-wrap:anywhere]">
                  {fact.text}
                  {!fact.read ? (
                    <span data-chain-not-read="" className="block text-[12px] font-semibold text-cc-ink-muted">
                      {wt('transformation.notReadYet')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {slot.note ? <p className="m-0 mt-1 text-[13px] font-medium text-cc-ink-muted">{slot.note}</p> : null}
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            {slot.when ? <span className="text-[12px] font-semibold text-cc-ink-muted">{slot.when}</span> : null}
            <CcLinkButton
              href={(slot.fix ?? slot.source).href}
              variant={slot.fix ? 'secondary' : 'ghost'}
              icon={<ArrowRight size={16} aria-hidden={true} />}
              external={wt('transformation.opensNewTab')}
              data-chain-link={slot.key}
            >
              {(slot.fix ?? slot.source).label}
            </CcLinkButton>
          </div>
        </>
      )}
    </li>
  );
}

function StageRow({ stage, now }: { stage: GenerationStage; now: number }) {
  const elapsed =
    stage.startedAt === null
      ? null
      : stage.state === 'active'
        ? tfElapsed(formatElapsed(now - stage.startedAt))
        : stage.endedAt !== null
          ? tfTook(formatElapsed(stage.endedAt - stage.startedAt))
          : null;
  return (
    <li data-generation-stage={stage.key} data-stage-state={stage.state} className="flex min-w-0 items-start gap-2">
      <span aria-hidden={true} className={cn('mt-0.5 shrink-0', stage.state === 'failed' ? 'text-cc-error' : stage.state === 'pending' ? 'text-cc-ink-muted' : 'text-cc-ink')}>
        {stage.state === 'done' ? <Check size={16} /> : stage.state === 'failed' ? <X size={16} /> : <CircleDashed size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('m-0 text-[13px] font-semibold', stage.state === 'pending' ? 'text-cc-ink-muted' : 'text-cc-ink')}>
          {stage.label}
          <span className="sr-only"> — {wt(`transformation.stageState.${stage.state}`)}</span>
        </p>
        {elapsed ? (
          <p data-generation-elapsed="" className="m-0 font-cc-mono text-[12px] font-semibold text-cc-ink-muted">
            {elapsed}
            {stage.attempt && stage.attempt.n > 1 ? ` · ${tfAttempt(stage.attempt.n, stage.attempt.of)}` : ''}
          </p>
        ) : null}
        {stage.detail ? <p data-generation-stage-detail="" className="m-0 text-[12px] font-semibold text-cc-ink-muted">{stage.detail}</p> : null}
        {stage.state === 'active' && stage.note ? (
          <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{stage.note}</p>
        ) : null}
        {stage.checks && stage.state !== 'pending' ? (
          <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
            {stage.checks.map((check) => (
              <CheckRow key={check.key} check={check} />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function CheckRow({ check }: { check: GenerationCheck }) {
  return (
    <li data-generation-check={check.key} data-check-state={check.state} className="flex min-w-0 items-start gap-2 text-[12px] font-semibold">
      <span aria-hidden={true} className={cn('mt-px shrink-0', check.state === 'failed' ? 'text-cc-error' : check.state === 'warning' ? 'text-cc-warning' : check.state === 'passed' ? 'text-cc-ink' : 'text-cc-ink-muted')}>
        {check.state === 'passed' ? <Check size={14} /> : check.state === 'failed' ? <X size={14} /> : <CircleDashed size={14} />}
      </span>
      <span className="min-w-0 text-cc-ink-muted">
        <span className={check.state === 'pending' ? undefined : 'text-cc-ink'}>{check.label}</span>
        {check.result ? ` — ${check.result}` : ''}
        <span className="sr-only"> — {wt(`transformation.checkState.${check.state}`)}</span>
      </span>
    </li>
  );
}

/**
 * One announcement per slot (when it is read) and per stage (when it ends),
 * gathered and said at most once every 1.5 s — never the running clock.
 */
function useThrottledAnnouncement(slots: ChainSlot[], stages: GenerationStage[]): string {
  const [said, setSaid] = useState('');
  const announced = useRef<Set<string>>(new Set());
  const queue = useRef<string[]>([]);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fresh = newlyDoneAnnouncement(
      [
        ...slots.map((s) => ({
          id: `slot:${s.key}`,
          label: s.title,
          status: s.state === 'loading' ? 'pending' : 'done',
          result: s.facts[0]?.text ?? s.note ?? undefined,
        })),
        ...stages.map((s) => ({ id: `stage:${s.key}`, label: s.label, status: s.state === 'done' || s.state === 'failed' ? 'done' : 'pending' })),
      ],
      announced.current,
    );
    if (fresh === null) return;
    queue.current.push(fresh);
    const flush = () => {
      timer.current = null;
      if (queue.current.length === 0) return;
      last.current = Date.now();
      setSaid(queue.current.join('. '));
      queue.current = [];
    };
    const wait = ANNOUNCE_EVERY_MS - (Date.now() - last.current);
    if (wait <= 0) flush();
    else if (!timer.current) timer.current = setTimeout(flush, wait);
  }, [slots, stages]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return said;
}
