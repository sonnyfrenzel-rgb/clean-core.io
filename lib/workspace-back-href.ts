import { isWorkspaceView } from '@/lib/workspace-model';

const LAYER_ID = /^[A-Za-z][\w-]{0,63}$/;

/**
 * Where "Back to workspace" leads. Pure, so the rule can be read and tested in
 * one place: the view and the layer come from the stage's own address and are
 * checked against what the workspace understands — a view in the URL is a
 * perspective, never a grant (ADR-018), and an unknown one is simply dropped.
 */
export function workspaceBackHref({
  projectId,
  shell,
  search,
}: {
  projectId: string;
  /** Whether this account has the object-page workspace (`workspaceShellEnabled`). */
  shell: boolean;
  /** The stage's `location.search`, e.g. `?view=it&from=it-answers-heading`. */
  search: string;
}): string {
  if (!shell) return '/dashboard';
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const from = params.get('from');
  const query = isWorkspaceView(view) ? `?view=${view}` : '';
  const hash = from && LAYER_ID.test(from) ? `#${from}` : '';
  return `/project/${encodeURIComponent(projectId)}${query}${hash}`;
}

/**
 * What the stage header shows where "Back to workspace" stands: nothing on the
 * demo (no project), a held place while the profile is still loading — before
 * that every account reads as having no workspace, and a click would send a
 * workspace user to the dashboard (QA review of 472315d93455, f8d5367e0a00) —
 * and the link once it is known where it leads.
 */
export function stageBackLink({
  projectId,
  profileLoading,
  shell,
  search,
}: {
  projectId: string;
  profileLoading: boolean;
  shell: boolean;
  search: string;
}): { kind: 'none' } | { kind: 'pending' } | { kind: 'link'; href: string; to: 'workspace' | 'dashboard' } {
  if (!projectId) return { kind: 'none' };
  if (profileLoading) return { kind: 'pending' };
  return { kind: 'link', href: workspaceBackHref({ projectId, shell, search }), to: shell ? 'workspace' : 'dashboard' };
}

/**
 * Where a stage is left *from*, on the workspace page — the element "Back to
 * workspace" scrolls back to. Ids that stand on the object page, each owned by
 * the component that renders the link (block D, D.29).
 */
export const WORKSPACE_RETURN = {
  tools: 'workspace-tools',
  nextStep: 'next-step',
  status: 'workspace-status',
} as const;

export type WorkspaceReturnPoint = (typeof WORKSPACE_RETURN)[keyof typeof WORKSPACE_RETURN];

/**
 * A link from the workspace into a stage that remembers where it came from:
 * `/project/<id>/<path>?view=<view>&from=<element>`. `workspaceBackHref` reads
 * the same two parameters on the way back, so "Back to workspace" returns to the
 * view the reader was in and to the control they left by (the coordinator's
 * addendum to D.9). Without a view — the demo, which has no workspace to return
 * to — the link is the stage's plain address.
 */
export function stageHref({
  base,
  path,
  view,
  from,
}: {
  /** `/project/<id>`, or `/demo` for the demo's stages. */
  base: string;
  path: string;
  view?: string | null;
  from?: WorkspaceReturnPoint;
}): string {
  const target = `${base}/${path}`;
  if (!isWorkspaceView(view)) return target;
  const params = new URLSearchParams({ view });
  if (from) params.set('from', from);
  return `${target}?${params.toString()}`;
}
