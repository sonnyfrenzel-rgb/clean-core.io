import type { Project } from '@/lib/types';

/**
 * Trust Chain Run Guard (v1.19)
 *
 * Enforces that downstream pages only operate on projects with an
 * active immutable analysis run. If no run exists, the user is
 * redirected to the Analyze page to create one.
 *
 * This closes the Trust Chain gap identified in the Delta Report:
 * without this guard, pages would render stale or unverified data
 * from denormalized project fields instead of immutable run data.
 */

/**
 * Checks whether the project has an active analysis run.
 * @returns true if the project has a valid activeRunId, false otherwise
 */
export function hasActiveRun(project: Project | null): boolean {
  return !!(project?.activeRunId);
}

/**
 * Redirects to the Analyze page when no active run exists.
 * Uses window.location.replace for a hard redirect (replaces history entry).
 * Returns false so callers can use: `if (!enforceActiveRun(data, id)) return;`
 */
export function enforceActiveRun(project: Project | null, projectId: string): boolean {
  if (hasActiveRun(project)) return true;

  if (typeof window !== 'undefined') {
    window.location.replace(`/project/${projectId}/analyze?reason=no-run`);
  }
  return false;
}

