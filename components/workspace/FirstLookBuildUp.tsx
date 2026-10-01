'use client';

import React, { useMemo } from 'react';
import CcButton from '@/components/cc/Button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { cn } from '@/lib/utils';
import { tokenizeAbapLine } from '@/lib/process-map';
import { plainLabels } from '@/lib/abap/plain-language';
import type { ProcessSkeleton } from '@/lib/abap/process-skeleton';
import type { TableDependency } from '@/lib/abap/table-dependencies';
import type { NamedProcess } from '@/lib/process-naming';
import {
  buildUpEvents,
  buildUpFrame,
  codeWindow,
  type BuildUpEvent,
  type BuildUpStage,
} from '@/lib/first-look-buildup';
import {
  wt,
  buildUpCounter,
  buildUpGrowsOut,
  buildUpLive,
  buildUpMoreNames,
  buildUpStageLabel,
} from '@/lib/workspace-messages';

/**
 * The build-up of the first look — mockup screen `s0`, moments 1 to 3.
 *
 * Left, the code: a window of real source lines that follows the reading, each
 * line lit where the engine set a process node (information blue, with a bar)
 * or touched a table (a quieter grey). Right, the process: the nodes grow in the
 * order their lines were lit, each with its anchor. Above, the counters — each
 * one a count of lit lines, so none rises without a line behind it. In stage 3
 * the labels change once, from the technical names to plain ones.
 *
 * Every number and every label here is the engine's (`lib/first-look-buildup.ts`);
 * the component only paints a frame. Reduced motion and Skip never reach it:
 * the parent renders the end state instead.
 */

/** BPMN-ish glyph: circle for a start, diamond for a decision, box for a step. */
function Glyph({ kind, current }: { kind: BuildUpEvent['nodeKind']; current: boolean }) {
  const stroke = current ? 'stroke-cc-information' : 'stroke-cc-information-border';
  if (kind === 'start') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden={true} className="shrink-0">
        <circle cx="8" cy="8" r="6" className={cn('fill-cc-surface', stroke)} strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === 'gateway' || kind === 'parallel-gateway') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden={true} className="shrink-0">
        <path d="M8 1.5 L14.5 8 L8 14.5 L1.5 8 Z" className={cn('fill-cc-information-bg', stroke)} strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden={true} className="shrink-0">
      <rect x="1.5" y="3.5" width="13" height="9" rx="2" className={cn('fill-cc-information-bg', stroke)} strokeWidth="1.5" />
    </svg>
  );
}

const TOKEN_CLASS: Record<string, string> = {
  keyword: 'text-cc-code-keyword',
  literal: 'text-cc-code-literal',
  name: 'text-cc-code-name',
  comment: 'text-cc-code-muted',
  plain: 'text-cc-code-ink',
};

