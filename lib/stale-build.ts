/**
 * A tab from the previous build (roadmap 3.0.6, decision Sonny 07.10.2026).
 *
 * After a deploy a tab opened on the previous build either asks for chunk hashes
 * that no longer exist, or runs a chunk of the new build against the old runtime.
 * Every error boundary that can catch this (`app/error.tsx` and the stage
 * boundaries of documentation and testing) reloads once; when that one reload is
 * spent, it says "A new version of Clean-Core.io is available" with a reload
 * button instead of a crash card with the raw message — after the 3.0.5 deploy an
 * open 3.0.4 tab read like a crash.
 *
 * One module, so the three boundaries cannot drift apart again (the two stage
 * copies had lost the mixed-build patterns).
 */

/** True when the error is one build meeting another, not a bug in this build. */
export function isStaleBuildError(error: { name?: string; message?: string } | null | undefined): boolean {
  const msg = error?.message || '';
  return (
    error?.name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed|ChunkLoadError|error loading dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg) ||
    // Two builds mixed in one tab: a chunk of the new build asks the old
    // runtime for a module it does not have ("reading 'call'"), or calls an
    // export under a name the other build mangled differently.
    /reading 'call'\)|^\(0\s*,\s*[\w$]+\.[\w$]+\) is not a function/.test(msg)
  );
}

const KEY = 'cc_chunk_reload_at';

/**
 * Reloads the tab once to pull the current build. The flag in sessionStorage
 * keeps it to one reload per ten seconds, so a build that keeps failing does not
 * loop. Returns true when it reloaded, false when the reload is spent (or storage
 * is unavailable) and the boundary has to say so instead.
 */
export function reloadOnceForStaleBuild(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 10000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    // Storage blocked: no loop guard, so no automatic reload — the notice offers it.
  }
  return false;
}
