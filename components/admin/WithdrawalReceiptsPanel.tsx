'use client';

import React, { useState } from 'react';
import { getAuth } from '@/lib/firebase';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcMessageStrip from '@/components/cc/MessageStrip';

/**
 * Withdrawal receipts that could not be sent (legal review 06.11.2026, B8).
 *
 * A withdrawal is effective on submission and the account is blocked at once;
 * a receipt that did not go out waits in a queue (`lib/withdrawal-queue.ts`).
 * There is no scheduler that can work it, so it is tried again when the account
 * signs in, and here: one click tries every pending receipt now. A receipt that
 * goes out ends in the deletion of that account; past the seventh day after the
 * declaration the account is deleted without one, with a note in the proof log.
 *
 * Counts only — never an address. Same gate as every action of this console:
 * the admin claim and a fresh step-up (`/api/admin/console-action`).
 */
type Counts = { 'sent-and-erased': number; 'retry-later': number; 'expired-and-erased': number; failed: number; pending: number };

export default function WithdrawalReceiptsPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ state: 'success' | 'error'; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/admin/console-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'withdrawal-receipts' }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; counts?: Counts };
      if (!res.ok || !body.counts) {
        setResult({ state: 'error', text: body.error || `The server answered HTTP ${res.status}.` });
        return;
      }
      const c = body.counts;
      setResult({
        state: 'success',
        text: `Sent and deleted: ${c['sent-and-erased']}. Deleted after seven days without a receipt: ${c['expired-and-erased']}. Still not sent: ${c['retry-later']}. Failed: ${c.failed}. Pending now: ${c.pending}.`,
      });
    } catch {
      setResult({ state: 'error', text: 'The request could not be sent.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc" data-withdrawal-receipts-panel="">
      <CcCard title="Withdrawal receipts not sent yet">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink-muted">
            A withdrawal whose receipt could not be sent is effective and its account blocked. Try the pending receipts again; each one that goes out deletes its account, and an account seven days past its declaration is deleted without one.
          </p>
          <div className="flex flex-wrap gap-2">
            <CcButton variant="secondary" busy={busy} disabled={busy} onClick={() => void run()} data-withdrawal-receipts-run="">
              Try pending receipts now
            </CcButton>
          </div>
          {result ? (
            <CcMessageStrip state={result.state} announce>
              {result.text}
            </CcMessageStrip>
          ) : null}
        </div>
      </CcCard>
    </div>
  );
}
