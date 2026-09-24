import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import {
  toDate,
  formatTextDate,
  formatIsoDate,
  formatDateTime,
  formatNumber,
  formatPercent,
} from '../lib/format';

/**
 * `lib/format.ts` — DESIGN.md §3, Block D step D.3.
 *
 * The point of the module is that its output depends on the value and on
 * nothing else. So the tests do not only check "15 Sep 2026"; they check that
 * the string stays the same when the machine's time zone moves across the date
 * line and when a browser set to German runs the same code.
 */

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.resolve(ROOT, 'lib/format.ts'), 'utf8');

/**
 * Runs `fn` with the process in another time zone. Node re-reads `TZ` when it
 * is assigned, so `new Date(...).getDate()` really does move — the check below
 * that it does is what keeps this helper from passing vacuously.
 */
function inZone<T>(zone: string, fn: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

// 23:30 UTC on 15 September: already the 16th in Auckland, still the 15th in
// Los Angeles. Any function that reads the local calendar gets one of them wrong.
const LATE = '2026-09-15T23:30:00Z';

test.describe('dates (§3: "15 Sep 2026" in text, ISO in tables, times with their zone)', () => {
  test('text and ISO dates', () => {
    expect(formatTextDate('2026-09-15T10:00:00Z')).toBe('15 Sep 2026');
    expect(formatTextDate('2026-01-02T00:00:00Z')).toBe('2 Jan 2026');
    expect(formatIsoDate('2026-09-15T10:00:00Z')).toBe('2026-09-15');
    expect(formatIsoDate('2026-01-02T00:00:00Z')).toBe('2026-01-02');
    // Every month is spelled from the fixed list — "Sep", never ICU's "Sept".
    const months = Array.from({ length: 12 }, (_, m) => formatTextDate(Date.UTC(2026, m, 1)));
    expect(months).toEqual([
      '1 Jan 2026', '1 Feb 2026', '1 Mar 2026', '1 Apr 2026', '1 May 2026', '1 Jun 2026',
      '1 Jul 2026', '1 Aug 2026', '1 Sep 2026', '1 Oct 2026', '1 Nov 2026', '1 Dec 2026',
    ]);
  });

  test('the machine time zone does not move the day', () => {
    // The helper works: the local calendar really differs between the zones.
    const localDay = (zone: string) => inZone(zone, () => new Date(LATE).getDate());
    expect(localDay('Pacific/Auckland')).toBe(16);
    expect(localDay('America/Los_Angeles')).toBe(15);

    for (const zone of ['Pacific/Auckland', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Europe/Berlin', 'UTC']) {
      inZone(zone, () => {
        expect(formatTextDate(LATE), zone).toBe('15 Sep 2026');
        expect(formatIsoDate(LATE), zone).toBe('2026-09-15');
        expect(formatDateTime(LATE), zone).toBe('15 Sep 2026, 23:30 UTC');
      });
    }
  });

  test('a time names its zone, and a named zone prints its offset', () => {
    expect(formatDateTime('2026-09-15T14:05:00Z')).toBe('15 Sep 2026, 14:05 UTC');
    expect(formatDateTime('2026-09-15T00:00:00Z')).toBe('15 Sep 2026, 00:00 UTC');
    // Summer time in Berlin: two hours ahead; the date moves with the wall clock.
    expect(formatDateTime(LATE, { timeZone: 'Europe/Berlin' })).toBe('16 Sep 2026, 01:30 GMT+2');
    expect(formatDateTime('2026-01-15T14:05:00Z', { timeZone: 'Europe/Berlin' })).toBe('15 Jan 2026, 15:05 GMT+1');
    expect(formatDateTime(LATE, { timeZone: 'America/Los_Angeles' })).toBe('15 Sep 2026, 16:30 GMT-7');
    expect(formatDateTime(LATE, { timeZone: 'Asia/Kolkata' })).toBe('16 Sep 2026, 05:00 GMT+5:30');
    // Zero offset is called UTC, whichever name reached it.
    expect(formatDateTime('2026-01-15T14:05:00Z', { timeZone: 'Europe/London' })).toBe('15 Jan 2026, 14:05 UTC');
    expect(formatDateTime('2026-01-15T14:05:00Z', { timeZone: 'Etc/UTC' })).toBe('15 Jan 2026, 14:05 UTC');
    // An unknown zone is not answered with some other clock.
    expect(formatDateTime(LATE, { timeZone: 'Mars/Olympus_Mons' })).toBeNull();
  });

  test('every shape a stored moment takes', () => {
    const ms = Date.UTC(2026, 8, 15, 12, 0, 0);
    const fromTimestamp = { toDate: () => new Date(ms) };
    const serialised = { seconds: ms / 1000, nanoseconds: 0 };
    const adminSerialised = { _seconds: ms / 1000, _nanoseconds: 500_000_000 };
    for (const value of [new Date(ms), ms, '2026-09-15T12:00:00Z', fromTimestamp, serialised, adminSerialised]) {
      expect(formatIsoDate(value), JSON.stringify(value)).toBe('2026-09-15');
    }
    expect(toDate(adminSerialised)?.getTime()).toBe(ms + 500);
    // A Date passed in is not the Date handed back — no caller can mutate the other's.
    const original = new Date(ms);
    expect(toDate(original)).not.toBe(original);
  });

  test('nothing is not a date: null, never "Invalid Date"', () => {
    for (const value of [null, undefined, '', 'not a date', NaN, {}, { seconds: 'x' }, { toDate: () => 'x' }]) {
      expect(formatTextDate(value), String(value)).toBeNull();
      expect(formatIsoDate(value), String(value)).toBeNull();
      expect(formatDateTime(value), String(value)).toBeNull();
    }
  });
});

test.describe('numbers (§3: Intl.NumberFormat("en"), grouped; percent whole)', () => {
  test('thousands are grouped with a comma, decimals are not invented or dropped', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(-1234567)).toBe('-1,234,567');
    // The digits `toLocaleString()` printed: up to three decimals, none padded.
    expect(formatNumber(1234.5)).toBe('1,234.5');
    expect(formatNumber(0.12345)).toBe('0.123');
    expect(formatNumber(1234.5678, { maximumFractionDigits: 1 })).toBe('1,234.6');
    expect(formatNumber(1234.5, { maximumFractionDigits: 0 })).toBe('1,235');
  });

  test('a percent is whole, and rounding never claims all or nothing', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.42)).toBe('42%');
    expect(formatPercent(0.425)).toBe('43%');
    expect(formatPercent(0.996)).toBe('99%');
    expect(formatPercent(0.999999)).toBe('99%');
    expect(formatPercent(0.004)).toBe('<1%');
    expect(formatPercent(0.000001)).toBe('<1%');
    expect(formatPercent(12.5)).toBe('1,250%');
    expect(formatPercent(-0.003)).toBe('0%');
    expect(formatPercent(-0.25)).toBe('-25%');
  });

  test('nothing is not a number: null, never "NaN"', () => {
    for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(formatNumber(value), String(value)).toBeNull();
      expect(formatPercent(value), String(value)).toBeNull();
    }
  });
});

