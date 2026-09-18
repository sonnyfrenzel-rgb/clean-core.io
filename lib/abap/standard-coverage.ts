import { deriveBusinessRules, type BusinessRule, type BusinessRuleSet } from './business-rule-set';
import { readStatements } from './statement-reader';
import { readBlocks, containerAt } from './block-structure';
import { readTableDependencies } from './table-dependencies';
import {
  fitOfLevel,
  levelFromEvidence,
  scopeItemLabel,
  LEVEL_REASON,
  type EvidenceLevelValue,
  type StandardEvidence,
} from '../evidence-level';
import type { ObjectStatusValue } from '../object-status';
import type { ProvenanceValue } from '../provenance';

/**
 * Standard coverage per capability — roadmap 7.2, mockup screen `s3`.
 *
 * The question this answers is the one a reader actually has: *of the decisions
 * this program makes, which ones does SAP standard already make, and how well do
 * we know that?* The answer is a table of capabilities, each carrying an
 * evidence level E0–E4 from `lib/evidence-level.ts` — and the levels are the
 * point. 7.6 ("what changes for users") and 7.8 ("adaptation options on the
 * element") both read the level off this table rather than deriving a second
 * one, which is why the ladder lives in `evidence-level.ts` next to the
 * vocabulary and not in here.
 *
 * ## What a capability is, and why it is that
 *
 * **A capability is the set of business rules that decide the same subject.**
 * `deriveBusinessRules` (roadmap 3.4) already reads the decisions out of the
 * source as `BR-nnn`, each with the field it tests — `gs_eban-waers`,
 * `lv_dev_pct`, `gv_amount` — and two thresholds on one field are two rules
 * about one capability. `LV_DAYS_OLD` in the shipped 1,000-line example is
 * exactly that: `BR-009` and `BR-010` are one capability with two numbers in it.
 *
 * The grouping is deliberately *exact*, on the subject as the engine read it.
 * `gs_eban-waers` and `gs_eban-dispo` stay two capabilities although both are
 * fields of the requisition, because folding them into "the requisition" is a
 * judgement about business meaning and nothing in the source says it. The label
 * is therefore the subject **as written** — code, not a business name, the same
 * rule `BusinessRule.label` keeps. A plain-language name is roadmap 7.8's job
 * and arrives with the *Model proposal* provenance on it.
 *
 * A rule whose subject the engine could not read (`subjectKind:
 * 'not-derivable'`) belongs to no capability and is listed under `unassigned`
 * with that reason, the way `BusinessRule.withoutProcessElement` names why a
 * rule reaches no element. It is not quietly dropped and it is not given a
 * capability of its own.
 *
 * ## Where the evidence comes from
 *
 * **Catalogue (E1, and no higher).** A capability's rules stand in routines;
 * those routines read and write SAP objects; SAP's cloudification catalogue
 * names released successors for some of those objects. That chain is real and
 * every link of it has a line number — but it is a statement about *an object*,
 * not about the decision the rule makes. So it is E1 and the wording says what
 * it is: a pointer to check. Only `read` and `write` accesses count. A `TABLES`
 * declaration or a type reference at program level is not this capability
 * touching that data, and counting it would hand every program-level constant
 * the entire table list of the program.
 *
 * **Scope items (E1, and no higher).** There is no scope-item catalogue in this
 * repository, and this module does not contain one. A scope item can therefore
 * only arrive as supplied input — from the account, or from an import — and it
 * arrives as an ID with `— to verify` written after it wherever it is shown.
 * Nothing here derives, guesses or completes one.
 *
 * **Everything above E1 is supplied too.** Documentation (E2) is named by the
 * account; a demonstration (E3) is a counter-check receipt from roadmap 7.3,
 * which does not exist yet; acceptance in the target system (E4) is the
 * account's own declaration. Until those steps are built, a project analysed
 * here produces E0 and E1 and nothing else, and that is the honest reading
 * rather than a limitation to work around.
 *
 * ## What it refuses to say
 *
 * A capability whose objects have no catalogue entry comes out **E0, fit
 * `null`, provenance *Not determined*, with the reason written out** — never
 * "not supported", never "no standard exists", never a red status. SAP's
 * catalogue lists what SAP has published; a gap in it is a gap in the list. The
 * same holds when no catalogue was consulted at all: `catalogConsulted` says so
 * and the reason names it, because "we did not ask" and "we asked and there was
 * nothing" are two different sentences and only one of them is about SAP.
 *
 * Nothing in here writes anywhere and nothing calls a model. The same source
 * and the same catalogue give the same table.
 */

