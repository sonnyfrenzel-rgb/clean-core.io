'use client';

import React from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import WorkspaceListReport, { type WorkspaceDemoRow } from '@/components/workspace/WorkspaceListReport';
import WorkspaceSkeleton from '@/components/workspace/WorkspaceSkeleton';

/**
 * Which "My workspace" an account sees at `/dashboard` — see
 * `app/(app)/dashboard/layout.tsx`.
 *
 * The 3.0 list for every account in good standing (roadmap 3.0.1, ADR-061). A
 * suspended or half-activated account, and a sign-in without a profile yet,
 * keep the old page, which is the one that knows how to say so and offers the
 * way out.
 *
 * While the profile loads, the frame of My workspace stands with its final
 * sizes (`WorkspaceSkeleton`, ADR-123 (5)) — not the old page, which used to
 * render first and was then swapped for the list, a flash and a layout shift
 * on every visit. The old page is loaded only for an account that gets it.
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
  if (loading) return <WorkspaceSkeleton />;
  if (profile && standing) return <WorkspaceListReport demo={demo} />;
  return <>{children}</>;
}
