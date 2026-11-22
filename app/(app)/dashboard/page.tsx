'use client';

import loadOnDemand from 'next/dynamic';

export const dynamic = 'force-dynamic';

/**
 * `/dashboard` — My workspace. The layout decides what stands here
 * (`MyWorkspaceSwitch`): the two products or the program tiles for every
 * account in good standing, and this page only for the others. So the old
 * dashboard (`LegacyDashboard.tsx`) is loaded on demand: it is not in the
 * JavaScript an account in good standing downloads (3.3.0, ADR-123 (5)).
 */
const LegacyDashboard = loadOnDemand(() => import('./LegacyDashboard'), { ssr: false });

export default function DashboardPage() {
  return <LegacyDashboard />;
}
