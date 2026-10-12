import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  CURRENCY_OPTIONS,
  currencyName,
  intlCurrencyCodes,
  isCurrencyCode,
  readCurrencyEntry,
  readOtherCurrency,
} from '../lib/currency-options';
import { formatMoney } from '../lib/format';
import { costAssumptionsRevision, formatAmount, formatAmountRange } from '../lib/cost-assumptions';
import { bindingShown } from '../lib/decision-card';
import { CURRENCY_FORM, serializeEconomics, validateEconomicsPayload, ECONOMICS_START_INPUTS } from '../lib/economics-record';
import { initialCostAssumptions } from '../components/tco/OptionComparison';

/**
 * A currency outside the list (owner, 12.10.2026: "In Economics, also allow
 * entering a new currency that is not in the list").
 *
 * Server-free: what the "Other currency" input accepts, how an amount in such a
 * currency is printed, and that the stored record, its revision and the
 * decision record carry it like any listed one. The rendered half — picking
 * "Other currency…", typing NOK, seeing amounts in NOK — is
 * `tests/economics-currency-other-rendered.spec.ts`.
 */

/** A runtime whose `Intl` knows a handful of codes — and one that cannot say. */
const SOME_INTL = new Set(['NOK', 'CHF', 'JPY', 'USD', 'EUR']);

test.describe('what the "Other currency" input accepts', () => {
  test('exactly three letters A–Z, upper-cased as stored', () => {
    expect(readOtherCurrency('')).toEqual({ kind: 'empty' });
    expect(readOtherCurrency('  ')).toEqual({ kind: 'empty' });
    expect(readOtherCurrency('nok')).toEqual({ kind: 'code', code: 'NOK' });
    expect(readOtherCurrency(' Nok ')).toEqual({ kind: 'code', code: 'NOK' });
    expect(readOtherCurrency('CHF')).toEqual({ kind: 'code', code: 'CHF' });
    for (const bad of ['NO', 'NOKK', 'N0K', 'NÖK', '€', 'N K', 'kr']) {
      const r = readOtherCurrency(bad);
      expect(r.kind, bad).toBe('invalid');
      if (r.kind === 'invalid') expect(r.problem, bad).toMatch(/exactly three letters A–Z.*such as NOK/);
    }
  });

  test('a code the list has selects that entry instead of standing twice', () => {
    for (const o of CURRENCY_OPTIONS) {
      expect(readOtherCurrency(o.code.toLowerCase())).toEqual({ kind: 'listed', code: o.code });
    }
  });

  test('checked against Intl and the ISO list; without Intl, the ISO list alone', () => {
    // Intl knows NOK: accepted. QQQ is neither in Intl nor in the ISO list: refused, with the fix.
    expect(readOtherCurrency('NOK', SOME_INTL)).toEqual({ kind: 'code', code: 'NOK' });
    const qqq = readOtherCurrency('qqq', SOME_INTL);
    expect(qqq.kind).toBe('invalid');
    if (qqq.kind === 'invalid') expect(qqq.problem).toMatch(/“QQQ” is not an ISO 4217 currency code\. Check the code/);
    // A code in the ISO list that this Intl lacks is still a code — each source can be behind the other.
    expect(readOtherCurrency('ZWG', new Set())).toEqual({ kind: 'code', code: 'ZWG' });
    // No Intl to ask: only the ISO list counts, three letters alone are not a currency
    // (QA 5ec8488a, c2cc1614def3).
    expect(readOtherCurrency('nok', null)).toEqual({ kind: 'code', code: 'NOK' });
    expect(readOtherCurrency('ZWG', null)).toEqual({ kind: 'code', code: 'ZWG' });
    const noIntl = readOtherCurrency('qqq', null);
    expect(noIntl.kind).toBe('invalid');
    if (noIntl.kind === 'invalid') expect(noIntl.problem).toMatch(/“QQQ” is not an ISO 4217 currency code\. Check the code, such as NOK/);
    expect(readOtherCurrency('qq', null).kind).toBe('invalid');
  });

  test('the runtime Intl is read, and every code it knows is a currency code', () => {
    const intl = intlCurrencyCodes();
    // Node 22+ and every current browser have `Intl.supportedValuesOf`.
    expect(intl).not.toBeNull();
    expect(intl!.has('NOK')).toBe(true);
    for (const code of intl!) expect(isCurrencyCode(code), code).toBe(true);
    expect(isCurrencyCode('nok')).toBe(false); // upper-cased by the caller
    expect(isCurrencyCode('IND')).toBe(false);
  });

  test('typing a full code into the list field still states it, and an Intl-only code too', () => {
    expect(readCurrencyEntry('nok')).toEqual({ kind: 'code', code: 'NOK' });
    expect(readCurrencyEntry('IND').kind).toBe('search');
  });

  test('a code outside the list is named from Intl, and one Intl does not know has no name', () => {
    expect(currencyName('NOK')).toMatch(/Norwegian Krone/i);
    expect(currencyName('EUR')).toBe('Euro');
    expect(currencyName('QQQ')).toBeNull();
    // Never throws, whatever is stored.
    expect(() => currencyName('€')).not.toThrow();
    expect(() => currencyName('')).not.toThrow();
  });
});

