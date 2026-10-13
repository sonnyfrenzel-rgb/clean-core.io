import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * DSAG guideline review C2 (owner 13.10.2026): SAP's clean core level concept
 * (levels A–D, 2025) replaced the three-tier extensibility model. The product
 * speaks in levels, and where no released API exists it says "wrapper plus an
 * influence request to SAP" — never "Tier 2", and never that a wrapper makes
 * what it wraps upgrade-safe (a wrapper does not make the wrapped object stable).
 * DSAG ABAP guideline: clean-core/solution-approach.md § Level Concept
 *
 * A mention of the three-tier model as history ("replaced the three-tier
 * model") is not tier vocabulary and passes.
 */

const ROOT = path.resolve(__dirname, '..');

/**
 * Files still carrying the old vocabulary, each with the reason it is not
 * changed here. An entry may only shrink.
 */
const PENDING: Record<string, string> = {
  // Signed engine output and router text, owned by the engine change of the
  // same review (C1); changing them moves signed findings and routes.
  'lib/abap/evidence-model.ts': 'signed finding text — engine-version change pending',
  'lib/abap/extensibility-router.ts': 'signed route text — engine-version change pending (C1)',
};

/** "(tier 3)" survives in the stored contract label only — fingerprinted bytes, dropped for display. */
const STORED_LABEL = /'Key user extensibility \(tier 3\)'|"\(tier 3\)"|\\\(tier 3\\\)/;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === 'generated' || e.name === 'node_modules') continue;
      out.push(...files(rel));
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

const TIER = /\bTier[- ]?[123]\b|\b3-Tier\b|\bTier[- ]2\b/i;
const UPGRADE_SAFE_WRAPPER = /upgrade-safe\w*[^.\n]{0,60}wrapper|wrapper[^.\n]{0,60}upgrade-safe/i;

test('no tier vocabulary and no upgrade-safe wrapper claim outside the pending engine files', () => {
  const hits: string[] = [];
  for (const rel of [...files('app'), ...files('components'), ...files('lib'), ...files('hooks')]) {
    if (PENDING[rel]) continue;
    fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').forEach((line, i) => {
      if (STORED_LABEL.test(line)) return;
      // "tier" as a pricing or stacking word is no extensibility tier.
      if (TIER.test(line) || UPGRADE_SAFE_WRAPPER.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  expect(hits).toEqual([]);
});

test('the deployment choice speaks in levels and names the influence request', () => {
  const analyze = fs.readFileSync(path.join(ROOT, 'app/(app)/project/[projectId]/analyze/page.tsx'), 'utf8');
  expect(analyze).toMatch(/clean core levels A–D/);
  expect(analyze).toMatch(/influence request/);
  expect(analyze).toMatch(/does not make what it wraps stable/);
  const prompt = fs.readFileSync(path.join(ROOT, 'lib/analysis-prompt.ts'), 'utf8');
  expect(prompt).toMatch(/influence request to SAP/);
});

test('the stored key-user label keeps its bytes, and no screen shows "(tier 3)"', async () => {
  const { ALTERNATIVE_LABELS, alternativeLabelForDisplay } = await import('../lib/architecture-contract');
  expect(ALTERNATIVE_LABELS['key-user']).toBe('Key user extensibility (tier 3)');
  expect(alternativeLabelForDisplay('key-user')).toBe('Key user extensibility');
});
