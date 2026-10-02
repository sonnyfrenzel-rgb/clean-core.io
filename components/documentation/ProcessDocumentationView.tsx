'use client';

import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTable, { type CcTableColumn } from '@/components/cc/Table';
import {
  NOT_DETERMINED_LABEL,
  anchorsWords,
  commitWaitWords,
  rangeWords,
  stepEvidence,
  type ProcessDocumentation,
} from '@/lib/process-documentation';
import { pairWithEvidence, proposalAt } from '@/lib/statement-proposal';
import {
  effectsSummary,
  gapsSummary,
  lanesSummary,
  statementsSummary,
  stepsSummary,
} from '@/lib/documentation-lists';
import { FoldedListSection } from '@/components/documentation/FoldedList';
import {
  ProposedStatementLine,
  StatementPair,
  StatementProposalPanel,
  type StatementProposalPanelProps,
} from '@/components/documentation/StatementProposal';

/** The element table's columns (§2.4 — the heads are the micro-labels of CcTable). */
const STEP_COLUMNS: readonly CcTableColumn[] = [
  { key: 'element', label: 'Element' },
  { key: 'name', label: 'Name' },
  { key: 'does', label: 'What it does' },
  { key: 'lines', label: 'Lines' },
];

/**
 * Stage 4's document as the engine wrote it — roadmap 3.0.5, Weg C.
 *
 * It renders `lib/process-documentation.ts` and decides nothing: every line on
 * this screen is a field of the stored document, every anchor is the one the
 * engine recorded, and every gap is printed with its reason. The provenance
 * chips are the nine of `lib/provenance.ts`, through the one chip component.
 *
 * Roadmap 17.10: with `proposal`, the model's business sentences stand on top
 * of the engine's — at each element and in the whole-program list — and the
 * engine's sentence stays beneath each one as the evidence
 * (`components/documentation/StatementProposal.tsx`). Without it, or without a
 * stored proposal for this source, the page is what it was.
 */
