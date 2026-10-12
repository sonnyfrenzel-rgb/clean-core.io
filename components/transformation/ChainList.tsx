'use client';

import React from 'react';
import { AlertTriangle, Check, MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { formatElapsed } from '@/lib/generation-progress';
import { phaseHeading, type ChainSlot, type GenerationCheck, type GenerationStage } from '@/lib/transformation-chain';
import { tfAttempt, tfElapsed, tfTook, wt } from '@/lib/workspace-messages';

/**
 * The chain of what a generation builds on — the mockup's timeline
 * (`docs/roadmap/transformation-generation-mockup.html`): the slots of the
 * tools before Transformation, grouped by phase, each with a dot on a line,
 * its tool, when, the way to it, its facts with their level, and a warning
 * line where its input could be better. While a generation runs, the
 * generation's own stages follow after a rule.
 *
 * `before` — every slot is drawn as it will be used. `run` — a slot is
 * "Loading…" until the generation has read its contribution (`lit`), then it
 * lights: the dot and the line to the next fill in 200–250 ms, never looping,
 * and at once under `prefers-reduced-motion` (§1.7).
 */
type DotState = 'waiting' | 'loading' | 'loaded' | 'attention' | 'active' | 'done' | 'failed';

const DOT: Record<DotState, string> = {
  waiting: 'border-cc-neutral-border bg-cc-surface text-cc-ink-muted',
  loading: 'border-cc-information bg-cc-surface text-cc-information',
  loaded: 'border-cc-information bg-cc-information-bg text-cc-information',
  attention: 'border-cc-warning-mark bg-cc-warning-bg text-cc-warning',
  active: 'border-cc-ink bg-cc-ink text-cc-on-dark',
  done: 'border-cc-ink bg-cc-surface text-cc-ink',
  failed: 'border-cc-error bg-cc-error-bg text-cc-error',
};

function DotIcon({ state }: { state: DotState }) {
  if (state === 'loaded' || state === 'done') return <Check size={14} aria-hidden={true} />;
  if (state === 'attention') return <AlertTriangle size={14} aria-hidden={true} />;
  if (state === 'failed') return <X size={14} aria-hidden={true} />;
  return <MoreHorizontal size={14} aria-hidden={true} />;
}

/** One row of the timeline: the dot, the line to the next row, and the body. */
function Row({
  dot,
  flowed,
  last,
  children,
  ...data
}: {
  dot: DotState;
  flowed: boolean;
  last: boolean;
  children: React.ReactNode;
} & { [k: `data-${string}`]: string | undefined }) {
  return (
    <li {...data} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-3">
      {!last ? (
        <>
          <span aria-hidden={true} className="absolute top-7 bottom-0 left-[13px] w-0.5 bg-cc-neutral-border" />
          <span
            aria-hidden={true}
            className={cn(
              'absolute top-7 left-[13px] w-0.5 bg-cc-information motion-safe:transition-[height] motion-safe:duration-[250ms]',
              flowed ? 'h-[calc(100%-28px)]' : 'h-0',
            )}
          />
        </>
      ) : null}
      <span
        aria-hidden={true}
        className={cn(
          'relative z-[1] grid h-7 w-7 place-items-center rounded-full border-2 motion-safe:transition-colors motion-safe:duration-200',
          DOT[dot],
        )}
      >
        <DotIcon state={dot} />
      </span>
      {children}
    </li>
  );
}

function SourceLink({ href, label, newTab }: { href: string; label: string; newTab: boolean }) {
  return newTab ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-cc-information underline underline-offset-2">
      {label}
      <span className="sr-only"> ({wt('transformation.opensNewTab')})</span>
    </a>
  ) : (
    <a href={href} className="font-semibold text-cc-information underline underline-offset-2">
      {label}
    </a>
  );
}

