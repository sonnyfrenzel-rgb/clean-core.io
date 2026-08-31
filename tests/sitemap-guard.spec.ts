import { test, expect } from '@playwright/test';
import sitemap from '../app/sitemap';
import { APP_RELEASE_DATE } from '../lib/version';
import { CONTENT_LAST_MODIFIED } from '../lib/content-dates';

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

  test('every route the sitemap emits has a real date behind it', () => {
    // The fallback exists so a new route does not crash the build; a route that
    // silently lives on the fallback forever is the drift this file prevents.
    const release = new Date(APP_RELEASE_DATE).getTime();
    const onFallback = sitemap()
      .filter((e) => e.lastModified && new Date(e.lastModified).getTime() === release)
      .map((e) => e.url);

    expect(
      onFallback,
      `these URLs fell through to the release date — add their route to ` +
        `ROUTE_SOURCES in scripts/sync-content-dates.mjs and regenerate:\n${onFallback.join('\n')}`,
    ).toEqual([]);
  });
});
