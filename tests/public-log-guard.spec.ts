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
 * and `recipient   : sonny.frenzel@googlemail.com` on every scheduled run — run
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
      /DEFAULT_RECIPIENT|--to/,
    );
    expect(src, `${file} prints nothing at all, so the assertions above cannot fail`).toMatch(/console\.log\(/);
  }
});
