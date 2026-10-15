/**
 * The shapes of the engine-led transformation (roadmap 3.0.12 extension,
 * `docs/design/engine-led-transformation.md`, ADR-101): the unit plan, the
 * ABAP slice, the fill markers, the scaffold, the trace and the generation
 * events. Track B (`lib/transformation/*` — plan, slice, markers, scaffolds,
 * trace) writes them; Track C (fill prompt, orchestrator, lease, verify) and
 * Track D (generation screen) read them. A change here is a change of the
 * contract between the tracks: say so in the design document (§6.1, §8, §9,
 * §15.5).
 *
 * Pure types and constants. No imports beyond types.
 */

import type { DeclaredDecimal, GuardEffect, SelectionInput } from '../abap/original-contract';

/* ------------------------------------------------------------- versions */

/**
 * The plan's rules (granularity, folding, fixtures, budgets). A new value changes unit ids.
 * 2 (3.0.13): a structure component the original only recalculates from its own value (`y = y + x`,
 * `ADD x TO y`) is a record field of the request, not a computed result, and starts at zero when the
 * original gives it no value (`recordInputOf`, `withInitialBase` in unit-plan.ts).
 */
export const PLAN_VERSION = 2;
/**
 * The engine-written package text. Enters the generation binding (§12.2); a new value does not make a draft stale.
 * 2 (3.0.12, DSAG ABAP guide review): the RAP scaffold checks authorization (`#CHECK`, access controls, handlers
 * that deny until filled), carries an access layer, ABAP Doc on every public method and, where the original runs in
 * the background, an Application Job. The Node scaffold's text is unchanged.
 * 3 (3.0.12, abapGit package): the RAP scaffold writes abapGit's metadata file for every object
 * (`abapgit-files.ts`), the table as abapGit XML instead of `.tabl.astabl`, the root package's
 * `package.devc.xml`, and a transparent table name within 16 characters. The Node scaffold's text is unchanged.
 * 4 (3.0.12, defect E of the fill A/B 13.10.2026): a work area that LOOP, READ TABLE or SELECT fills from an
 * internal table the program builds itself is a computed value, not an input record — a check on it is called
 * in the body with the value in `values` (`guard-basis.ts`). Both scaffolds' guard text changes where a check
 * reads such a work area (its values, its doc line); nothing signed changes (§12.3).
 * 5 (3.0.13, probes that reach the written functions): the Node scaffold's `test/acceptance-shims.ts` gains
 * entry points that run the whole process (`listOf`, `exportOf`, `recalcOf`, `writeOf`), and
 * `acceptance-adapter.json` maps the display-filter, recalculation and negative-write probes onto them where
 * the original shows the pattern, naming the unit each one reaches (`fill-probes.ts`). The RAP text is unchanged.
 * 6 (3.0.13, generated ABAP that activates — two external reviews of the SD example): the RAP logic class
 * carries a typed contract (`rap-contract.ts`): the original's TYPES as declared, its globals and selection
 * inputs as attributes under their names, its constants, one method per routine with the FORM's own
 * parameters, the run's selection, input and result structures, a refusal exception. Every carried guard runs
 * in the logic path: an engine-written predicate (the original's condition), called by the engine at the
 * method's entry or with the selection where that is exact, and by the body at the original's line otherwise —
 * no save validation with an empty selection. A program that writes no table becomes a custom entity with a
 * query provider instead of a managed business object; one that writes keeps the business object, run by an
 * action with the selection as its parameter. The access interface types each call from its call sites. The
 * Node scaffold's text is unchanged; nothing signed changes (§12.3).
 * 7 (3.0.13, the side-by-side route becomes real CAP, step 2 — a CAP shell around the Node core): the input is one
 * named list per input table of the original, each typed by its own structure (`input-lists.ts`), instead of one
 * record list folding every structure into `Rec`; a run starts with those rows in the original's own global tables
 * (`seedOf`), a skipping check's `record` is a row of its list, and only fields of a structure without an input
 * table stay in `records`. Around the unchanged core the engine writes the CAP shell (`cap-shell.ts`): package.json
 * with `@sap/cds` and `cds-serve`/`cds watch`, `db/schema.cds` with one type and entity per input structure (types
 * as declared), `srv/service.cds` with the action the architecture asks for (`simulate` for a read-only program,
 * `run` and the written customer tables for a writing one — the RAP route's decision, `architecture.ts`),
 * `srv/service.ts` handlers that only delegate to the core, `srv/access.ts` with remote services on released OData
 * APIs (placeholder definitions, mock data) or refusals with their reason, `mta.yaml` and `xs-security.json`.
 * Checked by `cds compile` where the compiler is installed (`cds-compile.ts`) and by the type check. The RAP text
 * is unchanged; stored packages keep their version and their request shape; nothing signed changes (§12.3).
 * 8 (3.0.13, contract gaps of the second real acceptance run, 14.10.2026): RAP — `INCLUDE STRUCTURE` inside a
 * structure is carried (BDCDATA and BDCMSGCOLL, which ABAP Cloud lacks, as local components), and a customer
 * table the original reads gets a read method in the access layer (a body's SELECT on it is refused, naming the
 * method). Node — one representation of a decimal: every `dec.*` helper takes decimal text, a number or a
 * `Scaled`; every guard helper and predicate takes (sel, st, record, values), `values` typed per value as the
 * original declares it (`abap-shapes.ts` `typeOf`) and `{}` when a check reads none; a step's arguments are typed
 * from its FORM; steps, process and guards import every type of `srv/lib/types.ts`, and `tsconfig.json` has no
 * DOM library. Merged on top of 7: both hold — named input lists and typed values/four-parameter checks.
 * Nothing signed changes (§12.3).
 * 9 (3.0.13, engine defects of the fourth real acceptance run, 14.10.2026): RAP — a customer table the original
 * writes or types data by, whose definition the package does not ship, is a structure type of the logic class under
 * the table's own name, built from the fields the original uses (`DATA ls_appr TYPE zmm_po_appr` activates); a
 * customer table it writes gets `write_<table>( is_row | it_rows )` in the access layer, and a body's INSERT, MODIFY,
 * UPDATE or DELETE on it is refused naming that method; a call to a class SAP releases for ABAP Cloud
 * (`cl_system_uuid=>…`, the synced `released-classes.latest.json`) is no longer "a call outside the logic class".
 * Node — the scaffold text is unchanged (the type check maps a body's missing return, reported on the signature, to
 * that body; the scaffold's own type check runs before the fills). Nothing signed changes (§12.3).
 * 10 (3.0.13, the first real activation, BTP ABAP trial, 15.10.2026): RAP — no generated table field or CDS element
 * carries a name the Dictionary refuses; the SQL reserved words SAP keeps in TRESE (`ddic-reserved.ts`) get `_value`
 * (the SD custom entity was refused for DEFERRED). Node — unchanged. Nothing signed changes (§12.3).
 * 11 (3.0.13, the first SAP activation and ABAP Unit run, BTP ABAP trial, 15.10.2026): RAP — a type the original
 * names as a component of a table or structure ABAP Cloud does not release (`TYPE rlgrap-filename`) is a built-in
 * type with a comment naming the original's (`cloudPhrase`); each SAP table the access layer reads or writes has a row
 * type of the logic class from the fields the original uses (`ty_vbak_row`), and a body typing data by the table is
 * refused naming it (`sap-type`); the ABAP Unit double of the access layer implements every method, empty (no
 * PARTIALLY IMPLEMENTED: every golden-master case died with CX_SY_DYN_CALL_ILLEGAL_METHOD); the fill markers are
 * plain comments (`" @cc-fill`), not ABAP Doc, which drew 71 activation warnings — the reader takes both forms. Node —
 * unchanged. Nothing signed changes (§12.3).
 * 12 (3.0.14 items 7 and 8, the first SAP activation's ABAP Unit run, 15.10.2026: 37 green, 0 red, 40 skipped): RAP —
 * the engine cases run in ABAP (`abap-engine-cases.ts`): a guard case asks the check's predicate `when_g<line>` on the
 * case's input (an attribute of the logic class or a parameter of the predicate; the test include makes
 * `ltc_engine_cases` a local friend of the logic class), a precision case assigns its value to the declared type and
 * asserts what it holds or the overflow; an input-channel or run-identity case, and an example with no value the engine
 * knows, keeps a skip naming why. The golden-master cases run and then report themselves as skipped — their result not
 * yet compared — unless an expected result of the original is on record (`GoldenMasterExpected`, the seam for 3.0.17);
 * a refusal of a case is caught as its outcome, not as a failure. Node — unchanged. Nothing signed changes (§12.3).
 */
