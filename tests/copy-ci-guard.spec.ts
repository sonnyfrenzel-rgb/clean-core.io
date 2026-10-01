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

/** A JSX expression that is only a literal: `{23000}`, `{"23,000+"}`, `{'…'}`, a template without substitutions. */
const LITERAL_EXPRESSION = /\{\s*(\d[\d,._]*\+?|"[^"\n]*"|'[^'\n]*'|`[^`$]*`)\s*\}/g;

/** An internal href as an attribute string or as a static string expression. */
const STATIC_HREF = /href=(?:"(\/[^"]*)"|\{\s*["'`](\/[^"'`$]*)["'`]\s*\})/g;

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

/** The repo files a module imports directly (`@/…` and relative, static and `import()`), one level deep. */
function localImportsOf(rel: string): string[] {
  const out = new Set<string>();
  for (const m of read(rel).matchAll(/(?:\bfrom|\bimport\s*\()\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    let base: string;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(rel), spec);
    else continue;
    const hit = ['.ts', '.tsx', '/index.ts', '/index.tsx'].map((ext) => base + ext).find(isFile);
    if (hit) out.add(hit);
  }
  return [...out];
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
      // A figure written as a JSX expression (`{23000}`, `{"23,000+"}`) is as
      // typed-in as one in the text, and stripping every brace expression above
      // used to delete it before the scan (QA full review of fc787674705f,
      // d66a38dd036e). An expression that is nothing but a literal is copy.
      const literalExpressions = [...jsx.matchAll(LITERAL_EXPRESSION)].map((m) => m[1]).join(' ');
      const found = (`${literalOnly} ${literalExpressions}`.match(/\b\d{1,3}(?:,\d{3})+\+?\b|\b\d{4,}\b/g) || []).filter(
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
      // The page and every local module it imports directly: copy a page renders
      // through an imported component is on the page just the same (QA full
      // review of fc787674705f, 6975ea14026a).
      for (const file of [rel, ...localImportsOf(rel)]) {
        const prose = proseOnly(file);
        for (const marker of [/previously/i, /used to claim/i, /\bTODO\b/]) {
          const m = prose.match(marker);
          if (m) offenders.push(`${route} (${file}): "${m[0]}"`);
        }
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
      // `href={'/x'}` is as valid as `href="/x"` and used to go unread (QA full
      // review of fc787674705f, ca9590dc0003).
      const hrefs = new Set([...src.matchAll(STATIC_HREF)].map((m) => m[1] ?? m[2]));
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

test.describe('the readers see the expression forms (QA full review of fc787674705f)', () => {
  test('a figure or an href written as a literal expression is read, not stripped', () => {
    const jsx = `<p>{23000} objects, {"23,000+"} APIs, {count} live</p><Link href={'/does-not-exist'}>x</Link><a href="/about">y</a>`;
    expect([...jsx.matchAll(LITERAL_EXPRESSION)].map((m) => m[1])).toEqual(['23000', '"23,000+"', "'/does-not-exist'"]);
    expect(stripBraceExpressions(jsx)).not.toContain('23');
    expect([...jsx.matchAll(STATIC_HREF)].map((m) => m[1] ?? m[2])).toEqual(['/does-not-exist', '/about']);
  });

  test('the marker scan reaches the components a page imports', () => {
    expect(localImportsOf('app/page.tsx').some((f) => f.startsWith('components/'))).toBe(true);
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
