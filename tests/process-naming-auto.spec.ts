import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { build, type Plugin } from 'esbuild';
import { namingModelEnabled, shouldAskNaming, takeFirstNamingAsk } from '../lib/process-naming';
import { WORKSPACE_BUSINESS_MESSAGES } from '../lib/messages/workspace-business';

/**
 * Owner decision 21.10.2026: the "Suggest business names" button of the
 * Business view's "Need & process" block is gone. The business names are asked
 * for automatically, the way the plain wording is (`hooks/usePlainWording.ts`):
 * once per project and source digest, only by the owner, only when the model
 * availability is known, a key exists and the `naming` stage is on; a refused
 * answer leaves the engine's plain names, with no error. The naming route keeps
 * every server check (skeleton rebuilt, anchors, receipts) — nothing of it is
 * touched here.
 *
 * Server-free: the pure rules directly, the hook bundled with esbuild and run in
 * a blank page, with the browser half of the naming replaced by a stub that
 * counts the asks.
 */

const root = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const ON = { known: true, keyAvailable: true, stages: { naming: true } };

test.describe('the rule: once, only the owner, only with a model', () => {
  test('the availability switch: known, a key, the naming stage not off', () => {
    expect(namingModelEnabled(ON)).toBe(true);
    expect(namingModelEnabled({ ...ON, stages: {} })).toBe(true);
    expect(namingModelEnabled({ ...ON, known: false })).toBe(false);
    expect(namingModelEnabled({ ...ON, keyAvailable: false })).toBe(false);
    expect(namingModelEnabled({ ...ON, stages: { naming: false } })).toBe(false);
    expect(namingModelEnabled(null)).toBe(false);
  });

  test('asked only while the drawn map has no naming for this source', () => {
    expect(shouldAskNaming({ owner: true, modelEnabled: true, state: 'not-named' })).toBe(true);
    expect(shouldAskNaming({ owner: true, modelEnabled: true, state: 'stale' })).toBe(true);
    expect(shouldAskNaming({ owner: true, modelEnabled: true, state: 'named' })).toBe(false);
    expect(shouldAskNaming({ owner: true, modelEnabled: true, state: null })).toBe(false);
    expect(shouldAskNaming({ owner: false, modelEnabled: true, state: 'not-named' })).toBe(false);
    expect(shouldAskNaming({ owner: true, modelEnabled: false, state: 'not-named' })).toBe(false);
  });

  test('once per project and source digest', () => {
    const asked = new Set<string>();
    expect(takeFirstNamingAsk(asked, 'p1', 'd1')).toBe(true);
    expect(takeFirstNamingAsk(asked, 'p1', 'd1')).toBe(false);
    expect(takeFirstNamingAsk(asked, 'p1', 'd2')).toBe(true);
    expect(takeFirstNamingAsk(asked, 'p2', 'd1')).toBe(true);
  });
});

