/**
 * What the *Standard fit* layer shows — mockup screen `s3`, roadmap 7.2/7.3/7.6/7.7.
 *
 * Built on the server by `GET /api/projects/{id}/standard-fit`, because the one
 * input a browser cannot have is SAP's cloudification catalogue (four megabytes,
 * server-only, `lib/abap/catalog-service.ts`). Everything here is the engine's
 * own derivation, cut down to what the table and its rail read:
 *
 *   - the capabilities of `deriveStandardCoverage` — one row per set of rules
 *     that decide the same subject, with its evidence level E0–E4;
 *   - the counter-check scenarios of 7.3, the "what changes for users" records
 *     of 7.6 and the compliance hints of 7.7, as counts and short lists.
 *
 * **What it never does** is the reason it exists as a module of its own:
 *
 *   - **no scope item is invented.** There is no scope-item catalogue in this
 *     repository; `standard-coverage.ts` only carries one that somebody
 *     supplied, and nobody can supply one yet. So every row says what the
 *     product actually knows — a catalogue successor for an object the rules
 *     read or write (E1, "a pointer, not a fit"), or nothing — and the table
 *     says once, in words, that scope items are not determined;
 *   - **a missing catalogue hit is never "not supported".** E0 and E1 carry no
 *     fit at all, only *Not determined* with the reason;
 *   - **no level above E1 is produced here**, because documentation (E2), a
 *     demonstration (E3) and acceptance (E4) are evidence somebody supplies, and
 *     none has been supplied.
 *
 * The capability's name is the plain wording of its subject
 * (`humaniseField`, deterministic) with the subject as written one level down.
 */
import type { StandardCoverage, StandardCapability } from './abap/standard-coverage';
import type { CounterCheckScenarios } from './abap/counter-check';
import type { UserChangeReport } from './abap/user-change';
import type { ComplianceReviewReport } from './compliance-review-hints';
import type { EvidenceLevelValue } from './evidence-level';
import type { ObjectStatusValue } from './object-status';
import type { ProvenanceValue } from './provenance';

export const STANDARD_FIT_FORMAT_VERSION = 1;

export interface FitCandidate {
  /** The SAP object the capability's rules read or write. */
  object: string;
  /** What SAP's catalogue names as its released successor. */
  successor: string;
  /** The line the object is read or written on. */
  anchor: string;
}

export interface FitRow {
  /** `CAP-01`. */
  id: string;
  /** The normalised subject — the stable key. */
  key: string;
  /** The subject in plain words, or null when the wording has none. */
  name: string | null;
  /** The subject as the source writes it. */
  technical: string;
  ruleIds: string[];
  /** Catalogue successors for objects the rules read or write — at most E1. */
  candidates: FitCandidate[];
  /** Scope items somebody supplied. Always empty today; shown with "— to verify" when not. */
  scopeItems: string[];
  /** The SAP objects the rules read or write, with their lines. */
  objects: Array<{ name: string; access: 'read' | 'write'; anchor: string }>;
  level: EvidenceLevelValue;
  fit: ObjectStatusValue | null;
  fitProvenance: ProvenanceValue;
  /** `no-evidence` or `pointer-only` when `fit` is null. */
  notDetermined: 'no-evidence' | 'pointer-only' | null;
  /** The check task that would move this on, as the engine writes it. */
  next: string | null;
}

export interface StandardFitView {
  formatVersion: number;
  program: string | null;
  rows: FitRow[];
  /** Rules whose subject could not be read, with the reason. */
  unassigned: Array<{ ruleId: string; detail: string }>;
  counts: StandardCoverage['counts'];
  catalogConsulted: boolean;
  scenarios: {
    total: number;
    runnable: number;
    blocked: number;
    withoutScenario: number;
    items: Array<{ id: string; ruleId: string; title: string; blocked: boolean }>;
  };
  users: {
    total: number;
    trainingHints: number;
    pointers: number;
    items: Array<{ id: string; subject: string; anchor: string | null; today: string | null; future: string | null }>;
  };
  compliance: {
    examined: number;
    hints: Array<{ title: string; tables: string[]; concerns: string[] }>;
    unrecognised: number;
  };
}

/** How many items a list carries over the wire. The counts carry the rest. */
export const FIT_LIST_LIMIT = 12;

function rowOf(cap: StandardCapability, name: (subject: string, ruleIds: readonly string[]) => string | null): FitRow {
  return {
    id: cap.id,
    key: cap.key,
    name: name(cap.label, cap.ruleIds),
    technical: cap.label,
    ruleIds: [...cap.ruleIds],
    candidates: cap.candidates.map((c) => ({ object: c.object, successor: c.successor, anchor: c.anchor })),
    scopeItems: cap.scopeItems.map((s) => s.label),
    objects: cap.objects.map((o) => ({ name: o.name, access: o.access, anchor: o.anchor })),
    level: cap.level,
    fit: cap.fit,
    fitProvenance: cap.fitProvenance,
    notDetermined: cap.notDetermined?.reason ?? null,
    next: cap.next,
  };
}

/** The view, from the four derivations of one source. Pure. */
export function buildStandardFitView(input: {
  coverage: StandardCoverage;
  scenarios: CounterCheckScenarios;
  users: UserChangeReport;
  compliance: ComplianceReviewReport;
  /**
   * The plain name of a capability, or null — the subject in plain words, or
   * the plain phrase of its first rule; bound to the source by the caller.
   */
  name: (subject: string, ruleIds: readonly string[]) => string | null;
}): StandardFitView {
  const { coverage, scenarios, users, compliance } = input;
  return {
    formatVersion: STANDARD_FIT_FORMAT_VERSION,
    program: coverage.program,
    rows: coverage.capabilities.map((cap) => rowOf(cap, input.name)),
    unassigned: coverage.unassigned.map((u) => ({ ruleId: u.ruleId, detail: u.detail })),
    counts: coverage.counts,
    catalogConsulted: coverage.catalogConsulted,
    scenarios: {
      total: scenarios.counts.scenarios,
      runnable: scenarios.counts.runnable,
      blocked: scenarios.scenarios.filter((s) => s.blocked !== null).length,
      withoutScenario: scenarios.counts.withoutScenario,
      items: scenarios.scenarios.slice(0, FIT_LIST_LIMIT).map((s) => ({
        id: s.id,
        ruleId: s.ruleId,
        title: s.title,
        blocked: s.blocked !== null,
      })),
    },
    users: {
      total: users.counts.records,
      trainingHints: users.counts.trainingHints,
      pointers: users.counts.carrierFutureDetermined,
      items: users.records.slice(0, FIT_LIST_LIMIT).map((r) => ({
        id: r.id,
        subject: r.subject.label,
        anchor: r.subject.anchor,
        today: r.carrierToday.statement,
        future: r.carrierFuture.statement,
      })),
    },
    compliance: {
      examined: compliance.examined,
      hints: compliance.hints.map((h) => ({
        title: h.title,
        tables: h.tables.map((t) => t.table),
        concerns: h.concerns.map(String),
      })),
      unrecognised: compliance.unrecognised.length,
    },
  };
}

export function isStandardFitView(value: unknown): value is StandardFitView {
  const v = value as StandardFitView | null;
  return (
    !!v
    && v.formatVersion === STANDARD_FIT_FORMAT_VERSION
    && Array.isArray(v.rows)
    && Array.isArray(v.unassigned)
    && !!v.scenarios
    && !!v.users
    && !!v.compliance
  );
}