export const SCAFFOLD_VERSION = 12;

/* -------------------------------------------------------------- budgets */

/** §7.2: soft slice budget per unit — a unit above it is listed, not split. */
export const SOFT_SLICE_LINES = 150;
export const SOFT_SLICE_CHARS = 6_000;
/** §7.2: hard slice budget — a routine above it is split into parts at top-level statements. */
export const HARD_SLICE_LINES = 300;
export const HARD_SLICE_CHARS = 12_000;
/** §7.2: above this many units the plan bundles densely; above `MAX_UNITS_REFUSE` it refuses (fallback, §16.2). */
export const DENSE_UNITS = 60;
export const MAX_UNITS_REFUSE = 120;
/** §7.1 rule 3: a helper under this many lines, with no rule, guard or DB write and one caller, folds into its caller. */
export const FOLD_MAX_LINES = 12;
/** §8.1: the declarations a slice carries, at most this many characters. */
export const SLICE_DECLARATION_CHARS = 1_500;
/** §8.1: at most this many call sites per slice. */
export const SLICE_CALL_SITES = 3;
/** §9.2 rule 5: a body is refused above this many characters, or above 4× its slice. */
export const BODY_MAX_CHARS = 16_000;
export const BODY_SLICE_FACTOR = 4;

/* ---------------------------------------------------------------- rules */

