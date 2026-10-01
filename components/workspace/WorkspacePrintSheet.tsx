'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { fetchProcessStates } from '@/lib/process-states-client';
import { readProcessStates, STATE_LABELS, subjectIdsOf, type ProcessStateView } from '@/lib/process-states';
import { processStepList } from '@/lib/process-step-list';
import { plainWordingFor, summaryOf } from '@/lib/business-card';
import { anchorLabel, readTableAccess, type SourceReading } from '@/lib/first-look';
import type { NotDetermined } from '@/lib/workspace-model';
import type { Project } from '@/lib/types';
import { formatIsoDate } from '@/lib/format';
import { printHeaderLine, printNotDeterminedTitle, printRulesTitle, wt } from '@/lib/workspace-messages';

/**
 * The workspace on paper — `DESIGN.md` §7.1 and §5.7, mockup s10 ("Druck").
 *
 * The screen is made of folds, popovers and cards that open; paper has none of
 * them. So the printout is not the screen without its toolbars — that printed
 * nine expanded cards and a chat box — but its own short sheet, built from the
 * same reading the screen shows:
 *
 *   1. a header line with what identifies this printout: project, run,
 *      revision of the confirmed need, and the date it was printed;
 *   2. the project and its sentence;
 *   3. the process as a **numbered step list** — the map does not print
 *      legibly at page width (§5.7), and the sheet says so in one line;
 *   4. the business rules as a table with the decision on record and its
 *      basis, as a chip with word and icon (§7.1);
 *   5. everything that was not determined, with its reason and line.
 *
 * Hidden on screen. `app/globals.css` (`body:has([data-workspace-print])`)
 * makes it the only thing on paper while the workspace is open — unless the
 * steering one-pager is, which then prints instead, as before. Anchors and IDs
 * print as text. Nothing here calls a model; the one request it makes is the
 * read of what has been confirmed, the same the rules panel makes.
 */
export default function WorkspacePrintSheet({
  project,
  projectId,
  reading,
  open,
}: {
  project: Project | null;
  projectId: string;
  /** The reading `FirstLook` computed for this screen, or null before it lands. */
  reading: SourceReading | null;
  open: NotDetermined;
}) {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const [states, setStates] = useState<ProcessStateView | null>(null);

  // Read once, a moment after the screen settles — a browser's print dialog
  // does not wait for a request started by `beforeprint`.
  useEffect(() => {
    if (!source.trim() || !project?.activeRunId) return undefined;
    let alive = true;
    const timer = window.setTimeout(() => {
      fetchProcessStates(projectId).then((view) => {
        if (alive) setStates(view);
      });
    }, 1500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [projectId, source, project?.activeRunId]);

  const steps = useMemo(() => (reading ? processStepList(reading.skeleton, source) : []), [reading, source]);
  const wording = useMemo(() => (reading ? plainWordingFor(source, reading.skeleton) : null), [reading, source]);
  const sentence = useMemo(
    () => (wording && source.trim() ? summaryOf(readTableAccess(source), wording).sentence : null),
    [wording, source],
  );
  const decided = useMemo(() => {
    if (!states) return null;
    const { rules } = subjectIdsOf(states.subjects);
    return readProcessStates(states.entries, { elements: [], rules }).bySubject;
  }, [states]);

  const runId = typeof project?.activeRunId === 'string' && project.activeRunId ? project.activeRunId : null;
  const today = formatIsoDate(new Date()) ?? '';
  const rules = reading?.ruleSet.rules ?? [];

  return (
    <div data-workspace-print="" aria-hidden={true} className="hidden print:block">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-cc-line pb-2">
        <span className="text-[13px] font-bold">{wt('print.brand')}</span>
        <span className="font-cc-mono text-[11px]">
          {printHeaderLine({ projectId, runId, revision: states?.revision ?? null, date: today })}
        </span>
      </header>

      <h1 className="mt-4 mb-0 text-[22px] leading-tight font-extrabold">{project?.name || projectId}</h1>
      {sentence ? <p className="mt-1 mb-0 text-[13px] leading-snug">{sentence}</p> : null}

      <section className="mt-4">
        <h2 className="m-0 flex items-center gap-2 text-[15px] font-bold">
          {wt('print.processTitle')}
          <CcProvenanceChip value="reconstructed" />
        </h2>
        {steps.length === 0 ? (
          <p className="mt-1 mb-0 text-[13px]">{wt('print.noSteps')}</p>
        ) : (
          <>
            <p className="mt-1 mb-2 rounded-cc-row border border-dashed border-cc-line px-2 py-1 text-[12px]">
              {wt('print.stepListInstead')}
            </p>
            <ol className="m-0 list-decimal space-y-1 pl-6 text-[13px] leading-snug">
              {steps.map((step) => (
                <li key={step.id} data-print-step={step.kind}>
                  <span className="font-semibold">{step.name}</span>
                  {step.anchor ? <span className="font-cc-mono text-[11px]"> [{step.anchor}]</span> : null}
                  {step.technical && step.kind === 'decision' ? (
                    <span className="font-cc-mono text-[11px]"> {step.technical}</span>
                  ) : null}
                  {step.branches.length > 0 ? <span> — {step.branches.join('; ')}</span> : null}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="mt-4">
        <h2 className="m-0 text-[15px] font-bold">{printRulesTitle(rules.length)}</h2>
        {rules.length === 0 ? (
          <p className="mt-1 mb-0 text-[13px]">{wt('print.noRules')}</p>
        ) : (
          <div className="mt-2 rounded-cc-row border border-cc-line">
            <div className="grid grid-cols-[1fr_160px_150px] gap-2 border-b border-cc-line px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
              <span>{wt('print.colRule')}</span>
              <span>{wt('print.colDecision')}</span>
              <span>{wt('print.colBasis')}</span>
            </div>
            {rules.map((rule) => {
              const entry = decided?.[rule.id];
              const first = rule.sentences.flatMap((s) => s.anchors)[0];
              return (
                <div
                  key={rule.id}
                  data-print-rule={rule.id}
                  className="grid grid-cols-[1fr_160px_150px] gap-2 border-b border-cc-line px-3 py-1 text-[13px] break-inside-avoid last:border-b-0"
                >
                  <span>
                    <span className="font-cc-mono text-[11px]">{rule.id}</span>{' '}
                    {wording?.ruleSentence(rule) ?? rule.text}
                    {first ? (
                      <span className="font-cc-mono text-[11px]"> [{anchorLabel(first.lineStart, first.lineEnd)}]</span>
                    ) : null}
                  </span>
                  <span>{entry ? STATE_LABELS[entry.state] : wt('print.notConfirmed')}</span>
                  <span>
                    <CcProvenanceChip value={entry ? 'confirmed' : 'reconstructed'} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-4">
        <h2 className="m-0 flex items-center gap-2 text-[15px] font-bold">
          {open.noSource ? wt('print.notDeterminedNoSource') : printNotDeterminedTitle(open.count)}
          <CcProvenanceChip value="not-determined" />
        </h2>
        {open.items.length > 0 ? (
          <ul className="mt-2 mb-0 list-disc space-y-1 pl-6 text-[13px] leading-snug">
            {open.items.map((item, i) => (
              <li key={`${item.anchor}-${i}`} data-print-open="">
                <span className="font-semibold">{item.label}</span>{' '}
                <span className="font-cc-mono text-[11px]">[{item.anchor}]</span> — {item.why}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="mt-6 mb-0 border-t border-cc-line pt-2 text-[11px]">{wt('print.footer')}</p>
    </div>
  );
}
