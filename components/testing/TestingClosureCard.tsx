'use client';

import React, { useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcRadioGroup from '@/components/cc/RadioGroup';
import CcTextarea from '@/components/cc/Textarea';
import CcDateText from '@/components/cc/DateText';
import { CommandAnswerLostError, runProjectCommand } from '@/lib/project-command-client';
import {
  CLOSED_NOT_VERIFIED,
  CLOSURE_REASON_LABELS,
  MAX_CLOSURE_NOTE_CHARS,
  closureSentence,
  reasonsFor,
  testingClosureReading,
  type ClosureReason,
  type TestingClosure,
} from '@/lib/testing-closure';
import { testingClosureBasis } from '@/lib/workflow-steps';
import type { Project } from '@/lib/types';

/**
 * "Close testing without a passing run" — ADR-094 (owner, 11.10.2026).
 *
 * A failed or impossible run used to leave the project asking "Run the tests"
 * for ever. Here the owner ends it with a reason: a self-declaration, recorded
 * by the server with the account and the time (`close-testing`). Testing then
 * reads *Closed · not verified* — never passed, never proven — and the project
 * moves on. A new run, or "Reopen testing", opens it again.
 *
 * Offered only when the phase contract says there is something to close on
 * (`testingClosureBasis`: a run with failures, a run that gave no result, or a
 * route with no runner here). The basis line is the server's record, shown as
 * it will be recorded; the browser never sends it.
 */
export default function TestingClosureCard({
  projectId,
  project,
  isOwner,
  onChanged,
}: {
  projectId: string;
  project: Project;
  isOwner: boolean;
  /** The fields the server stored, to fold into the page's project. */
  onChanged: (fields: Partial<Project>) => void;
}) {
  const reading = testingClosureReading(project);
  const basis = testingClosureBasis(project);
  const [reason, setReason] = useState<ClosureReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (body: Parameters<typeof runProjectCommand>[1]) => {
    setBusy(true);
    setError(null);
    try {
      const fields = await runProjectCommand(projectId, body);
      onChanged(fields as Partial<Project>);
      setReason(null);
      setNote('');
    } catch (err) {
      setError(
        err instanceof CommandAnswerLostError
          ? `${err.message} Reload the page to see what is recorded.`
          : err instanceof Error
            ? err.message
            : 'The command could not be sent.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (reading.state === 'current') {
    const c: TestingClosure = reading.closure;
    return (
      <div data-testing-closure="closed" className="mt-4">
        <CcMessageStrip
          state="information"
          headline={CLOSED_NOT_VERIFIED}
          actions={
            isOwner ? (
              <CcButton
                variant="secondary"
                density="cozy"
                disabled={busy}
                onClick={() => void send({ command: 'reopen-testing' })}
                data-testing-reopen=""
              >
                Reopen testing
              </CcButton>
            ) : undefined
          }
        >
          <span className="flex flex-col gap-2">
            <span data-testing-closure-sentence="">{closureSentence(c)}</span>
            <span>
              What was on record: {c.basis.line} Nothing here verified the code — the phase reads “not verified”, and a new run
              reopens it.
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <CcProvenanceChip value="confirmed" note="closed by you · not verified" />
              <span className="cc-text-meta text-cc-ink-muted">
                <CcDateText value={c.at} format="datetime" />
              </span>
            </span>
          </span>
        </CcMessageStrip>
        {error ? (
          <p role="alert" data-testing-closure-error="" className="m-0 mt-2 cc-text-cell font-semibold text-cc-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const before =
    reading.state === 'superseded'
      ? 'Testing was closed earlier; a run recorded since opened it again.'
      : reading.state === 'earlier'
        ? 'Testing was closed earlier for another code, suite or analysis run; that closure no longer applies.'
        : null;

  if (!basis.ok) {
    return before ? (
      <p data-testing-closure="before" className="m-0 mt-4 cc-text-cell text-cc-ink-muted">
        {before}
      </p>
    ) : null;
  }

  if (!isOwner) {
    return (
      <p data-testing-closure="reader" className="m-0 mt-4 cc-text-cell text-cc-ink-muted">
        {basis.basis.line} The project owner can close testing without a passing run, with a reason.
      </p>
    );
  }

  const options = reasonsFor(basis.basis.kind).map((r) => ({ value: r, label: CLOSURE_REASON_LABELS[r] }));
  const noteRequired = reason === 'other';
  const canSend = !!reason && (!noteRequired || note.trim().length > 0) && !busy;

  return (
    <section
      data-testing-closure="open"
      aria-labelledby="testing-closure-title"
      className="mt-5 border-t border-cc-line pt-4"
    >
      <h3 id="testing-closure-title" className="m-0 cc-text-h3 text-cc-ink">
        Close testing without a passing run
      </h3>
      <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
        If the run cannot pass here, end testing with a reason. It is recorded as your statement, with your account and the
        time: testing then reads “{CLOSED_NOT_VERIFIED}” — never passed — and the project moves on to Delivery, whose handover
        names it. A new run, or “Reopen testing”, opens it again.
      </p>
      {before ? <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">{before}</p> : null}
      <p data-testing-closure-basis={basis.basis.kind} className="m-0 mt-3 cc-text-cell text-cc-ink">
        What is on record: {basis.basis.line}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <CcRadioGroup
          legend="Why testing ends here"
          options={options}
          value={reason}
          onChange={setReason}
          required
          name="testing-closure-reason"
        />
        <CcTextarea
          label={noteRequired ? 'Your reason' : 'Note (optional)'}
          value={note}
          onChange={setNote}
          rows={2}
          maxLength={MAX_CLOSURE_NOTE_CHARS}
          required={noteRequired}
          help="Kept with the closure and carried in the audit pack as your statement."
          name="testing-closure-note"
        />
        <div className="flex flex-wrap items-center gap-3">
          <CcButton
            variant="secondary"
            density="cozy"
            disabled={!canSend}
            data-testing-close=""
            onClick={() =>
              reason &&
              void send({
                command: 'close-testing',
                reason,
                ...(note.trim() ? { note: note.trim() } : {}),
                expectedSubject: basis.subjectKey,
              })
            }
          >
            {busy ? 'Recording…' : 'Close testing — not verified'}
          </CcButton>
          <CcProvenanceChip value="confirmed" note="your statement · not a test result" />
        </div>
        {error ? (
          <p role="alert" data-testing-closure-error="" className="m-0 cc-text-cell font-semibold text-cc-error">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
