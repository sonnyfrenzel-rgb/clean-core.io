/**
 * Every key the app writes to the browser's `localStorage` or `sessionStorage`, with what it is for and how long it
 * stays — the register behind privacy policy section 7 ("Cookies & Tracking").
 *
 * Why a register: the list in section 7 fell behind the code twice (a session key from 3.0.21 was missing until the
 * privacy review of 3.2.0, which asked for a test that keeps code and list together). `tests/storage-keys-register.spec.ts`
 * reads every `setItem` and `removeItem` call in `app/`, `components/`, `hooks/` and `lib/`, resolves the key it
 * names — a literal, a template, a constant, a key function, an import, a parameter through its callers — and fails
 * on a key that is not registered here, on one it cannot resolve, and on an entry here that nothing writes. It also
 * holds `namedInPolicy` against the current privacy policy in both languages: true means section 7 names the key,
 * false means it does not (yet) — so the gap is a line in this file, not a surprise in a review.
 *
 * Pure and import-free, so the spec and any page can read it.
 */

export type StorageArea = 'local' | 'session';

export interface StorageKeyEntry {
  /** The key, or for a family of keys the fixed part before the variable one (`match: 'prefix'`). */
  key: string;
  /** `prefix`: the key is `key` followed by a project id, a version or similar. */
  match: 'exact' | 'prefix';
  area: StorageArea;
  /** What the entry holds, in a few words. */
  holds: string;
  /** Why the interface needs it — what it steers. */
  purpose: string;
  /** How long it stays. `local` stays until the reader clears site data unless the line says otherwise. */
  lifetime: string;
  /** Who can cause it to be written. */
  writtenFor: 'signed-in' | 'demo' | 'anyone';
  /** Whether privacy policy section 7 names the key today (both languages). */
  namedInPolicy: boolean;
}

/** How the policy spells an entry: the key, or a family with "…" for the variable part. */
export function policyName(entry: Pick<StorageKeyEntry, 'key' | 'match'>): string {
  return entry.match === 'prefix' ? `${entry.key}…` : entry.key;
}

export const STORAGE_KEYS: readonly StorageKeyEntry[] = Object.freeze([
  /* ------------------------------------------------------------------ local storage */
  {
    key: 'cleancore.demo.v1',
    match: 'exact',
    area: 'local',
    holds: 'the state of the demo workspace (which stages were opened, choices made in it)',
    purpose: 'the demo picks up where the reader left it',
    lifetime: 'until "Reset demo" or cleared site data',
    writtenFor: 'demo',
    namedInPolicy: true,
  },
  {
    key: 'cc.demo.tour.v1',
    match: 'exact',
    area: 'local',
    holds: 'how far the demo tour got',
    purpose: 'the tour resumes at its station',
    lifetime: 'until "Show tips again" or cleared site data',
    writtenFor: 'demo',
    namedInPolicy: true,
  },
  {
    key: 'cc.workspace.coachMarks.dismissed',
    match: 'exact',
    area: 'local',
    holds: 'the ids of the tips the reader dismissed',
    purpose: 'a dismissed tip stays away',
    lifetime: 'until "Show tips again" or cleared site data',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
  {
    key: 'cc.workspace.firstLook.seen',
    match: 'exact',
    area: 'local',
    holds: 'the ids of the last 50 projects whose first look was shown',
    purpose: 'the first look opens by itself only on the first visit to a project',
    lifetime: 'until cleared site data; bounded to 50 projects',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
  {
    key: 'cc.newProject.introSeen',
    match: 'exact',
    area: 'local',
    holds: '"yes"',
    purpose: 'the introduction in the new-project dialog is shown once',
    lifetime: 'until cleared site data',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
  {
    key: 'cc.workspace.analysis.read',
    match: 'exact',
    area: 'local',
    holds: 'the ids of the last 50 projects whose analysis was opened with a result',
    purpose: 'the hint pointing to the analysis goes once it was read',
    lifetime: 'until cleared site data; bounded to 50 projects',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
  {
    key: 'cc.processMap.outline',
    match: 'exact',
    area: 'local',
    holds: '"open" or "closed"',
    purpose: 'the outline beside the process map keeps the reader\'s choice',
    lifetime: 'until cleared site data',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
  {
    key: 'cc.processMap.outline.page',
    match: 'exact',
    area: 'local',
    holds: '"open" or "closed"',
    purpose: 'the same choice for the process map on Analyze, Business view, kept apart',
    lifetime: 'until cleared site data',
    writtenFor: 'signed-in',
    namedInPolicy: false,
  },
  {
    key: 'cc-fr-derived-',
    match: 'prefix',
    area: 'local',
    holds: '"1" per project',
    purpose: 'the requirements of a project were derived, so the page shows them instead of the start button',
    lifetime: 'until cleared site data',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
  {
    key: 'cc-design-writing-',
    match: 'prefix',
    area: 'local',
    holds: 'a tab id and a time, per project',
    purpose: 'a design being written in another tab is not started twice',
    lifetime: 'removed when the writing ends; a stale one expires after the longest writing time',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
  {
    key: 'cc-business-layer-writing-',
    match: 'prefix',
    area: 'local',
    holds: 'a tab id and a time, per project',
    purpose: 'a documentation being written in another tab is not started twice',
    lifetime: 'removed when the writing ends; a stale one expires after the longest writing time',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
  {
    key: 'cc.auth.signedIn',
    match: 'exact',
    area: 'local',
    holds: '"1" — nothing about the account',
    purpose: 'a public page loads the sign-in SDK only where an account was signed in, so it contacts nobody else before sign-in',
    lifetime: 'removed on sign-out and on an expired session',
    writtenFor: 'signed-in',
    namedInPolicy: false,
  },
  /* ---------------------------------------------------------------- session storage */
  {
    key: 'cc:rules-draft:',
    match: 'prefix',
    area: 'session',
    holds: 'an unsaved draft of the business rules being edited, per project',
    purpose: 'a reload in the same tab does not lose the draft',
    lifetime: 'until saved or discarded, or the tab is closed',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
  {
    key: 'cc:design-skip-questions:',
    match: 'prefix',
    area: 'session',
    holds: '"1" per project',
    purpose: 'after "Skip questions" in Design a reload in the same tab does not ask again',
    lifetime: 'until the tab is closed',
    writtenFor: 'signed-in',
    namedInPolicy: false,
  },
  {
    key: 'cc_chunk_reload_at',
    match: 'exact',
    area: 'session',
    holds: 'the time of the last automatic reload',
    purpose:
      'a page that failed to load after a new release reloads once, not in a loop; only with the signed-in hint set — without sign-in the browser’s own record of a reload is the guard and nothing is written (lib/stale-build.ts)',
    lifetime: 'until the tab is closed',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
  {
    key: 'cc.terms.declined.',
    match: 'prefix',
    area: 'session',
    holds: 'the Terms version whose change notice was set aside',
    purpose: 'the notice is asked again at the next sign-in, not on every page',
    lifetime: 'removed on acceptance; otherwise until the tab is closed',
    writtenFor: 'signed-in',
    namedInPolicy: true,
  },
]);
