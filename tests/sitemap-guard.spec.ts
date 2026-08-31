import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import sitemap from '../app/sitemap';
import { APP_RELEASE_DATE } from '../lib/version';
import { CONTENT_LAST_MODIFIED } from '../lib/content-dates';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/**
 * A sitemap timestamp is a claim about content, not about the build.
 *
 * Every URL here used to carry `lastModified: new Date()`. With three releases in
 * four days that meant thirty URLs — the July legal pages included — announcing a
 * daily change. Google recognises the pattern and stops trusting `lastmod` for the
 * whole domain, which costs the signal precisely on the pages that had just
 * changed and needed it.
 *
 * The two checks below are the two ways that comes back:
 *
 *   - a build-time stamp, which is always later than the release it shipped in;
 *   - a flattened map, where every route reports the same date and the file that
 *     was supposed to differentiate them differentiates nothing.
 */
test.describe('the sitemap dates content, not deploys', () => {
  test('no entry is stamped later than the release', () => {
    // A build stamp is later than the release by however long the pipeline took.
    // A content date never is.
    const release = new Date(APP_RELEASE_DATE);
    const cutoff = new Date(release.getTime() + 24 * 60 * 60 * 1000);

    const late = sitemap()
      .filter((e) => e.lastModified && new Date(e.lastModified) > cutoff)
      .map((e) => `${e.url} → ${new Date(e.lastModified as Date).toISOString().slice(0, 10)}`);

    expect(
      late,
      `these entries carry a timestamp after ${APP_RELEASE_DATE}, which means a build ` +
        `time leaked into the sitemap:\n${late.join('\n')}`,
    ).toEqual([]);
  });

  test('the dates actually differ from one another', () => {
    const distinct = new Set(Object.values(CONTENT_LAST_MODIFIED));
    expect(
      distinct.size,
      `lib/content-dates.ts has ${distinct.size} distinct date(s) across ` +
        `${Object.keys(CONTENT_LAST_MODIFIED).length} routes. A map where everything ` +
        'shares one date is the flat sitemap again under another name — regenerate it ' +
        'with `npm run sync:content-dates` on a full clone.',
    ).toBeGreaterThanOrEqual(5);
  });

  test('every route the sitemap asks for has a real date behind it', () => {
    // Checked against the source, not against dates.
    //
    // The first version of this compared each entry's timestamp to
    // `new Date(APP_RELEASE_DATE)` and called a match "fell through to the
    // fallback". `new Date('August 31, 2026')` parses at *local* midnight, while
    // a content date is built as `…T00:00:00Z`. On a machine at UTC+2 those
    // differ and the check passed; on the UTC CI runner they are the same
    // instant, and the guard reported the homepage as having no date on the very
    // day its content changed. The comment in lib/version.ts warns about exactly
    // this parse and I walked into it anyway.
    //
    // Route keys cannot collide with a timezone.
    const src = read('app/sitemap.ts');
    const asked = [...src.matchAll(/\bon\('([^']+)'\)/g)].map((m) => m[1]);

    expect(asked.length, 'no on() calls found in app/sitemap.ts').toBeGreaterThan(10);

    const missing = [...new Set(asked)].filter((route) => !(route in CONTENT_LAST_MODIFIED));
    expect(
      missing,
      'these routes fall through to the release date — add them to ROUTE_SOURCES ' +
        `in scripts/sync-content-dates.mjs and regenerate:\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});
