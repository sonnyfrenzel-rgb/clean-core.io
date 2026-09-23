/**
 * Who the operational mails go to — read, never written down.
 *
 * Until 23.09.2026 the administrator's address was a string literal in four
 * files of a **public** repository (`ad3ed1b` onwards). That is not a leak in
 * the sense the Actions-log one was — the address is also the author address of
 * all 1,318 commits and is served publicly by the GitHub API — but a literal in
 * the source is the one copy we can actually remove, and it is the copy a
 * scraper finds without knowing the repository exists.
 *
 * So the address lives in `REPORT_RECIPIENT`: a GitHub Actions secret for CI, a
 * line in `.env.local` for a developer machine. There is no fallback, on the
 * pattern of `AUDIT_SIGNING_KEY` (`lib/audit-signing-key.ts`): a default would
 * put the address straight back into the source, and a mail silently sent to a
 * stale address is worse than a job that stops and says why.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Reads a value from the environment first, falling back to the local .env files. */
function readFromEnvOrDotenv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  for (const file of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    const line = fs
      .readFileSync(p, 'utf8')
      .replace(/\r/g, '')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`));
    if (line) {
      const v = line.slice(key.length + 1).replace(/^["']|["']$/g, '').trim();
      if (v) return v;
    }
  }
  return undefined;
}

/**
 * The address operational mail goes to.
 *
 * Throws rather than guessing. The message names both places it could come
 * from, because the two failures — a missing Actions secret and a missing line
 * in `.env.local` — look identical from the stack trace and are fixed
 * differently.
 */
export function reportRecipient(): string {
  const value = readFromEnvOrDotenv('REPORT_RECIPIENT');
  if (!value) {
    throw new Error(
      'REPORT_RECIPIENT is not set, so there is nobody to send to. ' +
        'In CI: `gh secret set REPORT_RECIPIENT` and pass it into the job\'s env. ' +
        'Locally: add a REPORT_RECIPIENT= line to .env.local.',
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    throw new Error('REPORT_RECIPIENT is set but is not an e-mail address.');
  }
  return value;
}
