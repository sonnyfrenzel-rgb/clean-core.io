'use client';

import React, { useId, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import CcButton from '@/components/cc/Button';
import CcCheckbox from '@/components/cc/Checkbox';
import CcDateText from '@/components/cc/DateText';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTextarea from '@/components/cc/Textarea';
import { MAX_NOTE_CHARS, MAX_SYSTEM_CHARS, isoDay } from '@/lib/sap-test-results';
import {
  keyUserAcceptanceLine,
  keyUserCheckIds,
  type KeyUserAcceptanceReading,
  type KeyUserAcceptanceSummary,
} from '@/lib/key-user-acceptance';
import type { KeyUserStepList } from '@/lib/key-user-steps';

/**
 * "Record the checks as run in your system" — the Testing stage's card for a
 * key-user decision (roadmap 3.0.19, owner decision 19.10.2026). Nothing here
 * runs the acceptance checks; the account states it ran them, per check or all
 * of them, with the system and the date — recorded on the server with the
 * account and the time as *Confirmed · self-declaration*, never as proven, the
 * way the ABAP Unit class's result is confirmed (`SapResultCard`).
 *
 * Every text from the form is rendered as React text. Both actions are buttons.
 */

const LABEL = 'cc-text-label text-cc-ink-muted';

type Props = {
  projectId: string;
  list: KeyUserStepList;
  /** Only the owner records; an invited reader sees what is on record. */
  canRecord: boolean;
  reading: KeyUserAcceptanceReading;
  /** Called with the stored summary after a successful confirmation. */
  onRecorded: (summary: KeyUserAcceptanceSummary) => void;
};

async function post(projectId: string, body: Record<string, unknown>): Promise<{ summary?: KeyUserAcceptanceSummary; error?: string }> {
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) return { error: 'You are signed out. Sign in again and retry.' };
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/key-user-checks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { summary?: KeyUserAcceptanceSummary; error?: string } | null;
  if (!res.ok || !json?.summary) return { error: json?.error || 'The checks could not be recorded. Try again.' };
  return { summary: json.summary };
}

export default function KeyUserChecksRecord({ projectId, list, canRecord, reading, onRecorded }: Props) {
  const all = keyUserCheckIds(list);
  const current = reading.state === 'current' ? reading : null;
  const recorded = new Set(current ? current.summary.checkIds : []);
  const open = all.filter((id) => !recorded.has(id));
  const [selected, setSelected] = useState<string[]>([]);
  const [system, setSystem] = useState('');
  const [ranOn, setRanOn] = useState(() => isoDay(new Date()));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const formId = useId();

  const submit = async (checks: 'all' | string[]) => {
    setError('');
    if (Array.isArray(checks) && checks.length === 0) {
      setError('Tick the checks you ran, or record all of them.');
      return;
    }
    setBusy(true);
    try {
      const out = await post(projectId, { checks, system, ranOn, note: note.trim() || null });
      if (out.summary) {
        onRecorded(out.summary);
        setSelected([]);
      } else setError(out.error ?? 'The checks could not be recorded.');
    } catch {
      setError('The confirmation could not be sent. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby={`${formId}-title`}
      data-key-user-checks-record={current ? (current.complete ? 'complete' : 'partial') : reading.state}
      className="mb-6 flex min-w-0 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc md:p-5"
    >
      <h2 id={`${formId}-title`} className="m-0 cc-text-h2 text-cc-ink">Record the checks as run in your system</h2>
      {current ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3" data-key-user-checks-current="">
          <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
            <CcProvenanceChip value="confirmed" note="by you · self-declaration" />
            <span>{keyUserAcceptanceLine(current.summary)}</span>
          </p>
          <p className="m-0 cc-text-cell text-cc-ink">
            {current.complete
              ? 'Every acceptance check is recorded as run: Testing is done for this key-user decision. It is not run here, so it is never shown as proven.'
              : `Open: ${open.join(', ')}. Testing is done once every check is recorded.`}
          </p>
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className={LABEL}>System</dt>
              <dd className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">{current.summary.system}</dd>
            </div>
            <div className="min-w-0">
              <dt className={LABEL}>Run on</dt>
              <dd className="m-0 cc-text-cell text-cc-ink">{current.summary.ranOn}</dd>
            </div>
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
        </div>
      ) : reading.state === 'earlier' ? (
        <CcMessageStrip state="warning" headline={reading.because === 'list' ? 'Checks are on record for an earlier step list' : 'Checks are on record for an earlier run'}>
          They were recorded <CcDateText value={reading.summary.recordedAt} format="datetime" />{' '}
          {reading.because === 'list' ? 'for checks that read differently from the ones below' : 'for another run or source'}, so they no longer count. Run the checks of this step list and record them again.
        </CcMessageStrip>
      ) : (
        <p className="m-0 cc-text-cell text-cc-ink-muted" data-key-user-checks-none="">
          No acceptance check is recorded as run yet.
        </p>
      )}

      {canRecord && open.length > 0 ? (
        <form
          data-key-user-checks-form=""
          onSubmit={(e) => {
            e.preventDefault();
            void submit(selected);
          }}
          className="flex min-w-0 flex-col gap-3 rounded-cc-row border border-cc-line p-3"
        >
          <p className="m-0 cc-text-cell text-cc-ink">
            You state that a key user ran these checks in your system once the steps were configured. It is recorded with your account and the time as{' '}
            <CcProvenanceChip value="confirmed" note="by you · self-declaration" /> — never as proven.
          </p>
          <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
            <legend className={LABEL}>Checks run</legend>
            {open.map((id) => (
              <CcCheckbox
                key={id}
                label={id}
                checked={selected.includes(id)}
                onChange={(on) => setSelected((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)))}
                data-key-user-check-select={id}
              />
            ))}
          </fieldset>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  data-key-user-checks-system=""
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
                  data-key-user-checks-ran-on=""
                />
              )}
            </CcField>
          </div>
          <CcTextarea label="Note (optional)" value={note} onChange={setNote} rows={2} maxLength={MAX_NOTE_CHARS} />
          <div className="flex flex-wrap items-center gap-2">
            <CcButton type="submit" variant="secondary" disabled={busy} busy={busy} data-key-user-checks-record-selected="">
              Record the ticked checks as run
            </CcButton>
            <CcButton variant="primary" disabled={busy} onClick={() => void submit('all')} data-key-user-checks-record-all="">
              I ran all {all.length} in my system — record them
            </CcButton>
          </div>
        </form>
      ) : !canRecord ? (
        <p className="m-0 cc-text-meta text-cc-ink-muted">Only the project{'’'}s owner records the checks.</p>
      ) : null}

      {error ? (
        <div data-key-user-checks-error="" role="alert">
          <CcMessageStrip state="error">{error}</CcMessageStrip>
        </div>
      ) : null}
    </section>
  );
}
