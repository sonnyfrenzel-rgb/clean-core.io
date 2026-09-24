import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { FEATURE_SLUGS } from '../lib/features-content';
import { getAllCatalogObjectNames, getModuleAreas, objectToSlug } from '../lib/abap/catalog-index';

/**
 * The Copy-CI: roadmap 0.2 (`docs/roadmap/SCHNITT-0-UMFANG.md` §2, `UX-E14-F01:R0`).
 *
 * Phase 0 is "Belegt" — nothing on a public page claims more than the data
 * behind it supports. `tests/landing-consistency-guard.spec.ts` and
 * `tests/level-rule-page-guard.spec.ts` were the beginning of this: each one
 * found a specific defect (a typed-in object count, a rule page that could
 * drift from the function it describes) and pinned it. This file generalises
 * the same five rules across every public page, so the next drift does not
 * have to be found by a reader first:
 *
 *   1. a public number with no binding to lib/facts.ts,
 *   2. a marker phrase that belongs in a review thread, not in production
 *      ("previously", "used to claim", "TODO"),
 *   3. a page with no OG or no canonical of its own,
 *   4. an internal link to a route that does not exist,
 *   5. a level or role label re-typed on a page instead of read from the
 *      component that owns it.
 *
 * Every rule below is proven non-vacuous in the roadmap-0.2 report: each one
 * was broken on purpose, observed to fail, and reverted.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const isFile = (rel: string) => {
  const p = path.resolve(ROOT, rel);
  return fs.existsSync(p) && fs.statSync(p).isFile();
};

/**
 * The public, indexable pages this repo already treats as one surface — the
 * same set `tests/seo-surface-guard.spec.ts` protects for reach, plus `/facts`,
 * the page roadmap 0.2 adds. Dynamic routes (catalog objects, features) are
 * templated from data rather than hand-written copy, so a hard-coded number or
 * a marker phrase cannot hide in them the way it can in a page a person typed —
 * they stay out of this list on purpose.
 */
const PUBLIC_PAGES: Record<string, string> = {
  '/': 'app/page.tsx',
  '/how-it-works': 'app/(app)/how-it-works/page.tsx',
  '/abap-custom-code-analysis': 'app/(app)/abap-custom-code-analysis/page.tsx',
  '/sap-cloudification': 'app/(app)/sap-cloudification/page.tsx',
  '/facts': 'app/facts/page.tsx',
  '/catalog': 'app/catalog/page.tsx',
  '/clean-core-explained': 'app/(app)/clean-core-explained/page.tsx',
  '/knowledge': 'app/(app)/knowledge/page.tsx',
  '/clean-core-score': 'app/(app)/clean-core-score/page.tsx',
  '/whitepaper': 'app/whitepaper/page.tsx',
  '/reference-analysis': 'app/reference-analysis/page.tsx',
  '/how-to': 'app/(app)/how-to/page.tsx',
  '/licenses': 'app/licenses/page.tsx',
  '/about': 'app/(app)/about/page.tsx',
  '/trust': 'app/(app)/trust/page.tsx',
  '/tenant-security': 'app/(app)/tenant-security/page.tsx',
  '/sap-clean-core-object-classification': 'app/(app)/sap-clean-core-object-classification/page.tsx',
  '/method/levels': 'app/method/levels/page.tsx',
};

/**
 * The five pages that state a catalog figure — the four `23,000+` fallbacks
 * named in `docs/roadmap/SCHNITT-0-UMFANG.md` §2, work package 2, plus `/facts`
 * itself, the page they now all read from. `V25-A10` in the archived backlog
 * (`docs/archiv/roadmap-2.7/clean-core-backlog-v2_7.md`) is the same five.
 */
const FACTS_BOUND_PAGES = [
  'app/page.tsx',
  'app/(app)/how-it-works/page.tsx',
  'app/(app)/abap-custom-code-analysis/page.tsx',
  'app/(app)/sap-cloudification/page.tsx',
  'app/facts/page.tsx',
];

/** Strips balanced `{...}` — a JSX expression, whatever it computes — so only literal text is left. */
function stripBraceExpressions(s: string): string {
  let out = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { if (depth > 0) depth--; continue; }
    if (depth === 0) out += ch;
  }
  return out;
}

