'use client';

import React, { useMemo, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import {
  ACCOUNT_SETTABLE,
  FIT_DESIGN_HEADER,
  FIT_DISPOSITIONS,
  FIT_DISPOSITION_LABELS,
  fitDesignLists,
  fitDesignSummary,
  type FitDisposition,
  type FitEntry,
  type FitToStandardDesign,
} from '@/lib/fit-to-standard-design';
import { FIT_GATE_CLASS_LABELS, FIT_GATE_CLASS_MEANING, FIT_GATE_HONESTY, fitGateReasonLine, type FitToStandardGate } from '@/lib/fit-to-standard-gate';
import type { FitChoice, FitToStandardRevision } from '@/lib/fit-to-standard-store';

/**
 * The fit-to-standard design on the Design tool — roadmap 3.0.20, F4
 * (`docs/design/fit-to-standard-concept.md` §4.5; owner decisions 18.10.2026).
 *
 * Simple on top, complete underneath (owner rule): the header sentence, the
 * gate's offer in one line, then three lists a business reader works through —
 * **What you give up** · **What SAP standard may do instead** · **What remains
 * a gap** — each row with its plain name, its ABAP lines, the reference with
 * its check word and its evidence level. The technical steps that go with the
 * program are one fold below. Every disposition is a word and a mark beside a
 * categorical swatch (DESIGN.md §1.8: categories take the categorical palette,
 * never a state colour).
 *
 * Presentational: the container (`FitToStandardPanel`) reads and writes.
 */

export const FIT_SECTION_ID = 'fit-to-standard';

const SWATCH: Readonly<Record<FitDisposition, string>> = Object.freeze({
  'given-up': 'bg-cc-chart-5',
  covered: 'bg-cc-chart-2',
  configuration: 'bg-cc-chart-3',
  'gap-key-user': 'bg-cc-chart-4',
  'gap-organisational': 'bg-cc-chart-1',
  'gap-open': 'border border-dashed border-cc-ink-muted bg-cc-surface',
  'goes-with-program': 'bg-cc-line',
  unknown: 'border border-cc-ink-muted bg-cc-surface',
});

export function FitDispositionMark({ disposition }: { disposition: FitDisposition }) {
  const d = FIT_DISPOSITION_LABELS[disposition];
  return (
    <span
      data-fit-disposition={disposition}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[4px] border border-cc-line bg-cc-surface px-1.5 py-0.5 text-[12px] leading-none font-semibold text-cc-ink"
    >
      <span aria-hidden={true} className={`inline-block h-2.5 w-2.5 rounded-[2px] ${SWATCH[disposition]}`} />
      <span aria-hidden={true}>{d.mark}</span>
      <span>{d.label}</span>
    </span>
  );
}

const lines = (a: FitEntry['anchor']) => (a ? (a.lineEnd > a.lineStart ? `L${a.lineStart}–L${a.lineEnd}` : `L${a.lineStart}`) : 'Unanchored');

const CHECK_WORDS: Readonly<Record<string, string>> = {
  verified: 'checked against SAP data',
  catalog: "from SAP's catalog — to verify",
  unverified: 'not checked — to verify',
  mismatch: 'does not match SAP data',
};

const OPTIONS = FIT_DISPOSITIONS.filter((d) => ACCOUNT_SETTABLE[d]);

type Draft = Record<string, { disposition: FitDisposition; note: string }>;

function Row({
  entry,
  draft,
  editable,
  onChange,
}: {
  entry: FitEntry;
  draft: Draft[string] | undefined;
  editable: boolean;
  onChange: (next: { disposition: FitDisposition; note: string }) => void;
}) {
  const shown = draft?.disposition ?? entry.disposition;
  return (
    <li data-fit-entry={entry.elementId} className="flex flex-col gap-1.5 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <FitDispositionMark disposition={shown} />
        <span className="min-w-0 flex-1 text-[14px] leading-snug font-semibold text-cc-ink">{entry.plainLabel ?? entry.label}</span>
        <span data-fit-anchor="" className="font-mono text-[12px] text-cc-ink-muted">{lines(entry.anchor)}</span>
        <span className="text-[12px] font-medium text-cc-ink-muted" data-fit-level={entry.evidenceLevel}>{entry.evidenceLevel}</span>
      </div>
      <p className="m-0 text-[13px] leading-snug text-cc-ink-muted">{entry.why}</p>
      {entry.standardRef ? (
        <p className="m-0 text-[12px] leading-snug text-cc-ink" data-fit-ref={entry.standardRef.check}>
          <span className="font-mono">{entry.standardRef.id}</span>
          {entry.standardRef.title ? ` — ${entry.standardRef.title}` : ''}
          {' · '}
          {CHECK_WORDS[entry.standardRef.check] ?? entry.standardRef.check}
        </p>
      ) : null}
      {editable && entry.comparability === 'business-comparable' ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
            Your answer
            <select
              data-fit-choice={entry.elementId}
              value={shown}
              onChange={(ev) => onChange({ disposition: ev.target.value as FitDisposition, note: draft?.note ?? '' })}
              className="min-h-[32px] rounded-[4px] border border-cc-field-border bg-cc-surface px-2 text-[13px] text-cc-ink"
            >
              {OPTIONS.map((d) => (
                <option key={d} value={d}>{FIT_DISPOSITION_LABELS[d].label}</option>
              ))}
            </select>
          </label>
          {shown === 'gap-organisational' ? (
            <label className="flex min-w-0 flex-1 items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
              What changes instead
              <input
                data-fit-note={entry.elementId}
                value={draft?.note ?? ''}
                maxLength={1000}
                onChange={(ev) => onChange({ disposition: shown, note: ev.target.value })}
                className="min-h-[32px] min-w-0 flex-1 rounded-[4px] border border-cc-field-border bg-cc-surface px-2 text-[13px] text-cc-ink"
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function List({ id, title, lead, rows, draft, editable, onChange }: {
  id: string;
  title: string;
  lead: string;
  rows: FitEntry[];
  draft: Draft;
  editable: boolean;
  onChange: (elementId: string, next: { disposition: FitDisposition; note: string }) => void;
}) {
  return (
    <section aria-labelledby={`fit-${id}-title`} data-fit-list={id} className="flex min-w-0 flex-col gap-2">
      <h3 id={`fit-${id}-title`} className="m-0 text-[15px] font-bold text-cc-ink">
        {title} <span className="font-medium text-cc-ink-muted">({rows.length})</span>
      </h3>
      <p className="m-0 text-[13px] text-cc-ink-muted">{lead}</p>
      {rows.length === 0 ? (
        <p data-fit-list-empty="" className="m-0 rounded-cc-row border border-dashed border-cc-field-border px-3 py-2 text-[13px] text-cc-ink-muted">
          Nothing here.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((e) => (
            <Row key={e.elementId} entry={e} draft={draft[e.elementId]} editable={editable} onChange={(next) => onChange(e.elementId, next)} />
          ))}
        </ol>
      )}
    </section>
  );
}

export interface FitToStandardViewProps {
  gate: FitToStandardGate;
  design: (Pick<FitToStandardDesign, 'entries' | 'counts' | 'againstGate' | 'edition'> & { modelProposal?: FitToStandardRevision['modelProposal'] }) | null;
  stored: { revision: number; kind: FitToStandardRevision['kind']; stale: boolean; createdAt: string; createdBy: string } | null;
  isOwner: boolean;
  busy?: boolean;
  error?: string | null;
  onMake?: (againstGate: boolean) => void;
  onConfirm?: (baseRevision: number, choices: FitChoice[]) => void;
  /** F5 — offered only where the Design stage's model is available; absent, the design stays the engine's. */
  onPropose?: (baseRevision: number) => void;
}

export default function FitToStandardView({ gate, design, stored, isOwner, busy = false, error = null, onMake, onConfirm, onPropose }: FitToStandardViewProps) {
  const [draft, setDraft] = useState<Draft>({});
  const lists = useMemo(() => (design ? fitDesignLists(design) : null), [design]);
  const technical = design ? design.entries.filter((e) => e.disposition === 'goes-with-program' || e.disposition === 'unknown') : [];
  const storedCurrent = stored && !stored.stale ? stored : null;
  const confirmed = storedCurrent?.kind === 'confirmation';
  const editable = isOwner && !!storedCurrent && !busy;
  const change = (elementId: string, next: { disposition: FitDisposition; note: string }) => setDraft((d) => ({ ...d, [elementId]: next }));
  const choices = (): FitChoice[] =>
    Object.entries(draft).map(([elementId, v]) => ({ elementId, disposition: v.disposition, note: v.note.trim() || null }));

  return (
    <section
      id={FIT_SECTION_ID}
      aria-labelledby="fit-title"
      data-fit-to-standard={gate.outcome}
      data-fit-state={confirmed ? 'confirmed' : storedCurrent ? 'made' : design ? 'preview' : 'none'}
      className="flex min-w-0 flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc md:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="fit-title" className="m-0 cc-text-h2 text-cc-ink">Fit-to-standard design</h2>
        <CcProvenanceChip value={confirmed ? 'confirmed' : 'reconstructed'} />
      </div>
      <p data-fit-header="" className="m-0 cc-text-body text-cc-ink">{FIT_DESIGN_HEADER}</p>

      {gate.outcome === 'offered' ? (
        <p data-fit-offer="" className="m-0 text-[13px] leading-snug text-cc-ink">
          <span className="font-semibold">{FIT_GATE_CLASS_LABELS[gate.primary]}.</span> Worth examining against SAP standard: {FIT_GATE_CLASS_MEANING[gate.primary]}
          {gate.editionNote ? ` ${gate.editionNote}` : ''}
        </p>
      ) : (
        <p data-fit-gate-reason="" className="m-0 text-[13px] leading-snug text-cc-ink-muted">{fitGateReasonLine(gate)}</p>
      )}
      <p className="m-0 text-[12px] text-cc-ink-muted">{FIT_GATE_HONESTY}</p>

      {design?.againstGate ? (
        <CcMessageStrip state="warning">
          <span data-fit-against-gate="">{design.againstGate.sentence} The gate: {design.againstGate.gateReason}</span>
        </CcMessageStrip>
      ) : null}
      {stored?.stale ? (
        <CcMessageStrip state="warning">
          <span data-fit-stale="">The stored design (revision {stored.revision}) stands on an earlier run or source. What is shown is the engine&apos;s reading of the current run; make the design again to work on it.</span>
        </CcMessageStrip>
      ) : null}
      {confirmed ? (
        <p data-fit-confirmed="" className="m-0 text-[13px] font-medium text-cc-ink">
          Confirmed by {storedCurrent!.createdBy} on {storedCurrent!.createdAt.slice(0, 10)} (revision {storedCurrent!.revision}) — a self-declaration after your workshop, not a proof.
        </p>
      ) : null}
      {error ? <CcMessageStrip state="error">{error}</CcMessageStrip> : null}
      {design?.modelProposal ? (
        <div data-fit-model-proposal="" className="flex flex-col gap-1 rounded-cc-row border border-cc-line px-3 py-2">
          <p className="m-0 text-[13px] text-cc-ink">
            <span className="font-semibold">Model proposal</span> ({design.modelProposal.modelId}{design.modelProposal.byok ? ', your own key' : ''}): {design.modelProposal.kept} standard candidate{design.modelProposal.kept === 1 ? '' : 's'} kept after the check against SAP data; {design.modelProposal.dropped.length} left out.
          </p>
          {design.modelProposal.dropped.length > 0 ? (
            <ul className="m-0 list-disc pl-5 text-[12px] text-cc-ink-muted">
              {design.modelProposal.dropped.map((d) => (
                <li key={`${d.elementId}-${d.id}`} data-fit-dropped={d.id}>
                  <span className="font-mono">{d.id}</span>: {d.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {design && lists ? (
        <>
          <p data-fit-summary="" className="m-0 text-[13px] font-semibold text-cc-ink">{fitDesignSummary(design.counts)}.</p>
          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-3">
            <List id="given-up" title="What you give up" lead="What the program does that the standard does not — living with the standard means losing it." rows={lists.givenUp} draft={draft} editable={editable} onChange={change} />
            <List id="standard" title="What SAP standard may do instead" lead="Candidates to check in the workshop — the code cannot prove that the standard covers a step." rows={lists.standardDoes} draft={draft} editable={editable} onChange={change} />
            <List id="gaps" title="What remains a gap" lead="Still needed: a key-user extension, an organisational change, or still open. Open gaps become conditions of the decision." rows={lists.gaps} draft={draft} editable={editable} onChange={change} />
          </div>
          {technical.length > 0 ? (
            <details data-fit-technical="" className="rounded-cc-row border border-cc-line px-3 py-2">
              <summary className="cursor-pointer text-[13px] font-semibold text-cc-ink">Steps that go with the program ({technical.length})</summary>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                {technical.map((e) => (
                  <li key={e.elementId} className="flex flex-wrap items-center gap-2 text-[12px] text-cc-ink-muted">
                    <FitDispositionMark disposition={e.disposition} />
                    <span>{e.plainLabel ?? e.label}</span>
                    <span className="font-mono">{lines(e.anchor)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}

      {isOwner ? (
        <div className="flex flex-wrap items-center gap-3">
          {gate.outcome === 'offered' && !storedCurrent ? (
            <CcButton variant="primary" busy={busy} data-fit-make="" onClick={() => onMake?.(false)}>Make the fit-to-standard design</CcButton>
          ) : null}
          {gate.outcome === 'not-offered' && !storedCurrent ? (
            <CcButton variant="ghost" busy={busy} data-fit-make-against="" onClick={() => onMake?.(true)}>Make one anyway — not recommended</CcButton>
          ) : null}
          {storedCurrent && onPropose && (design?.counts.gapOpen ?? 0) > 0 ? (
            <CcButton variant="ghost" busy={busy} data-fit-propose="" onClick={() => onPropose(storedCurrent.revision)}>
              Ask the model for standard candidates
            </CcButton>
          ) : null}
          {storedCurrent ? (
            <CcButton
              variant={confirmed ? 'ghost' : 'primary'}
              busy={busy}
              data-fit-confirm=""
              onClick={() => onConfirm?.(storedCurrent.revision, choices())}
            >
              {confirmed ? 'Confirm again with my changes' : 'Confirm the fit-to-standard design'}
            </CcButton>
          ) : null}
          {storedCurrent ? (
            <span className="text-[12px] text-cc-ink-muted">Confirming records your account and the time. Open gaps stay conditions of the decision.</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
