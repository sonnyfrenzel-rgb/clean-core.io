/**
 * QA full review of 81810c8 — high findings in the product UI.
 *
 *   183ed4edf700  a transformation without its test suite was stored as finished
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { usableTestSuite } from '../lib/transformation-artefacts';

const ROOT = path.resolve(__dirname, '..');
const withoutComments = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const code = (rel: string) => withoutComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const TRANSFORMATION = 'app/(app)/project/[projectId]/transformation/page.tsx';

test.describe('183ed4edf700 · no transformation without its test suite', () => {
  test('an answer without a usable suite is refused, on both tracks', () => {
    for (const isAbapCloud of [true, false]) {
      expect(usableTestSuite(undefined, isAbapCloud)).toBeNull();
      expect(usableTestSuite(null, isAbapCloud)).toBeNull();
      expect(usableTestSuite('none', isAbapCloud)).toBeNull();
      expect(usableTestSuite([], isAbapCloud)).toBeNull();
      expect(usableTestSuite({}, isAbapCloud)).toBeNull();
      expect(usableTestSuite({ config: 'x', spec: '' }, isAbapCloud)).toBeNull();
      expect(usableTestSuite({ config: 'x', spec: '   ' }, isAbapCloud)).toBeNull();
      expect(usableTestSuite({ config: 'x', spec: 42 }, isAbapCloud)).toBeNull();
    }
  });

  test('the BTP track needs its Playwright config; ABAP Unit does not', () => {
    expect(usableTestSuite({ spec: 'test()' }, false)).toBeNull();
    expect(usableTestSuite({ config: ' ', spec: 'test()' }, false)).toBeNull();
    expect(usableTestSuite({ config: 'cfg', spec: 'test()' }, false)).toEqual({ config: 'cfg', spec: 'test()' });
    expect(usableTestSuite({ spec: 'CLASS ltc_test' }, true)).toEqual({ config: '', spec: 'CLASS ltc_test' });
  });

  test('the page refuses before the binding and the write, and stores only the checked suite', () => {
    const src = code(TRANSFORMATION);
    expect(src).not.toMatch(/parsed\.tests\s*\|\|/);
    const gate = src.indexOf('usableTestSuite(parsed.tests, isAbapCloud)');
    const binding = src.indexOf('recordGenerationBinding(projectId');
    const write = src.indexOf("status: 'transformed'");
    expect(gate).toBeGreaterThan(0);
    expect(binding).toBeGreaterThan(gate);
    expect(write).toBeGreaterThan(gate);
    const between = src.slice(gate, binding);
    expect(between).toMatch(/if \(!tests\)\s*\{\s*throw new Error\('[^']*Nothing was saved/);
  });
});