/** The owner's decision on a rule as the scaffold applies it (§6.4). `clarify` and no answer are `open`. */
export type RuleDecision = 'keep' | 'change' | 'drop' | 'open';

/**
 * One rule decision handed to the planner — the shape of `ContextRule`
 * (`lib/transformation-context.ts`, Track A) reduced to what the scaffold
 * reads, so a caller passes `TransformationContextInput.rules.items` as is.
 */
export interface RuleDecisionInput {
  id: string;
  answer: 'keep' | 'change' | 'drop' | 'clarify' | null;
  /** The owner's text: the new rule (change), the reason (drop). */
  note: string | null;
}

/** A material rule of the program with the decision the scaffold applies. */
export interface PlanRule {
  id: string;
  type: 'rule' | 'control';
  decision: RuleDecision;
  /** The owner's proposal for a `change`, else null. */
  proposal: string | null;
  /** The condition as written. */
  label: string;
  /** The engine's rule text, cut short. */
  text: string;
  /** Upper-cased routine the rule stands in, or null at program level. */
  routine: string | null;
  ranges: Array<{ lineStart: number; lineEnd: number }>;
  /** The unit that carries it, or null (dropped, a fixture's, or at program level of the input contract). */
  unitId: string | null;
}

/** One check of the original that refuses, stops or skips (`readGuardsFrom`), with where the scaffold puts it. */
export interface PlanGuard {
  /** `G-0506` — the line of the IF/ELSEIF/CHECK, four digits or more. */
  id: string;
  line: number;
  endingLine: number;
  condition: string;
  effect: GuardEffect;
  ending: string;
  /** The engine's business rule on that line (the same mapping the engine cases use), else null. */
  rule: string | null;
  /** The decision of `rule`; `keep` for a check no rule names. */
  decision: RuleDecision;
  /** False for a check of a dropped rule, a fixture or an unreachable routine. */
  carried: boolean;
  /**
   * Refuses the whole input (an error message, RAISE, LEAVE, STOP, a CHECK outside a loop), stops the step
   * (RETURN, EXIT outside a loop) or skips one record (CONTINUE, a CHECK inside a loop).
   */
  outcome: 'refuses' | 'stops' | 'skips';
  /** The subject of a simple condition (`p_gjahr`, `ls_rcv-quota`), else null. */
  subject: string | null;
  /** Where the check stands: a routine's unit, the orchestrator, or the selection screen. */
  place: 'unit' | 'orchestrator' | 'selection-screen' | 'not-carried';
  /** The unit that owns the guard's predicate fill, or null when not carried. */
  unitId: string | null;
  /** The engine-written wrapper: `guard_BR_009_G0506` (refuses) / `skip_L0612` (skips). */
  helper: string;
  /** The fill region of the predicate: `U02.G0506`. */
  regionId: string | null;
  /**
   * `raw` — reads only the request (inputs, constants, input records): checked before any calculation.
   * `derived` — reads a value computed before it: the body must call the guard at the original's position
   * (rule 15, QA finding 4e9d1315469d; see guard-basis.ts).
   */
  basis: 'raw' | 'derived';
  /** Why derived, or null. */
  basisReason: string | null;
  /** The computed values a derived guard takes (its `values` argument). */
  operands: Array<{ name: string; key: string }>;
  /** Literals the condition compares against, and its operator when simple — for the inline check. */
  literals: string[];
  op: string | null;
  /**
   * Who calls the guard: `entry` — the stub, before the fill marker; `selection` — `checkSelection`, before any
   * step; `body` — the model's body, at the original's position (derived checks, skipping checks); `none` — not carried.
   */
  placement: 'entry' | 'selection' | 'body' | 'none';
}

/* ---------------------------------------------------------------- units */

export type UnitKind = 'routine' | 'method' | 'orchestrator' | 'event' | 'fixture';

