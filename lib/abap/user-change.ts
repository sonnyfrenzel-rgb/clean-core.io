import { readStatements, type AbapStatement } from './statement-reader';
import { readBlocks, containerAt, type Container } from './block-structure';
import { readCallGraphFrom, type CallGraphReport } from './call-graph';
import { buildProcessSkeleton, type ProcessSkeleton, type SkeletonNode } from './process-skeleton';
import { deriveBusinessRules, type BusinessRuleSet } from './business-rule-set';
import {
  capabilityKeyOf,
  deriveStandardCoverageFrom,
  type CatalogLookup,
  type CoverageOptions,
  type StandardCandidate,
  type StandardCapability,
  type StandardCoverage,
} from './standard-coverage';
import {
  fitOfLevel,
  levelFromEvidence,
  SCOPE_ITEM_NOTE,
  type EvidenceLevelValue,
  type StandardEvidence,
} from '../evidence-level';
import type { ObjectStatusValue } from '../object-status';
import type { ProvenanceValue } from '../provenance';

/**
 * What changes for the people who use the step — roadmap 7.6, mockup screen `s3`.
 *
 * The roadmap row, verbatim: *welche Transaktion oder App den Schritt heute
 * trägt und künftig, was anders aussieht, wo Schulung nötig ist — als
 * Evidenzstufe wie 7.2, nie als Behauptung.* Four fields, and the last five
 * words are the whole step: each field either carries what it rests on, or it
 * is *Not determined* with a reason. There is no sentence in this file that a
 * reader cannot check against a line of their own code or a row of SAP's
 * catalogue.
 *
 * ## The subject is the step, never the object
 *
 * A table is not something anybody opens. So the records below are keyed on the
 * places in the source where a **carrier** is named — the thing a person has in
 * front of them:
 *
 *   - a **transaction**, from `CALL TRANSACTION` and `LEAVE TO TRANSACTION`
 *     (`lib/abap/call-graph.ts`, roadmap 2.2);
 *   - a **report**, from `SUBMIT`;
 *   - a **screen**, from `CALL SCREEN`, and from the user tasks the process
 *     skeleton reads out of the code (`DESIGN.md` §5.8) — an ALV grid, a popup;
 *   - the **program itself**, from its `REPORT`/`PROGRAM` declaration. A custom
 *     report *is* what somebody starts, and leaving it out would drop the one
 *     carrier every one of these programs has.
 *
 * Each record is tied to the process element the skeleton drew for that line
 * (roadmap 2.3), so the step has an id and a line range. Where the skeleton
 * draws none — an unreached routine, a folded helper — the record says so with
 * the reason rather than disappearing: three of the carriers in the shipped
 * 1,000-line example stand in routines nothing calls, and a panel that showed
 * only the drawn ones would have reported a third of the program's carriers as
 * non-existent.
 *
 * A capability of roadmap 7.2 that no carrier step and no program declaration
 * covers becomes a record of its own — *"oder Fähigkeit, wenn kein Schritt
 * zuzuordnen ist"*. Its carrier is *Not determined*, which is the honest answer
 * and a useful one: it names the decisions this source gives no carrier for.
 *
 * ## Where the levels come from — 7.2's ladder, not a second one
 *
 * Nothing here grades anything. `carrierFuture` is built from the catalogue
 * candidates of the capabilities in scope — `StandardCapability.candidates`,
 * exactly as `lib/abap/standard-coverage.ts` derived them — turned into
 * `StandardEvidence` of kind `catalog-successor` and handed to
 * `levelFromEvidence`. The ceiling in `lib/evidence-level.ts` does the rest, so
 * a catalogue pointer is E1 however many of them there are, and the level of a
 * field can never exceed the level 7.2 gave the capability it came from.
 *
 * **`carrierToday` carries no level, and that is deliberate.** The E0–E4 ladder
 * measures *how strongly a standard candidate is backed*. "The code calls
 * transaction ME21N at L631" is not a standard candidate at all: it is a code
 * fact with a line under it, and putting it on the ladder would mean choosing
 * between E0 ("no evidence", false) and E1 ("a catalogue names a successor",
 * also false). So the field carries what a code fact carries in this product —
 * the `reconstructed` provenance of `lib/provenance.ts`, the source, and the
 * line — and its `level` is `null`. `basis` says which of the two a field
 * stands on, and the guard holds the pairing.
 *
 * ## The three things it refuses to say
 *
 * 1. **Never a successor as a promise.** The catalogue names released objects
 *    for *data*; it names no apps and no transactions. Measured against the
 *    2026-09-15 sync (25,467 entries): ME21N, ME51N, VA01, VA02 and MIGO are
 *    not in it, and the 414 successors it names are CDS views, classes and
 *    interfaces. So the future carrier is written as a pointer with the same
 *    two words a scope item carries — `— to verify` — and the sentence says out
 *    loud that a released successor is where data is published rather than
 *    something somebody opens.
 * 2. **Never a person where the code shows none.** `CALL TRANSACTION … USING
 *    <bdcdata>` is batch input: the program fills the transaction's screens and
 *    nobody is sitting in front of it. Both shipped programs drive their
 *    transaction that way. Reading that as "users work in ME21N today" would be
 *    the single most plausible wrong sentence this step could produce, so
 *    `carrierMode` separates `opened` from `batch-input` and
 *    `background-job`, and the difference and the training hint are *Not
 *    determined* for the two that have nobody at them.
 * 3. **Never "training is needed".** The hint reads *Training likely needed —
 *    to verify*, it rests on the same E1 pointer as the difference it follows
 *    from, and its detail hands the judgement to the people who run the
 *    process — the boundary `lib/compliance-review-hints.ts` draws for roadmap
 *    7.7, one step further along.
 *
 * ## What it is not
 *
 * Not a plain-language name for anything: the labels stay the tokens the source
 * writes (`ME21N`, `RV_ORDER_FLOW_INFORMATION`, `GS_EBAN-WAERS`). A readable
 * name is roadmap 7.8's job and arrives with the *Model proposal* provenance on
 * it. Not a store either: nothing here is written to an artefact, a run or an
 * audit pack — this is a reading of the source, recomputed from it, the same
 * rule the view attribute of roadmap 6.1 keeps.
 *
 * Nothing in here calls a model, opens a socket or reads a clock. The same
 * source and the same catalogue give the same records in the same order. It is
 * **not** client-safe: it pulls the ABAP engine in, the way
 * `standard-coverage.ts` does, and a screen that needs it takes it from a
 * server.
 */

