'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { getAuth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { TERMS_VERSION, termsVersionInForce } from '@/lib/constants';

/**
 * Asking again when the Terms have changed — and the reason it has to exist.
 *
 * `assertAccountActive(..., { requireCurrentTerms: true })` refuses every
 * protected route when the profile's `termsVersionAccepted` is not the current
 * `TERMS_VERSION`: analysis, audit packs, invitations, the model routes. The
 * refusal says *"The Terms of Service have been updated. Please re-accept them
 * in the app to continue."*
 *
 * Until 18.09.2026 there was nowhere in the app to do that. `termsVersionAccepted`
 * appeared in exactly one component — the admin panel, read-only — and nothing
 * called `POST /api/consent`. Raising the version would therefore have locked
 * every account out of the product with a message naming a remedy that did not
 * exist. That is the same shape as the MFA lockout found the same morning: a
 * gate whose way out the interface never offered. One account suffered that one;
 * this would have been all of them.
 *
 * So the rule here is not "show a notice". It is: **wherever a gate can refuse
 * on account state, the screen that state reaches must carry the way out.**
 *
 * **Whether it blocks depends on whether declining is real.** § 10.3 of the Terms
 * lets somebody who declines an amendment carry on under the Terms they
 * accepted, so while their version is in force this dialogue asks and takes
 * "not now" for an answer — a blocking dialogue would contradict the clause it
 * is enforcing. Once the accepted version has been ended (removed from
 * `TERMS_VERSIONS_IN_FORCE` after § 10.3's 30 days' notice), the routes really
 * do refuse, and then it blocks: a dismissible notice would leave somebody in a
 * product whose every useful route answers 403, read as breakage — which is
 * exactly how the MFA lockout presented itself ("Failed to analyze the code").
 * Signing out is offered either way, because refusing has to be possible
 * without deleting the account.
 *
 * Consent is recorded server-side: the route derives the version, the e-mail and
 * the timestamp itself and writes an append-only record, so what is stored is
 * evidence rather than a claim the browser made. The profile listener in
 * `useUserProfile` is live, so this dialog disappears on its own once the record
 * lands — nothing here re-fetches.
 */
