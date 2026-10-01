'use client';

import { FormEvent, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { AlertTriangle } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcField from '@/components/cc/Field';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { formatTextDate } from '@/lib/format';
import {
  INVITATION_DEFAULT_DAYS,
  INVITATION_LIMITS_SENTENCE,
  INVITATION_SCOPE_SENTENCE,
  INVITATION_SPAM_HINT,
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
    if (busy) return;
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

  // One dialog from the library (DESIGN.md §2.6, block D step D.23b): the
  // library owns the scrim, focus trap, Escape and the close button. What the
  // dialog says and what it sends are unchanged — the invitation is bound,
  // expires and is withdrawn on the server, not here.
  if (sent) {
    return (
      <CcDialog
        open
        data-invite-dialog=""
        title="The invitation is on its way"
        onClose={onClose}
        actions={
          <CcButton variant="primary" onClick={onClose}>
            Done
          </CcButton>
        }
      >
        <p data-invite-sent className="mt-0 mb-4 text-sm font-medium text-cc-ink-muted leading-relaxed">
          <strong className="text-cc-ink">{sent.email}</strong> has been sent a link to read “{projectName}”.
          It opens only for an account signed in with that address, and only once that address is confirmed.
          It expires on {formatTextDate(sent.expiresAt) ?? sent.expiresAt}.
        </p>
        <div data-invite-spam-hint>
          <CcMessageStrip state="warning">{INVITATION_SPAM_HINT}</CcMessageStrip>
        </div>
      </CcDialog>
    );
  }

  return (
    <CcDialog
      open
      data-invite-dialog=""
      title="Invite someone to read this project"
      lead={<span className="block truncate" title={projectName}>{projectName}</span>}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <CcButton onClick={onClose}>Cancel</CcButton>
          <CcButton
            data-invite-submit=""
            type="submit"
            variant="primary"
            busy={busy}
            disabled={busy || email.trim().length === 0}
          >
            {busy ? 'Sending…' : 'Send the invitation'}
          </CcButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* The acceptance criterion of roadmap phase 5, rendered — not a tooltip. */}
        <div
          data-invite-scope
          className="bg-cc-surface-muted border border-cc-line rounded-cc-row p-4 space-y-3 text-[13px] font-medium text-cc-ink leading-relaxed"
        >
          <p>{INVITATION_SCOPE_SENTENCE}</p>
          <p>{INVITATION_LIMITS_SENTENCE}</p>
          <p className="flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-cc-warning" aria-hidden="true" />
            <span>
              Withdrawing an invitation ends the access, not the memory: whatever the reader has
              already seen or downloaded stays with them.
            </span>
          </p>
        </div>

        <CcField
          label="Email address"
          required
          help={`The link is bound to this one address and expires after ${INVITATION_DEFAULT_DAYS} days.`}
        >
          {(control) => (
            <input
              id={control.id}
              data-invite-email
              type="email"
              autoComplete="email"
              required={control.required}
              aria-required={control.ariaRequired}
              aria-describedby={control.describedBy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className={control.className}
            />
          )}
        </CcField>

        {error && (
          <div data-invite-error>
            <CcMessageStrip state="error">{error}</CcMessageStrip>
          </div>
        )}
      </div>
    </CcDialog>
  );
}
