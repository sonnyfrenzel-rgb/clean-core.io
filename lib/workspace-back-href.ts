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