/* ------------------------------------------------------------------ input */

/**
 * The same options roadmap 7.2 takes, passed straight through.
 *
 * Deliberately the same type and not a wider one: the catalogue and the
 * supplied evidence reach this step only by way of `deriveStandardCoverage`, so
 * there is one place a catalogue is asked a question and one place supplied
 * evidence is filed.
 */
export type UserChangeOptions = CoverageOptions;

/* ----------------------------------------------------------------- output */

/** What carries a step. A closed list: four things this source can name. */
export type CarrierKind =
  /** A transaction code — `CALL TRANSACTION`, `LEAVE TO TRANSACTION`. */
  | 'transaction'
  /** Another report — `SUBMIT`. */
  | 'report'
  /** A screen of this program — `CALL SCREEN`, an ALV grid, a popup. */
  | 'screen'
  /** This program itself, from its `REPORT`/`PROGRAM` declaration. */
  | 'program';

export const CARRIER_KINDS: readonly CarrierKind[] = Object.freeze([
  'transaction',
  'report',
  'screen',
  'program',
]);

/**
 * Who, if anybody, is at the carrier — read off the statement, never assumed.
 *
 * The distinction refusal 2 of the header is about. `declared` is its own value
 * because a `REPORT` with no selection screen says a program exists, not that a
 * person starts it.
 */
export type CarrierMode =
  /** A person is in front of it: a transaction called without batch input, a screen, a selection screen. */
  | 'opened'
  /** `CALL TRANSACTION … USING <bdcdata>` — the program fills the screens. */
  | 'batch-input'
  /** `SUBMIT … VIA JOB` — it runs unattended. */
  | 'background-job'
  /** Declared as a report, with nothing in the source about anybody starting it. */
  | 'declared';

/** Why the process skeleton draws no element for a carrier that is in the source. */
export type StepNotDrawnReason =
  /** The routine is not reached from any entry point (`ProcessSkeleton.notDrawn.unreached`). */
  | 'unreached'
  /** The routine has no effect of its own and is folded into its callers. */
  | 'technical-helper'
  /** The carrier is not a place the skeleton draws — the program declaration is one. */
  | 'not-a-process-element';

/** Why a field says nothing. Closed, and every value is a different sentence. */
export type UserChangeNotDeterminedReason =
  /** The transaction code or report name is computed at run time. */
  | 'target-not-named'
  /** The source declares no `REPORT`/`PROGRAM`. */
  | 'no-program-declaration'
  /** Nothing in the capability's routines names a transaction, a report or a screen. */
  | 'no-carrier-in-routine'
  /** No catalogue was consulted, so nothing is known either way. */
  | 'no-catalog'
  /** No object of this scope reached the catalogue: there was nothing to ask about. */
  | 'nothing-to-ask'
  /** The decisions in scope read and write no SAP object, so the catalogue had nothing to answer for. */
  | 'no-object-to-ask-about'
  /** The catalogue was asked and named no released successor. */
  | 'catalog-silent'
  /** The code shows nobody at this carrier, so what a person sees does not arise. */
  | 'carrier-not-operated-by-a-person'
  /** What carries the step today is not determined, so there is nothing to compare. */
  | 'carrier-today-not-determined'
  /** Nothing points anywhere, so there is nothing to compare. */
  | 'carrier-future-not-determined'
  /** The difference itself is not determined, so nothing follows from it. */
  | 'difference-not-determined';

/**
 * What a field rests on.
 *
 * `code` and `catalog` are the two that carry something, and they are the
 * reason `level` is nullable: only a `catalog` field is on the E0–E4 ladder.
 */
