'use client';

import React, { useState } from 'react';
import { ArrowDown, ArrowUp, CircleHelp, PenLine, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcButton from '@/components/cc/Button';
import CcIconButton from '@/components/cc/IconButton';
import CcField from '@/components/cc/Field';
import CcSelect from '@/components/cc/Select';
import CcTable from '@/components/cc/Table';
import CcMessageBox from '@/components/cc/MessageBox';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { RichTextEditor, RichTextView } from '@/components/requirements/RichText';
import { PriorityTag, StatusTag } from '@/components/requirements/Tags';
import { PRIORITY_LABEL, type RequirementPriority } from '@/lib/functional-requirements';
import { REQUIREMENT_STATUSES, REQUIREMENT_STATUS_LABEL, type RequirementStatus } from '@/lib/requirement-status';
import {
  DECISION_ORIGIN_LABEL,
  DECISION_OWNER_LABEL,
  SPEC_DOC_STATUSES,
  SPEC_DOC_STATUS_LABEL,
  SPEC_NFR_CATEGORIES,
  SPEC_NFR_CATEGORY_LABEL,
  blankRequirement,
  decisionOpen,
  linesText,
  moveRequirement,
  traceRows,
  type RequirementsSpec,
  type SpecCounts,
  type SpecDecision,
  type SpecDocStatus,
  type SpecKind,
  type SpecNfrCategory,
  type SpecRequirement,
} from '@/lib/requirements-spec';

/**
 * The requirements specification as a document — the page of the workspace
 * (owner 04.10.2026: "Word-like"). One white sheet: a title page with the
 * facts, the contents, and nine numbered sections, each a heading an
 * implementer can cite ("4.2.1 NFR-05").
 *
 * The owner edits in place on a wide screen: a section's text, a requirement
 * (statement, rationale, acceptance criteria, target and method, priority,
 * status, note), its place in the list, and the stakeholders and glossary.
 * On a phone, and for an invited reader, the document is read; deciding opens
 * the decision panel for the owner at every width.
 */

export const SPEC_SECTIONS = [
  { id: 'spec-s1', number: '1', title: 'Purpose and scope' },
  { id: 'spec-s2', number: '2', title: 'Context and stakeholders' },
  { id: 'spec-s3', number: '3', title: 'Functional requirements' },
  { id: 'spec-s4', number: '4', title: 'Non-functional requirements' },
  { id: 'spec-s5', number: '5', title: 'Interfaces and data' },
  { id: 'spec-s6', number: '6', title: 'Constraints and assumptions' },
  { id: 'spec-s7', number: '7', title: 'Open decisions' },
  { id: 'spec-s8', number: '8', title: 'Traceability matrix' },
  { id: 'spec-s9', number: '9', title: 'Glossary' },
] as const;

export interface SpecDocumentMeta {
  author: string;
  revision: number;
  savedAt: string | null;
  fileName: string;
  sourceSha256: string;
}

type Change = (mutate: (spec: RequirementsSpec) => RequirementsSpec, change: string) => void;

const H3 = 'm-0 text-[15px] font-bold text-cc-ink';

/** A heading at the level the document's outline gives it. */
function Heading({ level, children, ...rest }: { level: 3 | 4 | 5 } & React.HTMLAttributes<HTMLHeadingElement>) {
  const Tag = (`h${level}` as 'h3' | 'h4' | 'h5');
  return <Tag {...rest}>{children}</Tag>;
}

function SectionHeading({ id, number, title, children }: { id: string; number: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-cc-line pb-2">
      <h2 id={`${id}-title`} className="m-0 cc-text-h2 text-cc-ink">
        <span className="mr-2 font-cc-mono text-cc-ink-muted">{number}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

/** A section text, read or written. */
function EditableText({
  label,
  value,
  editable,
  editing,
  onEdit,
  onDone,
  onChange,
  rows = 6,
  limit,
  testId,
}: {
  label: string;
  value: string;
  editable: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onChange: (v: string) => void;
  rows?: number;
  limit?: number;
  testId: string;
}) {
  if (editing) {
    return (
      <div data-spec-editing={testId} className="flex min-w-0 flex-col gap-2">
        <RichTextEditor label={label} value={value} onChange={onChange} onDone={onDone} rows={rows} limit={limit} autoFocus data-spec-editor={testId} />
        <span>
          <CcButton variant="secondary" onClick={onDone} data-spec-edit-done={testId}>
            Done
          </CcButton>
        </span>
      </div>
    );
  }
  return (
    <div className="group flex min-w-0 items-start gap-2">
      <RichTextView text={value} className="flex-1" data-spec-text={testId} />
      {editable ? (
        <span className="cc-no-print max-sm:hidden">
          <CcIconButton label={`Edit ${label.toLowerCase()}`}  onClick={onEdit} data-spec-edit={testId}><PenLine size={16} aria-hidden={true} /></CcIconButton>
        </span>
      ) : null}
    </div>
  );
}

function provenanceOf(r: SpecRequirement): React.ReactNode {
  if (r.status === 'accepted') return <CcProvenanceChip value="confirmed" note="accepted by the author" />;
  if (r.origin === 'engine') return <CcProvenanceChip value="reconstructed" />;
  return <span className="text-[12px] font-semibold text-cc-ink-muted">Written in the workspace</span>;
}

function RequirementEditor({ r, onChange, onDone }: { r: SpecRequirement; onChange: (next: SpecRequirement) => void; onDone: () => void }) {
  const set = (patch: Partial<SpecRequirement>) => onChange({ ...r, ...patch });
  return (
    <div data-spec-req-editor={r.id} className="flex min-w-0 flex-col gap-4 rounded-cc-row border border-cc-field-border bg-cc-surface-muted p-3 sm:p-4">
      <CcField label="Title">
        {(control) => (
          <input
            id={control.id}
            aria-describedby={control.describedBy}
            className={control.className}
            value={r.title}
            maxLength={200}
            data-spec-req-title-input=""
            onChange={(e) => set({ title: e.target.value })}
          />
        )}
      </CcField>
      <RichTextEditor label="Statement" value={r.statement} onChange={(v) => set({ statement: v })} onDone={onDone} rows={3} autoFocus data-spec-req-statement-input="" help="One sentence an implementer can test: “The system shall …”." />
      {r.kind === 'non-functional' ? (
        <div className="grid min-w-0 gap-4 min-[900px]:grid-cols-2">
          <RichTextEditor label="Target value" value={r.target} onChange={(v) => set({ target: v })} onDone={onDone} rows={2} limit={1000} help="Measurable: a number with its unit, or what must hold." />
          <RichTextEditor label="Measured by" value={r.method} onChange={(v) => set({ method: v })} onDone={onDone} rows={2} limit={1000} help="How an implementer proves the target." />
        </div>
      ) : null}
      <RichTextEditor label="Rationale" value={r.rationale} onChange={(v) => set({ rationale: v })} onDone={onDone} rows={3} />
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-1 p-0 text-[13px] font-semibold text-cc-ink">Acceptance criteria (Given / When / Then)</legend>
        {r.acceptance.map((c, i) => (
          <div key={i} data-spec-criterion-input={i} className="grid min-w-0 gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-2 min-[900px]:grid-cols-[1fr_1fr_1fr_auto] min-[900px]:items-end">
            {(['given', 'when', 'then'] as const).map((part) => (
              <CcField key={part} label={part === 'given' ? 'Given' : part === 'when' ? 'When' : 'Then'}>
                {(control) => (
                  <input
                    id={control.id}
                    className={control.className}
                    value={c[part]}
                    maxLength={1000}
                    onChange={(e) => set({ acceptance: r.acceptance.map((x, j) => (j === i ? { ...x, [part]: e.target.value } : x)) })}
                  />
                )}
              </CcField>
            ))}
            <CcIconButton
              label={`Remove criterion ${i + 1}`}
              
              onClick={() => set({ acceptance: r.acceptance.filter((_, j) => j !== i) })}><Trash2 size={16} aria-hidden={true} /></CcIconButton>
          </div>
        ))}
        {r.acceptance.length < 8 ? (
          <span>
            <CcButton
              variant="ghost"
              icon={<Plus size={16} aria-hidden={true} />}
              data-spec-criterion-add=""
              onClick={() => set({ acceptance: [...r.acceptance, { given: 'a case', when: 'the process runs', then: 'the expected result' }] })}
            >
              Add a criterion
            </CcButton>
          </span>
        ) : null}
      </fieldset>
      <div className="grid min-w-0 gap-4 min-[700px]:grid-cols-3">
        <CcSelect<RequirementPriority>
          label="Priority"
          value={r.priority}
          onChange={(v) => set({ priority: v })}
          options={(['must', 'should', 'could'] as const).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
        />
        <CcSelect<RequirementStatus>
          label="Status"
          value={r.status}
          onChange={(v) => set({ status: v })}
          options={REQUIREMENT_STATUSES.map((s) => ({ value: s, label: REQUIREMENT_STATUS_LABEL[s] }))}
        />
        {r.kind === 'non-functional' ? (
          <CcSelect<SpecNfrCategory>
            label="Category"
            value={r.category ?? 'performance'}
            onChange={(v) => set({ category: v })}
            options={SPEC_NFR_CATEGORIES.map((c) => ({ value: c, label: SPEC_NFR_CATEGORY_LABEL[c] }))}
          />
        ) : null}
      </div>
      <RichTextEditor label="Note" value={r.note} onChange={(v) => set({ note: v })} onDone={onDone} rows={2} help="Why it is rejected, what has to be clarified, what an implementer must know." />
      <span>
        <CcButton variant="secondary" onClick={onDone} data-spec-req-done={r.id}>
          Done
        </CcButton>
      </span>
    </div>
  );
}

function RequirementBlock({
  r,
  level,
  number,
  editable,
  editing,
  decisions,
  onEdit,
  onDone,
  onChange,
  onMove,
  onDelete,
  onOpenDecision,
}: {
  r: SpecRequirement;
  /** h3 under section 3, h4 under a category of section 4 — no level skipped. */
  level: 3 | 4;
  number: string;
  editable: boolean;
  editing: boolean;
  decisions: Map<string, SpecDecision>;
  onEdit: () => void;
  onDone: () => void;
  onChange: (next: SpecRequirement, change: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onOpenDecision: (id: string) => void;
}) {
  return (
    <article
      id={`req-${r.id}`}
      data-spec-req={r.id}
      data-spec-req-kind={r.kind}
      data-spec-req-status={r.status}
      aria-labelledby={`req-${r.id}-title`}
      className={cn('flex min-w-0 scroll-mt-24 flex-col gap-3 border-b border-cc-line py-4 last:border-b-0')}
    >
      <header className="flex min-w-0 flex-col gap-2 min-[700px]:flex-row min-[700px]:items-start min-[700px]:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading level={level} id={`req-${r.id}-title`} className="m-0 text-[14px] font-bold text-cc-ink [overflow-wrap:anywhere]">
            <span className="mr-2 font-cc-mono text-[13px] text-cc-ink-muted">{number}</span>
            <span data-spec-req-id="" className="mr-2 font-cc-mono text-[13px] text-cc-ink">{r.id}</span>
            <span className={cn(r.status === 'rejected' && 'line-through decoration-cc-ink-muted')}>{r.title}</span>
          </Heading>
          <span className="flex flex-wrap items-center gap-2">
            <PriorityTag value={r.priority} />
            <StatusTag value={r.status} />
            {provenanceOf(r)}
          </span>
        </div>
        {editable && !editing ? (
          <div className="cc-no-print flex shrink-0 flex-wrap items-center gap-1 max-sm:hidden">
            <CcSelect<RequirementStatus>
              label={`Status of ${r.id}`}
              value={r.status}
              onChange={(v) => onChange({ ...r, status: v }, `Set ${r.id} to ${REQUIREMENT_STATUS_LABEL[v]}`)}
              options={REQUIREMENT_STATUSES.map((s) => ({ value: s, label: REQUIREMENT_STATUS_LABEL[s] }))}
            />
            <CcIconButton label={`Edit ${r.id}`}  onClick={onEdit} data-spec-req-edit={r.id}><PenLine size={16} aria-hidden={true} /></CcIconButton>
            <CcIconButton label={`Move ${r.id} up`}  onClick={() => onMove(-1)} data-spec-req-up={r.id}><ArrowUp size={16} aria-hidden={true} /></CcIconButton>
            <CcIconButton label={`Move ${r.id} down`}  onClick={() => onMove(1)} data-spec-req-down={r.id}><ArrowDown size={16} aria-hidden={true} /></CcIconButton>
            <CcIconButton label={`Delete ${r.id}`}  onClick={onDelete} data-spec-req-delete={r.id}><Trash2 size={16} aria-hidden={true} /></CcIconButton>
          </div>
        ) : null}
      </header>

      {editing ? (
        <RequirementEditor r={r} onChange={(next) => onChange(next, `Edited ${r.id}`)} onDone={onDone} />
      ) : (
        <>
          <RichTextView text={r.statement} className="text-[15px] font-semibold" data-spec-req-statement="" />
          <dl className="m-0 grid min-w-0 gap-x-4 gap-y-2 text-[13px] min-[700px]:grid-cols-[150px_minmax(0,1fr)]">
            {r.kind === 'non-functional' ? (
              <>
                <dt className="font-semibold text-cc-ink">Target value</dt>
                <dd className="m-0 flex min-w-0 flex-wrap items-center gap-2" data-spec-req-target="">
                  <RichTextView text={r.target} className="text-[13px]" empty="Not determined" />
                  {/^Not determined/.test(r.target) || !r.target.trim() ? <CcProvenanceChip value="not-determined" /> : null}
                </dd>
                <dt className="font-semibold text-cc-ink">Measured by</dt>
                <dd className="m-0 min-w-0">
                  <RichTextView text={r.method} className="text-[13px]" empty="Not determined" />
                </dd>
              </>
            ) : null}
            {r.rationale.trim() ? (
              <>
                <dt className="font-semibold text-cc-ink">Rationale</dt>
                <dd className="m-0 min-w-0">
                  <RichTextView text={r.rationale} className="text-[13px]" />
                </dd>
              </>
            ) : null}
            {r.note.trim() ? (
              <>
                <dt className="font-semibold text-cc-ink">Note</dt>
                <dd className="m-0 min-w-0">
                  <RichTextView text={r.note} className="text-[13px]" />
                </dd>
              </>
            ) : null}
          </dl>
          {r.acceptance.length ? (
            <div className="min-w-0">
              <Heading level={(level + 1) as 4 | 5} className="m-0 mb-2 text-[13px] font-semibold text-cc-ink">Acceptance criteria</Heading>
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {r.acceptance.map((c, i) => (
                  <li key={i} data-spec-criterion="" className="grid min-w-0 gap-1 rounded-cc-row bg-cc-surface-muted px-3 py-2 text-[13px] min-[700px]:grid-cols-3 min-[700px]:gap-3">
                    <span className="[overflow-wrap:anywhere]"><b className="font-semibold">Given</b> {c.given}</span>
                    <span className="[overflow-wrap:anywhere]"><b className="font-semibold">When</b> {c.when}</span>
                    <span className="[overflow-wrap:anywhere]"><b className="font-semibold">Then</b> {c.then}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div data-spec-req-source="" className="flex min-w-0 flex-col gap-1 rounded-cc-row border border-cc-line px-3 py-2 text-[12px] text-cc-ink-muted">
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="font-semibold text-cc-ink">Source</span>
              {r.source.lines.length ? <span data-spec-req-lines="" className="font-cc-mono text-cc-ink">{linesText(r.source.lines)}</span> : null}
              {r.source.rules.length ? <span className="font-cc-mono text-cc-ink">{r.source.rules.join(', ')}</span> : null}
              {r.source.steps.length ? <span>{r.source.steps.join(', ')}</span> : null}
              {!r.source.lines.length && !r.source.rules.length && !r.source.steps.length ? <span>None — written in the workspace or waiting on a decision.</span> : null}
            </span>
            {r.decisionIds.length ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-cc-ink">Decisions</span>
                {r.decisionIds.map((id) => {
                  const d = decisions.get(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      data-spec-req-decision={id}
                      onClick={() => onOpenDecision(id)}
                      className="inline-flex items-center gap-1 rounded-cc-row font-semibold text-cc-information underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
                    >
                      <span className="font-cc-mono">{id}</span>
                      <span className="text-cc-ink-muted">{d && !decisionOpen(d) ? '· decided' : '· open'}</span>
                    </button>
                  );
                })}
              </span>
            ) : null}
            {r.source.evidence ? (
              <details className="min-w-0">
                <summary className="cursor-pointer font-semibold text-cc-ink">What the engine read (technical)</summary>
                <p className="m-0 mt-1 font-cc-mono [overflow-wrap:anywhere]">{r.source.evidence}</p>
              </details>
            ) : null}
          </div>
        </>
      )}
    </article>
  );
}

function DecisionCard({ d, canDecide, onOpen }: { d: SpecDecision; canDecide: boolean; onOpen: () => void }) {
  const open = decisionOpen(d);
  return (
    <li
      id={`decision-${d.id}`}
      data-spec-decision={d.id}
      data-spec-decision-open={open ? 'true' : 'false'}
      className={cn('flex min-w-0 scroll-mt-24 flex-col gap-2 rounded-cc-card border bg-cc-surface p-3 sm:p-4', open ? 'border-dashed border-cc-field-border' : 'border-cc-line')}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-cc-mono text-[13px] font-semibold text-cc-ink">{d.id}</span>
        <span className="text-[12px] font-semibold text-cc-ink-muted">{DECISION_ORIGIN_LABEL[d.origin]}</span>
        <span className="text-[12px] font-semibold text-cc-ink-muted">· Who decides: {DECISION_OWNER_LABEL[d.owner]}</span>
        {open ? <CcProvenanceChip value="not-determined" /> : <CcProvenanceChip value="confirmed" note="decided" />}
        {d.proposal.trim() && open ? <CcProvenanceChip value="proposed" note="proposal available" /> : null}
      </span>
      <p className="m-0 text-[14px] font-semibold text-cc-ink [overflow-wrap:anywhere]">{d.question}</p>
      {open ? (
        <p className="m-0 text-[13px] text-cc-ink-muted">
          {d.answer?.kind === 'later' ? 'Marked “decide later”. ' : ''}
          {d.affects.length ? `Shapes ${d.affects.join(', ')}.` : 'Recorded in this section.'}
          {d.lines.length ? <span className="ml-1 font-cc-mono text-cc-ink">{linesText(d.lines)}</span> : null}
        </p>
      ) : (
        <div data-spec-decision-answer="" className="flex min-w-0 flex-col gap-1 rounded-cc-row bg-cc-surface-muted px-3 py-2 text-[13px]">
          <RichTextView text={d.answer?.value ?? ''} className="text-[13px]" />
          <span className="text-[12px] font-semibold text-cc-ink-muted">
            {d.answer?.by ? `${d.answer.by}${d.answer.at ? `, ${d.answer.at.slice(0, 10)}` : ''}` : 'Not saved yet'}
            {d.affects.length ? ` · shapes ${d.affects.join(', ')}` : ''}
          </span>
        </div>
      )}
      <span>
        <CcButton variant={canDecide && open ? 'secondary' : 'ghost'} icon={<CircleHelp size={16} aria-hidden={true} />} onClick={onOpen} data-spec-decide={d.id}>
          {canDecide ? (open ? 'Decide' : 'Change the answer') : 'Details'}
        </CcButton>
      </span>
    </li>
  );
}

export default function SpecDocument({
  spec,
  counts,
  meta,
  editable,
  canDecide,
  onChange,
  onOpenDecision,
  onAddDecision,
}: {
  spec: RequirementsSpec;
  counts: SpecCounts;
  meta: SpecDocumentMeta;
  editable: boolean;
  canDecide: boolean;
  onChange: Change;
  onOpenDecision: (id: string) => void;
  onAddDecision: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SpecRequirement | null>(null);
  const decisions = new Map(spec.decisions.map((d) => [d.id, d]));
  const functional = spec.requirements.filter((r) => r.kind === 'functional');
  const nonFunctional = spec.requirements.filter((r) => r.kind === 'non-functional');
  const categories = SPEC_NFR_CATEGORIES.filter((c) => nonFunctional.some((r) => r.category === c));

  const setText = (key: 'purpose' | 'scope' | 'context' | 'interfacesNote' | 'constraints' | 'assumptions', label: string) => (v: string) =>
    onChange((s) => ({ ...s, [key]: v }), `Edited ${label}`);

  const text = (key: 'purpose' | 'scope' | 'context' | 'interfacesNote' | 'constraints' | 'assumptions', label: string, rows = 6) => (
    <EditableText
      label={label}
      value={spec[key]}
      editable={editable}
      editing={editing === `text:${key}`}
      onEdit={() => setEditing(`text:${key}`)}
      onDone={() => setEditing(null)}
      onChange={setText(key, label.toLowerCase())}
      rows={rows}
      limit={20_000}
      testId={key}
    />
  );

  const requirementList = (list: SpecRequirement[], prefix: string, level: 3 | 4) =>
    list.map((r, i) => (
      <RequirementBlock
        key={r.id}
        r={r}
        level={level}
        number={`${prefix}${i + 1}`}
        editable={editable}
        editing={editing === `req:${r.id}`}
        decisions={decisions}
        onEdit={() => setEditing(`req:${r.id}`)}
        onDone={() => setEditing(null)}
        onChange={(next, change) => onChange((s) => ({ ...s, requirements: s.requirements.map((x) => (x.id === r.id ? next : x)) }), change)}
        onMove={(dir) => onChange((s) => moveRequirement(s, r.id, dir), `Moved ${r.id}`)}
        onDelete={() => setDeleting(r)}
        onOpenDecision={onOpenDecision}
      />
    ));

  const add = (kind: SpecKind, category: SpecNfrCategory | null = null) => {
    let createdId = '';
    onChange((s) => {
      const r = blankRequirement(s, kind, category);
      createdId = r.id;
      return { ...s, requirements: [...s.requirements, r] };
    }, kind === 'functional' ? 'Added a functional requirement' : 'Added a non-functional requirement');
    // Opens the new one for writing once it is on the page.
    setTimeout(() => {
      if (createdId) {
        setEditing(`req:${createdId}`);
        document.getElementById(`req-${createdId}`)?.scrollIntoView({ block: 'center' });
      }
    }, 0);
  };

  const trace = traceRows(spec);

  return (
    <article data-spec-document="" aria-label={spec.title} className="cc-spec-sheet flex min-w-0 flex-col gap-10 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-6 shadow-cc sm:px-10 sm:py-10">
      {/* Title page */}
      <section id="spec-title" aria-labelledby="spec-title-heading" data-spec-titlepage="" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
        <p className="m-0 cc-text-label text-cc-ink-muted">Requirements specification</p>
        {editing === 'title' ? (
          <div className="flex min-w-0 flex-col gap-3">
            <CcField label="Document title">
              {(control) => (
                <input
                  id={control.id}
                  className={control.className}
                  value={spec.title}
                  maxLength={200}
                  autoFocus
                  data-spec-title-input=""
                  onChange={(e) => onChange((s) => ({ ...s, title: e.target.value }), 'Edited the title')}
                />
              )}
            </CcField>
            <div className="grid min-w-0 gap-3 min-[700px]:grid-cols-2">
              <CcField label="Version">
                {(control) => (
                  <input
                    id={control.id}
                    className={control.className}
                    value={spec.version}
                    maxLength={20}
                    onChange={(e) => onChange((s) => ({ ...s, version: e.target.value.replace(/[^0-9A-Za-z.\- ]/g, '') || '0.1' }), 'Edited the version')}
                  />
                )}
              </CcField>
              <CcSelect<SpecDocStatus>
                label="Document status"
                value={spec.docStatus}
                onChange={(v) => onChange((s) => ({ ...s, docStatus: v }), `Set the document to ${SPEC_DOC_STATUS_LABEL[v]}`)}
                options={SPEC_DOC_STATUSES.map((s) => ({ value: s, label: SPEC_DOC_STATUS_LABEL[s] }))}
                help="The author’s own word — a self-declaration, not an approval."
              />
            </div>
            <span>
              <CcButton variant="secondary" onClick={() => setEditing(null)}>
                Done
              </CcButton>
            </span>
          </div>
        ) : (
          <div className="flex min-w-0 items-start gap-2">
            <p id="spec-title-heading" data-spec-title="" className="m-0 flex-1 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink [overflow-wrap:anywhere]">
              {spec.title}
            </p>
            {editable ? (
              <span className="cc-no-print max-sm:hidden">
                <CcIconButton label="Edit the title page"  onClick={() => setEditing('title')} data-spec-edit="title"><PenLine size={16} aria-hidden={true} /></CcIconButton>
              </span>
            ) : null}
          </div>
        )}
        <dl data-spec-facts="" className="m-0 grid min-w-0 grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-cc-row border border-cc-line p-3 text-[13px] min-[700px]:grid-cols-[130px_minmax(0,1fr)_130px_minmax(0,1fr)]">
          <dt className="font-semibold text-cc-ink-muted">Program</dt>
          <dd className="m-0 font-cc-mono text-cc-ink [overflow-wrap:anywhere]">{spec.program}</dd>
          <dt className="font-semibold text-cc-ink-muted">Version</dt>
          <dd className="m-0 text-cc-ink" data-spec-version="">
            {spec.version} · revision {meta.revision}
          </dd>
          <dt className="font-semibold text-cc-ink-muted">Author</dt>
          <dd className="m-0 text-cc-ink [overflow-wrap:anywhere]" data-spec-author="">
            {meta.author} <span className="text-cc-ink-muted">(self-declaration)</span>
          </dd>
          <dt className="font-semibold text-cc-ink-muted">Date</dt>
          <dd className="m-0 font-cc-mono text-cc-ink">{meta.savedAt ? meta.savedAt.slice(0, 10) : 'not saved yet'}</dd>
          <dt className="font-semibold text-cc-ink-muted">Status</dt>
          <dd className="m-0 text-cc-ink" data-spec-doc-status="">{SPEC_DOC_STATUS_LABEL[spec.docStatus]}</dd>
          <dt className="font-semibold text-cc-ink-muted">Source</dt>
          <dd className="m-0 font-cc-mono text-cc-ink [overflow-wrap:anywhere]">
            {meta.fileName} · {meta.sourceSha256.slice(0, 12)}…
          </dd>
        </dl>
        <p className="m-0 text-[12px] font-semibold text-cc-ink-muted">
          Not part of the signed audit pack. Requirements marked Reconstructed are read from the code and not confirmed by a person; Accepted is the author’s own statement.
        </p>
      </section>

      {/* Contents */}
      <nav aria-labelledby="spec-contents-title" data-spec-contents="" className="flex min-w-0 flex-col gap-2">
        <h2 id="spec-contents-title" className="m-0 cc-text-h2 text-cc-ink">Contents</h2>
        <ol className="m-0 grid list-none gap-x-6 gap-y-1 p-0 text-[14px] min-[700px]:grid-cols-2">
          {SPEC_SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="font-semibold text-cc-information underline-offset-2 hover:underline">
                <span className="mr-2 font-cc-mono text-cc-ink-muted">{s.number}</span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section id="spec-s1" aria-labelledby="spec-s1-title" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
        <SectionHeading id="spec-s1" number="1" title="Purpose and scope" />
        <h3 className={H3}>1.1 Purpose</h3>
        {text('purpose', 'Purpose')}
        <h3 className={H3}>1.2 Scope</h3>
        {text('scope', 'Scope')}
      </section>

      <section id="spec-s2" aria-labelledby="spec-s2-title" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
        <SectionHeading id="spec-s2" number="2" title="Context and stakeholders" />
        <h3 className={H3}>2.1 Context</h3>
        {text('context', 'Context')}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={H3}>2.2 Stakeholders</h3>
          {editable ? (
            <span className="cc-no-print max-sm:hidden">
              <CcButton variant="ghost" icon={<PenLine size={16} aria-hidden={true} />} onClick={() => setEditing(editing === 'stakeholders' ? null : 'stakeholders')} data-spec-edit="stakeholders">
                {editing === 'stakeholders' ? 'Done' : 'Edit'}
              </CcButton>
            </span>
          ) : null}
        </div>
        {editing === 'stakeholders' ? (
          <PairEditor
            pairs={spec.stakeholders.map((s) => [s.role, s.interest])}
            labels={['Role', 'Interest']}
            max={30}
            onChange={(pairs) => onChange((s) => ({ ...s, stakeholders: pairs.map(([role, interest]) => ({ role, interest })) }), 'Edited the stakeholders')}
          />
        ) : (
          <CcTable
            caption="Stakeholders"
            columns={[
              { key: 'role', label: 'Role', width: '220px' },
              { key: 'interest', label: 'Interest in this specification' },
            ]}
            rows={spec.stakeholders.map((s, i) => ({ key: String(i), cells: { role: <b className="font-semibold">{s.role}</b>, interest: s.interest } }))}
          />
        )}
      </section>

      <section id="spec-s3" aria-labelledby="spec-s3-title" data-spec-section="functional" className="flex min-w-0 scroll-mt-24 flex-col gap-2">
        <SectionHeading id="spec-s3" number="3" title="Functional requirements">
          <span className="text-[12px] font-semibold text-cc-ink-muted">{counts.functional} in force</span>
        </SectionHeading>
        <p className="m-0 text-[13px] text-cc-ink-muted">What the solution shall do, each with why, how it is accepted, and where in the current program it comes from.</p>
        <div>{requirementList(functional, '3.', 3)}</div>
        {editable ? (
          <span className="cc-no-print max-sm:hidden">
            <CcButton variant="ghost" icon={<Plus size={16} aria-hidden={true} />} onClick={() => add('functional')} data-spec-add="functional">
              Add a functional requirement
            </CcButton>
          </span>
        ) : null}
      </section>

      <section id="spec-s4" aria-labelledby="spec-s4-title" data-spec-section="non-functional" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
        <SectionHeading id="spec-s4" number="4" title="Non-functional requirements">
          <span className="text-[12px] font-semibold text-cc-ink-muted">{counts.nonFunctional} in force</span>
        </SectionHeading>
        <p className="m-0 text-[13px] text-cc-ink-muted">How well the solution shall do it — each with a target value and how it is measured. A target the code cannot set is a decision in section 7.</p>
        {categories.map((c, ci) => (
          <div key={c} id={`spec-s4-${c}`} data-spec-category-section={c} className="flex min-w-0 scroll-mt-24 flex-col">
            <h3 className={H3}>
              <span className="mr-2 font-cc-mono text-cc-ink-muted">4.{ci + 1}</span>
              {SPEC_NFR_CATEGORY_LABEL[c]}
            </h3>
            {requirementList(nonFunctional.filter((r) => r.category === c), `4.${ci + 1}.`, 4)}
          </div>
        ))}
        {editable ? (
          <span className="cc-no-print max-sm:hidden">
            <CcButton variant="ghost" icon={<Plus size={16} aria-hidden={true} />} onClick={() => add('non-functional', 'usability')} data-spec-add="non-functional">
              Add a non-functional requirement
            </CcButton>
          </span>
        ) : null}
      </section>

      <section id="spec-s5" aria-labelledby="spec-s5-title" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
        <SectionHeading id="spec-s5" number="5" title="Interfaces and data" />
        <p className="m-0 text-[13px] text-cc-ink-muted">
          What the current program reads, writes and calls, as the engine read it. The level is SAP’s clean core classification of an SAP object — an orientation, not evidence.
        </p>
        <CcTable
          caption="Interfaces and data"
          limit={10}
          columns={[
            { key: 'name', label: 'Object' },
            { key: 'kind', label: 'Kind' },
            { key: 'use', label: 'Use' },
            { key: 'level', label: 'Level' },
            { key: 'lines', label: 'Lines' },
          ]}
          rows={spec.interfaces.map((x) => ({
            key: x.name,
            cells: {
              name: <span className="font-cc-mono font-semibold">{x.name}</span>,
              kind: x.kind.replace('-', ' '),
              use: x.use,
              level: x.level === 'custom' ? 'customer object' : x.level === 'not-graded' ? 'not graded' : <CcCleanCoreLevel value={x.level} />,
              lines: <span className="font-cc-mono">{linesText(x.lines)}</span>,
            },
          }))}
        />
        <h3 className={H3}>Notes on interfaces and data</h3>
        {text('interfacesNote', 'Notes on interfaces and data', 4)}
      </section>

      <section id="spec-s6" aria-labelledby="spec-s6-title" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
        <SectionHeading id="spec-s6" number="6" title="Constraints and assumptions" />
        <h3 className={H3}>6.1 Constraints</h3>
        {text('constraints', 'Constraints')}
        <h3 className={H3}>6.2 Assumptions</h3>
        {text('assumptions', 'Assumptions')}
      </section>

      <section id="spec-s7" aria-labelledby="spec-s7-title" data-spec-section="decisions" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
        <SectionHeading id="spec-s7" number="7" title="Open decisions">
          <span data-spec-open-count="" className="text-[12px] font-semibold text-cc-ink-muted">
            {counts.openDecisions} of {counts.decisions} open
          </span>
        </SectionHeading>
        <p className="m-0 text-[13px] text-cc-ink-muted">
          What the code cannot answer, and the business rules marked Clarify or Change in the process review. Suggested answers are starting points, never read from the code.
        </p>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {[...spec.decisions].sort((a, b) => Number(decisionOpen(b)) - Number(decisionOpen(a))).map((d) => (
            <DecisionCard key={d.id} d={d} canDecide={canDecide} onOpen={() => onOpenDecision(d.id)} />
          ))}
        </ol>
        {canDecide ? (
          <span className="cc-no-print">
            <CcButton variant="ghost" icon={<Plus size={16} aria-hidden={true} />} onClick={onAddDecision} data-spec-add="decision">
              Add a decision
            </CcButton>
          </span>
        ) : null}
      </section>

      <section id="spec-s8" aria-labelledby="spec-s8-title" data-spec-section="trace" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
        <SectionHeading id="spec-s8" number="8" title="Traceability matrix" />
        <p className="m-0 text-[13px] text-cc-ink-muted">Every requirement with the code lines, business rules, process steps and decisions it rests on.</p>
        <div data-spec-trace="">
          <CcTable
            caption="Traceability matrix"
            limit={12}
            columns={[
              { key: 'req', label: 'Requirement' },
              { key: 'lines', label: 'Code lines', width: '150px' },
              { key: 'rules', label: 'Rules', width: '84px' },
              { key: 'steps', label: 'Process step', width: '170px' },
              { key: 'decisions', label: 'Decisions', width: '150px' },
              { key: 'status', label: 'Status', width: '170px' },
            ]}
            rows={trace.map((t) => ({
              key: t.id,
              cells: {
                req: (
                  <a href={`#req-${t.id}`} data-spec-trace-row={t.id} className="flex min-w-0 flex-col text-cc-ink underline-offset-2 hover:underline">
                    <span className="font-cc-mono font-semibold">{t.id}</span>
                    <span className="text-[12px] text-cc-ink-muted [overflow-wrap:anywhere]">{t.title}</span>
                  </a>
                ),
                lines: <span className="font-cc-mono [overflow-wrap:anywhere]">{t.lines || '—'}</span>,
                rules: <span className="font-cc-mono whitespace-nowrap">{t.rules.join(', ') || '—'}</span>,
                steps: t.steps.join(', ') || '—',
                decisions: t.decisions.length ? (
                  <span className="flex flex-wrap gap-1">
                    {t.decisions.map((d) => (
                      <span key={d.id}>
                        <span className="font-cc-mono">{d.id}</span>
                        <span className="text-cc-ink-muted">{d.open ? ' open' : ' decided'}</span>
                      </span>
                    ))}
                  </span>
                ) : (
                  '—'
                ),
                status: <StatusTag value={t.status} />,
              },
            }))}
          />
        </div>
      </section>

      <section id="spec-s9" aria-labelledby="spec-s9-title" className="flex min-w-0 scroll-mt-24 flex-col gap-4">
        <SectionHeading id="spec-s9" number="9" title="Glossary">
          {editable ? (
            <span className="cc-no-print max-sm:hidden">
              <CcButton variant="ghost" icon={<PenLine size={16} aria-hidden={true} />} onClick={() => setEditing(editing === 'glossary' ? null : 'glossary')} data-spec-edit="glossary">
                {editing === 'glossary' ? 'Done' : 'Edit'}
              </CcButton>
            </span>
          ) : null}
        </SectionHeading>
        {editing === 'glossary' ? (
          <PairEditor
            pairs={spec.glossary.map((g) => [g.term, g.meaning])}
            labels={['Term', 'Meaning']}
            max={80}
            onChange={(pairs) => onChange((s) => ({ ...s, glossary: pairs.map(([term, meaning]) => ({ term, meaning })) }), 'Edited the glossary')}
          />
        ) : (
          <dl className="m-0 grid min-w-0 gap-x-6 gap-y-2 text-[13px] min-[700px]:grid-cols-[200px_minmax(0,1fr)]">
            {spec.glossary.map((g) => (
              <React.Fragment key={g.term}>
                <dt className="font-semibold text-cc-ink">{g.term}</dt>
                <dd className="m-0 text-cc-ink [overflow-wrap:anywhere]">{g.meaning}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </section>

      <CcMessageBox
        open={deleting !== null}
        title={deleting ? `Delete ${deleting.id}?` : 'Delete'}
        confirmLabel="Delete"
        onConfirm={() => {
          const r = deleting;
          setDeleting(null);
          if (r) onChange((s) => ({ ...s, requirements: s.requirements.filter((x) => x.id !== r.id) }), `Deleted ${r.id}`);
        }}
        onCancel={() => setDeleting(null)}
      >
        {deleting?.origin === 'engine'
          ? `${deleting.id} was read from the code. Deleting it removes it from the document; to keep it visible as “not to be built”, set its status to Rejected instead. The revision history keeps the deletion.`
          : 'The requirement is removed from the document. The revision history keeps the deletion.'}
      </CcMessageBox>
    </article>
  );
}

/** Rows of two text fields — stakeholders, glossary. */
function PairEditor({
  pairs,
  labels,
  max,
  onChange,
}: {
  pairs: Array<[string, string]>;
  labels: [string, string];
  max: number;
  onChange: (pairs: Array<[string, string]>) => void;
}) {
  return (
    <div data-spec-pair-editor={labels[0]} className="flex min-w-0 flex-col gap-2">
      {pairs.map(([a, b], i) => (
        <div key={i} className="grid min-w-0 gap-2 rounded-cc-row border border-cc-line p-2 min-[700px]:grid-cols-[220px_minmax(0,1fr)_auto] min-[700px]:items-end">
          <CcField label={labels[0]}>
            {(control) => <input id={control.id} className={control.className} value={a} maxLength={120} onChange={(e) => onChange(pairs.map((p, j) => (j === i ? [e.target.value, p[1]] : p)))} />}
          </CcField>
          <CcField label={labels[1]}>
            {(control) => <input id={control.id} className={control.className} value={b} maxLength={1000} onChange={(e) => onChange(pairs.map((p, j) => (j === i ? [p[0], e.target.value] : p)))} />}
          </CcField>
          <CcIconButton label={`Remove ${a || 'row'}`}  onClick={() => onChange(pairs.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden={true} /></CcIconButton>
        </div>
      ))}
      {pairs.length < max ? (
        <span>
          <CcButton variant="ghost" icon={<Plus size={16} aria-hidden={true} />} onClick={() => onChange([...pairs, [labels[0] === 'Role' ? 'New role' : 'New term', '']])}>
            Add a row
          </CcButton>
        </span>
      ) : null}
    </div>
  );
}
