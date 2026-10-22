import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { stageViewHref, stageViewOf } from '../lib/location-search';

/**
 * Owner decision 22.10.2026 (roadmap 3.0.21): the view a tool is read in is
 * visible on every tool screen, top right of the shared header, as the
 * segmented control "Business | IT | Management"; one click switches the view
 * and stays on the same tool, every other parameter of the address kept. A view
 * is a view only — it lives in the address and nowhere else.
 *
 * Server-free: the pure address rule, source guards, and the switch itself
 * bundled into a page of its own.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

test.describe('the view switch of a tool', () => {
  test('the address rule: only `view` changes; the path, the other parameters and the fragment stay', () => {
    expect(stageViewHref({ pathname: '/project/p-1/design', search: '?view=business&from=workspace-tools&layer=standard', hash: '#architect-sign-off' }, 'it')).toBe(
      '/project/p-1/design?view=it&from=workspace-tools&layer=standard#architect-sign-off',
    );
    expect(stageViewHref({ pathname: '/project/p-1/tco', search: '' }, 'management')).toBe('/project/p-1/tco?view=management');
    expect(stageViewHref({ pathname: '/demo/testing', search: '?origin=management.options' }, 'business')).toBe('/demo/testing?origin=management.options&view=business');
  });

  test('the active view: the address’s, and the workspace’s default where it names none or an unknown one', () => {
    expect(stageViewOf('?view=it')).toBe('it');
    expect(stageViewOf('?view=management&from=x')).toBe('management');
    expect(stageViewOf('')).toBe('business');
    expect(stageViewOf('?view=admin')).toBe('business');
  });

  test('the shared header draws it beside the way back, for every tool with a way back', () => {
    const header = read('components/StageHeader.tsx');
    expect(header).toContain('<StageViewSwitch search={search} />');
    // In the row of the way back, which only a project or the demo has.
    const row = header.slice(header.indexOf('data-stage-head-row'), header.indexOf('<StageViewSwitch'));
    expect(row).toContain('data-stage-back="workspace"');
    expect(header).toMatch(/back\.kind === 'link' && \(\s*(\/\/[^\n]*\n\s*)*<div data-stage-head-row/);
    const sw = read('components/StageViewSwitch.tsx');
    expect(sw).toContain('<CcSegmentedControl');
    expect(sw, 'on a phone the segments share the row').toContain('stretch');
    expect(sw).toContain('cc-no-print');
    expect(sw).toContain('onChange={switchStageView}');
  });

  test('a view is a view only: the switch writes the address and nothing else', () => {
    const lib = read('lib/location-search.ts');
    const fn = lib.slice(lib.indexOf('export function switchStageView'));
    expect(fn).toContain('window.history.pushState(null');
    expect(fn).toContain('LOCATION_SEARCH_EVENT');
    for (const banned of ['localStorage', 'sessionStorage', 'firebase', 'fetch(', 'updateDoc', 'setDoc']) {
      expect(lib, banned).not.toContain(banned);
      expect(read('components/StageViewSwitch.tsx'), banned).not.toContain(banned);
    }
  });

  test('every reader of the stage address reads it again after a switch', () => {
    for (const rel of [
      'components/StageHeader.tsx',
      'components/StageFooter.tsx',
      'components/workspace/ToolBar.tsx',
      'app/(app)/layout.tsx',
      'app/(app)/project/[projectId]/transformation/page.tsx',
    ]) {
      const src = read(rel);
      expect(src, rel).toContain('useLocationSearch()');
      expect(src, `${rel} must not read the address without a subscription`).not.toMatch(/useSyncExternalStore\(noSubscription, readSearch/);
    }
  });

  test('rendered: one click switches the view in place, keeps the other parameters, and Back returns', async ({ page }) => {
    test.setTimeout(120_000);
    const out = path.resolve(ROOT, 'tmp', 'stage-view-switch', String(process.pid));
    fs.mkdirSync(out, { recursive: true });
    const entry = path.join(out, 'entry.tsx');
    fs.writeFileSync(
      entry,
      `import React from 'react';
import { createRoot } from 'react-dom/client';
import StageViewSwitch from '@/components/StageViewSwitch';
import StageBackText from '@/components/StageBackText';
import { useLocationSearch } from '@/lib/location-search';
let renders = 0;
function App() {
  const search = useLocationSearch();
  renders += 1;
  (window as unknown as { __mounts: number }).__mounts ??= 0;
  React.useEffect(() => { (window as unknown as { __mounts: number }).__mounts += 1; }, []);
  return (
    <div>
      <p data-test-back=""><StageBackText projectName="Order limit check" search={search} /></p>
      <StageViewSwitch search={search} />
      <span data-test-renders={renders} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
`,
    );
    const { build } = await import('esbuild');
    const code = (
      await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        jsx: 'automatic',
        alias: { '@': ROOT },
        define: { 'process.env.NODE_ENV': '"production"' },
        banner: { js: 'var process = { env: {} };' },
        logLevel: 'silent',
      })
    ).outputFiles[0].text;
    await page.route('http://views.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><body><div id="root"></div><script>${code.replace(/<\/script/g, '<\\/script')}</script></body></html>`,
      }),
    );
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://views.test/project/p-1/design?view=business&from=workspace-tools#architect-sign-off');
    const group = page.getByRole('radiogroup', { name: 'View' });
    await expect(group).toBeVisible();
    expect(errors).toEqual([]);
    await expect(group.getByRole('radio')).toHaveText(['Business', 'IT', 'Management']);
    await expect(group.getByRole('radio', { name: 'Business' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-test-back]')).toContainText('Business view');

    await group.getByRole('radio', { name: 'IT' }).click();
    await expect(group.getByRole('radio', { name: 'IT' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-stage-view-switch]')).toHaveAttribute('data-stage-view-switch', 'it');
    expect(page.url()).toBe('http://views.test/project/p-1/design?view=it&from=workspace-tools#architect-sign-off');
    // The way back follows the view, and the tool was not mounted again.
    await expect(page.locator('[data-test-back]')).toContainText('IT view');
    expect(await page.evaluate(() => (window as unknown as { __mounts: number }).__mounts)).toBe(1);

    await page.goBack();
    await expect(group.getByRole('radio', { name: 'Business' })).toHaveAttribute('aria-checked', 'true');
    expect(page.url()).toContain('view=business');
  });
});
