'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { CcStateDot } from '@/components/cc/StateText';
import { STATE_CLASSES } from '@/components/cc/state';
import type { SemanticState } from '@/lib/provenance';
import {
  SAP_ID_KIND_LABEL,
  checkSapReferences,
  findSapIdentifiers,
  occurrencesToMark,
  sapIdMark,
  type SapIdCheck,
  type SapIdStatus,
  sapIdentifierSourcesNote,
  sapIdCitations,
} from '@/lib/sap-reference-check';
import { loadSapNameLists, onSapNameListsChange, sapNameListsVersion } from '@/lib/sap-identifiers';

/**
 * Loads SAP's synced name lists (a chunk of their own, never in the page's
 * bundle) and re-renders when they arrive, so a released CDS view reads "name
 * found in catalog" instead of "not verified" once the list is there (3.0.12).
 */
export function useSapNameLists(): number {
  const [version, setVersion] = useState(sapNameListsVersion());
  useEffect(() => {
    const off = onSapNameListsChange(() => setVersion(sapNameListsVersion()));
    void loadSapNameLists();
    return () => {
      off();
    };
  }, []);
  return version;
}

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
  // A name found in a list: known to exist, nothing more checked (3.0.12).
  catalog: { state: 'neutral', hollow: false },
  unverified: { state: 'neutral', hollow: true },
};

export function SapIdMark({ check }: { check: SapIdCheck }) {
  const s = STATE[check.status];
  // CC BY 4.0: an attributed fact carries its document and commit in the mark itself,
  // visible where the fact stands, with the full attribution as the title (QA bdf1b45234a6).
  const citations = sapIdCitations(check);
  const ownCited = !!check.attribution;
  return (
    <span
      data-sap-id-check={check.status}
      data-sap-id={check.id}
      title={citations.length ? citations.map((c) => c.attribution).join(' | ') : undefined}
      className={cn('ml-1 inline cc-text-meta font-normal not-italic', STATE_CLASSES[s.state].text)}
    >
      <span className="mr-1 inline-flex align-middle">
        <CcStateDot state={s.state} hollow={s.hollow} />
      </span>
      {sapIdMark(check)}
      {check.source?.url && !ownCited ? (
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
      {citations.map((c, i) => (
        <span key={i} data-sap-id-citation="" className="[overflow-wrap:anywhere]">
          {'; source: '}
          {c.url ? (
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-cc-mono underline underline-offset-2 hover:text-cc-ink"
            >
              {c.short ?? c.url}
            </a>
          ) : (
            c.attribution
          )}
          {c.ccBy ? (
            <>
              {', '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer license"
                className="underline underline-offset-2 hover:text-cc-ink"
              >
                CC BY 4.0
              </a>
            </>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/**
 * The text as the model wrote it, with a mark after the first occurrence of
 * every SAP identifier in it and after every later one under another wrong
 * name (`occurrencesToMark`). Text without identifiers comes back unchanged.
 */
export function SapCheckedText({ text }: { text: string | null | undefined }) {
  useSapNameLists();
  if (!text) return null;
  const checks = findSapIdentifiers(text);
  if (checks.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const c of occurrencesToMark(checks)) {
    const key = c.id.toUpperCase();
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
  useSapNameLists();
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
      <p className="m-0 mt-1 cc-text-meta text-cc-ink-muted">{sapIdentifierSourcesNote()}</p>
    </div>
  );
}