export interface AbapRange {
  lineStart: number;
  lineEnd: number;
  /** Upper-cased routine or event block the lines belong to. */
  routine: string;
}

export interface Unit {
  /** `U02` — stable for one source and one `PLAN_VERSION`. `U00` is the orchestrator. */
  id: string;
  kind: UnitKind;
  /** `validatePolicy` (Node) — the RAP method name is `rapName`. */
  fn: string;
  /** `validate_policy` — ABAP method name (≤ 30 characters). */
  rapName: string;
  /** `srv/steps/02-validate-policy.ts`. */
  file: string;
  /** Engine plain name of the step: "Validate policy". */
  title: string;
  /** BPMN element id of the step; null — the scaffold does not build the process map (§4: no BPMN map build). */
  stepId: string | null;
  /** Upper-cased routine (FORM/METHOD) of the unit; null for the orchestrator. */
  routine: string | null;
  /** The unit's own lines first, then folded helpers. */
  abap: AbapRange[];
  /** Routines folded into this unit's slice (§7.1 rule 3). */
  folded: string[];
  /** Rule ids the unit carries, dropped ones excluded. */
  rules: string[];
  /** Guard ids whose predicate this unit fills. */
  guards: string[];
  /** Guard ids the stub calls before the fill marker (refusing guards of the routine). */
  guardCalls: string[];
  /** Guard ids the body must call at the original's position (placement `body`); `bodyGuards` refuses a body without them. */
  bodyCalls: string[];
  /** Unit ids this unit may call. */
  callees: string[];
  /** FORM parameters, in order. */
  parameters: Array<{ name: string; direction: 'using' | 'changing' | 'tables' }>;
  /** Engine-written Node signature; the model never changes it. */
  signature: string;
  /** The slice's size (§8.1), filled by the planner from `sliceFor`. */
  budget: { lines: number; chars: number };
  /** Over the soft budget (§7.2). */
  overSoftBudget: boolean;
  /** Part n of m when a routine was split above the hard budget (§7.2); null otherwise. */
  part: { index: number; of: number; parent: string } | null;
}

export interface NotCarried {
  routine: string;
  reason: 'unreachable' | 'dropped' | 'fixture';
  lineStart: number;
  lineEnd: number;
}

/** A field of the request the input contract validates, read from the original's declarations. */
export interface ContractField {
  /** As the original names it, upper case: `P_GJAHR`, `QUOTA`. */
  original: string;
  /** Request path: `gjahr`, `records[].quota`; null for an internal working variable. */
  path: string | null;
  /** The property name in the request (`gjahr`, `quota`). */
  key: string;
  where: 'selection' | 'record' | 'internal';
  kind: 'packed' | 'integer' | 'digits' | 'date' | 'flag' | 'range' | 'text';
  /** Packed: total digits and places, and the bound. Digits: the length. */
  digits: number | null;
  places: number;
  max: string | null;
  obligatory: boolean;
  defaultValue: string | null;
  line: number;
  /** `P(15,2)`, `TYPE gjahr`. */
  declaration: string;
  /**
   * The value the call contract's base request carries, and where it comes from — in this order: the selection
   * screen's DEFAULT (or INITIALIZATION), the original's demo data, a fixed list in the code, a value that satisfies
   * the original's checks on the field. Null: none known (an obligatory field is then listed as needing a value).
   */
  base: { value: string | boolean | string[]; source: 'default' | 'demo' | 'fixed-list' | 'guard' | 'kind' } | null;
}

export interface UnitPlan {
  version: number;
  program: string | null;
  /** sha256 of the source as planned (CRLF normalised). */
  sourceSha256: string;
  units: Unit[];
  rules: PlanRule[];
  guards: PlanGuard[];
  decimals: DeclaredDecimal[];
  inputs: SelectionInput[];
  /** The request the input contract validates (selection and record fields, internal decimals). */
  fields: ContractField[];
  /** Obligatory fields the original gives no valid value for (base-values.ts): the base request cannot carry them. */
  missingBaseValues: string[];
  /** CSV delimiter the original declares (`;`), else `,`. */
  csvDelimiter: string;
  notCarried: NotCarried[];
  folded: Array<{ routine: string; into: string }>;
  /** How the RAP track delivers the process — UI service, Application Job or both — and why (`abap-delivery.ts`). */
  abapDelivery: AbapDelivery;
  stats: PlanStats;
  /** sha256 over the plan's canonical form — the `<plan digest>` of the binding line `scaffold=` (§12.2). */
  digest: string;
}

/**
 * How the RAP scaffold delivers the process (DSAG ABAP guide, "Migration von Reports": a report becomes a Fiori app
 * on RAP or an Application Job). Read from the original by the engine; not part of the plan digest (the scaffold
 * digest covers what it changes).
 */
