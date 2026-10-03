'use client';

import React from 'react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTable, { type CcTableColumn } from '@/components/cc/Table';
import {
  EMPTY_SECTION,
  appendixLead,
  gateLine,
  linesLabel,
  sectionTitle,
  type PdText,
  type ProcessDocument,
  type ProcessDocumentSection,
} from '@/lib/process-document';

/**
 * The process description on the Documentation stage (owner 03.10.2026) —
 * `lib/process-document.ts` rendered, nothing decided here. The Confluence
 * page, the Markdown and the `.docx` render the same `ProcessDocument`, so the
 * screen and the files say the same thing in the same order.
 *
 * Sections 1 to 9 are open: they are the document. The technical trace comes
 * last, under its own heading, with its long lists folded (`appendix`).
 */

const SECTION = 'rounded-cc-card border border-cc-line bg-cc-surface p-4 md:p-6 shadow-cc min-w-0';
const H3 = 'cc-text-h3 text-cc-ink m-0';
const LINES = 'cc-text-meta text-cc-ink-muted';

function Lines({ anchors }: { anchors: PdText['anchors'] }) {
  if (!anchors.length) return null;
  return <span className={`${LINES} whitespace-nowrap`}> {linesLabel(anchors)}</span>;
}

function Para({ t }: { t: PdText }) {
  return (
    <p className="m-0 cc-text-body text-cc-ink">
      {t.text}
      <Lines anchors={t.anchors} />
    </p>
  );
}

function Section({ id, children }: { id: ProcessDocumentSection; children: React.ReactNode }) {
  return (
    <section data-doc-section={id} aria-labelledby={`pd-${id}`} className={SECTION}>
      <h3 id={`pd-${id}`} className="m-0 mb-3 cc-text-h2 text-cc-ink">{sectionTitle(id)}</h3>
      <div className="space-y-3 min-w-0">{children}</div>
    </section>
  );
}

function Empty({ id }: { id: keyof typeof EMPTY_SECTION }) {
  return <p className="m-0 cc-text-cell text-cc-ink-muted">{EMPTY_SECTION[id]}</p>;
}

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: Array<Array<React.ReactNode>> }) {
  const columns: CcTableColumn[] = head.map((label, i) => ({ key: `c${i}`, label }));
  return (
    <CcTable
      caption={caption}
      columns={columns}
      rows={rows.map((row, r) => ({ key: `r${r}`, cells: Object.fromEntries(row.map((cell, i) => [`c${i}`, cell])) }))}
    />
  );
}

function Proposal({ text, anchors }: { text: string; anchors: PdText['anchors'] }) {
  return (
    <p data-doc-proposal="" className="m-0 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 cc-text-body text-cc-ink">
      <CcProvenanceChip value="proposed" /> {text}
      <Lines anchors={anchors} />
    </p>
  );
}