export type FieldBasis =
  /** A statement of this source, with its line. */
  | 'code'
  /** SAP's cloudification catalogue, through the capabilities of roadmap 7.2. */
  | 'catalog'
  /** Read off another field of the same record, and never above it. */
  | 'derived'
  /** Nothing. Set exactly when the field is *Not determined*. */
  | 'none';

export interface UserChangeField {
  basis: FieldBasis;
  /** The sentence. `null` exactly when `notDetermined` is set. */
  statement: string | null;
  /** E0–E4 where the subject is a standard candidate; `null` for a code fact. */
  level: EvidenceLevelValue | null;
  provenance: ProvenanceValue;
  /** Where it came from, in the reader's words. Never empty, determined or not. */
  source: string;
  /** `L631`, `L631-634`. Empty where the field rests on no line of this source. */
  anchors: string[];
  /** The catalogue evidence the level was read off. Empty for a code fact. */
  evidence: StandardEvidence[];
  /** Set exactly when `statement` is `null`. */
  notDetermined: { reason: UserChangeNotDeterminedReason; detail: string } | null;
}

export interface UserChangeSubject {
  kind: 'step' | 'program' | 'capability';
  /** A token out of the source. Never a phrase this module made up. */
  label: string;
  /** Upper-cased routine or event block; `null` at program level. */
  routine: string | null;
  /** `L631`, `L631-634`, or `null` where the source supports none. */
  anchor: string | null;
  /** The process element of roadmap 2.3, when the skeleton draws one. */
  stepId: string | null;
  /** Set exactly when `kind` is `step` and `stepId` is `null`. */
  notDrawn: { reason: StepNotDrawnReason; detail: string } | null;
}

/** A capability of roadmap 7.2 in this record's scope — its level, read not re-derived. */
export interface CapabilityInScope {
  id: string;
  key: string;
  label: string;
  level: EvidenceLevelValue;
  fit: ObjectStatusValue | null;
}

export interface UserChangeRecord {
  /** `UC-01`, in the order the carriers stand in the source. */
  id: string;
  subject: UserChangeSubject;
  /** `null` exactly for a capability subject — it has no carrier by definition. */
  carrier: CarrierKind | null;
  /** `null` exactly when `carrier` is `null`. */
  carrierMode: CarrierMode | null;
  /** 1 — what carries the step today. */
  carrierToday: UserChangeField;
  /** 2 — where SAP's catalogue points. A pointer, never a promise. */
  carrierFuture: UserChangeField;
  /** 3 — what is a different kind of thing, and only that. */
  looksDifferent: UserChangeField;
  /** 4 — the training hint. A hint with a level, never a verdict. */
  training: UserChangeField;
  capabilities: CapabilityInScope[];
}

export interface UserChangeReport {
  program: string | null;
  records: UserChangeRecord[];
  counts: {
    records: number;
    byCarrier: Record<CarrierKind, number>;
    /** Records whose carrier today is named in the source. */
    carrierTodayDetermined: number;
    /** Records the catalogue points somewhere for. */
    carrierFutureDetermined: number;
    looksDifferentDetermined: number;
    /** Records that carry the training hint. */
    trainingHints: number;
    /** Over `carrierFuture.level`, which is never `null`. */
    byLevel: Record<EvidenceLevelValue, number>;
  };
  /** True when there is no source to read — a different thing from zero records. */
  noSource: boolean;
  /** False when no catalogue was passed. Then E0 is about this reading, not about SAP. */
  catalogConsulted: boolean;
}

/* ------------------------------------------------------------- the wording */

/**
 * The two words a pointer is written with, taken from `lib/evidence-level.ts`
 * rather than spelled again.
 *
 * A scope item and a catalogue successor are the same kind of statement — an
 * address at E1 — and they read the same way on purpose. One spelling, one
 * place to change it.
 */
export const POINTER_NOTE = SCOPE_ITEM_NOTE;

/** What the training hint reads. An instruction with its own hedge in it. */
export const TRAINING_HINT = `Training likely needed — ${POINTER_NOTE}`;

/**
 * What a raised training hint normally means, and who decides it.
 *
 * Hedged the way `CONCERN_COPY.depth` is hedged in `lib/compliance-review-hints.ts`:
 * this product is in no position to tell anybody who in their organisation has
 * to learn what, and it can say what usually follows and hand the judgement on.
 */
export const TRAINING_DETAIL =
  'What a person opens today is named in the code; what the catalogue points to is a different kind of ' +
  'thing. Whether anybody has to learn something, who, and how much is for the people who run this ' +
  'process to say.';

export interface FieldCopy {
  /** The column heading. A question turned into a noun, never a finding. */
  label: string;
  /** The question the field answers, for the "About this" popover. */
  question: string;
}

/** One place for the four headings, so a screen cannot invent a fifth field. */
export const USER_CHANGE_FIELD_COPY: Readonly<
  Record<'carrierToday' | 'carrierFuture' | 'looksDifferent' | 'training', FieldCopy>