export type AbapDeliveryKind = 'ui-service' | 'application-job' | 'ui-service-and-job';

export interface AbapDeliveryEvidence {
  line: number;
  what: string;
}

export interface AbapDelivery {
  kind: AbapDeliveryKind;
  /** One sentence: why this kind, naming the evidence. */
  reason: string;
  /** Background use: `SUBMIT … VIA JOB`, `JOB_OPEN`/`JOB_CLOSE`/`JOB_SUBMIT`, `sy-batch`. */
  background: AbapDeliveryEvidence[];
  /** Interactive dialog: `CALL SCREEN`, `AT USER-COMMAND`, popups, ALV callbacks. */
  dialog: AbapDeliveryEvidence[];
  /** List output: `WRITE`, ALV display — in the background it goes to the spool. */
  output: AbapDeliveryEvidence[];
  /** Selection inputs of the original (`PARAMETERS`, `SELECT-OPTIONS`). */
  inputs: number;
}

export interface PlanStats {
  routines: number;
  reachable: number;
  unreachable: number;
  folded: number;
  fixtures: number;
  /** Units for routines and methods — the "fill units" of the design's measured table (§10). */
  routineUnits: number;
  /** All units, the orchestrator included. */
  units: number;
  overSoftBudget: string[];
  split: string[];
  guards: { total: number; inUnits: number; programLevel: number; notCarried: number };
  rules: { keep: number; change: number; drop: number; open: number };
  /** Bundling density Track C should use (§7.2): 4 units per call, 6 above `DENSE_UNITS`. */
  unitsPerCall: number;
}

/** Why a plan cannot be built — the fallback to the single-call path then runs (§16.2). */
export class PlanRefusal extends Error {
  readonly reason: 'too-many-units' | 'no-routine' | 'unsupported';
  constructor(reason: PlanRefusal['reason'], message: string) {
    super(message);
    this.name = 'PlanRefusal';
    this.reason = reason;
  }
}

/* ---------------------------------------------------------------- slice */

export interface AbapSlice {
  unitId: string;
  /** Original line numbers, own lines first, folded helpers next. */
  ranges: AbapRange[];
  /** `0500 FORM validate_policy.` — line-numbered, DROP lines masked, long comments shortened. */
  text: string;
  /** The global declarations the slice's lines read (≤ `SLICE_DECLARATION_CHARS`), line-numbered. */
  declarations: string;
  /** How many declarations were cut by the budget. */
  declarationsCut: number;
  /** Up to three call sites with their actual parameters. */
  callSites: Array<{ line: number; caller: string | null; text: string }>;
  /** Lines masked as belonging to a dropped rule. */
  masked: Array<{ line: number; rule: string }>;
  chars: number;
  lines: number;
}

/* -------------------------------------------------------------- markers */

/** A fill region in an engine-written file: `U02` (a body) or `U02.G0506` (a guard predicate). */
export interface FillRegion {
  regionId: string;
  unitId: string;
  /** Guard id for a predicate region, else null. */
  guard: string | null;
  file: string;
  /** First 8 hex characters of sha256 over the region's engine-owned text (§9.1). */
  hash: string;
  /** Indentation of the marker lines. */
  indent: string;
  /** The stub between the markers as the engine wrote it. */
  stub: string;
}

export interface BodyGuardContext {
  track: 'node' | 'rap';
  /** Names the body may call: helpers, callees, guard wrappers. */
  available: readonly string[];
  /** Names the answer declares beyond `available`; only those also on the allowlist count. */
  needs?: readonly string[];
  /** Characters of the unit's ABAP slice (rule 5: at most 4× that). */
  sliceChars: number;
  /** Guard wrappers the stub calls before the marker; a body may not shadow them. */
  guardCalls?: readonly string[];
  /** Guards the body must call (placement `body`); a body that skips one, or writes its condition inline, is refused. */
  required?: readonly RequiredGuard[];
  /**
   * Parameters of the region's own signature beyond the step parameters every body has (`sel`, `st`, `record`, …):
   * `values` for the predicate of a derived check (`when_G0345(sel, st, record, values)`). A member call on one
   * (`values.lvCode.trim()`) reads the region's input and is no foreign call.
   */
  params?: readonly string[];
  /**
   * The fields of the region's parameters typed by a closed interface of the scaffold (`type-shapes.ts`):
   * `{ sel: […], st: […], args: […] }`. A body reading `st.gt_effects` when RunState has no such field is refused,
   * as `tsc` would refuse it — the name was invented (A/B 13.10.2026, defect D).
   */
  shapes?: Readonly<Record<string, readonly string[]>>;
  /**
   * RAP only (scaffold version 6): the names the logic class declares around this region — a body that calls a
   * method the class or the access interface does not have, or reads an original's global, selection input or
   * parameter-like name the class does not declare, is refused (`scaffold-rap.ts`, `rap-contract.ts`).
   */
  abap?: AbapRegionNames;
}

