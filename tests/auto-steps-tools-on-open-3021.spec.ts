import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { askModeOf } from '../lib/auto-steps';
import { leasedFillModel } from '../lib/transformation/lease-client';

/**
 * Release 3.0.21 (owner decision B6, gap found 06.11.2026): Transformation and
 * Documentation call the model by themselves when they are opened — the first
 * generation, and the business layer. Terms 5.4, privacy section 3 and the
 * own-key notices C3/C4 say that with an own key automatic steps run only after
 * "Automatic steps" is switched on, and the proxy holds that rule only for calls
 * marked `trigger: 'automatic'`. These two starts were not marked.
 *
 * Pinned here:
 *   - both starts on opening are marked automatic, down to every model call;
 *   - with an own key and "Automatic steps" off (`askModeOf` → `click`) neither
 *     starts by itself, and the tool shows its normal button with the note;
 *   - a click is never marked automatic;
 *   - on the platform key (`autoSteps` true) the start runs by itself as before.
 *
 * Server-free: source guards, `askModeOf`, and the lease client against a
 * stand-in `fetch`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Source without comments, so a sentence about a call is never taken for the call. */
const code = (rel: string) =>
  read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (src: string, needle: string) => src.split(needle).length - 1;

const TRANSFORMATION = 'app/(app)/project/[projectId]/transformation/page.tsx';
const DOCUMENTATION = 'app/(app)/project/[projectId]/documentation/page.tsx';

test.describe('the rule both tools use', () => {
  test('askModeOf: platform key by itself, own key with the switch off on a click, nothing wanted nothing', () => {
    // `autoAllowed` is useModelAvailability().autoSteps: true on the platform key, on an own key only with the switch on.
    expect(askModeOf({ wanted: true, autoAllowed: true })).toBe('auto');
    expect(askModeOf({ wanted: true, autoAllowed: false })).toBe('click');
    expect(askModeOf({ wanted: false, autoAllowed: true })).toBeNull();
    expect(askModeOf({ wanted: false, autoAllowed: false })).toBeNull();
  });

  test('the proxy refuses a marked call on an own key whose "Automatic steps" are off', () => {
    const route = read('app/api/gemini/route.ts');
    expect(route).toContain("const automatic = trigger === 'automatic';");
    expect(route).toContain('if (automatic && ownKey && !ownKey.autoSteps) {');
    expect(read('lib/gemini.ts')).toContain("...(options?.automatic ? { trigger: 'automatic' } : {}),");
  });
});

