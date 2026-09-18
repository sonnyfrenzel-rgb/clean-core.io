import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  CARRIER_KINDS,
  POINTER_NOTE,
  TRAINING_HINT,
  USER_CHANGE_FIELD_COPY,
  deriveUserChange,
  deriveUserChangeFrom,
  type CarrierKind,
  type UserChangeField,
  type UserChangeRecord,
  type UserChangeReport,
} from '../lib/abap/user-change';
import {
  EVIDENCE_CEILING,
  SCOPE_ITEM_NOTE,
  evidenceLevelRank,
  isEvidenceLevelAtMost,
  type EvidenceLevelValue,
} from '../lib/evidence-level';
import { deriveStandardCoverage, type CatalogLookup } from '../lib/abap/standard-coverage';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { resolveApi } from '../lib/abap/catalog-service';
import { inspectModelText } from '../lib/model-text';
import {
  attestationsOf,
  buildAuditPackContents,
  signedGeneratorInput,
  type AuditPackSource,
} from '../lib/audit-pack-build';

/**
 * What changes for users — roadmap 7.6.
 *
 * The roadmap row ends *„als Evidenzstufe wie 7.2, **nie als Behauptung**"*,
 * and that is the whole step. Four fields per step, and each one is a sentence
 * a reader could be handed in a steering meeting:
 *
 *   1. *Transaction ME21N carries this step today.*
 *   2. *The Fiori app X carries it in future.*
 *   3. *The screen looks different.*
 *   4. *Those people need training.*
 *
 * Every one of those four is false, or unearned, in the shape a product
 * naturally writes them. This file is the line between the sentence that is
 * earned and the one that is not, asserted against the real derivation on the
 * eight ABAP programs this product ships plus nine snippets for the cases none
 * of them contains. Nothing is asserted against a hand-written copy of the
 * arithmetic.
 *
 * ## Not vacuous
 *
 * On 2026-09-18 each assurance below was broken on its own in
 * `lib/abap/user-change.ts`, the spec run, and the change taken back. The
 * number is how many tests of this spec went red:
 *
 *   - `carrierToday` given the level E1 instead of `null` — 2;
 *   - `basis: 'code'` marked *Confirmed* instead of *Reconstructed* — 1;
 *   - a *Not determined* field given a statement as well as its reason — 5;
 *   - the catalogue level written as E3 instead of read off `levelFromEvidence` — 8;
 *   - `looksDifferent` allowed above the pointer it rests on (E2) — 4;
 *   - the batch-input carrier treated as one somebody opens — 2;
 *   - `TRAINING_HINT` shortened to "Training needed" — 3;
 *   - the pointer written without its `— to verify` — 1;
 *   - "a missing hit proves nothing" reworded to "not covered by SAP standard" — 3;
 *   - the `nothing-to-ask` and `catalog-silent` sentences merged into one — 1;
 *   - "nothing to ask about" folded into "asked, nothing there" — 1;
 *   - a carrier whose routine the skeleton does not reach dropped instead of reported — 3;
 *   - the collapsed call site counted as a second carrier — 5;
 *   - the capability fallback record removed — 1;
 *   - `deriveUserChange('')` answering `noSource: false` — 1.
 *
 * The table in the report of that day holds the same numbers.
 */

const ROOT = resolve(__dirname, '..');
const EXAMPLES = join(ROOT, 'public/starter-examples');
const example = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/** The file with its comments taken out — an explanation must not satisfy its own check. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const MODULE = 'lib/abap/user-change.ts';

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
/** A catalogue that answers for everything — the "forty pointers" case. */
const ALL_YES: CatalogLookup = { successorFor: (o) => `I_${o}` };
/** A catalogue that answers nothing — the shape of a program on custom tables. */
const EMPTY_CATALOG: CatalogLookup = { successorFor: () => null };

/* --------------------------------------------------------------- snippets */

/** No `REPORT`: the capability fallback, and the shape a pasted fragment has. */
const FRAGMENT = `FORM check_it.
  SELECT SINGLE * FROM eban INTO gs_eban WHERE banfn = '1'.
  IF gs_eban-waers <> 'EUR'.
    WRITE / 'x'.
  ENDIF.
ENDFORM.
`;

/** A transaction somebody opens, in a routine that decides something. */
const OPENED = `REPORT ztest.
PARAMETERS: p_a TYPE c LENGTH 1.
START-OF-SELECTION.
  PERFORM go.
FORM go.
  SELECT SINGLE * FROM eban INTO @DATA(ls) WHERE banfn = '1'.
  IF ls-waers <> 'EUR'.
    CALL TRANSACTION 'ME51N'.
  ENDIF.
ENDFORM.
`;

/** The same, driven by batch input — nobody is in front of it. */
const BATCH = OPENED.replace("CALL TRANSACTION 'ME51N'.", "CALL TRANSACTION 'ME51N' USING lt_bdc MODE 'N'.");

/** The transaction code is computed: the target is not named in this source. */
const DYNAMIC = `REPORT ztest.
DATA lv_tcode TYPE tcode.
PARAMETERS: p_a TYPE c LENGTH 1.
START-OF-SELECTION.
  PERFORM go.
FORM go.
  CALL TRANSACTION lv_tcode.
ENDFORM.
`;

