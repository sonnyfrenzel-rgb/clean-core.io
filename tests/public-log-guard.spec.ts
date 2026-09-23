import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * What a public Actions log may see.
 *
 * The repository is public, so every line a workflow prints is readable by
 * anyone. On 15.09.2026 the survey scripts were switched off for leaking
 * recipient addresses into that log, and `send-survey-digest.ts` was fixed with
 * a `local` gate.
 *
 * `send-usage-report.ts` was not. It kept printing the subject line
 * ("9 von 43 Accounts aktiv"), the weekly registration/activation/run figures
 * and the administrator's address on every scheduled run — run
 * 35333168862 (KW 38) has all of it. The fix to one script did not protect the
 * other because nothing compared them, which is the same reason the landing page
 * drifted into four heading scales.
 *
 * So the rule lives here rather than in either script: a sender may hold a
 * recipient address and business figures, and it may print them on a developer's
 * machine, but the line that does so must be gated on not running in CI.
 */
const ROOT = path.resolve(__dirname, '..');

/** Every script that mails something to a person. */
const SENDERS = ['scripts/send-usage-report.ts', 'scripts/send-survey-digest.ts'];

/**
 * Every sender, including the ones that only ever mail the administrator.
 *
 * `SENDERS` above is about what a *log* may show. This list is about what the
 * *source* may contain, which is a wider set: `send-security-alert.ts` and
 * `scripts/security/lib/mail.mjs` print nothing but did hold the address as a
 * literal. Keeping two lists was how the 15.09.2026 fix missed
 * `send-usage-report.ts`, so the wider rule gets the wider list.
 */
const ALL_MAILERS = [
  'scripts/send-usage-report.ts',
  'scripts/send-survey-digest.ts',
  'scripts/send-security-alert.ts',
  'scripts/security/lib/mail.mjs',
];

const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

test('every sender knows whether it is running in a public log', () => {
  for (const file of SENDERS) {
    const src = read(file);
    expect(
      src,
      `${file} mails to a person but never asks whether its output goes into a public Actions log`,
    ).toMatch(/!process\.env\.CI && !process\.env\.GITHUB_ACTIONS/);
  }
});

test('no sender prints the recipient on an ungated line', () => {
  for (const file of SENDERS) {
    const offenders = read(file)
      .split('\n')
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      // A line that prints the recipient straight to stdout. `say(...)` and the
      // ternary in send-survey-digest are the gated forms and are allowed.
      .filter(({ line }) => /^console\.log\(/.test(line) && /\$\{to\}/.test(line) && !/local \?/.test(line));

    expect(
      offenders.map((o) => `${file}:${o.no}  ${o.line}`),
      'this line puts a real e-mail address into a public log',
    ).toEqual([]);
  }
});

test('the guard is not vacuous — the senders do hold an address and do print', () => {
  for (const file of SENDERS) {
    const src = read(file);
    expect(src, `${file} does not look like a sender any more — has this guard outlived its subject?`).toMatch(
      /reportRecipient|--to/,
    );
    expect(src, `${file} prints nothing at all, so the assertions above cannot fail`).toMatch(/console\.log\(/);
  }
});

/**
 * The address itself is not written down.
 *
 * It was, in four files, from `ad3ed1b` until 23.09.2026. Removing it does not
 * undo the exposure — the same address is the author of all 1,318 commits and
 * the GitHub API serves it to anyone — but it is the one copy that can be
 * removed, and the one a scraper finds without knowing the repository exists.
 *
 * The rule is deliberately about *any* address, not about one person's: a guard
 * that named the string it forbids would have to contain it.
 */
test('no mailer writes an e-mail address into the source', () => {
  // `info@clean-core.io` and the like are the product's own public sender
  // addresses; they belong in the code and are not what this guards.
  const OWN_DOMAIN = /@clean-core\.io$/;
  const EXAMPLE = /@example\.(com|org|net)$/;
  const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

  const offenders: string[] = [];
  for (const file of ALL_MAILERS) {
    read(file)
      .split('\n')
      .forEach((line, i) => {
        for (const hit of line.match(ADDRESS) ?? []) {
          if (OWN_DOMAIN.test(hit) || EXAMPLE.test(hit)) continue;
          offenders.push(`${file}:${i + 1}`);
        }
      });
  }

  expect(
    offenders,
    'a personal e-mail address is written into the source of a public repository. ' +
      'Read it from REPORT_RECIPIENT instead (scripts/lib/report-recipient.ts).',
  ).toEqual([]);
});

test('every mailer reads the recipient instead of holding it', () => {
  for (const file of ALL_MAILERS) {
    expect(
      read(file),
      `${file} sends mail but never reads REPORT_RECIPIENT — where does its address come from?`,
    ).toMatch(/reportRecipient|REPORT_RECIPIENT/);
  }
});