export default function FirstLookBuildUp({
  source,
  sourceName,
  access,
  skeleton,
  named,
  elapsed,
  onSkip,
}: {
  source: string;
  sourceName: string;
  access: readonly TableDependency[] | null;
  skeleton: ProcessSkeleton | null;
  named: NamedProcess | null;
  elapsed: number;
  onSkip: () => void;
}) {
  const lines = useMemo(() => source.split(/\r\n|\r|\n/), [source]);
  const events = useMemo(() => buildUpEvents(access, skeleton), [access, skeleton]);
  const frame = buildUpFrame(events, elapsed);

  // Plain names for stage 3: the stored business names where a naming exists
  // (Model proposal), otherwise the deterministic plain wording of the engine.
  const names = useMemo(() => {
    const out = new Map<string, string>();
    if (!skeleton) return { map: out, proposed: false };
    const proposed = named?.state === 'named' && named.counts.named > 0;
    if (proposed && named) {
      for (const node of named.nodes) if (node.businessName) out.set(node.id, node.businessName);
    } else {
      const labels = plainLabels(skeleton, source);
      for (const [id, label] of labels.nodes) if (label && label.trim()) out.set(id, label);
    }
    return { map: out, proposed };
  }, [skeleton, named, source]);

  const lit = events.slice(0, frame.shown);
  const nodeLines = new Set(lit.filter((e) => e.kind === 'node').map((e) => e.line));
  const dataLines = new Set(lit.filter((e) => e.kind === 'data').map((e) => e.line));
  const currentLine = frame.current?.line ?? 1;
  const nextLine = events[frame.shown]?.line ?? null;
  const range = codeWindow(lines.length, currentLine);
  const grown = lit.filter((e) => e.kind === 'node');
  const visible = grown.slice(-8);
  const label = (e: BuildUpEvent) => (frame.named ? names.map.get(e.nodeId ?? '') ?? e.label : e.label) ?? '';
  const swaps = frame.named
    ? grown.filter((e) => names.map.has(e.nodeId ?? '') && names.map.get(e.nodeId ?? '') !== e.label)
    : [];
  const stage: BuildUpStage = frame.stage;
  const container = frame.current?.container ?? null;

  return (
    <div data-first-look-buildup={stage} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="m-0 text-[14px] leading-tight font-bold text-cc-ink">{buildUpStageLabel(stage)}</h2>
        <span data-first-look-reading="" className="min-w-0 text-[12px] font-medium text-cc-ink-muted">
          {buildUpLive(sourceName, lines.length, container)}
        </span>
        {stage === 'business-language' ? (
          names.proposed ? (
            <CcProvenanceChip value="proposed" note={wt('buildUp.names')} />
          ) : (
            <CcProvenanceChip value="reconstructed" note={wt('buildUp.plainNames')} />
          )
        ) : null}
        <span className="ml-auto">
          <CcButton onClick={onSkip} data-first-look-skip="">
            {wt('firstLook.skip')}
          </CcButton>
        </span>
      </div>

      {/* The counters — each a count of lit lines (ADR-013: "Zähler nur mit echten Ereignissen"). */}
      <p
        data-first-look-counters=""
        className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-y border-cc-line py-2 text-[12px] font-medium text-cc-ink-muted"
      >
        <span>{buildUpCounter('lines', frame.counters.line, lines.length)}</span>
        <span>{buildUpCounter('tables', frame.counters.tables)}</span>
        <span>{buildUpCounter('nodes', frame.counters.nodes)}</span>
        {stage !== 'code-read' ? <span>{buildUpCounter('decisions', frame.counters.decisions)}</span> : null}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,44%)_minmax(0,1fr)]">
        {/* The code. Real lines, the reading's window of them. */}
        <pre
          data-first-look-code-panel=""
          aria-label={wt('buildUp.codeLabel')}
          className="m-0 overflow-x-auto rounded-cc-card bg-cc-code-bg p-3 font-cc-mono text-[12px] leading-5 text-cc-code-ink"
        >
          <code>
            {Array.from({ length: Math.max(0, range.to - range.from + 1) }, (_, i) => range.from + i).map((n) => {
              const node = nodeLines.has(n);
              const data = !node && dataLines.has(n);
              const now = n === currentLine;
              return (
                <span
                  key={n}
                  data-first-look-line={node ? 'node' : data ? 'data' : n === nextLine ? 'next' : 'plain'}
                  className={cn(
                    'block rounded-[4px] pr-3 whitespace-pre',
                    node && 'bg-cc-code-hl shadow-[inset_3px_0_0_var(--cc-code-hl-bar)]',
                    data && 'bg-cc-code-ink/10 shadow-[inset_3px_0_0_var(--cc-code-muted)]',
                    now && node && 'bg-cc-information/50',
                    n === nextLine && !node && !data && 'outline-1 outline-cc-code-muted outline-dashed',
                  )}
                >
                  <span className="mr-3 inline-block w-8 text-right text-cc-code-muted select-none">{n}</span>
                  {tokenizeAbapLine(lines[n - 1] ?? '').map((token, i) => (
                    <span key={i} className={TOKEN_CLASS[token.kind]}>
                      {token.text}
                    </span>
                  ))}
                </span>
              );
            })}
          </code>
        </pre>

        {/* The process, growing out of the lit lines. */}
        <div className="flex min-w-0 flex-col gap-2">
          <ol data-first-look-growing="" className="m-0 flex list-none flex-col gap-1 p-0">
            {visible.map((e, i) => {
              const current = i === visible.length - 1;
              return (
                <li
                  key={`${e.nodeId}-${e.line}`}
                  data-first-look-node={e.nodeKind}
                  className={cn(
                    'flex items-center gap-2 rounded-cc-row border px-2 py-1',
                    current ? 'border-cc-information bg-cc-information-bg' : 'border-cc-line bg-cc-surface',
                  )}
                >
                  <Glyph kind={e.nodeKind} current={current} />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[12px] font-semibold text-cc-ink',
                      !frame.named && 'font-cc-mono',
                    )}
                  >
                    {label(e)}
                  </span>
                  <span className="shrink-0 font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{e.anchor}</span>
                </li>
              );
            })}
          </ol>
          {frame.current?.kind === 'node' && stage !== 'business-language' ? (
            <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{buildUpGrowsOut(frame.current.anchor ?? '')}</p>
          ) : null}
          {stage === 'business-language' ? (
            <p data-first-look-swaps="" className="m-0 flex flex-col gap-1 text-[12px] font-medium text-cc-ink">
              {swaps.slice(0, 2).map((e) => (
                <span key={e.nodeId}>
                  <code className="font-cc-mono text-cc-ink-muted">{e.label}</code> → <b className="font-semibold">{label(e)}</b>
                </span>
              ))}
              {swaps.length > 2 ? <span className="text-cc-ink-muted">{buildUpMoreNames(swaps.length - 2)}</span> : null}
            </p>
          ) : null}
          <p className="m-0 mt-auto flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-cc-ink-muted" aria-hidden={true}>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-[2px] bg-cc-information" />
              {wt('buildUp.legendNode')}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-[2px] bg-cc-code-muted" />
              {wt('buildUp.legendData')}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