/** Strips quoted string literals — attribute values (`className="…"`, `href="…"`) are not prose. */
function stripQuotedStrings(s: string): string {
  return s.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '').replace(/`[^`]*`/g, '');
}

/** Comments removed — JSX (`{/* … *\/}`), block and line — so a fix's own explanation cannot trip the check it describes. */
function proseOnly(rel: string): string {
  return read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Whether an internal href resolves to a route this repo actually serves.
 *
 * Deliberately narrow: it knows a page can live directly under `app/` or under
 * the `(app)` group, that a route can be a `page.tsx` or a `route.ts`, and that
 * `public/` serves static files verbatim. It does not resolve dynamic segments
 * against real data (no catalog object, no feature slug appears as a literal
 * `href` on the pages this file checks — see the PUBLIC_PAGES comment), so a
 * page that starts linking to one would need this taught the same trick
 * `tests/seo-surface-guard.spec.ts` already knows for the catalog and feature
 * routes.
 */
function routeResolves(href: string): boolean {
  const clean = href.split('#')[0].split('?')[0];
  if (clean === '' || clean === '/') return isFile('app/page.tsx');
  if (isFile(path.join('public', clean))) return true;
  const base = clean.split('/').filter(Boolean).join('/');
  for (const group of ['', '(app)/']) {
    if (isFile(`app/${group}${base}/page.tsx`) || isFile(`app/${group}${base}/route.ts`)) return true;
  }
  // The 3.0 landing page (roadmap 3.0.6) links into the catalog and feature
  // pages by name. A dynamic segment resolves when its folder exists and the
  // value is one the route really serves — the same data seo-surface-guard reads.
  const parts = base.split('/');
  const last = parts.pop()!;
  const parent = parts.join('/');
  const served: Record<string, () => string[]> = {
    features: () => FEATURE_SLUGS,
    catalog: () => getAllCatalogObjectNames().map(objectToSlug),
    'catalog/browse': () => 'abcdefghijklmnopqrstuvwxyz'.split(''),
    'catalog/module': () => getModuleAreas().map((a) => a.code.toLowerCase()),
  };
  return Boolean(served[parent]?.().includes(last));
}

test.describe('every public number is bound to the facts service', () => {
  test('the five pages that state a catalog figure import lib/facts.ts', () => {
    for (const rel of FACTS_BOUND_PAGES) {
      expect(read(rel), `${rel} does not import lib/facts.ts`).toMatch(/from '@\/lib\/facts'/);
    }
  });

  test('none of them writes a large number as a bare literal in its copy', () => {
    for (const rel of FACTS_BOUND_PAGES) {
      const src = read(rel);
      const jsx = src.slice(src.indexOf('return ('));
      const literalOnly = stripQuotedStrings(stripBraceExpressions(jsx));
      // A thousands-grouped number ("23,000") or a bare four-or-more-digit one
      // ("23000") is the shape a typed-in public figure takes. Four-digit
      // literals that are plainly a calendar year ("2026") are not a claim
      // about the catalog and are excluded, the same way a lint rule for magic
      // numbers usually excludes them — the one hit this returned before the
      // exclusion was the footer's `&copy; 2026`.
      const found = (literalOnly.match(/\b\d{1,3}(?:,\d{3})+\+?\b|\b\d{4,}\b/g) || []).filter(
        (n) => !/^(19|20)\d{2}$/.test(n),
      );
      expect(found, `${rel} writes a number directly into its copy instead of reading lib/facts.ts: ${found.join(', ')}`).toEqual([]);
    }
  });
});

test.describe('no marker phrase reaches production copy', () => {
  test('none of "previously", "used to claim", "TODO" appears in a public page', () => {
    const offenders: string[] = [];
    for (const [route, rel] of Object.entries(PUBLIC_PAGES)) {
      const prose = proseOnly(rel);
      for (const marker of [/previously/i, /used to claim/i, /\bTODO\b/]) {
        const m = prose.match(marker);
        if (m) offenders.push(`${route} (${rel}): "${m[0]}"`);
      }
    }
    expect(offenders, `marker phrases found:\n${offenders.join('\n')}`).toEqual([]);
  });
});

test.describe('every public page declares its own Open Graph and canonical', () => {
  test('the metadata export names both, not just one', () => {
    const missing: string[] = [];
    for (const [route, rel] of Object.entries(PUBLIC_PAGES)) {
      const src = read(rel);
      const hasCanonical = /alternates:\s*\{[^}]*canonical/.test(src);
      const hasOpenGraph = /openGraph:\s*\{/.test(src);
      if (!hasCanonical) missing.push(`${route}: no alternates.canonical`);
      if (!hasOpenGraph) missing.push(`${route}: no openGraph`);
    }
    expect(missing, `pages missing their own OG or canonical:\n${missing.join('\n')}`).toEqual([]);
  });
});

test.describe('no public page links to a route that does not exist', () => {
  test('every internal href on a public page resolves to a real route or file', () => {
    const dead: string[] = [];
    for (const [route, rel] of Object.entries(PUBLIC_PAGES)) {
      const src = read(rel);
      const hrefs = new Set([...src.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]));
      for (const href of hrefs) {
        if (!routeResolves(href)) dead.push(`${route} (${rel}) → ${href}`);
      }
    }
    expect(dead, `dead internal links:\n${dead.join('\n')}`).toEqual([]);
  });
});

test.describe('level and role labels come from their one component, not a page copy', () => {
  /**
   * Generalises `tests/support-matrix-drift.spec.ts` (currently pinned to
   * `/how-it-works` alone) to every public page: the three labels
   * `lib/abap/support-matrix.ts` exports as `LEVEL_LABEL` are the "Stufentext"
   * for a construct's support level, and re-typing one of them anywhere is the
   * same defect whichever page does it.
   */
  test('no public page hardcodes a support-level label instead of importing LEVEL_LABEL', () => {
    const SUPPORT_LEVEL_LABELS = ['Fully Supported', 'Partial', 'Not Supported'];
    const offenders: string[] = [];
    for (const [route, rel] of Object.entries(PUBLIC_PAGES)) {
      const prose = proseOnly(rel);
      for (const label of SUPPORT_LEVEL_LABELS) {
        if (prose.includes(`'${label}'`) || prose.includes(`"${label}"`) || prose.includes(`>${label}<`)) {
          offenders.push(`${route} (${rel}) hardcodes "${label}"`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  /**
   * Generalises the "renderers style from the grade, not from the badge text"
   * check in `tests/landing-consistency-guard.spec.ts` (pinned to `app/page.tsx`
   * alone, where the defect was actually found: "Not Supported" and "Not
   * Available" drifted apart because two renderers compared the free-text
   * label instead of the shared enum) to any public page. The free-text badge
   * describes what SAP's role is for a row ("Static Check", "ATC Flags Only",
   * "Manual Only", …); branching layout or colour on that string is the
   * "Rollentext" living outside the data it was supposed to just display.
   */
  test('no public page branches on a free-text badge instead of its level field', () => {
    const offenders: string[] = [];
    for (const [route, rel] of Object.entries(PUBLIC_PAGES)) {
      const src = read(rel);
      const m = src.match(/\.badge\s*===\s*['"][^'"]*['"]/g);
      if (m) offenders.push(`${route} (${rel}): ${m.join(', ')}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

test.describe('the facts service never reaches the browser', () => {
  /**
   * `lib/abap/catalog-service.ts` is server-only by convention (CLAUDE.md), not
   * by a package: this repo has no `server-only` npm dependency to enforce it
   * (see the comment in lib/facts.ts on why one was not added), and it is
   * already broken in two places `docs/BACKLOG.md` tracks under "Der
   * SAP-Katalog liegt im Browser-Bundle" (`components/analyze/UsageRiskMatrix.tsx`
   * and the workspace's Public-Cloud-Fit panel). That backlog item is its own,
   * separate fix — three other agents are working in `components/workspace/`
   * while this file is being written, so a repo-wide sweep here would fail on
   * code outside this task's scope. What this guards is narrower and squarely
   * this task's own responsibility: the new facts surfaces must not be the
   * third place that regresses it.
   */
  test('lib/facts.ts carries no client directive', () => {
    const src = read('lib/facts.ts').trimStart();
    expect(src.startsWith("'use client'") || src.startsWith('"use client"')).toBe(false);
  });

  test('the new /facts page and JSON route read it as server code', () => {
    for (const rel of ['app/facts/page.tsx', 'app/facts.json/route.ts']) {
      const src = read(rel).trimStart();
      expect(src.startsWith("'use client'") || src.startsWith('"use client"'), `${rel} is a client component`).toBe(false);
    }
  });
});
