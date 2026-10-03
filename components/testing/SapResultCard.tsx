'use client';

import React, { useId, useRef, useState } from 'react';
import { CheckCircle2, Upload } from 'lucide-react';
import { getAuth } from '@/lib/firebase';
import CcButton from '@/components/cc/Button';
import CcDateText from '@/components/cc/DateText';
import CcDisclosure from '@/components/cc/Disclosure';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTextarea from '@/components/cc/Textarea';
import {
  MAX_NOTE_CHARS,
  MAX_SYSTEM_CHARS,
  isoDay,
  outsideChipNote,
  outsideCountsLine,
  outsideShortfall,
  type OutsideReading,
  type OutsideTestRecord,
} from '@/lib/sap-test-results';
import { MAX_RESULT_FILE_BYTES } from '@/lib/test-result-import';

/**
 * "Record the result from your SAP system" — the Testing stage's card for the
 * ABAP Cloud route (ADR-075, owner 03.10.2026). Nothing here runs ABAP Unit, so
 * the result comes in one of two ways, both the account's:
 *
 *   - **Upload the ABAP Unit result (JUnit XML)** — the file ADT or a CI job
 *     wrote. The server parses it, matches each test method to its scenario and
 *     stores the result; every row then wears *Imported · passed* or *failed*.
 *   - **Confirm without a file** — "I ran these in my SAP system", with the
 *     counts, the system and the date. *Confirmed by you · self-declaration*.
 *
 * Every text that came from the file or the form is rendered as React text,
 * never as markup. Both actions are buttons — reachable by tab and by tap —
 * and nothing is said only on hover.
 */

const LABEL = 'cc-text-label text-cc-ink-muted';

type Props = {
  projectId: string;
  /** Only the owner records; an invited reader sees what is on record. */
  canRecord: boolean;
  reading: OutsideReading;
  /** The full record from `test_results/current`, once read. */
  record: OutsideTestRecord | null;
  /** Called with the stored record after a successful import or confirmation. */
  onRecorded: (record: OutsideTestRecord) => void;
};