/* ------------------------------------------------------------------ input */

/**
 * The catalogue, as this module needs it — one question, injected.
 *
 * `lib/abap/catalog-service.ts` carries four megabytes of generated JSON and is
 * server-only; the screens that read a coverage table are client components.
 * Passing the lookup in keeps this module free of that weight and lets the guard
 * hand it a catalogue with exactly one entry in it.
 */
export interface CatalogLookup {
  /** The released successor SAP's catalogue names for this object, or `null`. */
  successorFor(objectName: string): string | null;
}

/** A scope item as it is supplied: an ID and where it came from. Never derived. */
export interface SuppliedScopeItem {
  /** The SAP Best Practices scope item ID, e.g. `18J`. */
  id: string;
  /** Who or what supplied it — an account, an import. Never empty. */
  source: string;
  /** What SAP calls it, when the supplier said. Never invented here. */
  names?: string;
}

/**
 * Evidence a caller holds that this module cannot read out of the source.
 *
 * Keyed by `StandardCapability.key` — the normalised subject — rather than by
 * `CAP-nn`. The numbers renumber when a rule is inserted above another; the
 * subject does not.
 */
export interface SuppliedEvidence {
  scopeItems?: readonly SuppliedScopeItem[];
  /**
   * Documentation, demonstration and target-system evidence. A caller may pass
   * catalogue or scope-item entries here too and gain nothing by it: the
   * ceilings in `evidence-level.ts` apply to every item whatever channel it
   * arrived through.
   */
  evidence?: readonly StandardEvidence[];
}

export interface CoverageOptions {
  catalog?: CatalogLookup;
  /** Keyed by `StandardCapability.key`. */
  supplied?: Readonly<Record<string, SuppliedEvidence>>;
}

/* ----------------------------------------------------------------- output */

/** An SAP object a capability's routines read or write, with the line it stands on. */
export interface CapabilityObject {
  /** Upper-cased, as the dependency reader gives it. */
  name: string;
  access: 'read' | 'write';
  /** `L61`. */
  anchor: string;
  /** The routine the access stands in, or `null` at program level. */
  routine: string | null;
}

/** A standard candidate the catalogue named for one of the capability's objects. */
export interface StandardCandidate {
  /** The object the catalogue was asked about. */
  object: string;
  /** The released successor the catalogue names. */
  successor: string;
  /** The line the object is read or written on. */
  anchor: string;
  /** Always the catalogue. Kept explicit so a second source cannot slip in unlabelled. */
  source: string;
}

/** A scope item on a capability — always carrying its `— to verify`. */
export interface ScopeItemRef {
  id: string;
  /** `18J — to verify`. The only spelling it is ever shown in. */
  label: string;
  source: string;
  /** What SAP calls it, when the supplier said so. `null` otherwise — never filled in. */
  names: string | null;
}

/** Why a capability's fit could not be determined. */
export type CoverageNotDeterminedReason =
  /** Nothing names a standard candidate at all. */
  | 'no-evidence'
  /** A catalogue entry or a scope item points somewhere and nobody has followed it. */
  | 'pointer-only';

/** Why a rule belongs to no capability. */
export type UnassignedReason = 'subject-not-derivable';

