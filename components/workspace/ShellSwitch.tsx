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
      if (!user) throw new Error('Sign in again to change this setting.');
      const token = await user.getIdToken();
      const res = await fetch('/api/workspace-shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Could not save the setting (HTTP ${res.status}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the setting.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc" data-workspace-shell-switch={enabled ? 'on' : 'off'}>
      <CcCard
        title="Workspace preview"
        meta={<CcObjectStatus value={enabled ? 'confirmed' : 'not-started'} facet="Preview" />}
        actions={
          <CcButton
            variant={enabled ? 'ghost' : 'primary'}
            onClick={toggle}
            disabled={busy}
            data-workspace-shell-toggle=""
          >
            {enabled ? 'Turn off' : 'Turn on'}
          </CcButton>
        }
      >
        <p className="m-0 text-[13px] leading-relaxed font-medium text-cc-ink-muted">
          The 3.0 workspace, on your own account only. It adds one address —
          <code className="mx-1 font-cc-mono text-[12px] text-cc-ink">/project/&lt;id&gt;</code>— which
          stays a 404 for every other account, signed in or not. Nothing else changes anywhere, and
          nothing behind it is privileged: it is the same project, read the same way, drawn
          differently.
        </p>
        {enabled && (
          <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">
            <Link href="/admin/design-system" className="font-semibold text-cc-ink underline">
              The design system
            </Link>{' '}
            is the language it is built from.
          </p>
        )}
        {error && (
          <div className="mt-2.5">
            <CcMessageStrip state="error" headline="Not saved." announce>
              {error}
            </CcMessageStrip>
          </div>
        )}
      </CcCard>
    </div>
  );
}
