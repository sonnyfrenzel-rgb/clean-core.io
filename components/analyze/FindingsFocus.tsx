'use client';

import React from 'react';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CcSeverity, CcCleanCoreLevel } from '@/components/cc/Identifier';
import CcAnchor from '@/components/cc/Anchor';
import CcCodeSurface, { type CcCodeLine } from '@/components/cc/CodeSurface';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { normaliseSeverity } from '@/lib/severity';
import { tokenizeAbapLine } from '@/lib/process-map';
import { calmTitle, type FocusPick } from '@/lib/findings-view';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';

/**
 * "Look here first" — the two or three findings that matter most, picked by
 * the fixed rules of `lookHereFirst` (`lib/findings-view.ts`), as the cards of
 * proposal A: severity, level and line on top, the calm title, what it means
 * in the engine's own words, the code at that line, and what SAP names as its
 * successor — or that it names none.
 */
export const FOCUS_BAR: Record<string, string> = {
  Critical: 'shadow-[inset_4px_0_0_var(--cc-error)]',
  High: 'shadow-[inset_4px_0_0_var(--cc-error-border)]',
  Medium: 'shadow-[inset_4px_0_0_var(--cc-warning-mark)]',
};

/** A few lines of the source at a finding, as the code surface draws them. */
export function sourceExcerpt(source: string | undefined, line: number, snippet?: string): CcCodeLine[] {
  const all = source ? source.split(/\r?\n/) : [];
  const text = all[line - 1];
  if (text === undefined) {
    return snippet ? [{ number: line, tokens: tokenizeAbapLine(snippet), highlighted: true }] : [];
  }
  const out: CcCodeLine[] = [];
  // The statement may run on: up to two more lines, until its period.
  for (let i = line; i <= Math.min(all.length, line + 2); i++) {
    const t = all[i - 1];
    out.push({ number: i, tokens: tokenizeAbapLine(t), highlighted: i === line });
    if (/\.\s*(".*)?$/.test(t)) break;
  }
  return out;
}

export default function FindingsFocus({
  picks,
  total,
  onShow,
  levelOf,
  source,
  onOpenLine,
}: {
  picks: readonly FocusPick[];
  /** All findings (rows) — "3 of 25". */
  total: number;
  onShow?: (kind: string) => void;
  /** The finding's clean core level, null when it names no object or the lookup has not answered. */
  levelOf?: (pick: FocusPick) => CloudReadinessGrade | null;
  source?: string;
  /** Opens the source panel at a line; without it the anchors are plain text. */
  onOpenLine?: (line: number) => void;
}) {
  if (picks.length === 0) {
    return (
      <div data-findings-focus="none">
        <p className="m-0 cc-text-cell text-cc-ink-muted">
          No critical or high finding, and none of the kinds that change data or transactions — nothing stands out
          above the rest.
        </p>
      </div>
    );
  }
  return (
    <div data-findings-focus={picks.length}>
      <p className="sr-only">
        {picks.length} of {total} findings, picked by fixed rules.
      </p>
      <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-3">
        {picks.map((pick) => {
          const { row, reason } = pick;
          const ef = row.finding;
          const sev = normaliseSeverity(ef.severity);
          const level = levelOf?.(pick) ?? null;
          const excerpt = sourceExcerpt(source, row.lines[0] ?? ef.lineStart, row.snippets[0] ?? ef.snippet);
          const more = row.lines.slice(1);
          return (
            <li
              key={`${ef.kind}-${ef.objectName ?? ef.title}`}
              data-focus-kind={ef.kind}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-4',
                FOCUS_BAR[ef.severity] ?? 'shadow-[inset_4px_0_0_var(--cc-line)]',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {sev ? <CcSeverity value={sev} /> : null}
                {level ? <CcCleanCoreLevel value={level} /> : null}
                <CcAnchor
                  label={`Source line ${row.lines[0] ?? ef.lineStart}${onOpenLine ? ', open the source' : ''}`}
                  onOpen={onOpenLine ? () => onOpenLine(row.lines[0] ?? ef.lineStart) : undefined}
                >{`L${row.lines[0] ?? ef.lineStart}`}</CcAnchor>
                <span className="font-cc-mono cc-text-meta font-medium text-cc-ink-muted">{ef.id}</span>
              </div>
              <h3 className="m-0 cc-text-h3 text-cc-ink">
                {row.lines.length > 1 ? `${row.lines.length}× ` : ''}
                {calmTitle(ef.title)}
              </h3>
              {reason ? <p className="m-0 cc-text-meta text-cc-ink-muted">{reason}</p> : null}
              {ef.cleanCoreImpact ? (
                <p className="m-0 cc-text-cell text-cc-ink-muted line-clamp-4">{ef.cleanCoreImpact}</p>
              ) : null}
              {excerpt.length ? (
                <CcCodeSurface lines={excerpt} label={`Source at line ${excerpt[0].number}`} />
              ) : null}
              <div className="mt-auto flex flex-col gap-2 pt-1">
                {ef.sapReplacement?.objectName ? (
                  <div className="flex flex-wrap items-center gap-2 cc-text-cell">
                    <ArrowRight size={14} aria-hidden="true" className="text-cc-ink-muted" />
                    <span className="sr-only">SAP successor:</span>
                    <span className="font-cc-mono font-semibold text-cc-ink break-all">{ef.sapReplacement.objectName}</span>
                    {ef.sapReplacement.confidence === 'Catalog Match' || ef.sapReplacement.confidence === 'Verified' ? (
                      <CcProvenanceChip value="imported" note="SAP catalog" />
                    ) : (
                      <span className="cc-text-meta text-cc-warning">{ef.sapReplacement.confidence ?? 'To be checked'}</span>
                    )}
                  </div>
                ) : (
                  <p className="m-0 flex items-start gap-2 cc-text-cell text-cc-ink">
                    <TriangleAlert size={14} aria-hidden="true" className="mt-1 shrink-0 text-cc-ink-muted" />
                    No released successor named
                  </p>
                )}
                {more.length ? (
                  <p className="m-0 flex flex-wrap items-center gap-1 cc-text-meta text-cc-ink-muted">
                    also{' '}
                    {more.slice(0, 4).map((l) => (
                      <CcAnchor key={l} label={`Source line ${l}${onOpenLine ? ', open the source' : ''}`} onOpen={onOpenLine ? () => onOpenLine(l) : undefined}>{`L${l}`}</CcAnchor>
                    ))}
                    {more.length > 4 ? ` +${more.length - 4}` : ''}
                  </p>
                ) : null}
                {onShow ? (
                  <button
                    type="button"
                    onClick={() => onShow(ef.kind)}
                    className="self-start cc-text-meta font-semibold text-cc-ink underline-offset-2 hover:underline"
                  >
                    Show in the list
                    <span className="sr-only">: {calmTitle(ef.title)}</span>
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
