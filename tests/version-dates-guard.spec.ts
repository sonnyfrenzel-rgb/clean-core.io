import { test, expect } from '@playwright/test';
import { APP_RELEASE_DATE, APP_RELEASE_DATE_ISO, APP_RELEASE_DATE_DE } from '../lib/version';

/**
 * `lib/version.ts` keeps the release date three times, as literals on purpose
 * (a formatter shifts the day in every positive UTC offset). Literals drift:
 * v2.18.0 shipped with the displayed date moved to 24 September and the ISO and
 * German ones still on 22 September, so schema.org and the privacy policy named
 * a different day than the footer (QA review of 4b4586aff273).
 */
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function fromEnglish(s: string): string {
  const m = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(s);
  expect(m, `APP_RELEASE_DATE "${s}" is not "Month D, YYYY"`).not.toBeNull();
  const month = MONTHS_EN.indexOf(m![1]) + 1;
  expect(month).toBeGreaterThan(0);
  return `${m![3]}-${String(month).padStart(2, '0')}-${m![2].padStart(2, '0')}`;
}

function fromGerman(s: string): string {
  const m = /^(\d{1,2})\. (\S+) (\d{4})$/.exec(s);
  expect(m, `APP_RELEASE_DATE_DE "${s}" is not "D. Monat YYYY"`).not.toBeNull();
  const month = MONTHS_DE.indexOf(m![2]) + 1;
  expect(month).toBeGreaterThan(0);
  return `${m![3]}-${String(month).padStart(2, '0')}-${m![1].padStart(2, '0')}`;
}

test('the three release-date literals name the same day', () => {
  expect(APP_RELEASE_DATE_ISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(fromEnglish(APP_RELEASE_DATE)).toBe(APP_RELEASE_DATE_ISO);
  expect(fromGerman(APP_RELEASE_DATE_DE)).toBe(APP_RELEASE_DATE_ISO);
});
