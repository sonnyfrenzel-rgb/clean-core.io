import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  deriveStandardCoverage,
  type CatalogLookup,
  type StandardCapability,
  type StandardCoverage,
} from '../lib/abap/standard-coverage';
import {
  EVIDENCE_CEILING,
  EVIDENCE_LEVEL_VALUES,
  fitOfLevel,
  isEvidenceLevelAtMost,
  levelFromEvidence,
  scopeItemLabel,
  SCOPE_ITEM_NOTE,
  STANDARD_EVIDENCE_KINDS,
  type EvidenceLevelValue,
  type StandardEvidence,
} from '../lib/evidence-level';
import { objectStatus } from '../lib/object-status';
import { readTableDependencies } from '../lib/abap/table-dependencies';
import { resolveApi } from '../lib/abap/catalog-service';

/**
 * Standard coverage per capability, E0–E4 — roadmap 7.2.
 *
 * Three sentences stand in the roadmap row, and each of them is a way this
 * product could be caught lying:
 *
 *   1. *ein Kataloglink ergibt höchstens E1* — that SAP's catalogue names a
 *      successor for a table says a successor exists for the table. It says
 *      nothing about the decision the custom code makes with it.
 *   2. *ein Scope Item ist eine zu prüfende ID* — an ID printed on its own reads
 *      as an answer; it is an address.
 *   3. *ein fehlender Katalogtreffer beweist nichts* — the catalogue lists what
 *      SAP has published, not what exists. A gap in it is a gap in the list, and
 *      reading it as "not supported" is the defect
 *      `tests/unearned-verdicts-guard.spec.ts` was written about.
 *
 * Every assertion below runs the real derivation on real ABAP — the eight
 * programs this product ships, plus four snippets for the cases none of them
 * contains. Nothing is asserted against a hand-written copy of the arithmetic
 * (the reason `tests/tco-model.spec.ts` replaced its predecessor).
 *
 * **Not vacuous.** On 2026-09-18 each assurance below was broken on its own in
 * `lib/evidence-level.ts` or `lib/abap/standard-coverage.ts`, the suite run, and
 * the change taken back. The number is how many tests of this spec went red:
 *
 *   - catalogue ceiling raised from E1 to E3 — 5;
 *   - scope-item ceiling raised from E1 to E2 — 2;
 *   - `scopeItemLabel` returning the bare ID — 2;
 *   - `fitOfLevel('E1')` returning `partial` instead of no status — 4;
 *   - `fitOfLevel('E4')` returning `done` — 1;
 *   - the E0 reason rewritten to "Not supported by SAP standard." — 2;
 *   - `levelFromEvidence` counting instead of taking a maximum — 2;
 *   - `reference` accesses counted as objects the capability touches — 2;
 *   - a rule with no readable subject given a capability of its own — 1;
 *   - an empty source answering `noSource: false` — 1;
 *   - the same sentence for "no catalogue consulted" and "catalogue had nothing" — 1.
 */

const EXAMPLES = join(process.cwd(), 'public/starter-examples');
const example = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');

const PO = 'Z_MM_PO_APPROVAL.abap';
const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const ALL_EXAMPLES = [
  PO,
  LEGACY,
  'Z_BUSINESS_PARTNER_SYNC.txt',
  'Z_EMPLOYEE_EXPENSE_VAL.txt',
  'Z_INVOICE_EXTRACTOR.txt',
  'Z_MATERIAL_STOCK_CALC.txt',
  'Z_ORDER_INTEGRITY_CHECK.txt',
  'Z_SALES_ORDER_CREATOR.txt',
];

/** The catalogue the product actually ships, asked the one question 7.2 needs. */
const REAL_CATALOG: CatalogLookup = { successorFor: (o) => resolveApi(o)?.view ?? null };

/** A catalogue with one entry, for the cases where the shipped one is too big to reason about. */
const ONE_ENTRY: CatalogLookup = {
  successorFor: (o) => (o === 'EBAN' ? 'API_PURCHASEREQUISITION_SRV' : null),
};

/** A catalogue that answers nothing — the shape of a custom table. */
const EMPTY_CATALOG: CatalogLookup = { successorFor: () => null };

/* ------------------------------------------------------------- snippets */

