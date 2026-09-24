import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { pinRunOwnedFields } from '../lib/model-owned-fields';

/**
 * Confirmed findings of the QA full review of 81810c8 in the Analyze stage.
 *
 * The page needs a signed-in browser to render, so the first two halves read
 * source and name the exact shape that was wrong; the normalisation itself is a
 * pure function and is called.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');
const ANALYZE = 'app/(app)/project/[projectId]/analyze/page.tsx';

/** The body of a function declared as `const <name> = async (` … up to the matching `};` at its own indent. */
function bodyOf(src: string, declaration: string): string {
  const start = src.indexOf(declaration);
  expect(start, `${declaration} is no longer in the file`).toBeGreaterThan(-1);
  const end = src.indexOf('\n  };', start);
  expect(end, `could not find the end of ${declaration}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

test.describe('every analysis start asks for the same preconditions (7d0d04a45324)', () => {
  test('there is no start from the URL', () => {
    const src = read(ANALYZE);
    expect(src).not.toContain('autoAnalyze');
    expect(src).not.toContain('hasAutoAnalyzed');
  });

  test('handleAnalyze itself returns before anything runs unless all three hold', () => {
    const body = bodyOf(read(ANALYZE), 'const handleAnalyze = async (');
    const guard = body.search(/if \(!deployment \|\| !acceptedTerms \|\| \(hintKeyForThisText !== '' && hintKeyForThisText !== personalDataAckFor\)\)/);
    expect(guard, 'the precondition check is gone from handleAnalyze').toBeGreaterThan(-1);
    // Read for the text this call sends, not for what the textarea held at render.
    expect(body).toMatch(/personalDataHintKey\(scanForPersonalDataHints\(codeToAnalyze\)\)/);
    expect(body.slice(guard, guard + 400)).toMatch(/return;/);
    const firstEffect = body.indexOf('setLoading(true)');
    expect(firstEffect).toBeGreaterThan(guard);
    expect(body.indexOf("fetch('/api/runs/create'")).toBeGreaterThan(guard);
    expect(body.indexOf('callGeminiWithReceipt(')).toBeGreaterThan(guard);
  });
});

test.describe('the route confidence on the card is the signed one (d5a87a5db395)', () => {
  const router = {
    recommendedRoute: 'In-App (ABAP Cloud)' as const,
    confidenceScore: 70,
    rationale: 'Computed by the router.',
    targetArtifact: 'RAP Business Object',
  };

  test('a model-supplied 95 % is replaced by the router\'s 70 %', () => {
    const obj: Record<string, unknown> = {
      cleanCoreScore: 99,
      complexityScore: 1,
      criticalityScore: 1,
      extensibilityRouting: {
        recommendedRoute: 'Side-by-Side (SAP BTP)',
        confidenceScore: 95,
        rationale: 'Written by the model.',
        targetArtifact: 'Something else',
        note: 'kept',
      },
      standardFit: { potential: 'High' },
    };
    pinRunOwnedFields(obj, router);
    expect(obj.extensibilityRouting).toEqual({
      recommendedRoute: 'In-App (ABAP Cloud)',
      confidenceScore: 70,
      rationale: 'Computed by the router.',
      targetArtifact: 'RAP Business Object',
      note: 'kept',
    });
    expect(obj).not.toHaveProperty('cleanCoreScore');
    expect(obj).not.toHaveProperty('complexityScore');
    expect(obj).not.toHaveProperty('criticalityScore');
    expect(JSON.stringify(obj)).not.toContain('95');
  });

  test('a narrative without a routing block gets the router\'s', () => {
    const obj: Record<string, unknown> = { extensibilityRouting: 'Side-by-Side (SAP BTP)' };
    pinRunOwnedFields(obj, router);
    expect((obj.extensibilityRouting as Record<string, unknown>).confidenceScore).toBe(70);
  });

  test('both normalisations use it, and the card prints no confidence from the narrative', () => {
    const page = read(ANALYZE);
    expect(page).toMatch(/pinRunOwnedFields\(obj, computedRouteReport\)/);
    expect(read('lib/analysis-run.ts')).toMatch(/pinRunOwnedFields\(obj, routeReport\)/);
    expect(page).not.toMatch(/analysisData\.extensibilityRouting\??\.confidenceScore/);
    expect(page).toMatch(/\$\{signedRouteConfidence\}% Conf\./);
    expect(page).toMatch(/ at \$\{signedRouteConfidence\}% confidence/);
  });
});