test.describe('Transformation', () => {
  const realFetch = globalThis.fetch;
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** The bodies the lease client sent to `/api/gemini`. */
  function capture(): Array<Record<string, unknown>> {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response(JSON.stringify({ text: '{}', receipt: null }), { status: 200 });
    }) as typeof fetch;
    return bodies;
  }

  test('a leased fill of the start on opening is sent as automatic; one of a click is not', async () => {
    const lease = { projectId: 'project-1', leaseId: 'lease-1' };
    const bodies = capture();
    await leasedFillModel(lease, undefined, undefined, true)('prompt', new AbortController().signal);
    await leasedFillModel(lease)('prompt', new AbortController().signal);
    await leasedFillModel(lease, undefined, undefined, false)('prompt', new AbortController().signal, { gateRepair: true });
    expect(bodies).toHaveLength(3);
    expect(bodies[0].trigger).toBe('automatic');
    expect(bodies[0].stage).toBe('transformation');
    expect(bodies[0].lease).toEqual(lease);
    expect(bodies[1]).not.toHaveProperty('trigger');
    expect(bodies[2]).not.toHaveProperty('trigger');
  });

  test('the start on opening is the only automatic start, and every model call of it carries the mark', () => {
    const src = code(TRANSFORMATION);
    // One automatic start, from the effect; every other start is a click.
    expect(count(src, 'generateTransformation(true)')).toBe(1);
    expect(src).toContain('const timer = setTimeout(() => generateTransformation(true), 0);');
    expect(src).not.toMatch(/generateTransformation\((?!true\)|\))/);
    expect(src).toMatch(/const startGeneration = \(\) => \{[\s\S]*?else generateTransformation\(\);/);
    expect(src).toMatch(/onReplace=\{\(\) => \{[\s\S]*?if \(canStart\) generateTransformation\(\);/);
    // The flag reaches both paths: the leased fills and the single call.
    const generation = src.slice(src.indexOf('const generateTransformation = useCallback'), src.indexOf('const planPending'));
    expect(generation).toContain('const generateTransformation = useCallback(async (automatic: boolean = false) => {');
    expect(generation).toMatch(/model: leasedFillModel\(leaseNow, undefined, \(receipt\) => \{[\s\S]*?\}, automatic\),/);
    expect(generation).toMatch(/await runSingleCall\(\{[^}]*startedAt, automatic \}\);/);
    const single = src.slice(src.indexOf('const runSingleCall = useCallback'), src.indexOf('const generateTransformation = useCallback'));
    expect(single).toContain('automatic: boolean;');
    expect(single).toMatch(/callGemini\(prompt, PRODUCT_GEMINI_MODEL, true, 'transformation', signal, \{[\s\S]*?\.\.\.\(args\.automatic \? \{ automatic: true \} : \{\}\),/);
  });

  test('with an own key and "Automatic steps" off it waits for Generate code, and says why', () => {
    const src = code(TRANSFORMATION);
    expect(src).toContain("import { askModeOf } from '@/lib/auto-steps';");
    const mode = src.slice(src.indexOf('const firstStartMode = askModeOf({'), src.indexOf('const fillsEstimate'));
    expect(mode).toContain('autoAllowed: modelAvailability.autoSteps,');
    for (const condition of ['nothingOpen', 'canStart', 'planSettled', 'files.length === 0', '!modelAvailability.loading', '!loading']) {
      expect(mode.slice(0, mode.indexOf('autoAllowed')), `the start mode does not read ${condition}`).toContain(condition);
    }
    // The effect starts only in the automatic mode, before it marks itself started.
    const effect = mode.slice(mode.indexOf('useEffect(() => {'));
    expect(effect.indexOf("if (firstStartMode !== 'auto') return;")).toBeGreaterThan(-1);
    expect(effect.indexOf("if (firstStartMode !== 'auto') return;")).toBeLessThan(effect.indexOf('autoStarted.current = true;'));
    // The normal button stays: the tips' Generate, which a click starts.
    expect(src).toMatch(/<QualityTips[\s\S]*?canGenerate=\{canStart\}[\s\S]*?onGenerate=\{startGeneration\}/);
    // And the note says why it is a button.
    expect(src).toMatch(/\{firstStartMode === 'click' \? \(\s*<p data-transformation-on-click=""[^>]*>\s*\{wt\('autoSteps\.onClickNote'\)\}/);
  });
});

test.describe('Documentation', () => {
  test('the layer on opening is the only automatic write, and every part carries the mark', () => {
    const src = code(DOCUMENTATION);
    expect(count(src, 'writeBusinessLayer(true)')).toBe(1);
    expect(src).toContain('void writeBusinessLayer(true);');
    // Every button goes through the click, which never marks.
    expect(src).toContain('const generateBusinessDocumentation = useCallback(() => writeBusinessLayer(false), [writeBusinessLayer]);');
    expect(src).not.toMatch(/writeBusinessLayer\((?!true\)|false\))/);
    expect(src).toContain('onClick={generateBusinessDocumentation}');
    // The flag reaches each part's model call.
    expect(src).toContain('const run = runBusinessGeneration(automatic, () => renewBusinessLayerLease(leaseId, tab));');
    const gen = src.slice(src.indexOf('async function runBusinessGeneration(automatic: boolean'), src.indexOf('const writeBusinessLayer = useCallback'));
    expect(gen).toMatch(/callGemini\([\s\S]*?'documentation',[\s\S]*?\.\.\.\(automatic \? \{ automatic: true \} : \{\}\),/);
  });

  test('with an own key and "Automatic steps" off it waits for its button, and says why', () => {
    const src = code(DOCUMENTATION);
    expect(src).toContain("import { askModeOf } from '@/lib/auto-steps';");
    expect(src).toContain('const businessAutoMode = askModeOf({ wanted: businessAutoReady, autoAllowed: modelAvailability.autoSteps });');
    const effect = src.slice(src.indexOf('const businessAutoMode = askModeOf'), src.indexOf('// A generation this page started'));
    expect(effect.indexOf("if (businessAutoMode !== 'auto') return;")).toBeGreaterThan(-1);
    expect(effect.indexOf("if (businessAutoMode !== 'auto') return;")).toBeLessThan(effect.indexOf('autoBusinessFor.current = key;'));
    // The progress card does not say "starting the model call": it names the wait.
    const absence = src.slice(src.indexOf('const businessAbsence = !project'), src.indexOf('const progress = documentationProgress('));
    expect(absence).toMatch(/businessAutoMode === 'click'\s*\?\s*wt\('autoSteps\.onClickNote'\)/);
    // The offer's button stays, with the note beside it.
    const offer = src.slice(src.indexOf('data-generate-business-layer'));
    expect(offer).toMatch(/\{businessAutoMode === 'click' \? \(\s*<span data-business-layer-on-click=""[^>]*>\{wt\('autoSteps\.onClickNote'\)\}/);
  });
});

test('the open value for B6 names both tools as covered', () => {
  const values = read('lib/legal/open-values.ts');
  const entry = values.slice(values.indexOf("'autoStepsSwitch',"), values.indexOf("'retryCounts',"));
  expect(entry).toContain('Transformation (first generation on opening');
  expect(entry).toContain('Documentation (business layer on opening');
  expect(entry).toContain('tests/auto-steps-tools-on-open-3021.spec.ts');
});
