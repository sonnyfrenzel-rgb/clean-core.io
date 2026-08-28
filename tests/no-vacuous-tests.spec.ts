import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * A test that skips itself when its subject is missing is worse than no test.
 *
 * Five specs wrapped their entire assertion in `if (await locator.count() > 0)`.
 * Three of them named things that do not exist: "Free Community Tool" (the page
 * says "Free Community Edition"), a title attribute "Search S/4HANA Glossary"
 * (the real one is "Open Clean Core Glossary Guide"), and the chatbot trigger,
 * which lives in the authenticated shell while the tests loaded the public
 * landing page. All three passed for months while asserting nothing, and were
 * counted as coverage.
 *
 * This guard is deliberately crude and repo-wide: any conditional that gates an
 * assertion on the presence of the element being asserted is the same defect
 * whatever it is called.
 */
const TESTS_DIR = path.resolve(__dirname);

test('no spec gates its assertions on the element existing', () => {
  const offenders: string[] = [];

  for (const file of fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith('.spec.ts'))) {
    if (file === 'no-vacuous-tests.spec.ts') continue;
    const source = fs.readFileSync(path.join(TESTS_DIR, file), 'utf8');
    source.split('\n').forEach((line, i) => {
      // `if (await x.count() > 0)` and `if (await x.isVisible())` — both make the
      // body optional, which makes the assertion inside it optional too.
      if (/if\s*\(\s*await\s+[\w.]+\.(count\(\)\s*[>!=]|isVisible\(\))/.test(line)) {
        offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      }
    });
  }

  expect(offenders, `conditional assertions:\n${offenders.join('\n')}`).toEqual([]);
});
