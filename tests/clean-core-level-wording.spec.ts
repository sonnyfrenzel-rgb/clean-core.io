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
 * The old vocabulary that stays, line by line rather than file by file (QA
 * review of 03501b79fb3d, e487c0c9d67a: a whole-file exemption let a new
 * current-engine "Tier" sentence in either engine file pass). Each entry is a
 * fragment of the one line it permits: the words a run of an engine before
 * 3.0.12 signed, kept behind the engine-version gate so that run re-renders
 * unchanged, or a comment naming the old model as history. Every entry must
 * still match a line — the list can only shrink — and the rendered test below
 * checks that the current engine prints none of them.
 */
const LEGACY_LINES: Record<string, readonly string[]> = {
  'lib/abap/evidence-model.ts': [
    "'Reading from custom tables directly is acceptable if wrapped in Tier-2 or CDS views",
    "' In Private Cloud this creates upgrade risk that can be mitigated with Tier 2 wrappers.'",
    "In Private Cloud, Tier 2 wrappers can mitigate this.'",
  ],
  'lib/abap/extensibility-router.ts': [
    '// Not "wrappable". A wrapper ("Tier 2" in the words of runs before 3.0.12)',
    "legacyRule ? 'Key User Extensibility (Tier 3)'",
    "legacyRule ? 'In-App Developer Extensibility (Tier 1)'",
    "'Target: clean core compliant once the code uses released APIs only (Tier 1).",
    "'Requires Tier-2 wrapping if unreleased APIs are needed'",
    "'S/4HANA Public Cloud deployment model selected — no Tier-2 unreleased API access available.'",
    "'S/4HANA Private Cloud deployment model selected — Tier-2 unreleased API wrapping is available.'",
    '// A wrapper ("Tier 2" before 3.0.12) wraps an unreleased SAP object',
    '// From 3.0.12 the line says "wrapper", not "Tier-2 wrapper": the level',
    "A Tier-2 wrapper may encapsulate an unreleased object for use; it does not make a direct write supported.'",
  ],
};

/**
 * "(tier 3)" survives in the stored contract label only — fingerprinted bytes,
 * dropped for display. Only the label's own text is exempt, not the line it
 * stands on (QA review of c38f8043f118, 824c18916f3c).
 */
const STORED_LABEL = /'Key user extensibility \(tier 3\)'|"\(tier 3\)"|\\\(tier 3\\\)/g;

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

/**
 * The lines of one file that carry tier vocabulary once the exempt text — the
 * stored label and this file's legacy fragments, each used once — is cut out of
 * them. What else stands on an exempt line is still read.
 */
function offendingLines(rel: string, text: string, used: Set<string>): string[] {
  const legacy = LEGACY_LINES[rel] ?? [];
  const hits: string[] = [];
  text.split('\n').forEach((line, i) => {
    let rest = line.replace(STORED_LABEL, '');
    const allowed = legacy.find((fragment) => rest.includes(fragment) && !used.has(`${rel}\u0000${fragment}`));
    if (allowed) {
      used.add(`${rel}\u0000${allowed}`);
      rest = rest.replace(allowed, '');
    }
    // "tier" as a pricing or stacking word is no extensibility tier.
    if (!TIER.test(rest) && !UPGRADE_SAFE_WRAPPER.test(rest)) return;
    hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });
  return hits;
}

test('an exempt label or legacy fragment exempts only itself, not the rest of its line (QA c38f8043: 824c18916f3c)', () => {
  const label = "  'key-user': 'Key user extensibility (tier 3)',";
  expect(offendingLines('lib/x.ts', label, new Set())).toEqual([]);
  expect(offendingLines('lib/x.ts', `${label} // a Tier 2 wrapper`, new Set())).toHaveLength(1);
  const fragment = LEGACY_LINES['lib/abap/extensibility-router.ts'][1];
  expect(offendingLines('lib/abap/extensibility-router.ts', `  name: ${fragment} : 'x',`, new Set())).toEqual([]);
  expect(offendingLines('lib/abap/extensibility-router.ts', `  name: ${fragment} : 'Tier 1',`, new Set())).toHaveLength(1);
});

test('no tier vocabulary and no upgrade-safe wrapper claim outside the legacy engine lines', () => {
  const hits: string[] = [];
  const used = new Set<string>();
  for (const rel of [...files('app'), ...files('components'), ...files('lib'), ...files('hooks')]) {
    hits.push(...offendingLines(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'), used));
  }
  expect(hits).toEqual([]);
  const stale = Object.entries(LEGACY_LINES).flatMap(([rel, list]) => list.filter((f) => !used.has(`${rel}\u0000${f}`)).map((f) => `${rel}: ${f}`));
  expect(stale, 'a legacy line that matches nothing any more leaves the list').toEqual([]);
});

/**
 * What the current engine prints, over the 300 benchmark programs in both
 * editions: no tier vocabulary in any finding or route sentence. The same run
 * with the engine of 3.0.11 does print it — the check can see what it is about.
 */
test('the current engine prints no tier vocabulary; the engine of 3.0.11 still does', async () => {
  test.setTimeout(180_000);
  const { buildAbapEvidence } = await import('../lib/abap/evidence-model');
  const { routeExtensibility } = await import('../lib/abap/extensibility-router');
  const { APP_VERSION } = await import('../lib/version');
  const casesDir = path.join(ROOT, 'tests/prozess-benchmark/cases');
  const sources = fs.readdirSync(casesDir).filter((n) => /^BM-\d{3}$/.test(n)).sort().flatMap((id) => {
    const abap = fs.readdirSync(path.join(casesDir, id)).filter((n) => n.endsWith('.abap')).sort();
    return abap.length ? [{ id, file: abap[0], code: abap.map((f) => fs.readFileSync(path.join(casesDir, id, f), 'utf8')).join('\n') }] : [];
  });
  expect(sources.length).toBeGreaterThanOrEqual(300);
  const printed = (engine: string) => sources.flatMap(({ id, file, code }) => (['private', 'public'] as const).flatMap((deployment) => {
    const evidence = buildAbapEvidence(code, file, deployment, undefined, engine);
    const text = JSON.stringify({ evidence, route: routeExtensibility(evidence, deployment, engine) });
    const hit = TIER.exec(text) ?? UPGRADE_SAFE_WRAPPER.exec(text);
    return hit ? [`${id}/${deployment}: …${text.slice(Math.max(0, hit.index - 60), hit.index + 60)}…`] : [];
  }));
  expect(printed(APP_VERSION)).toEqual([]);
  expect(printed('v3.0.11').length).toBeGreaterThan(0);
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
