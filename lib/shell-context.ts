import { useSyncExternalStore } from 'react';

/**
 * What the shell bar learns from the page under it — `DESIGN.md` §2.1, block D
 * step D.29 — through named window events, not through a React context (the
 * repository has none, by rule) and not through a read of its own.
 *
 * Two facts travel up:
 *
 *   - **The project's name, for the path** ("My workspace › Order limit check ›
 *     Analyze"). The shell does not fetch it: the project document carries the
 *     source code, and one more `getDoc` in the layout would load that code a
 *     second time on every page of a project just to print a title. The page
 *     already read the document — `loadProjectAndHydrate` in
 *     `lib/project-loader.ts` is the read every stage and the object page make
 *     — so the loader announces the name it has, and the shell shows it only
 *     for the project in its own address.
 *   - **Whether a project search is on the page.** `CommandSearch` (the ⌘K
 *     dialog of the object page) says so when it mounts and when it goes, and
 *     the shell then carries the one visible button that opens it — the Shell
 *     Bar slot §2.1 names. The button asks by a named event; the dialog, which
 *     owns its index and its focus handling, opens itself. Where there is no
 *     search (a stage, the dashboard) there is no button: a control that opens
 *     nothing is a claim.
 *
 * Nothing here is stored anywhere but in this module, for this page view.
 */

export const SHELL_PROJECT_EVENT = 'cc:shell-project';
export const PROJECT_SEARCH_AVAILABLE_EVENT = 'cc:project-search-available';
export const OPEN_PROJECT_SEARCH_EVENT = 'cc:open-project-search';

interface ShellProject {
  projectId: string;
  name: string;
}

let announcedProject: ShellProject | null = null;
let searchMounted = 0;

const hasWindow = () => typeof window !== 'undefined';

/** Called by the page's own project read. An empty name is not announced — the shell then shows no project crumb. */
export function announceShellProject(projectId: string, name: unknown): void {
  if (!hasWindow() || !projectId) return;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return;
  if (announcedProject?.projectId === projectId && announcedProject.name === trimmed) return;
  announcedProject = { projectId, name: trimmed };
  window.dispatchEvent(new CustomEvent(SHELL_PROJECT_EVENT, { detail: announcedProject }));
}

/**
 * Forgets the announced name. Called when the signed-in account changes: the
 * name lives in this module for the page view, and a client-side sign-out
 * keeps the module, so the next account opening the same project address was
 * shown a name its own read had refused (QA slice review of 094ef824c55e,
 * 528688d033bd).
 */
export function forgetShellProject(): void {
  if (!hasWindow() || !announcedProject) return;
  announcedProject = null;
  window.dispatchEvent(new CustomEvent(SHELL_PROJECT_EVENT, { detail: null }));
}

const subscribeProject = (onChange: () => void) => {
  window.addEventListener(SHELL_PROJECT_EVENT, onChange);
  return () => window.removeEventListener(SHELL_PROJECT_EVENT, onChange);
};

/** The announced name of the project in the shell's address, or `null` until the page has read it. */
export function useShellProjectName(projectId: string | null): string | null {
  const current = useSyncExternalStore(
    subscribeProject,
    () => announcedProject,
    () => null,
  );
  if (!projectId || !current || current.projectId !== projectId) return null;
  return current.name;
}

/**
 * `CommandSearch` registers itself for as long as it is mounted. A count rather
 * than a flag, so a remount (a view switch, React's strict double effect) never
 * leaves the button without a dialog or the dialog without a button.
 */
export function registerProjectSearch(): () => void {
  if (!hasWindow()) return () => {};
  searchMounted += 1;
  window.dispatchEvent(new CustomEvent(PROJECT_SEARCH_AVAILABLE_EVENT));
  return () => {
    searchMounted = Math.max(0, searchMounted - 1);
    window.dispatchEvent(new CustomEvent(PROJECT_SEARCH_AVAILABLE_EVENT));
  };
}

const subscribeSearch = (onChange: () => void) => {
  window.addEventListener(PROJECT_SEARCH_AVAILABLE_EVENT, onChange);
  return () => window.removeEventListener(PROJECT_SEARCH_AVAILABLE_EVENT, onChange);
};

/** Whether a project search is on the page right now. */
export function useProjectSearchAvailable(): boolean {
  return useSyncExternalStore(
    subscribeSearch,
    () => searchMounted > 0,
    () => false,
  );
}

/** Asks the project search on the page to open. The focused element is the one it hands the focus back to. */
export function openProjectSearch(): void {
  if (!hasWindow()) return;
  window.dispatchEvent(new CustomEvent(OPEN_PROJECT_SEARCH_EVENT));
}

/** For `CommandSearch`: run `handler` whenever the shell asks for the search. */
export function onOpenProjectSearch(handler: () => void): () => void {
  if (!hasWindow()) return () => {};
  window.addEventListener(OPEN_PROJECT_SEARCH_EVENT, handler);
  return () => window.removeEventListener(OPEN_PROJECT_SEARCH_EVENT, handler);
}
