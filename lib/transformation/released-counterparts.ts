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
    // IMPORTING VALUE(DATE) LIKE SY-DATUM, EXCEPTIONS PLAUSIBILITY_CHECK_FAILED. The function module accepts a date
    // that survives the round trip through the day count, and raises for any other. ABAP converts a `d` value to
    // `i` as the days since 01.01.0001 when it is a valid calendar date and to 0 otherwise (ABAP conversion rules,
    // source type d); 0 converts back to 00000000. So the round trip holds exactly for every valid date from
    // 00010101 to 99991231 and for the initial date 00000000, which the function module accepts as well, and fails
    // for everything else (30 February, month 13, letters, blanks). The parameter is converted to `d` first, as the
    // function module's typed VALUE parameter converts it at the call.
    why: 'a valid calendar date (or the initial date) survives the round trip through the day count, as in the function module; any other value raises where it raised PLAUSIBILITY_CHECK_FAILED',
    body(params, exceptionClass) {
      if (params.length !== 1 || params[0].name !== 'date' || params[0].direction !== 'importing' || params[0].optional) return null;
      return [
        '    DATA(lv_date) = CONV d( date ).',
        '    IF CONV d( CONV i( lv_date ) ) <> lv_date.',
        `      RAISE EXCEPTION NEW ${exceptionClass}( object = 'DATE_CHECK_PLAUSIBILITY' ).`,
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
