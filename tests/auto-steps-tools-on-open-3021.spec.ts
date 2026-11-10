import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { leasedFillModel } from '../lib/transformation/lease-client';
import { generateDraftLabel, providerCompanyOf, regenerateDraftLabel } from '../lib/messages/model-consent';

/**
 * Release 3.0.21, legal review of 06.11.2026, item 1: Transformation and
 * Documentation start only on an explicit button, for every key — the platform
 * key included. Until then both called the model by themselves when they were
 * opened (the first generation; the business layer), marked as automatic and
 * held back only on an own key with "Automatic steps" off.
 *
 * Pinned here:
 *   - neither tool has a path that calls the model on opening any more: no
 *     effect starts a generation, and no call of either is marked automatic;
 *   - the click paths stay — Transformation's header button, *Generate now*,
 *     *Replace* and *Try again*; Documentation's offer and *Try again*;
 *   - the button says where the code goes: "Generate draft (sends code to
 *     {provider})", with the provider of the key actually used.
 *
 * Server-free: source guards, the words, and the lease client against a
 * stand-in `fetch`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Source without comments, so a sentence about a call is never taken for the call. */
const code = (rel: string) =>
  read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const TRANSFORMATION = 'app/(app)/project/[projectId]/transformation/page.tsx';
const DOCUMENTATION = 'app/(app)/project/[projectId]/documentation/page.tsx';

test.describe('the button names where the code goes', () => {
  test('"Generate draft (sends code to {provider})", in both languages, with the provider of the key', () => {
    expect(providerCompanyOf('gemini')).toBe('Google');
    expect(providerCompanyOf('anthropic')).toBe('Anthropic');
    expect(providerCompanyOf(null)).toBeNull();
    expect(generateDraftLabel('Google')).toBe('Generate draft (sends code to Google)');
    expect(generateDraftLabel('Anthropic', 'de')).toBe('Entwurf erzeugen (sendet Code an Anthropic)');
    expect(regenerateDraftLabel('Google')).toBe('Regenerate draft (sends code to Google)');
    // Never a guessed provider before the key is known.
    expect(generateDraftLabel(null)).toBe('Generate draft (sends code to the AI provider)');
    expect(generateDraftLabel(null, 'de')).toBe('Entwurf erzeugen (sendet Code an den KI-Anbieter)');
  });
});

test.describe('Transformation', () => {
  const realFetch = globalThis.fetch;
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('a leased fill is never marked automatic', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response(JSON.stringify({ text: '{}', receipt: null }), { status: 200 });
    }) as typeof fetch;
    const lease = { projectId: 'project-1', leaseId: 'lease-1' };
    await leasedFillModel(lease)('prompt', new AbortController().signal);
    await leasedFillModel(lease)('prompt', new AbortController().signal, { gateRepair: true });
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body).not.toHaveProperty('trigger');
      expect(body.stage).toBe('transformation');
    }
    expect(read('lib/transformation/lease-client.ts')).not.toMatch(/automatic\s*[:?=)]/);
  });

  test('nothing starts a generation on opening; every start is a click', () => {
    const src = code(TRANSFORMATION);
    expect(src).not.toMatch(/automatic/);
    expect(src).not.toContain('autoStarted');
    expect(src).not.toContain('askModeOf');
    expect(src).not.toMatch(/setTimeout\(\(\) => generateTransformation/);
    expect(src).toContain('const generateTransformation = useCallback(async () => {');
    // Every call of it, outside its own definition, sits in a click handler.
    const calls = src.split('generateTransformation()').length - 1;
    expect(calls).toBe(2);
    expect(src).toMatch(/const startGeneration = \(\) => \{[\s\S]*?else generateTransformation\(\);/);
    expect(src).toMatch(/onReplace=\{\(\) => \{[\s\S]*?if \(canStart\) generateTransformation\(\);/);
    // The single call is not marked either.
    const single = src.slice(src.indexOf('const runSingleCall = useCallback'), src.indexOf('const generateTransformation = useCallback'));
    expect(single).toMatch(/callGemini\(prompt, PRODUCT_GEMINI_MODEL, true, 'transformation', signal, \{/);
    expect(single).not.toContain('automatic');
  });

  test('the header button and Generate now say "Generate draft (sends code to …)" with the key\'s provider', () => {
    const src = code(TRANSFORMATION);
    expect(src).toContain('const draftCompany = modelAvailability.known ? providerCompanyOf(modelAvailability.provider) : null;');
    expect(src).toContain('const generateLabel = files.length > 0 ? regenerateDraftLabel(draftCompany) : generateDraftLabel(draftCompany);');
    // The label sits alone in a wrapping span (e5c78bd1): the provider makes it long, and on a phone it wraps.
    expect(src).toMatch(/onClick=\{startGeneration\}[\s\S]{0,400}data-generate-code=""\s*>\s*<span className="min-w-0 text-left leading-snug whitespace-normal">\{generateLabel\}<\/span>\s*<\/CcButton>/);
    expect(src).toMatch(/<QualityTips[\s\S]*?onGenerate=\{startGeneration\}\s*generateLabel=\{generateLabel\}/);
    expect(code('components/transformation/QualityTips.tsx')).toMatch(/data-generate-now=""\s*>\s*<span className="min-w-0 text-left leading-snug whitespace-normal">\{generateLabel \?\? \(regenerate \? wt\('transformation\.regenerateNow'\) : wt\('transformation\.generateNow'\)\)\}<\/span>\s*<\/CcButton>/);
  });
});

test.describe('Documentation', () => {
  test('the business layer is never written on opening; every button goes through the click', () => {
    const src = code(DOCUMENTATION);
    expect(src).not.toMatch(/automatic/);
    expect(src).not.toContain('writeBusinessLayer');
    expect(src).not.toContain('autoBusinessFor');
    expect(src).not.toContain('askModeOf');
    expect(src).toContain('const generateBusinessDocumentation = useCallback(async () => {');
    expect(src).toContain('onClick={generateBusinessDocumentation}');
    // No effect calls it: every call is a handler.
    for (const m of src.matchAll(/generateBusinessDocumentation\(\)/g)) {
      const before = src.slice(Math.max(0, m.index! - 120), m.index!);
      expect(before, 'a call outside a click').toMatch(/=> void $|\(\) => void $|\{\s*void $|\n\s*void $/);
    }
    // The engine-only description is still read on opening: no model, no cost.
    expect(src).toContain('void generateDocumentation();');
  });

  test('the offer\'s button says "Generate draft (sends code to …)", and the progress card names the wait', () => {
    const src = code(DOCUMENTATION);
    expect(src).toMatch(/data-generate-business-layer\s*>\s*<span className="min-w-0 text-left leading-snug whitespace-normal">\{generateDraftLabel\(modelAvailability\.known \? providerCompanyOf\(modelAvailability\.provider\) : null\)\}<\/span>\s*<\/CcButton>/);
    const absence = src.slice(src.indexOf('const businessAbsence = !project'), src.indexOf('const progress = documentationProgress('));
    expect(absence).toContain(": wt('doc.businessWaitsForClick');");
    expect(read('lib/messages/documentation.ts')).toContain("'doc.businessWaitsForClick':");
  });
});

test('the proxy still refuses a marked call on an own key whose "Automatic steps" are off', () => {
  const route = read('app/api/gemini/route.ts');
  expect(route).toContain("const automatic = trigger === 'automatic';");
  expect(route).toContain('if (automatic && ownKey && !ownKey.autoSteps) {');
});
