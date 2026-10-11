/**
 * The currencies the Economics tool offers as you type (owner, 11.10.2026:
 * "When I type EU…, let me pick EUR from a list right away").
 *
 * A list to pick from, never a default: the field starts empty, and a currency
 * is only stated when the reader picks one or types its code (ADR-035). Any
 * other ISO 4217 code can still be typed in full.
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
  if (/^[A-Z]{3}$/.test(upper) && ISO_4217_CODES.has(upper)) return { kind: 'code', code: upper };
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
