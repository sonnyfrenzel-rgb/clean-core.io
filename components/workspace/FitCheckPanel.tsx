'use client';

import React, { useMemo, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcSelect from '@/components/cc/Select';
import { CcTag } from '@/components/cc/Tag';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcAnchor from '@/components/cc/Anchor';
import { wt } from '@/lib/workspace-messages';
import { getAuth } from '@/lib/firebase';
import { saveAs } from '@/lib/fileSaver';
import { useProcessStates, publishProcessStates } from '@/hooks/useProcessStates';
import { confirmProcessStates, confirmOutcomeSentence } from '@/lib/process-states-client';
import { signedSourceOf } from '@/lib/signed-source';
import { DEPARTURE_LABELS, STANDARD_TOUCH_LIMITS, anchorText, type StandardTouch } from '@/lib/standard-touch';
import {
  FIT_CHECK_ANSWERS,
  FIT_CHECK_LABELS,
  FIT_CHECK_QUESTION,
  fitCheck,
  fitCheckChoice,
  standardConditions,
  workshopAgendaBlocks,
  workshopFileName,
  type FitCheckAnswer,
} from '@/lib/fit-check';
import type { ItFindingRow } from '@/lib/it-findings';
import type { Project } from '@/lib/types';

/**
 * The guided fit-to-standard check and the workshop package — stage 2 of the
 * fit-to-standard approach (owner decision 22.10.2026), under the stage-1
 * card in the IT view.
 *
 * One question per business rule, the rules beside a departure first, each
 * answered from a fixed catalogue. An answer is the account's own statement,
 * recorded as a need revision through the same route as every rule answer
 * (`process-states`); what stays open is listed as a condition of *Move to
 * SAP standard*. The package takes the agenda and the reconstructed process
 * into the customer's own workshop. No model is called.
 */
export default function FitCheckPanel({
  projectId,
  project,
  touch,
  rows,
  demo,
}: {
  projectId: string;
  project: Project | null;
  touch: StandardTouch;
  rows: readonly ItFindingRow[];
  /** The demo has no project the route could read: nothing is fetched or stored. */
  demo: boolean;
}) {
  const states = useProcessStates(projectId, !demo && projectId !== '');
  const view = states.outcome?.ok ? states.outcome.view : null;
  const check = useMemo(() => fitCheck(touch, rows, view), [touch, rows, view]);
  const conditions = useMemo(() => standardConditions(check), [check]);
  const [draft, setDraft] = useState<Record<string, FitCheckAnswer>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const owner = !demo && !!project?.userId && getAuth().currentUser?.uid === project.userId;

  const save = async () => {
    const choices = Object.entries(draft)
      .filter(([ruleId, answer]) => check.questions.find((q) => q.ruleId === ruleId)?.answer !== answer)
      .map(([ruleId, answer]) => fitCheckChoice(ruleId, answer));
    if (choices.length === 0) {
      setNote(wt('itv.checkNothingToSave'));
      return;
    }
    setBusy(true);
    const outcome = await confirmProcessStates(projectId, check.revision, choices);
    setBusy(false);
    setNote(confirmOutcomeSentence(outcome));
    if (outcome.ok) {
      publishProcessStates(projectId, outcome.view);
      setDraft({});
    }
  };

  const projectName = project?.name?.trim() || 'Project';
  const signed = project ? signedSourceOf(project) : null;
  const agenda = () =>
    workshopAgendaBlocks({
      projectName,
      fileName: signed?.fileName ?? projectName,
      date: new Date().toISOString().slice(0, 10),
      touch,
      check,
    });
  const download = async (kind: 'md' | 'docx' | 'bpmn') => {
    setNote(null);
    try {
      const ex = await import('@/lib/requirements-export');
      if (kind === 'md') {
        await saveAs(new Blob([ex.blocksMarkdown(agenda())], { type: 'text/markdown;charset=utf-8' }), workshopFileName(projectName, 'md'));
        return;
      }
      if (kind === 'docx') {
        await saveAs(await ex.blocksDocx(agenda()), workshopFileName(projectName, 'docx'));
        return;
      }
      // The latest saved revision of the process, or the reconstruction from the signed source.
      const { fetchLatestRevision } = await import('@/lib/process-revisions-client');
      const latest = demo ? null : await fetchLatestRevision(projectId).catch(() => null);
      let xml = latest?.xml ?? null;
      // The demo has no signed run: its own source stands in, as everywhere in the demo.
      const fromSource = signed ?? (demo && typeof project?.legacyCode === 'string' ? { source: project.legacyCode, fileName: projectName } : null);
      if (!xml && fromSource) {
        const { buildBpmnExportFromSource } = await import('@/lib/bpmn/export');
        xml = buildBpmnExportFromSource(fromSource.source, { processName: projectName, sourceFileName: fromSource.fileName }).xml;
      }
      if (!xml) throw new Error('no process');
      await saveAs(new Blob([xml], { type: 'application/xml;charset=utf-8' }), workshopFileName(projectName, 'bpmn'));
    } catch {
      setNote(wt('itv.checkExportFailed'));
    }
  };

  const options = FIT_CHECK_ANSWERS.map((a) => ({ value: a, label: FIT_CHECK_LABELS[a] }));

  return (
    <section data-fit-check="" className="mt-4 border-t border-cc-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="m-0 text-[14px] font-bold text-cc-ink">{wt('itv.checkTitle')}</h4>
        <CcProvenanceChip value="confirmed" />
      </div>
      <p data-fit-check-limits="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {STANDARD_TOUCH_LIMITS}
      </p>
      <p className="m-0 mt-2 text-[13px] font-semibold text-cc-ink">{FIT_CHECK_QUESTION}</p>

      {demo ? (
        <p data-fit-check-demo="" className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">{wt('itv.checkDemo')}</p>
      ) : states.outcome === null ? (
        <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">{wt('itv.checkReading')}</p>
      ) : !states.outcome.ok ? (
        <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">{wt('itv.checkUnreadable')}</p>
      ) : check.questions.length === 0 ? (
        <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">{wt('itv.checkNoRules')}</p>
      ) : (
        <>
          {!owner ? <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">{wt('itv.checkReadOnly')}</p> : null}
          <ul data-fit-check-questions="" className="m-0 mt-3 list-none space-y-2 p-0">
            {check.questions.map((q) => (
              <li
                key={q.ruleId}
                data-fit-check-rule={q.ruleId}
                data-fit-check-open={q.open ? '' : undefined}
                className="grid gap-2 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2 md:grid-cols-[minmax(0,1fr)_240px]"
              >
                <div className="min-w-0">
                  <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-cc-ink">
                    <CcAnchor tone="unlinked">{q.ruleId}</CcAnchor>
                    <span>{q.label}</span>
                    {q.departures.length > 0 ? <CcTag>{wt('itv.checkBeside')}</CcTag> : null}
                  </p>
                  <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">
                    {q.detail}
                    {q.anchor ? ` · ${q.anchor}` : ''}
                    {q.departures.length > 0 ? ` · ${q.departures.map((k) => DEPARTURE_LABELS[k]).join('; ')}` : ''}
                  </p>
                  {q.answeredElsewhere ? (
                    <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink">
                      {wt('itv.checkElsewhere')}: {q.answeredElsewhere}
                    </p>
                  ) : null}
                </div>
                {owner ? (
                  <CcSelect
                    label={wt('itv.checkAnswer')}
                    options={options}
                    value={draft[q.ruleId] ?? q.answer ?? ''}
                    placeholder={wt('itv.checkChoose')}
                    onChange={(value) => setDraft((d) => ({ ...d, [q.ruleId]: value }))}
                  />
                ) : (
                  <p className="m-0 self-center text-[13px] font-medium text-cc-ink">
                    {q.answer ? FIT_CHECK_LABELS[q.answer] : wt('itv.checkChoose')}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {owner ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CcButton variant="primary" busy={busy} onClick={() => void save()}>
                {busy ? wt('itv.checkSaving') : wt('itv.checkSave')}
              </CcButton>
            </div>
          ) : null}
        </>
      )}

      {check.unlinked.length > 0 ? (
        <div data-fit-check-unlinked="" className="mt-4">
          <h5 className="m-0 text-[13px] font-bold text-cc-ink">{wt('itv.checkUnlinked')}</h5>
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {check.unlinked.map((d) => (
              <li key={d.kind} className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-cc-ink">
                <span>{d.label}</span>
                {d.anchors.slice(0, 8).map((a) => (
                  <CcAnchor key={a.lineStart} tone="unlinked">
                    {anchorText(a)}
                  </CcAnchor>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {conditions.length > 0 ? (
        <div data-fit-check-conditions={conditions.length} className="mt-4">
          <h5 className="m-0 text-[13px] font-bold text-cc-ink">{wt('itv.checkConditions')}</h5>
          <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-[13px] font-medium text-cc-ink">
            {conditions.slice(0, 12).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div data-fit-check-package="" className="mt-4">
        <h5 className="m-0 text-[13px] font-bold text-cc-ink">{wt('itv.checkPackage')}</h5>
        <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">{wt('itv.checkPackageLead')}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CcButton onClick={() => void download('docx')}>{wt('itv.checkAgendaWord')}</CcButton>
          <CcButton onClick={() => void download('md')}>{wt('itv.checkAgendaMarkdown')}</CcButton>
          <CcButton onClick={() => void download('bpmn')}>{wt('itv.checkProcessBpmn')}</CcButton>
        </div>
      </div>

      {note ? (
        <p role="status" className="m-0 mt-3 text-[13px] font-medium text-cc-ink">
          {note}
        </p>
      ) : null}
    </section>
  );
}
