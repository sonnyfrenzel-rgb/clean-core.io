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
const SENDERS = [
  'scripts/send-usage-report.ts',
  'scripts/send-survey-digest.ts',
  // Added 23.09.2026 after the QA delta review of 4b40254. It was left out of
  // this list on the assumption that it prints nothing — unchecked, and wrong:
  // it printed the recipient and the entire alert body, which names the failed
  // jobs of a security run. The assumption is the defect this file exists to
  // prevent, so the list is now the list of senders, not of senders believed to
  // print.
  'scripts/send-security-alert.ts',
];

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

test('no sender prints the recipient outside the gate', () => {
  // Line-by-line matching is not enough, and the first version of this guard
  // proved it twice: it looked for the `to` spelling only, so it never saw
  // `send-security-alert.ts` printing `RECIPIENT`; and once that spelling was
  // added, the *fixed* file still matched, because a gated line is still a
  // `console.log` when you read it on its own.
  //
  // So the question is structural: is the printing line *inside* a block that
  // asked whether this is CI? Brace counting from the gate is crude, but it is
  // exactly the property that matters, and renaming a variable cannot satisfy
  // it.
  for (const file of SENDERS) {
    const lines = read(file).split(/\r?\n/);

    let depth = 0;
    let gateDepth: number | null = null;
    const ungated: string[] = [];

    lines.forEach((raw, i) => {
      const line = raw.trim();
      const opensGate = /^if \(local\) \{/.test(line);
      const printsRecipient =
        /^console\.log\(/.test(line) && /\$\{(to|RECIPIENT)\}/.test(line) && !/local \?/.test(line);

      if (printsRecipient && gateDepth === null) ungated.push(`${file}:${i + 1}  ${line}`);

      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (opensGate && gateDepth === null) gateDepth = depth;
      else if (gateDepth !== null && depth < gateDepth) gateDepth = null;
    });

    expect(
      ungated,
      'this line puts the recipient into a public Actions log: it prints outside any `if (local)` gate',
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
