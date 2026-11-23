'use client';

import React, { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import InviteReaderDialog from '@/components/InviteReaderDialog';
import { getAuth } from '@/lib/firebase';
import { wt } from '@/lib/workspace-messages';

/**
 * "Invite to view" in the header of every tool (UX review 22.11.2026, L7). The sharing flow that exists — the
 * invitation dialog of My workspace and the workspace header (`InviteReaderDialog`, `/api/projects/[id]/invitations`):
 * read access bound to one confirmed e-mail address, source code included, with expiry and withdrawal. No new data.
 *
 * Only for the project's owner: an invited reader cannot invite, and a button the server would refuse is not
 * offered. The owner is read from the signed-in account in the browser, after the first render, so a statically
 * rendered page (the demo) never shows it.
 */
export default function InviteToView({
  projectId,
  projectName,
  ownerId,
}: {
  projectId: string;
  /** The name the dialog says the invitation is for. */
  projectName: string;
  /** `project.userId`. */
  ownerId: string | null | undefined;
}) {
  const [uid, setUid] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Who is signed in, as the auth state says it — after the first render, so a server render never shows the button.
  useEffect(() => {
    try {
      return getAuth().onAuthStateChanged((user) => setUid(user?.uid ?? null));
    } catch {
      return undefined;
    }
  }, []);

  const isOwner = !!ownerId && uid === ownerId;
  if (!isOwner || !projectId) return null;
  return (
    <>
      <CcButton
        variant="ghost"
        onClick={() => setOpen(true)}
        icon={<Mail size={16} aria-hidden={true} />}
        data-family-invite=""
      >
        {wt('biz.invite')}
      </CcButton>
      {open ? <InviteReaderDialog projectId={projectId} projectName={projectName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
