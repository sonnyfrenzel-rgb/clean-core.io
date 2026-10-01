/**
 * Guard against numbers the product did not measure.
 *
 * The delivery handover screen showed "10 Automated Tests" and "92% Estimated
 * Coverage" whenever those fields were missing — and because `length === 0` is
 * falsy, a run that generated nothing at all showed them too, under a green
 * tick. Two more sites did the same for confidence: 95% routing confidence and
 * 75% recommendation confidence, the latter directly above the architect's
 * signature.
 *
 * These are source-level assertions rather than rendering tests because the
 * defect is a coding pattern, not a layout: `?? someNumber` or `|| someNumber`
 * on a measured value silently converts "we do not know" into a figure a
 * customer will quote. Product defaults (the free tier's 5 transformations) are
 * a different thing and stay allowed — they are configuration, not measurement.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

/** Files that display measured values to a user. */
const MEASURED_VALUE_SURFACES = [
  'app/(app)/project/[projectId]/delivery/page.tsx',
  'app/(app)/project/[projectId]/transformation/page.tsx',
  'app/(app)/project/[projectId]/analyze/page.tsx',
  'app/(app)/project/[projectId]/design/page.tsx',
  // The two stage exports, moved out of those pages in block D, D.28.
  'lib/analysis-export.ts',
  'lib/design-export.ts',
  'components/ArchitectSignOff.tsx',
];

/** Exact strings that were the defect. If any returns, the test fails. */
const BANNED = [
  'testCases?.length || 10',
  'testCases?.length ?? 10',
  'coverageEstimate?.percentage || 92',
  'coverageEstimate?.percentage ?? 92',
  'confidenceScore || 95',
  'confidenceScore ?? 95',
  'recommendationConfidence || 75',
  'recommendationConfidence ?? 75',
  'cleanCoreScore || 70',
  'cleanCoreScore ?? 70',
];

/**
 * The shape of the defect rather than its six spellings: a measured value —
 * a count of tests, a percentage, a coverage, a confidence, a score — with
 * `||` or `??` and a non-zero number behind it. `BANNED` alone let
 * `testCases?.length || 12` or `percentage ?? 93` through (QA full review of
 * fc787674705f, 4e5a58582c23). A `0` fallback is not an invented figure and
 * stays allowed, and so does a line count guarding a division.
 */
const MEASURED_FALLBACK =
  /\b\w*(?:(?:[Tt]estCases|[Tt]ests|[Cc]ases)\??\.length|[Pp]ercentage|[Cc]overage\w*|[Cc]onfidence\w*|[Ss]core)\s*(?:\|\||\?\?)\s*[1-9]/;