test.describe('the module itself', () => {
  test('never asks the reader for a locale', () => {
    expect(SOURCE, 'a toLocale*String call formats in the reader locale').not.toMatch(/\.toLocale\w*String\(/);
    const intl = [...SOURCE.matchAll(/new Intl\.(\w+)\(\s*([^,)\s]*)/g)];
    expect(intl.length, 'no Intl call found — the check would pass vacuously').toBeGreaterThan(0);
    for (const m of intl) {
      expect(m[2], `new Intl.${m[1]}( without the 'en' locale`).toBe("'en'");
    }
    // Local-calendar getters read the machine zone; only the UTC ones may appear.
    expect(SOURCE).not.toMatch(/\.get(?:Date|Month|FullYear|Hours|Minutes|Day)\(/);
  });

  test('a German browser in Auckland prints what everybody else prints', async ({ browser }) => {
    // The same module, compiled and run in a real browser whose language and
    // zone are both "wrong" — no dev server involved, the page is blank.
    const js = ts.transpileModule(SOURCE, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const context = await browser.newContext({ locale: 'de-DE', timezoneId: 'Pacific/Auckland' });
    const page = await context.newPage();
    await page.setContent('<!doctype html><title>format</title>');
    await page.addScriptTag({ content: `(function(){var exports={};${js};window.__fmt=exports;})();` });

    const out = await page.evaluate((late) => {
      const f = (window as unknown as { __fmt: Record<string, (...a: unknown[]) => unknown> }).__fmt;
      return {
        localDay: new Date(late).getDate(),
        localNumber: (1234567.5).toLocaleString(),
        text: f.formatTextDate(late),
        iso: f.formatIsoDate(late),
        time: f.formatDateTime(late),
        number: f.formatNumber(1234567.5),
        percent: f.formatPercent(0.425),
      };
    }, LATE);
    await context.close();

    // The browser really is German and in Auckland …
    expect(out.localDay).toBe(16);
    expect(out.localNumber).toBe('1.234.567,5');
    // … and the module does not care.
    expect(out).toMatchObject({
      text: '15 Sep 2026',
      iso: '2026-09-15',
      time: '15 Sep 2026, 23:30 UTC',
      number: '1,234,567.5',
      percent: '43%',
    });
  });
});
