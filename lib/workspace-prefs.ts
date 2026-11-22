/**
 * Two conveniences of "My workspace" this browser remembers (ADR-123, W9): the
 * lens a returning account reads its tiles through, and whether it sees tiles
 * or the list. Never stored on an account, a project, a run or anywhere a
 * server sees it; views are views only (CLAUDE.md). A browser that refuses
 * storage simply starts from Business and tiles each time.
 *
 * Both keys are named in the Privacy Policy's list of local-storage keys since
 * version 1.4 (`lib/legal/texts/privacy.en.ts` / `.de.ts`; lawyer, statement
 * 20c E1, with the sentence that the view says nothing about the reader's role,
 * E2). The owner decided on 14.11.2026 to keep both.
 * {@link PRIVACY_PENDING_STORAGE_KEYS} is the register of what that text still
 * has to add — empty since 1.4 — and `tests/workspace-tiles.spec.ts` holds it:
 * a key leaves the register once the published text names it.
 *
 * What each key holds — nothing personal, nothing about a project:
 *   - `cc.workspace.lens`: `business`, `it` or `management` — the lens of the tiles.
 *   - `cc.workspace.mode`: `tiles` or `list` — how the programs are shown.
 */
import { useSyncExternalStore } from 'react';
import { isWorkspaceView, type WorkspaceView } from '@/lib/workspace-model';

export type WorkspaceLens = WorkspaceView;
export type WorkspaceMode = 'tiles' | 'list';

export const WORKSPACE_LENS_KEY = 'cc.workspace.lens';
export const WORKSPACE_MODE_KEY = 'cc.workspace.mode';

/**
 * Local-storage keys this release adds that the Privacy Policy's list does not
 * name yet (ADR-123 (7)(i)). Release 3.3.0 waited for this list to be empty:
 * privacy policy 1.4 names both keys (lawyer, statement 20c).
 */
export const PRIVACY_PENDING_STORAGE_KEYS: readonly string[] = [];

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

const noSubscription = () => () => {};

/**
 * The stored lens and mode, read where React renders — hydration-safe. A server render, and the hydration of one,
 * read the defaults (`business`, `tiles`); every render after that reads this browser's storage. Reading the storage
 * in a `useState` initialiser instead was safe only while no server ever rendered the component: the shell holds an
 * account page until the browser has answered, but the component did not depend on that (14.11.2026, the
 * dev-server hydration warning on the new-account view). The chosen value stays in component state; these hooks
 * give only where it starts.
 */
export function useStoredWorkspaceLens(): WorkspaceLens {
  return useSyncExternalStore(noSubscription, readWorkspaceLens, () => 'business' as const);
}

export function useStoredWorkspaceMode(): WorkspaceMode {
  return useSyncExternalStore(noSubscription, readWorkspaceMode, () => 'tiles' as const);
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
