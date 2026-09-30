'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { getAuth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { TERMS_VERSION, termsVersionInForce } from '@/lib/constants';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcMessageStrip from '@/components/cc/MessageStrip';

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
/**
 * Where "not now" is remembered.
 *
 * Session storage, and keyed by the version being declined: closing the browser
 * asks again, which is what Sonny asked for (18.09.2026, "der user muss bei neu
 * login erneut zustimmen") and what § 10.1's notice regime expects. A *later*
 * amendment gets its own key and is therefore asked about on its own merits —
 * declining v2 must not silently decline v3.
 *
 * It was React state alone until a UX review of bc2f7863464c reported the card
 * filling the first viewport on ten routes. The comment here already claimed
 * "this browsing session"; `useState` only ever meant "until this component
 * unmounts", so every reload brought it back. Naming the storage makes the
 * promise the comment was already making.
 */
const DECLINE_KEY = `cc.terms.declined.${TERMS_VERSION}`;

/** Storage throws in a private window and is empty in a fresh one; neither is an error. */
function readDeclined(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(DECLINE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * What each version changed, newest first, keyed by the version id.
 *
 * The gate shows every entry newer than the version the account accepted, not
 * only the latest: an account still on v2.0.0 meeting v2.2.0 has not been told
 * about v2.1.0 either, and a list that showed only the last step would ask it to
 * accept changes it was never shown. An account with no recorded acceptance
 * sees them all.
 */
const WHAT_CHANGED: ReadonlyArray<{ version: string; items: ReadonlyArray<{ lead: string; text: string }> }> = [
  {
    version: '2026-10-15',
    items: [
      {
        lead: 'What is computed, and what a model writes.',
        text:
          'Section 4.1 now names which results come from the deterministic engine, without a language model — the ' +
          'findings with their line references, the route, the Clean Core Score, the clean core levels, the process ' +
          'reconstructed from your code and the Economics calculation from your own figures — and which are written ' +
          'by a language model where you use those steps: summaries, business names and sentences, the solution ' +
          'design, generated code, documentation and tests. Engine results are evidence, not a guarantee; model ' +
          'output is a draft. Both are reviewed before use, as before.',
      },
    ],
  },
  {
    version: '2026-09-18',
    items: [
      {
        lead: 'Do not upload personal data of third parties.',
        text:
          "ABAP carries it more often than people expect: a developer's user id, a name in a comment, a real " +
          'customer number, a production record used as test data. Strip those before you upload. We do not offer ' +
          'a data processing agreement, so there is no contract under which we could process such data for you.',
      },
      {
        lead: 'You must be at least 18.',
        text: 'Accepting these Terms is entering into a contract, and this is a tool for professional software work.',
      },
      {
        lead: '',
        text:
          'The Privacy Policy was extended at the same time — server logs, concrete retention periods, and a German ' +
          'version that prevails if the two ever differ.',
      },
    ],
  },
];

export default function TermsReacceptGate() {
  const { profile, loading } = useUserProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Safe as a lazy initialiser despite SSR: this component renders `null` while
  // the profile is loading, so the server and the first client paint agree
  // regardless of what storage holds.
  const [declined, setDeclinedState] = useState<boolean>(readDeclined);

  const setDeclined = (value: boolean) => {
    setDeclinedState(value);
    try {
      if (value) window.sessionStorage.setItem(DECLINE_KEY, '1');
      else window.sessionStorage.removeItem(DECLINE_KEY);
    } catch {
      // A browser that refuses storage still gets the in-memory behaviour above.
    }
  };

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
   * Focus goes in and stays in, the page behind is inert, and it does not scroll.
   *
   * Setting initial focus is the easy half and was all this had at first (QA
   * review of 38e6f079a0ba). Without the trap, Tab walks out of a dialog that
   * blocks everything behind it, and a keyboard user ends up operating controls
   * that answer 403 — which is the failure this whole gate exists to prevent,
   * reproduced for the people least able to guess what happened.
   *
   * The blocking form is a `CcDialog` with `dismissible={false}` (block D,
   * D.31): the trap, the `inert` page and the inert Escape come from the
   * library's modal code (§2.6, ADR-028), so this layer cannot drift into a
   * third meaning of "modal" — and it no longer builds a layer of its own. The
   * caret starts on the one action that opens the product again, marked
   * `data-cc-initial-focus` for the dialog. Only the blocking form takes focus;
   * a banner that grabbed the caret would be worse than the problem it reports.
   * The scroll lock stays here: it belongs to this gate, not to every dialog.
   */
  const blockingOpen = needed && !declined && !mayDecline;

  useEffect(() => {
    if (!blockingOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [blockingOpen]);

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
   * the person may decline, so this is a **banner**: it sits in the page flow
   * above the content and covers nothing. An overlay here
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

  const explanation = mayDecline
    ? 'You accepted an earlier version. Please read the current one and accept it. You do not have to: section 10.3 lets you carry on under the Terms you accepted, and nothing stops working if you decline.'
    : 'The version your account accepted is no longer in force, so the platform is closed to it. Please read the current Terms and accept them to carry on.';
  const title = 'The Terms of Service have changed';

  // What changed, the two documents and the error: the same in both forms.
  const details = (
    <>
      <div className="space-y-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-4 cc-text-cell text-cc-ink-muted">
        <p className="cc-text-label text-cc-ink-muted">What changed</p>
        {WHAT_CHANGED.filter((entry) => !accepted || entry.version > accepted).flatMap((entry) =>
          entry.items.map((item, i) => (
            <p key={`${entry.version}-${i}`} data-terms-gate-change={entry.version}>
              {item.lead && <strong className="font-semibold text-cc-ink">{item.lead}</strong>}
              {item.lead && ' '}
              {item.text}
            </p>
          )),
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 cc-text-identifier">
        <Link
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          data-terms-gate-link="terms"
          className="inline-flex items-center gap-1 text-cc-ink underline underline-offset-2 hover:text-cc-information"
        >
          Read the Terms <ExternalLink size={12} aria-hidden={true} />
        </Link>
        <Link
          href="/datenschutz"
          target="_blank"
          rel="noopener noreferrer"
          data-terms-gate-link="privacy"
          className="inline-flex items-center gap-1 text-cc-ink underline underline-offset-2 hover:text-cc-information"
        >
          Read the Privacy Policy <ExternalLink size={12} aria-hidden={true} />
        </Link>
      </div>

      {error && (
        <div data-terms-gate-error className="mt-4">
          <CcMessageStrip state="error" announce>
            {error}
          </CcMessageStrip>
        </div>
      )}
    </>
  );

  // Accepting is entering into a contract — the binding confirmation of §1.5,
  // and the only place on this layer that wears `dark`. `data-cc-initial-focus`
  // puts the caret on it when the blocking dialog opens.
  const actions = (
    <>
      <CcButton data-terms-gate-signout variant="ghost" onClick={() => signOut(getAuth())}>
        Sign out instead
      </CcButton>
      {mayDecline && (
        <CcButton data-terms-gate-decline variant="ghost" onClick={() => setDeclined(true)}>
          Not now &mdash; carry on under the Terms I accepted
        </CcButton>
      )}
      <CcButton data-terms-gate-accept data-cc-initial-focus="" variant="dark" busy={busy} onClick={accept}>
        I have read and accept the Terms
      </CcButton>
    </>
  );

  if (!blocking) {
    return (
      // In the page flow, not over it. A fixed banner still covers whatever is
      // beneath it — it intercepted clicks in five specs even after the wrapper
      // stopped taking pointer events — and a question somebody is allowed to
      // answer with "no" must not sit on top of their work.
      <div
        data-terms-gate
        data-terms-gate-mode="banner"
        className="cc mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8"
        onKeyDown={(e) => {
          // Escape is a decline, and here declining is allowed.
          if (e.key === 'Escape') setDeclined(true);
        }}
      >
        <div
          role="region"
          aria-labelledby="terms-gate-title"
          className="rounded-cc-card border border-cc-warning-border bg-cc-surface p-5 shadow-cc"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-cc-warning">
              <AlertTriangle size={20} aria-hidden={true} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="terms-gate-title" className="m-0 cc-text-h2 text-cc-ink">
                {title}
              </h2>
              <p className="mt-1 mb-0 cc-text-cell text-cc-ink-muted">{explanation}</p>
            </div>
          </div>
          <div className="mt-4">{details}</div>
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>
      </div>
    );
  }

  // The library's dialog, not a layer of this file's own (block D, D.31): it
  // portals to `body`, dims and switches off the page, holds the focus, and
  // with `dismissible={false}` has no close button and ignores Escape — only
  // the two actions lead out, and one of them is signing out.
  return (
    <CcDialog
      open
      dismissible={false}
      title={title}
      lead={explanation}
      actions={actions}
      data-terms-gate=""
      data-terms-gate-mode="blocking"
    >
      {details}
    </CcDialog>
  );
}
