import { test, expect } from '@playwright/test';
import crypto from 'crypto';
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
    // The renderer has to have a not-yet-computed branch. Since 3.0.1 the page
    // has no sticky score bar of its own; the answer at the top shows the score,
    // and it is handed the signed score — null when there is none.
    expect(src).toMatch(/<AnalysisAnswer[\s\S]{0,400}?score=\{signedCleanCoreScore\}/);
    const answer = rendered('components/analyze/AnalysisAnswer.tsx');
    expect(answer).toMatch(/score !== null \?[\s\S]{0,400}?Not yet computed/);
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
    // The same input as before, assembled at run time so the source itself holds no
    // key header (SEC-2026-898). Its SHA-256 pins it to the RSA PEM header the
    // assertion always used, byte for byte.
    const rsaHeader = ['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ');
    expect(crypto.createHash('sha256').update(rsaHeader).digest('hex')).toBe('8bcac7908eb950419537b91e19adc83ce2c9cbfdacf4f81157fdadfec11f7017');
    expect(scanCodeContent(rsaHeader)).toMatch(/Security Block/);
    // And the header inside ABAP, and the other key types.
    expect(scanCodeContent(`DATA(lv_key) = '${rsaHeader}'.`)).toMatch(/Security Block/);
    for (const kind of ['', 'EC ', 'OPENSSH ']) {
      expect(scanCodeContent(`-----BEGIN ${kind}PRIVATE${' '}KEY-----`), kind || 'plain').toMatch(/Security Block/);
    }
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
    // Since the object page (2d4c1755) the handover state is the first facet
    // of the header, computed in `lib/handover.ts` rather than spelled in the
    // page; the old "Incomplete" branch is that facet's "Not handed over".
    // Readiness still has to be earned: only `delivery.done` may say it, and
    // every other path says the handover has not happened.
    expect(jsx).toContain('handoverFacets(');
    const facets = rendered('lib/handover.ts');
    expect(facets).not.toContain('Ready for Deployment');
    expect(facets).toMatch(/:\s*delivery\.done\s*\?\s*\{[\s\S]{0,400}?'Ready to hand over'[\s\S]{0,400}?\}\s*:\s*\{[\s\S]{0,100}?value: 'Not handed over'/);
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
    // Block D, D.15: the label is the provenance chip's "AI-generated"
    // (`lib/provenance.ts` maps the old "AI Generated" to `proposed`), and it
    // is still shown only over files a generation produced. Since 3.5.0 (ADR-129) the tool speaks the family's chips.
    expect(rendered(REL)).toMatch(/files\.length > 0 && <FamilyChip value="proposed" \/>/);
    expect(rendered(REL)).not.toMatch(/<(?:CcProvenanceChip|FamilyChip) value="(?:proven|confirmed)"/);
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

  test('the standardisation fit is not shown at all', () => {
    // 90 / 50 / 15 were numbers chosen to look measured; then the model's three
    // words. Since 3.0.21 (owner decision 22.10.2026) neither: the Analyze page
    // shows no model standard fit.
    expect(read('app/(app)/project/[projectId]/analyze/page.tsx')).not.toMatch(/standardFit/);
  });

  test('an empty test run is not a pass rate', () => {
    const src = read('app/(app)/project/[projectId]/testing/page.tsx');
    // `0 / 0` reached the dashboard as NaN% and a broken chart.
    expect(src).toMatch(/if \(total === 0\) return null;/);
  });
});

test.describe('the Economics page does not invent a business case', () => {
  const REL = 'app/(app)/project/[projectId]/tco/page.tsx';

  test('no score is substituted for an unscored project, and no forecast is made on one', () => {
    const src = read(REL);
    expect(src).not.toMatch(/cleanCoreScore\s*\|\|\s*30/);
    // ADR-128 (2): the demonstration forecast that priced "an improvement" on a fixed target score is gone with
    // `lib/tco-model.ts`; the page prices the options against each other on the reader's figures only.
    expect(fs.existsSync(path.join(ROOT, 'lib', 'tco-model.ts'))).toBe(false);
    expect(rendered(REL)).not.toMatch(/tcoForecast|TCO_TARGET_SCORE|paybackMonths|roiYear1/);
  });

  test('the uploaded line count is not multiplied', () => {
    const src = rendered(REL);
    // `Math.max(1000, Math.min(lineCount * 10, 50000))` turned a ten-line
    // snippet into 1,000 lines, and every figure came from that.
    expect(src).not.toMatch(/lineCount \* 10/);
    expect(src).toContain('countSourceLines(data.legacyCode)');
  });

  test('the outputs are labelled as a simulation', () => {
    expect(read('components/tco/EconomicsObjectPage.tsx')).toContain('<FamilyChip kind="simulation"');
  });
});

test.describe('a pass in the mock runner is labelled as one', () => {
  // QA f2dc77c6c912: the runner executes generated tests against mocks in an
  // isolated process and never against a tenant, so its passes are
  // "Demonstrated · mock" (`lib/provenance.ts`), not "Proven" — the green,
  // reserved word for what a real system or a signed run established.
  for (const rel of ['app/(app)/project/[projectId]/testing/page.tsx', 'components/TestingCharts.tsx']) {
    test(`${rel} does not call a runner pass Proven`, () => {
      const src = rendered(rel);
      expect(src).not.toMatch(/['">]\s*(?:\{stats\.passed\}\s*)?Proven\b/);
      expect(src).toContain("provenance('demonstrated-mock').label");
    });
  }
});
