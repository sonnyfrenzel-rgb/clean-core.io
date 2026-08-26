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
    expect(source).toContain('testCaseCount > 0 ? (');
    expect(source).toContain('coveragePercentage !== undefined ? (');
  });

  test('the architect sign-off shows no confidence bar without a score', () => {
    const source = fs.readFileSync(path.join(ROOT, 'components/ArchitectSignOff.tsx'), 'utf8');
    // Optional, so a missing score cannot be silently defaulted by a caller.
    expect(source).toContain('confidenceScore?: number;');
    expect(source).toContain('No confidence score was computed');
  });
});

test.describe('workflow inputs never reach a shell as interpolated text', () => {
  test('usage-report passes the dispatch input through the environment', () => {
    const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/usage-report.yml'), 'utf8');
    // A ${{ }} expression inside a run: block is executed as shell text.
    const runBlocks = wf.split(/^\s*run: \|/m).slice(1);
    for (const block of runBlocks) {
      const body = block.split(/^\s{0,8}- name:/m)[0];
      expect(body, 'a dispatch input is interpolated into a run: block').not.toMatch(/\$\{\{\s*inputs\./);
    }
    expect(wf).toContain('RECIPIENT: ${{ inputs.recipient }}');
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
