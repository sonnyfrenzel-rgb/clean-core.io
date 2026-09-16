'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/cc-messages';
import type { RunCost } from '@/lib/run-cost';
import CcButton from './Button';
import CcMessageStrip from './MessageStrip';
import CcMessageBox from './MessageBox';

/**
 * A long run, honestly — `DESIGN.md` §2.8 (ADR-019).
 *
 * An analysis takes as long as it takes, and everything people hate about
 * waiting is avoidable. Six rules, each of which was once broken here:
 *
 *   1. **The price stands before the click.** `CcRunCost` prints it: what it
 *      spends of the quota, and — separately — whether a model is called at
 *      all. The numbers come from the account (`lib/run-cost.ts`), never from a
 *      design. The evidence scanner used to sit for six seconds saying nothing
 *      and then charge a run.
 *   2. **Stages, not percentages.** There is no percentage; there never was
 *      one; a progress bar that is invented is a lie told slowly.
 *   3. **One announcement per stage.** The live region says "Process
 *      recognised: 14 steps, 5 decisions" once, and never the running counters
 *      — a screen reader reading a counter forty times a second is a screen
 *      reader that has to be turned off.
 *   4. **Cancel, the whole time.** Not only between stages.
 *   5. **Leaving is allowed.** If the work carries on server-side the page says
 *      so; if the run would be lost, a Message Box asks first — that is the
 *      `onLeave` path, and it is why this component owns a `CcMessageBox`.
 *   6. **A failure ends in an action**, never in a raw error and never in a
 *      silent empty result: "Retry", "Run without model", "Keep technical
 *      names".
 *
 * There is deliberately no spinner that plays at thinking, no typing effect and
 * no pulsing dot (§3.1, §5.4). The stage name says what is being read. That is
 * the honest version of "something is happening", and it is also the
 * interesting one.
 */
export interface CcRunStage {
  id: string;
  /** "Code read", "Process recognised". */
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  /**
   * What the stage found, once it is done — "14 steps, 5 decisions". This, with
   * the label, is the one thing announced.
   */
  result?: string;
  /** What is being read right now. Shown, never announced (rule 3). */
  detail?: string;
}

export function CcRunCost({ cost }: { cost: RunCost }) {
  return (
    <span data-cc-run-cost="" className="text-[12px] font-medium text-cc-ink-muted">
      <span data-cc-run-cost-quota="">{cost.quota}</span>
      {' · '}
      <span data-cc-run-cost-model="">{cost.modelCall}</span>
    </span>
  );
}

export interface CcRunIndicatorProps {
  /** What is being run, and how big — "Reading 3 programs, 10,400 lines". */
  scope: string;
  stages: readonly CcRunStage[];
  /** Counters that move with the work. Shown, never announced. */
  counters?: { label: string; value: string }[];
  onCancel: () => void;
  /**
   * True when the server keeps going after the tab closes. Decides which of the
   * two leaving behaviours applies.
   */
  survivesLeaving: boolean;
  /** Offered when `survivesLeaving` is false — opens the confirmation. */
  onLeave?: () => void;
  /** What went wrong, with at least one action. */
  error?: { headline: string; detail: string; actions: React.ReactNode };
}

export default function CcRunIndicator({
  scope,
  stages,
  counters,
  onCancel,
  survivesLeaving,
  onLeave,
  error,
}: CcRunIndicatorProps) {
  const [announcement, setAnnouncement] = useState('');
  const [leaveAsked, setLeaveAsked] = useState(false);
  const announced = useRef<Set<string>>(new Set());

  // One announcement per stage, on the transition into `done`. Keyed by stage
  // id, so a re-render — or a counter ticking — cannot produce a second.
  useEffect(() => {
    for (const stage of stages) {
      if (stage.status !== 'done' || announced.current.has(stage.id)) continue;
      announced.current.add(stage.id);
      setAnnouncement(stage.result ? `${stage.label}: ${stage.result}` : stage.label);
    }
  }, [stages]);

  return (
    <div data-cc-run-indicator="" className="flex flex-col gap-3">
      <p className="m-0 text-[13px] font-medium text-cc-ink">{scope}</p>

      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {stages.map((stage) => (
          <li
            key={stage.id}
            data-cc-run-stage={stage.status}
            className="flex items-start gap-2 text-[13px] leading-snug"
          >
            <span
              aria-hidden={true}
              className={cn(
                'mt-0.5 shrink-0',
                stage.status === 'done' ? 'text-cc-success' : 'text-cc-ink-muted',
              )}
            >
              {stage.status === 'done' ? <Check size={16} /> : <CircleDashed size={16} />}
            </span>
            <span className="min-w-0">
              <span className="font-semibold text-cc-ink">{stage.label}</span>
              {stage.result ? (
                <span className="text-cc-ink-muted"> — {stage.result}</span>
              ) : null}
              {stage.detail ? (
                <span className="block font-cc-mono text-[12px] text-cc-ink-muted">
                  {stage.detail}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      {counters && counters.length > 0 ? (
        <div
          aria-hidden={true}
          data-cc-run-counters=""
          className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-cc-ink-muted"
        >
          {counters.map((counter) => (
            <span key={counter.label}>
              {counter.label} <b className="font-bold text-cc-ink">{counter.value}</b>
            </span>
          ))}
        </div>
      ) : null}

      {/* The one thing a screen reader hears from a run in progress. */}
      <span aria-live="polite" data-cc-run-live="" className="sr-only">
        {announcement}
      </span>

      {error ? (
        <CcMessageStrip state="error" headline={error.headline} actions={error.actions} announce>
          {error.detail}
        </CcMessageStrip>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <CcButton variant="ghost" onClick={onCancel} data-cc-run-cancel="">
          {t('run.cancelRun')}
        </CcButton>
        <span className="text-[12px] font-medium text-cc-ink-muted">
          {survivesLeaving ? t('run.serverContinues') : t('run.leaveWarning')}
        </span>
        {!survivesLeaving && onLeave ? (
          <CcButton variant="ghost" onClick={() => setLeaveAsked(true)} data-cc-run-leave="">
            {t('action.close')}
          </CcButton>
        ) : null}
      </div>

      <CcMessageBox
        open={leaveAsked}
        title={t('run.leaveWarning')}
        confirmLabel={t('action.close')}
        onCancel={() => setLeaveAsked(false)}
        onConfirm={() => {
          setLeaveAsked(false);
          onLeave?.();
        }}
      >
        {t('run.leaveWarning')}
      </CcMessageBox>
    </div>
  );
}