export default function TermsReacceptGate() {
  const { profile, loading } = useUserProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Declining is remembered for this browsing session only. It is a choice about
  // one amendment, not a setting, and the next sign-in asks again — which is what
  // § 10.1's notice regime expects.
  const [declined, setDeclined] = useState(false);
  const acceptRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const accepted = profile?.termsVersionAccepted ?? null;
  const needed = !loading && !!profile && accepted !== TERMS_VERSION;

  /**
   * Whether declining is a real option, or whether everything is shut anyway.
   *
   * § 10.3 lets somebody who declines an amendment carry on under the Terms they
   * accepted. While that is true, this dialogue must not block: it asks, and
   * "not now" leaves the product working. It only blocks once the accepted
   * version has left `TERMS_VERSIONS_IN_FORCE` — the operator ended it after the
   * 30 days' notice § 10.3 requires — because then the routes really do refuse
   * and a dismissible notice would leave somebody in a product that answers 403
   * everywhere, which is how the MFA lockout presented itself.
   *
   * An account with no accepted version at all is the legacy case the server
   * grandfathers; it is asked, not shut out.
   */
  const mayDecline = accepted === null || termsVersionInForce(accepted);

  /**
   * Focus goes in and stays in, and the page behind does not scroll.
   *
   * Setting initial focus is the easy half and was all this had at first (QA
   * review of 38e6f079a0ba). Without the trap, Tab walks out of a dialog that
   * blocks everything behind it, and a keyboard user ends up operating controls
   * that answer 403 — which is the failure this whole gate exists to prevent,
   * reproduced for the people least able to guess what happened.
   */
  useEffect(() => {
    // Only the blocking form takes focus and traps it. A banner that grabbed the
    // caret would be worse than the problem it reports.
    if (!needed || declined || mayDecline) return;
    acceptRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = [...root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
        .filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // Outside already — for instance because something else moved focus while
      // the dialog was opening — bring it back rather than letting Tab continue.
      if (!active || !root.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [needed, declined, mayDecline]);

  if (!needed || declined) return null;

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      const user = getAuth().currentUser;
      if (!user) {
        setError('Your session has expired. Sign in again and you will be asked once more.');
        return;
      }
      const res = await fetch('/api/consent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ termsVersion: TERMS_VERSION }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(String(body?.error || 'We could not record your acceptance. Try again in a moment.'));
        return;
      }
      // Nothing else to do: the profile listener sees the new version and this
      // dialog unmounts itself.
    } catch {
      setError('We could not record your acceptance just now. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Two shapes, because the two situations are not the same thing.
   *
   * While the accepted version is still in force (§ 10.3) the product works and
   * the person may decline, so this is a **banner**: it sits at the foot of the
   * page, it covers nothing, and it lets every click through (`pointer-events`
   * is off on the wrapper and back on for the card itself). An overlay here
   * would take the page hostage over a question the reader is allowed to answer
   * with "no" — and it did: it intercepted pointer events in nine unrelated
   * specs whose fixtures simply never set `termsVersionAccepted`, which is
   * precisely the legacy account the server grandfathers.
   *
   * Once the accepted version has been ended, the routes really do refuse, and
   * then it is a **modal**: full screen, focus trapped, Escape inert. Leaving
   * somebody loose in a product where everything answers 403 is how the MFA
   * lockout presented itself.
   */
  const blocking = !mayDecline;

  return (
    <div
      data-terms-gate
      data-terms-gate-mode={blocking ? 'blocking' : 'banner'}
      className={
        blocking
          ? 'fixed inset-0 z-[200] bg-gray-950/60 backdrop-blur-md flex items-center justify-center p-4'
          // In the page flow, not over it. A fixed banner still covers whatever
          // is beneath it — it intercepted clicks in five specs even after the
          // wrapper stopped taking pointer events — and a question somebody is
          // allowed to answer with "no" must not sit on top of their work.
          : 'max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6'
      }
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        // Escape is a decline, and only where declining is allowed.
        if (mayDecline) setDeclined(true);
        else e.preventDefault();
      }}
    >
      <div
        ref={dialogRef}
        role={blocking ? 'dialog' : 'region'}
        {...(blocking ? { 'aria-modal': true } : {})}
        aria-labelledby="terms-gate-title"
        className={
          blocking
            ? 'bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-gray-100 p-6 sm:p-8 max-h-[95vh] overflow-y-auto'
            : 'bg-white w-full rounded-3xl shadow-sm border border-amber-200 p-6'
        }
      >
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mb-5 border border-amber-200">
          <AlertTriangle className="w-7 h-7 text-amber-600" />
        </div>
        <h2 id="terms-gate-title" className="text-2xl font-black text-gray-950 tracking-tight mb-2">
          The Terms of Service have changed
        </h2>
        <p className="text-sm font-medium text-gray-600 leading-relaxed mb-5">
          {mayDecline
            ? 'You accepted an earlier version. Please read the current one and accept it. You do not have to: section 10.3 lets you carry on under the Terms you accepted, and nothing stops working if you decline.'
            : 'The version your account accepted is no longer in force, so the platform is closed to it. Please read the current Terms and accept them to carry on.'}
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-5 space-y-3 text-xs font-medium text-gray-600 leading-relaxed">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">What changed</p>
          <p>
            <strong className="text-gray-800">Do not upload personal data of third parties.</strong> ABAP carries it
            more often than people expect: a developer&apos;s user id, a name in a comment, a real customer number, a
            production record used as test data. Strip those before you upload. We do not offer a data processing
            agreement, so there is no contract under which we could process such data for you.
          </p>
          <p>
            <strong className="text-gray-800">You must be at least 18.</strong> Accepting these Terms is entering into
            a contract, and this is a tool for professional software work.
          </p>
          <p>
            The Privacy Policy was extended at the same time — server logs, concrete retention periods, and a German
            version that prevails if the two ever differ.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-6 text-sm font-bold">
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            data-terms-gate-link="terms"
            className="inline-flex items-center gap-1.5 text-green-700 hover:text-green-800 underline underline-offset-2"
          >
            Read the Terms <ExternalLink size={13} />
          </Link>
          <Link
            href="/datenschutz"
            target="_blank"
            rel="noopener noreferrer"
            data-terms-gate-link="privacy"
            className="inline-flex items-center gap-1.5 text-green-700 hover:text-green-800 underline underline-offset-2"
          >
            Read the Privacy Policy <ExternalLink size={13} />
          </Link>
        </div>

        {error && (
          <p data-terms-gate-error className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-2xl p-3 mb-4">
            {error}
          </p>
        )}

        <button
          ref={acceptRef}
          data-terms-gate-accept
          onClick={accept}
          disabled={busy}
          className="w-full bg-gray-950 hover:bg-gray-900 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          I have read and accept the Terms
        </button>
        {mayDecline && (
          <button
            data-terms-gate-decline
            onClick={() => setDeclined(true)}
            className="w-full mt-3 border border-gray-200 hover:border-gray-300 text-gray-700 hover:text-gray-950 py-3 rounded-2xl font-bold text-xs transition-colors"
          >
            Not now &mdash; carry on under the Terms I accepted
          </button>
        )}
        <button
          data-terms-gate-signout
          onClick={() => signOut(getAuth())}
          className="w-full mt-3 text-gray-500 hover:text-gray-900 py-2 rounded-2xl font-bold text-xs transition-colors"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}