/** The names a RAP fill region can reach (scaffold version 6). Lower case. */
export interface AbapRegionNames {
  /** Instance attributes and constants: the original's globals, selection inputs and constants, the engine's own. */
  attributes: string[];
  /** The parameters of the region's method. */
  params: string[];
  /** Every method of the logic class. */
  methods: string[];
  /** The methods of the access interface (`mo_access->…`). */
  access: string[];
  /**
   * The tables the package ships itself (lower case). A body's SELECT on any other customer table is refused
   * (3.0.13, acceptance run 14.10.2026); absent on a scaffold before version 7.
   */
  tables?: string[];
  /** Customer tables the original reads → the access method that reads them (`zmm_vend_block` → `read_zmm_vend_block`). */
  customerReads?: Record<string, string>;
  /** Customer tables the original writes → the access method that writes them (`zmm_po_appr` → `write_zmm_po_appr`; acceptance run 4). */
  customerWrites?: Record<string, string>;
  /**
   * SAP tables the access layer reads or writes → the row type the logic class declares for each (`vbak` →
   * `ty_vbak_row`), null where it declares none. ABAP Cloud has no type of an SAP table: a body that types data by one
   * is refused, naming the row type (scaffold version 11, the first SAP activation, 15.10.2026).
   */
  sapTypes?: Record<string, string | null>;
  /** SAP tables the access layer reads → the access method that reads them (`vbak` → `read_vbak`). */
  sapReads?: Record<string, string>;
}

/**
 * The typed contract of the RAP logic class (scaffold version 6, roadmap 3.0.13 item 2): what a fill request
 * names per unit and what the body guards check. Absent on the Node track and on an older scaffold.
 */
export interface RapClassContract {
  logicClass: string;
  /** The refusal exception a body raises where the original refuses (`MESSAGE … TYPE 'E'`). */
  refusal: string;
  /** `METHODS check_stamp IMPORTING iv_stamp TYPE ty_stamp CHANGING cv_code TYPE ty_code.` by region id. */
  signatures: Record<string, string>;
  /** The declarations a unit's body reads — types, constants, attributes, callee and predicate signatures, access methods — by unit id. */
  unitTypes: Record<string, string>;
  regions: Record<string, AbapRegionNames>;
  /** Per carried guard id: its predicate, the call a body writes, and who calls it. */
  guards: Record<string, { predicate: string; call: string; calledBy: 'engine' | 'body'; written: 'engine' | 'model' }>;
  /** `custom-entity` for a program that writes no table, `managed-bo` for one that does. */
  architecture: 'custom-entity' | 'managed-bo';
}

/** A guard a fill body must call at the original's position. */
export interface RequiredGuard {
  id: string;
  /** The function the body calls: `guard_BR_004_G0066` (Node) / `when_g0066` (RAP). */
  helper: string;
  line: number;
  op: string | null;
  literals: string[];
}

export type BodyRefusalCode =
  | 'marker'
  | 'module-syntax'
  | 'declaration'
  | 'unbalanced'
  | 'unterminated'
  | 'guard-shadowed'
  | 'foreign-call'
  | 'too-long'
  | 'binary-number'
  | 'guard-missing'
  | 'guard-inlined'
  | 'unknown-field'
  | 'cloud-statement'
  | 'unknown-name'
  | 'sap-select'
  | 'customer-select'
  | 'customer-write'
  | 'sap-type';

export interface BodyRefusal {
  code: BodyRefusalCode;
  message: string;
}

/** One answered region for the splice. */
export interface RegionBody {
  regionId: string;
  body: string;
}

export interface SpliceResult {
  /** False when the candidate is refused: the digest of engine-written text changed, or a marker is broken. */
  ok: boolean;
  reason: string | null;
  files: ScaffoldFile[];
  applied: string[];
  /** Regions whose body was refused — their stub stays. */
  refused: Array<{ regionId: string; reasons: BodyRefusal[] }>;
  digest: string;
}

/* ------------------------------------------------------------- scaffold */

export interface ScaffoldFile {
  path: string;
  content: string;
  /** `fill` — the file holds fill regions; everything outside them is still engine text. */
  owner: 'engine' | 'fill';
}

