'use client';

import React, { useState } from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
import CcTable from '@/components/cc/Table';
import type { DocAnchor } from '@/lib/process-documentation';
import { sectionTitle, stepRef, type PdStep, type ProcessDocument } from '@/lib/process-document';
import {
  REQUIREMENT_QUESTIONS,
  REQUIREMENT_QUESTION_HEAD,
  STEP_SUMMARY_HEAD,
  actorsProven,
  appendixLead,
  gateSentence,
  requirementQuestionRows,
  shortTech,
  stepDetailLines,
  stepName,
  stepSummaryRows,
  wordingRows,
} from '@/lib/process-document-outline';
import { wt } from '@/lib/workspace-messages';

/**
 * The appendix of the process description on the Documentation tool — the same parts, in the same order, as the
 * appendix every file prints (`processDocumentBlocks`, `buildEngineConfluenceHtml`): the steps in one table, each
 * step's details folded, the code's own wording, the questions about the requirements, then the technical trace the
 * stage passes in. ADR-127 folds it into the page's appendix; the rest of the old description view
 * (`ProcessDocumentView`, its chapter bar and its flow strip) retired with Documentation v2 — the chapters are
 * `DocumentationOnePage`'s.
 */

const CARD = 'rounded-cc-card border border-cc-line bg-cc-surface p-4 md:p-5 shadow-cc min-w-0';