/** One rule on a field of a table the catalogue knows: the E1 case. */
const HIT = `REPORT ztest.

DATA: gs_eban TYPE eban.

START-OF-SELECTION.
  PERFORM check_currency.

FORM check_currency.
  SELECT SINGLE * FROM eban INTO gs_eban WHERE banfn = '0010000001'.
  IF gs_eban-waers <> 'EUR'.
    WRITE / 'foreign currency'.
  ENDIF.
ENDFORM.
`;

/** The same shape on a custom table nothing published a successor for: the E0 case. */
const MISS = `REPORT ztest.

DATA: gs_own TYPE zmm_vend_block.

START-OF-SELECTION.
  PERFORM check_block.

FORM check_block.
  SELECT SINGLE * FROM zmm_vend_block INTO gs_own WHERE lifnr = '1'.
  IF gs_own-blocked = 'X' AND gs_own-reason = 'CRD'.
    WRITE / 'blocked'.
  ENDIF.
ENDFORM.
`;

/** A decision whose subject the engine cannot read out of the code. */
const NO_SUBJECT = `REPORT ztest.
START-OF-SELECTION.
  PERFORM check_it.

FORM check_it.
  IF lo_ref->get_value( ) > 42.
    WRITE / 'over'.
  ENDIF.
ENDFORM.
`;

const capabilityOf = (coverage: StandardCoverage, key: string): StandardCapability => {
  const found = coverage.capabilities.find((c) => c.key === key);
  if (!found) throw new Error(`no capability ${key} in ${coverage.capabilities.map((c) => c.key).join(', ')}`);
  return found;
};

const evidence = (kind: StandardEvidence['kind'], reference: string): StandardEvidence => ({
  kind,
  reference,
  source: 'the guard',
});

/** Every sentence a coverage table puts in front of a reader. */
function sentencesOf(coverage: StandardCoverage): string[] {
  const out: string[] = [];
  for (const c of coverage.capabilities) {
    if (c.notDetermined) out.push(c.notDetermined.detail);
    if (c.next) out.push(c.next);
    for (const s of c.scopeItems) out.push(s.label);
    for (const e of c.evidence) out.push(e.reference, e.source);
  }
  for (const u of coverage.unassigned) out.push(u.detail);
  return out;
}

/* ================================================================== *
 * 1 — a catalogue link is worth at most E1
 * ================================================================== */

test.describe('a catalogue link is worth at most E1', () => {
  test('the ceiling is E1, and quantity does not raise it', () => {
    expect(EVIDENCE_CEILING['catalog-successor']).toBe('E1');
    expect(levelFromEvidence([evidence('catalog-successor', 'EBAN → API_PURCHASEREQUISITION_SRV')])).toBe('E1');
    // Forty pointers are forty pointers. A sum here is how a screen full of
    // catalogue hits would come to read as a proof.
    const forty = Array.from({ length: 40 }, (_, i) => evidence('catalog-successor', `T${i}`));
    expect(levelFromEvidence(forty)).toBe('E1');
  });

  test('a real catalogue hit on real ABAP produces exactly E1', () => {
    const cap = capabilityOf(deriveStandardCoverage(HIT, { catalog: ONE_ENTRY }), 'GS_EBAN-WAERS');
    expect(cap.candidates.map((c) => `${c.object}→${c.successor}`)).toEqual([
      'EBAN→API_PURCHASEREQUISITION_SRV',
    ]);
    expect(cap.level).toBe('E1');
    // And the claim is checkable: the line the object is read on travels with it.
    expect(cap.candidates[0].anchor).toBe('L9');
  });

  test('a catalogue hit is not a fit — E1 carries no object status at all', () => {
    const cap = capabilityOf(deriveStandardCoverage(HIT, { catalog: ONE_ENTRY }), 'GS_EBAN-WAERS');
    expect(cap.fit, 'a pointer nobody followed is not "partial" — none of it is established').toBeNull();
    expect(cap.fitProvenance).toBe('not-determined');
    expect(cap.notDetermined?.reason).toBe('pointer-only');
  });

  test('nothing the shipped catalogue can say lifts a shipped program above E1', () => {
    for (const name of ALL_EXAMPLES) {
      const coverage = deriveStandardCoverage(example(name), { catalog: REAL_CATALOG });
      expect(coverage.counts.byLevel.E2 + coverage.counts.byLevel.E3 + coverage.counts.byLevel.E4, name).toBe(0);
      for (const cap of coverage.capabilities) {
        expect(
          isEvidenceLevelAtMost(cap.level, 'E1'),
          `${name} ${cap.id} reached ${cap.level} on catalogue evidence alone`,
        ).toBe(true);
      }
    }
  });

  test('the measured reading of the two programs that have rules', () => {
    // Measured, not chosen: eleven decisions in the purchase-requisition
    // example, three of them standing in routines that read a table SAP has
    // published a successor for.
    const po = deriveStandardCoverage(example(PO), { catalog: REAL_CATALOG });
    expect(po.program).toBe('Z_MM_PO_APPROVAL');
    expect(po.counts.capabilities).toBe(11);
    expect(po.counts.byLevel).toEqual({ E0: 8, E1: 3, E2: 0, E3: 0, E4: 0 });
    expect(po.counts.withCandidate).toBe(3);
    // Every one of the eleven is *Not determined*: there is no step in this
    // release that can produce E2 or higher, and the table says so rather than
    // rounding three catalogue pointers up into a fit.
    expect(po.counts.notDetermined).toBe(11);

    const legacy = deriveStandardCoverage(example(LEGACY), { catalog: REAL_CATALOG });
    expect(legacy.counts.capabilities).toBe(15);
    expect(legacy.counts.byLevel).toEqual({ E0: 11, E1: 4, E2: 0, E3: 0, E4: 0 });
    // Two thresholds on one field are one capability with two rules in it.
    expect(capabilityOf(legacy, 'LV_DAYS_OLD').ruleIds).toEqual(['BR-009', 'BR-010']);
  });
});

