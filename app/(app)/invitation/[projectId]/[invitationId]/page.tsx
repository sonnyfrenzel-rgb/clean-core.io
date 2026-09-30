'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import { ArrowRight, Check, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { signInLinkFor } from '@/lib/return-path';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { formatTextDate } from '@/lib/format';
import {
  INVITATION_LIMITS_SENTENCE,
  INVITATION_SCOPE_SENTENCE,
  invitationLinkPath,
} from '@/lib/invitations';

/**
 * The page an invitation link opens — roadmap 5.1 and 5.3.
 *
 * It shows nothing about the project until the server has accepted the
 * invitation, because until then nothing about the reader has been checked. A
 * page that greeted a visitor with "You have been invited to *Migration
 * Contoso GmbH*" before knowing who they are would hand out the customer's name
 * to whoever the link was forwarded to, which is most of what the invitation is
 * supposed to protect.
 *
 * Signed out, it does one thing: send the reader to the ordinary sign-in with
 * `?next=` pointing back here. Registration and sign-in themselves are
 * untouched — the modal simply returns here instead of the dashboard, and the
 * target is validated by `safeReturnPath` on the way in and on the way out.
 */
export default function InvitationPage() {
  const params = useParams<{ projectId: string; invitationId: string }>();
  const projectId = String(params?.projectId ?? '');
  const invitationId = String(params?.invitationId ?? '');
  const here = invitationLinkPath(projectId, invitationId);

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState<{ projectName: string } | null>(null);
  const [preview, setPreview] = useState<{ invitedBy: string; expiresAt: string } | null>(null);

  // Signed in: ask who sent it and until when. Any refusal simply leaves the
  // page as it was — the accept button gives the reason when it is pressed.
  useEffect(() => {
    if (!user || !projectId || !invitationId) return;
    let live = true;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/projects/${projectId}/invitations/${invitationId}/accept`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        if (live && body && typeof body.expiresAt === 'string') {
          setPreview({ invitedBy: String(body.invitedBy ?? ''), expiresAt: body.expiresAt });
        }
      } catch {
        /* the preview is a courtesy; its absence is the old page */
      }
    })();
    return () => {
      live = false;
    };
  }, [user, projectId, invitationId]);

  useEffect(() => {
    const auth = getAuth();
    const stop = onAuthStateChanged(auth, (current) => {
      setUser(current);
      setCheckingAuth(false);
    });
    return () => stop();
  }, []);

  const accept = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/projects/${projectId}/invitations/${invitationId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(body?.error || 'This invitation could not be opened.'));
        return;
      }
      setAccepted({ projectName: String(body?.projectName || '') });
    } catch {
      setError('The invitation could not be opened just now. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }, [user, projectId, invitationId]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-cc-surface border border-cc-line rounded-3xl p-8 sm:p-10">
        <div aria-hidden="true" className="w-14 h-14 bg-cc-brand-surface rounded-2xl flex items-center justify-center mb-6 border border-cc-brand">
          {accepted ? <Check className="w-7 h-7 text-cc-brand-strong" /> : <Lock className="w-7 h-7 text-cc-brand-strong" />}
        </div>

        {accepted ? (
          <>
            <h1 data-invitation-title className="text-3xl font-extrabold text-cc-ink tracking-tight mb-3">
              You now have read access
            </h1>
            <p className="text-sm font-medium text-cc-ink-muted leading-relaxed mb-8">
              {accepted.projectName
                ? `“${accepted.projectName}” is open for reading with this account.`
                : 'The project is open for reading with this account.'}{' '}
              {INVITATION_LIMITS_SENTENCE}
            </p>
            <CcLinkButton href={`/project/${projectId}/analyze`} variant="primary" density="cozy">
              Open the project <ArrowRight size={16} aria-hidden="true" />
            </CcLinkButton>
          </>
        ) : (
          <>
            <h1 data-invitation-title className="text-3xl font-extrabold text-cc-ink tracking-tight mb-3">
              An invitation to read a project
            </h1>
            <p className="text-sm font-medium text-cc-ink-muted leading-relaxed mb-6">
              {INVITATION_SCOPE_SENTENCE} {INVITATION_LIMITS_SENTENCE}
            </p>

            {/* UX-148: whose invitation, and until when — the two facts the mail
                already gave this address. Only the invited, confirmed account
                receives them; the project name stays behind acceptance. */}
            {preview && (
              <dl data-invitation-preview className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm mb-6">
                <dt className="font-bold text-cc-ink-muted">Invited by</dt>
                <dd data-invitation-inviter className="font-medium text-cc-ink">{preview.invitedBy || 'not recorded'}</dd>
                <dt className="font-bold text-cc-ink-muted">Open until</dt>
                <dd data-invitation-expires className="font-medium text-cc-ink">
                  {formatTextDate(preview.expiresAt) ?? preview.expiresAt}
                </dd>
              </dl>
            )}

            <div className="bg-cc-surface-muted border border-cc-line rounded-2xl p-5 mb-8 flex gap-3">
              <ShieldCheck size={18} className="text-cc-ink-muted shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs font-medium text-cc-ink-muted leading-relaxed">
                This link opens for one account only: the one signed in with the address the invitation
                was sent to, and that address has to be confirmed. Forwarding the link gives nobody
                anything.
              </p>
            </div>

            {checkingAuth ? (
              <p role="status" className="text-sm font-bold text-cc-ink-muted flex items-center gap-2">
                <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" /> Checking your session…
              </p>
            ) : user ? (
              <CcButton
                data-invitation-accept=""
                variant="primary"
                density="cozy"
                onClick={accept}
                busy={busy}
                disabled={busy}
                icon={<Mail size={16} aria-hidden="true" />}
              >
                {busy ? 'Opening…' : 'Open the invitation'}
              </CcButton>
            ) : (
              <>
                <CcLinkButton data-invitation-signin="" href={signInLinkFor(here)} variant="primary" density="cozy">
                  Sign in to open it <ArrowRight size={16} aria-hidden="true" />
                </CcLinkButton>
                <p className="text-xs font-medium text-cc-ink-muted mt-4 leading-relaxed">
                  No account yet? Create one with the address the invitation was sent to — you come back
                  here afterwards.
                </p>
              </>
            )}

            {error && (
              <div data-invitation-error className="mt-6">
                <CcMessageStrip state="error">{error}</CcMessageStrip>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