export interface Scaffold {
  track: 'node' | 'rap';
  version: number;
  files: ScaffoldFile[];
  units: Unit[];
  regions: FillRegion[];
  /** sha256 over every engine-owned character — all files, fill regions excluded (§9.3). */
  digest: string;
  /** acceptance-adapter.json (Node only). */
  adapter: AcceptanceAdapter | null;
  notCarried: NotCarried[];
  /** What a fill may call, per region (helpers, callees, guard wrappers) — the `available` of the prompt (§8.2). */
  available: Record<string, string[]>;
  /** The guards each body region must call (placement `body`); `spliceBodies` applies them. */
  required: Record<string, RequiredGuard[]>;
  /** RAP only, since scaffold version 6: the logic class's typed contract. */
  rap?: RapClassContract;
}

/** The harness adapter (`docs/failure-patterns/README.md`, `scripts/acceptance/run.mjs`). */
export interface AcceptanceAdapter {
  package: string;
  modules: Record<string, string>;
  probes: Record<string, unknown>;
}

/* ---------------------------------------------------------------- trace */

export type FilledBy = 'engine' | 'model' | 'model-repair-1' | 'model-repair-2' | 'model-repair-3' | 'not-filled';

export interface TraceUnit {
  unitId: string;
  fn: string;
  file: string;
  title: string;
  kind: UnitKind;
  abap: AbapRange[];
  rules: Array<{ id: string; decision: RuleDecision; proposal?: string }>;
  guards: string[];
  filledBy: FilledBy;
  /** Check results per unit, set by Track C's verify (§13); null until then. */
  checks: { lint: number | null; cases: number | null; probes: number | null };
  /** Why the body is a stub, or which check still fails on it (step E, §16.1); absent when neither. */
  note?: string | null;
}

export interface Trace {
  format: 'clean-core.traceability/1';
  program: string | null;
  sourceSha256: string;
  contextDigest: string | null;
  scaffoldVersion: number;
  planDigest: string;
  scaffoldDigest: string;
  /** The run the package was built from (§12.3), when known. */
  runId: string | null;
  /** Every engine-written function too, so every function maps to ABAP lines or says it has none. */
  functions: Array<{ name: string; file: string; owner: 'engine' | 'fill'; unitId: string | null; abap: Array<{ lineStart: number; lineEnd: number }>; rules: string[] }>;
  units: TraceUnit[];
  notCarried: NotCarried[];
  openRules: string[];
  droppedRules: string[];
  /** 3.0.13 (6, A4): the golden master — the original's demo cases carried as test data (ABAP Unit `ltc_golden_master`, or Node's test/fixtures/original-demo.json), and whether their rows reach the logic. Absent when none was written. */
  goldenMaster?: { cases: number; rowsPassed: boolean; carrier?: 'abap-unit' | 'node-test' };
  /** How the generation went (step E): written, repaired, not written with the reason, the checks. Absent on the scaffold alone. */
  generation?: {
    /** See `GenerationStatus`. */
    status: GenerationStatus;
    /** Node route (3.0.13): what of the type check, engine cases and probes did not run — why the status is `not-verified`. */
    unverified?: string[];
    units: number;
    written: number;
    repaired: number;
    notWritten: Array<{ unitId: string; reason: string }>;
    /** `passed`, `notRun`, `scope` and the reasons since the honest count (step E); absent in an older trace. */
    checks: Array<{ kind: string; total: number; failed: number; passed?: number; notRun?: number; scope?: 'engine-code' | 'fills'; notRunReason?: string | null; baseThrew?: string | null }>;
    notRun: Array<{ kind: string; reason: string }>;
    scaffoldFindings: string[];
    callsUsed: number;
    rounds: number;
  };
}

/**
 * The status of an engine-led generation. `complete`: every function written and nothing below holds;
 * `partial`: a function left as a stub; `not-activatable` (3.0.13, ABAP route): abaplint's parser or syntax
 * errors were left; `not-runnable` (3.0.13, Node route): the TypeScript compiler, with the package's own
 * tsconfig.json, finds type errors; `not-verified` (3.0.13, Node route): every function written and compiling,
 * but the type check, the engine cases or the probes did not run (or ran in part) — never evidence.
 */
export type GenerationStatus = 'complete' | 'partial' | 'not-activatable' | 'not-runnable' | 'not-verified';

/** What Track C reports per region after the fills, for `traceOf`. */
export interface FillOutcome {
  regionId: string;
  state: 'model' | 'model-repair-1' | 'model-repair-2' | 'model-repair-3' | 'refused' | 'unusable' | 'not-sent';
}

/* --------------------------------------------------------- fill contract */

