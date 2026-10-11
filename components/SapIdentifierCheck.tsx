'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CcStateDot } from '@/components/cc/StateText';
import { STATE_CLASSES } from '@/components/cc/state';
import type { SemanticState } from '@/lib/provenance';
import {
  SAP_ID_KIND_LABEL,
  checkSapReferences,
  findSapIdentifiers,
  sapIdMark,
  type SapIdCheck,
  type SapIdStatus,
} from '@/lib/sap-reference-check';

/**
 * SAP identifiers a model wrote, with their check beside them — owner,
 * 11.10.2026, external review F-03 / F-09 (`lib/sap-reference-check.ts`).
 *
 * The mark stands in the text, right after the identifier, never in a tooltip:
 * a wrong app ID read without its mark reads as fact. A state in words with a
 * dot (ADR-023), never a provenance chip, and never green — "verified" says the
 * identifier and its name are SAP's, not that the object covers this use.
 */
const STATE: Record<SapIdStatus, { state: Exclude<SemanticState, 'success'>; hollow: boolean }> = {
  verified: { state: 'information', hollow: false },
  mismatch: { state: 'error', hollow: false },
  unverified: { state: 'neutral', hollow: true },
};

export function SapIdMark({ check }: { check: SapIdCheck }) {
  const s = STATE[check.status];
  return (
    <span
      data-sap-id-check={check.status}
      data-sap-id={check.id}
      className={cn('ml-1 inline cc-text-meta font-normal not-italic', STATE_CLASSES[s.state].text)}
    >
      <span className="mr-1 inline-flex align-middle">
        <CcStateDot state={s.state} hollow={s.hollow} />
      </span>
      {sapIdMark(check)}
      {check.source?.url ? (
        <>
          {' '}
          <a
            href={check.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-cc-ink"
          >
            source
          </a>
        </>
      ) : null}
    </span>
  );
}

/**
 * The text as the model wrote it, with a mark after the first occurrence of
 * every SAP identifier in it. Text without identifiers comes back unchanged.
 */
export function SapCheckedText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const checks = findSapIdentifiers(text);
  if (checks.length === 0) return <>{text}</>;
  const seen = new Set<string>();
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const c of checks) {
    const key = c.id.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const end = c.index + c.length;
    parts.push(text.slice(pos, end));
    parts.push(<SapIdMark key={`${key}-${c.index}`} check={c} />);
    pos = end;
  }
  parts.push(text.slice(pos));
  return <>{parts}</>;
}

/**
 * Every SAP identifier of several texts as one list, each with its check — for
 * a text whose own renderer cannot carry an inline mark (the anchored summary).
 * Nothing at all when there are none.
 */
export function SapIdentifierChecks({ texts, title = 'SAP identifiers named here' }: { texts: Array<string | null | undefined>; title?: string }) {
  const checks = checkSapReferences(...texts);
  if (checks.length === 0) return null;
  return (
    <div data-sap-id-checks="" className="mt-3 rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2">
      <p className="m-0 cc-text-label text-cc-ink-muted">{title}</p>
      <ul className="m-0 mt-1 list-none space-y-1 p-0">
        {checks.map((c) => (
          <li key={c.id} className="cc-text-cell text-cc-ink [overflow-wrap:anywhere]">
            <span className="font-cc-mono font-semibold">{c.id}</span>{' '}
            <span className="text-cc-ink-muted">({SAP_ID_KIND_LABEL[c.kind]})</span>
            <SapIdMark check={c} />
          </li>
        ))}
      </ul>
    </div>
  );
}
