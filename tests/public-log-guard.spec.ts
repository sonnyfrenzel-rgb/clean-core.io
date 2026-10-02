import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

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

/**
 * The same rule, observed rather than read (codex code-mail-05).
 *
 * The structural guard above recognises one shape of leak — a `console.log`
 * naming the recipient outside an `if (local)` block. `send-usage-report.ts`
 * prints through a helper, `say`, whose body holds the gate; remove the gate
 * from the helper and every line it prints goes into the public log while the
 * source still matches each pattern above. So the sender is run here as the
 * Friday job runs it — `CI` set, `--apply` — with `fetch` replaced by a trap
 * that answers Firestore and Resend locally, and its whole output is searched
 * for the recipient and the figures. The same run without `CI` is the control:
 * it has to print both, or the assertion could not fail.
 */
test.describe('the usage report sender, run as the Friday job runs it', () => {
  test.describe.configure({ timeout: 120_000 });

  const RECIPIENT = 'public-log-sentinel@example.com';

  function runSender(ci: boolean) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'public-log-'));
    const trapLog = path.join(dir, 'fetch-calls.jsonl');
    const trap = path.join(dir, 'trap.cjs');
    // Nothing leaves the machine: Firestore reads answer with no documents, the
    // snapshot write and the Resend call answer with an id.
    fs.writeFileSync(trap, `
      const fs = require('fs');
      globalThis.fetch = async (url) => {
        fs.appendFileSync(${JSON.stringify(trapLog)}, String(url) + '\\n');
        const body = String(url).endsWith(':runQuery') ? [] : { id: 'trap-message' };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
    `);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_OPTIONS: `--require ${JSON.stringify(trap)}`,
      // Named so the REST client takes the emulator branch and asks gcloud for
      // no token; the trap answers before anything is contacted.
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:1',
      RESEND_API_KEY: 're_dummy_key_for_the_spec',
    };
    delete env.CI;
    delete env.GITHUB_ACTIONS;
    if (ci) env.CI = 'true';
    const r = spawnSync(
      process.execPath,
      [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '--tsconfig', path.join(ROOT, 'tsconfig.json'),
        path.join(ROOT, 'scripts', 'send-usage-report.ts'), '--apply', '--to', RECIPIENT],
      { cwd: dir, env, encoding: 'utf8', timeout: 90_000 },
    );
    const calls = fs.existsSync(trapLog) ? fs.readFileSync(trapLog, 'utf8').trim().split('\n').filter(Boolean) : [];
    return { status: r.status, out: `${r.stdout}\n${r.stderr}`, calls };
  }

  test('in CI its output holds neither the recipient nor a figure', () => {
    const r = runSender(true);
    expect(r.status, r.out).toBe(0);
    expect(r.calls.some((u) => u === 'https://api.resend.com/emails'), 'the run never reached the send').toBe(true);
    expect(r.out).toContain('figures and recipient withheld');
    expect(r.out, 'the recipient is in the public log').not.toContain(RECIPIENT);
    expect(r.out, 'the subject line is in the public log').not.toMatch(/Accounts aktiv/);
    expect(r.out, 'the weekly figures are in the public log').not.toMatch(/registrations|activations|accounts\s+:/);
  });

  test('on a developer machine the same run prints both — the control', () => {
    const r = runSender(false);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain(RECIPIENT);
    expect(r.out).toMatch(/Accounts aktiv/);
    expect(r.out).toMatch(/registrations/);
  });
});
