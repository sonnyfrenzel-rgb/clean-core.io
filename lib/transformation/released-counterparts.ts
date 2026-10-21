/**
 * Roadmap 3.0.15 item (1), from the second SAP import (owner decision 16.10.2026): the SAP function modules whose
 * ABAP Cloud counterpart the engine writes itself, in the default access layer (`zcl_<x>_access`), instead of
 * leaving a `@cc-open ACCESS` stub that raises.
 *
 * Why it matters: the stub raises `zcx_<x>_access`, and the logic reads that as the function module's exception.
 * For DATE_CHECK_PLAUSIBILITY that meant every date read as implausible, and the program refused every run in a
 * real system until someone wired the check.
 *
 * The list is short on purpose. An entry is here only when its replacement is exact for every input the function
 * module accepts — written with ABAP language means only (no SAP class, no released API that could differ by
 * release), so the released-object check (`abap-check.ts`) has nothing to hold against it. Each entry says why it
 * is exact. A function module that "nearly" has a counterpart stays an open stub.
 *
 * Considered and NOT replaced (not exact):
 *   - CONVERSION_EXIT_ALPHA_INPUT / _OUTPUT: the string template's `ALPHA = IN|OUT` pads or strips to the length of
 *     the formatted value (or WIDTH), the conversion exit to the length of its OUTPUT parameter — the caller's
 *     variable, which the access method does not see. Exact only when both lengths are known and equal.
 *   - DATE_GET_WEEK, DATE_COMPUTE_DAY: the week and weekday follow a calendar convention (ISO week, first day of
 *     the week) the function module fixes and the ABAP arithmetic would have to restate — not certain enough.
 */

/** One access method's parameter, as the scaffold declares it. */
export interface CounterpartParam {
  name: string;
  direction: 'importing' | 'changing';
  optional: boolean;
}

export interface ReleasedCounterpart {
  /** The SAP function module, upper case. */
  functionModule: string;
  /** Why the replacement is exact — written into the access method and the package's notes. */
  why: string;
  /**
   * The method body (indented four spaces), or null when the call sites' parameters are not the shape the
   * replacement is exact for — then the method stays an open stub.
   */
  body(params: readonly CounterpartParam[], exceptionClass: string): string[] | null;
  /**
   * Cases the engine writes as ABAP Unit tests of the counterpart (`ltc_counterparts`), so an SAP system checks
   * the claim: the value handed in and whether the function module raises for it.
   */
  cases: ReadonlyArray<{ value: string; raises: boolean; why: string }>;
}

/** The comment that marks an engine-written counterpart in the access class; STATUS.md and TRACE.md read it. */
export const ENGINE_COUNTERPART_TAG = 'Engine-written counterpart of';

const COUNTERPARTS: readonly ReleasedCounterpart[] = [
  {
    functionModule: 'DATE_CHECK_PLAUSIBILITY',
    // IMPORTING VALUE(DATE) LIKE SY-DATUM, EXCEPTIONS PLAUSIBILITY_CHECK_FAILED. The function module accepts a valid
    // Gregorian calendar date and raises for any other value. The check is written out explicitly — it does not lean
    // on a conversion rule: the parameter is converted to `d` first, as the function module's
    // typed VALUE parameter converts it at the call; the initial date 00000000 passes, as the function module accepts
    // it (our reading of the module — to be confirmed in the SAP trial by the `ltc_counterparts` case); otherwise all
    // eight characters must be digits, the year 0001–9999, the month 01–12 and the day 01 to the last day of that
    // month — 29 February only in a leap year (divisible by 4, and not by 100 unless by 400). Anything else (30
    // February, 29 February 1900, month 13, day 0, letters, blanks) raises where the module raised.
    why: 'a valid Gregorian calendar date (or the initial date) passes, checked digit by digit, month by month and with the leap-year rule, as in the function module; any other value raises where it raised PLAUSIBILITY_CHECK_FAILED',
    body(params, exceptionClass) {
      if (params.length !== 1 || params[0].name !== 'date' || params[0].direction !== 'importing' || params[0].optional) return null;
      const raise = `      RAISE EXCEPTION NEW ${exceptionClass}( object = 'DATE_CHECK_PLAUSIBILITY' ).`;
      return [
        '    DATA(lv_date) = CONV d( date ).',
        '    IF lv_date IS INITIAL.',
        '      RETURN. " the initial date 00000000 is accepted, as by the function module (to be confirmed in the SAP trial)',
        '    ENDIF.',
        "    IF lv_date CN '0123456789'.",
        raise,
        '    ENDIF.',
        '    DATA(lv_year) = CONV i( lv_date(4) ).',
        '    DATA(lv_month) = CONV i( lv_date+4(2) ).',
        '    DATA(lv_day) = CONV i( lv_date+6(2) ).',
        '    DATA(lv_last_day) = COND i(',
        '      WHEN lv_month = 2 AND lv_year MOD 4 = 0 AND ( lv_year MOD 100 <> 0 OR lv_year MOD 400 = 0 ) THEN 29',
        '      WHEN lv_month = 2 THEN 28',
        '      WHEN lv_month = 4 OR lv_month = 6 OR lv_month = 9 OR lv_month = 11 THEN 30',
        '      ELSE 31 ).',
        '    IF lv_year < 1 OR lv_month < 1 OR lv_month > 12 OR lv_day < 1 OR lv_day > lv_last_day.',
        raise,
        '    ENDIF.',
      ];
    },
    cases: [
      { value: '20240229', raises: false, why: 'a leap day' },
      { value: '99991231', raises: false, why: 'the last date' },
      { value: '00010101', raises: false, why: 'the first date' },
      { value: '00000000', raises: false, why: 'the initial date' },
      { value: '20230229', raises: true, why: 'no leap year' },
      { value: '20261301', raises: true, why: 'month 13' },
      { value: '20261000', raises: true, why: 'day 0' },
      { value: '2026OCT1', raises: true, why: 'letters' },
      { value: '19000229', raises: true, why: 'divisible by 100, not by 400: no leap year' },
      { value: '20000229', raises: false, why: 'divisible by 400: a leap year' },
    ],
  },
];

/** The engine-written counterpart of a function module, or null. */
export function releasedCounterpartOf(functionModule: string): ReleasedCounterpart | null {
  const name = functionModule.toUpperCase();
  return COUNTERPARTS.find((c) => c.functionModule === name) ?? null;
}

/** Every function module on the list, in order. */
export function releasedCounterpartNames(): string[] {
  return COUNTERPARTS.map((c) => c.functionModule);
}

/** The function modules an ABAP source carries an engine-written counterpart of (read from the tag comment). */
export function engineCounterpartsIn(content: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`^[ \\t]*"[ \\t]*${ENGINE_COUNTERPART_TAG} ([A-Z0-9_/]+)\\b`, 'gm');
  for (let m = re.exec(content); m !== null; m = re.exec(content)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