export interface StandardCapability {
  /** `CAP-01`, in order of the first rule that decides this subject. */
  id: string;
  /** The normalised subject — the stable key supplied evidence is filed under. */
  key: string;
  /** The subject as the source writes it. Code, not a business name. */
  label: string;
  /** `BR-nnn`, in order. */
  ruleIds: string[];
  objects: CapabilityObject[];
  candidates: StandardCandidate[];
  scopeItems: ScopeItemRef[];
  /** Every piece of evidence behind the level, catalogue and scope items included. */
  evidence: StandardEvidence[];
  level: EvidenceLevelValue;
  /** How far the fit is established. `null` at E0 and E1 — see `notDetermined`. */
  fit: ObjectStatusValue | null;
  fitProvenance: ProvenanceValue;
  /** Set exactly when `fit` is `null`. */
  notDetermined: { reason: CoverageNotDeterminedReason; detail: string } | null;
  /** The check task that would move this on (roadmap 7.5). `null` only at E4. */
  next: string | null;
}

export interface StandardCoverage {
  program: string | null;
  capabilities: StandardCapability[];
  unassigned: Array<{ ruleId: string; reason: UnassignedReason; detail: string }>;
  counts: {
    capabilities: number;
    /** Capabilities the catalogue named a candidate for. */
    withCandidate: number;
    /** Capabilities whose fit is not determined — E0 and E1 together. */
    notDetermined: number;
    byLevel: Record<EvidenceLevelValue, number>;
    scopeItems: number;
  };
  /** True when there is no source to read at all — a different thing from zero capabilities. */
  noSource: boolean;
  /** False when no catalogue was passed. Then E0 is about this reading, not about SAP. */
  catalogConsulted: boolean;
}

/* ------------------------------------------------------------- derivation */

const EMPTY_COUNTS = (): StandardCoverage['counts'] => ({
  capabilities: 0,
  withCandidate: 0,
  notDetermined: 0,
  byLevel: { E0: 0, E1: 0, E2: 0, E3: 0, E4: 0 },
  scopeItems: 0,
});

/** The reason a rule with no readable subject carries, in the reader's words. */
const SUBJECT_NOT_DERIVABLE =
  'The field this rule decides could not be read out of the code, so it is not filed under a capability. It is still a decision somebody made.';

/**
 * Standard coverage for one ABAP source.
 *
 * Pass a catalogue to get catalogue candidates; without one the table is still
 * correct, and every capability says that no catalogue was consulted rather than
 * that SAP has nothing.
 */
export function deriveStandardCoverage(
  source: string,
  options: CoverageOptions = {},
): StandardCoverage {
  if (typeof source !== 'string' || !source.trim()) {
    return {
      program: null,
      capabilities: [],
      unassigned: [],
      counts: EMPTY_COUNTS(),
      noSource: true,
      catalogConsulted: Boolean(options.catalog),
    };
  }
  return coverageFrom(deriveBusinessRules(source), objectsByRoutine(source), options);
}

/**
 * The same table for a caller that already derived the rules — the analysis
 * pipeline holds them — so the source is not parsed twice.
 */
export function deriveStandardCoverageFrom(
  source: string,
  ruleSet: BusinessRuleSet,
  options: CoverageOptions = {},
): StandardCoverage {
  return coverageFrom(ruleSet, objectsByRoutine(source), options);
}

/* ------------------------------------------------------------- the pieces */

type RoutineKey = string;

/** Program level. A routine name is upper-cased and cannot collide with this. */
const PROGRAM_LEVEL: RoutineKey = '(program)';

/**
 * Which SAP objects each routine reads or writes, with the line of the access.
 *
 * `reference` accesses are left out on purpose: a `TABLES` statement or a type
 * reference names a structure, it does not touch the data. In the shipped
 * purchase-requisition example nine objects are referenced in one `TABLES`
 * block at program level, and counting those would give the three program-level
 * constants a standard candidate each, drawn from data they never read.
 */
