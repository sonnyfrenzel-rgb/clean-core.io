'use client';

import { useState } from 'react';
import { CONTACT_EMAIL } from '@/lib/constants';
import { publicButton } from '@/components/landing/public-button';

type State = 'idle' | 'working' | 'done' | 'error';

/**
 * The human-facing half of the unsubscribe flow.
 *
 * The opt-out happens on POST, never on the GET that renders this page — link
 * scanners, corporate mail gateways and browser prefetchers all follow GETs, and
 * any of them silently unsubscribing a reader would be worse than no link at all.
 */
export default function UnsubscribeClient({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? 'idle' : 'error');
  const [message, setMessage] = useState(
    token ? '' : 'This link is incomplete. Please use the link from the email, or write to us.',
  );

  const confirm = async () => {
    setState('working');
    try {
      // The token travels in the body, not in the query. It used to be a
      // `?t=…` on this POST as well, which put it into the browser history and
      // into every Cloud Run access-log line — a token that is still valid and
      // still unsubscribes the address it is bound to. The GET link in the mail
      // keeps its `?t=…`, because that is what a link is; this request is one
      // the page makes itself and has no such excuse.
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: token }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        setState('done');
      } else {
        setState('error');
        setMessage('We could not process this link. Please write to us and we will remove you by hand.');
      }
    } catch {
      setState('error');
      setMessage('The request did not go through. Please try again, or write to us.');
    }
  };

  if (state === 'done') {
    return (
      <div className="rounded-2xl border border-cc-success-border bg-cc-success-bg p-6">
        <h2 className="text-lg font-bold text-cc-success mb-2">You are unsubscribed</h2>
        <p className="text-sm text-cc-ink leading-relaxed">
          You will not receive further community updates from Clean-Core.io. Messages about your own
          account — approvals, security notices — still reach you, because they are part of the service
          itself.
        </p>
        <p className="text-sm text-cc-ink leading-relaxed mt-3">
          Changed your mind, or landed here by accident? Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold underline">
            {CONTACT_EMAIL}
          </a>{' '}
          and we will put you back on the list.
        </p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-2xl border border-cc-warning-border bg-cc-warning-bg p-6">
        <h2 className="text-lg font-bold text-cc-warning mb-2">That did not work</h2>
        <p className="text-sm text-cc-ink leading-relaxed">{message}</p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Unsubscribe`}
          className={`${publicButton('primary', 'sm')} mt-4`}
        >
          Write to {CONTACT_EMAIL}
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-cc-line bg-cc-surface p-6">
      <p className="text-sm text-cc-ink-muted leading-relaxed mb-5">
        Confirm below and we will stop sending you community updates. Messages about your own account
        are unaffected.
      </p>
      <button
        type="button"
        onClick={confirm}
        disabled={state === 'working'}
        className={`${publicButton('primary')} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {state === 'working' ? 'Unsubscribing…' : 'Confirm unsubscribe'}
      </button>
    </div>
  );
}
