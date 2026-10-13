'use client';

import React from 'react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { formatElapsed } from '@/lib/generation-progress';
import { formatTextDate } from '@/lib/format';
import { tfBuiltOnMeta, tfNotWritten, tfSingleCallNote, wt } from '@/lib/workspace-messages';
import type { ChainSlot } from '@/lib/transformation-chain';
import type { BasisSlot, GenerationRecord } from '@/lib/transformation/generation-record';
import { ENGINE_CODE_NOTE, PAGE_REPORTED_NOTE, checkPhrase, hasPageReportedChecks, orderedChecks } from '@/lib/transformation/check-words';

/**
 * After the run (roadmap 3.0.12, step E; design §15.4, §16.2, §18): what the
 * stored package was built on, read from the binding's `basis` — what the
 * generation used *then* — with a *Stale* chip on each tool whose state today
 * differs from that snapshot. Above the unchanged result view.
 *
 * Three forms, one per kind of stored package:
 *   - engine-led: the Built-on tiles, and a warning strip naming every function
 *     left as a stub with the reason (Q4: the generation reads partial);
 *   - the single call as the fallback: the note that says so and why;
 *   - a package from before 3.0.12 (no path on its binding): one neutral line,
 *     never marked stale for it (§18).
 */
export default function BuiltOnCard({
  record,
  generatedAt,
  currentSlots,
}: {
  /** The stored record (`storedGenerationRecord`); null for a package from before 3.0.12. */
  record: (GenerationRecord & { contextDigest: string | null }) | null;
  generatedAt: string | null;
  /** The slots as the page reads them now — for the stale chips. */
  currentSlots: ChainSlot[];
}) {
  if (!record) {
    return (
      <div className="mb-6" data-built-on="legacy">
        <CcMessageStrip state="information">{wt('transformation.legacyGeneration')}</CcMessageStrip>
      </div>
    );
  }
  const meta = tfBuiltOnMeta(formatTextDate(generatedAt), record.elapsedMs !== null ? formatElapsed(record.elapsedMs) : null);
  const engine = record.engine;
  return (
    <section aria-labelledby="built-on-title" data-built-on={record.path} className="mb-6 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="built-on-title" className="m-0 cc-text-h2 text-cc-ink">
          {wt('transformation.builtOnTitle')}
        </h2>
        {meta ? <span className="text-[12px] font-semibold text-cc-ink-muted">{meta}</span> : null}
      </div>
      {record.basis.length > 0 ? (
        <ul className="m-0 mt-3 grid list-none grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 p-0">
          {record.basis.map((b) => {
            const stale = isStale(b, currentSlots);
            return (
              <li key={b.key} data-built-on-slot={b.key} data-built-on-stale={stale ? '' : undefined} className="min-w-0 rounded-cc-row border border-cc-line px-3 py-2 text-[13px]">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-bold text-cc-ink">{b.title}</span>
                  {stale ? <CcProvenanceChip value="stale" note={wt('transformation.builtOnStale')} /> : null}
                </div>
                {b.when ? <div className="text-[12px] font-semibold text-cc-ink-muted">{b.when}</div> : null}
                {b.facts[0] ? <div className="text-cc-ink [overflow-wrap:anywhere]">{b.facts[0]}</div> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {record.path === 'single-call' ? (
        <div className="mt-3" data-single-call-note="">
          <CcMessageStrip state="information">{tfSingleCallNote(record.fallbackReason)}</CcMessageStrip>
        </div>
      ) : null}
      {engine && engine.notWritten.length > 0 ? (
        <div className="mt-3" data-not-written={engine.notWritten.length}>
          <CcMessageStrip state="warning" headline={tfNotWritten(engine.notWritten.length, engine.units)}>
            <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-5">
              {engine.notWritten.map((n) => (
                <li key={n.unitId} data-not-written-unit={n.unitId} className="[overflow-wrap:anywhere]">
                  <span className="font-cc-mono text-[12px]">{n.unitId}</span> {n.title} — {n.reason}
                </li>
              ))}
            </ul>
          </CcMessageStrip>
        </div>
      ) : null}
      {engine ? (
        <p data-engine-checks="" className="m-0 mt-3 text-[13px] font-medium text-cc-ink-muted">
          {checksSentence(engine)}
        </p>
      ) : null}
    </section>
  );
}

/** A tool whose words today differ from what the generation read then. */
function isStale(b: BasisSlot, now: readonly ChainSlot[]): boolean {
  const current = now.find((s) => s.key === b.key);
  if (!current || current.state === 'loading' || current.state === 'unread') return false;
  if ((current.when ?? '') !== b.when) return true;
  return (current.facts[0]?.text ?? '') !== (b.facts[0] ?? '');
}

function checksSentence(e: NonNullable<GenerationRecord['engine']>): string {
  const parts = [`${e.written} of ${e.units} functions written${e.repaired ? `, ${e.repaired} after a repair round` : ''}`];
  for (const c of orderedChecks(e.checks)) parts.push(checkPhrase(c));
  for (const n of e.notRun) parts.push(`${n.kind === 'cases' ? 'engine cases' : n.kind === 'probes' ? 'probes' : n.kind} not run`);
  parts.push(`${e.callsUsed} model calls`);
  const engineNote = e.checks.some((c) => c.scope === 'engine-code') ? ` ${ENGINE_CODE_NOTE}` : '';
  const pageNote = hasPageReportedChecks(e) ? ` ${PAGE_REPORTED_NOTE}` : '';
  return `${parts.join(' · ')}.${engineNote}${pageNote} Every function, its ABAP lines and who wrote it: TRACE.md.`;
}
