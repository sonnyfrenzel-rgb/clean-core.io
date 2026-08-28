import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { scanCodeContent } from '../lib/staged-code-scan';

/**
 * Green verdicts nobody earned.
 *
 * This is the defect class v2.5.0 removed the fake Differential Sandbox Tester
 * for, and the rule `docs/ARCHITECTURE.md` §5.7 was written about. Both review
 * passes found it back in ten places at once, and they are the screens a
 * customer photographs.
 *
 * The pattern is always the same shape: a value is missing, and the code
 * substitutes the best possible one. A missing summary becomes "fully
 * supported". A missing deployment target becomes "Private Cloud (RISE)". A
 * missing score becomes 30, or 80, or 100. Zero findings becomes a pristine
 * codebase. None of those is a measurement.
 *
 * These guards read the rendered output, with JSX comments stripped, so the
 * explanations above each fix cannot satisfy their own assertion.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const rendered = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test.describe('the Clean Core Score on screen is the one that was signed', () => {
  const REL = 'app/(app)/project/[projectId]/analyze/page.tsx';

  test('no second formula recomputes it in the browser', () => {
    // Comment-stripped: the note left in the source explaining what was removed
    // names the very identifiers this asserts are gone.
    const src = rendered(REL);
    // 60 % coverage + 30 % a "standard fit bonus" regex-matched out of Gemini
    // prose, defaulted to 80 + 10 % the stored value. A model answering "High"
    // moved the customer-facing gauge above what the Run can prove.
    expect(src).not.toContain('liveCleanCoreScore');
    expect(src).not.toContain('standardFitBonus');
    expect(src).toContain('signedCleanCoreScore');
  });

  test('an unscored project shows nothing rather than a default', () => {
    const src = read(REL);
    expect(src).toMatch(/signedCleanCoreScore[\s\S]{0,300}?:\s*null/);
    // The renderer has to have a not-yet-computed branch.
    expect(rendered(REL)).toContain('Not yet computed');
  });

  test('the stored score is not overwritten on the way to the renderer', () => {
    expect(read(REL)).not.toMatch(/analysisData\.cleanCoreScore\s*=\s*live/);
  });
});

test.describe('the payload banner reports a scan that happened', () => {
  test('pasted code is scanned, not just uploaded code', () => {
    const src = read('app/(app)/project/[projectId]/analyze/page.tsx');
    // The textarea sets `legacyCode` straight from onChange. The banner used to
    // hang on that value merely existing.
    expect(src).toContain('scanCodeContent');
    expect(src).toContain('stagedScanBlock');
  });

  test('the banner is bound to the verdict, not to the presence of code', () => {
    const jsx = rendered('app/(app)/project/[projectId]/analyze/page.tsx');
    expect(jsx).toMatch(/stagedScanBlock \?[\s\S]{0,600}?Malicious Payload Check failed/);
    expect(jsx).toMatch(/Malicious Payload Check passed/);
  });

  test('and the scan itself still catches what it always caught', () => {
    expect(scanCodeContent('REPORT z_ok. WRITE / 1.')).toBeNull();
    expect(scanCodeContent('const x = eval("1");')).toMatch(/Security Block/);
    expect(scanCodeContent('db_password = hunter2')).toMatch(/Security Block/);
    expect(scanCodeContent('-----BEGIN RSA PRIVATE KEY-----')).toMatch(/Security Block/);
  });
});

test.describe('delivery reports artefacts rather than assuming them', () => {
  const REL = 'app/(app)/project/[projectId]/delivery/page.tsx';

  test('opening the page no longer marks the project completed', () => {
    const src = read(REL);
    // Navigating straight to /delivery after an analysis run was enough to write
    // `status: 'completed'` — with no check on code, tests, docs or sign-off.
    expect(src).not.toMatch(/updateDoc\([\s\S]{0,200}?status:\s*'completed'/);
  });

  test('"Ready for Deployment" is not asserted unconditionally', () => {
    const jsx = rendered(REL);
    expect(jsx).not.toContain('Ready for Deployment');
    expect(jsx).toContain('Incomplete');
  });

  test('the integrity report checks the artefacts it reports on', () => {
    const src = read(REL);
    expect(src).toContain('hasGeneratedCode');
    expect(src).toContain('hasDocumentation');
    const jsx = rendered(REL);
    expect(jsx).toContain('No blueprint generated');
    expect(jsx).toContain('No transformed code generated');
  });
});

test.describe('generated code is labelled as generated', () => {
  const REL = 'app/(app)/project/[projectId]/transformation/page.tsx';

  test('nothing claims verification without a validator', () => {
    // No compiler, no test runner, no deterministic check has looked at this
    // output; the path even falls back to accepting arbitrary non-JSON text.
    expect(rendered(REL)).not.toContain('AI Verified');
    expect(rendered(REL)).toContain('AI Generated');
  });

  test('local checkboxes do not raise the compliance figure', () => {
    const src = rendered(REL);
    // Browser state, not persisted, not tied to a reviewer or any evidence —
    // and it used to drive a signed 40 to a photographed 100.
    expect(src).not.toMatch(/signedOffIds\.size\s*\/\s*signOffFindings\.length/);
    expect(src).toContain('const currentScore = scoredCleanCore;');
  });
});

test.describe('missing values are not replaced by the best available answer', () => {
  test('an absent coverage summary is not "fully supported"', () => {
    const src = read('components/analyze/CoverageVerdict.tsx');
    expect(src).not.toMatch(/summary\?\.overall\s*\|\|\s*'fully'/);
    expect(rendered('components/analyze/CoverageVerdict.tsx')).toContain('Not summarised');
  });

  test('an absent deployment target is not Private Cloud', () => {
    const src = read('components/design/RoutingRationale.tsx');
    expect(src).not.toMatch(/s4Deployment === 'public' \? 'Public Cloud' : 'Private Cloud \(RISE\)'/);
    expect(rendered('components/design/RoutingRationale.tsx')).toContain('Not specified');
  });

  test('zero findings is not a verdict on the code', () => {
    const jsx = rendered('components/analyze/ConstructFindings.tsx');
    expect(jsx).not.toContain('Pristine Codebase');
    expect(jsx).toContain('No findings from these detectors');
  });

  test('the standardisation fit is not three invented percentages', () => {
    const src = read('components/analyze/TargetScopeMapping.tsx');
    // 90 / 50 / 15 were numbers chosen to look measured. The model returns one
    // of three words.
    expect(src).not.toMatch(/'90%'\s*:\s*standardFit\?\.potential === 'Medium'/);
  });

  test('an empty test run is not a pass rate', () => {
    const src = read('app/(app)/project/[projectId]/testing/page.tsx');
    // `0 / 0` reached the dashboard as NaN% and a broken chart.
    expect(src).toMatch(/if \(total === 0\) return null;/);
  });
});

test.describe('the TCO page does not invent a business case', () => {
  const REL = 'app/(app)/project/[projectId]/tco/page.tsx';

  test('no score is substituted for an unscored project', () => {
    const src = read(REL);
    expect(src).not.toMatch(/cleanCoreScore\s*\|\|\s*30/);
    // Without a baseline there is no model, and the page says so instead of
    // presenting euro figures.
    expect(src).toContain('if (scoreBefore === null) return null;');
    expect(rendered(REL)).toContain('No baseline to model against');
  });

  test('the uploaded line count is not multiplied', () => {
    const src = rendered(REL);
    // `Math.max(1000, Math.min(lineCount * 10, 50000))` turned a ten-line
    // snippet into 1,000 lines, and every figure came from that.
    expect(src).not.toMatch(/lineCount \* 10/);
  });

  test('the outputs are labelled as a scenario', () => {
    expect(rendered(REL)).toMatch(/Annual Net Savings ·  ?Scenario/);
  });
});

test.describe('the TCO model refuses degenerate inputs', () => {
  const REL = 'app/(app)/project/[projectId]/tco/page.tsx';

  test('the modernised side is not floored while the legacy side rounds to zero', () => {
    const src = rendered(REL);
    // The floors were asymmetric: legacy days round to 0 for a small codebase
    // while modern days were pinned at 1 each. The model then reported that
    // modernising *costs* €1,550 a year, pays back in −116 months, and reduces
    // overhead by −Infinity %. The old `lineCount * 10` extrapolation hid it by
    // never letting `loc` fall below 1,000.
    expect(src).not.toMatch(/Math\.max\(1,\s*Math\.round\(legacy/);
  });

  test('no baseline cost means no model', () => {
    const src = rendered(REL);
    expect(src).toContain('if (legacyAnnualTotal <= 0) return null;');
  });

  test('the overhead figure cannot be an infinity', () => {
    const src = rendered(REL);
    // Computed once, behind the zero guard, instead of inline in the markup
    // where a division by zero reached the screen as "-Infinity%".
    expect(src).not.toMatch(/1 - calculations\.modernAnnualTotal \/ calculations\.legacyAnnualTotal/);
    expect(src).toContain('overheadReductionPct');
  });
});