function objectsByRoutine(source: string): Map<RoutineKey, CapabilityObject[]> {
  const out = new Map<RoutineKey, CapabilityObject[]>();
  if (typeof source !== 'string' || !source.trim()) return out;

  const containers = readBlocks(readStatements(source)).containers;
  for (const dep of readTableDependencies(source).dependencies) {
    if (dep.access !== 'read' && dep.access !== 'write') continue;
    const routine = containerAt(containers, dep.line)?.name ?? null;
    const key = routine ? routine.toUpperCase() : PROGRAM_LEVEL;
    const list = out.get(key) ?? [];
    list.push({ name: dep.table, access: dep.access, anchor: `L${dep.line}`, routine });
    out.set(key, list);
  }
  return out;
}

/** The subject of the rule — the field it decides — normalised for grouping. */
function subjectOf(rule: BusinessRule): string | null {
  const subject = rule.parameters[0]?.subject;
  return typeof subject === 'string' && subject.trim().length > 0 ? subject : null;
}

/**
 * The `StandardCapability.key` this rule belongs to, or `null` when its subject
 * is not readable — the same rule `coverageFrom` files rules under `unassigned` by.
 *
 * Exported because roadmap 7.3 files a counter-check scenario under the same
 * key, and two copies of "which capability is this" would be two answers the day
 * one of them changed.
 */
export function capabilityKeyOf(rule: BusinessRule): string | null {
  const subject = subjectOf(rule);
  return subject === null ? null : subject.toUpperCase();
}

/** The routines a rule stands in, upper-cased; program level when it names none. */
function routinesOf(rule: BusinessRule): RoutineKey[] {
  const keys = new Set<RoutineKey>();
  for (const src of rule.sources) {
    keys.add(src.routine ? src.routine.toUpperCase() : PROGRAM_LEVEL);
  }
  if (keys.size === 0) keys.add(PROGRAM_LEVEL);
  return [...keys];
}

function coverageFrom(
  ruleSet: BusinessRuleSet,
  byRoutine: Map<RoutineKey, CapabilityObject[]>,
  options: CoverageOptions,
): StandardCoverage {
  const catalog = options.catalog ?? null;
  const supplied = options.supplied ?? {};

  const order: string[] = [];
  const grouped = new Map<string, { label: string; rules: BusinessRule[] }>();
  const unassigned: StandardCoverage['unassigned'] = [];

  for (const rule of ruleSet.rules) {
    const subject = subjectOf(rule);
    const key = capabilityKeyOf(rule);
    if (subject === null || key === null) {
      unassigned.push({ ruleId: rule.id, reason: 'subject-not-derivable', detail: SUBJECT_NOT_DERIVABLE });
      continue;
    }
    const group = grouped.get(key);
    if (group) group.rules.push(rule);
    else {
      grouped.set(key, { label: subject, rules: [rule] });
      order.push(key);
    }
  }

  const capabilities = order.map((key, index) =>
    buildCapability(key, index, grouped.get(key)!, byRoutine, catalog, supplied[key]),
  );

  const counts = EMPTY_COUNTS();
  counts.capabilities = capabilities.length;
  for (const capability of capabilities) {
    counts.byLevel[capability.level] += 1;
    if (capability.candidates.length > 0) counts.withCandidate += 1;
    if (capability.notDetermined) counts.notDetermined += 1;
    counts.scopeItems += capability.scopeItems.length;
  }

  return {
    program: ruleSet.program,
    capabilities,
    unassigned,
    counts,
    noSource: false,
    catalogConsulted: Boolean(catalog),
  };
}

