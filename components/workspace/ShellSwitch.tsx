'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { getAuth } from '@/lib/firebase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { workspaceShellEligible, workspaceShellEnabled } from '@/lib/workspace-shell';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import { wt, shellSwitchHttpError } from '@/lib/workspace-messages';

/**
 * The switch the 3.0 interface grows behind — roadmap 1.4.
 *
 * `docs/ROADMAP.md`, preamble: the new UI grows behind an admin-only switch
 * until 3.0. It lives on the admin console because that is where the one gate
 * it shares already is, and because an administrator turning something on for
 * their **own** account is the whole of what it does: there is no field here
 * for turning it on for somebody else, and the server route has no parameter
 * for one either.
 *
 * The state it shows is read back from the profile, not from local state after
 * a successful POST. The flag is server-written — `POST /api/workspace-shell`
 * through the Admin SDK, outside `userClientUpdateKeys()` in `firestore.rules`
 * — so the profile listener is the thing that knows, and a screen that believed
 * its own optimistic copy would be the one place this switch could lie.
 */
export default function WorkspaceShellSwitch() {
  const { profile } = useUserProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!workspaceShellEligible(profile)) return null;

  const enabled = workspaceShellEnabled(profile);

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      const user = getAuth()?.currentUser;
      if (!user) throw new Error(wt('shellSwitch.signInAgain'));
      const token = await user.getIdToken();
      const res = await fetch('/api/workspace-shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || shellSwitchHttpError(res.status));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : wt('shellSwitch.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc" data-workspace-shell-switch={enabled ? 'on' : 'off'}>
      <CcCard
        title={wt('shellSwitch.title')}
        meta={<CcObjectStatus value={enabled ? 'confirmed' : 'not-started'} facet={wt('shellSwitch.facet')} />}
        actions={
          <CcButton
            variant={enabled ? 'ghost' : 'primary'}
            onClick={toggle}
            disabled={busy}
            data-workspace-shell-toggle=""
          >
            {enabled ? wt('shellSwitch.turnOff') : wt('shellSwitch.turnOn')}
          </CcButton>
        }
      >
        <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink-muted">
          {wt('shellSwitch.leadBefore')}
          <code className="mx-1 font-cc-mono text-[12px] text-cc-ink">{wt('shellSwitch.address')}</code>
          {wt('shellSwitch.leadAfter')}
        </p>
        {enabled && (
          <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">
            <Link href="/admin/design-system" className="font-semibold text-cc-ink underline">
              {wt('shellSwitch.designSystem')}
            </Link>{' '}
            {wt('shellSwitch.designSystemAfter')}
          </p>
        )}
        {error && (
          <div className="mt-3">
            <CcMessageStrip state="error" headline={wt('shellSwitch.notSaved')} announce>
              {error}
            </CcMessageStrip>
          </div>
        )}
      </CcCard>
    </div>
  );
}
