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
