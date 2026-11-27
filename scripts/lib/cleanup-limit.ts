/**
 * `--limit` of `scripts/cleanup-test-accounts.ts`, read strictly.
 *
 * Absent, there is no limit. Present, it must be followed by a positive whole number; anything else — no value,
 * the next flag (`--limit --apply`), `0`, `-3`, `1.5`, `ten` — is refused. A value that did not parse used to read
 * as "no limit", so a mistyped bound on a deleting run deleted everything.
 */
export type CleanupLimit = { ok: true; limit: number | null } | { ok: false; error: string };

export function parseCleanupLimit(argv: readonly string[]): CleanupLimit {
  const i = argv.indexOf('--limit');
  if (i < 0) return { ok: true, limit: null };
  const value = argv[i + 1];
  if (value === undefined || !/^[1-9]\d{0,8}$/.test(value)) {
    return { ok: false, error: `--limit needs a positive whole number, got ${value === undefined ? 'nothing' : JSON.stringify(value)}.` };
  }
  return { ok: true, limit: Number(value) };
}