export default function ProcessDocumentView({
  document: doc,
  mapHref,
  appendix,
}: {
  document: ProcessDocument;
  /** Where the live map stands on this page — the diagram of section 3. */
  mapHref?: string;
  /** The technical trace, rendered by the caller (the folded element and statement lists). */
  appendix?: React.ReactNode;
}) {
  const p = doc.purpose;
  const t = doc.trigger;
  return (
    <div data-process-document="" className="space-y-4 min-w-0">
      <p className="m-0 max-w-3xl cc-text-meta text-cc-ink-muted">
        <CcProvenanceChip value="reconstructed" /> {doc.fileName} · {doc.lineCount} lines. {doc.note}
      </p>

      <Section id="purpose">
        {p.summary.map((s, i) => <Para key={i} t={s} />)}
        {p.proposal ? <Proposal text={p.proposal.text} anchors={p.proposal.anchors} /> : null}
        <Para t={p.users} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="min-w-0">
            <p className="m-0 cc-text-label text-cc-ink-muted">In scope</p>
            <ul className="m-0 mt-1 list-disc pl-5 cc-text-cell text-cc-ink">
              {p.inScope.map((s, i) => <li key={i}>{s.text}<Lines anchors={s.anchors} /></li>)}
            </ul>
          </div>
          <div className="min-w-0">
            <p className="m-0 cc-text-label text-cc-ink-muted">Not in scope — not in this code</p>
            <ul className="m-0 mt-1 list-disc pl-5 cc-text-cell text-cc-ink">
              {p.outOfScope.map((s, i) => <li key={i}>{s.text}<Lines anchors={s.anchors} /></li>)}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="trigger">
        {!t.start.length && !t.selection.length ? <Empty id="trigger" /> : null}
        {t.start.map((s, i) => <Para key={i} t={s} />)}
        {t.selection.length ? (
          <Table
            caption="Selection screen"
            head={['Field', 'Meaning', 'Kind', 'Required', 'Default', 'Line']}
            rows={t.selection.map((i) => [i.name.toUpperCase(), i.meaning, i.kind, i.required ? 'Yes' : 'No', i.defaultValue ?? '—', linesLabel([i.anchor])])}
          />
        ) : null}
        {t.data.length ? (
          <Table
            caption="Data the process reads"
            head={['Table', 'Business object', 'Owner', 'Lines']}
            rows={t.data.map((d) => [d.name, d.meaning ?? '—', d.owner, linesLabel(d.anchors)])}
          />
        ) : null}
      </Section>

      <Section id="overview">
        <p className="m-0 cc-text-body text-cc-ink">
          {doc.overview.sentence}
          {mapHref ? <> <a href={mapHref} className="text-cc-ink underline">Open the map</a></> : null}
        </p>
        <ol className="m-0 list-none space-y-3 p-0">
          {doc.overview.path.map((entry) =>
            entry.kind === 'gate' ? (
              <li key={entry.id} data-doc-gate="" className="rounded-cc-row border border-dashed border-cc-field-border px-3 py-2 cc-text-cell text-cc-ink-muted">
                {gateLine(entry)}
              </li>
            ) : (
              <li key={entry.id} data-doc-main-step={entry.number} className="rounded-cc-row border border-cc-line p-3 min-w-0">
                <p className={H3}>
                  {entry.number}. {entry.businessName ?? entry.name}
                  {entry.businessName ? <> <CcProvenanceChip value="proposed" note="name" /></> : null}
                </p>
                <p className="m-0 mt-1 cc-text-meta text-cc-ink-muted break-words">
                  {entry.businessName ? `Engine: ${entry.name} · ` : ''}lines {linesLabel(entry.anchors) || '—'} · {entry.technicalName}
                </p>
                {entry.facts ? <p className="m-0 mt-2 cc-text-cell text-cc-ink">{entry.facts}</p> : null}
                {entry.proposal ? <div className="mt-2"><Proposal text={entry.proposal.text} anchors={entry.proposal.anchors} /></div> : null}
                {entry.does.map((d, i) => (
                  <p key={i} className="m-0 mt-1 cc-text-cell text-cc-ink">{d.text}<Lines anchors={d.anchors} /></p>
                ))}
                {entry.subSteps.length ? (
                  <ul className="m-0 mt-2 list-disc pl-5 cc-text-cell text-cc-ink-muted">
                    {entry.subSteps.map((s, i) => (
                      <li key={i} className={s.depth > 1 ? 'ml-4' : undefined}>
                        {s.kind}: {s.label}{s.anchor ? <Lines anchors={[s.anchor]} /> : null}
                      </li>
                    ))}
                    {entry.moreSubSteps > 0 ? <li>and {entry.moreSubSteps} more — see the appendix</li> : null}
                  </ul>
                ) : null}
              </li>
            ),
          )}
        </ol>
        <p className="m-0 cc-text-meta text-cc-ink-muted">{doc.overview.traceability}</p>
      </Section>

      <Section id="rules">
        {doc.rules.length ? (
          <Table caption="Decision points and business rules" head={['Rule', 'Where', 'Condition', 'Effect', 'Lines']}
            rows={doc.rules.map((r) => [r.ref, r.where ?? 'Whole program', r.condition, r.effect, linesLabel(r.anchors)])} />
        ) : <Empty id="rules" />}
      </Section>

      <Section id="exceptions">
        {doc.exceptions.length ? (
          <Table caption="Exceptions and early ends" head={['What happens', 'Where', 'Message the user sees', 'Outcome', 'Lines']}
            rows={doc.exceptions.map((e) => [e.what, e.where ?? '—', e.message ?? 'None at this point', e.outcome, linesLabel(e.anchors)])} />
        ) : <Empty id="exceptions" />}
      </Section>

      <Section id="outputs">
        {doc.outputs.length ? (
          <Table caption="Outputs and effects" head={['Effect', 'What', 'Objects', 'Lines']}
            rows={doc.outputs.map((e) => [e.kind, e.what, e.objects.join(', ') || '—', linesLabel(e.anchors)])} />
        ) : <Empty id="outputs" />}
      </Section>

      <Section id="integrations">
        {doc.integrations.length ? (
          <Table caption="Integrations" head={['Called', 'Kind', 'Purpose', 'Lines']}
            rows={doc.integrations.map((i) => [i.name, i.kind, i.purpose, linesLabel(i.anchors)])} />
        ) : <Empty id="integrations" />}
      </Section>

      <Section id="controls">
        {doc.controls.length ? (
          <Table caption="Controls and audit" head={['Control', 'What the code does', 'Ref', 'Lines']}
            rows={doc.controls.map((c) => [c.kind, c.text, c.ref ?? '—', linesLabel(c.anchors)])} />
        ) : <Empty id="controls" />}
      </Section>

      <Section id="questions">
        {doc.questions.length ? (
          <>
            <p className="m-0 cc-text-cell text-cc-ink-muted">
              <CcProvenanceChip value="not-determined" /> Not determined from the code. Each question is asked once; the lines name what raises it.
            </p>
            <Table caption="Open questions for the business" head={['ID', 'Owner', 'Question', 'Why the code cannot answer it', 'Lines']}
              rows={doc.questions.map((q) => [q.id, q.owner, q.question, q.why, q.anchors.length ? linesLabel(q.anchors) : 'not in the code'])} />
          </>
        ) : <Empty id="questions" />}
      </Section>

      <section data-doc-section="appendix" aria-labelledby="pd-appendix" className="min-w-0 pt-2">
        <h3 id="pd-appendix" className="m-0 cc-text-h2 text-cc-ink">{sectionTitle('appendix')}</h3>
        <p className="m-0 mt-1 mb-4 max-w-3xl cc-text-cell text-cc-ink-muted">{appendixLead(doc.appendix)}</p>
        {appendix}
      </section>
    </div>
  );
}