/* ================================================================== *
 * 2 — a scope item is an ID to check
 * ================================================================== */

test.describe('a scope item is an ID to check', () => {
  test('its ceiling is E1, like the catalogue it stands beside', () => {
    expect(EVIDENCE_CEILING['scope-item']).toBe('E1');
    expect(levelFromEvidence([evidence('scope-item', '18J')])).toBe('E1');
  });

  test('it is never written without "to verify"', () => {
    expect(SCOPE_ITEM_NOTE).toBe('to verify');
    expect(scopeItemLabel('18J')).toBe('18J — to verify');
    const coverage = deriveStandardCoverage(MISS, {
      catalog: EMPTY_CATALOG,
      supplied: { 'GS_OWN-REASON': { scopeItems: [{ id: 'J45', source: 'entered by the account' }] } },
    });
    const cap = capabilityOf(coverage, 'GS_OWN-REASON');
    expect(cap.scopeItems.map((s) => s.label)).toEqual(['J45 — to verify']);
    expect(cap.evidence.filter((e) => e.kind === 'scope-item').map((e) => e.reference)).toEqual([
      'J45 — to verify',
    ]);
  });

  test('a scope item is not a confirmation: it leaves the fit undetermined', () => {
    const coverage = deriveStandardCoverage(MISS, {
      catalog: EMPTY_CATALOG,
      supplied: { 'GS_OWN-REASON': { scopeItems: [{ id: 'J45', source: 'entered by the account' }] } },
    });
    const cap = capabilityOf(coverage, 'GS_OWN-REASON');
    expect(cap.level).toBe('E1');
    expect(cap.fit).toBeNull();
    expect(cap.notDetermined?.reason).toBe('pointer-only');
    expect(cap.next, 'the next step is to follow it, not to record it as met').toContain('J45 — to verify');
  });

  test('none is invented: no shipped program produces a scope item from nothing', () => {
    // There is no scope-item catalogue in this repository and this module does
    // not contain one. The only way one appears is if a caller supplied it.
    for (const name of ALL_EXAMPLES) {
      const coverage = deriveStandardCoverage(example(name), { catalog: REAL_CATALOG });
      expect(coverage.counts.scopeItems, name).toBe(0);
      for (const cap of coverage.capabilities) expect(cap.scopeItems, `${name} ${cap.id}`).toEqual([]);
    }
  });

  test('what SAP calls it is not filled in either', () => {
    const coverage = deriveStandardCoverage(MISS, {
      catalog: EMPTY_CATALOG,
      supplied: { 'GS_OWN-REASON': { scopeItems: [{ id: 'J45', source: 'entered by the account' }] } },
    });
    expect(capabilityOf(coverage, 'GS_OWN-REASON').scopeItems[0].names).toBeNull();
  });
});

