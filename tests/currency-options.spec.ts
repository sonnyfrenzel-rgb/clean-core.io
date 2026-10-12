import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  CURRENCY_OPTIONS,
  ISO_4217_CODES,
  currencyEntryProblem,
  currencyOption,
  matchCurrencies,
  readCurrencyEntry,
} from '../lib/currency-options';
import { CURRENCY_FORM } from '../lib/economics-record';

/**
 * The currency of Economics as a list to pick from (owner, 11.10.2026: "When I
 * type EU…, let me pick EUR from a list right away, US → USD, for the 10 most
 * important currencies").
 *
 * Server-free: the matching is a pure module, and the combobox's keyboard
 * contract is read from its source — the rendered half runs in
 * `tests/tco-page-rendered.spec.ts` and `tests/economics-persist.spec.ts`.
 */

const codes = (q: string) => matchCurrencies(q).map((m) => m.option.code);

test.describe('the list', () => {
  test('is ten currencies, in the order derived from Search Console, each with a name and a sign', () => {
    expect(CURRENCY_OPTIONS.map((o) => o.code)).toEqual(['USD', 'EUR', 'INR', 'BRL', 'GBP', 'IDR', 'AUD', 'VND', 'PHP', 'KRW']);
    for (const o of CURRENCY_OPTIONS) {
      expect(o.name, o.code).not.toBe('');
      expect(o.symbol, o.code).not.toBe('');
      expect(o.countries.length, o.code).toBeGreaterThan(0);
      expect(ISO_4217_CODES.has(o.code), `${o.code} is an ISO 4217 code`).toBe(true);
      // What the list states is what the stored record accepts.
      expect(CURRENCY_FORM.test(o.code)).toBe(true);
    }
  });

  test('says where its order comes from, and carries no per-country figures', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib/currency-options.ts'), 'utf8');
    expect(src).toContain('// Ordered by Search Console impressions per currency, export of 10.10.2026.');
    // The export's figures stay out of the public repo: no impressions, clicks or CTR.
    expect(src).not.toMatch(/impressions?\s*[:=]\s*\d|clicks?\s*[:=]\s*\d|\bCTR\b|\d+(\.\d+)?%/i);
  });
});

test.describe('typing filters it', () => {
  test('by code, as the owner typed it', () => {
    expect(codes('EU')[0]).toBe('EUR');
    expect(codes('eu')[0]).toBe('EUR');
    expect(codes('US')[0]).toBe('USD');
    expect(codes('US')).not.toContain('AUD');
    expect(codes('GB')).toEqual(['GBP']);
  });

  test('by currency name, alias or sign', () => {
    expect(codes('Euro')).toEqual(['EUR']);
    expect(codes('Dollar')).toEqual(['USD', 'AUD']);
    expect(codes('Rupee')).toEqual(['INR']);
    expect(codes('Ind')).toEqual(['INR', 'IDR']);
    expect(codes('pound')).toEqual(['GBP']);
    expect(codes('€')).toEqual(['EUR']);
    expect(codes('$')).toEqual(['USD']);
  });

  test('by country, and says which country matched', () => {
    expect(codes('Germany')).toEqual(['EUR']);
    expect(matchCurrencies('Ger')[0]).toEqual({ option: currencyOption('EUR'), via: 'Germany' });
    expect(codes('United States')).toEqual(['USD']);
    expect(codes('India')).toEqual(['INR']);
    expect(codes('Brazil')).toEqual(['BRL']);
    expect(codes('United Kingdom')).toEqual(['GBP']);
    expect(codes('Korea')).toEqual(['KRW']);
    // Umlauts folded either way.
    expect(codes('Österreich')).toEqual(['EUR']);
    expect(codes('osterreich')).toEqual(['EUR']);
  });

  test('a code match comes before a name, a name before a country', () => {
    // "IN": INR by its code, then IDR by its name "Indonesian", nothing by a country only.
    expect(codes('IN')).toEqual(['INR', 'IDR']);
    // "U": USD by code before GBP by the country "UK".
    expect(codes('U')[0]).toBe('USD');
    expect(codes('U')).toContain('GBP');
  });

  test('nothing typed lists all ten; nothing that fits lists none', () => {
    expect(codes('')).toHaveLength(10);
    expect(codes('   ')).toHaveLength(10);
    expect(codes('Switzerland')).toEqual([]);
    expect(codes('xyz')).toEqual([]);
  });
});

