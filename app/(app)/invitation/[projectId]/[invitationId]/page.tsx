'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getAuth } from '@/lib/firebase';
import { ArrowRight, Check, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { signInLinkFor } from '@/lib/return-path';
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
      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm p-8 sm:p-10">
        <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mb-6 border border-green-200">
          {accepted ? <Check className="w-7 h-7 text-green-600" /> : <Lock className="w-7 h-7 text-green-600" />}
        </div>

        {accepted ? (
          <>
            <h1 data-invitation-title className="text-3xl font-black text-gray-950 tracking-tight mb-3">
              You now have read access
            </h1>
            <p className="text-sm font-medium text-gray-600 leading-relaxed mb-8">
              {accepted.projectName
                ? `“${accepted.projectName}” is open for reading with this account.`
                : 'The project is open for reading with this account.'}{' '}
              {INVITATION_LIMITS_SENTENCE}
            </p>
            <Link
              href={`/project/${projectId}/analyze`}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3.5 rounded-2xl font-black text-sm transition-all shadow-md"
            >
              Open the project <ArrowRight size={14} />
            </Link>
          </>
        ) : (
          <>
            <h1 data-invitation-title className="text-3xl font-black text-gray-950 tracking-tight mb-3">
              An invitation to read a project
            </h1>
            <p className="text-sm font-medium text-gray-600 leading-relaxed mb-6">
              {INVITATION_SCOPE_SENTENCE} {INVITATION_LIMITS_SENTENCE}
            </p>

            {/* UX-148: whose invitation, and until when — the two facts the mail
                already gave this address. Only the invited, confirmed account
                receives them; the project name stays behind acceptance. */}
            {preview && (
              <dl data-invitation-preview className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm mb-6">
                <dt className="font-bold text-gray-500">Invited by</dt>
                <dd data-invitation-inviter className="font-medium text-gray-900">{preview.invitedBy || 'not recorded'}</dd>
                <dt className="font-bold text-gray-500">Open until</dt>
                <dd data-invitation-expires className="font-medium text-gray-900">
                  {new Date(preview.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </dd>
              </dl>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-8 flex gap-3">
              <ShieldCheck size={18} className="text-gray-500 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-gray-600 leading-relaxed">
                This link opens for one account only: the one signed in with the address the invitation
                was sent to, and that address has to be confirmed. Forwarding the link gives nobody
                anything.
              </p>
            </div>

            {checkingAuth ? (
              <p className="text-sm font-bold text-gray-500 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Checking your session…
              </p>
            ) : user ? (
              <button
                data-invitation-accept
                onClick={accept}
                disabled={busy}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3.5 rounded-2xl font-black text-sm transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {busy ? 'Opening…' : 'Open the invitation'}
              </button>
            ) : (
              <>
                <Link
                  data-invitation-signin
                  href={signInLinkFor(here)}
                  className="inline-flex items-center gap-2 bg-gray-950 hover:bg-gray-900 text-white px-6 py-3.5 rounded-2xl font-black text-sm transition-all shadow-md"
                >
                  Sign in to open it <ArrowRight size={14} />
                </Link>
                <p className="text-xs font-medium text-gray-500 mt-4 leading-relaxed">
                  No account yet? Create one with the address the invitation was sent to — you come back
                  here afterwards.
                </p>
              </>
            )}

            {error && (
              <div
                data-invitation-error
                role="alert"
                className="mt-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-bold leading-relaxed"
              >
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
