'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import { ArrowRight, Check, Loader2, Lock, Mail } from 'lucide-react';
import { signInLinkFor } from '@/lib/return-path';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { formatTextDate } from '@/lib/format';
import {
  INVITATION_LIMITS_SENTENCE_RECIPIENT,
  INVITATION_SCOPE_SENTENCE_RECIPIENT,
  invitationLinkPath,
} from '@/lib/invitations';
import { useUserProfile } from '@/hooks/useUserProfile';
import { workspaceShellEnabled } from '@/lib/workspace-shell';

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
  const { profile } = useUserProfile();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState<{ projectName: string } | null>(null);
  // The preview remembers whom it was read for: it is shown only to that
  // account, for that invitation. It used to stay on screen after a sign-out
  // or a switch to another account (QA slice review of 81810c8026e0,
  // 9e437b2930c4).
  const [preview, setPreview] = useState<{ readFor: string; invitedBy: string; expiresAt: string } | null>(null);
  const previewKey = user ? `${user.uid}|${projectId}|${invitationId}` : null;
  const shownPreview = preview && preview.readFor === previewKey ? preview : null;

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
          setPreview({ readFor: `${user.uid}|${projectId}|${invitationId}`, invitedBy: String(body.invitedBy ?? ''), expiresAt: body.expiresAt });
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

  // A shared project opens where its owner reads it: the 3.0 workspace for an
  // account with the new interface on, the Analyze stage for everybody else.
  const openHref = workspaceShellEnabled(profile) ? `/project/${projectId}` : `/project/${projectId}/analyze`;

  // One card in the app's own language (cc library, 22/800 head, §1.2): what
  // the link is, whose it is, until when, and the one action. No marketing
  // tile, no 32 px heading.
  return (
    <div className="cc mx-auto w-full max-w-2xl px-4 py-6 sm:px-6" data-invitation-page="">
      <CcCard density="cozy">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-cc-row border border-cc-line bg-cc-surface-muted text-cc-ink-muted"
          >
            {accepted ? <Check size={18} /> : <Lock size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
              Read access by invitation
            </p>
            <h1
              data-invitation-title
              className="mt-1 mb-0 text-[22px] leading-tight font-extrabold tracking-[-0.02em] text-cc-ink"
            >
              {accepted ? 'You now have read access' : 'An invitation to read a project'}
            </h1>
          </div>
        </div>

        {accepted ? (
          <div className="mt-4 flex flex-col gap-4">
            <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink-muted">
              {accepted.projectName
                ? `“${accepted.projectName}” is open for reading with this account.`
                : 'The project is open for reading with this account.'}{' '}
              {INVITATION_LIMITS_SENTENCE_RECIPIENT}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <CcLinkButton href={openHref} variant="primary" icon={<ArrowRight size={16} aria-hidden="true" />}>
                Open the project
              </CcLinkButton>
              <CcLinkButton href="/dashboard">My workspace</CcLinkButton>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink-muted">
              {INVITATION_SCOPE_SENTENCE_RECIPIENT} {INVITATION_LIMITS_SENTENCE_RECIPIENT}
            </p>

            {/* UX-148: whose invitation, and until when — the two facts the mail
                already gave this address. Only the invited, confirmed account
                receives them; the project name stays behind acceptance. */}
            {shownPreview && (
              <dl
                data-invitation-preview
                className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-cc-row border border-cc-line px-3 py-2 text-[13px]"
              >
                <dt className="font-semibold text-cc-ink-muted">Invited by</dt>
                <dd data-invitation-inviter className="m-0 font-medium text-cc-ink">
                  {shownPreview.invitedBy || 'not recorded'}
                </dd>
                <dt className="font-semibold text-cc-ink-muted">Link expires on</dt>
                <dd data-invitation-expires className="m-0 font-medium text-cc-ink">
                  {formatTextDate(shownPreview.expiresAt) ?? shownPreview.expiresAt}
                </dd>
              </dl>
            )}

            <CcMessageStrip state="information" headline="Bound to one address.">
              This link opens for one account only: the one signed in with the address the invitation was sent to,
              and that address has to be confirmed. Forwarding the link gives nobody anything. There are no public
              links.
            </CcMessageStrip>

            {checkingAuth ? (
              <p role="status" className="m-0 flex items-center gap-2 text-[13px] font-semibold text-cc-ink-muted">
                <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" /> Checking your session…
              </p>
            ) : user ? (
              <div>
                <CcButton
                  data-invitation-accept=""
                  variant="primary"
                  onClick={accept}
                  busy={busy}
                  disabled={busy}
                  icon={<Mail size={16} aria-hidden="true" />}
                >
                  {busy ? 'Opening…' : 'Open the invitation'}
                </CcButton>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <CcLinkButton
                  data-invitation-signin=""
                  href={signInLinkFor(here)}
                  variant="primary"
                  icon={<ArrowRight size={16} aria-hidden="true" />}
                >
                  Sign in to open it
                </CcLinkButton>
                <p className="m-0 text-[12px] leading-relaxed font-medium text-cc-ink-muted">
                  No account yet? Create one with the address the invitation was sent to — you come back here
                  afterwards.
                </p>
              </div>
            )}

            {error && (
              <div data-invitation-error>
                <CcMessageStrip state="error" announce>
                  {error}
                </CcMessageStrip>
              </div>
            )}
          </div>
        )}
      </CcCard>
    </div>
  );
}