test.describe('what typed text states', () => {
  test('an ISO 4217 code states itself, upper-cased; anything else is a search', () => {
    expect(readCurrencyEntry('')).toEqual({ kind: 'empty' });
    expect(readCurrencyEntry('  ')).toEqual({ kind: 'empty' });
    expect(readCurrencyEntry('chf')).toEqual({ kind: 'code', code: 'CHF' });
    expect(readCurrencyEntry(' EUR ')).toEqual({ kind: 'code', code: 'EUR' });
    // A code outside the ten stays possible.
    expect(readCurrencyEntry('JPY')).toEqual({ kind: 'code', code: 'JPY' });
    // Three letters that are no currency state nothing: "IND" is a search for INR or IDR.
    expect(readCurrencyEntry('IND').kind).toBe('search');
    expect(readCurrencyEntry('EU').kind).toBe('search');
    expect(readCurrencyEntry('Euro').kind).toBe('search');
    expect(readCurrencyEntry('€').kind).toBe('search');
  });

  test('text that states no currency says what is wrong and what is allowed', () => {
    expect(currencyEntryProblem('', '')).toBeNull();
    expect(currencyEntryProblem('EUR', 'EUR')).toBeNull();
    expect(currencyEntryProblem('chf', 'CHF')).toBeNull();
    // A currency stored before the list existed reads back as it was stored.
    expect(currencyEntryProblem('€', '€')).toBeNull();
    expect(currencyEntryProblem('IND', '')).toMatch(/“IND” is not an ISO 4217 currency code\. Pick a currency from the list.*No currency is stated yet\./);
    expect(currencyEntryProblem('Euro', 'USD')).toMatch(/“Euro” is not a currency code\..*The page still uses USD\./);
  });
});

test.describe('the combobox, from its source', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/tco/EconomicsChecklist.tsx'), 'utf8');
  const field = src.slice(src.indexOf('export function CurrencyField'), src.indexOf('export function CadenceField'));

  test('is a combobox with a listbox of options, and names the active one', () => {
    expect(field).toContain('role="combobox"');
    expect(field).toContain('aria-autocomplete="list"');
    expect(field).toMatch(/aria-expanded=\{expanded\}/);
    expect(field).toMatch(/aria-controls=\{listId\}/);
    // The active entry is a listed currency or "Other currency…" (owner, 12.10.2026).
    expect(field).toMatch(/aria-activedescendant=\{activeId\}/);
    expect(field).toMatch(/const activeId = activeMatch\s*\? optionId\(activeMatch\.option\.code\)/);
    expect(field).toContain('role="listbox"');
    expect(field).toContain('role="option"');
    expect(field).toMatch(/aria-selected=\{selected\}/);
    // Code, name and sign in every option.
    expect(field).toContain('{m.option.code}');
    expect(field).toContain('{m.option.name}');
    expect(field).toContain('{m.option.symbol}');
  });

  test('answers the four keys', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) expect(field, key).toContain(`'${key}'`);
  });

  test('keeps the field the specs and the save address, and starts from no currency', () => {
    expect(field).toContain('data-cost-field="currency"');
    const page = fs.readFileSync(path.resolve(__dirname, '..', 'app/(app)/project/[projectId]/tco/page.tsx'), 'utf8');
    expect(page).toMatch(/\[currency, setCurrency\] = useState\(''\)/);
    // Picking is the only way a listed currency gets in: nothing in the field picks one by itself.
    expect(field).not.toMatch(/onChange\((['"])[A-Z]{3}\1\)/);
    expect(field).not.toMatch(/CURRENCY_OPTIONS\[0\]/);
  });
});
