import { demoListRow } from '@/lib/demo-list-row';
import MyWorkspaceSwitch from '@/components/MyWorkspaceSwitch';

/**
 * One "My workspace" (01.10.2026).
 *
 * Two pages carried that title: the old dashboard here, where every sign-in
 * lands, and the 3.0 list report under `/admin/workspace`. This layout makes
 * `/dashboard` the one address and decides which of the two it shows — the 3.0
 * list for every account with the new interface switched on
 * (`lib/workspace-shell.ts`), the old page for everybody else until 3.0, so a
 * community account sees exactly what it saw yesterday (`docs/ROADMAP.md`,
 * preamble). `/admin/workspace` redirects here.
 *
 * A layout and not a change to the page, because the list's demo row is
 * computed by the engine on the server (`lib/demo-list-row.ts`) and the page
 * is a client component. The route is rendered per request (the page is
 * `force-dynamic`), so there is no ISR here; the engine runs once per server
 * process instead — `demoListRow` holds its answer, which cannot change
 * before the next deploy (QA review of 072f79996d01, 6794b045c131).
 */

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <MyWorkspaceSwitch demo={demoListRow()}>{children}</MyWorkspaceSwitch>;
}