async function post(projectId: string, body: Record<string, unknown>): Promise<{ record?: OutsideTestRecord; error?: string }> {
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) return { error: 'You are signed out. Sign in again and retry.' };
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/test-results`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { record?: OutsideTestRecord; error?: string } | null;
  if (!res.ok || !json?.record) return { error: json?.error || 'The result could not be recorded. Try again.' };
  return { record: json.record };
}

export default function SapResultCard({ projectId, canRecord, reading, record, onRecorded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'import' | 'confirm' | null>(null);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [passed, setPassed] = useState('');
  const [failed, setFailed] = useState('0');
  const [system, setSystem] = useState('');
  const [ranOn, setRanOn] = useState(() => isoDay(new Date()));
  const [note, setNote] = useState('');
  const formId = useId();

  const current = reading.state === 'current' ? reading : null;
  const summary = reading.state === 'none' ? null : reading.summary;

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > MAX_RESULT_FILE_BYTES) {
      setError(`The file is larger than ${MAX_RESULT_FILE_BYTES / 1_000_000} MB. A result file of one test class is a few kilobytes — export the run of this class only.`);
      return;
    }
    setBusy('import');
    try {
      const xml = await file.text();
      const out = await post(projectId, { action: 'import', fileName: file.name, xml });
      if (out.record) onRecorded(out.record);
      else setError(out.error ?? 'The file could not be imported.');
    } catch {
      setError('The file could not be read here. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const onConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const p = Number(passed);
    const f = Number(failed);
    if (!Number.isInteger(p) || !Number.isInteger(f) || p < 0 || f < 0) {
      setError('The counts of passed and failed tests are whole numbers from 0.');
      return;
    }
    setBusy('confirm');
    try {
      const out = await post(projectId, { action: 'confirm', passed: p, failed: f, system, ranOn, note: note.trim() || null });
      if (out.record) {
        onRecorded(out.record);
        setShowConfirm(false);
      } else {
        setError(out.error ?? 'The confirmation could not be recorded.');
      }
    } catch {
      setError('The confirmation could not be sent. Check the connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const unmatched = record && current && record.recordedAt === current.summary.recordedAt ? record.unmatched : [];
  const unmatchedTotal = record && current && record.recordedAt === current.summary.recordedAt ? record.unmatchedTotal : 0;
  const recordNote = record && current && record.recordedAt === current.summary.recordedAt ? record.note : null;

  return (
    <div data-sap-result="" className="flex min-w-0 flex-col gap-4">
      {/* What is on record — first, because it is the answer to "did it pass?". */}
      {current ? (
        <div data-sap-result-current={current.summary.kind} data-sap-result-verifies={current.verifies ? 'yes' : 'no'} className="flex min-w-0 flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
          <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
            <CcProvenanceChip value={current.summary.kind} note={outsideChipNote(current.summary.kind)} />
            <span>{outsideCountsLine(current.summary)}</span>
          </p>
          {current.verifies ? (
            <p className="m-0 flex items-start gap-2 cc-text-cell text-cc-ink">
              <CheckCircle2 size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-information" />
              Counts for the handover: no failure, and every scenario has a passing result. It is not run here, so it is never shown as proven.
            </p>
          ) : (
            <p className="m-0 cc-text-cell text-cc-ink" data-sap-result-shortfall="">
              {outsideShortfall(current.summary)} The handover waits for a passing run.
            </p>
          )}
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {current.summary.file ? (
              <>
                <div className="min-w-0">
                  <dt className={LABEL}>File</dt>
                  <dd className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">{current.summary.file.name}</dd>
                </div>
                <div className="min-w-0">
                  <dt className={LABEL}>SHA-256</dt>
                  <dd className="m-0 font-cc-mono text-[12px] text-cc-ink [overflow-wrap:anywhere]">{current.summary.file.sha256}</dd>
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <dt className={LABEL}>System</dt>
                  <dd className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">{current.summary.system}</dd>
                </div>
                <div className="min-w-0">
                  <dt className={LABEL}>Run on</dt>
                  <dd className="m-0 cc-text-cell text-cc-ink">{current.summary.ranOn}</dd>
                </div>
              </>
            )}
            <div className="min-w-0">
              <dt className={LABEL}>Recorded by</dt>
              <dd className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">{current.summary.recordedBy}</dd>
            </div>
            <div className="min-w-0">
              <dt className={LABEL}>Recorded</dt>
              <dd className="m-0 cc-text-cell text-cc-ink">
                <CcDateText value={current.summary.recordedAt} format="datetime" />
              </dd>
            </div>
          </dl>
          {recordNote ? (
            <p className="m-0 cc-text-cell text-cc-ink-muted [overflow-wrap:anywhere]">
              <span className="font-semibold text-cc-ink">Note: </span>
              {recordNote}
            </p>
          ) : null}
          {current.summary.kind === 'imported' && unmatchedTotal > 0 ? (
            <div data-sap-result-unmatched="">
              <CcDisclosure title={`${unmatchedTotal} test ${unmatchedTotal === 1 ? 'method is' : 'methods are'} not one of the scenarios`} level={3}>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {unmatched.map((u, i) => (
                    <li key={i} className="cc-text-cell text-cc-ink [overflow-wrap:anywhere]">
                      <span className="font-cc-mono text-[12px]">{u.name}</span>
                      <span className="text-cc-ink-muted"> · {u.outcome}</span>
                    </li>
                  ))}
                  {unmatchedTotal > unmatched.length ? (
                    <li className="cc-text-meta text-cc-ink-muted">and {unmatchedTotal - unmatched.length} more, not listed</li>
                  ) : null}
                </ul>
              </CcDisclosure>
            </div>
          ) : null}
        </div>
      ) : summary ? (
        <div data-sap-result-earlier="">
          <CcMessageStrip state="warning" headline="A result is on record for an earlier version">
            It was recorded <CcDateText value={summary.recordedAt} format="datetime" /> for an earlier run, code, test class or
            scenario list, so it no longer counts. Run the current class and record it again.
          </CcMessageStrip>
        </div>
      ) : (
        <p data-sap-result-none="" className="m-0 cc-text-cell text-cc-ink-muted">
          No result from your SAP system is on record yet.
        </p>
      )}

      {canRecord ? (
        <>
          <div className="flex flex-col gap-2">
            <h3 className="m-0 cc-text-h3 text-cc-ink">How to get the file</h3>
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 cc-text-cell text-cc-ink">
              <li>Copy the test class into ADT, into the local test classes of the class it tests, and run ABAP Unit on your development system.</li>
              <li>
                From CI — abapGit CI, <span className="font-cc-mono text-[12px]">abap-ci</span> or SAP Piper{'’'}s{' '}
                <span className="font-cc-mono text-[12px]">abapEnvironmentRunAUnitTest</span> — take the JUnit XML the job writes. From ADT, the ABAP Unit
                service <span className="font-cc-mono text-[12px]">/sap/bc/adt/abapunit/testruns</span> answers with JUnit XML or its own run result; both are read.
              </li>
              <li>Upload it here. Each test method whose name carries a scenario ID (TC_01_…) gives that scenario its result.</li>
            </ol>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              className="sr-only"
              tabIndex={-1}
              aria-hidden={true}
              data-sap-result-file=""
              onChange={onFile}
            />
            <CcButton
              variant="primary"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              busy={busy === 'import'}
              icon={<Upload size={14} aria-hidden={true} />}
              data-sap-result-upload=""
            >
              {busy === 'import' ? 'Importing…' : 'Upload the ABAP Unit result (JUnit XML)'}
            </CcButton>
            <CcButton
              variant="secondary"
              onClick={() => setShowConfirm((v) => !v)}
              disabled={busy !== null}
              aria-expanded={showConfirm}
              aria-controls={showConfirm ? formId : undefined}
              data-sap-result-confirm-open=""
            >
              Confirm without a file
            </CcButton>
          </div>

          {showConfirm ? (
            <form id={formId} data-sap-result-confirm-form="" onSubmit={onConfirm} className="flex min-w-0 flex-col gap-3 rounded-cc-row border border-cc-line p-3">
              <p className="m-0 cc-text-cell text-cc-ink">
                You state that you ran the test class in your SAP system, and what came back. It is recorded with your account and the time as{' '}
                <CcProvenanceChip value="confirmed" note={outsideChipNote('confirmed')} /> — never as proven.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CcField label="Tests passed" required>
                  {(control) => (
                    <input
                      id={control.id}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      required
                      aria-required={control.ariaRequired}
                      aria-describedby={control.describedBy}
                      value={passed}
                      onChange={(e) => setPassed(e.target.value)}
                      className={control.className}
                      data-sap-result-passed=""
                    />
                  )}
                </CcField>
                <CcField label="Tests failed" required>
                  {(control) => (
                    <input
                      id={control.id}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      required
                      aria-required={control.ariaRequired}
                      aria-describedby={control.describedBy}
                      value={failed}
                      onChange={(e) => setFailed(e.target.value)}
                      className={control.className}
                      data-sap-result-failed=""
                    />
                  )}
                </CcField>
                <CcField label="System (SID / client)" required help="For example S4D / 100.">
                  {(control) => (
                    <input
                      id={control.id}
                      type="text"
                      required
                      maxLength={MAX_SYSTEM_CHARS}
                      aria-required={control.ariaRequired}
                      aria-describedby={control.describedBy}
                      value={system}
                      onChange={(e) => setSystem(e.target.value)}
                      className={control.className}
                      data-sap-result-system=""
                    />
                  )}
                </CcField>
                <CcField label="Date of the run" required>
                  {(control) => (
                    <input
                      id={control.id}
                      type="date"
                      required
                      aria-required={control.ariaRequired}
                      aria-describedby={control.describedBy}
                      value={ranOn}
                      onChange={(e) => setRanOn(e.target.value)}
                      className={control.className}
                      data-sap-result-ran-on=""
                    />
                  )}
                </CcField>
              </div>
              <CcTextarea label="Note (optional)" value={note} onChange={setNote} rows={2} maxLength={MAX_NOTE_CHARS} />
              <div className="flex flex-wrap items-center gap-2">
                <CcButton type="submit" variant="primary" disabled={busy !== null} busy={busy === 'confirm'} data-sap-result-confirm="">
                  I ran these in my SAP system — record it
                </CcButton>
                <CcButton variant="ghost" onClick={() => setShowConfirm(false)} disabled={busy !== null}>
                  Cancel
                </CcButton>
              </div>
            </form>
          ) : null}
        </>
      ) : (
        <p className="m-0 cc-text-meta text-cc-ink-muted">Only the project{'’'}s owner records a result.</p>
      )}

      {error ? (
        <div data-sap-result-error="" role="alert">
          <CcMessageStrip state="error">{error}</CcMessageStrip>
        </div>
      ) : null}
    </div>
  );
}
