'use client';

import { useState } from 'react';
import Link from 'next/link';
import { applyActionCode } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import { CONTACT_EMAIL } from '@/lib/constants';

type State = 'ready' | 'working' | 'done' | 'error';

/** What a failed code means to the reader, by Firebase error code. */
function explain(code: string): string {
  switch (code) {
    case 'auth/expired-action-code':
      return 'This confirmation link has expired. Open the invitation link again while signed in, and we will send you a fresh one.';
    case 'auth/invalid-action-code':
      return 'This link has already been used or is no longer valid. If you confirmed your address a moment ago, that worked — sign in again and open the invitation link. Otherwise open the invitation link again and we will send you a new confirmation.';
    case 'auth/user-disabled':
      return 'The account for this address is disabled, so the address cannot be confirmed. Write to us if you think this is a mistake.';
    case 'auth/user-not-found':
      return 'There is no longer an account for this address, so there is nothing to confirm.';
    case 'auth/network-request-failed':
      return 'The confirmation service could not be reached. Check your connection and try again.';
    default:
      return 'The address could not be confirmed. Please try again, or write to us.';
  }
}

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
}

/**
 * Redeems the one-time code of an address-confirmation mail.
 *
 * The code is applied on a click, never on page load: mail gateways and link
 * scanners open links, some of them run the page, and a code they redeem is
 * gone for the reader, who would then see "already used" for a step they never
 * took. Loading the page does nothing with the code at all.
 */
export default function AuthActionClient({ mode, oobCode }: { mode: string; oobCode: string }) {
  const valid = mode === 'verifyEmail' && oobCode.length > 0;
  const [state, setState] = useState<State>(valid ? 'ready' : 'error');
  const [message, setMessage] = useState(
    valid
      ? ''
      : mode && mode !== 'verifyEmail'
        ? 'This page only confirms email addresses, and this link is for something else. Please use the link from the email, or write to us.'
        : 'This link is incomplete. Please use the button in the email, or write to us.',
  );

  const confirm = async () => {
    setState('working');
    const auth = getAuth();
    try {
      await applyActionCode(auth, oobCode);
    } catch (err) {
      setState('error');
      setMessage(explain(errorCode(err)));
      return;
    }
    // Signed in in this browser? Then refresh the session, so the confirmed
    // address counts at once instead of after the next sign-in. Best effort:
    // the address is confirmed either way.
    try {
      if (auth.currentUser) {
        await auth.currentUser.reload();
        await auth.currentUser.getIdToken(true);
      }
    } catch {
      /* the confirmation itself succeeded */
    }
    setState('done');
  };

  if (state === 'done') {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6" role="status">
        <h2 className="text-lg font-black text-green-900 mb-2">Your address is confirmed</h2>
        <p className="text-sm text-green-900/80 leading-relaxed">
          Clean-Core.io now knows this mailbox is yours. Nothing else about your account changed.
        </p>
        <p className="text-sm text-green-900/80 leading-relaxed mt-3">
          Next: sign in (again, if you were signed in before) and open the invitation link from the other email.
        </p>
        <Link
          href="/?auth=signin"
          className="inline-block mt-4 bg-gray-950 hover:bg-gray-800 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6" role="alert">
        <h2 className="text-lg font-black text-amber-900 mb-2">The address was not confirmed</h2>
        <p className="text-sm text-amber-900/80 leading-relaxed">{message}</p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Email%20confirmation`}
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
        Confirm below that this mailbox belongs to you. This is needed once, before an invitation to read a project
        can open. Nothing is shared with anyone by this step.
      </p>
      <button
        type="button"
        onClick={confirm}
        disabled={state !== 'ready'}
        className="inline-flex items-center justify-center bg-gray-950 hover:bg-gray-800 disabled:opacity-60 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
      >
        {state === 'working' ? 'Confirming…' : 'Confirm my address'}
      </button>
    </div>
  );
}