export default function ProcessDocumentationView({
  doc,
  proposal,
}: {
  doc: ProcessDocumentation;
  proposal?: StatementProposalPanelProps;
}) {
  const statementById = new Map(doc.statements.map((s) => [s.id, s]));
  const proposals = proposal?.view?.state === 'proposed' ? proposal.view.statements : [];
  const rows = proposals.length > 0 ? pairWithEvidence(doc.statements, proposals) : null;

  return (
    <div data-engine-documentation className="space-y-8">
      <section className="rounded-cc-card border border-cc-line bg-cc-surface p-6 md:p-8 shadow-cc">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <CcProvenanceChip value="reconstructed" />
          <span className="text-xs font-medium text-cc-ink-muted">
            {doc.fileName} · {doc.lineCount} lines
          </span>
        </div>
        <h3 className="cc-text-h2 text-cc-ink">{doc.processName}</h3>
        <p className="mt-2 text-sm text-cc-ink">{doc.overview}</p>
        <p data-doc-traceability className="mt-1 text-sm text-cc-ink">{doc.traceability.sentence}</p>
        {doc.naming.notice && <p className="mt-1 text-sm text-cc-ink-muted">{doc.naming.notice}</p>}
        <p className="mt-4 text-xs text-cc-ink-muted max-w-3xl">{doc.disclaimer}</p>
      </section>

      {/* Owner 02.10.2026: a list of more than five rows starts folded with
          its count and one line (`lib/documentation-lists.ts`); opened, it is
          the list as it was. */}
      <FoldedListSection
        name="steps"
        data-doc-steps=""
        level={4}
        title="The process, element by element"
        rows={doc.steps.length}
        summary={stepsSummary(doc.steps)}
      >
        <CcTable
          caption="The process, element by element"
          columns={STEP_COLUMNS}
          rows={doc.steps.map((step) => {
            const sentence = step.statementId ? statementById.get(step.statementId) : undefined;
            const proposed = proposalAt(proposals, step.anchor);
            return {
              key: step.id,
              cells: {
                element: (
                  <span data-doc-step={step.id}>
                    <span className="block font-semibold text-cc-ink">{step.kind}</span>
                    <span className="font-cc-mono text-[11px] text-cc-ink-muted">{step.id}</span>
                  </span>
                ),
                name: (
                  <>
                    {step.businessName ? (
                      <>
                        <span className="block font-semibold text-cc-ink">{step.businessName}</span>
                        <span className="block font-cc-mono text-[11px] text-cc-ink-muted">{step.technicalName}</span>
                      </>
                    ) : (
                      <span className="font-cc-mono text-[11px] text-cc-ink">{step.technicalName}</span>
                    )}
                    {step.lane && <span className="block mt-1 text-[11px] text-cc-ink-muted">Lane: {step.lane}</span>}
                    {step.namingProvenance && (
                      <span className="mt-1 inline-block"><CcProvenanceChip value={step.namingProvenance} note="name" /></span>
                    )}
                  </>
                ),
                does: proposed ? <StatementPair proposal={proposed} evidence={sentence?.text ?? null} /> : sentence ? sentence.text : '',
                lines: step.anchor ? (
                  <span className="whitespace-nowrap">{rangeWords(step.anchor)}</span>
                ) : (
                  <span className="inline-flex flex-col gap-1">
                    <CcProvenanceChip value="not-determined" />
                    <span className="text-[11px] text-cc-ink-muted whitespace-normal">{stepEvidence(step)}</span>
                  </span>
                ),
              },
            };
          })}
        />
      </FoldedListSection>

      <FoldedListSection
        name="statements"
        data-doc-statements=""
        level={4}
        title="Business statements, across the whole program"
        rows={doc.statements.length}
        summary={statementsSummary(doc.statements)}
      >
        <p className="text-xs text-cc-ink-muted mb-4">
          {doc.statements.length === 0
            ? 'The engine formed no business statement from this source.'
            : `${doc.statements.length} statements, in the order of the program.`}
        </p>
        {proposal && <StatementProposalPanel {...proposal} />}
        <ul className="space-y-2 text-sm text-cc-ink">
          {rows
            ? rows.map((row, i) =>
                row.proposals.length > 0 ? (
                  <li key={row.evidence?.id ?? `p-${i}`} data-doc-statement-row="paired" className="flex flex-col md:flex-row md:gap-3">
                    <div className="flex-1">
                      {row.proposals.map((p) => <ProposedStatementLine key={p.id} proposal={p} />)}
                      {row.evidence && (
                        <p data-statement-evidence="" className="mt-1 text-[12px] text-cc-ink-muted">
                          <CcProvenanceChip value="reconstructed" /> {row.evidence.text}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-cc-ink-muted md:whitespace-nowrap">
                      {anchorsWords(row.evidence ? row.evidence.anchors : row.proposals.flatMap((p) => p.anchors))}
                    </span>
                  </li>
                ) : row.evidence ? (
                  <StatementRow key={row.evidence.id} text={row.evidence.text} anchors={row.evidence.anchors} />
                ) : null,
              )
            : doc.statements.map((statement) => (
                <StatementRow key={statement.id} text={statement.text} anchors={statement.anchors} />
              ))}
        </ul>
      </FoldedListSection>

      <FoldedListSection
        name="effects"
        data-doc-effects=""
        level={4}
        title="Update task and commit"
        rows={doc.effects.registrations.length + doc.effects.events.length}
        summary={effectsSummary(doc.effects)}
      >
        {doc.effects.registrations.length === 0 && doc.effects.events.length === 0 ? (
          <p className="text-sm text-cc-ink-muted">The source registers no update module and issues no COMMIT WORK or ROLLBACK WORK.</p>
        ) : (
          <ul className="space-y-2 text-sm text-cc-ink">
            {doc.effects.registrations.map((registration, i) => (
              <li key={`r-${i}`}>
                <span className="font-mono">{registration.module ?? 'a module named at runtime'}</span> is registered for the
                update task — {rangeWords(registration.anchor)}.
                {registration.outcomes.map((outcome, k) => (
                  <span key={k} className="block pl-4 text-xs text-cc-ink-muted">
                    {outcome.state} at {rangeWords(outcome.anchor)}{outcome.conditional ? ' (on some paths)' : ''}
                  </span>
                ))}
                {registration.unresolved && (
                  <span className="block pl-4 text-xs text-cc-ink-muted">
                    {registration.unresolved.state === 'orphaned' ? 'Orphaned' : NOT_DETERMINED_LABEL} — {registration.unresolved.reason}
                  </span>
                )}
              </li>
            ))}
            {doc.effects.events.map((event, i) => (
              <li key={`e-${i}`}>
                <span className="font-mono">{event.token}</span>
                {event.kind === 'commit' ? commitWaitWords(event.andWait) : ''} — {rangeWords(event.anchor)}
              </li>
            ))}
          </ul>
        )}
      </FoldedListSection>

      <FoldedListSection
        name="lanes"
        data-doc-lanes=""
        level={4}
        title="Lanes"
        rows={doc.lanes.length + doc.proposedLanes.length}
        summary={lanesSummary(doc)}
      >
        <p className="text-xs text-cc-ink-muted mb-3">A lane is the token the source writes, never a job title.</p>
        <ul className="space-y-1 text-sm text-cc-ink">
          {doc.lanes.map((lane, i) => (
            <li key={`l-${i}`} className="flex flex-wrap items-center gap-2">
              <CcProvenanceChip value={lane.provenance} />
              <span className="font-mono">{lane.name || '(program)'}</span>
              <span className="text-xs text-cc-ink-muted">{lane.kind}{lane.basis.length ? `, from ${lane.basis.join(', ')}` : ''} — {rangeWords(lane.anchor)}</span>
            </li>
          ))}
          {doc.proposedLanes.map((lane, i) => (
            <li key={`p-${i}`} className="flex flex-wrap items-center gap-2">
              <CcProvenanceChip value={lane.provenance} />
              <span>{lane.name}</span>
              <span className="text-xs text-cc-ink-muted">
                {lane.authorityObject ? `${lane.authorityObject} — ` : ''}
                {lane.anchor ? rangeWords(lane.anchor) : `${NOT_DETERMINED_LABEL} — ${lane.undetermined?.reason ?? ''}`}
              </span>
            </li>
          ))}
        </ul>
      </FoldedListSection>

      <FoldedListSection
        name="gaps"
        data-doc-gaps=""
        level={4}
        title="Not determined from the code"
        rows={doc.notDetermined.length}
        summary={gapsSummary(doc.notDetermined)}
      >
        <ul className="space-y-2 text-sm text-cc-ink">
          {doc.notDetermined.map((gap) => (
            <li key={gap.subject} className="flex flex-col gap-1 md:flex-row md:items-start md:gap-3">
              <span className="inline-flex items-center gap-2 md:w-48 shrink-0">
                <CcProvenanceChip value="not-determined" />
                <span className="font-semibold text-cc-ink">{gap.subject}</span>
              </span>
              <span>{gap.reason}</span>
            </li>
          ))}
        </ul>
      </FoldedListSection>
    </div>
  );
}

/** An engine sentence with its lines — the list as it was before 17.10. */
function StatementRow({ text, anchors }: { text: string; anchors: ProcessDocumentation['statements'][number]['anchors'] }) {
  return (
    <li className="flex flex-col md:flex-row md:gap-3">
      <span className="flex-1">{text}</span>
      <span className="text-[11px] text-cc-ink-muted md:whitespace-nowrap">{anchorsWords(anchors)}</span>
    </li>
  );
}