/* ================================================================== *
 * 3 — a missing catalogue hit proves nothing
 * ================================================================== */

test.describe('a missing catalogue hit proves nothing', () => {
  test('it produces E0 with a reason, and no status to colour', () => {
    const cap = capabilityOf(deriveStandardCoverage(MISS, { catalog: REAL_CATALOG }), 'GS_OWN-REASON');
    // The custom table was read — the catalogue was asked and had nothing.
    expect(cap.objects.map((o) => o.name)).toContain('ZMM_VEND_BLOCK');
    expect(cap.candidates).toEqual([]);
    expect(cap.level).toBe('E0');
    expect(cap.fit, 'E0 is the absence of evidence, not a failing grade').toBeNull();
    expect(cap.fitProvenance).toBe('not-determined');
    expect(cap.notDetermined?.reason).toBe('no-evidence');
    expect(cap.notDetermined?.detail).toContain('proves nothing either way');
  });

  test('no sentence anywhere in a coverage table turns an absence into a verdict', () => {
    const tables = [
      deriveStandardCoverage(MISS, { catalog: REAL_CATALOG }),
      deriveStandardCoverage(HIT, { catalog: ONE_ENTRY }),
      deriveStandardCoverage(NO_SUBJECT, { catalog: REAL_CATALOG }),
      ...ALL_EXAMPLES.map((n) => deriveStandardCoverage(example(n), { catalog: REAL_CATALOG })),
      ...ALL_EXAMPLES.map((n) => deriveStandardCoverage(example(n))),
    ];
    // `DESIGN.md` §5.3: never "the standard covers it" while the level does not
    // carry it — and never its mirror image either.
    const forbidden = [
      /\bnot supported\b/i,
      /\bunsupported\b/i,
      /\bno standard\b/i,
      /\bnot covered\b/i,
      /\bcannot be covered\b/i,
      /\bfully covered\b/i,
      /\bstandard covers\b/i,
      /\bno successor exists\b/i,
      /\bdoes not exist\b/i,
    ];
    const offenders: string[] = [];
    for (const table of tables) {
      for (const sentence of sentencesOf(table)) {
        for (const pattern of forbidden) {
          if (pattern.test(sentence)) offenders.push(`${pattern} ← ${sentence}`);
        }
      }
    }
    expect(offenders, `a coverage table read an absence as a verdict:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('"nobody asked" and "asked, nothing there" are two different sentences', () => {
    const asked = capabilityOf(deriveStandardCoverage(MISS, { catalog: EMPTY_CATALOG }), 'GS_OWN-REASON');
    const unasked = capabilityOf(deriveStandardCoverage(MISS), 'GS_OWN-REASON');

    expect(deriveStandardCoverage(MISS, { catalog: EMPTY_CATALOG }).catalogConsulted).toBe(true);
    expect(deriveStandardCoverage(MISS).catalogConsulted).toBe(false);
    expect(asked.level).toBe('E0');
    expect(unasked.level).toBe('E0');
    expect(
      unasked.notDetermined?.detail,
      'a reading that never opened the catalogue must not report on SAP',
    ).toContain('No catalogue was consulted');
    expect(asked.notDetermined?.detail).not.toBe(unasked.notDetermined?.detail);
  });

  test('a missing hit does not weaken evidence that has nothing to do with the catalogue', () => {
    // The other half of sentence 3: absence cuts in neither direction. A
    // documented capability stays E2 whether or not the catalogue answered.
    const supplied = { 'GS_OWN-REASON': { evidence: [evidence('documentation', 'SAP Help 1234')] } };
    expect(capabilityOf(deriveStandardCoverage(MISS, { catalog: EMPTY_CATALOG, supplied }), 'GS_OWN-REASON').level).toBe('E2');
    expect(capabilityOf(deriveStandardCoverage(MISS, { supplied }), 'GS_OWN-REASON').level).toBe('E2');
  });
});

/* ================================================================== *
 * 4 — the ladder itself
 * ================================================================== */

test.describe('the ladder', () => {
  test('no evidence is E0, and every kind reaches exactly its own ceiling', () => {
    expect(levelFromEvidence([])).toBe('E0');
    for (const kind of STANDARD_EVIDENCE_KINDS) {
      expect(levelFromEvidence([evidence(kind, 'x')]), kind).toBe(EVIDENCE_CEILING[kind]);
    }
    // A maximum, not a sum: the weakest item never drags the strongest down and
    // never adds to it.
    expect(
      levelFromEvidence([evidence('catalog-successor', 'a'), evidence('demonstration', 'b')]),
    ).toBe('E3');
  });

  test('no evidence level is ever green', () => {
    for (const level of EVIDENCE_LEVEL_VALUES) {
      const { status } = fitOfLevel(level);
      expect(status, `${level} reached "done"`).not.toBe('done');
      if (status !== null) {
        expect(objectStatus(status).state, `${level} reached a success state`).not.toBe('success');
      }
    }
    // Including the top of the ladder: E4 is the account's own declaration that
    // the target system accepted it, which is *Confirmed*, not *Proven*.
    expect(fitOfLevel('E4')).toMatchObject({ status: 'confirmed', provenance: 'confirmed' });
  });

  test('a status exists exactly when the level is above a pointer', () => {
    const withStatus = EVIDENCE_LEVEL_VALUES.filter((l) => fitOfLevel(l).status !== null);
    expect(withStatus).toEqual(['E2', 'E3', 'E4']);
    for (const level of ['E0', 'E1'] as EvidenceLevelValue[]) {
      expect(fitOfLevel(level).provenance).toBe('not-determined');
      expect(fitOfLevel(level).reason.length).toBeGreaterThan(0);
    }
  });
});

/* ================================================================== *
 * 5 — what the table is built from
 * ================================================================== */

test.describe('what a capability is built from', () => {
  test('a declaration is not an access: a TABLES block gives nobody a candidate', () => {
    const source = example(PO);
    const referenced = readTableDependencies(source).dependencies.filter(
      (d) => d.access === 'reference' && d.line < 40,
    );
    // There is something to exclude: the program declares nine objects up top.
    expect(new Set(referenced.map((d) => d.table)).size).toBeGreaterThanOrEqual(9);

    const coverage = deriveStandardCoverage(source, { catalog: REAL_CATALOG });
    for (const key of ['C_DOC_TYPE', 'C_RELEASE_GROUP', 'C_PURCH_ORG']) {
      const cap = capabilityOf(coverage, key);
      expect(cap.objects, `${key} was handed the program's declaration block`).toEqual([]);
      expect(cap.candidates, `${key} was handed a candidate it never reads`).toEqual([]);
      expect(cap.level).toBe('E0');
      expect(cap.notDetermined?.detail).toContain('nothing to ask the catalogue about');
    }
  });

  test('a rule whose subject the code does not give is named, not filed away', () => {
    const coverage = deriveStandardCoverage(NO_SUBJECT, { catalog: REAL_CATALOG });
    expect(coverage.capabilities, 'a decision with no readable subject is not a capability').toEqual([]);
    expect(coverage.unassigned).toEqual([
      {
        ruleId: 'BR-001',
        reason: 'subject-not-derivable',
        detail: expect.stringContaining('could not be read out of the code'),
      },
    ]);
  });

  test('no source is not zero capabilities', () => {
    for (const nothing of ['', '   \n\t ']) {
      const coverage = deriveStandardCoverage(nothing, { catalog: REAL_CATALOG });
      expect(coverage.noSource, JSON.stringify(nothing)).toBe(true);
      expect(coverage.capabilities).toEqual([]);
      expect(coverage.counts.capabilities).toBe(0);
    }
    // A program with no decisions in it is the other thing, and says so.
    const empty = deriveStandardCoverage(example('Z_INVOICE_EXTRACTOR.txt'), { catalog: REAL_CATALOG });
    expect(empty.noSource).toBe(false);
    expect(empty.capabilities).toEqual([]);
  });

  test('the same source and catalogue give the same table', () => {
    const once = deriveStandardCoverage(example(PO), { catalog: REAL_CATALOG });
    const twice = deriveStandardCoverage(example(PO), { catalog: REAL_CATALOG });
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});
