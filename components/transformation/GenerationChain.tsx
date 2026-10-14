'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import ChainList from '@/components/transformation/ChainList';
import CcButton from '@/components/cc/Button';
import { cn } from '@/lib/utils';
import { formatElapsed } from '@/lib/generation-progress';
import { tfContextAnnouncement, tfRunTitle, tfShowAllUnits, tfUnitsCounter, wt } from '@/lib/workspace-messages';
import type { ChainSlot, GenerationStage, UnitBoard, UnitBoardRow } from '@/lib/transformation-chain';

/**
 * The generation screen (roadmap 3.0.12, owner 12.10.2026; design §15, mockup
 * state 2) — what replaced the progress bar and the log.
 *
 * The header says what is written, the real time since the click — no
 * percentage anywhere (§2.8) — and *Cancel*, which really aborts: the page
 * hands one AbortController to the scaffold worker, the orchestrator and every
 * model call. It is offered until the package is sent to be stored — that
 * write cannot be taken back, so the page withholds the button from then on,
 * and a cancel that wins stores nothing. Under one factual caption stand
 * two columns from L: the chain (the tools before Transformation, then the
 * generation's own stages as they run — engine scaffold, model fills, checks,
 * repairs only when needed, saved) and the work panel (the functions in plan
 * order, each with its ABAP lines and rule ids and its state). On a phone the
 * chain comes first, the panel shows the counter and the first six functions
 * behind "Show all n functions".
 *
 * The live region says one sentence per phase — the context loaded, each
 * stage ended — never a running counter, and at most one every 1.5 s.
 *
 * Its links open in a new tab: the generation runs in this one, and leaving
 * it would lose the answer the model is writing.
 */
const ANNOUNCE_EVERY_MS = 1_500;
const PHONE_ROWS = 6;

export default function GenerationChain({
  program,
  slots,
  lit,
  stages,
  startedAt,
  now,
  phaseKey,
  units = null,
  onCancel,
  cancelling = false,
  remaining = null,
}: {
  program: string | null | undefined;
  slots: ChainSlot[];
  /** The generation has read the slots' contributions — the contract answered with the block. */
  lit: boolean;
  stages: GenerationStage[];
  startedAt: number | null;
  now: number;
  /** `data-generation-phase`, kept for the specs and the progress contract. */
  phaseKey: string;
  /** The functions of the engine-led path; null before the scaffold, and on the single call. */
  units?: UnitBoard | null;
  /** Stops the generation before its package is stored. Absent: no button (none to run, or the store has begun). */
  onCancel?: () => void;
  cancelling?: boolean;
  /**
   * The time left, as an estimate in words ("estimate: about 12–16 minutes
   * left", `lib/transformation/duration-estimate.ts`) — beside the elapsed
   * time, never a countdown (owner, 13.10.2026). Null when nothing is known.
   */
  remaining?: string | null;
}) {
  const announcement = useAnnouncements(slots, lit, stages);
  const engineLed = stages.some((s) => s.key === 'scaffold');
  return (
    <section aria-busy="true" aria-labelledby="transformation-progress-title" data-generation-screen="" data-generation-phase={phaseKey} data-generation-path={engineLed ? 'engine-led' : 'single-call'} className="mt-6 flex flex-col gap-4">
      <div className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="transformation-progress-title" className="m-0 min-w-0 cc-text-h2 text-cc-ink [overflow-wrap:anywhere]">
            {tfRunTitle(program)}
          </h2>
          <span aria-label={wt('transformation.elapsed')} data-generation-elapsed-total="" className="font-cc-mono text-[13px] font-semibold text-cc-ink-muted tabular-nums">
            {startedAt === null ? '0:00' : formatElapsed(now - startedAt)}
          </span>
          {remaining ? (
            <span data-generation-remaining="" className="text-[13px] font-semibold text-cc-ink-muted">
              {remaining}
            </span>
          ) : null}
          {onCancel ? (
            <span className="ml-auto">
              <CcButton icon={<X size={16} aria-hidden="true" />} onClick={onCancel} busy={cancelling} data-generation-cancel="">
                {cancelling ? wt('transformation.cancelling') : wt('transformation.cancel')}
              </CcButton>
            </span>
          ) : null}
        </div>
        <p data-generation-caption="" className="m-0 mt-3 flex items-start gap-2 rounded-cc-row border border-cc-information-border bg-cc-information-bg px-3 py-2 text-[13px] font-medium text-cc-ink">
          <Info size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-information" />
          <span>{wt('transformation.chainCaption')}</span>
        </p>
      </div>
      <div className={cn('grid grid-cols-1 gap-4', engineLed && 'lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')}>
        <div className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
          <h2 className="m-0 cc-text-h2 text-cc-ink">{wt('transformation.chainRunTitle')}</h2>
          <ChainList slots={slots} mode="run" lit={lit} stages={stages} now={now} />
        </div>
        {engineLed ? <UnitsPanel units={units} /> : null}
      </div>
      <span aria-live="polite" data-generation-live="" className="sr-only">
        {announcement}
      </span>
    </section>
  );
}

