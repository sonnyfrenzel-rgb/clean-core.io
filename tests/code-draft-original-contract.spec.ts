import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { materialRules } from '../lib/testing-rule-trace';
import { packedMax, readOriginalContract } from '../lib/abap/original-contract';
import { CODE_DRAFT_BUSINESS_RULES, MAX_FACT_GUARDS, codeDraftFactsSection } from '../lib/code-draft-rules';
import { CO_ALLOCATION, SD_REPRICING } from './helpers/code-draft-fixtures';

/**
 * Roadmap 3.0.12 (CO/FI/PP/SD reviews): the code-draft prompt asks the model
 * to keep the original's guards, input contract, precision, run binding and
 * honesty — and names this source's checks (with the engine's rule ids),
 * packed decimals (places and bounds) and selection inputs. Server-free, no
 * model: the prompt text and the readers are pinned, not a generation.
 */

const factsOf = (source: string) => codeDraftFactsSection(readOriginalContract(source), materialRules(deriveBusinessRules(source)));

test.describe('the rules the prompt carries (15–23)', () => {
  test('each rule is there, numbered on from 14', () => {
    const numbers = [...CODE_DRAFT_BUSINESS_RULES.matchAll(/^\s+(\d+)\. /gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  });

  test('guards first, with the rule id, for the CO guards the review lost', () => {
    const r = CODE_DRAFT_BUSINESS_RULES;
    expect(r).toContain('15. GUARDS FIRST');
    for (const g of ['a duplicate receiver', 'the sender as its own receiver', 'quotas over 100 %', 'an unknown segment', 'no receivers', 'a status precondition']) expect(r).toContain(g);
    expect(r).toContain('BEFORE any calculation');
    expect(r).toContain('A refusal names the rule id or line');
  });

  test('one input contract for every channel, strict numbers, bounds, dates, null is not 0, empty is not success', () => {
    const r = CODE_DRAFT_BUSINESS_RULES;
    expect(r).toContain('CSV, JSON and query input pass the SAME validator');
    expect(r).toContain('refuse "2026x", "1.9" for an integer, "", NaN, Infinity — never parseInt/parseFloat/Number() alone');
    expect(r).toContain('the upper bound of the declared type');
    expect(r).toContain('20260230 is refused');
    expect(r).toContain('null or missing is not 0');
    expect(r).toContain('never a successful simulation');
  });

  test('precision as declared: exact decimals, no new dependency, places kept, commercial rounding both signs', () => {
    const r = CODE_DRAFT_BUSINESS_RULES;
    expect(r).toContain('BigInt scaled by 10^n or decimal strings, never binary floating point, and no new dependency');
    expect(r).toContain('a ratio of 6 places stays 6');
    expect(r).toContain('half away from zero) for negative and positive values alike');
  });

  test('run binding: no global latest result, collision-free run id with selection, source and rule revision, never overwritten', () => {
    const r = CODE_DRAFT_BUSINESS_RULES;
    expect(r).toContain('no module-level "latest result"');
    expect(r).toContain('crypto.randomUUID(), never Date.now()');
    expect(r).toContain('carrying the selection, the source revision and the rule revision');
    expect(r).toContain('a stored run is never overwritten');
  });

  test('options honoured or refused, scopes apart, CSV guards, not-found vs empty, UTC, currency, no start on import', () => {
    const r = CODE_DRAFT_BUSINESS_RULES;
    expect(r).toContain('flags such as includeCredit');
    expect(r).toContain('never accepted and ignored');
    expect(r).toContain('display attributes (ALV colours, column widths, icons) are not part of the API contract');
    expect(r).toContain('RFC 4180');
    expect(r).toContain('a cell starting with =, +, -, @, tab or CR gets a leading apostrophe');
    expect(r).toContain('"record not found" apart from "found but empty"');
    expect(r).toContain('a credit limit of 0 is a limit');
    expect(r).toContain('Date arithmetic in UTC; every amount carries its currency and precision');
    expect(r).toContain('export an app factory (createApp()) and listen only in a separate entry point');
  });

  test('honest names: no SAP API, event or integration the code does not perform; no sap.s4.*; dependencies follow imports', () => {
    const r = CODE_DRAFT_BUSINESS_RULES;
    expect(r).toContain('an in-memory store is not an "S4HanaAdapter"');
    expect(r).toContain('no "updated via OData PATCH" without that call');
    expect(r).toContain('only where SAP has no standard business event for the change, never in SAP\'s namespace (no sap.s4.* topics or types)');
    expect(r).toContain('package.json declares exactly the dependencies the code imports');
  });

  test('the prompt\'s own file list no longer demands an event publisher', () => {
    const page = fs.readFileSync(path.resolve(__dirname, '..', 'app/(app)/project/[projectId]/transformation/page.tsx'), 'utf8');
    expect(page).not.toContain('zcl_core_event_publisher.clas.abap: CRITICAL!');
    expect(page).toContain('ONLY where SAP has no standard business event for the change');
    expect(page).toContain('never sap.s4.* (rule 23)');
  });

  test('the size stays within budget: the rules under 6,000 characters, far below the proxy\'s 250,000', () => {
    expect(CODE_DRAFT_BUSINESS_RULES.length).toBeLessThan(6_000);
  });
});

test.describe('the facts of the original, CO-shaped', () => {
  const contract = readOriginalContract(CO_ALLOCATION);
  const facts = factsOf(CO_ALLOCATION);

  test('the five guards, by line — the two the engine holds as control rules with their ids', () => {
    expect(contract.guards.map((g) => [g.line, g.effect])).toEqual([
      [24, 'error-message'],
      [30, 'error-message'],
      [34, 'error-message'],
      [37, 'error-message'],
      [42, 'error-message'],
    ]);
    expect(facts).toContain('L24-25: IF gt_rcv IS INITIAL → refuses with an error message (MESSAGE e001(zco))');
    expect(facts).toContain('L30-31: IF lines( gt_rcv ) <> gv_lines → refuses with an error message (MESSAGE e005(zco))');
    expect(facts).toContain('L34-35: IF gs_rcv-kostl = p_sender → refuses with an error message');
    expect(facts).toContain("BR-001 L37-38: IF gs_rcv-segment <> 'FAC' AND gs_rcv-segment <> 'IT' → refuses with an error message");
    expect(facts).toContain('BR-002 L42-43: IF gv_sum > 100 → refuses with an error message (MESSAGE e004(zco))');
  });

  test('packed decimals with places and bounds: a quota of 3, an amount of 2, a ratio of 6', () => {
    expect(contract.decimals.map((d) => [d.name, d.decimals, d.max])).toEqual([
      ['quota', 3, '999999999999.999'],
      ['gv_amount', 2, '999999999999999999999999999.99'],
      ['gv_share', 2, '999999999999999999999999999.99'],
      ['gv_ratio', 6, '99999999999.999999'],
      ['gv_sum', 3, '999999999999.999'],
    ]);
    expect(facts).toContain('quota L6: TYPE p LENGTH 8 DECIMALS 3 → 3 places, |value| ≤ 999999999999.999');
    expect(facts).toContain('gv_ratio L12: TYPE p LENGTH 9 DECIMALS 6 → 6 places, |value| ≤ 99999999999.999999');
  });

  test('the selection inputs: required context, a flag with its default, a filter without intervals', () => {
    expect(facts).toContain('p_kokrs L15: parameter TYPE kokrs, required');
    expect(facts).toContain('p_gjahr L16: parameter TYPE gjahr, required');
    expect(facts).toContain("p_test L18: parameter, checkbox, default 'X'");
    expect(facts).toContain('s_kostl L19: select-option FOR csks-kostl, NO INTERVALS');
  });
});

test.describe('the facts of the original, SD-shaped', () => {
  const facts = factsOf(SD_REPRICING);

  test('found-not-found, a status precondition and the credit option are guards', () => {
    expect(facts).toContain('L13-15: IF sy-subrc <> 0 → returns (RETURN)');
    expect(facts).toContain('L18: CHECK gs_item-abgru IS INITIAL → skips or leaves when false');
    expect(facts).toContain('L19-20: IF p_credit IS INITIAL AND gs_item-netwr < 0 → skips the item (CONTINUE)');
  });

  test('the old declaration form and a packed parameter are read; the credit flag is an input', () => {
    expect(facts).toContain('gv_net L5: TYPE p LENGTH 8 DECIMALS 2 → 2 places, |value| ≤ 9999999999999.99');
    expect(facts).toContain('gv_factor L6: TYPE p LENGTH 5 DECIMALS 4 → 4 places, |value| ≤ 99999.9999');
    expect(facts).toContain("p_factor L9: parameter TYPE p, default '1.0000'");
    expect(facts).toContain('s_vbeln L7: select-option FOR vbak-vbeln, required');
    expect(facts).toContain('p_credit L8: parameter, checkbox');
  });
});

test.describe('the readers at their edges', () => {
  test('packed bounds follow 2 × length − 1 digits', () => {
    expect(packedMax(15, 3)).toBe('999999999999.999');
    expect(packedMax(1, 0)).toBe('9');
    expect(packedMax(3, 3)).toBe('0.999');
  });

  test('a warning or status message alone is not a guard; a nested ending belongs to the inner IF only', () => {
    const src = [
      'REPORT z.',
      'IF a = 1.',
      "  MESSAGE w001(z).",
      'ENDIF.',
      'IF b = 2.',
      '  IF c = 3.',
      '    RETURN.',
      '  ENDIF.',
      'ENDIF.',
    ].join('\n');
    expect(readOriginalContract(src).guards.map((g) => [g.line, g.condition])).toEqual([[6, 'c = 3']]);
  });

  test('a source without checks, decimals or inputs says so; an unreadable one says it was not read', () => {
    const empty = codeDraftFactsSection(readOriginalContract("REPORT z.\nWRITE 'x'."));
    expect(empty).toContain('(none found in the source)');
    expect(empty).toContain('(none declared in the source; DDIC-typed fields keep the places of their DDIC type)');
    expect(codeDraftFactsSection(null)).toContain('the engine could not read the legacy source');
  });

  test('past the cap the rest is counted, not dropped silently', () => {
    const many = Array.from({ length: MAX_FACT_GUARDS + 2 }, (_, i) => `IF x = ${i}.\n  RETURN.\nENDIF.`).join('\n');
    const f = codeDraftFactsSection(readOriginalContract(`REPORT z.\n${many}`));
    expect(f).toContain('(and 2 more in the source — keep them too)');
  });
});

test.describe('the page puts the facts into the Node.js code-draft prompt', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '..', 'app/(app)/project/[projectId]/transformation/page.tsx'), 'utf8');

  test('right after the rules, read from the source the generation uses', () => {
    expect(page).toContain('${CODE_DRAFT_BUSINESS_RULES}${originalFacts}');
    // The generation screen (3.0.12) reads the contract once, for the prompt
    // and for the facts it shows in the stage log.
    expect(page).toContain('const original = readOriginalContract(legacyCode);');
    expect(page).toContain('codeDraftFactsSection(original, materialRules(deriveBusinessRules(legacyCode)))');
    expect(page).toContain("import('@/lib/abap/original-contract')");
    expect(page).toContain('originalFacts = codeDraftFactsSection(null);');
  });
});
