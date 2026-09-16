import type { Metadata } from 'next';
import WorkspaceListReport from '@/components/workspace/WorkspaceListReport';
import { buildDemoProject } from '@/lib/demo-project';
import { DEMO_PROJECT_TITLE } from '@/lib/demo-marks';

/**
 * "My workspace" as a List Report — roadmap 1.8, `DESIGN.md` §2.2, mockup s7.
 *
 * **Nothing here is live product.** The new interface grows behind an
 * admin-only switch until 3.0 (`docs/ROADMAP.md`, preamble), and **roadmap 1.4
 * builds that switch** — it did not exist when this screen was written. So this
 * mounts where roadmap 1.5 mounted its gallery: inside `app/(app)/admin/`,
 * behind the `profile.isAdmin` gate the admin console already has, checked
 * inside `WorkspaceListReport` itself. `/dashboard` is untouched; a community
 * account sees exactly what it saw yesterday, which
 * `tests/workspace-list-report.spec.ts` asserts rather than assumes.
 *
 * **The one line that changes when 1.4's switch exists.** In
 * `app/(app)/dashboard/page.tsx`, at the top of `Dashboard()`:
 *
 *     if (newWorkspaceEnabled(profile)) return <WorkspaceListReport demo={demo} />;
 *
 * and the demo summary moves to whatever server boundary 1.4 gives the
 * dashboard. The gate inside `WorkspaceListReport` becomes 1.4's predicate at
 * the same moment; it is one `if`, in one file, on purpose.
 *
 * Why this file is a server component: the demo (roadmap 0.10) is computed from
 * the example file in this repository by `buildDemoProject()`, which reads the
 * filesystem and runs the ABAP engine. Its two figures in this table — lines and
 * findings — therefore cannot be produced in a browser, and transcribing them
 * here would be exactly the fabrication 0.10 refuses. ISR for the same reason
 * `/demo/[stage]` uses it: the engine run is deterministic, so a cached copy is
 * only ever as old as the deploy that changed the engine.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'My workspace | Clean-Core.io',
  description: `List report preview — ${DEMO_PROJECT_TITLE} as the first row.`,
  robots: { index: false, follow: false },
};

export default function AdminWorkspacePage() {
  const demo = buildDemoProject();
  return (
    <WorkspaceListReport
      demo={{ lines: demo.totalLines, findings: demo.analyze.findings.length }}
    />
  );
}
