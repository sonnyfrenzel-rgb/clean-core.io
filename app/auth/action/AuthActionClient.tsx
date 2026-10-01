'use client';

import { useState } from 'react';
import Link from 'next/link';
import { applyActionCode } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import { CONTACT_EMAIL } from '@/lib/constants';
import { publicButton } from '@/components/landing/public-button';

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
      <div className="rounded-2xl border border-cc-success-border bg-cc-success-bg p-6" role="status">
        <h2 className="text-lg font-bold text-cc-success mb-2">Your address is confirmed</h2>
        <p className="text-sm text-cc-ink leading-relaxed">
          Clean-Core.io now knows this mailbox is yours. Nothing else about your account changed.
        </p>
        <p className="text-sm text-cc-ink leading-relaxed mt-3">
          Next: sign in (again, if you were signed in before) and open the invitation link from the other email.
        </p>
        <Link
          href="/?auth=signin"
          className={`${publicButton('primary', 'sm')} mt-4`}
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="rounded-2xl border border-cc-warning-border bg-cc-warning-bg p-6" role="alert">
        <h2 className="text-lg font-bold text-cc-warning mb-2">The address was not confirmed</h2>
        <p className="text-sm text-cc-ink leading-relaxed">{message}</p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Email%20confirmation`}
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
        Confirm below that this mailbox belongs to you. This is needed once, before an invitation to read a project
        can open. Nothing is shared with anyone by this step.
      </p>
      <button
        type="button"
        onClick={confirm}
        disabled={state !== 'ready'}
        className={`${publicButton('primary')} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {state === 'working' ? 'Confirming…' : 'Confirm my address'}
      </button>
    </div>
  );
}
