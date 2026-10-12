/**
 * The currencies the Economics tool offers as you type (owner, 11.10.2026:
 * "When I type EU…, let me pick EUR from a list right away").
 *
 * A list to pick from, never a default: the field starts empty, and a currency
 * is only stated when the reader picks one or types its code (ADR-035). Any
 * other ISO 4217 code can still be typed in full, or entered under "Other
 * currency…" (owner, 12.10.2026).
 *
 * Pure — no React, no browser — so the matching is tested on its own
 * (`tests/currency-options.spec.ts`).
 */

export interface CurrencyOption {
  /** ISO 4217 code. */
  code: string;
  /** The currency's English name. */
  name: string;
  /** The sign it is usually written with. */
  symbol: string;
  /** The countries that pay in it — what a reader may type instead of the code. */
  countries: readonly string[];
  /** Other words a reader may type for it. */
  aliases?: readonly string[];
}

// Ordered by Search Console impressions per currency, export of 10.10.2026.
export const CURRENCY_OPTIONS: readonly CurrencyOption[] = Object.freeze([
  {
    code: 'USD',
    name: 'US dollar',
    symbol: '$',
    countries: ['United States', 'USA', 'America', 'Ecuador', 'El Salvador', 'Puerto Rico'],
    aliases: ['Dollar', 'Vereinigte Staaten'],
  },
  {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    countries: [
      'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Austria', 'Belgium', 'Portugal', 'Ireland',
      'Finland', 'Greece', 'Slovakia', 'Slovenia', 'Croatia', 'Luxembourg', 'Lithuania', 'Latvia',
      'Estonia', 'Malta', 'Cyprus', 'Bulgaria',
    ],
    aliases: ['Europe', 'European Union', 'Deutschland', 'Österreich', 'Frankreich', 'Spanien', 'Italien', 'Niederlande'],
  },
  { code: 'INR', name: 'Indian rupee', symbol: '₹', countries: ['India'], aliases: ['Rupee', 'Indien'] },
  { code: 'BRL', name: 'Brazilian real', symbol: 'R$', countries: ['Brazil'], aliases: ['Real', 'Brasilien'] },
  {
    code: 'GBP',
    name: 'Pound sterling',
    symbol: '£',
    countries: ['United Kingdom', 'UK', 'Great Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
    aliases: ['British pound', 'Pound', 'Vereinigtes Königreich', 'Großbritannien'],
  },
  { code: 'IDR', name: 'Indonesian rupiah', symbol: 'Rp', countries: ['Indonesia'], aliases: ['Rupiah', 'Indonesien'] },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$', countries: ['Australia'], aliases: ['Australien'] },
  { code: 'VND', name: 'Vietnamese dong', symbol: '₫', countries: ['Vietnam', 'Viet Nam'], aliases: ['Dong'] },
  { code: 'PHP', name: 'Philippine peso', symbol: '₱', countries: ['Philippines'], aliases: ['Peso', 'Philippinen'] },
  {
    code: 'KRW',
    name: 'South Korean won',
    symbol: '₩',
    countries: ['South Korea', 'Korea', 'Republic of Korea'],
    aliases: ['Won', 'Südkorea'],
  },
]);

/**
 * The ISO 4217 codes in circulation — what a reader may type in full for a
 * currency that is not in the list. Fund codes, precious metals and testing
 * codes (XAU, XTS, XXX …) are left out: none of them pays a day rate.
 */
export const ISO_4217_CODES: ReadonlySet<string> = new Set(
  (
    'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD ' +
    'CAD CDF CHF CLP CNY COP CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP ' +
    'GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD ' +
    'KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK ' +
    'NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS ' +
    'SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VED VES VND VUV WST ' +
    'XAF XCD XCG XOF XPF YER ZAR ZMW ZWG ZWL'
  ).split(' '),
);

/** Exactly three letters A–Z — the form of every ISO 4217 code. */
export const ISO_CODE_FORM = /^[A-Z]{3}$/;

let intlCodes: ReadonlySet<string> | null | undefined;

/**
 * The currency codes this runtime's `Intl` knows, or `null` where it cannot
 * say (`Intl.supportedValuesOf` is missing, or throws). Read once.
 */
export function intlCurrencyCodes(): ReadonlySet<string> | null {
  if (intlCodes !== undefined) return intlCodes;
  try {
    const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    intlCodes = typeof supportedValuesOf === 'function' ? new Set(supportedValuesOf('currency')) : null;
  } catch {
    intlCodes = null;
  }
  return intlCodes;
}

/**
 * Whether `code` (already upper-cased) is a currency code in circulation: in
 * the list above, or one the runtime's `Intl` knows. Both, because each can be
 * behind the other — a code introduced after this file was written is in a
 * newer `Intl`, one introduced after the browser's ICU was built is here
 * (owner, 12.10.2026).
 */
export function isCurrencyCode(code: string, intl: ReadonlySet<string> | null = intlCurrencyCodes()): boolean {
  if (!ISO_CODE_FORM.test(code)) return false;
  return ISO_4217_CODES.has(code) || (intl?.has(code) ?? false);
}

/**
 * The English name of a currency code — "Norwegian Krone" for NOK — from the
 * list, else from `Intl.DisplayNames`; `null` where neither has one. Never
 * throws: a code `Intl` does not know is shown as its code.
 */
export function currencyName(code: string): string | null {
  const listed = CURRENCY_OPTIONS.find((o) => o.code === code);
  if (listed) return listed.name;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

export type OtherCurrency =
  /** Nothing typed yet. */
  | { kind: 'empty' }
  /** A code the list already has: that entry is selected rather than added again. */
  | { kind: 'listed'; code: string }
  /** A code outside the list that can be stated. */
  | { kind: 'code'; code: string }
  /** Not a code — what is wrong and how it becomes right, in one sentence. */
  | { kind: 'invalid'; problem: string };

/**
 * What the "Other currency" input states (owner, 12.10.2026: "In Economics,
 * also allow entering a new currency that is not in the list"). Exactly three
 * letters A–Z, upper-cased as stored. Checked against the runtime's `Intl`
 * where it can say; where it cannot, the three-letter form is enough — the
 * reader chose "Other currency" and typed a code on purpose, so an old browser
 * must not keep them from stating it. A code the list has selects that entry.
 */
export function readOtherCurrency(
  text: string,
  intl: ReadonlySet<string> | null = intlCurrencyCodes(),
): OtherCurrency {
  const t = text.trim();
  if (!t) return { kind: 'empty' };
  const upper = t.toUpperCase();
  if (!ISO_CODE_FORM.test(upper)) {
    return {
      kind: 'invalid',
      problem: `“${t}” is not a currency code. Enter exactly three letters A–Z, the ISO 4217 code, such as NOK.`,
    };
  }
  if (CURRENCY_OPTIONS.some((o) => o.code === upper)) return { kind: 'listed', code: upper };
  if (intl === null || isCurrencyCode(upper, intl)) return { kind: 'code', code: upper };
  return {
    kind: 'invalid',
    problem: `“${upper}” is not an ISO 4217 currency code. Check the code, such as NOK for the Norwegian krone or CHF for the Swiss franc.`,
  };
}

/** Lower case, accents and umlauts folded — "Österreich" and "osterreich" are one word. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Whether `term` starts with `q`, or has a word that does. */
function startsWord(term: string, q: string): boolean {
  const t = fold(term);
  if (t.startsWith(q)) return true;
  return t.split(/[\s-]+/).some((w) => w.startsWith(q));
}

export interface CurrencyMatch {
  option: CurrencyOption;
  /** What the query matched, when it was a country — "Germany" for "Ger". Shown beside the option. */
  via: string | null;
}

/**
 * The options that fit what the reader typed, best first: a code that starts
 * with it, then a name, sign or alias, then a country — and inside each group
 * in the order of the list. An empty query lists all of them.
 */
export function matchCurrencies(query: string): CurrencyMatch[] {
  const q = fold(query);
  if (!q) return CURRENCY_OPTIONS.map((option) => ({ option, via: null }));
  const scored: { match: CurrencyMatch; score: number; index: number }[] = [];
  CURRENCY_OPTIONS.forEach((option, index) => {
    if (fold(option.code).startsWith(q)) {
      scored.push({ match: { option, via: null }, score: 0, index });
      return;
    }
    if (
      startsWord(option.name, q) ||
      fold(option.symbol) === q ||
      (option.aliases ?? []).some((a) => startsWord(a, q))
    ) {
      scored.push({ match: { option, via: null }, score: 1, index });
      return;
    }
    const country = option.countries.find((c) => startsWord(c, q));
    if (country) scored.push({ match: { option, via: country }, score: 2, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.match);
}

export type CurrencyEntry =
  /** Nothing typed: no currency stated. */
  | { kind: 'empty' }
  /** A code that can be stated as it stands. */
  | { kind: 'code'; code: string }
  /** Text that is not a code — the reader is searching, or typed something unknown. */
  | { kind: 'search'; text: string };

/**
 * What typed text states. Only an ISO 4217 code states a currency on its own;
 * anything else is a search the reader picks from. The code is upper-cased,
 * as stored.
 */
export function readCurrencyEntry(text: string): CurrencyEntry {
  const t = text.trim();
  if (!t) return { kind: 'empty' };
  const upper = t.toUpperCase();
  if (isCurrencyCode(upper)) return { kind: 'code', code: upper };
  return { kind: 'search', text: t };
}

/** The option for a code, if the list has one. */
export function currencyOption(code: string): CurrencyOption | null {
  return CURRENCY_OPTIONS.find((o) => o.code === code) ?? null;
}

/**
 * Why typed text does not state a currency, in one sentence — for the field's
 * message once the reader has left it. `null` when it does.
 */
export function currencyEntryProblem(text: string, stated: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (t === stated || t.toUpperCase() === stated) return null;
  const entry = readCurrencyEntry(t);
  if (entry.kind === 'code') return null;
  const still = stated ? ` The page still uses ${stated}.` : ' No currency is stated yet.';
  if (/^[a-z]{3}$/i.test(t)) {
    return `“${t.toUpperCase()}” is not an ISO 4217 currency code. Pick a currency from the list, or type its three-letter code, such as CHF or JPY.${still}`;
  }
  return `“${t}” is not a currency code. Pick a currency from the list, or type its three-letter ISO 4217 code, such as CHF or JPY.${still}`;
}