/** A report started unattended. */
const VIA_JOB = `REPORT ztest.
PARAMETERS: p_a TYPE c LENGTH 1.
START-OF-SELECTION.
  SUBMIT zother VIA JOB 'J' NUMBER '1'.
`;

/** `LEAVE TO TRANSACTION` — the second form of a transaction carrier. */
const LEAVE_TO = `REPORT ztest.
PARAMETERS: p_a TYPE c LENGTH 1.
START-OF-SELECTION.
  LEAVE TO TRANSACTION 'SE38'.
`;

/** A report with no selection screen: declared, with nobody in the source. */
const NO_SELECTION_SCREEN = `REPORT ztest.
START-OF-SELECTION.
  SELECT SINGLE * FROM eban INTO @DATA(ls) WHERE banfn = '1'.
  IF ls-waers <> 'EUR'.
    WRITE / 'x'.
  ENDIF.
`;

/** A decision on a value the program carries itself: nothing for the catalogue to answer for. */
const NO_OBJECT = `REPORT ztest.
PARAMETERS: p_a TYPE c LENGTH 1.
DATA: gv_limit TYPE i VALUE 5.
START-OF-SELECTION.
  PERFORM go.
FORM go.
  IF gv_limit > 3.
    WRITE / 'over'.
  ENDIF.
ENDFORM.
`;

/**
 * One decision in a routine that reads forty tables — the "forty pointers" case.
 *
 * Built rather than shipped: none of the eight programs touches enough objects
 * in one routine to tell a maximum from a sum, and that is exactly the
 * arithmetic sentence 1 of roadmap 7.2 is about.
 */
const MANY_POINTERS = `REPORT ztest.
PARAMETERS: p_a TYPE c LENGTH 1.
DATA: gs_row TYPE ztab01.
START-OF-SELECTION.
  PERFORM go.
FORM go.
${Array.from({ length: 40 }, (_, i) => `  SELECT SINGLE * FROM ztab${String(i + 1).padStart(2, '0')} INTO gs_row.`).join('\n')}
  IF gs_row-bukrs <> '1000'.
    WRITE / 'x'.
  ENDIF.
ENDFORM.
`;

const SNIPPETS: Record<string, string> = {
  FRAGMENT,
  OPENED,
  BATCH,
  DYNAMIC,
  VIA_JOB,
  LEAVE_TO,
  NO_SELECTION_SCREEN,
  NO_OBJECT,
  MANY_POINTERS,
};

/* ---------------------------------------------------------------- helpers */

const FIELDS = ['carrierToday', 'carrierFuture', 'looksDifferent', 'training'] as const;
type FieldName = (typeof FIELDS)[number];

const fieldsOf = (record: UserChangeRecord): Array<[FieldName, UserChangeField]> =>
  FIELDS.map((name) => [name, record[name]]);

const recordOf = (report: UserChangeReport, id: string): UserChangeRecord => {
  const found = report.records.find((r) => r.id === id);
  if (!found) throw new Error(`no ${id} in ${report.records.map((r) => r.id).join(', ')}`);
  return found;
};

/** Every reading this spec sweeps: eight programs with and without a catalogue, plus the snippets. */
function everyReading(): Array<{ name: string; report: UserChangeReport }> {
  const out: Array<{ name: string; report: UserChangeReport }> = [];
  for (const name of ALL_EXAMPLES) {
    out.push({ name: `${name} (catalogue)`, report: deriveUserChange(example(name), { catalog: REAL_CATALOG }) });
    out.push({ name: `${name} (no catalogue)`, report: deriveUserChange(example(name)) });
    out.push({ name: `${name} (catalogue answers everything)`, report: deriveUserChange(example(name), { catalog: ALL_YES }) });
  }
  for (const [name, source] of Object.entries(SNIPPETS)) {
    out.push({ name, report: deriveUserChange(source, { catalog: REAL_CATALOG }) });
    out.push({ name: `${name} (empty catalogue)`, report: deriveUserChange(source, { catalog: EMPTY_CATALOG }) });
  }
  return out;
}

/** Every sentence a record puts in front of a reader. */
function sentencesOf(report: UserChangeReport): string[] {
  const out: string[] = [];
  for (const record of report.records) {
    out.push(record.subject.label);
    if (record.subject.notDrawn) out.push(record.subject.notDrawn.detail);
    for (const [, field] of fieldsOf(record)) {
      if (field.statement) out.push(field.statement);
      if (field.notDetermined) out.push(field.notDetermined.detail);
      out.push(field.source);
      for (const item of field.evidence) out.push(item.reference, item.source);
    }
  }
  return out;
}

/* ================================================================== *
 * 1 — every field carries what it rests on, or says why it does not
 * ================================================================== */

