'use client';

import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import {
  NOT_DETERMINED_LABEL,
  anchorsWords,
  rangeWords,
  stepEvidence,
  type ProcessDocumentation,
} from '@/lib/process-documentation';

/**
 * Stage 4's document as the engine wrote it — roadmap 3.0.5, Weg C.
 *
 * It renders `lib/process-documentation.ts` and decides nothing: every line on
 * this screen is a field of the stored document, every anchor is the one the
 * engine recorded, and every gap is printed with its reason. The provenance
 * chips are the nine of `lib/provenance.ts`, through the one chip component.
 */
export default function ProcessDocumentationView({ doc }: { doc: ProcessDocumentation }) {
  const statementById = new Map(doc.statements.map((s) => [s.id, s]));

  return (
    <div data-engine-documentation className="space-y-8">
      <section className="rounded-[2rem] border border-gray-100 bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <CcProvenanceChip value="reconstructed" />
          <span className="text-xs font-medium text-slate-500">
            {doc.fileName} · {doc.lineCount} lines
          </span>
        </div>
        <h3 className="text-lg md:text-xl font-bold text-gray-950">{doc.processName}</h3>
        <p className="mt-2 text-sm text-slate-700">{doc.overview}</p>
        <p data-doc-traceability className="mt-1 text-sm text-slate-700">{doc.traceability.sentence}</p>
        {doc.naming.notice && <p className="mt-1 text-sm text-slate-500">{doc.naming.notice}</p>}
        <p className="mt-4 text-xs text-slate-500 max-w-3xl">{doc.disclaimer}</p>
      </section>

      <section data-doc-steps className="rounded-[2rem] border border-gray-100 bg-white p-6 md:p-8 shadow-sm">
        <h4 className="text-[15px] font-bold text-gray-950 mb-4">The process, element by element</h4>
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-gray-600">Element</th>
                <th className="px-4 py-3 text-left font-bold text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-bold text-gray-600">What it does</th>
                <th className="px-4 py-3 text-left font-bold text-gray-600">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
              {doc.steps.map((step) => {
                const sentence = step.statementId ? statementById.get(step.statementId) : undefined;
                return (
                  <tr key={step.id} data-doc-step={step.id}>
                    <td className="px-4 py-3 align-top">
                      <span className="block font-semibold text-gray-900">{step.kind}</span>
                      <span className="font-mono text-[10px] text-slate-400">{step.id}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {step.businessName ? (
                        <>
                          <span className="block font-semibold text-gray-900">{step.businessName}</span>
                          <span className="block font-mono text-[11px] text-slate-500">{step.technicalName}</span>
                        </>
                      ) : (
                        <span className="font-mono text-[11px] text-gray-900">{step.technicalName}</span>
                      )}
                      {step.lane && <span className="block mt-1 text-[11px] text-slate-500">Lane: {step.lane}</span>}
                      {step.namingProvenance && (
                        <span className="mt-1 inline-block"><CcProvenanceChip value={step.namingProvenance} note="name" /></span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top max-w-md">{sentence ? sentence.text : ''}</td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {step.anchor ? (
                        rangeWords(step.anchor)
                      ) : (
                        <span className="inline-flex flex-col gap-1">
                          <CcProvenanceChip value="not-determined" />
                          <span className="text-[11px] text-slate-500 whitespace-normal">{stepEvidence(step)}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section data-doc-statements className="rounded-[2rem] border border-gray-100 bg-white p-6 md:p-8 shadow-sm">
        <h4 className="text-[15px] font-bold text-gray-950 mb-1">Business statements, across the whole program</h4>
        <p className="text-xs text-slate-500 mb-4">
          {doc.statements.length === 0
            ? 'The engine formed no business statement from this source.'
            : `${doc.statements.length} statements, in the order of the program.`}
        </p>
        <ul className="space-y-2 text-sm text-slate-700">
          {doc.statements.map((statement) => (
            <li key={statement.id} className="flex flex-col md:flex-row md:gap-3">
              <span className="flex-1">{statement.text}</span>
              <span className="text-[11px] text-slate-400 md:whitespace-nowrap">{anchorsWords(statement.anchors)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section data-doc-effects className="rounded-[2rem] border border-gray-100 bg-white p-6 md:p-8 shadow-sm">
        <h4 className="text-[15px] font-bold text-gray-950 mb-3">Update task and commit</h4>
        {doc.effects.registrations.length === 0 && doc.effects.events.length === 0 ? (
          <p className="text-sm text-slate-600">The source registers no update module and issues no COMMIT WORK or ROLLBACK WORK.</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-700">
            {doc.effects.registrations.map((registration, i) => (
              <li key={`r-${i}`}>
                <span className="font-mono">{registration.module ?? 'a module named at runtime'}</span> is registered for the
                update task — {rangeWords(registration.anchor)}.
                {registration.outcomes.map((outcome, k) => (
                  <span key={k} className="block pl-4 text-xs text-slate-500">
                    {outcome.state} at {rangeWords(outcome.anchor)}{outcome.conditional ? ' (on some paths)' : ''}
                  </span>
                ))}
                {registration.unresolved && (
                  <span className="block pl-4 text-xs text-slate-500">
                    {registration.unresolved.state === 'orphaned' ? 'Orphaned' : NOT_DETERMINED_LABEL} — {registration.unresolved.reason}
                  </span>
                )}
              </li>
            ))}
            {doc.effects.events.map((event, i) => (
              <li key={`e-${i}`}>
                <span className="font-mono">{event.token}</span>
                {event.kind === 'commit' ? (event.andWait ? ', waits for the update' : ', does not wait') : ''} — {rangeWords(event.anchor)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-doc-lanes className="rounded-[2rem] border border-gray-100 bg-white p-6 md:p-8 shadow-sm">
        <h4 className="text-[15px] font-bold text-gray-950 mb-1">Lanes</h4>
        <p className="text-xs text-slate-500 mb-3">A lane is the token the source writes, never a job title.</p>
        <ul className="space-y-1 text-sm text-slate-700">
          {doc.lanes.map((lane, i) => (
            <li key={`l-${i}`} className="flex flex-wrap items-center gap-2">
              <CcProvenanceChip value={lane.provenance} />
              <span className="font-mono">{lane.name || '(program)'}</span>
              <span className="text-xs text-slate-500">{lane.kind}{lane.basis.length ? `, from ${lane.basis.join(', ')}` : ''} — {rangeWords(lane.anchor)}</span>
            </li>
          ))}
          {doc.proposedLanes.map((lane, i) => (
            <li key={`p-${i}`} className="flex flex-wrap items-center gap-2">
              <CcProvenanceChip value={lane.provenance} />
              <span>{lane.name}</span>
              <span className="text-xs text-slate-500">
                {lane.authorityObject ? `${lane.authorityObject} — ` : ''}
                {lane.anchor ? rangeWords(lane.anchor) : `${NOT_DETERMINED_LABEL} — ${lane.undetermined?.reason ?? ''}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section data-doc-gaps className="rounded-[2rem] border border-gray-100 bg-white p-6 md:p-8 shadow-sm">
        <h4 className="text-[15px] font-bold text-gray-950 mb-3">Not determined from the code</h4>
        <ul className="space-y-2 text-sm text-slate-700">
          {doc.notDetermined.map((gap) => (
            <li key={gap.subject} className="flex flex-col gap-1 md:flex-row md:items-start md:gap-3">
              <span className="inline-flex items-center gap-2 md:w-48 shrink-0">
                <CcProvenanceChip value="not-determined" />
                <span className="font-semibold text-gray-900">{gap.subject}</span>
              </span>
              <span>{gap.reason}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
