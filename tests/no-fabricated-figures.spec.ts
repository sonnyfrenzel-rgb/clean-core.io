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

test.describe('no fabricated figures on measured values', () => {
  for (const rel of MEASURED_VALUE_SURFACES) {
    test(`${rel} substitutes no invented measurement`, () => {
      const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const pattern of BANNED) {
        expect(source, `${rel} reintroduced "${pattern}"`).not.toContain(pattern);
      }
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
    // It follows the testing phase of the shared contract now — done only when
    // every case passed — so this page and the dashboard cannot disagree.
    // Strictly narrower than both.
    expect(source).toContain('testingPhase.done ? (');
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
    expect(wf).not.toMatch(/\$\{\{\s*inputs\./);
    expect(wf).toContain('npx tsx scripts/send-usage-report.ts --apply');
    expect(wf, 'and no override on the command line either').not.toMatch(/--to\s/);
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

  test('the Jira modal does not simulate a sync', () => {
    const source = fs.readFileSync(path.join(ROOT, 'components/JiraIntegrationModal.tsx'), 'utf8');
    // It used to setTimeout its way to a success screen while the server has no
    // token persistence at all.
    expect(source).not.toMatch(/setTimeout\([\s\S]{0,120}setStep\('success'\)/);
    expect(source).toContain('not available yet');
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
