'use client';

import { useState } from 'react';
import { CONTACT_EMAIL } from '@/lib/constants';

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
      const res = await fetch(`/api/unsubscribe?t=${encodeURIComponent(token)}`, { method: 'POST' });
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
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-black text-green-900 mb-2">You are unsubscribed</h2>
        <p className="text-sm text-green-900/80 leading-relaxed">
          You will not receive further community updates from Clean-Core.io. Messages about your own
          account — approvals, security notices — still reach you, because they are part of the service
          itself.
        </p>
        <p className="text-sm text-green-900/80 leading-relaxed mt-3">
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
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-black text-amber-900 mb-2">That did not work</h2>
        <p className="text-sm text-amber-900/80 leading-relaxed">{message}</p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Unsubscribe`}
          className="inline-block mt-4 bg-amber-900 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider"
        >
          Write to {CONTACT_EMAIL}
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-sm text-gray-600 leading-relaxed mb-5">
        Confirm below and we will stop sending you community updates. Messages about your own account
        are unaffected.
      </p>
      <button
        onClick={confirm}
        disabled={state === 'working'}
        className="inline-flex items-center justify-center bg-gray-950 hover:bg-gray-800 disabled:opacity-60 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
      >
        {state === 'working' ? 'Unsubscribing…' : 'Confirm unsubscribe'}
      </button>
    </div>
  );
}