test.describe('an amount in a currency outside the list', () => {
  test('prints with its code, through Intl.NumberFormat, and never throws', () => {
    expect(formatMoney(12345, 'NOK')).toBe('NOK 12,345');
    expect(formatMoney(820.5, 'NOK')).toBe('NOK 820.5');
    expect(formatAmount(40000, 'NOK')).toBe('NOK 40,000');
    expect(formatAmountRange({ low: 1000, high: 2500 }, 'NOK')).toBe('NOK 1,000 – NOK 2,500');
    // A code Intl has never heard of, and a sign stored before the list existed.
    expect(() => formatMoney(1, 'QQQ')).not.toThrow();
    expect(formatMoney(1500, 'QQQ')).toBe('QQQ 1,500');
    expect(formatMoney(1500, '€')).toBe('€ 1,500');
  });

  test('no currency, no amount — a custom code changes nothing about that', () => {
    expect(formatAmount(40000, '')).toBe('Not determined');
    expect(formatMoney(40000, '')).toBeNull();
  });
});

test.describe('the stored record and the decision record', () => {
  test('a currency outside the list is stored, checked and named like a listed one', () => {
    const seed = initialCostAssumptions();
    const payload = { assumptions: { ...seed, currency: 'NOK' }, inputs: { ...ECONOMICS_START_INPUTS } };
    const checked = validateEconomicsPayload(JSON.parse(serializeEconomics(payload)));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.assumptions.currency).toBe('NOK');
    const revision = costAssumptionsRevision(checked.value.assumptions);
    expect(revision).toMatch(/(^|:)NOK@/);
    expect(bindingShown('cost', revision)).toMatch(/^NOK, /);
  });

  test('every code the input can state passes the stored record’s check', () => {
    for (const code of intlCurrencyCodes() ?? []) expect(CURRENCY_FORM.test(code), code).toBe(true);
    expect(CURRENCY_FORM.test('QQQ')).toBe(true);
  });
});

test.describe('the "Other currency" entry, from its source', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/tco/EconomicsChecklist.tsx'), 'utf8');
  const field = src.slice(src.indexOf('export function CurrencyField'), src.indexOf('export function CadenceField'));

  test('is the last option of the list, reachable by keyboard', () => {
    expect(field).toContain('data-economics-currency-option="other"');
    expect(field).toContain('Other currency…');
    expect(field).toMatch(/const entries = matches\.length \+ 1/);
    expect(field).toMatch(/active === otherIndex[\s\S]*chooseOther\(\)/);
  });

  test('opens a labelled input with the hint, an inline message and a way back', () => {
    expect(field).toContain('label="Other currency"');
    expect(field).toContain('help="ISO code, e.g. NOK"');
    expect(field).toContain('data-cost-field="currency-other"');
    expect(field).toContain('maxLength={3}');
    expect(field).toContain('{...otherMessage}');
    expect(field).toContain("'Escape'");
    expect(field).toContain('Back to the list');
    // 44 px on touch: the input and the option.
    expect(field.match(/pointer-coarse:min-h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
