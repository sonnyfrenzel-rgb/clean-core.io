/**
 * The one convenience of "My workspace" this browser remembers (ADR-123, W9):
 * whether a returning account sees its programs as tiles or as the list. Never
 * stored on an account, a project, a run or anywhere a server sees it. A
 * browser that refuses storage simply starts, by its width, from the list on a
 * phone or the tiles elsewhere each time (Q12 of the UX review of 22.11.2026).
 *
 * `cc.workspace.mode` is named in the Privacy Policy's list of local-storage
 * keys since version 1.4 (`lib/legal/texts/privacy.en.ts` / `.de.ts`; lawyer,
 * statement 20c E1). {@link PRIVACY_PENDING_STORAGE_KEYS} is the register of
 * what that text still has to add — empty since 1.4 — and
 * `tests/workspace-tiles.spec.ts` holds it: a key leaves the register once the
 * published text names it.
 *
 * The lens "Read as Business · IT · Management" (`cc.workspace.lens`) is gone:
 * owner decision 27.11.2026, one view in My workspace for everyone. Nothing
 * reads or writes that key any more; a value a browser kept is removed once at a
 * signed-in visit (`lib/storage-cleanup.ts`, `STORAGE_CLEANUPS`).
 *
 * What the key holds — nothing personal, nothing about a project:
 *   - `cc.workspace.mode`: `tiles` or `list` — how the programs are shown.
 */
import { useSyncExternalStore } from 'react';

export type WorkspaceMode = 'tiles' | 'list';

export const WORKSPACE_MODE_KEY = 'cc.workspace.mode';

/**
 * Local-storage keys this release adds that the Privacy Policy's list does not
 * name yet (ADR-123 (7)(i)). Release 3.3.0 waited for this list to be empty:
 * privacy policy 1.4 names both keys (lawyer, statement 20c).
 */
export const PRIVACY_PENDING_STORAGE_KEYS: readonly string[] = [];

/**
 * The width up to which My workspace opens as the list when this browser remembers no choice (UX review 22.11.2026,
 * Q12): on a phone the list's rows are shorter than a tile and every row is a 44 px touch target. The breakpoint S of
 * `DESIGN.md` §2.9, the same 600 px the page's own `max-[600px]` classes use.
 */
export const LIST_FIRST_MAX_WIDTH = 600;

/** No stored choice: the list on a phone, the tiles everywhere else. */
export function defaultWorkspaceMode(): WorkspaceMode {
  try {
    return window.matchMedia(`(max-width: ${LIST_FIRST_MAX_WIDTH}px)`).matches ? 'list' : 'tiles';
  } catch {
    return 'tiles';
  }
}

export function readWorkspaceMode(): WorkspaceMode {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(WORKSPACE_MODE_KEY);
  } catch {
    /* storage refused: the default for this width stands */
  }
  if (stored === 'list' || stored === 'tiles') return stored;
  return defaultWorkspaceMode();
}

const noSubscription = () => () => {};

/**
 * The stored mode, read where React renders — hydration-safe. A server render, and the hydration of one, read the
 * default (`tiles`); every render after that reads this browser's storage. Reading the storage
 * in a `useState` initialiser instead was safe only while no server ever rendered the component: the shell holds an
 * account page until the browser has answered, but the component did not depend on that (14.11.2026, the
 * dev-server hydration warning on the new-account view). The chosen value stays in component state; this hook gives
 * only where it starts.
 */
export function useStoredWorkspaceMode(): WorkspaceMode {
  return useSyncExternalStore(noSubscription, readWorkspaceMode, () => 'tiles' as const);
}

export function rememberWorkspaceMode(mode: WorkspaceMode): void {
  try {
    window.localStorage.setItem(WORKSPACE_MODE_KEY, mode);
  } catch {
    /* not remembered */
  }
}
