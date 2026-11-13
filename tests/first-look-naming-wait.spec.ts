import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The first insights' wait for the stored naming (QA review of a 3.0.x build).
 *
 * The first look's end state needed stage 3's naming, or the decision to stand without one; a naming read that
 * never settled once kept it on "reading" for good, and the fix was a short wait of its own (`NAMING_WAIT_MS`).
 *
 * Since 3.2.0 (plan AB-6) the first look is gone: the text around the map is read from the engine alone and waits
 * for no naming at all — the names arrive on the map itself (ADR-108). What this spec held is now stronger: nothing
 * in the text around the map reads a naming, so nothing can wait for one. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('the text around the map does not wait for the naming at all', () => {
  test('neither the hook nor the component reads a naming, so there is no wait to end', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/workspace/FirstLook.tsx'))).toBe(false);
    for (const rel of ['hooks/useAroundTheMap.ts', 'components/analyze/AroundTheMap.tsx', 'lib/around-the-map.ts']) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/fetchProcessNaming|applyNaming|PROCESS_NAMING_STORED_EVENT|NAMING_WAIT_MS|namingWaited/);
    }
    // The story behind "How it runs" is the engine's: no business names are handed to it.
    expect(read('lib/around-the-map.ts')).toContain('processStory(skeleton, source, null, engineVersion, customerTexts)');
  });

  test('nothing waits for a build-up clock any more', () => {
    for (const rel of ['hooks/useAroundTheMap.ts', 'components/analyze/AroundTheMap.tsx']) {
      expect(read(rel), rel).not.toMatch(/BUILD_UP|namingWaitOver|requestAnimationFrame\(tick\)/);
    }
  });
});