test.describe('no fabricated figures on measured values', () => {
  test('the shape check catches the variants, and lets a zero and a line count through', () => {
    for (const bad of [
      'testCases?.length || 12',
      'coverageEstimate?.percentage ?? 93',
      'run.confidenceScore || 90',
      'recommendationConfidence ?? 80',
      'signedCleanCoreScore ?? 65',
      ...BANNED,
    ]) {
      expect(MEASURED_FALLBACK.test(bad), `the check misses "${bad}"`).toBe(true);
    }
    for (const fine of ['signedCleanCoreScore ?? 0', "code.split('\\n').length || 1", 'transformationsLimit ?? 5']) {
      expect(MEASURED_FALLBACK.test(fine), `the check refuses "${fine}"`).toBe(false);
    }
  });

  for (const rel of MEASURED_VALUE_SURFACES) {
    test(`${rel} substitutes no invented measurement`, () => {
      const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const pattern of BANNED) {
        expect(source, `${rel} reintroduced "${pattern}"`).not.toContain(pattern);
      }
      const hit = MEASURED_FALLBACK.exec(source);
      expect(hit?.[0] ?? null, `${rel} puts an invented figure behind a measured value`).toBeNull();
    });
  }

  test('the delivery screen says so when there is no test suite', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'app/(app)/project/[projectId]/delivery/page.tsx'),
      'utf8',
    );
    expect(source).toContain('No test suite generated');
    expect(source).toContain('Coverage not estimated');
    // The tick in front of each line has to follow the fact, not the layout.
    //
    // This used to assert `testCaseCount > 0 ? (` — the tick followed the number
    // of test cases *generated*, which says nothing about whether any of them
    // ran, and the line beside it claimed they were verified. It then followed
    // `testsPassed > 0 && testsFailed === 0 && testsWithoutVerdict === 0`, which
    // still went green beside *simulated* cases: it checked for failures and for
    // missing verdicts, not for mocks.
    //
    // It follows the testing phase of the shared contract now, and the narrow
    // half of it: `testingPhase.done` was still satisfied by a row of `Passed`
    // strings, and `testCases[].status` is in the client update allowlist of
    // `firestore.rules` — so a browser write put a green tick here beside
    // "every generated test returned a pass". `proven` is what the contract
    // calls a verdict something checked (`lib/workflow-steps.ts`), it is what
    // the stepper and the rail paint green, and it is strictly narrower than
    // every condition this line has had.
    expect(source).toContain('testingPhase.proven ? (');
    expect(source).not.toContain('testingPhase.done ? (');
    // And the line beside the tick says which of the two it is.
    expect(source).toContain('no test run is on record behind these verdicts');
    expect(source).toContain('coveragePercentage !== undefined ? (');
  });

  test('the architect sign-off shows no confidence bar without a score', () => {
    const source = fs.readFileSync(path.join(ROOT, 'components/ArchitectSignOff.tsx'), 'utf8');
    // Optional, so a missing score cannot be silently defaulted by a caller.
    expect(source).toContain('confidenceScore?: number;');
    expect(source).toContain('No confidence score was computed');
  });
});

