/**
 * Two conveniences of "My workspace" this browser remembers (ADR-123, W9): the
 * lens a returning account reads its tiles through, and whether it sees tiles
 * or the list. Never stored on an account, a project, a run or anywhere a
 * server sees it; views are views only (CLAUDE.md). A browser that refuses
 * storage simply starts from Business and tiles each time.
 *
 * Both keys must be named in the Privacy Policy's list of local-storage keys
 * before this ships (`lib/legal/texts/privacy.en.ts`) — an open owner/lawyer
 * item of 3.3.0, not done on this branch.
 */
import { isWorkspaceView, type WorkspaceView } from '@/lib/workspace-model';

export type WorkspaceLens = WorkspaceView;
export type WorkspaceMode = 'tiles' | 'list';

export const WORKSPACE_LENS_KEY = 'cc.workspace.lens';
export const WORKSPACE_MODE_KEY = 'cc.workspace.mode';

export function readWorkspaceLens(): WorkspaceLens {
  try {
    const v = window.localStorage.getItem(WORKSPACE_LENS_KEY);
    return isWorkspaceView(v) ? v : 'business';
  } catch {
    return 'business';
  }
}

export function readWorkspaceMode(): WorkspaceMode {
  try {
    return window.localStorage.getItem(WORKSPACE_MODE_KEY) === 'list' ? 'list' : 'tiles';
  } catch {
    return 'tiles';
  }
}

export function rememberWorkspaceLens(lens: WorkspaceLens): void {
  try {
    window.localStorage.setItem(WORKSPACE_LENS_KEY, lens);
  } catch {
    /* not remembered: nothing else depends on it */
  }
}

export function rememberWorkspaceMode(mode: WorkspaceMode): void {
  try {
    window.localStorage.setItem(WORKSPACE_MODE_KEY, mode);
  } catch {
    /* not remembered */
  }
}