const UNIT_STATE_CLASS: Record<UnitBoardRow['state'], string> = {
  waiting: 'text-cc-ink-muted',
  writing: 'text-cc-information',
  written: 'text-cc-ink',
  repair: 'text-cc-warning',
  repaired: 'text-cc-ink',
  'not-written': 'text-cc-warning',
};

const METER_CLASS: Record<UnitBoardRow['state'], string> = {
  waiting: 'bg-cc-neutral-border',
  writing: 'bg-cc-information-border',
  written: 'bg-cc-ink',
  repair: 'bg-cc-warning-mark',
  repaired: 'bg-cc-ink',
  'not-written': 'bg-cc-warning-mark',
};

/** The work panel (§15.2): the counter, a meter with one segment per function, the functions in plan order. */
function UnitsPanel({ units }: { units: UnitBoard | null }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="generation-units-title" data-generation-units="" className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
      <h2 id="generation-units-title" className="m-0 cc-text-h2 text-cc-ink">
        {wt('transformation.unitsTitle')}
      </h2>
      {units === null ? (
        <p data-generation-units-counter="" className="m-0 mt-2 text-[13px] font-semibold text-cc-ink-muted">
          {wt('transformation.unitsWaiting')}
        </p>
      ) : (
        <>
          <p data-generation-units-counter="" className="m-0 mt-2 text-[13px] font-semibold text-cc-ink tabular-nums">
            {tfUnitsCounter(units.written, units.total)}
          </p>
          <div aria-hidden={true} className="mt-2 mb-3 flex flex-wrap gap-1">
            {units.rows.map((r) => (
              <i key={r.unitId} className={cn('h-2 min-w-2 flex-[1_0_8px] rounded-[2px] motion-safe:transition-colors motion-safe:duration-200', METER_CLASS[r.state])} />
            ))}
          </div>
          <ol className="m-0 max-h-[520px] list-none overflow-auto border-t border-cc-line p-0">
            {units.rows.map((r, i) => (
              <li
                key={r.unitId}
                data-generation-unit={r.unitId}
                data-unit-state={r.state}
                className={cn(
                  'grid grid-cols-[44px_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 border-b border-cc-line px-1 py-2 text-[13px] sm:grid-cols-[44px_minmax(0,1fr)_auto]',
                  !open && i >= PHONE_ROWS && 'max-sm:hidden',
                )}
              >
                <span className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted">{r.unitId}</span>
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-semibold text-cc-ink">{r.title}</span>{' '}
                  <span className="font-cc-mono text-[12px] text-cc-ink-muted">
                    {r.lines}
                    {r.rules.length > 0 ? ` · ${r.rules.slice(0, 4).join(' ')}${r.rules.length > 4 ? ' …' : ''}` : ''}
                  </span>
                </span>
                {/* A reason is a sentence: it gets its own line under the title. In
                    the status column it took the title's width (dev acceptance 14.10.2026). */}
                <span
                  data-unit-word=""
                  className={cn(
                    'col-start-2 text-[12px] font-semibold',
                    r.state === 'not-written' ? 'sm:col-span-2' : 'sm:col-start-auto sm:text-right',
                    UNIT_STATE_CLASS[r.state],
                  )}
                >
                  {r.word}
                </span>
                {r.code ? (
                  <span data-unit-code={r.code} className="col-start-2 text-[12px] font-medium text-cc-ink-muted sm:col-span-2">
                    <span className="font-cc-mono font-semibold text-cc-ink">{r.code}</span>
                    {r.hint ? <> — {r.hint}</> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          {!open && units.total > PHONE_ROWS ? (
            <span className="mt-2 inline-flex sm:hidden">
              <CcButton onClick={() => setOpen(true)} data-generation-units-all="">
                {tfShowAllUnits(units.total)}
              </CcButton>
            </span>
          ) : null}
        </>
      )}
    </section>
  );
}

/** One sentence when the context is read, one per stage when it ends — gathered, at most one every 1.5 s. */
function useAnnouncements(slots: ChainSlot[], lit: boolean, stages: GenerationStage[]): string {
  const [said, setSaid] = useState('');
  const announced = useRef<Set<string>>(new Set());
  const queue = useRef<string[]>([]);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fresh: string[] = [];
    if (lit && !announced.current.has('context')) {
      announced.current.add('context');
      const attention = slots.filter((s) => s.warn !== null || s.state === 'missing' || s.state === 'unread').length;
      fresh.push(tfContextAnnouncement(slots.length, attention));
    }
    for (const s of stages) {
      if ((s.state === 'done' || s.state === 'failed') && !announced.current.has(s.key)) {
        announced.current.add(s.key);
        fresh.push(s.facts?.[0] ? `${s.label}: ${s.facts[0]}` : `${s.label}: ${s.state === 'done' ? wt('transformation.state.done') : wt('transformation.state.stopped')}`);
      }
    }
    if (fresh.length === 0) return;
    queue.current.push(...fresh);
    const flush = () => {
      timer.current = null;
      if (queue.current.length === 0) return;
      last.current = Date.now();
      setSaid(queue.current.join(' '));
      queue.current = [];
    };
    const wait = ANNOUNCE_EVERY_MS - (Date.now() - last.current);
    if (wait <= 0) flush();
    else if (!timer.current) timer.current = setTimeout(flush, wait);
  }, [slots, lit, stages]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return said;
}