test.describe('a private report goes to one address, and no input reaches a shell', () => {
  test('usage-report takes no recipient at all', () => {
    const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/usage-report.yml'), 'utf8');
    // The report is the account list with usage figures. A free-text recipient
    // on manual dispatch turned this into a way to send it anywhere: the job
    // authenticates to production with OIDC, builds the report and mailed it to
    // whatever was typed (QA full review of 52f171091948, 32e9456648b6). The
    // address is the one the script knows.
    expect(wf, 'no dispatch input at all').not.toMatch(/inputs:\s*\n\s+recipient:/);

    // The job holds `id-token: write`, so every step in it — from the first —
    // can mint a token the provider accepts on the repository alone. Installing
    // with `--ignore-scripts --omit=dev` stopped install scripts but not runtime
    // code: `firebase-admin`, `clsx`, `tailwind-merge` and their graph still ran
    // beside that permission (QA review, fa0aaea6cc47). So the job installs
    // nothing and runs nothing from npm.
    const commands = runCommands(wf).join('\n');
    expect(commands, 'the OIDC job installs packages again').not.toMatch(/\b(?:npm|npx|yarn|pnpm|bun)\b/);
    expect(commands, 'the OIDC job runs something out of node_modules again').not.toContain('node_modules');
    expect(commands, 'the report runs through tsx again').not.toMatch(/\btsx\b/);
    expect(wf, 'the npm cache is restored into the OIDC job again').not.toMatch(/cache:\s*['"]?npm/);
    expect(wf).toContain(
      'run: node --experimental-strip-types --import ./scripts/lib/ts-extension-hook.mjs scripts/send-usage-report.ts --apply',
    );
    // The credential is a short-lived access token handed to the one step that
    // uses it — not a credentials file exported to every later step, which
    // carries the OIDC request token itself.
    expect(wf).toContain("token_format: 'access_token'");
    expect(wf).toContain('create_credentials_file: false');
    expect(wf).toContain('export_environment_variables: false');
    expect(wf).toContain('GOOGLE_ACCESS_TOKEN: ${{ steps.auth.outputs.access_token }}');
    expect(wf).not.toMatch(/\$\{\{\s*inputs\./);
    expect(wf, 'and no override on the command line either').not.toMatch(/--to\s/);
  });

  test('the report the OIDC job runs imports nothing but its own modules and node:', () => {
    // The other half of the guard above: with no `node_modules` in the job, a
    // third-party import would fail on a Friday — this fails it on the push.
    // Walks every value import from the entry point; `import type` is erased
    // by Node's type stripping and loads nothing (fa0aaea6cc47).
    const seen = new Set<string>();
    const outside: string[] = [];
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = fs.readFileSync(file, 'utf8');
      const specs = [
        ...src.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm),
        ...src.matchAll(/^\s*export\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm),
        ...src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
        ...src.matchAll(/\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g),
      ].map((m) => m[1]);
      for (const spec of specs) {
        if (spec.startsWith('node:')) continue;
        if (!spec.startsWith('.')) { outside.push(`${path.relative(ROOT, file)} -> ${spec}`); continue; }
        const base = path.resolve(path.dirname(file), spec);
        const target = [base, `${base}.ts`, `${base}.mjs`].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
        expect(target, `${path.relative(ROOT, file)} imports ${spec}, which does not resolve`).toBeTruthy();
        visit(target!);
      }
    };
    visit(path.join(ROOT, 'scripts/send-usage-report.ts'));
    visit(path.join(ROOT, 'scripts/lib/ts-extension-hook.mjs'));
    expect(outside, 'a package is loaded beside the OIDC permission').toEqual([]);
    // The walk reached the report itself, not just the entry point.
    expect([...seen].map((f) => path.relative(ROOT, f).replace(/\\/g, '/'))).toEqual(
      expect.arrayContaining(['lib/usage-report.ts', 'lib/usage-report-email.ts', 'scripts/lib/firestore-rest.ts']),
    );
  });

  /**
   * Every `run:` command in the file, block, folded and inline alike.
   *
   * The first version split on `run: |` and therefore looked at literal blocks
   * only — an inline `run: echo "${{ inputs.x }}"` or a folded `run: >` walked
   * straight past it (QA review of cc87c7717ca1, 3e88a1000811). The second
   * version read the block indicator but not a YAML comment after it, so
   * `run: | # build` was mistaken for an inline command and its whole body was
   * never looked at (QA review of 6a24b632ff44) — the quietest possible way for
   * this sweep to report success over code it did not read.
   */
  const runCommands = (wf: string): string[] => {
    const lines = wf.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]);
      if (!m) continue;
      const [, indent, rest] = m;
      // `|`, `>`, with chomping and indentation indicators, and an optional
      // trailing comment — everything else on the line is the command itself.
      if (rest && !/^[|>][-+0-9]*[ \t]*(?:#.*)?$/.test(rest.trim())) {
        out.push(rest); // inline scalar
        continue;
      }
      // Block or folded: everything indented deeper than the `run:` key.
      const body: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        if (line.trim() === '') { body.push(line); continue; }
        const lead = line.length - line.trimStart().length;
        if (lead <= indent.length) break;
        body.push(line);
      }
      out.push(body.join('\n'));
    }
    return out;
  };

  test('the collector reads a block whose header carries a comment', () => {
    // The regression fixture for the finding above. Every one of these four is
    // a run command a workflow may legitimately write, and the body of each has
    // to reach the sweep — otherwise the sweep passes by not looking.
    const fixture = [
      'jobs:',
      '  a:',
      '    steps:',
      '      - name: block with a comment',
      '        run: | # the comment that used to hide this body',
      '          echo "BLOCK ${{ inputs.one }}"',
      '      - name: folded, chomped, with a comment',
      '        run: >-   # and here too',
      '          echo "FOLDED ${{ inputs.two }}"',
      '      - name: plain block',
      '        run: |',
      '          echo "PLAIN ${{ inputs.three }}"',
      '      - name: inline',
      '        run: echo "INLINE ${{ inputs.four }}"',
    ].join('\n');

    const found = runCommands(fixture);
    expect(found.length, 'one command per run: key').toBe(4);
    for (const marker of ['BLOCK', 'FOLDED', 'PLAIN', 'INLINE']) {
      expect(found.some((c) => c.includes(marker)), `the ${marker} command was not collected`).toBe(true);
    }
    // And the sweep's own assertion catches all four, not merely three.
    const caught = found.filter((c) => /\$\{\{\s*(?:inputs|github\.event)\./.test(c));
    expect(caught.length, 'a run command carrying a dispatch input slipped through').toBe(4);
  });

  test('no workflow interpolates a dispatch input into any run command', () => {
    // A ${{ }} expression inside a run: is executed as shell text, in jobs that
    // hold id-token: write and the provider keys.
    const dir = path.join(ROOT, '.github/workflows');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    expect(files.length).toBeGreaterThan(3);

    // The collector has to see the commands that are really there.
    const total = files.reduce((n, f) => n + runCommands(fs.readFileSync(path.join(dir, f), 'utf8')).length, 0);
    expect(total, 'the sweep found no run commands at all').toBeGreaterThan(10);

    for (const file of files) {
      for (const command of runCommands(fs.readFileSync(path.join(dir, file), 'utf8'))) {
        expect(command, `${file} interpolates a dispatch input into a run command`).not.toMatch(/\$\{\{\s*(?:inputs|github\.event)\./);
      }
    }
  });

  test('the discontinued survey workflows are gone, not merely disabled', () => {
    // A manual dry run printed the production recipient list into public
    // Actions logs, and the digest could be mailed to any address
    // (90d94fa15308, c0557b564704). The survey is over (Sonny, 16.09.2026).
    for (const wf of ['survey-send.yml', 'survey-digest.yml']) {
      expect(fs.existsSync(path.join(ROOT, '.github/workflows', wf)), `${wf} is gone`).toBe(false);
    }
  });
});

test.describe('privilege changes are explicit', () => {
  test('set-admin-claim rejects a non-boolean isAdmin', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'app/api/admin/set-admin-claim/route.ts'),
      'utf8',
    );
    // `isAdmin !== false` granted the claim for the string "false" and for "0".
    expect(source).not.toContain('isAdmin !== false');
    expect(source).toContain("typeof isAdmin !== 'boolean'");
  });
});

