'use client';

import React from 'react';
import { ArrowRight, ClipboardList } from 'lucide-react';
import CcLinkButton from '@/components/cc/LinkButton';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import type { SpecSummary } from '@/lib/requirements-spec';

/**
 * The requirements module on the Design page — one card in place of the two
 * lists that stood there (owner 04.10.2026: "one common module in the Design
 * tool, started separately with an explanation for the user").
 *
 * It says what the module is, what the reader gets, what it costs — the
 * engine's reading is free; the one model step on offer (clearer wording) is
 * asked for by a button inside and says its cost there — and where it stands:
 * not started, a draft with its open decisions, or ready to export. One
 * primary action opens the workspace; an invited reader opens it to read.
 */
export type SpecCardState =
  | { kind: 'not-started' }
  | { kind: 'draft' | 'ready'; summary: SpecSummary; stale: boolean };

export default function RequirementsEntryCard({
  href,
  state,
  reader = false,
  demo = false,
  blocked = null,
}: {
  href: string;
  state: SpecCardState;
  reader?: boolean;
  demo?: boolean;
  /** Why the workspace has nothing to read yet (no signed run, a changed source). */
  blocked?: string | null;
}) {
  const s = state.kind === 'not-started' ? null : state.summary;
  const total = s ? s.functional + s.nonFunctional : 0;
  return (
    <section id="requirements" aria-labelledby="requirements-card-title" data-spec-card={state.kind} className="flex min-w-0 scroll-mt-24 flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardList size={20} aria-hidden={true} className="text-cc-ink-muted" />
            <h2 id="requirements-card-title" className="m-0 cc-text-h2 text-cc-ink">
              Requirements specification
            </h2>
            <CcProvenanceChip value="reconstructed" note="drafted from the code" />
          </div>
          <p className="m-0 max-w-3xl text-[14px] leading-relaxed text-cc-ink">
            The functional and non-functional requirements of the new solution, written down as one document an external implementer
            can build from — read from the signed code, completed by your decisions.
          </p>
          <ul className="m-0 flex max-w-3xl list-disc flex-col gap-1 pl-5 text-[13px] text-cc-ink">
            <li>Every requirement with “The system shall …”, its reason, Given / When / Then criteria, Must · Should · Could and the code lines it comes from.</li>
            <li>The targets the code cannot set — response times, retention, roles, cutover — as decisions with suggested answers.</li>
            <li>A traceability matrix, and exports to Word, Markdown and Confluence.</li>
          </ul>
          <p data-spec-card-cost="" className="m-0 text-[12px] font-semibold text-cc-ink-muted">
            Reading the code: no model call, no cost. Clearer wording by a model is optional, asked for inside — model call · not counted against analysis runs.
            Not part of the signed audit pack.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 min-[900px]:items-end">
          {state.kind === 'not-started' ? (
            <CcObjectStatus value="not-started" facet="Specification" />
          ) : (
            <span data-spec-card-state="" className="flex flex-col items-start gap-1 min-[900px]:items-end">
              {state.kind === 'draft' ? <CcObjectStatus value="draft" facet="Specification" /> : <span className="text-[12px] font-semibold text-cc-ink">Specification: ready to export</span>}
              <span className="text-[12px] font-semibold text-cc-ink-muted">
                {total} requirement{total === 1 ? '' : 's'} · {s!.openDecisions} open decision{s!.openDecisions === 1 ? '' : 's'}
              </span>
              {state.stale ? <CcProvenanceChip value="stale" note="written for an earlier source" /> : null}
            </span>
          )}
          {blocked && state.kind === 'not-started' ? (
            <p className="m-0 max-w-xs text-[12px] font-semibold text-cc-ink-muted min-[900px]:text-right">{blocked}</p>
          ) : null}
          <CcLinkButton href={href} variant="primary" density="cozy" icon={<ArrowRight size={16} aria-hidden={true} />} data-spec-open="">
            {reader || demo || state.kind === 'not-started' ? 'Open the requirements workspace' : 'Continue in the requirements workspace'}
          </CcLinkButton>
          {reader ? <span className="text-[12px] font-semibold text-cc-ink-muted">Read-only for invited readers.</span> : null}
          {demo ? <span className="text-[12px] font-semibold text-cc-ink-muted">Demo: read-only, nothing is saved.</span> : null}
        </div>
      </div>
    </section>
  );
}
