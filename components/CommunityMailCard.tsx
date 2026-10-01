'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import CcSwitch from '@/components/cc/Switch';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcDateText from '@/components/cc/DateText';
import { getAuth } from '@/lib/firebase';
import type { CommunityMailConsent } from '@/lib/community-mail';

/** A link in running text — the same class as on /settings. */
const TEXT_LINK = 'font-semibold text-cc-brand-strong underline underline-offset-2 hover:text-cc-brand-deep';

/**
 * The consent to community mail — surveys and community updates.
 *
 * Owner decision of 30.09.2026 (QA finding bef96e7f054f): such mail goes only
 * to an account that switched it on here. Off by default, and nothing at
 * sign-up sets it.
 *
 * A switch, not a checkbox: it is saved the moment it is flipped
 * (`POST /api/community-mail`), which is the switch contract of DESIGN.md §2.7.
 * The server writes `users/{uid}.communityMail` — the field is not one a
 * browser may write (`firestore.rules`, `userClientUpdateKeys()`). The profile
 * listener on /settings then carries the stored state back in through
 * `consent`; until it does, the answer of the POST is shown.
 */
export default function CommunityMailCard({ consent }: { consent?: CommunityMailConsent | null }) {
  const stored = consent?.optIn === true;
  // The POST's answer, with the stored value it was given against.
  const [answered, setAnswered] = useState<{ value: boolean; against: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // The POST's answer until the profile listener has moved at all; from then
  // on the stored value decides, whoever changed it (an unsubscribe link
  // opened in another tab withdraws the consent too).
  const on = answered !== null && answered.against === stored ? answered.value : stored;

  const toggle = async () => {
    const next = !on;
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('Sign in again to change this setting.');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/community-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ optIn: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.optIn !== next) throw new Error(body.error || 'The setting could not be saved.');
      setAnswered({ value: next, against: stored });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const since = on ? consent?.consentedAt : consent?.withdrawnAt;

  return (
    <div data-community-mail-card className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden={true}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-cc-row border border-cc-line bg-cc-surface-muted text-cc-ink-muted"
          >
            <Mail size={20} />
          </span>
          <h2 className="m-0 cc-text-h2 text-cc-ink">Community mail</h2>
        </div>
      </div>

      <p className="mb-6 cc-text-body text-cc-ink-muted">
        Surveys about what to build next and the occasional community update. We send them only if you switch
        this on, and you can switch it off here or with the unsubscribe link in any of those mails. Mails about
        your own account — confirmations, invitations you send, security notices — are not affected. Details in
        the{' '}
        <Link href="/datenschutz" className={TEXT_LINK}>
          privacy policy
        </Link>
        .
      </p>

      {error && (
        <div className="mb-6">
          <CcMessageStrip state="error" headline="The setting was not saved." announce>
            {error}
          </CcMessageStrip>
        </div>
      )}

      <div data-community-mail-on={on ? 'true' : 'false'} className="rounded-cc-row border border-cc-line px-4 py-3">
        <CcSwitch
          label="Send me surveys and community updates"
          help={
            since ? (
              <>
                {on ? 'Switched on' : 'Switched off'} <CcDateText value={since} format="text" />
              </>
            ) : (
              'Off unless you switch it on.'
            )
          }
          checked={on}
          onChange={toggle}
          disabled={saving}
          valueState={saving ? 'information' : saved ? 'success' : undefined}
          message={saving ? 'Saving…' : saved ? `Saved — ${on ? 'on' : 'off'}` : undefined}
        />
      </div>
    </div>
  );
}