function SlotBody({ slot, mode, lit }: { slot: ChainSlot; mode: 'before' | 'run'; lit: boolean }) {
  const attention = slot.warn !== null || slot.state === 'missing' || slot.state === 'unread';
  const word =
    mode === 'before'
      ? slot.state === 'loading'
        ? wt('transformation.state.loading')
        : slot.state === 'missing'
          ? wt('transformation.state.missing')
          : slot.state === 'unread'
            ? wt('transformation.state.unread')
            : attention
              ? wt('transformation.state.willBeUsedBetter')
              : wt('transformation.state.willBeUsed')
      : !lit || slot.state === 'loading'
        ? wt('transformation.state.loading')
        : slot.state === 'missing'
          ? wt('transformation.state.missing')
          : slot.state === 'unread'
            ? wt('transformation.state.unread')
            : attention
          ? wt('transformation.state.inContextAttention')
          : wt('transformation.state.inContext');
  const showFacts = lit && slot.state !== 'loading';
  return (
    <div
      className={cn(
        'min-w-0 rounded-cc-row border bg-cc-surface px-3 py-2 motion-safe:transition-colors motion-safe:duration-200',
        showFacts && attention ? 'border-cc-warning-border' : 'border-cc-line',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[14px] font-bold text-cc-ink">{slot.title}</span>
        <span className="text-[12px] font-semibold text-cc-ink-muted">
          {slot.when ? `${slot.when} · ` : ''}
          <SourceLink href={slot.source.href} label={slot.source.label} newTab={mode === 'run'} />
        </span>
        <span data-chain-word="" className="text-[12px] font-semibold text-cc-ink-muted max-sm:w-full sm:ml-auto">
          {word}
        </span>
      </div>
      {showFacts && slot.facts.length > 0 ? (
        <ul className={cn('m-0 mt-1 grid list-none gap-1 p-0 text-[13px]', mode === 'run' && !attention && 'max-sm:hidden')}>
          {slot.facts.map((f) => (
            <li key={f.key} data-chain-fact={f.key} className="flex min-w-0 flex-wrap items-baseline gap-2">
              <span className="min-w-0 flex-[1_1_220px] font-medium text-cc-ink [overflow-wrap:anywhere]">{f.text}</span>
              <CcProvenanceChip value={f.provenance} />
              {!f.read ? (
                <span data-chain-not-read="" className="w-full text-[12px] font-semibold text-cc-ink-muted">
                  {wt('transformation.notReadYet')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {showFacts && slot.warn ? (
        <p data-chain-warn="" className="m-0 mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] font-medium text-cc-warning">
          <AlertTriangle size={14} aria-hidden={true} className="shrink-0 self-center" />
          <span>{slot.warn.text}</span>
          <SourceLink href={slot.warn.fix.href} label={slot.warn.fix.label} newTab={mode === 'run'} />
        </p>
      ) : null}
    </div>
  );
}

function stageDot(stage: GenerationStage): DotState {
  if (stage.state === 'active') return 'active';
  if (stage.state === 'done') return 'done';
  if (stage.state === 'failed') return 'failed';
  return 'waiting';
}

function StageBody({ stage, now }: { stage: GenerationStage; now: number }) {
  const word =
    stage.state === 'active'
      ? stage.startedAt !== null
        ? tfElapsed(formatElapsed(now - stage.startedAt))
        : wt('transformation.state.running')
      : stage.state === 'done' && stage.startedAt !== null && stage.endedAt !== null
        ? tfTook(wt('transformation.state.done'), formatElapsed(stage.endedAt - stage.startedAt))
        : stage.state === 'failed'
          ? wt('transformation.state.stopped')
          : wt('transformation.state.waiting');
  return (
    <div
      className={cn(
        'min-w-0 rounded-cc-row border bg-cc-surface px-3 py-2 motion-safe:transition-colors motion-safe:duration-200',
        stage.state === 'active' ? 'border-cc-ink' : stage.state === 'failed' ? 'border-cc-error-border' : 'border-cc-line',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[14px] font-bold text-cc-ink">{stage.label}</span>
        <span className="text-[12px] font-semibold text-cc-ink-muted">
          {stage.note}
          {stage.attempt && stage.attempt.n > 1 ? ` · ${tfAttempt(stage.attempt.n, stage.attempt.of)}` : ''}
        </span>
        <span data-generation-elapsed="" className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted max-sm:w-full sm:ml-auto">
          {word}
        </span>
      </div>
      {stage.detail ? (
        <p data-generation-stage-detail="" className="m-0 mt-1 text-[13px] font-medium text-cc-warning">
          {stage.detail}
        </p>
      ) : null}
      {stage.facts && stage.facts.length > 0 ? (
        <ul className={cn('m-0 mt-1 grid list-none gap-1 p-0 text-[13px]', stage.state !== 'active' && 'max-sm:hidden')}>
          {stage.facts.map((f) => (
            <li key={f} className="flex min-w-0 flex-wrap items-baseline gap-2">
              <span className="min-w-0 flex-[1_1_220px] font-medium text-cc-ink">{f}</span>
              <CcProvenanceChip value={stage.provenance} />
            </li>
          ))}
        </ul>
      ) : null}
      {stage.checks && stage.state !== 'pending' ? (
        <ul className="m-0 mt-1 grid list-none gap-1 p-0">
          {stage.checks.map((c) => (
            <CheckRow key={c.key} check={c} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CheckRow({ check }: { check: GenerationCheck }) {
  return (
    <li data-generation-check={check.key} data-check-state={check.state} className="flex min-w-0 items-start gap-2 text-[13px] font-medium">
      <span
        aria-hidden={true}
        className={cn(
          'mt-0.5 shrink-0',
          check.state === 'failed' ? 'text-cc-error' : check.state === 'warning' ? 'text-cc-warning' : check.state === 'met' ? 'text-cc-ink' : 'text-cc-ink-muted',
        )}
      >
        {check.state === 'met' ? <Check size={14} /> : check.state === 'failed' ? <X size={14} /> : check.state === 'warning' ? <AlertTriangle size={14} /> : <MoreHorizontal size={14} />}
      </span>
      <span className={cn('min-w-0 [overflow-wrap:anywhere]', check.state === 'pending' ? 'text-cc-ink-muted' : 'text-cc-ink')}>
        {check.label}
        {check.result ? ` — ${check.result}` : ''}
        <span className="sr-only"> — {wt(`transformation.checkState.${check.state}`)}</span>
      </span>
    </li>
  );
}

export default function ChainList({
  slots,
  mode,
  lit = true,
  stages = [],
  now = 0,
}: {
  slots: ChainSlot[];
  mode: 'before' | 'run';
  /** `run` only: the generation has read the slots' contributions. */
  lit?: boolean;
  /** `run` only: the generation's own stages, after the chain. */
  stages?: GenerationStage[];
  now?: number;
}) {
  const items: React.ReactNode[] = [];
  let phase: string | null = null;
  slots.forEach((slot, i) => {
    if (slot.phase !== phase) {
      phase = slot.phase;
      items.push(
        <li key={`phase-${slot.phase}`} data-chain-phase={slot.phase} className="mt-3 mb-1 ml-10 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase first:mt-0">
          {phaseHeading(slot.phase)}
        </li>,
      );
    }
    const attention = slot.warn !== null || slot.state === 'missing' || slot.state === 'unread';
    const ready = mode === 'before' ? slot.state !== 'loading' : lit && slot.state !== 'loading';
    items.push(
      <Row
        key={slot.key}
        dot={!ready ? 'loading' : attention ? 'attention' : 'loaded'}
        flowed={mode === 'run' && ready}
        last={i === slots.length - 1 && stages.length === 0}
        data-chain-slot={slot.key}
        data-chain-state={!ready ? 'loading' : attention ? 'attention' : 'loaded'}
      >
        <SlotBody slot={slot} mode={mode} lit={lit} />
      </Row>,
    );
  });
  if (stages.length > 0) {
    items.push(<li key="sep" aria-hidden={true} className="mt-1 mb-3 ml-10 h-px bg-cc-line" />);
    stages.forEach((stage, i) => {
      items.push(
        <Row
          key={stage.key}
          dot={stageDot(stage)}
          flowed={stage.state === 'done'}
          last={i === stages.length - 1}
          data-generation-stage={stage.key}
          data-stage-state={stage.state}
        >
          <StageBody stage={stage} now={now} />
        </Row>,
      );
    });
  }
  return <ol data-generation-chain={mode} className="m-0 mt-3 list-none p-0">{items}</ol>;
}
