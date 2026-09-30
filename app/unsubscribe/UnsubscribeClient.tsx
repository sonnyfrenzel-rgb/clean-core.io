'use client';

import { useEffect, useRef, useState } from 'react';
import { CONTACT_EMAIL } from '@/lib/constants';

type State = 'reading' | 'idle' | 'working' | 'done' | 'error';

/**
 * The token from the address, and the address without it.
 *
 * A mail sent since 30.09.2026 carries it in the fragment (`#t=…`), which the
 * browser never sends to the server. A mail sent before that carries it in the
 * query (`?t=…`); those links must keep working, so the query is read too — and
 * in both cases the token is taken out of the address bar and the history entry
 * at once, so it is not left in the browser history, a bookmark or a copied URL
 * (QA finding 8e25777f1339).
 */
function takeTokenFromAddress(): string {
  const { hash, search, pathname } = window.location;
  const fromHash = new URLSearchParams(hash.replace(/^#/, '')).get('t') || '';
  const query = new URLSearchParams(search);
  const fromQuery = query.get('t') || '';
  if (fromHash || fromQuery) {
    query.delete('t');
    const rest = query.toString();
    window.history.replaceState(window.history.state, '', `${pathname}${rest ? `?${rest}` : ''}`);
  }
  return fromHash || fromQuery;
}

/**
 * The human-facing half of the unsubscribe flow.
 *
 * The opt-out happens on POST, never on the GET that renders this page — link
 * scanners, corporate mail gateways and browser prefetchers all follow GETs, and
 * any of them silently unsubscribing a reader would be worse than no link at all.
 */
export default function UnsubscribeClient() {
  const [token, setToken] = useState('');
  const [state, setState] = useState<State>('reading');
  const [message, setMessage] = useState('');

  // Read once per mount. The read also strips the token from the address, so
  // a second run of the effect — React runs it twice in development — would
  // find nothing and report a broken link; the ref keeps the first answer.
  const taken = useRef<string | null>(null);

  useEffect(() => {
    if (taken.current === null) taken.current = takeTokenFromAddress();
    const t = taken.current;
    setToken(t);
    if (t) {
      setState('idle');
    } else {
      setState('error');
      setMessage('This link is incomplete. Please use the link from the email, or write to us.');
    }
  }, []);

  const confirm = async () => {
    setState('working');
    try {
      // The token travels in the body, not in the query. It used to be a
      // `?t=…` on this POST as well, which put it into the browser history and
      // into every Cloud Run access-log line — a token that is still valid and
      // still unsubscribes the address it is bound to. The visible link in the
      // mail carries it in the fragment for the same reason; only the RFC 8058
      // one-click URL in the header keeps it in the query, because providers
      // POST there without a body.
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
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-black text-green-900 mb-2">You are unsubscribed</h2>
        <p className="text-sm text-green-900/80 leading-relaxed">
          You will not receive further community updates or surveys from Clean-Core.io, and the
          community-mail consent in your account settings is switched off. Messages about your own
          account — approvals, security notices — still reach you, because they are part of the service
          itself.
        </p>
        <p className="text-sm text-green-900/80 leading-relaxed mt-3">
          Changed your mind, or landed here by accident? Switch community mail back on in your account
          settings, or write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold underline">
            {CONTACT_EMAIL}
          </a>
          .
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
        disabled={state === 'working' || state === 'reading'}
        className="inline-flex items-center justify-center bg-gray-950 hover:bg-gray-800 disabled:opacity-60 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
      >
        {state === 'working' ? 'Unsubscribing…' : 'Confirm unsubscribe'}
      </button>
    </div>
  );
}
