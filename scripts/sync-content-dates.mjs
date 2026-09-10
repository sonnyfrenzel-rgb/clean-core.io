/**
 * Regenerates `lib/content-dates.ts` — the last date each indexable route's
 * content actually changed, read from the git history of the files that render it.
 *
 * Why this file exists: `app/sitemap.ts` used to stamp `lastModified: new Date()`
 * on roughly thirty URLs, so every deploy told Google that every page had changed.
 * With three releases in four days that is a claim no site can support, and the
 * documented consequence is that Google stops trusting `lastmod` for the whole
 * domain — which costs exactly the new pages that need the signal most.
 *
 * Run it after changing page content:
 *
 *   npm run sync:content-dates
 *
 * It needs real git history. On a shallow clone (`fetch-depth: 1`, the CI default)
 * every file reports the same commit date, so the script refuses to write rather
 * than flattening the map it exists to keep varied.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Route → the files whose content the page is made of. The newest of them wins.
 * A page that renders a data module (the guide, the reference run, the feature
 * copy) is only as fresh as that module, which is why they are listed too.
 */
const ROUTE_SOURCES = {
  '/': ['app/page.tsx', 'components/BenefitCard.tsx', 'components/TransformationShowroom.tsx', 'lib/reference-analysis.ts'],
  '/clean-core-explained': ['app/(app)/clean-core-explained/page.tsx', 'lib/clean-core-guide.ts'],
  '/first-run': ['app/(app)/first-run/page.tsx'],
  '/how-to': ['app/(app)/how-to/page.tsx'],
  '/knowledge': ['app/(app)/knowledge/page.tsx', 'components/KnowledgeClient.tsx'],
  '/abap-custom-code-analysis': ['app/(app)/abap-custom-code-analysis/page.tsx'],
  '/clean-core-score': ['app/(app)/clean-core-score/page.tsx'],
  '/sap-clean-core-object-classification': ['app/(app)/sap-clean-core-object-classification/page.tsx'],
  // Every figure on this page is computed by getLevelDerivationCensus() over the
  // two SAP artifacts, so the page is exactly as fresh as that function and the
  // rules it reports on — not as fresh as its own JSX.
  '/method/levels': ['app/method/levels/page.tsx', 'lib/abap/catalog-service.ts', 'lib/abap/abcd-classification.ts'],
  '/sap-cloudification': ['app/(app)/sap-cloudification/page.tsx'],
  '/how-it-works': ['app/(app)/how-it-works/page.tsx'],
  '/about': ['app/(app)/about/page.tsx'],
  '/whitepaper': ['app/whitepaper/page.tsx'],
  '/reference-analysis': ['app/reference-analysis/page.tsx', 'lib/reference-analysis.ts'],
  '/tenant-security': ['app/(app)/tenant-security/page.tsx'],
  '/trust': ['app/(app)/trust/page.tsx'],
  '/impressum': ['app/impressum/page.tsx'],
  '/datenschutz': ['app/datenschutz/page.tsx'],
  '/terms': ['app/terms/page.tsx'],
  '/licenses': ['app/licenses/page.tsx'],
  '/catalog': ['app/catalog/page.tsx', 'lib/abap/catalog-index.ts'],
  '/catalog/browse': ['app/catalog/browse/[letter]/page.tsx', 'lib/abap/catalog-index.ts'],
  '/catalog/module': ['app/catalog/module/[area]/page.tsx', 'lib/abap/catalog-index.ts'],
  '/catalog/object': ['app/catalog/[object]/page.tsx', 'lib/abap/catalog-index.ts'],
  '/features': ['app/features/[slug]/page.tsx', 'lib/features-content.ts'],
};

/**
 * Lines whose change says nothing about what a page tells a reader.
 *
 * v2.7.2 pulled `export const metadata: Metadata = {…}` into
 * `withTwitterCard({…})` across 18 page files in a single commit. Under "newest
 * commit touching these files wins" that dated 18 routes to the same day and
 * collapsed the whole map to three distinct dates — the flat sitemap this module
 * exists to prevent, arriving by a different route. `tests/sitemap-guard.spec.ts`
 * refuses a map that flat, and it is right to: the sweep changed how metadata is
 * assembled, not what any of it says.
 *
 * Deliberately narrow. A change to a `title` or a `description` IS content and
 * must move the date, so only the wrapper itself is listed here — not the object
 * it wraps.
 */
const PLUMBING_LINES = [
  /^import .*from '@\/lib\/page-metadata';$/,
  /^export const metadata: Metadata = (\{|withTwitterCard\(\{)$/,
  /^\}\)?;$/,
];

/** True when a commit's diff for one file touches nothing but the lines above. */
function isPlumbingOnly(sha, relPath) {
  let diff;
  try {
    diff = execFileSync('git', ['diff', '--unified=0', `${sha}~1`, sha, '--', relPath], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  } catch {
    return false; // root commit, or no parent to diff against — count it as content.
  }
  const changed = diff
    .split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
    .map((l) => l.slice(1).trim());
  return changed.length > 0 && changed.every((l) => PLUMBING_LINES.some((re) => re.test(l)));
}

/** The newest commit that changed this file's content, skipping plumbing sweeps. */
function lastCommitDate(relPath) {
  const log = execFileSync('git', ['log', '--format=%H %cs', '--', relPath], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  if (!log) return null;
  for (const line of log.split('\n')) {
    const [sha, date] = line.split(' ');
    if (!isPlumbingOnly(sha, relPath)) return date;
  }
  return null;
}

const dates = {};
const missing = [];
for (const [route, files] of Object.entries(ROUTE_SOURCES)) {
  const found = files
    .filter((f) => fs.existsSync(path.join(ROOT, f)))
    .map(lastCommitDate)
    .filter(Boolean);
  if (found.length === 0) {
    missing.push(route);
    continue;
  }
  dates[route] = found.sort().at(-1);
}

if (missing.length) {
  console.error(`No git date for: ${missing.join(', ')}`);
  process.exit(1);
}

const distinct = new Set(Object.values(dates));
if (distinct.size < 3) {
  console.error(
    `Only ${distinct.size} distinct date(s) across ${Object.keys(dates).length} routes — ` +
      'this looks like a shallow clone. Refusing to write a flattened map.',
  );
  process.exit(1);
}

const body = `/**
 * When each indexable route's content last actually changed.
 *
 * GENERATED — run \`npm run sync:content-dates\` to refresh. Do not hand-edit;
 * the dates come from the git history of the files that render each route.
 *
 * \`app/sitemap.ts\` reads this instead of stamping every URL with the build time.
 * A sitemap timestamp is a claim about content, and thirty URLs claiming to have
 * changed on every deploy is a claim Google answers by ignoring \`lastmod\` for the
 * whole domain.
 */
export const CONTENT_LAST_MODIFIED: Record<string, string> = {
${Object.entries(dates)
  .map(([route, date]) => `  '${route}': '${date}',`)
  .join('\n')}
};

/** Falls back to the release date for a route not in the map. */
export function contentDate(route: string, fallback: Date): Date {
  const iso = CONTENT_LAST_MODIFIED[route];
  return iso ? new Date(\`\${iso}T00:00:00Z\`) : fallback;
}
`;

fs.writeFileSync(path.join(ROOT, 'lib/content-dates.ts'), body, 'utf8');
console.log(`lib/content-dates.ts written — ${Object.keys(dates).length} routes, ${distinct.size} distinct dates.`);
