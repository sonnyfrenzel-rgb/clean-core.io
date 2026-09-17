'use client';

import { FormEvent, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { AlertTriangle, Check, Loader2, Mail, X } from 'lucide-react';
import {
  INVITATION_DEFAULT_DAYS,
  INVITATION_LIMITS_SENTENCE,
  INVITATION_SCOPE_SENTENCE,
  type Invitation,
} from '@/lib/invitations';

/**
 * Inviting one reader to one project — roadmap 5.2.
 *
 * **The dialog says what it gives away, in the dialog.** Not in a tooltip, not
 * behind a "learn more", not in a popover: `docs/ROADMAP.md` phase 5 accepts
 * this step only when the invitation dialog states *including source code*
 * outright, and the reason is not pedantry. The owner is about to hand a third
 * party the ABAP of a customer system. Somebody who has to hover to discover
 * that has not been told.
 *
 * The second sentence is the other half: what an invitation is *not*. Reading,
 * and nothing else — generating, confirming, signing and exporting stay with
 * the owner. Promising anything wider here would be a promise the product does
 * not keep, and a narrower one would be a rights tier, which Fassung 2.8
 * deleted.
 *
 * The third is the part people forget: a withdrawal ends access, it does not
 * end memory. Whatever the reader has already seen or downloaded is with them.
 * Who gives something away should read that before they do, not afterwards.
 */
export default function InviteReaderDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<Invitation | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = getAuth().currentUser;
      if (!user) {
        setError('Your session has expired. Sign in again and try once more.');
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch(`/api/projects/${projectId}/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(body?.error || 'The invitation could not be sent.'));
        return;
      }
      setSent(body.invitation as Invitation);
    } catch {
      setError('The invitation could not be sent just now. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900/40 backdrop-blur-md flex items-center justify-center p-4">
      <div
        data-invite-dialog
        role="dialog"
        aria-modal="true"
        aria-label="Invite someone to read this project"
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-gray-100 p-6 sm:p-8 relative max-h-[95vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 p-2 rounded-full transition-colors"
        >
          <X size={16} strokeWidth={2.5} />
        </button>

        {sent ? (
          <>
            <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mb-5 border border-green-200">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-2xl font-black text-gray-950 tracking-tight mb-2">The invitation is on its way</h2>
            <p data-invite-sent className="text-sm font-medium text-gray-600 leading-relaxed mb-6">
              <strong className="text-gray-900">{sent.email}</strong> has been sent a link to read “{projectName}”.
              It opens only for an account signed in with that address, and only once that address is confirmed.
              It expires on {new Date(sent.expiresAt).toUTCString().slice(5, 16)}.
            </p>
            <button
              onClick={onClose}
              className="w-full bg-gray-950 hover:bg-gray-900 text-white py-3.5 rounded-2xl font-black text-sm transition-all"
            >
              Done
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mb-5 border border-green-200">
              <Mail className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-2xl font-black text-gray-950 tracking-tight mb-2">
              Invite someone to read this project
            </h2>
            <p className="text-sm font-bold text-gray-500 mb-5 truncate" title={projectName}>
              {projectName}
            </p>

            {/* The acceptance criterion of roadmap phase 5, rendered — not a tooltip. */}
            <div
              data-invite-scope
              className="bg-gray-50 border border-gray-200 rounded-2xl p-5 mb-5 space-y-3 text-xs font-medium text-gray-600 leading-relaxed"
            >
              <p>{INVITATION_SCOPE_SENTENCE}</p>
              <p>{INVITATION_LIMITS_SENTENCE}</p>
              <p className="flex gap-2 text-amber-900">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Withdrawing an invitation ends the access, not the memory: whatever the reader has
                  already seen or downloaded stays with them.
                </span>
              </p>
            </div>

            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
              Email address
            </label>
            <div className="relative mb-2">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                data-invite-email
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-gray-50 border border-gray-200 pl-11 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all font-medium text-gray-900 text-sm"
              />
            </div>
            <p className="text-[11px] font-medium text-gray-500 mb-5">
              The link is bound to this one address and expires after {INVITATION_DEFAULT_DAYS} days.
            </p>

            {error && (
              <div
                data-invite-error
                role="alert"
                className="mb-5 p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-bold leading-relaxed"
              >
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3.5 text-sm font-black text-gray-600 hover:bg-gray-100 rounded-2xl transition-all"
              >
                Cancel
              </button>
              <button
                data-invite-submit
                type="submit"
                disabled={busy || email.trim().length === 0}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3.5 rounded-2xl font-black text-sm transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? 'Sending…' : 'Send the invitation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