/**
 * The fill request and answer (§8.2). Track C builds and validates them
 * (`lib/transformation/fill-prompt.ts`); the shapes live here so the plan,
 * the splice and the prompt cannot drift.
 */
export interface FillRequestUnit {
  unitId: string;
  function: { name: string; file: string; signature: string; returns: string };
  /** `text` is the slice with original line numbers ("0500 FORM validate_policy."); declarations and call sites as `sliceFor` cuts them. */
  abap: { ranges: AbapRange[]; text: string; declarations?: string; callSites?: AbapSlice['callSites'] };
  /** DROP rules are never listed (§6.4). */
  rules: Array<{ id: string; decision: Exclude<RuleDecision, 'drop'>; text: string; proposal?: string }>;
  /**
   * The unit's guards. `placement`: `entry` — the stub calls it before the marker; `body` — the body must call it at
   * the original's line, handing in `values` (derived checks; `bodyGuards` refuses a body without the call or with
   * the condition inline); `selection` — run before any step. `regionId` is the predicate the unit writes.
   */
  guards: Array<{
    id: string;
    rule: string | null;
    helper: string;
    condition: string;
    effect: string;
    line?: number;
    regionId?: string | null;
    placement?: PlanGuard['placement'];
    basis?: PlanGuard['basis'];
    values?: string[];
  }>;
  facts: { decimals: Array<{ name: string; digits: number; decimals: number; type: string }> };
  available: { helpers: string[]; callees: string[] };
  /**
   * The declarations of the types the signature and the callees' signatures name, with the types they name one
   * level down — as the scaffold writes them (`type-shapes.ts`), so a body reads fields that exist (Node only).
   */
  types?: string;
}

/** A repair round's addition to a unit (§13.2 step 3). */
export interface FillRepair {
  unitId: string;
  round: 1 | 2 | 3;
  /** ≤ 2,000 characters. */
  failure: string;
  previousBody: string | null;
}

export interface FillRequest {
  schema: 'cc.fill.v1';
  track: 'node' | 'rap';
  program: string | null;
  context: string;
  rules: string;
  units: FillRequestUnit[];
  repair: FillRepair[] | null;
}

export interface FillAnswerUnit {
  unitId: string;
  /** Statements only — the body of the unit's function (region `unitId`). */
  body: string;
  /** Predicate bodies by guard id (`G-0506` → region `U02.G0506`): statements returning whether the original's condition holds. */
  guards?: Record<string, string>;
  needs: string[];
  refused: { reason: string } | null;
}

export interface FillAnswer {
  units: FillAnswerUnit[];
}

/* -------------------------------------------------------------- events */

/** A context slot key (Track A, `CONTEXT_SLOTS`); a string until that module lands. */
export type ContextSlotKey = string;

/** §15.5 — Track C emits, Track D renders. */
export type GenerationEvent =
  | { t: 'slot'; slot: ContextSlotKey; state: 'loading' | 'loaded' | 'missing' | 'stale'; at: number }
  | { t: 'scaffold'; units: number; guards: number; decimals: number; inputs: number; cases: number; ms: number }
  | {
      t: 'fill';
      unitId: string;
      /** `waiting-slot`: the server said `lease-busy` and the call waits for a free slot (13.10.2026). */
      state: 'writing' | 'waiting-slot' | 'written' | 'refused' | 'unusable';
      at: number;
      /** Why, in words, on `refused` / `unusable` — the reason the unit carries. */
      reason?: string;
      /** The code of the failure (`lib/transformation/error-codes.ts`) and the HTTP status, when there was one. */
      code?: string;
      status?: number;
    }
  /** One model call begins or ends — what the remaining-time estimate is read from. `admitted`: the server counted it. */
  | { t: 'call'; callId: number; state: 'start' | 'end'; at: number; admitted?: boolean }
  | {
      t: 'check';
      /** `abap` (3.0.13): abaplint's parser and syntax check of an ABAP candidate. */
      kind: 'guards' | 'lint' | 'cases' | 'probes' | 'formats' | 'abap' | 'types';
      total: number;
      failed: number;
      /** Split of `total` (step E): passed, failed, not run — absent on the guards and the lints. */
      passed?: number;
      notRun?: number;
      /** Who decides the outcome: engine-written code, or the written functions (orchestrator `CheckScope`). */
      scope?: 'engine-code' | 'fills';
      notRunReason?: string | null;
      baseThrew?: string | null;
      ms: number;
    }
  | { t: 'repair'; round: 1 | 2 | 3; unitIds: string[]; state: 'start' | 'done'; fixed?: number }
  | { t: 'fallback'; reason: string }
  | { t: 'stored' }
  | { t: 'failed'; message: string };
