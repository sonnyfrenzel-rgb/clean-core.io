/**
 * What the sandbox is handed: the generated files and the suite, as plain data.
 *
 * Pure, no imports. The app builds a run request with it (`/api/run-tests`),
 * the isolated runner (`runner/server.ts`) validates the same shape, and the
 * execution core (`./core.ts`) writes exactly these files and nothing else.
 */

export interface SandboxFile {
  /** Relative POSIX path inside the sandbox directory. */
  path: string;
  content: string;
}

/** Longest path a generated file may have. */
export const MAX_SANDBOX_PATH = 300;

/**
 * A generated file's path, made safe to join onto the sandbox directory — or
 * `null` when nothing sensible is left of it.
 *
 * The rule is the one the route has always applied (`..` removed, leading
 * slashes stripped), made total: backslashes become separators, empty and `.`
 * segments disappear, and control characters or an over-long path refuse the
 * file. The core additionally resolves every path and refuses one that lands
 * outside the directory, so this is the first of two checks, not the only one.
 */
export function normalizeSandboxPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (/[\u0000-\u001f]/.test(raw)) return null;
  const segments = raw
    .replace(/\\/g, '/')
    .replace(/\.\./g, '')
    .split('/')
    .filter((s) => s !== '' && s !== '.');
  const joined = segments.join('/');
  if (!joined || joined.length > MAX_SANDBOX_PATH) return null;
  return joined;
}

/**
 * The files of a stored `generatedCode` value.
 *
 * Two shapes exist: the modular one, a JSON array of `{ path, content }`, and
 * the legacy flat one, a single source that is written as `app.ts`. A JSON
 * array whose entries are all well-formed is the modular shape even when some
 * paths normalise to nothing — those files are dropped, exactly as the route
 * dropped them before the runner moved out. A later file with the same path
 * replaces an earlier one, which is what writing them in order used to do.
 */
export function sandboxFilesFromStoredCode(code: string): SandboxFile[] {
  if (!code) return [];
  try {
    const parsed: unknown = JSON.parse(code);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (f) => !!f && typeof f === 'object' && typeof (f as { path?: unknown }).path === 'string' && typeof (f as { content?: unknown }).content === 'string',
      )
    ) {
      const byPath = new Map<string, string>();
      for (const f of parsed as Array<{ path: string; content: string }>) {
        const p = normalizeSandboxPath(f.path);
        if (p) byPath.set(p, f.content);
      }
      return [...byPath.entries()].map(([path, content]) => ({ path, content }));
    }
  } catch {
    /* not JSON → the legacy flat shape below */
  }
  return [{ path: 'app.ts', content: code }];
}

/** The selected case ids as the runner's name filter: word characters only. */
export function sandboxPatterns(selectedTestIds: unknown): string[] {
  if (!Array.isArray(selectedTestIds)) return [];
  return selectedTestIds.map((id) => String(id).replace(/[^A-Za-z0-9_]/g, '')).filter(Boolean);
}