test.describe('a failed verification is not a forgery verdict', () => {
  test('export/verify checks the property QuotaError actually sets', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/api/export/verify/route.ts'), 'utf8');
    expect(source).toContain('error?.status === 429');
    // The catch used to answer HTTP 200 { valid: false } — a genuine pack
    // reported as forged. Not checking is not the same as checking and failing.
    expect(source).not.toMatch(/valid:\s*false[\s\S]{0,120}status:\s*200/);
  });
});

test.describe('the gate that runs untrusted code holds no production secret', () => {
  test('the validate job takes nothing but the test model key', () => {
    // `validate` installs dependencies, builds, and runs the whole Playwright
    // suite — a job that executes a lot of code nobody on this team wrote, and
    // that any change to a spec can steer. It used to be handed
    // MFA_BACKUP_CODE_PEPPER, PILOT_APPROVAL_SECRET and S4_ENCRYPTION_KEY from
    // the same repository secrets the live service is deployed with: the key
    // every stored S/4 credential is encrypted with, and the secret that signs
    // approval tokens, both present in every test run (security audit of
    // v2.11.0, SEC-2026-024).
    //
    // The suite never needed those values, only values of the right shape, and
    // `playwright.config.ts` sets all three to visibly-test ones. So the rule
    // is simply that this job gets no secret at all — except the model key,
    // which is a separate, test-only credential by name and by design.
    const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
    const start = wf.indexOf('\n  validate:');
    expect(start, 'the validate job is gone').toBeGreaterThan(-1);
    const rest = wf.slice(start + 1);
    const nextJob = rest.slice(1).search(/^ {2}[a-z][a-z-]*:$/m);
    const job = nextJob === -1 ? rest : rest.slice(0, nextJob + 1);

    const used = [...job.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(
      used.filter((name) => name !== 'TEST_GEMINI_API_KEY'),
      'the job that runs the test suite was given a production secret',
    ).toEqual([]);

    // And the three in question are still deployed to the service, so removing
    // them from the gate did not quietly remove them from production.
    const deploy = wf.slice(wf.indexOf('\n  deploy:'));
    for (const name of ['MFA_BACKUP_CODE_PEPPER', 'PILOT_APPROVAL_SECRET', 'S4_ENCRYPTION_KEY']) {
      expect(deploy, `${name} no longer reaches the running service`).toContain(`secrets.${name}`);
    }
  });

  test('the test values are committed, so the suite needs no secret to run', () => {
    // If these fall away, CI starts failing for a reason that looks like a code
    // regression, and the tempting fix is to hand the production secrets back.
    const config = fs.readFileSync(path.join(ROOT, 'playwright.config.ts'), 'utf8');
    for (const name of ['PILOT_APPROVAL_SECRET', 'MFA_BACKUP_CODE_PEPPER', 'S4_ENCRYPTION_KEY', 'AUDIT_SIGNING_KEY']) {
      expect(config, `${name} has no test value in the config`).toContain(`process.env.${name} =`);
    }
  });
});

test.describe('hooks run before any early return', () => {
  const files = ['components/UserOnboarding.tsx', 'components/design/RoutingRationale.tsx'];
  for (const rel of files) {
    test(`${rel} has no hook after a conditional return`, () => {
      const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const firstReturnNull = source.search(/^\s{2}if \(.*\) return null;/m);
      if (firstReturnNull === -1) return;
      const after = source.slice(firstReturnNull);
      // React throws "rendered more hooks than during the previous render" when
      // the server render returns early and the browser render does not.
      expect(after, `${rel} calls a hook after an early return`).not.toMatch(
        /\buse(State|Effect|Memo|Callback|Ref|Reducer)\s*\(/,
      );
    });
  }
});

/**
 * Wording that tells the reader a Jira sync or connection happened: the old
 * modal's success screen and its relatives. The server cannot keep a Jira token
 * (`app/api/auth/jira/callback/route.ts`), so no such sentence can be true.
 * Returns the matched phrases.
 */
function jiraPromises(source: string): string[] {
  const patterns = [
    /\b(?:synced|synchroni[sz]ed|connected|exported|pushed|sent|written|published|uploaded|transformed)\b[^\n]{0,60}\b(?:to|with|into|in)\s+(?:your\s+)?Jira\b/gi,
    /\bJira\b[^\n.]{0,40}\b(?:connected|synced|sync(?:ed)? complete|successfully)\b/gi,
    /\bsync complete\b/gi,
    /\b(?:master\s+)?(?:epics?|user\s+stor(?:y|ies)|stories)\s+(?:was\s+|were\s+|has\s+been\s+|have\s+been\s+)?created\b/gi,
    /\bwriting to [A-Z][A-Z0-9]+-\d+\b/gi,
  ];
  return patterns.flatMap((re) => [...source.matchAll(re)].map((m) => m[0]));
}

/**
 * The 1-based lines of a component that name Jira with no "not available yet"
 * on the same line or within three lines of it — close enough to be the same
 * JSX text or the element beside it, which is where a reader meets it.
 */
function jiraWithoutCaveat(source: string, reach = 3): number[] {
  const lines = source.split(/\r?\n/);
  const caveat = lines.map((l) => /not available yet/i.test(l));
  const out: number[] = [];
  lines.forEach((line, i) => {
    if (!/\bJira\b/i.test(line)) return;
    const from = Math.max(0, i - reach);
    const to = Math.min(lines.length - 1, i + reach);
    if (!caveat.slice(from, to + 1).some(Boolean)) out.push(i + 1);
  });
  return out;
}

test.describe('nothing reports success it did not achieve', () => {
  test('the compliance HUD does not claim 100% when nothing needs sign-off', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'app/(app)/project/[projectId]/transformation/page.tsx'),
      'utf8',
    );
    // `: 100` declared full compliance whenever no finding happened to require
    // sign-off — a parse miss, empty source, or purely informational findings —
    // and overrode a real stored score of 40 with a green ring.
    expect(source).not.toMatch(/signOffFindings\.length > 0[\s\S]{0,220}:\s*100;/);
    expect(source).toContain("typeof project?.cleanCoreScore === 'number'");
    expect(source).toContain("'Not scored yet'");
  });

  test('no Jira screen simulates a sync', () => {
    // The Jira modal used to setTimeout its way to a success screen while the
    // server has no token persistence at all. It was never mounted and D.22c
    // removed it; the claim now holds for every source file, so a screen that
    // brings the fake sync back fails here wherever it lives.
    expect(fs.existsSync(path.join(ROOT, 'components/JiraIntegrationModal.tsx'))).toBe(false);
    const files: string[] = [];
    const walk = (rel: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const child = `${rel}/${e.name}`;
        if (e.isDirectory()) walk(child);
        else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(child);
      }
    };
    for (const dir of ['app', 'components', 'lib', 'hooks']) walk(dir);
    const product = files.filter((f) => !f.startsWith('app/api/'));
    expect(product.length, 'the walk found no product files').toBeGreaterThan(100);
    for (const f of files) {
      const source = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(source, `${f} fakes a sync`).not.toMatch(/setTimeout\([\s\S]{0,120}setStep\('success'\)/);
    }
    for (const f of product) {
      const source = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(jiraPromises(source), `${f} promises a Jira sync nothing performs`).toEqual([]);
      if (f.endsWith('.tsx')) expect(jiraWithoutCaveat(source), `${f} names Jira without saying the sync is not available`).toEqual([]);
    }
  });

  // QA 9ed1bc8e4168: the guard used to accept "not available yet" anywhere in a
  // file that named Jira, so one caveat in a comment covered a success screen
  // three hundred lines further down. These are the two checks above on text
  // whose answer is known.
  test('the Jira checks see a promise and a caveat that is out of reach', () => {
    const promises = [
      'Sync Complete! Your Solution Design has been transformed into detailed Epics and User stories in Jira.',
      '<p>Work packages synced to Jira.</p>',
      '<span>Connected to your Jira</span>',
      'toast.success("Exported to Jira")',
      '<p>Master Epic created in TRANSFORM.</p>',
      '<p>12 user stories have been created.</p>',
      '<p>Jira connected successfully.</p>',
      '<p>Synchronizing Work Packages... Writing to TRANSFORM-1</p>',
    ];
    for (const text of promises) expect(jiraPromises(text), text).not.toEqual([]);
    for (const text of [
      '<p>Jira sync is not available yet: the server does not persist the tokens.</p>',
      '// the Jira start keeps the step-up gate',
      '<p>No Epic and no User Story is created.</p>',
    ]) {
      expect(jiraPromises(text), text).toEqual([]);
    }

    const near = ['<section>', '  <h3>Jira</h3>', '  <p>Not available yet: tokens are not stored.</p>', '</section>'].join('\n');
    expect(jiraWithoutCaveat(near)).toEqual([]);
    const far = [
      '// Jira sync is not available yet.',
      ...Array.from({ length: 20 }, (_, i) => `  <div key="${i}" />`),
      '  <button>Send to Jira</button>',
    ].join('\n');
    expect(jiraWithoutCaveat(far)).toEqual([22]);
  });

  test('the Jira callback does not report a success it cannot back', () => {
    const source = fs.readFileSync(path.join(ROOT, 'app/api/auth/jira/callback/route.ts'), 'utf8');
    expect(source).toContain('JIRA_AUTH_INCOMPLETE');
    expect(source).not.toMatch(/ok \? 'JIRA_AUTH_SUCCESS'/);
  });
});

test('no scope column shows a meter nobody measured', () => {
  // "Cloud Readiness 95 %" and "Decommission Ratio 80 %" were a number and a
  // bar width written into the file. The Standard Fit column beside them had
  // already given up its invented 90/50/15 for the three words the model
  // returns; these two had nothing behind them at all (UX review of
  // 52f171091948, 29e1d6c0013f).
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/analyze/TargetScopeMapping.tsx'), 'utf8');
  expect(src, 'no hard-coded percentage as a value').not.toMatch(/>\s*\d{1,3}%\s*</);
  expect(src, 'and none as a bar width').not.toMatch(/width:\s*'\d{1,3}%'/);
  // The one bar that stays is driven by the model's own word.
  expect(src).toContain("standardFit?.potential === 'High' ? 3");
});
