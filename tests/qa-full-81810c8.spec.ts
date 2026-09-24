import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Confirmed findings of the QA full review of 81810c8 in the Analyze stage.
 *
 * The page needs a signed-in browser to render, so this reads source and names
 * the exact shape that was wrong.
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
