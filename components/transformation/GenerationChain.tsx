'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import ChainList from '@/components/transformation/ChainList';
import { formatElapsed } from '@/lib/generation-progress';
import { tfContextAnnouncement, tfRunTitle, wt } from '@/lib/workspace-messages';
import type { ChainSlot, GenerationStage } from '@/lib/transformation-chain';

/**
 * The generation screen (roadmap 3.0.12, owner 12.10.2026; design §15, mockup
 * state 2) — what replaced the progress bar and the log.
 *
 * The header says what is written and the real time since the click — no
 * percentage, because the model answers in one piece (§2.8). Under one factual
 * caption stands the chain: the slots of the tools before Transformation,
 * "Loading…" until the generation has read the PLATFORM KNOWLEDGE block they
 * go into, then lit; after a rule, the generation's own stages as they run.
 * Stages that do not exist yet (the engine scaffold, step-wise fills, repairs)
 * are not drawn — they arrive as data (`GENERATION_STAGE_ORDER`).
 *
 * The live region says one sentence per phase — the context loaded, each
 * stage ended — never a running clock, and at most one every 1.5 s.
 *
 * Its links open in a new tab: the generation runs in this one, and leaving
 * it would lose the answer the model is writing.
 */
const ANNOUNCE_EVERY_MS = 1_500;

export default function GenerationChain({
  program,
  slots,
  lit,
  stages,
  startedAt,
  now,
  phaseKey,
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
}) {
  const announcement = useAnnouncements(slots, lit, stages);
  return (
    <section aria-busy="true" aria-labelledby="transformation-progress-title" data-generation-screen="" data-generation-phase={phaseKey} className="mt-6 flex flex-col gap-4">
      <div className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="transformation-progress-title" className="m-0 min-w-0 cc-text-h2 text-cc-ink [overflow-wrap:anywhere]">
            {tfRunTitle(program)}
          </h2>
          <span aria-label={wt('transformation.elapsed')} data-generation-elapsed-total="" className="font-cc-mono text-[13px] font-semibold text-cc-ink-muted tabular-nums">
            {startedAt === null ? '0:00' : formatElapsed(now - startedAt)}
          </span>
        </div>
        <p data-generation-caption="" className="m-0 mt-3 flex items-start gap-2 rounded-cc-row border border-cc-information-border bg-cc-information-bg px-3 py-2 text-[13px] font-medium text-cc-ink">
          <Info size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-information" />
          <span>{wt('transformation.chainCaption')}</span>
        </p>
      </div>
      <div className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
        <h2 className="m-0 cc-text-h2 text-cc-ink">{wt('transformation.chainRunTitle')}</h2>
        <ChainList slots={slots} mode="run" lit={lit} stages={stages} now={now} />
      </div>
      <span aria-live="polite" data-generation-live="" className="sr-only">
        {announcement}
      </span>
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