> = Object.freeze({
  carrierToday: Object.freeze({
    label: 'Carrier today',
    question: 'Which transaction, report or screen does this source name for this step?',
  }),
  carrierFuture: Object.freeze({
    label: 'Where the catalogue points',
    question: 'Does SAP name a released successor for the data behind this step?',
  }),
  looksDifferent: Object.freeze({
    label: 'What is a different kind of thing',
    question: 'Is what the catalogue points to the same kind of thing a person opens today?',
  }),
  training: Object.freeze({
    label: 'Training',
    question: 'Is there a reason to look at training for this step?',
  }),
});

/* ------------------------------------------------------------- derivation */

const EMPTY_COUNTS = (): UserChangeReport['counts'] => ({
  records: 0,
  byCarrier: { transaction: 0, report: 0, screen: 0, program: 0 },
  carrierTodayDetermined: 0,
  carrierFutureDetermined: 0,
  looksDifferentDetermined: 0,
  trainingHints: 0,
  byLevel: { E0: 0, E1: 0, E2: 0, E3: 0, E4: 0 },
});

/**
 * What changes for users, for one ABAP source.
 *
 * Pass a catalogue to get pointers; without one every record still says what
 * carries the step today, and says that no catalogue was consulted rather than
 * that SAP has nothing.
 */
export function deriveUserChange(source: string, options: UserChangeOptions = {}): UserChangeReport {
  if (typeof source !== 'string' || !source.trim()) {
    return {
      program: null,
      records: [],
      counts: EMPTY_COUNTS(),
      noSource: true,
      catalogConsulted: Boolean(options.catalog),
    };
  }
  return userChangeFrom(source, deriveBusinessRules(source), options);
}

/**
 * The same records for a caller that already derived the rules — the analysis
 * pipeline holds them — so the source is not parsed twice for them.
 */
export function deriveUserChangeFrom(
  source: string,
  ruleSet: BusinessRuleSet,
  options: UserChangeOptions = {},
): UserChangeReport {
  if (typeof source !== 'string' || !source.trim()) {
    return {
      program: null,
      records: [],
      counts: EMPTY_COUNTS(),
      noSource: true,
      catalogConsulted: Boolean(options.catalog),
    };
  }
  return userChangeFrom(source, ruleSet, options);
}

/* --------------------------------------------------------------- carriers */

/** A carrier as it is read out of the source, before it is written up. */
interface Carrier {
  kind: CarrierKind;
  mode: CarrierMode;
  /** The token the source writes: `ME21N`, `RV_ORDER_FLOW_INFORMATION`, `9000`, `Z_MM_PO_APPROVAL`. */
  label: string | null;
  /** What stands where a name was expected, when the name is computed. */
  expression: string;
  lineStart: number;
  lineEnd: number;
  routine: string | null;
  /** The statement, whitespace collapsed — quoted back at the reader. */
  text: string;
  /**
   * The first sentence of `carrierToday`, written where the carrier is read.
   *
   * Here rather than in one table downstream because the six carriers are six
   * different statements and a shared template turns into a false sentence the
   * moment one of them is not what the template assumed: an ALV grid read as a
   * user task by the process skeleton is not a `CALL SCREEN`, and saying "the
   * code calls screen REUSE_ALV_GRID_DISPLAY" about it would be untrue.
   *
   * `null` exactly when `label` is `null`.
   */
  phrase: string | null;
  /** Extra sentence this carrier owes the reader. */
  note: string | null;
}

const PROGRAM_DECLARATION = /^(?:REPORT|PROGRAM)\s+([\w/]+)/i;
const CALL_SCREEN = /^CALL\s+SCREEN\s+([\w/]+)/i;
const LEAVE_TO_TRANSACTION = /^LEAVE\s+TO\s+TRANSACTION\s+(?:'([^']*)'|([\w/]+))/i;
/** What makes a report's own screen a screen somebody fills in. */
const SELECTION_SCREEN = /^(?:PARAMETERS|SELECT-OPTIONS|SELECTION-SCREEN)\b/i;

function routineAt(containers: Container[], line: number): string | null {
  return containerAt(containers, line)?.name ?? null;
}

function anchorOf(lineStart: number, lineEnd: number): string {
  return lineEnd > lineStart ? `L${lineStart}-${lineEnd}` : `L${lineStart}`;
}

/**
 * Every carrier this source names, in source order.
 *
 * Read from the call graph where roadmap 2.2 already reads it — constants
 * resolved, dynamic targets marked — and from the statements for the two forms
 * the call graph does not cover. The skeleton's user tasks come last and only
 * where no statement already claimed the line, so an ALV grid is one carrier
 * and not two.
 */