test.describe('every field carries its standing and its source, or is Not determined with a reason', () => {
  test('a field is one or the other, never both and never neither', () => {
    const offenders: string[] = [];
    for (const { name, report } of everyReading()) {
      for (const record of report.records) {
        for (const [field, value] of fieldsOf(record)) {
          const where = `${name} ${record.id}.${field}`;
          if (value.statement === null) {
            if (!value.notDetermined) offenders.push(`${where}: no statement and no reason`);
            else if (!value.notDetermined.detail.trim()) offenders.push(`${where}: a reason with no detail`);
            if (value.basis !== 'none') offenders.push(`${where}: Not determined, yet resting on ${value.basis}`);
            if (value.provenance !== 'not-determined') offenders.push(`${where}: Not determined, yet ${value.provenance}`);
            if (value.evidence.length) offenders.push(`${where}: Not determined, yet carrying evidence`);
          } else {
            if (value.notDetermined) offenders.push(`${where}: a statement and a Not-determined reason`);
            if (value.basis === 'none') offenders.push(`${where}: a statement resting on nothing`);
            if (!value.statement.trim()) offenders.push(`${where}: an empty statement`);
          }
          if (!value.source.trim()) offenders.push(`${where}: no source`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('a code fact carries a line and no level; a catalogue fact carries a level', () => {
    const offenders: string[] = [];
    for (const { name, report } of everyReading()) {
      for (const record of report.records) {
        for (const [field, value] of fieldsOf(record)) {
          const where = `${name} ${record.id}.${field}`;
          if (value.basis === 'code') {
            // The E0–E4 ladder grades standard candidates. A statement out of
            // the source is not one, so it carries a line and the
            // `reconstructed` provenance instead — and never a level, because
            // every level on that ladder would be a false claim about it.
            if (value.level !== null) offenders.push(`${where}: a code fact given level ${value.level}`);
            if (value.provenance !== 'reconstructed') offenders.push(`${where}: a code fact marked ${value.provenance}`);
            if (value.anchors.length === 0) offenders.push(`${where}: a code fact with no line`);
          }
          if (value.basis === 'catalog' || value.basis === 'derived') {
            if (value.level === null) offenders.push(`${where}: a catalogue fact with no level`);
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('the line a carrier claims is the line the statement stands on', () => {
    // The point of an anchor is that a reader can check the claim. These are
    // checked: the anchor is opened and the statement that produced the record
    // has to be there.
    const expected: Record<CarrierKind, RegExp> = {
      transaction: /CALL\s+TRANSACTION|LEAVE\s+TO\s+TRANSACTION/i,
      report: /\bSUBMIT\b/i,
      screen: /CALL\s+SCREEN|REUSE_ALV|POPUP|CL_SALV|CL_GUI/i,
      program: /^\s*(?:REPORT|PROGRAM)\b/i,
    };
    const offenders: string[] = [];
    for (const name of ALL_EXAMPLES) {
      const source = example(name);
      const lines = source.split('\n');
      for (const record of deriveUserChange(source, { catalog: REAL_CATALOG }).records) {
        if (!record.carrier || !record.subject.anchor) continue;
        const [start, end] = record.subject.anchor.replace(/^L/, '').split('-').map(Number);
        const text = lines.slice(start - 1, (end || start)).join(' ');
        if (!expected[record.carrier].test(text)) {
          offenders.push(`${name} ${record.id} (${record.carrier}) ${record.subject.anchor}: ${text.trim().slice(0, 80)}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);

    // And the two that resolve to a literal really do name it at the line.
    expect(example(PO).split('\n')[630]).toContain('ME21N');
    expect(recordOf(deriveUserChange(example(PO), { catalog: REAL_CATALOG }), 'UC-02').subject.label).toBe('ME21N');
  });

  test('a carrier the skeleton draws no element for is reported, not dropped', () => {
    const legacy = deriveUserChange(example(LEGACY), { catalog: REAL_CATALOG });
    // Three of this program's carriers stand in routines nothing calls. They
    // are in the source, so they are in the table, with the reason attached.
    const notDrawn = legacy.records.filter((r) => r.subject.notDrawn);
    expect(notDrawn.map((r) => `${r.subject.label}:${r.subject.notDrawn?.reason}`)).toEqual([
      'RV_ORDER_FLOW_INFORMATION:unreached',
      '9000:unreached',
    ]);
    for (const record of notDrawn) {
      expect(record.subject.stepId, `${record.id} has both a step and a reason for having none`).toBeNull();
      expect(record.subject.notDrawn?.detail).toContain('not reached from any entry point');
      // And the statement itself is still the one from the source.
      expect(record.carrierToday.notDetermined, `${record.id} lost its carrier with its element`).toBeNull();
    }
    // The ones that are drawn carry the element id of roadmap 2.3.
    expect(recordOf(legacy, 'UC-02').subject.stepId).toBe('nd-383-0');
    expect(recordOf(legacy, 'UC-03').subject.stepId).toBe('nd-483-0');
  });

  test('a collapsed call site is the same carrier, not a second one', () => {
    // The skeleton draws `PERFORM create_po_batch_input` as a transaction node
    // too, standing in for the routine's single effect. Counting it would give
    // one `CALL TRANSACTION` two rows in a table about what users do.
    const po = deriveUserChange(example(PO), { catalog: REAL_CATALOG });
    expect(po.records.filter((r) => r.carrier === 'transaction').map((r) => r.subject.anchor)).toEqual([
      'L631-634',
    ]);
    expect(po.counts.byCarrier.transaction).toBe(1);
  });

  test('a decision that no carrier and no report covers becomes its own record', () => {
    // "oder Fähigkeit, wenn kein Schritt zuzuordnen ist" — the pasted fragment
    // declares no report, so nothing in it says what anybody opens.
    const report = deriveUserChange(FRAGMENT, { catalog: REAL_CATALOG });
    expect(report.records.map((r) => r.subject.kind)).toEqual(['capability']);
    const record = report.records[0];
    expect(record.carrier).toBeNull();
    expect(record.carrierMode).toBeNull();
    expect(record.capabilities.map((c) => c.key)).toEqual(['GS_EBAN-WAERS']);
    expect(record.carrierToday.notDetermined?.reason).toBe('no-carrier-in-routine');
    // It is still worth a row: the catalogue points somewhere for the data.
    expect(record.carrierFuture.level).toBe('E1');
    expect(record.looksDifferent.notDetermined?.reason).toBe('carrier-today-not-determined');
  });

  test('no source is not zero records', () => {
    for (const nothing of ['', '   \n\t ']) {
      for (const report of [deriveUserChange(nothing, { catalog: REAL_CATALOG }), deriveUserChangeFrom(nothing, deriveBusinessRules('REPORT z.'), {})]) {
        expect(report.noSource, JSON.stringify(nothing)).toBe(true);
        expect(report.records).toEqual([]);
        expect(report.counts.records).toBe(0);
      }
    }
    // A program with nothing to say about its data is the other thing.
    const thin = deriveUserChange(example('Z_INVOICE_EXTRACTOR.txt'), { catalog: REAL_CATALOG });
    expect(thin.noSource).toBe(false);
    expect(thin.records.length).toBeGreaterThan(0);
  });
});

/* ================================================================== *
 * 2 — a catalogue successor is worth at most E1, here as in 7.2
 * ================================================================== */

test.describe('a catalogue successor is worth at most E1', () => {
  test('the ceiling is 7.2’s, not a second one', () => {
    expect(EVIDENCE_CEILING['catalog-successor']).toBe('E1');
    const offenders: string[] = [];
    for (const { name, report } of everyReading()) {
      for (const record of report.records) {
        for (const [field, value] of fieldsOf(record)) {
          for (const item of value.evidence) {
            if (item.kind !== 'catalog-successor') {
              offenders.push(`${name} ${record.id}.${field}: evidence of kind ${item.kind}`);
            }
          }
          if (value.level && !isEvidenceLevelAtMost(value.level, 'E1')) {
            offenders.push(`${name} ${record.id}.${field}: reached ${value.level}`);
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('quantity does not raise it — forty pointers are forty pointers', () => {
    const many = deriveUserChange(MANY_POINTERS, { catalog: ALL_YES });
    const program = recordOf(many, 'UC-01');
    // A maximum, not a sum. Counting would let a screenful of catalogue rows
    // come to read as a proof, which is the defect 7.2 names.
    expect(program.carrierFuture.evidence.length).toBe(40);
    expect(program.carrierFuture.level).toBe('E1');
    // And the sentence shows three of them and says how many are left, rather
    // than printing forty addresses at a reader.
    expect(program.carrierFuture.statement).toContain('ZTAB01 → I_ZTAB01 (L7)');
    expect(program.carrierFuture.statement).toContain('and 37 more');
    expect(many.counts.byLevel).toEqual({ E0: 0, E1: 1, E2: 0, E3: 0, E4: 0 });

    // The shipped catalogue on the shipped programs, for the same reason.
    for (const name of ALL_EXAMPLES) {
      const report = deriveUserChange(example(name), { catalog: ALL_YES });
      expect(report.counts.byLevel.E2 + report.counts.byLevel.E3 + report.counts.byLevel.E4, name).toBe(0);
    }
  });

  test('no field ever outruns the 7.2 level of the capability it came from', () => {
    const offenders: string[] = [];
    for (const { name, report } of everyReading()) {
      for (const record of report.records) {
        if (record.capabilities.length === 0) continue;
        const highest = record.capabilities.reduce<EvidenceLevelValue>(
          (max, c) => (evidenceLevelRank(c.level) > evidenceLevelRank(max) ? c.level : max),
          'E0',
        );
        for (const [field, value] of fieldsOf(record)) {
          if (value.level && evidenceLevelRank(value.level) > evidenceLevelRank(highest)) {
            offenders.push(`${name} ${record.id}.${field}: ${value.level} above the capability's ${highest}`);
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('the difference never outruns the pointer, and the hint never outruns the difference', () => {
    const offenders: string[] = [];
    for (const { name, report } of everyReading()) {
      for (const record of report.records) {
        const { carrierFuture, looksDifferent, training } = record;
        const where = `${name} ${record.id}`;
        if (
          looksDifferent.level &&
          carrierFuture.level &&
          evidenceLevelRank(looksDifferent.level) > evidenceLevelRank(carrierFuture.level)
        ) {
          offenders.push(`${where}: the difference (${looksDifferent.level}) above the pointer (${carrierFuture.level})`);
        }
        if (training.level !== looksDifferent.level) {
          offenders.push(`${where}: the hint (${training.level}) is not the difference (${looksDifferent.level})`);
        }
        if (!training.notDetermined && looksDifferent.notDetermined) {
          offenders.push(`${where}: a training hint on a difference nobody established`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('a pointer is written as an address, in the one spelling this product has', () => {
    expect(POINTER_NOTE).toBe(SCOPE_ITEM_NOTE);
    expect(POINTER_NOTE).toBe('to verify');
    const offenders: string[] = [];
    for (const { name, report } of everyReading()) {
      for (const record of report.records) {
        for (const [field, value] of fieldsOf(record)) {
          if (value.basis !== 'catalog' || !value.statement) continue;
          if (!value.statement.includes(`— ${POINTER_NOTE}`)) {
            offenders.push(`${name} ${record.id}.${field}: a pointer without its note`);
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('four different absences get four different sentences', () => {
    const asked = deriveUserChange(NO_SELECTION_SCREEN, { catalog: EMPTY_CATALOG });
    const unasked = deriveUserChange(NO_SELECTION_SCREEN);
    const nothing = deriveUserChange(VIA_JOB, { catalog: REAL_CATALOG });
    const noObject = deriveUserChange(NO_OBJECT, { catalog: REAL_CATALOG });

    expect(asked.catalogConsulted).toBe(true);
    expect(unasked.catalogConsulted).toBe(false);

    const a = recordOf(asked, 'UC-01').carrierFuture;
    const u = recordOf(unasked, 'UC-01').carrierFuture;
    const n = recordOf(nothing, 'UC-02').carrierFuture;
    const o = recordOf(noObject, 'UC-01').carrierFuture;

    // Asked, and the catalogue had nothing — the one sentence that must never
    // read as a verdict about SAP.
    expect(a.notDetermined?.reason).toBe('catalog-silent');
    expect(a.notDetermined?.detail).toContain('proves nothing either way');
    // Nobody asked.
    expect(u.notDetermined?.reason).toBe('no-catalog');
    expect(u.notDetermined?.detail).toContain('No catalogue was consulted');
    // No decision of this program stands in that routine.
    expect(n.notDetermined?.reason).toBe('nothing-to-ask');
    expect(n.notDetermined?.detail).toContain('never for transaction codes');
    // The decisions are there and touch no SAP object at all.
    expect(o.notDetermined?.reason).toBe('no-object-to-ask-about');
    expect(o.notDetermined?.detail).toContain('read and write no SAP object');
    expect(recordOf(noObject, 'UC-01').capabilities.map((c) => c.key)).toEqual(['GV_LIMIT']);

    const details = [a, u, n, o].map((f) => f.notDetermined?.detail);
    expect(new Set(details).size, 'two different absences given the same sentence').toBe(4);
    for (const field of [a, u, n, o]) expect(field.level).toBe('E0');
  });
});

/* ================================================================== *
 * 3 — nothing here is a claim
 * ================================================================== */

/**
 * The sentences a step called "what changes for users" writes by itself if
 * nobody stops it. Each one is a claim this product cannot earn from a
 * catalogue row and a line of ABAP.
 */
const FORBIDDEN: RegExp[] = [
  /\bwill\b/i,
  /\bmust\b/i,
  /\bshould\b/i,
  /\breplaces?\b/i,
  /\breplaced\b/i,
  /\breplacement\b/i,
  /\bno longer\b/i,
  /\bobsolete\b/i,
  /\bdeprecated\b/i,
  /\bnot supported\b/i,
  /\bunsupported\b/i,
  /\bnot covered\b/i,
  /\bfully covered\b/i,
  /\bstandard covers\b/i,
  /\bdoes not exist\b/i,
  /\bno successor exists\b/i,
  /\btraining (?:is |will be )?(?:needed|required)\b/i,
  /\bneeds? training\b/i,
  /\brequires? training\b/i,
  /\busers? will\b/i,
  /\bgoing forward\b/i,
  /\bin the future\b/i,
  /\bguarantee/i,
  /\bproven\b/i,
  /\bautomatically\b/i,
];

test.describe('no sentence this step produces is a claim', () => {
  test('not in anything the eight programs and the snippets produce', () => {
    const offenders: string[] = [];
    for (const { name, report } of everyReading()) {
      for (const sentence of sentencesOf(report)) {
        for (const pattern of FORBIDDEN) {
          if (pattern.test(sentence)) offenders.push(`${name}: ${pattern} ← ${sentence}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('not in the module, with its comments taken away', () => {
    const src = code(MODULE);
    const offenders = FORBIDDEN.filter((pattern) => pattern.test(src)).map(String);
    expect(offenders, `${MODULE} names: ${offenders.join(', ')}`).toEqual([]);
  });

  test('and the sweep catches the sentence it exists for', () => {
    // Not vacuous: the four sentences this step would write on its own.
    for (const claim of [
      'Transaction ME21N will be replaced by a Fiori app.',
      'Users must be trained on the new app.',
      'This step is not supported in SAP standard.',
      'Training is needed for the people who use this screen.',
    ]) {
      expect(FORBIDDEN.some((p) => p.test(claim)), claim).toBe(true);
    }
  });

  test('the training hint hedges in its own words, and hands the decision away', () => {
    expect(TRAINING_HINT).toBe('Training likely needed — to verify');
    const hinted = recordOf(deriveUserChange(example(PO), { catalog: REAL_CATALOG }), 'UC-01').training;
    expect(hinted.statement).toContain(TRAINING_HINT);
    expect(hinted.statement).toContain('is for the people who run this process to say');
    // A hint, not a grade: it never reaches an object status of its own.
    expect(hinted.provenance).toBe('not-determined');
    expect(hinted.level).toBe('E1');
  });

  test('every sentence would pass the model-text surface unchanged', () => {
    // `DESIGN.md` §3.1: nothing this product prints carries raw Markdown, an AI
    // tell or AI symbolism — whoever wrote it. Here nothing did, and the check
    // costs one call.
    const offenders: string[] = [];
    for (const { name, report } of everyReading()) {
      for (const sentence of sentencesOf(report)) {
        for (const finding of inspectModelText(sentence, 'screen')) {
          offenders.push(`${name}: ${finding.kind} ${finding.term} ← ${sentence.slice(0, 90)}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  test('the four headings are questions, and there are exactly four', () => {
    expect(Object.keys(USER_CHANGE_FIELD_COPY).sort()).toEqual(
      ['carrierFuture', 'carrierToday', 'looksDifferent', 'training'].sort(),
    );
    for (const [field, copy] of Object.entries(USER_CHANGE_FIELD_COPY)) {
      expect(copy.label.length, field).toBeGreaterThan(0);
      expect(copy.question.endsWith('?'), `${field}: the heading's question is not one`).toBe(true);
      for (const pattern of FORBIDDEN) expect(pattern.test(`${copy.label} ${copy.question}`), `${field}`).toBe(false);
    }
    // The second field is not called "carrier in future": the catalogue points,
    // it does not promise.
    expect(USER_CHANGE_FIELD_COPY.carrierFuture.label).toBe('Where the catalogue points');
  });
});

/* ================================================================== *
 * 4 — nobody is put in front of a carrier the code drives
 * ================================================================== */

test.describe('a person is never invented at a carrier the program drives itself', () => {
  test('both shipped programs drive their transaction by batch input, and the table says so', () => {
    for (const [name, id, tcode] of [
      [PO, 'UC-02', 'ME21N'],
      [LEGACY, 'UC-02', 'VA02'],
    ] as const) {
      const record = recordOf(deriveUserChange(example(name), { catalog: REAL_CATALOG }), id);
      expect(record.carrierMode, name).toBe('batch-input');
      expect(record.carrierToday.statement).toContain(`transaction ${tcode}`);
      expect(record.carrierToday.statement).toContain('the program fills the screens');
      // The two fields about what a person sees do not arise from this line.
      expect(record.looksDifferent.notDetermined?.reason, name).toBe('carrier-not-operated-by-a-person');
      expect(record.training.notDetermined?.reason, name).toBe('difference-not-determined');
      expect(record.training.statement, name).toBeNull();
    }
  });

  test('the same statement without batch input is one somebody opens', () => {
    const opened = recordOf(deriveUserChange(OPENED, { catalog: REAL_CATALOG }), 'UC-02');
    const batch = recordOf(deriveUserChange(BATCH, { catalog: REAL_CATALOG }), 'UC-02');
    expect(opened.carrierMode).toBe('opened');
    expect(batch.carrierMode).toBe('batch-input');
    // One `USING` is the whole difference, and it decides two fields.
    expect(opened.training.statement).toContain(TRAINING_HINT);
    expect(batch.training.statement).toBeNull();
    expect(opened.carrierFuture.level).toBe('E1');
    expect(batch.carrierFuture.level).toBe('E1');
  });

  test('a job and a report with no selection screen are the other two', () => {
    const job = recordOf(deriveUserChange(VIA_JOB, { catalog: REAL_CATALOG }), 'UC-02');
    expect(job.carrierMode).toBe('background-job');
    expect(job.looksDifferent.notDetermined?.reason).toBe('carrier-not-operated-by-a-person');

    const declared = recordOf(deriveUserChange(NO_SELECTION_SCREEN, { catalog: REAL_CATALOG }), 'UC-01');
    expect(declared.carrierMode).toBe('declared');
    expect(declared.carrierToday.statement).toContain('Nothing in this source says that a person starts it');
    expect(declared.training.statement).toBeNull();

    // And a report that does declare one is `opened` — the difference is a
    // statement of the source, not a default.
    expect(recordOf(deriveUserChange(OPENED, { catalog: REAL_CATALOG }), 'UC-01').carrierMode).toBe('opened');
  });

  test('a computed transaction code is a Not determined, never a guess', () => {
    const record = recordOf(deriveUserChange(DYNAMIC, { catalog: REAL_CATALOG }), 'UC-02');
    expect(record.carrier).toBe('transaction');
    expect(record.carrierToday.statement).toBeNull();
    expect(record.carrierToday.notDetermined?.reason).toBe('target-not-named');
    expect(record.carrierToday.notDetermined?.detail).toContain('computed at run time');
    // The expression is still shown, so a reader knows what to look at.
    expect(record.carrierToday.notDetermined?.detail).toContain('lv_tcode');
    expect(record.carrierToday.anchors).toEqual(['L7']);
  });

  test('a transaction the program leaves for is a carrier too', () => {
    const record = recordOf(deriveUserChange(LEAVE_TO, { catalog: REAL_CATALOG }), 'UC-02');
    expect(record.carrier).toBe('transaction');
    expect(record.carrierMode).toBe('opened');
    expect(record.subject.label).toBe('SE38');
  });

  test('every carrier kind is reachable, and nothing outside the list appears', () => {
    const seen = new Set<CarrierKind>();
    for (const { report } of everyReading()) {
      for (const record of report.records) if (record.carrier) seen.add(record.carrier);
    }
    expect([...seen].sort()).toEqual([...CARRIER_KINDS].sort());
  });
});

/* ================================================================== *
 * 5 — what the two example programs actually say
 * ================================================================== */

test.describe('the measured reading of the two programs that have carriers', () => {
  test('the purchase-requisition example: two records, one pointer, one hint', () => {
    const po = deriveUserChange(example(PO), { catalog: REAL_CATALOG });
    expect(po.program).toBe('Z_MM_PO_APPROVAL');
    expect(po.counts).toEqual({
      records: 2,
      byCarrier: { transaction: 1, report: 0, screen: 0, program: 1 },
      carrierTodayDetermined: 2,
      carrierFutureDetermined: 1,
      looksDifferentDetermined: 1,
      trainingHints: 1,
      byLevel: { E0: 1, E1: 1, E2: 0, E3: 0, E4: 0 },
    });

    const program = recordOf(po, 'UC-01');
    expect(program.subject.anchor).toBe('L11');
    // All eleven capabilities of 7.2 stand in this program and in no routine
    // that names a carrier of its own, so they are read here.
    expect(program.capabilities.length).toBe(11);
    expect(program.capabilities.map((c) => c.id)).toEqual(
      deriveStandardCoverage(example(PO), { catalog: REAL_CATALOG }).capabilities.map((c) => c.id),
    );
    expect(program.carrierFuture.evidence.map((e) => `${e.reference}@${e.anchor}`)).toEqual([
      'EBAN → API_PURCHASEREQUISITION_SRV@L61',
      'MARC → I_ProductPlant@L311',
    ]);
    expect(program.carrierFuture.level).toBe('E1');

    const tx = recordOf(po, 'UC-02');
    expect(tx.subject.anchor).toBe('L631-634');
    expect(tx.subject.routine).toBe('CREATE_PO_BATCH_INPUT');
    expect(tx.capabilities).toEqual([]);
    expect(tx.carrierFuture.notDetermined?.reason).toBe('nothing-to-ask');
  });

  test('the 1,000-line example: five records, three of them drawn as steps', () => {
    const legacy = deriveUserChange(example(LEGACY), { catalog: REAL_CATALOG });
    expect(legacy.program).toBe('ZLEGACY_ORDER_FULFILLMENT_AUDIT');
    expect(legacy.counts).toEqual({
      records: 5,
      byCarrier: { transaction: 1, report: 1, screen: 2, program: 1 },
      carrierTodayDetermined: 5,
      carrierFutureDetermined: 1,
      looksDifferentDetermined: 1,
      trainingHints: 1,
      byLevel: { E0: 4, E1: 1, E2: 0, E3: 0, E4: 0 },
    });
    expect(legacy.records.map((r) => `${r.id} ${r.carrier} ${r.subject.label} ${r.subject.anchor}`)).toEqual([
      'UC-01 program ZLEGACY_ORDER_FULFILLMENT_AUDIT L1',
      'UC-02 transaction VA02 L467-470',
      'UC-03 screen REUSE_ALV_GRID_DISPLAY L616-625',
      'UC-04 report RV_ORDER_FLOW_INFORMATION L664-666',
      'UC-05 screen 9000 L670',
    ]);
    // The transaction code stands in a constant, and 2.2 resolved it rather
    // than printing the constant's name at a reader.
    expect(recordOf(legacy, 'UC-02').carrierToday.statement).toContain('transaction VA02');
    expect(recordOf(legacy, 'UC-01').capabilities.length).toBe(15);
  });

  test('across all eight programs: every record is a carrier or a decision, and nothing reaches E2', () => {
    let records = 0;
    let hints = 0;
    for (const name of ALL_EXAMPLES) {
      const report = deriveUserChange(example(name), { catalog: REAL_CATALOG });
      records += report.counts.records;
      hints += report.counts.trainingHints;
      expect(report.counts.byLevel.E2 + report.counts.byLevel.E3 + report.counts.byLevel.E4, name).toBe(0);
    }
    // Measured on 2026-09-18: fourteen records over the eight shipped
    // programs — eight reports, two transactions, three screens and one
    // submitted report — and two of them carry the training hint. Both hints
    // sit on a report with a selection screen and a catalogue pointer behind
    // its data; the two transactions are batch input and carry none.
    expect(records).toBe(14);
    expect(hints).toBe(2);
  });
});

/* ================================================================== *
 * 6 — computed, not generated
 * ================================================================== */

/** Every way this repository reaches a model, by name. */
const MODEL_PATHS = [
  '/api/gemini',
  'generateContent',
  'GoogleGenerativeAI',
  'GenerativeModel',
  'openrouter',
  'OPENROUTER',
  'callGemini',
  'geminiProxy',
];

test.describe('the records are computed, not generated', () => {
  test('the module names no model path and no fetch', () => {
    const src = code(MODULE);
    for (const needle of MODEL_PATHS) {
      expect(src, `${MODULE} reaches a model through ${needle}`).not.toContain(needle);
    }
    expect(src, `${MODULE} calls fetch`).not.toMatch(/\bfetch\s*\(/);
    expect(src, `${MODULE} reads a clock`).not.toMatch(/Date\.now\(\)|new Date\(/);
  });

  test('and it still answers with the network taken away', () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('a user-change record tried to reach the network');
    }) as unknown as typeof fetch;
    try {
      const report = deriveUserChange(example(PO), { catalog: REAL_CATALOG });
      expect(report.records.map((r) => r.subject.label)).toEqual(['Z_MM_PO_APPROVAL', 'ME21N']);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('the same source and catalogue give the same records', () => {
    const once = deriveUserChange(example(LEGACY), { catalog: REAL_CATALOG });
    const twice = deriveUserChange(example(LEGACY), { catalog: REAL_CATALOG });
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    // And the entry point for a caller that already holds the rules agrees.
    const shared = deriveUserChangeFrom(example(LEGACY), deriveBusinessRules(example(LEGACY)), {
      catalog: REAL_CATALOG,
    });
    expect(JSON.stringify(shared)).toBe(JSON.stringify(once));
  });

  test('the ids are the reading order, with no gaps', () => {
    for (const { name, report } of everyReading()) {
      expect(
        report.records.map((r) => r.id),
        name,
      ).toEqual(report.records.map((_, i) => `UC-${String(i + 1).padStart(2, '0')}`));
    }
  });
});

/* ================================================================== *
 * 7 — this is a reading, not a record: nothing of it is stored
 * ================================================================== */

const MARKER = 'USER-CHANGE-MARKER-7c1b04ad';

const poisonedRun: AuditPackSource['run'] = {
  runId: 'run-1',
  projectId: 'proj-1',
  userId: 'u-1',
  createdAt: '2026-09-18T08:00:00.000Z',
  status: 'completed',
  inputFingerprint: { sha256: 'a'.repeat(64), fileName: 'zcl_x.abap', lineCount: 10, byteSize: 200, objectType: 'Class' },
  analyzerVersion: '2.10.8',
  rulesetVersion: 'rules-v1.0',
  sapApiCatalogVersion: '2026.09',
  model: { provider: 'google-gemini', modelId: 'gemini-3-flash-preview', engineVersion: '2.10.8', byokUsed: false },
  extensibilityRoute: 'rap',
  cleanCoreScore: 71,
  complexityScore: 40,
  criticalityScore: 55,
  evidenceReport: [],
  dataCoupling: [],
  codeInventory: [],
  worklist: [],
  originalRecommendation: 'rap',
  recommendationConfidence: 82,
  recommendationJustification: 'Released CDS views cover every read.',
  runHash: 'b'.repeat(64),
  signature: 'c'.repeat(64),
  // Not a field of a run this product ever writes — planted as if a bug had let
  // a 7.6 reading reach the document the pack is built from.
  userChange: MARKER,
  carrierToday: MARKER,
  training: MARKER,
};

const auditMetadata = {
  inputFingerprint: { ...(poisonedRun.inputFingerprint as Record<string, unknown>), uploadedAt: '2026-09-18T08:00:00.000Z' },
  modelCard: {
    provider: 'google-gemini',
    model: 'gemini-3-flash-preview',
    engineVersion: '2.10.8',
    catalogVersion: '2026.09',
    byokUsed: false,
    analysisTimestamp: '2026-09-18T08:00:00.000Z',
  },
} as AuditPackSource['auditMetadata'];

test.describe('what changes for users is shown, never stored', () => {
  test('the signed generators are handed no field of this step', () => {
    const input = signedGeneratorInput({ projectId: 'proj-1', runId: 'run-1', run: poisonedRun, auditMetadata, attested: {} });
    const forbidden = ['userChange', 'carrierToday', 'carrierFuture', 'looksDifferent', 'training'];
    expect(Object.keys(input).filter((k) => forbidden.includes(k))).toEqual([]);
  });

  test('no signed and no attested file of a pack carries a planted reading', () => {
    const attested = attestationsOf({ name: 'Order intake', status: 'analyzed', userChange: MARKER, training: MARKER });
    expect(Object.keys(attested).filter((k) => k === 'userChange' || k === 'training')).toEqual([]);

    const { signed, attested: files } = buildAuditPackContents({
      projectId: 'proj-1',
      runId: 'run-1',
      run: poisonedRun,
      auditMetadata,
      attested,
    });
    expect(Object.values(signed).join('\n')).not.toContain(MARKER);
    expect(Object.values(files).join('\n')).not.toContain(MARKER);
  });

  test('a real client-writable field DOES reach the attested file — the check above is not vacuous', () => {
    const { attested: files } = buildAuditPackContents({
      projectId: 'proj-1',
      runId: 'run-1',
      run: poisonedRun,
      auditMetadata,
      attested: attestationsOf({ name: 'Order intake, forged', status: 'analyzed' }),
    });
    expect(Object.values(files).join('\n')).toContain('Order intake, forged');
  });

  test('and nothing that writes a run, a project or a pack knows this module', () => {
    for (const rel of [
      'app/api/runs/create/route.ts',
      'lib/audit-pack-build.ts',
      'lib/audit-pack.ts',
      'lib/project-loader.ts',
      'firestore.rules',
    ]) {
      const src = read(rel);
      for (const needle of ['user-change', 'deriveUserChange', 'userChange']) {
        expect(src, `${rel} names ${needle}`).not.toContain(needle);
      }
    }
  });
});
