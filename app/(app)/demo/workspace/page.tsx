import { Suspense } from 'react';
import type { Metadata } from 'next';
import DemoWorkspaceShell from '@/components/demo/DemoWorkspaceShell';
import { buildDemoWorkspace } from '@/lib/demo-workspace';
import { DEMO_PROJECT_TITLE, DEMO_STRIP_NOTICE } from '@/lib/demo-marks';

/**
 * The demo in the 3.0 workspace — roadmap 3.0.7, `DESIGN.md` §6.1.2.
 *
 * The same demo as `/demo/{stage}` (roadmap 0.10), in all three views and all
 * layers of the new workspace, with the tour. Built on the server from the
 * example file by the engine of this release; identical for every account.
 *
 * Behind the same switch as `/project/{id}` until 3.0 — the client component
 * answers 404 to an account without it, exactly as the workspace does. The
 * route is a static segment, so it wins over `/demo/[stage]`.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: `${DEMO_PROJECT_TITLE} | Clean-Core.io`,
  description: DEMO_STRIP_NOTICE,
  robots: { index: false, follow: false },
};

export default function DemoWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <DemoWorkspaceShell data={buildDemoWorkspace()} />
    </Suspense>
  );
}
