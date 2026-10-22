/**
 * A tab left open across a deploy — roadmap 3.0.21 (8).
 *
 * The previous build was only noticed after it crashed (`lib/stale-build.ts`):
 * a missing chunk, an error boundary, and an automatic reload that could drop
 * what the reader was typing. Now, when the tab comes back into view, it asks
 * `/api/health` which build the server runs, and if that is not the build the
 * tab runs, the shell shows a quiet "Clean-Core.io was updated — Reload" strip.
 * It never reloads by itself.
 *
 * Which build the tab runs: the version is compiled in (`APP_VERSION`). The
 * commit is not, so the tab learns it from the first answer that names its own
 * version — a fix shipped without a version bump is then noticed too. An answer
 * that already names another version is not learnt from: that tab is old.
 *
 * Pure and without imports; `components/NewVersionWatcher.tsx` does the asking.
 */
export interface BuildIdentity {
  version: string;
  commit: string | null;
}

/** What `/api/health` answered, as far as a build is concerned — or `null` when it named none. */
export function servedBuild(body: unknown): BuildIdentity | null {
  if (!body || typeof body !== 'object') return null;
  const { version, commit } = body as { version?: unknown; commit?: unknown };
  if (typeof version !== 'string' || !version) return null;
  return { version, commit: typeof commit === 'string' && commit ? commit : null };
}

/** True when the server runs another build than this tab. An answer without a build says nothing. */
export function isOtherBuild(tab: BuildIdentity, served: BuildIdentity | null): boolean {
  if (!served) return false;
  if (served.version !== tab.version) return true;
  return tab.commit !== null && served.commit !== null && served.commit !== tab.commit;
}

/** The tab's identity after an answer: the commit is learnt once, from an answer of its own version. */
export function learnBuild(tab: BuildIdentity, served: BuildIdentity | null): BuildIdentity {
  if (tab.commit !== null || !served || served.version !== tab.version) return tab;
  return { version: tab.version, commit: served.commit };
}

/** At most one question per minute, however often the tab is switched to. */
export const NEW_VERSION_CHECK_INTERVAL_MS = 60_000;

export const NEW_VERSION_HEADLINE = 'Clean-Core.io was updated.';
export const NEW_VERSION_BODY =
  'This tab still runs the previous version. Reload when you are ready — finish what you are typing first; reloading deletes nothing that is stored.';
