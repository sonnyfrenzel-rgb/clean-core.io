'use client';

import React from 'react';
import FamilyChip from '@/components/family/FamilyChip';
import { formatElapsed } from '@/lib/generation-progress';
import { formatTextDate } from '@/lib/format';
import { tfBuiltOnMeta, tfSingleCallNote, wt } from '@/lib/workspace-messages';
import type { ChainSlot } from '@/lib/transformation-chain';
import { basisSlotChanged, type BasisSlot, type GenerationRecord } from '@/lib/transformation/generation-record';

/**
 * "Built on", in the Transformation page's side column (ADR-129; roadmap 3.0.12, step E; design §15.4, §18): what the
 * stored package was built on, read from the binding's `basis` — what the generation used *then* — with "changed since"
 * on each tool whose state today differs from that snapshot.
 *
 * Its checks are not here any more: the functions left empty, abaplint's verdict and the CDS compile are rows of the
 * page's one Checks table (`lib/transformation/checks-table.ts`, mock-up T4), counted in the answer's Checks facet.
 *
 * Three forms, one per kind of stored package:
 *   - engine-led: the tools it read, one line each;
 *   - the single call as the fallback: the note that says so and why;
 *   - a package from before 3.0.12 (no path on its binding): one neutral line, never marked stale for it (§18).
 */
export default function BuiltOnCard({
  record,
  generatedAt,
  currentSlots,
}: {
  /** The stored record (`storedGenerationRecord`); null for a package from before 3.0.12. */
  record: (GenerationRecord & { contextDigest: string | null }) | null;
  generatedAt: string | null;
  /** The slots as the page reads them now — for the "changed since" marks. */
  currentSlots: ChainSlot[];
}) {
  const card = 'min-w-0 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc';
  if (!record) {
    return (
      <section aria-labelledby="built-on-title" data-built-on="legacy" className={card}>
        <h2 id="built-on-title" className="m-0 cc-text-h3 text-cc-ink">
          {wt('transformation.builtOnTitle')}
        </h2>
        <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">{wt('transformation.legacyGeneration')}</p>
      </section>
    );
  }
  const took = record.elapsedMs !== null ? `took ${formatElapsed(record.elapsedMs)} min` : null;
  const calls = record.engine ? `${record.engine.callsUsed} model ${record.engine.callsUsed === 1 ? 'call' : 'calls'}` : null;
  const meta = tfBuiltOnMeta(formatTextDate(generatedAt), [took, calls].filter(Boolean).join(' · ') || null);
  return (
    <section aria-labelledby="built-on-title" data-built-on={record.path} className={card}>
      <h2 id="built-on-title" className="m-0 cc-text-h3 text-cc-ink">
        {wt('transformation.builtOnTitle')}
      </h2>
      {meta ? (
        <p className="m-0 mt-1 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
          {meta} <FamilyChip kind="ai" />
        </p>
      ) : null}
      {record.basis.length > 0 ? (
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {record.basis.map((b) => {
            const stale = isStale(b, currentSlots);
            return (
              <li key={b.key} data-built-on-slot={b.key} data-built-on-stale={stale ? '' : undefined} className="min-w-0 cc-text-cell">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="font-bold text-cc-ink">{b.title}</span>
                  {stale ? (
                    <span className="cc-text-meta font-semibold text-cc-warning" data-built-on-changed="">
                      {wt('transformation.builtOnStale')}
                    </span>
                  ) : null}
                </span>
                <span className="block cc-text-meta text-cc-ink-muted [overflow-wrap:anywhere]">{[b.when, b.facts[0]].filter(Boolean).join(' · ')}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {record.path === 'single-call' ? (
        <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted" data-single-call-note="">
          {tfSingleCallNote(record.fallbackReason)}
        </p>
      ) : null}
    </section>
  );
}

/** A tool whose words today differ from what the generation read then — its date or any of its facts (`basisSlotChanged`). */
function isStale(b: BasisSlot, now: readonly ChainSlot[]): boolean {
  return basisSlotChanged(b, now);
}