function buildCapability(
  key: string,
  index: number,
  group: { label: string; rules: BusinessRule[] },
  byRoutine: Map<RoutineKey, CapabilityObject[]>,
  catalog: CatalogLookup | null,
  supplied: SuppliedEvidence | undefined,
): StandardCapability {
  const id = `CAP-${String(index + 1).padStart(2, '0')}`;

  // The objects the routines these rules stand in read or write, de-duplicated
  // on object + access + line so one routine holding two rules is not counted
  // twice.
  const objects: CapabilityObject[] = [];
  const seen = new Set<string>();
  for (const rule of group.rules) {
    for (const routine of routinesOf(rule)) {
      for (const object of byRoutine.get(routine) ?? []) {
        const mark = `${object.name}|${object.access}|${object.anchor}`;
        if (seen.has(mark)) continue;
        seen.add(mark);
        objects.push(object);
      }
    }
  }

  // Catalogue candidates. One per object the catalogue answers for, at the line
  // the object is touched — so the reader can check the claim, which is all an
  // E1 claim is good for.
  const candidates: StandardCandidate[] = [];
  const answered = new Set<string>();
  if (catalog) {
    for (const object of objects) {
      if (answered.has(object.name)) continue;
      const successor = catalog.successorFor(object.name);
      if (!successor) continue;
      answered.add(object.name);
      candidates.push({
        object: object.name,
        successor,
        anchor: object.anchor,
        source: "SAP's cloudification catalogue",
      });
    }
  }

  const scopeItems: ScopeItemRef[] = (supplied?.scopeItems ?? []).map((item) => ({
    id: item.id.trim(),
    label: scopeItemLabel(item.id),
    source: item.source,
    names: typeof item.names === 'string' && item.names.trim().length > 0 ? item.names : null,
  }));

  const evidence: StandardEvidence[] = [
    ...candidates.map(
      (candidate): StandardEvidence => ({
        kind: 'catalog-successor',
        reference: `${candidate.object} → ${candidate.successor}`,
        source: candidate.source,
        anchor: candidate.anchor,
      }),
    ),
    ...scopeItems.map(
      (item): StandardEvidence => ({
        kind: 'scope-item',
        reference: item.label,
        source: item.source,
      }),
    ),
    ...(supplied?.evidence ?? []),
  ];

  const level = levelFromEvidence(evidence);
  const fit = fitOfLevel(level);

  return {
    id,
    key,
    label: group.label,
    ruleIds: group.rules.map((rule) => rule.id),
    objects,
    candidates,
    scopeItems,
    evidence,
    level,
    fit: fit.status,
    fitProvenance: fit.provenance,
    notDetermined:
      fit.status === null
        ? {
            reason: level === 'E0' ? 'no-evidence' : 'pointer-only',
            detail: notDeterminedDetail(level, objects, Boolean(catalog)),
          }
        : null,
    next: nextTask(level, group.label, candidates, scopeItems),
  };
}

/**
 * The sentence under a *Not determined*.
 *
 * Three different absences, and they get three different sentences. The one
 * thing none of them says is that the standard does not cover this: no reading
 * of an empty catalogue row supports that, and 7.2 names it as the mistake to
 * avoid.
 */
function notDeterminedDetail(
  level: EvidenceLevelValue,
  objects: readonly CapabilityObject[],
  catalogConsulted: boolean,
): string {
  if (level !== 'E0') return LEVEL_REASON.E1;
  if (!catalogConsulted) {
    return 'No catalogue was consulted for this reading, so nothing is known either way about a standard candidate.';
  }
  if (objects.length === 0) {
    return `${LEVEL_REASON.E0} The routines these rules stand in read and write no SAP object, so there was nothing to ask the catalogue about.`;
  }
  return LEVEL_REASON.E0;
}

/** What would move this capability on — a task, never a verdict (roadmap 7.5). */
function nextTask(
  level: EvidenceLevelValue,
  label: string,
  candidates: readonly StandardCandidate[],
  scopeItems: readonly ScopeItemRef[],
): string | null {
  switch (level) {
    case 'E0':
      return `Name the standard process or the scope item to check “${label}” against.`;
    case 'E1': {
      const pointer =
        scopeItems[0]?.label ??
        (candidates[0] ? `${candidates[0].object} → ${candidates[0].successor}` : null);
      return pointer
        ? `Follow ${pointer} and record what SAP documents for this capability.`
        : 'Follow the pointer and record what SAP documents for this capability.';
    }
    case 'E2':
      return 'Run a counter-check scenario for this capability.';
    case 'E3':
      return 'Accept in the target system, or record what differed.';
    case 'E4':
      return null;
  }
}
