'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import NavigationButtons from '@/components/NavigationButtons';
import { BACK_LINK_CLASS } from '@/components/BackLink';
import { useUserProfile } from '@/hooks/useUserProfile';
import { workspaceShellEnabled } from '@/lib/workspace-shell';
import { stageBackLink, stageBackPlace } from '@/lib/workspace-back-href';

const noSubscription = () => () => {};
const readSearch = () => window.location.search;
const serverSearch = () => '';

type Props = React.ComponentProps<typeof NavigationButtons>;

/**
 * The end of a stage page.
 *
 * Without a workspace (every account until roadmap 3.0.1) it is what it was:
 * "Back to X / Proceed to Y", the dashboard's linear flow, unchanged — the
 * props are `NavigationButtons`' own and pass straight through.
 *
 * In the workspace a stage is a tool, and a tool has no "proceed": the next
 * step is the workspace's to say, once, from its rules (roadmap 6.5), not a
 * position in a list of seven (ADR-018 — the toolbar "is not a progress
 * indicator"). What stays is the way back, at the end of a long page as at its
 * top, to the same view and layer. Nothing is lost by it: no stage's forward
 * button did anything but navigate (`onProceed` has no caller), and the gates
 * it showed — "Confirm architecture to proceed" — are the stage's own controls
 * above it.
 */
export default function StageFooter(props: Props) {
  const params = useParams();
  const projectId = typeof params?.projectId === 'string' ? params.projectId : '';
  const { profile, loading } = useUserProfile();
  const shell = workspaceShellEnabled(profile);
  const search = useSyncExternalStore(noSubscription, readSearch, serverSearch);

  if (loading) return null;
  if (!shell) return <NavigationButtons {...props} />;

  const back = stageBackLink({ projectId, profileLoading: loading, shell, search });
  if (back.kind !== 'link') return null;
  const place = stageBackPlace(search);
  return (
    <div data-stage-footer="" className="cc-no-print mt-10 border-t border-cc-line pt-4">
      <Link href={back.href} className={BACK_LINK_CLASS}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to workspace
        {place ? <span className="font-medium">{` · ${place}`}</span> : null}
      </Link>
    </div>
  );
}