test.describe('the Business view: no button, the automatic ask instead', () => {
  test('no "Suggest business names" button, cost note or optional sentence is left', () => {
    const process = read('components/workspace/WorkspaceProcess.tsx');
    expect(process).not.toContain('data-workspace-suggest-names');
    expect(process).not.toContain('requestProcessNaming');
    expect(process).not.toContain('biz.suggestNames');
    expect(process).toMatch(/useAutoProcessNaming\(\{[\s\S]*?state: map\.model\?\.naming\.state \?\? null,[\s\S]*?onStored: bumpNaming,/);
    for (const key of ['biz.suggestNames', 'biz.suggestingNames', 'biz.suggestNamesNote', 'biz.namesProposed']) {
      expect(Object.keys(WORKSPACE_BUSINESS_MESSAGES), key).not.toContain(key);
    }
    expect(read('lib/messages/workspace-business.ts')).not.toContain('bizNamesFailed');
  });

  test('the opening reads the naming again once the page stored one', () => {
    const firstLook = read('components/workspace/FirstLook.tsx');
    expect(firstLook).toContain('window.addEventListener(PROCESS_NAMING_STORED_EVENT, hear)');
    expect(firstLook).toContain('}, [projectId, hasSource, namingFrom, namingStored]);');
  });

  test('the naming route keeps its server checks', () => {
    const route = read('app/api/projects/[projectId]/process-naming/route.ts');
    expect(route).toContain('namingContextOf');
    expect(route).toContain('validateNamingAnswer');
    expect(route).toContain('verifyModelReceipt');
  });
});

/* ------------------------------------------------------------------ the hook, run */

const stub: Plugin = {
  name: 'naming-client-stub',
  setup(b) {
    b.onResolve({ filter: /^@\/lib\/process-naming-client$/ }, () => ({ path: 'naming-client', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      loader: 'ts',
      contents: `
        export async function requestProcessNaming(projectId: string, context: { digest: string }) {
          const w = window as unknown as { __asks: string[]; __answer?: unknown };
          w.__asks.push(projectId + ' ' + context.digest);
          await new Promise((r) => setTimeout(r, 20));
          return w.__answer ?? { ok: true, record: {} };
        }`,
    }));
  },
};

async function bundleHook(): Promise<string> {
  const dir = path.join(root, 'tmp', 'process-naming-auto', String(process.pid));
  fs.mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, 'entry.tsx');
  fs.writeFileSync(
    entry,
    `import React from 'react';
import { createRoot } from 'react-dom/client';
import { useAutoProcessNaming } from '@/hooks/useAutoProcessNaming';
const w = window as any;
w.__asks = []; w.__stored = 0; w.__events = 0;
window.addEventListener('cc:process-naming-stored', () => { w.__events += 1; });
function Probe(props: any) {
  const state = useAutoProcessNaming({ ...props, onStored: () => { w.__stored += 1; } });
  return React.createElement('span', { id: 'state' }, state);
}
const root = createRoot(document.getElementById('root')!);
w.__render = (props: any) => root.render(React.createElement(Probe, props));
`,
  );
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    tsconfig: path.join(root, 'tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [stub],
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

const SOURCE_A = `REPORT zdemo.\nSTART-OF-SELECTION.\n  PERFORM check_authority.\nFORM check_authority.\n  AUTHORITY-CHECK OBJECT 'S_TCODE' ID 'TCD' FIELD 'VA01'.\n  IF sy-subrc <> 0.\n    MESSAGE 'No' TYPE 'E'.\n  ENDIF.\nENDFORM.\n`;
const SOURCE_B = SOURCE_A.replace("'VA01'", "'VA02'");

test.describe('the hook in a page', () => {
  test('asks once per project and source; a stored naming is announced; never for a reader, without a model or before it is known', async ({ page }) => {
    const script = await bundleHook();
    await page.setContent('<!doctype html><div id="root"></div>');
    await page.addScriptTag({ content: script });

    const settle = () => page.waitForTimeout(80);
    const render = async (props: Record<string, unknown>) => {
      await page.evaluate((p) => (window as unknown as { __render: (p: unknown) => void }).__render(p), props);
      await settle();
    };
    const asks = () => page.evaluate(() => (window as unknown as { __asks: string[] }).__asks.length);
    const counter = (name: '__stored' | '__events') => page.evaluate((n) => (window as unknown as Record<string, number>)[n], name);
    const base = { projectId: 'p1', source: SOURCE_A, owner: true, availability: ON, state: 'not-named' };

    // Before the map is drawn, before availability is known, a reader, no key, the stage off: no ask.
    await render({ ...base, state: null });
    await render({ ...base, availability: { known: false, keyAvailable: false, stages: {} } });
    await render({ ...base, owner: false });
    await render({ ...base, availability: { ...ON, keyAvailable: false } });
    await render({ ...base, availability: { ...ON, stages: { naming: false } } });
    await render({ ...base, state: 'named' });
    expect(await asks()).toBe(0);

    // The owner with a model and no naming for this source: one ask, however often the page renders.
    await render(base);
    await render({ ...base, state: 'stale' });
    await render(base);
    expect(await asks()).toBe(1);
    await expect.poll(() => counter('__stored')).toBe(1);
    expect(await counter('__events')).toBe(1);
    await expect(page.locator('#state')).toHaveText('idle');

    // A changed source is a new digest: one more ask. The first source again: none.
    await render({ ...base, source: SOURCE_B });
    await render({ ...base, source: SOURCE_A });
    expect(await asks()).toBe(2);

    // A refused answer: asked once, nothing announced, the plain names stand, never asked again.
    await page.evaluate(() => {
      (window as unknown as { __answer: unknown }).__answer = { ok: false, absence: 'failed', message: 'Refused.' };
    });
    await render({ ...base, projectId: 'p2' });
    await render({ ...base, projectId: 'p2' });
    expect(await asks()).toBe(3);
    await expect(page.locator('#state')).toHaveText('idle');
    expect(await counter('__stored')).toBe(2);
    expect(await counter('__events')).toBe(2);
  });
});
