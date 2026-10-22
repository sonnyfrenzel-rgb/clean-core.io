'use client';

import React, { useState } from 'react';
import { getAuth } from '@/lib/firebase';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';

/**
 * Ending an Additional Agreement on Own Model Keys in text form (roadmap
 * 3.0.21; the agreement's clause 11, legal review E24). An account may end it
 * by writing to the operator, also without access to its second factor. The
 * operator then, for that account id:
 *
 *   1. **Block the key** — from now on no call goes out on it, and none on the
 *      platform key instead (`own-key-blocked`);
 *   2. **Delete the key** — the agreement ends; the account gets the
 *      confirmation by e-mail, and the proof log records "text form".
 *
 * Same gate as every action of this console: the admin claim and a fresh
 * step-up (`/api/admin/console-action`).
 */
type Action = 'block-own-key' | 'end-byok-agreement';

const DONE: Record<Action, string> = {
  'block-own-key': 'The key is blocked: no call goes out on it until it is deleted.',
  'end-byok-agreement': 'The key is deleted and the agreement ended; the account was sent the confirmation.',
};

export default function ByokEndingPanel() {
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<{ state: 'success' | 'error'; text: string } | null>(null);

  const run = async (action: Action) => {
    const target = uid.trim();
    if (!target) return;
    setBusy(action);
    setResult(null);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch('/api/admin/console-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ uid: target, action }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setResult(res.ok ? { state: 'success', text: DONE[action] } : { state: 'error', text: body.error || `The server answered HTTP ${res.status}.` });
    } catch {
      setResult({ state: 'error', text: 'The request could not be sent.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="cc" data-byok-ending-panel="">
      <CcCard title="Own model key — agreement ended in text form">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink-muted">
            When an account ends the Additional Agreement on Own Model Keys by writing to us: block its key first, then delete it.
          </p>
          <CcField label="Account id">
            {(control) => (
              <input
                id={control.id}
                aria-describedby={control.describedBy}
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                autoComplete="off"
                className={`${control.className} font-mono`}
              />
            )}
          </CcField>
          <div className="flex flex-wrap gap-2">
            <CcButton variant="secondary" busy={busy === 'block-own-key'} disabled={!uid.trim() || busy !== null} onClick={() => void run('block-own-key')}>
              Block the key
            </CcButton>
            <CcButton variant="ghost" tone="danger" busy={busy === 'end-byok-agreement'} disabled={!uid.trim() || busy !== null} onClick={() => void run('end-byok-agreement')}>
              Delete the key and end the agreement
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