function carriersOf(
  statements: AbapStatement[],
  containers: Container[],
  calls: CallGraphReport,
  skeleton: ProcessSkeleton,
): Carrier[] {
  const out: Carrier[] = [];

  for (const statement of statements) {
    const declaration = PROGRAM_DECLARATION.exec(statement.text);
    if (!declaration) continue;
    const screen = statements.find((s) => SELECTION_SCREEN.test(s.text)) ?? null;
    const name = declaration[1].toUpperCase();
    const at = anchorOf(statement.lineStart, statement.lineEnd);
    out.push({
      kind: 'program',
      mode: screen ? 'opened' : 'declared',
      label: name,
      expression: declaration[1],
      lineStart: statement.lineStart,
      lineEnd: statement.lineEnd,
      routine: null,
      text: statement.text,
      phrase: `This source declares itself the report ${name} at ${at}.`,
      note: screen
        ? `It declares a selection screen somebody fills in (${screen.keyword || 'SELECTION-SCREEN'}, ` +
          `${anchorOf(screen.lineStart, screen.lineEnd)}).`
        : 'Nothing in this source says that a person starts it.',
    });
    break;
  }

  for (const call of calls.transactions) {
    const at = anchorOf(call.lineStart, call.lineEnd);
    out.push({
      kind: 'transaction',
      mode: call.batchInput ? 'batch-input' : 'opened',
      label: call.code ?? null,
      expression: call.codeExpression,
      lineStart: call.lineStart,
      lineEnd: call.lineEnd,
      routine: call.caller,
      text: call.text,
      phrase: call.code
        ? call.batchInput
          ? `The code drives transaction ${call.code} at ${at}.`
          : `The code calls transaction ${call.code} at ${at}.`
        : null,
      note: call.batchInput
        ? 'This is batch input: the program fills the screens of that transaction, and the source does ' +
          'not say that anybody is in front of it.'
        : null,
    });
  }

  for (const call of calls.submits) {
    const at = anchorOf(call.lineStart, call.lineEnd);
    out.push({
      kind: 'report',
      mode: call.viaJob ? 'background-job' : 'opened',
      label: call.program ?? null,
      expression: call.programExpression,
      lineStart: call.lineStart,
      lineEnd: call.lineEnd,
      routine: call.caller,
      text: call.text,
      phrase: call.program ? `The code starts report ${call.program} at ${at}.` : null,
      note: call.viaJob ? 'It runs as a background job, with nobody in front of it.' : null,
    });
  }

  for (const statement of statements) {
    const at = anchorOf(statement.lineStart, statement.lineEnd);
    const screen = CALL_SCREEN.exec(statement.text);
    if (screen) {
      const number = screen[1].toUpperCase();
      out.push({
        kind: 'screen',
        mode: 'opened',
        label: number,
        expression: screen[1],
        lineStart: statement.lineStart,
        lineEnd: statement.lineEnd,
        routine: routineAt(containers, statement.lineStart),
        text: statement.text,
        phrase: `The code calls screen ${number} of this program at ${at}.`,
        note: 'What that screen shows is in the screen painter, which is not part of this source.',
      });
      continue;
    }
    const leave = LEAVE_TO_TRANSACTION.exec(statement.text);
    if (leave) {
      const code = leave[1] ? leave[1].toUpperCase() : null;
      out.push({
        kind: 'transaction',
        mode: 'opened',
        label: code,
        expression: leave[1] ?? leave[2],
        lineStart: statement.lineStart,
        lineEnd: statement.lineEnd,
        routine: routineAt(containers, statement.lineStart),
        text: statement.text,
        phrase: code ? `The code leaves this program for transaction ${code} at ${at}.` : null,
        note: null,
      });
    }
  }

  // The skeleton's own reading of `DESIGN.md` §5.8: a step where a human acts.
  // A node that stands in for a routine (`collapsedFrom`) is the call site of
  // something already counted, not a second carrier.
  const claimed = new Set(out.map((c) => c.lineStart));
  for (const node of skeleton.nodes) {
    if (node.kind !== 'user-task' || !node.anchor) continue;
    if (node.detail && 'collapsedFrom' in node.detail) continue;
    if (claimed.has(node.anchor.lineStart)) continue;
    claimed.add(node.anchor.lineStart);
    const at = anchorOf(node.anchor.lineStart, node.anchor.lineEnd);
    out.push({
      kind: 'screen',
      mode: 'opened',
      label: node.label,
      expression: node.label,
      lineStart: node.anchor.lineStart,
      lineEnd: node.anchor.lineEnd,
      routine: node.container,
      text: node.label,
      phrase:
        `The step at ${at} is one somebody acts at: the process skeleton reads “${node.label}” that ` +
        'way, by the palette of DESIGN.md §5.8.',
      note: 'What it puts in front of that person is drawn by that call, which this source does not describe further.',
    });
  }

  return out.sort((a, b) => a.lineStart - b.lineStart || a.kind.localeCompare(b.kind));
}

/* ----------------------------------------------------------------- fields */

function notDetermined(
  source: string,
  reason: UserChangeNotDeterminedReason,
  detail: string,
  extra: { level?: EvidenceLevelValue | null; anchors?: string[] } = {},
): UserChangeField {
  return {
    basis: 'none',
    statement: null,
    level: extra.level ?? null,
    provenance: 'not-determined',
    source,
    anchors: extra.anchors ?? [],
    evidence: [],
    notDetermined: { reason, detail },
  };
}

