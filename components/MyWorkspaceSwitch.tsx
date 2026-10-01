'use client';

import React from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { workspaceShellEnabled } from '@/lib/workspace-shell';
import WorkspaceListReport, { type WorkspaceDemoRow } from '@/components/workspace/WorkspaceListReport';

/**
 * Which "My workspace" an account sees at `/dashboard` — see
 * `app/(app)/dashboard/layout.tsx`.
 *
 * The 3.0 list only for an account with the switch on *and* in good standing:
 * a suspended or half-activated account keeps the old page, which is the one
 * that knows how to say so and offers the way out. While the profile loads the
 * old page renders, as it always has — it shows its own skeleton — so nothing
 * flashes a list the account may not get.
 */
export default function MyWorkspaceSwitch({
  demo,
  children,
}: {
  demo: WorkspaceDemoRow;
  children: React.ReactNode;
}) {
  const { profile, loading } = useUserProfile();
  const status = (profile as { status?: string } | null)?.status;
  const standing = status !== 'suspended' && status !== 'deleted' && status !== 'pending';
  if (!loading && workspaceShellEnabled(profile) && standing) {
    return <WorkspaceListReport demo={demo} />;
  }
  return <>{children}</>;
}
