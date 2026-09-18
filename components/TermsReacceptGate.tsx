'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { getAuth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { TERMS_VERSION } from '@/lib/constants';

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
 * It blocks deliberately. A dismissible banner would leave people in a product
 * whose every useful route answers 403, and they would read that as breakage —
 * which is exactly how the MFA lockout presented itself ("Failed to analyze the
 * code"). Signing out is offered, because refusing to accept has to be possible
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
  const acceptRef = useRef<HTMLButtonElement | null>(null);

  const needed = !loading && !!profile && profile.termsVersionAccepted !== TERMS_VERSION;

  // The focus belongs in the dialog, and the page behind it must not scroll —
  // the accessibility findings of 17.09. are not a licence to add another one.
  useEffect(() => {
    if (!needed) return;
    acceptRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [needed]);

  if (!needed) return null;

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

  return (
    <div
      data-terms-gate
      className="fixed inset-0 z-[200] bg-gray-950/60 backdrop-blur-md flex items-center justify-center p-4"
      onKeyDown={(e) => {
        // Not dismissible: there is nothing behind this dialog that works.
        if (e.key === 'Escape') e.preventDefault();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-gate-title"
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-gray-100 p-6 sm:p-8 max-h-[95vh] overflow-y-auto"
      >
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mb-5 border border-amber-200">
          <AlertTriangle className="w-7 h-7 text-amber-600" />
        </div>
        <h2 id="terms-gate-title" className="text-2xl font-black text-gray-950 tracking-tight mb-2">
          The Terms of Service have changed
        </h2>
        <p className="text-sm font-medium text-gray-600 leading-relaxed mb-5">
          You accepted an earlier version. Please read the current one and accept it to carry on — analysing,
          exporting and inviting stay closed until you do.
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
