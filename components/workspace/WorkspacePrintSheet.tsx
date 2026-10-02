'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { fetchProcessStates } from '@/lib/process-states-client';
import { readProcessStates, STATE_LABELS, subjectIdsOf, type ProcessStateView } from '@/lib/process-states';
import { processStepList } from '@/lib/process-step-list';
import { buildBusinessCard, headlineLead, plainWordingFor, summaryOf } from '@/lib/business-card';
import { anchorLabel, readTableAccess, type SourceReading } from '@/lib/first-look';
import type { NotDetermined } from '@/lib/workspace-model';
import type { Project } from '@/lib/types';
import { formatIsoDate } from '@/lib/format';
import {
  printHeaderLine,
  printNotDeterminedTitle,
  printObjectsTitle,
  printRulesTitle,
  wt,
  type WorkspaceMessageKey,
} from '@/lib/workspace-messages';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { useAbcdCatalogLookup } from '@/hooks/useAbcdCatalogLookup';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import { gradeKey, type ObjectUse } from '@/lib/abap/abcd-classification';
import { CLEAN_CORE_LEVEL, CLEAN_CORE_LEVEL_VALUES } from '@/lib/clean-core-level';
import type { TableDependency } from '@/lib/abap/table-dependencies';

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
 *   5. the SAP objects the code names, each with SAP's clean core level A–D
 *      as the IT view shows it — read under the project's target profile
 *      (`catalogLookupTargetOf` → `/api/abcd-classify`), with a short legend.
 *      Owner decision 01.10.2026 ("show the clean core level, yes, on the
 *      print sheet"). The level is orientation: it is not part of the signed
 *      run or the audit pack, and the sheet says so. An object without a
 *      grade prints "not determined", and a lookup that has not answered
 *      prints that, never a guessed letter;
 *   6. everything that was not determined, with its reason and line.
 *
 * Hidden on screen. `app/globals.css` (`body:has([data-workspace-print])`)
 * makes it the only thing on paper while the workspace is open — unless the
 * steering one-pager is, which then prints instead, as before. Anchors and IDs
 * print as text. Nothing here calls a model; the one request it makes is the
 * read of what has been confirmed, the same the rules panel makes.
 *
 * No heading elements: the sheet is hidden on screen and `aria-hidden`, and an
 * `h1` here would stand before the page's own in the DOM — every reader and
 * spec that asks for "the first h1" of the workspace would find this one.
 */
/** One SAP object the code names, in the way it uses it, with its first line. */
export interface PrintObject {
  name: string;
  use: ObjectUse;
  line: number;
}

const USE_KEY: Record<ObjectUse, WorkspaceMessageKey> = {
  read: 'print.useRead',
  write: 'print.useWrite',
  reference: 'print.useReference',
};

/**
 * The distinct objects of the table reading, in source order. A name the
 * source only shows as a possible value of a dynamic target is not the target
 * (R26) and is left out, as is another program's data object — neither is an
 * SAP object the level lists grade.
 */
export function printObjectsOf(dependencies: readonly TableDependency[]): PrintObject[] {
  const seen = new Map<string, PrintObject>();
  for (const dep of dependencies) {
    if (dep.possibleTargetOf || dep.route === 'program-global') continue;
    const key = gradeKey(dep.table, dep.access);
    if (!seen.has(key)) seen.set(key, { name: dep.table, use: dep.access, line: dep.line });
  }
  return [...seen.values()];
}

/** `/api/abcd-classify` refuses more than 500 objects in one call. */
const MAX_GRADED = 500;

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

  const objects = useMemo(
    () => (source.trim() ? printObjectsOf(readTableAccess(source)).slice(0, MAX_GRADED) : []),
    [source],
  );
  // Graded under the project's target profile (owner decision 30.09.2026), the
  // same lookup the IT view's buckets and the process map's overlay make.
  const levels = useAbcdCatalogLookup(objects, project ? catalogLookupTargetOf(project) : null);

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
  // With a signed run, a rule may have been confirmed; until the read above has
  // landed (or when it failed) paper does not know, and says so instead of
  // printing "Not confirmed" under a "reconstructed" basis (QA 137f7c2ef0e4).
  const unread = runId !== null && decided === null;
  const today = formatIsoDate(new Date()) ?? '';
  const rules = reading?.ruleSet.rules ?? [];
  // The headline of the Business card, on paper — the same three rules the
  // card features (`featuredRules`), each with its anchor. Only `featured` is
  // read from the card here; its figures are the screen's business.
  const featured = useMemo(() => {
    if (!reading || !wording) return [];
    const card = buildBusinessCard({
      skeleton: reading.skeleton,
      ruleSet: reading.ruleSet,
      dependencies: [],
      traceability: { anchored: 0, nodes: 0, sentence: '' },
      open,
      wording,
    });
    return card.featured.map((r) => ({ id: r.id, phrase: r.phrase ?? r.code, anchor: r.anchors[0] ?? null }));
  }, [reading, wording, open]);

  return (
    <div data-workspace-print="" aria-hidden={true} className="hidden print:block">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-cc-line pb-2">
        <span className="text-[13px] font-bold">{wt('print.brand')}</span>
        <span className="font-cc-mono text-[11px]">
          {printHeaderLine({ projectId, runId, revision: states?.revision ?? null, date: today })}
        </span>
      </header>

      <p data-print-title="" className="mt-4 mb-0 text-[22px] leading-tight font-extrabold">{project?.name || projectId}</p>
      {sentence ? <p className="mt-1 mb-0 text-[13px] leading-snug">{sentence}</p> : null}
      {reading ? (
        <p data-print-headline="" className="mt-3 mb-0 text-[15px] leading-snug font-bold">
          {headlineLead(rules.length)}
          {featured.length > 0 ? ' — ' : null}
          {featured.map((r, i) => (
            <React.Fragment key={r.id}>
              {i > 0 ? ', ' : null}
              {r.phrase}
              {r.anchor ? <span className="font-cc-mono text-[11px] font-medium"> [{r.anchor}]</span> : null}
            </React.Fragment>
          ))}
        </p>
      ) : null}

      <section className="mt-4">
        <p className="m-0 flex items-center gap-2 text-[15px] font-bold">
          {wt('print.processTitle')}
          <CcProvenanceChip value="reconstructed" />
        </p>
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
        <p className="m-0 text-[15px] font-bold">{printRulesTitle(rules.length)}</p>
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
                  <span>{entry ? STATE_LABELS[entry.state] : unread ? wt('print.decisionNotRead') : wt('print.notConfirmed')}</span>
                  <span>
                    {unread ? null : <CcProvenanceChip value={entry ? 'confirmed' : 'reconstructed'} />}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section data-print-levels="" className="mt-4">
        <p className="m-0 flex items-center gap-2 text-[15px] font-bold">
          {printObjectsTitle(objects.length)}
          <CcProvenanceChip value="imported" />
        </p>
        <p className="mt-1 mb-0 text-[12px]">{wt('print.levelsNote')}</p>
        {objects.length === 0 ? (
          <p className="mt-1 mb-0 text-[13px]">{wt('print.noObjects')}</p>
        ) : (
          <div className="mt-2 rounded-cc-row border border-cc-line">
            <div className="grid grid-cols-[1fr_120px_260px] gap-2 border-b border-cc-line px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
              <span>{wt('print.colObject')}</span>
              <span>{wt('print.colUse')}</span>
              <span>{wt('print.colLevel')}</span>
            </div>
            {objects.map((object) => {
              const graded = levels.status === 'ready' ? levels.grades[gradeKey(object.name, object.use)] : undefined;
              return (
                <div
                  key={gradeKey(object.name, object.use)}
                  data-print-object={gradeKey(object.name, object.use)}
                  className="grid grid-cols-[1fr_120px_260px] items-center gap-2 border-b border-cc-line px-3 py-1 text-[13px] break-inside-avoid last:border-b-0"
                >
                  <span>
                    <span className="font-cc-mono text-[12px]">{object.name}</span>
                    <span className="font-cc-mono text-[11px]"> [{anchorLabel(object.line)}]</span>
                  </span>
                  <span>{wt(USE_KEY[object.use])}</span>
                  <span data-print-level={levels.status === 'ready' ? (graded?.grade ?? 'Unknown') : levels.status}>
                    {levels.status === 'loading' ? (
                      wt('print.levelsLoading')
                    ) : levels.status === 'error' ? (
                      wt('print.levelsFailed')
                    ) : (
                      <CcCleanCoreLevel value={graded?.grade ?? 'Unknown'} withLabel />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <dl data-print-legend="" className="mt-2 mb-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[12px]">
          {[...CLEAN_CORE_LEVEL_VALUES, 'Unknown' as const].map((value) => (
            <React.Fragment key={value}>
              <dt className="font-cc-mono font-semibold">{CLEAN_CORE_LEVEL[value].code}</dt>
              <dd className="m-0">{CLEAN_CORE_LEVEL[value].label}</dd>
            </React.Fragment>
          ))}
        </dl>
      </section>

      <section className="mt-4">
        <p className="m-0 flex items-center gap-2 text-[15px] font-bold">
          {open.noSource ? wt('print.notDeterminedNoSource') : printNotDeterminedTitle(open.count)}
          <CcProvenanceChip value="not-determined" />
        </p>
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