function Anchors({ anchors, max = 3 }: { anchors: readonly DocAnchor[]; max?: number }) {
  if (!anchors.length) return null;
  const shown = anchors.slice(0, max);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((a) => (
        <CcAnchor key={`${a.lineStart}-${a.lineEnd}`} label={a.lineEnd > a.lineStart ? `Source lines ${a.lineStart} to ${a.lineEnd}` : `Source line ${a.lineStart}`}>
          {a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`}
        </CcAnchor>
      ))}
      {anchors.length > max ? <span className="cc-text-meta text-cc-ink-muted">+{anchors.length - max}</span> : null}
    </span>
  );
}

/** The program's names, muted and in mono — the source column, never the sentence. */
function Tech({ children }: { children: string | null | undefined }) {
  const short = shortTech(children);
  if (!short) return null;
  return (
    <span data-doc-tech="" title={short !== children ? children ?? undefined : undefined} className="font-cc-mono text-[11px] font-medium text-cc-ink-muted [overflow-wrap:anywhere]">
      {short}
    </span>
  );
}

function scrollTo(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  // Scrolled to, not navigated to: the fold stays where the reader is.
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function DetailLine({ line }: { line: string }) {
  const m = /^(Technical|Who acts|AI-generated|[A-Z][\w ]{2,24}):\s(.+)$/.exec(line);
  return (
    <li className="min-w-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">
      {m ? <><span className="cc-text-label text-cc-ink-muted">{m[1]}</span>{' '}{m[2]}</> : line}
    </li>
  );
}

/**
 * The appendix's first two parts (owner review 10.10.2026: "an endless list,
 * badly formatted"): one compact table of the steps — what each does, its
 * lines, how many details it holds — and then the details of each step, one
 * fold per step, the decision points between them in one line each. The
 * evidence follows complete underneath.
 */
function AppendixSteps({ doc }: { doc: ProcessDocument }) {
  const whoActs = actorsProven(doc.overview.path);
  const summary = stepSummaryRows(doc, whoActs);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const steps = doc.overview.path.filter((e): e is PdStep => e.kind === 'step');
  const openStep = (event: React.MouseEvent<HTMLAnchorElement>, n: number) => {
    setOpen((o) => ({ ...o, [n]: true }));
    scrollTo(event, `pd-a-step-${n}`);
  };
  return (
    <>
      <div data-doc-appendix-summary="" className={CARD}>
        <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">{wt('doc.appendixSummaryTitle')}</h3>
        <CcTable
          caption={wt('doc.appendixSummaryTitle')}
          columns={STEP_SUMMARY_HEAD.map((label, i) => ({ key: `c${i}`, label, numeric: i === 4, width: i === 0 ? '56px' : undefined }))}
          rows={summary.map((r, i) => {
            const step = steps[i];
            return {
              key: `s${i}`,
              cells: {
                c0: r[0],
                c1: <span className="cc-text-identifier text-cc-ink">{r[1]}</span>,
                c2: r[2],
                c3: <Anchors anchors={step?.anchors ?? []} max={2} />,
                c4: step && Number(r[4]) > 0 ? (
                  <a href={`#pd-a-step-${step.number}`} onClick={(event) => openStep(event, step.number)} data-doc-appendix-open={step.number} className="text-cc-ink underline underline-offset-2">{r[4]}</a>
                ) : r[4],
              },
            };
          })}
        />
      </div>

      <div data-doc-appendix-steps="" className={CARD}>
        <h3 className="m-0 mb-2 cc-text-h3 text-cc-ink">{wt('doc.appendixDetailsTitle')}</h3>
        <ol className="m-0 flex list-none flex-col p-0">
          {doc.overview.path.map((entry) => entry.kind === 'gate' ? (
            <li key={entry.id} data-doc-appendix-gate="" className="flex min-w-0 items-start gap-2 border-t border-cc-line py-2 cc-text-meta font-medium text-cc-ink-muted">
              <span aria-hidden={true} className="mt-1 block h-2 w-2 shrink-0 rotate-45 border border-cc-ink" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{gateSentence(entry)}</span>
            </li>
          ) : (
            <li key={entry.id} id={`pd-a-step-${entry.number}`} data-doc-appendix-step={entry.number} className="min-w-0 scroll-mt-28 border-t border-cc-line py-1 first:border-t-0">
              <CcDisclosure
                title={`${stepRef(entry)}. ${stepName(entry)}`}
                count={Math.max(0, stepDetailLines(entry, whoActs).length - 1)}
                summary={entry.line || undefined}
                open={!!open[entry.number]}
                onOpenChange={(v) => setOpen((o) => ({ ...o, [entry.number]: v }))}
                density="compact"
              >
                <ul className="m-0 mt-1 mb-2 flex list-none flex-col gap-1 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
                  {stepDetailLines(entry, whoActs).map((line, i) => <DetailLine key={i} line={line} />)}
                </ul>
              </CcDisclosure>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/**
 * The appendix of the process description (owner review 10.10.2026,
 * restructured): a compact summary of the steps first, then each step's
 * details folded, then the evidence complete — the code's own wording of what
 * the body says shorter, the questions about the requirements, and the
 * technical trace (every element and every statement with its lines) the stage
 * passes in. Its own block so the stage can put it last, below the business
 * layer and the map; the exports keep the same order (A.1 opens with the same
 * summary table).
 */
export function ProcessDocumentAppendix({ document: doc, children }: { document: ProcessDocument | null; children: React.ReactNode }) {
  return (
    <section id="pd-appendix" data-doc-section="appendix" aria-labelledby="pd-appendix-title" className="min-w-0 scroll-mt-28">
      <h2 id="pd-appendix-title" className="m-0 cc-text-h2 text-cc-ink">{sectionTitle('appendix')}</h2>
      <p className="m-0 mt-1 mb-4 max-w-3xl cc-text-cell text-cc-ink-muted">
        {doc ? appendixLead(doc.appendix) : 'Every element and every statement the engine read, grouped by routine, each with its lines.'}
      </p>
      {doc ? (
        <div className="mb-4 flex min-w-0 flex-col gap-4">
          <AppendixSteps doc={doc} />
          <div data-doc-appendix-evidence="" className="min-w-0">
            <h3 className="m-0 cc-text-h3 text-cc-ink">{wt('doc.appendixEvidenceTitle')}</h3>
            <p className="m-0 mt-1 mb-2 cc-text-cell text-cc-ink-muted">{wt('doc.appendixEvidenceLead')}</p>
            <div className="flex flex-col gap-1">
              <CcDisclosure title="Wording as read from the code" count={wordingRows(doc).length} density="compact">
                <CcTable
                  caption="Wording as read from the code"
                  columns={[{ key: 's', label: 'Section' }, { key: 'i', label: 'Item' }, { key: 'w', label: 'As read from the code' }, { key: 'l', label: 'Lines' }]}
                  rows={wordingRows(doc).map((r, i) => ({ key: String(i), cells: { s: r[0], i: r[1], w: r[2], l: <Tech>{r[3]}</Tech> } }))}
                />
              </CcDisclosure>
              {doc.questions.length ? (
                <div id="pd-requirement-questions" data-doc-requirement-question-list="" className="scroll-mt-28">
                  <CcDisclosure title={REQUIREMENT_QUESTIONS} count={doc.questions.length} density="compact">
                    <CcTable
                      caption={REQUIREMENT_QUESTIONS}
                      columns={REQUIREMENT_QUESTION_HEAD.map((label, i) => ({ key: `c${i}`, label }))}
                      rows={requirementQuestionRows(doc).map((r, i) => ({
                        key: String(i),
                        cells: Object.fromEntries(r.map((cell, c) => [`c${c}`, c === 4 ? <Tech>{cell}</Tech> : cell])),
                      }))}
                    />
                  </CcDisclosure>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
