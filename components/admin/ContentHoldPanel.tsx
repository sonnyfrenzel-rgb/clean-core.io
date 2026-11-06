'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';

/**
 * Reported illegal content — block, record, then delete or release (legal
 * texts Fassung 1.1; `lib/content-hold.ts`, `/api/admin/content-holds`).
 *
 * The console shows ids, dates and the evidence log only. There is no button
 * that opens, shows, copies or exports held content — for a suspected depiction
 * of child sexual abuse that is the promise (/report, privacy policy section 8),
 * and for every other report the review is made from the report and the place
 * it names, not from a copy here.
 */
interface Row {
  id: string;
  projectId: string;
  ownerUid: string;
  status: 'blocked' | 'released' | 'deleted';
  criminalSuspicion: boolean;
  csamSuspicion: boolean;
  blockedAt: string;
  documentCount: number;
  policeInformedAt: string | null;
  authorityDecision: { outcome: string; at: string } | null;
  extendedUntil: string | null;
  releasedAt: string | null;
  deletedAt: string | null;
  retainUntil: string | null;
  due: boolean;
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

async function call(method: 'GET' | 'POST', body?: unknown): Promise<any> {
  const token = await getAuth().currentUser?.getIdToken();
  const res = await fetch('/api/admin/content-holds', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The server answered HTTP ${res.status}.`);
  return data;
}

export default function ContentHoldPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [projectId, setProjectId] = useState('');
  const [criminal, setCriminal] = useState(true);
  const [csam, setCsam] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ state: 'success' | 'error'; text: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows(((await call('GET')) as { holds: Row[] }).holds ?? []);
    } catch (err) {
      setResult({ state: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setResult(null);
    try {
      await call('POST', body);
      setResult({ state: 'success', text: done });
      await reload();
    } catch (err) {
      setResult({ state: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc" data-content-hold-panel="">
      <CcCard title="Reported illegal content — blocked and retained">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink-muted">
            Blocking moves the whole project, unchanged, out of everyone&apos;s reach — the owner&apos;s included — and the owner cannot delete it while it is held.
            Nothing here shows or exports the content. With a suspected offence: record the day the police were informed; delete once the authority has decided or 90 days
            have passed (longer only if the authority asks). Without suspicion: release or delete after the decision.
          </p>
          <CcField label="Project id to block">
            {(c) => (
              <input id={c.id} aria-describedby={c.describedBy} value={projectId} onChange={(e) => setProjectId(e.target.value)} autoComplete="off" className={`${c.className} font-mono`} />
            )}
          </CcField>
          <label className="flex items-center gap-2 text-[13px] text-cc-ink">
            <input type="checkbox" checked={criminal || csam} disabled={csam} onChange={(e) => setCriminal(e.target.checked)} /> Suspected criminal offence
          </label>
          <label className="flex items-center gap-2 text-[13px] text-cc-ink">
            <input type="checkbox" checked={csam} onChange={(e) => setCsam(e.target.checked)} /> Suspected depiction of child sexual abuse (do not open the content)
          </label>
          <div>
            <CcButton
              variant="ghost"
              tone="danger"
              busy={busy}
              disabled={busy || !projectId.trim()}
              onClick={() => void act({ action: 'block', projectId: projectId.trim(), criminalSuspicion: criminal || csam, csamSuspicion: csam }, 'Blocked. The account sees that the project is blocked.')}
            >
              Block the project
            </CcButton>
          </div>
          <CcField label="Date for the next record (YYYY-MM-DD; empty = today)">
            {(c) => <input id={c.id} aria-describedby={c.describedBy} value={dateInput} onChange={(e) => setDateInput(e.target.value)} autoComplete="off" className={`${c.className} font-mono`} />}
          </CcField>
          {result ? (
            <CcMessageStrip state={result.state} announce>
              {result.text}
            </CcMessageStrip>
          ) : null}
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {rows.map((r) => (
              <li key={r.id} className="rounded-cc-card border border-cc-line p-3 text-[12px] text-cc-ink" data-content-hold={r.id}>
                <p className="m-0 font-mono">
                  hold {r.id} · project {r.projectId} · account {r.ownerUid} · {r.documentCount} documents
                </p>
                <p className="m-0">
                  {r.status}
                  {r.csamSuspicion ? ' · CSAM suspicion' : r.criminalSuspicion ? ' · criminal suspicion' : ' · no suspicion'} · blocked {day(r.blockedAt)} · police informed{' '}
                  {day(r.policeInformedAt)} · authority {r.authorityDecision ? `${r.authorityDecision.outcome} ${day(r.authorityDecision.at)}` : '—'} · keep until {day(r.retainUntil)}
                  {r.releasedAt ? ` · released ${day(r.releasedAt)}` : ''}
                  {r.deletedAt ? ` · deleted ${day(r.deletedAt)}` : ''}
                </p>
                {r.due ? (
                  <CcMessageStrip state="warning">Due: delete the held content now.</CcMessageStrip>
                ) : null}
                {r.status === 'blocked' ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.criminalSuspicion && !r.policeInformedAt ? (
                      <CcButton density="compact" disabled={busy} onClick={() => void act({ action: 'police-informed', holdId: r.id, at: dateInput || undefined }, 'Recorded: police informed.')}>
                        Police informed
                      </CcButton>
                    ) : null}
                    {r.policeInformedAt && !r.authorityDecision ? (
                      <>
                        <CcButton density="compact" disabled={busy} onClick={() => void act({ action: 'authority-decision', holdId: r.id, outcome: 'secured', at: dateInput || undefined }, 'Recorded: authority secured it.')}>
                          Authority secured it
                        </CcButton>
                        <CcButton density="compact" disabled={busy} onClick={() => void act({ action: 'authority-decision', holdId: r.id, outcome: 'not-needed', at: dateInput || undefined }, 'Recorded: authority does not need it.')}>
                          Authority does not need it
                        </CcButton>
                        <CcButton density="compact" disabled={busy || !dateInput} onClick={() => void act({ action: 'extend', holdId: r.id, until: dateInput }, 'Recorded: kept longer at the authority’s request.')}>
                          Keep until the date above (authority’s request)
                        </CcButton>
                      </>
                    ) : null}
                    {!r.criminalSuspicion ? (
                      <CcButton density="compact" disabled={busy} onClick={() => void act({ action: 'release', holdId: r.id }, 'Released: the project is back with its account.')}>
                        Release
                      </CcButton>
                    ) : null}
                    <CcButton density="compact" variant="ghost" tone="danger" disabled={busy} onClick={() => void act({ action: 'delete', holdId: r.id }, 'Deleted. The record of the block stays, without content.')}>
                      Delete the content
                    </CcButton>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </CcCard>
    </div>
  );
}
