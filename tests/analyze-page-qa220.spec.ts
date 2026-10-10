import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Confirmed findings of the QA full review of v2.20.0 (fc787674705f) in the
 * Analyze stage.
 *
 * The page needs a signed-in browser, a file chooser and a model call to reach
 * these paths, so the guard reads the source and names the exact shape that was
 * wrong. The rendered half of the target-artefact finding is in
 * tests/analyze-route-override-rendered.spec.ts.
 */
const ROOT = path.resolve(__dirname, '..');
const ANALYZE = 'app/(app)/project/[projectId]/analyze/page.tsx';
const src = () => fs.readFileSync(path.resolve(ROOT, ANALYZE), 'utf8');

/** From `start` to the first line that closes a block at the declaration's indent. */
function bodyOf(text: string, declaration: string): string {
  const start = text.indexOf(declaration);
  expect(start, `${declaration} is no longer in the file`).toBeGreaterThan(-1);
  const lineStart = text.lastIndexOf('\n', start) + 1;
  const indent = text.slice(lineStart, start).match(/^\s*/)![0];
  const end = text.indexOf(`\n${indent}};`, start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

test.describe('Analyze page - QA full review of v2.20.0', () => {
  test('9be8a33c243e: a slower read of an earlier file cannot stage itself after a later selection', () => {
    const handleFile = bodyOf(src(), 'const handleFile = (file: File) => {');
    expect(handleFile).toMatch(/const selection = \+\+fileSelectionRef\.current;/);
    const onload = handleFile.slice(handleFile.indexOf('reader.onload'));
    // The staleness check comes before anything is staged or refused.
    const check = onload.indexOf('if (selection !== fileSelectionRef.current) return;');
    expect(check, 'the reader callback checks it is still the latest selection').toBeGreaterThan(-1);
    expect(check).toBeLessThan(onload.indexOf('setLegacyCode(content)'));
    expect(check).toBeLessThan(onload.indexOf('scanForMaliciousCode'));
  });

  test('654ca9f3a217: every refusal of a replacement file clears what was staged', () => {
    const text = src();
    const reject = bodyOf(text, 'const rejectFile = (message: string) => {');
    expect(reject).toContain("setLegacyCode('')");
    expect(reject).toContain('setUploadedFileName(PASTED_SOURCE_NAME)');
    const handleFile = bodyOf(text, 'const handleFile = (file: File) => {');
    // Type, size, payload scan, not-ABAP: four refusals, all through rejectFile.
    expect(handleFile.match(/rejectFile\(/g)?.length).toBe(4);
    expect(handleFile, 'no refusal sets an error and leaves the old source staged').not.toMatch(/\bsetError\((?!'')/);
  });

  test('ca61e8967379: an analysis error is always said on the screen, never rethrown', () => {
    const handleAnalyze = bodyOf(src(), 'const handleAnalyze = async (');
    const outerCatch = handleAnalyze.slice(handleAnalyze.lastIndexOf('} catch (err: unknown) {'));
    expect(outerCatch.length).toBeGreaterThan(30);
    expect(outerCatch).not.toMatch(/\bthrow\b/);
    expect(outerCatch).toMatch(/setError\(`Failed to analyze the code: \$\{shown\}/);
  });

  test('329a0da707f6: the track comparison on screen is the router\'s, as on the signed run', () => {
    const text = src();
    const pin = text.indexOf('pinRunOwnedFields(obj, computedRouteReport);');
    const stored = text.indexOf('normalizedAnalysis = JSON.stringify(obj);', pin);
    expect(pin).toBeGreaterThan(-1);
    const between = text.slice(pin, stored);
    expect(between).toContain('routing.comparativeAnalysis = computedRouteReport.comparativeAnalysis;');
    expect(between).toContain('routing.decisionTreeCheckpoints = computedRouteReport.checkpoints;');
    // The server does the same before it signs.
    const route = fs.readFileSync(path.resolve(ROOT, 'app/api/runs/create/route.ts'), 'utf8');
    expect(route).toContain('analysisObj.extensibilityRouting.comparativeAnalysis = extensibilityReport.comparativeAnalysis;');
  });

  test('08fd882e60b3: after a route switch the recommended artefact is not shown as the target', () => {
    // The card is shared with the demo since 10.10.2026: the page hands it the
    // recommended artefact and the override decision, the card picks.
    expect(src()).toMatch(/overridden=\{routeIsOverridden\}[\s\S]{0,200}?targetArtifact=\{analysisData\.extensibilityRouting\?\.targetArtifact \?\? null\}/);
    const card = fs.readFileSync(path.resolve(ROOT, 'components/analyze/RouteCard.tsx'), 'utf8');
    expect(card).toMatch(/Target: \{\(!overridden && targetArtifact\)/);
  });
});

test('ae68c0b99961: the route report is drawn only from the evidence of the source the run signed', () => {
  const text = src();
  const memo = text.slice(text.indexOf('const routeReport = useMemo('), text.indexOf('const routeDerived = useMemo('));
  expect(memo).toContain('project.auditMetadata?.inputFingerprint?.sha256');
  expect(memo).toContain('evidenceSourceSha === signedSourceSha');
  expect(memo).toMatch(/const addsUp = sameSource && /);
  expect(text).toContain("const evidenceSourceSha = projectEvidence.state === 'ready' ? projectEvidence.value.sourceSha256 : null;");
});