/** 1 — what carries the step today, out of the statement, with its line. */
function carrierTodayField(carrier: Carrier): UserChangeField {
  const anchor = anchorOf(carrier.lineStart, carrier.lineEnd);
  const source = `the source, ${anchor}`;

  if (carrier.label === null || carrier.phrase === null) {
    return notDetermined(
      source,
      'target-not-named',
      `The name is computed at run time (“${carrier.expression}” in “${carrier.text}”, ${anchor}), so ` +
        'this source does not say which one it is. A reader at that line can.',
      { anchors: [anchor] },
    );
  }

  const tail =
    carrier.kind === 'program'
      ? ' Which transaction code, if any, is bound to it is not in this source.'
      : '';

  return {
    basis: 'code',
    statement: `${carrier.phrase}${carrier.note ? ` ${carrier.note}` : ''}${tail}`,
    level: null,
    provenance: 'reconstructed',
    source,
    anchors: [anchor],
    evidence: [],
    notDetermined: null,
  };
}

const POINTERS_SHOWN = 3;

/** 2 — where the catalogue points. E1 by construction, and written as an address. */
function carrierFutureField(
  candidates: readonly StandardCandidate[],
  scope: string,
  catalogConsulted: boolean,
  hasCapabilities: boolean,
  anyCapabilityInSource: boolean,
  objectsInScope: number,
): UserChangeField {
  const source = "SAP's cloudification catalogue, through the capabilities of roadmap 7.2";

  if (!catalogConsulted) {
    return notDetermined(
      source,
      'no-catalog',
      `No catalogue was consulted for this reading, so nothing is known either way about a released ` +
        `successor for ${scope}.`,
      { level: 'E0' },
    );
  }
  if (!hasCapabilities) {
    // Two different absences, two different sentences — the discipline 7.2
    // keeps between "nobody asked" and "asked, nothing there", one step out.
    return notDetermined(
      source,
      'nothing-to-ask',
      (anyCapabilityInSource
        ? `No decision of this program stands in ${scope}, so nothing of this step reached the catalogue `
        : `This reading found no decision in the source, so nothing of ${scope} reached the catalogue `) +
        'and it was not asked anything about it. SAP publishes successors for objects, never for ' +
        'transaction codes.',
      { level: 'E0' },
    );
  }
  if (candidates.length === 0 && objectsInScope === 0) {
    // The third absence, and 7.2 keeps it apart too: the routines these
    // decisions stand in touch no SAP object at all, so the catalogue was asked
    // nothing — which is not the same as a catalogue that had nothing.
    return notDetermined(
      source,
      'no-object-to-ask-about',
      `The decisions behind ${scope} read and write no SAP object, so there was nothing to ask the ` +
        'catalogue about.',
      { level: 'E0' },
    );
  }
  if (candidates.length === 0) {
    return notDetermined(
      source,
      'catalog-silent',
      `The catalogue was asked about the objects behind ${scope} and named no released successor for ` +
        'any of them. A missing catalogue hit proves nothing either way — the catalogue lists what SAP ' +
        'has published, not what exists.',
      { level: 'E0' },
    );
  }

  const evidence: StandardEvidence[] = candidates.map((candidate) => ({
    kind: 'catalog-successor',
    reference: `${candidate.object} → ${candidate.successor}`,
    source: candidate.source,
    anchor: candidate.anchor,
  }));
  const level = levelFromEvidence(evidence);
  const shown = candidates
    .slice(0, POINTERS_SHOWN)
    .map((c) => `${c.object} → ${c.successor} (${c.anchor})`)
    .join(', ');
  const rest = candidates.length - POINTERS_SHOWN;
  const list = rest > 0 ? `${shown}, and ${rest} more` : shown;

  return {
    basis: 'catalog',
    statement:
      `SAP's cloudification catalogue names a released successor for ` +
      `${candidates.length === 1 ? 'one object' : `${candidates.length} objects`} behind ${scope}: ` +
      `${list} — ${POINTER_NOTE}. A released successor names where data is published; which app or ` +
      'transaction somebody opens is not in the catalogue.',
    level,
    provenance: fitOfLevel(level).provenance,
    source,
    anchors: candidates.map((c) => c.anchor),
    evidence,
    notDetermined: null,
  };
}

/** 3 — what is a different kind of thing, and nothing beyond that. */
function looksDifferentField(
  carrier: Carrier | null,
  today: UserChangeField,
  future: UserChangeField,
): UserChangeField {
  const source = 'the two fields above, and nothing else';

  if (carrier && carrier.mode !== 'opened') {
    return notDetermined(
      source,
      'carrier-not-operated-by-a-person',
      `${carrier.note ?? 'The code shows nobody in front of this carrier.'} What a person would see ` +
        'therefore does not arise from this line.',
      { level: 'E0' },
    );
  }
  if (today.notDetermined) {
    return notDetermined(
      source,
      'carrier-today-not-determined',
      'What carries this step today is not determined, so there is nothing to hold the pointer against.',
      { level: 'E0' },
    );
  }
  if (future.notDetermined) {
    return notDetermined(
      source,
      'carrier-future-not-determined',
      'Nothing points anywhere for this step, so there is nothing to hold against what carries it today.',
      { level: 'E0' },
    );
  }

  const level = levelFromEvidence(future.evidence);
  return {
    basis: 'catalog',
    statement:
      // Deliberately not "a SAP GUI screen against a Fiori app": which client a
      // report is started from is not in this source, and which app publishes a
      // released object is not in the catalogue. What both sources together do
      // support is that the one is something somebody opens and the other is an
      // address for data, and the sentence stops there.
      'The code names something a person opens; the catalogue names released objects, which are ' +
      `addresses for data rather than something anybody opens — ${POINTER_NOTE}. That the two are ` +
      'different kinds of thing is what the catalogue supports, and no more: what a screen in the ' +
      'target shows is not in it.',
    level,
    provenance: fitOfLevel(level).provenance,
    source,
    anchors: [...today.anchors, ...future.anchors],
    evidence: future.evidence,
    notDetermined: null,
  };
}

/** 4 — the training hint, at the level of the difference it follows from. */
function trainingField(looksDifferent: UserChangeField): UserChangeField {
  const source = 'the difference above — a hint, not a finding';

  if (looksDifferent.notDetermined) {
    return notDetermined(
      source,
      'difference-not-determined',
      `${looksDifferent.notDetermined.detail} Nothing about training follows from that.`,
      { level: looksDifferent.level },
    );
  }
  return {
    basis: 'derived',
    statement: `${TRAINING_HINT}. ${TRAINING_DETAIL}`,
    level: looksDifferent.level,
    provenance: looksDifferent.provenance,
    source,
    anchors: looksDifferent.anchors,
    evidence: looksDifferent.evidence,
    notDetermined: null,
  };
}

/* ------------------------------------------------------------- assembling */

const NOT_DRAWN_DETAIL: Record<StepNotDrawnReason, string> = {
  unreached:
    'The routine this carrier stands in is not reached from any entry point, so the process skeleton ' +
    'draws no element for it. The statement is still in the source.',
  'technical-helper':
    'The routine this carrier stands in has no effect of its own and is folded into its callers, so the ' +
    'process skeleton draws no element of its own for it.',
  'not-a-process-element':
    'A program declaration is not a step: the process skeleton draws the flow inside the program, not ' +
    'the program itself.',
};

function stepOf(
  carrier: Carrier,
  skeleton: ProcessSkeleton,
): { stepId: string | null; notDrawn: UserChangeSubject['notDrawn'] } {
  if (carrier.kind === 'program') return { stepId: null, notDrawn: null };

  const node: SkeletonNode | undefined = skeleton.nodes.find(
    (n) => n.anchor?.lineStart === carrier.lineStart && !(n.detail && 'collapsedFrom' in n.detail),
  );
  if (node) return { stepId: node.id, notDrawn: null };

  const routine = carrier.routine?.toUpperCase() ?? null;
  const reason: StepNotDrawnReason = skeleton.notDrawn.unreached.some(
    (u) => u.name.toUpperCase() === routine,
  )
    ? 'unreached'
    : skeleton.notDrawn.technicalHelpers.some((h) => h.name.toUpperCase() === routine)
      ? 'technical-helper'
      : 'not-a-process-element';
  return { stepId: null, notDrawn: { reason, detail: NOT_DRAWN_DETAIL[reason] } };
}

function inScope(capability: StandardCapability): CapabilityInScope {
  return {
    id: capability.id,
    key: capability.key,
    label: capability.label,
    level: capability.level,
    fit: capability.fit,
  };
}

/** How many distinct SAP objects the capabilities in scope read or write. */
function objectsInScope(capabilities: readonly StandardCapability[]): number {
  const seen = new Set<string>();
  for (const capability of capabilities) for (const object of capability.objects) seen.add(object.name);
  return seen.size;
}

/** The candidates of a set of capabilities, de-duplicated on object and successor. */
function candidatesOf(capabilities: readonly StandardCapability[]): StandardCandidate[] {
  const seen = new Set<string>();
  const out: StandardCandidate[] = [];
  for (const capability of capabilities) {
    for (const candidate of capability.candidates) {
      const mark = `${candidate.object}|${candidate.successor}`;
      if (seen.has(mark)) continue;
      seen.add(mark);
      out.push(candidate);
    }
  }
  return out;
}

const PROGRAM_LEVEL = '(program)';

function userChangeFrom(
  source: string,
  ruleSet: BusinessRuleSet,
  options: UserChangeOptions,
): UserChangeReport {
  const catalog: CatalogLookup | null = options.catalog ?? null;
  const statements = readStatements(source);
  const structure = readBlocks(statements);
  const calls = readCallGraphFrom(statements, structure);
  const skeleton = buildProcessSkeleton(source);
  const coverage: StandardCoverage = deriveStandardCoverageFrom(source, ruleSet, options);

  // Which routines each capability's rules stand in. `capabilityKeyOf` is the
  // one answer to "which capability is this", exported by 7.2 for exactly this.
  const routinesByKey = new Map<string, Set<string>>();
  for (const rule of ruleSet.rules) {
    const key = capabilityKeyOf(rule);
    if (key === null) continue;
    const routines = routinesByKey.get(key) ?? new Set<string>();
    for (const place of rule.sources) routines.add(place.routine?.toUpperCase() ?? PROGRAM_LEVEL);
    if (rule.sources.length === 0) routines.add(PROGRAM_LEVEL);
    routinesByKey.set(key, routines);
  }

  const carriers = carriersOf(statements, structure.containers, calls, skeleton);

  // A capability belongs to a carrier when one of its rules stands in the same
  // routine. Containment, not a judgement: the decision and the carrier are
  // written inside the same FORM.
  const attached = new Map<string, StandardCapability[]>();
  const taken = new Set<string>();
  carriers.forEach((carrier, index) => {
    if (carrier.kind === 'program' || carrier.routine === null) return;
    const routine = carrier.routine.toUpperCase();
    const mine = coverage.capabilities.filter((c) => routinesByKey.get(c.key)?.has(routine));
    if (mine.length === 0) return;
    attached.set(String(index), mine);
    for (const capability of mine) taken.add(capability.key);
  });

  // The program record takes the rest: those decisions stand in this program and
  // in no routine that names a carrier of its own.
  const programIndex = carriers.findIndex((c) => c.kind === 'program');
  const leftOver = coverage.capabilities.filter((c) => !taken.has(c.key));
  if (programIndex >= 0 && leftOver.length > 0) {
    attached.set(String(programIndex), leftOver);
    for (const capability of leftOver) taken.add(capability.key);
  }

  const records: UserChangeRecord[] = [];

  carriers.forEach((carrier, index) => {
    const capabilities = attached.get(String(index)) ?? [];
    const scope =
      carrier.kind === 'program'
        ? `this report`
        : carrier.routine
          ? `“${carrier.routine}”`
          : `this step`;
    const today = carrierTodayField(carrier);
    const future = carrierFutureField(
      candidatesOf(capabilities),
      scope,
      Boolean(catalog),
      capabilities.length > 0,
      coverage.capabilities.length > 0,
      objectsInScope(capabilities),
    );
    const different = looksDifferentField(carrier, today, future);
    const step = stepOf(carrier, skeleton);

    records.push({
      id: '',
      subject: {
        kind: carrier.kind === 'program' ? 'program' : 'step',
        label: carrier.label ?? carrier.expression,
        routine: carrier.routine,
        anchor: anchorOf(carrier.lineStart, carrier.lineEnd),
        stepId: step.stepId,
        notDrawn: carrier.kind === 'program' ? null : step.notDrawn,
      },
      carrier: carrier.kind,
      carrierMode: carrier.mode,
      carrierToday: today,
      carrierFuture: future,
      looksDifferent: different,
      training: trainingField(different),
      capabilities: capabilities.map(inScope),
    });
  });

  // "oder Fähigkeit, wenn kein Schritt zuzuordnen ist": a decision that no
  // carrier and no program declaration covers is still a decision somebody
  // made, and it is named rather than dropped.
  for (const capability of coverage.capabilities) {
    if (taken.has(capability.key)) continue;
    const routines = [...(routinesByKey.get(capability.key) ?? [])].sort();
    const where = routines.length ? routines.map((r) => `“${r}”`).join(', ') : 'this source';
    const today = notDetermined(
      'the source',
      'no-carrier-in-routine',
      `Nothing in ${where} names a transaction, a report or a screen, and this source declares no ` +
        'report of its own, so it does not say what anybody opens for this decision.',
    );
    const future = carrierFutureField(
      capability.candidates,
      where,
      Boolean(catalog),
      true,
      true,
      objectsInScope([capability]),
    );
    const different = looksDifferentField(null, today, future);
    records.push({
      id: '',
      subject: {
        kind: 'capability',
        label: capability.label,
        routine: routines.find((r) => r !== PROGRAM_LEVEL) ?? null,
        anchor: capability.objects[0]?.anchor ?? null,
        stepId: null,
        notDrawn: null,
      },
      carrier: null,
      carrierMode: null,
      carrierToday: today,
      carrierFuture: future,
      looksDifferent: different,
      training: trainingField(different),
      capabilities: [inScope(capability)],
    });
  }

  records.forEach((record, index) => {
    record.id = `UC-${String(index + 1).padStart(2, '0')}`;
  });

  const counts = EMPTY_COUNTS();
  counts.records = records.length;
  for (const record of records) {
    if (record.carrier) counts.byCarrier[record.carrier] += 1;
    if (!record.carrierToday.notDetermined) counts.carrierTodayDetermined += 1;
    if (!record.carrierFuture.notDetermined) counts.carrierFutureDetermined += 1;
    if (!record.looksDifferent.notDetermined) counts.looksDifferentDetermined += 1;
    if (!record.training.notDetermined) counts.trainingHints += 1;
    counts.byLevel[record.carrierFuture.level ?? 'E0'] += 1;
  }

  return {
    program: ruleSet.program,
    records,
    counts,
    noSource: false,
    catalogConsulted: Boolean(catalog),
  };
}
