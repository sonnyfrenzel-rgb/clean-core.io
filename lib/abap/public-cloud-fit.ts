/**
 * Public-Cloud-Fit and the four buckets — roadmap 6.7, `DESIGN.md` §5.6 (ADR-033,
 * Sonny 15.09.2026).
 *
 * Sorts one ABAP object into Retire · Keep · Rebuild · Blocked by SAP, or leaves
 * it unassigned with a reason. The rule table below is ADR-033 transcribed, not
 * reinterpreted — every branch cites the German sentence it implements so a
 * reader can check the code against the design doc line by line:
 *
 *   | # | Bucket          | Rule                                                              | Evidence at the object              |
 *   |---|-----------------|--------------------------------------------------------------------|--------------------------------------|
 *   | 1 | Retire          | the rule this object serves is confirmed "Drop" — OR the usage    | decision with revision · or usage   |
 *   |   |                 | import shows zero executions over at least 13 months              | import                              |
 *   | 2 | Blocked by SAP  | needed, Level C or D, an SAP catalog object with no released       | entry in the Cloudification Repo    |
 *   |   |                 | successor and no extension path                                   |                                      |
 *   | 3 | Rebuild         | needed, Level C or D, and there IS a successor or extension path —| successor API · BAdI · finding      |
 *   |   |                 | as well as every modification and every own write access to an    |                                      |
 *   |   |                 | SAP table: that is the project's own work, never SAP's            |                                      |
 *   | 4 | Keep            | needed and permitted for the project's target platform: Public    | level and target platform           |
 *   |   |                 | Edition only level A, Private Edition level A or B                |                                      |
 *   | — | not assigned    | level unknown or not determined                                    | with reason                         |
 *
 * "The first applicable rule wins" (ADR-033) — this module checks them in that
 * order and returns on the first match. Two things this table does NOT reduce
 * to a single, uniform "Level C or D" test, on purpose:
 *
 *   - **The bucket depends on the target platform.** The same level-B object is
 *     Keep in the Private Edition and Rebuild-or-Blocked in the Public Edition
 *     (DESIGN.md §5.6: "Dasselbe B-Objekt ist in der Private Edition Keep, in
 *     der Public Edition Rebuild oder Blocked by SAP"). Rather than hard-coding
 *     "C or D" as the Blocked/Rebuild threshold — which would be silently wrong
 *     for that exact B-on-Public-Edition case the design doc calls out by name —
 *     this module derives the threshold from `isKeepEligible()`: whatever does
 *     not clear Keep's bar for the chosen platform is what Blocked/Rebuild then
 *     split between them. For a Private Edition project that bar is C/D exactly
 *     as ADR-033 states it; for a Public Edition project it also catches B,
 *     which is the behaviour the design doc's own example requires.
 *   - **A modification or an own write to an SAP table is Rebuild even where a
 *     catalog successor exists**, because the roadmap brief states the
 *     precedence explicitly ("eine Modifikation ist Rebuild, niemals Blocked")
 *     and because Blocked exists to separate SAP's unfinished roadmap from the
 *     project's own unfinished work — a modification is always the latter.
 *
 * No imports beyond one constant from `usage-model.ts` (also import-free), for
 * the same reason `abcd-classification.ts` and `process-states.ts` give: the
 * server-side resolver that reads the catalog and the client panel that renders
 * the buckets both load this file, so it must pull in neither the multi-
 * megabyte catalog JSON nor `next/server`. `RETIREMENT_WINDOW_DAYS` is imported
 * rather than repeated as a second "13 months" constant, because two copies of
 * the same threshold are how a future change makes them disagree silently.
 *
 * **Honesty (roadmap 6.7, and the guards it names):** an assignment is either a
 * bucket WITH the evidence it rests on, or `bucket: null` WITH the reason it
 * could not be concluded. There is no default bucket for missing data — not
 * here, and not in the resolver that feeds this module.
 */

import { RETIREMENT_WINDOW_DAYS } from './usage-model';

export type CloudReadinessGrade = 'A' | 'B' | 'C' | 'D' | 'Unknown';

/** `Project.s4Deployment` (`lib/types.ts`) — passed through unchanged, no relabelling layer to drift from it. */
export type TargetPlatform = 'public' | 'private';

export type PublicCloudFitBucket = 'retire' | 'blocked-by-sap' | 'rebuild' | 'keep';

/** The four, in the order DESIGN.md §5.6 lists them. */
export const PUBLIC_CLOUD_FIT_BUCKETS: readonly PublicCloudFitBucket[] = Object.freeze([
  'retire',
  'blocked-by-sap',
  'rebuild',
  'keep',
]);

export const PUBLIC_CLOUD_FIT_BUCKET_LABELS: Record<PublicCloudFitBucket, string> = Object.freeze({
  retire: 'Retire',
  'blocked-by-sap': 'Blocked by SAP',
  rebuild: 'Rebuild',
  keep: 'Keep',
});

export const TARGET_PLATFORM_LABELS: Record<TargetPlatform, string> = Object.freeze({
  public: 'Public Edition',
  private: 'Private Edition',
});

/**
 * A confirmed Drop decision (`lib/process-states.ts`, roadmap 3.5) for the rule
 * or process element this object serves.
 *
 * Nothing in this repository currently links a specific ABAP object — a table,
 * a class — to the `BR-nnn` rule or BPMN element id `process-states.ts`
 * confirms against. That link is a future roadmap step, not something this
 * module invents: a caller that has it fills this in; a caller that does not
 * passes `null`, and rule 1's Drop branch simply never fires for that object,
 * which is the honest behaviour — not a guess standing in for the missing link.
 */
export interface ObjectDropDecision {
  /** `BR-nnn` or a BPMN element id — the subject `process-states.ts` confirmed against. */
  subject: string;
  revision: number;
  confirmedAt: string;
  accountName: string;
}

/**
 * What the usage import (`lib/abap/usage-model.ts`, roadmap E03-F02/CR-24) knows
 * about one object — narrowed to exactly the facts Retire's transparency rule
 * needs: source, declared period, and the measured-zero verdict itself.
 *
 * `windowFrom`/`windowTo`/`windowDays` are the DECLARED monitoring window
 * (`UsageReport.window`), never the span between first and last execution seen
 * — a report with no declared window carries no usable evidence here, the same
 * position `usage-join.ts`'s `zeroMeansDormant` takes.
 */
export interface ObjectUsageEvidence {
  source: 'scmon' | 'upl' | 'st03n' | 'manual';
  windowFrom: string;
  windowTo: string;
  windowDays: number;
  /** A MEASURED zero — `UsageRecord.callCount === 0`, never an absent count read as one. */
  zeroExecutions: boolean;
}

/**
 * What the Cloudification Repository says about this object, once graded.
 *
 * `hasPath` is the negation of `catalog-service.ts`'s `hasNoReleasedApiPath()`:
 * a released successor OR an SAP-provided extension path. That function is
 * already the single place this repository decides "no way forward" for an
 * object, so Blocked-vs-Rebuild reads it rather than re-deriving the same
 * verdict from `state` and successor lists a second time.
 */
export interface ObjectCatalogEvidence {
  /** verbatim SAP state, when the object carries one — 'released' | 'deprecated' | 'notToBeReleased' | 'classicAPI' | 'noAPI'. */
  state?: string;
  hasPath: boolean;
}

/** `abcd-classification.ts`'s `GradeProvenance`, repeated here rather than imported — see the file header. */
export type PublicCloudFitLevelProvenance = 'catalog' | 'catalog-residual' | 'own-object' | 'heuristic';

export interface PublicCloudFitObjectInput {
  objectName: string;
  /** A–D from the catalog/heuristic grading, or 'Unknown' — never invented when the grading returned none. */
  level: CloudReadinessGrade;
  levelProvenance: PublicCloudFitLevelProvenance;
  /** A confirmed Drop decision for the rule/element this object serves, or `null` — see `ObjectDropDecision`. */
  dropDecision: ObjectDropDecision | null;
  /** What the usage import knows about this object, or `null` when none was imported or the object was not in it. */
  usage: ObjectUsageEvidence | null;
  /** What the Cloudification Repository says, or `null` when the object carries no catalog data at all. */
  catalog: ObjectCatalogEvidence | null;
  /** A modification marker was found on this object (`*{ INSERT|REPLACE|DELETE`, ARCHITECTURE.md §4.3). */
  hasModification: boolean;
  /** The project's own code writes directly to this SAP table (`standard-table-write`, `evidence-model.ts`). */
  hasOwnWriteAccess: boolean;
}

export type PublicCloudFitRule =
  | 'retire-drop'
  | 'retire-zero-usage'
  | 'blocked-no-path'
  | 'rebuild-own-work'
  | 'rebuild-path'
  | 'keep-platform-level';

export type PublicCloudFitReasonCode =
  | 'level-not-determined'
  | 'target-platform-not-set'
  | 'catalog-evidence-missing';

export interface PublicCloudFitReason {
  code: PublicCloudFitReasonCode;
  /** A full sentence, never a code alone — this is what a reader sees. */
  detail: string;
}

export interface PublicCloudFitAssignment {
  objectName: string;
  /** `null` means "not assigned" — never a default bucket standing in for missing evidence. */
  bucket: PublicCloudFitBucket | null;
  rule: PublicCloudFitRule | null;
  /** Present exactly when `bucket` is not null — the "Beleg am Objekt" column of ADR-033, as a sentence. */
  evidence: string | null;
  /** Present exactly when `bucket` is null. */
  reason: PublicCloudFitReason | null;
  /**
   * A usage-derived caveat shown alongside whatever bucket was concluded —
   * never a bucket by itself. DESIGN.md §5.6: "Weniger als 13 Monate ergeben
   * nie Retire, sondern 'Usage window too short: 4 months — needs 13.'" A
   * short window does not block Keep/Rebuild/Blocked from being concluded on
   * other grounds; it only explains why usage did not, by itself, retire it.
   */
  usageNote: string | null;
}

/** Roughly a calendar month; only used for the sentence a reader reads, never for the >= 13-months decision itself. */
function monthsBetween(days: number): number {
  return Math.round(days / 30.44);
}

/** Whether a declared window (inclusive) contains at least one 31 December. */
function windowIncludesYearEnd(from: string, to: string): boolean {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return false;
  const startYear = new Date(start).getUTCFullYear();
  const endYear = new Date(end).getUTCFullYear();
  for (let year = startYear; year <= endYear; year += 1) {
    const dec31 = Date.parse(`${year}-12-31T00:00:00Z`);
    if (dec31 >= start && dec31 <= end) return true;
  }
  return false;
}

/**
 * "Usage window too short: 4 months — needs 13" (DESIGN.md §5.6), attached
 * whenever a measured zero exists but the declared window cannot yet call it
 * disuse. Silent (`null`) once the window is long enough — rule 1 already
 * states that case in full, and repeating it here would be the same fact
 * twice rather than a second one.
 */
function usageNoteFor(usage: ObjectUsageEvidence | null): string | null {
  if (!usage || !usage.zeroExecutions) return null;
  if (usage.windowDays >= RETIREMENT_WINDOW_DAYS) return null;
  return `Usage window too short: ${monthsBetween(usage.windowDays)} months — needs 13.`;
}

/**
 * Keep's platform-dependent bar (ADR-033 #4): level A always qualifies; level B
 * qualifies only in the Private Edition. Exported because the Blocked/Rebuild
 * split below is defined as "whatever this returns false for" — see the file
 * header on why that is not the same as a hard-coded "C or D".
 */
export function isKeepEligible(level: CloudReadinessGrade, platform: TargetPlatform): boolean {
  if (level === 'A') return true;
  if (level === 'B') return platform === 'private';
  return false;
}

/**
 * Assign one object to a Public-Cloud-Fit bucket, or leave it unassigned with a
 * reason. `platform` is `null` when the project has not declared a target
 * deployment yet — Retire can still be concluded (it does not depend on the
 * platform); nothing else can.
 */
export function assignPublicCloudFit(
  input: PublicCloudFitObjectInput,
  platform: TargetPlatform | null,
): PublicCloudFitAssignment {
  const objectName = input.objectName;
  const usageNote = usageNoteFor(input.usage);

  // Rule 1 — Retire. Checked first and unconditionally, per "the first
  // applicable rule wins": a confirmed Drop or a long-enough measured zero
  // settles the object regardless of level, catalog data, or even a target
  // platform nobody has chosen yet.
  if (input.dropDecision) {
    const d = input.dropDecision;
    return {
      objectName,
      bucket: 'retire',
      rule: 'retire-drop',
      evidence: `Confirmed Drop for ${d.subject} (revision ${d.revision}, confirmed by ${d.accountName} on ${d.confirmedAt.slice(0, 10)}).`,
      reason: null,
      usageNote,
    };
  }
  if (input.usage?.zeroExecutions && input.usage.windowDays >= RETIREMENT_WINDOW_DAYS) {
    const u = input.usage;
    const yearEnd = windowIncludesYearEnd(u.windowFrom, u.windowTo);
    return {
      objectName,
      bucket: 'retire',
      rule: 'retire-zero-usage',
      evidence:
        `No executions in ${u.source.toUpperCase()}, ${u.windowFrom} to ${u.windowTo} `
        + `(${monthsBetween(u.windowDays)} months${yearEnd ? ', includes year-end close' : ''}).`,
      reason: null,
      usageNote: null, // the sentence above already says it; a second note would repeat it
    };
  }

  // Everything past Retire needs a level — a level nobody could determine is
  // "not assigned", never a guessed bucket (roadmap 6.7 honesty rule; see also
  // `tests/unearned-verdicts-guard.spec.ts`).
  if (input.level === 'Unknown') {
    return {
      objectName,
      bucket: null,
      rule: null,
      evidence: null,
      reason: {
        code: 'level-not-determined',
        detail:
          'No clean-core level could be assigned to this object. Provide risk/criticality data or import '
          + 'ATC findings before a Public-Cloud-Fit bucket can be concluded — never a default bucket for a '
          + 'level that is not known.',
      },
      usageNote,
    };
  }

  // Keep, Rebuild and Blocked all read the level against the target platform —
  // without one chosen, none of the three can be concluded either.
  if (!platform) {
    return {
      objectName,
      bucket: null,
      rule: null,
      evidence: null,
      reason: {
        code: 'target-platform-not-set',
        detail:
          'The project has no target platform yet. Keep, Rebuild and Blocked by SAP all depend on it '
          + '(Public Edition allows only level A; Private Edition allows A or B) — set the target deployment '
          + 'before these buckets can be concluded.',
      },
      usageNote,
    };
  }

  // Rule 4 — Keep.
  if (isKeepEligible(input.level, platform)) {
    return {
      objectName,
      bucket: 'keep',
      rule: 'keep-platform-level',
      evidence: `Level ${input.level}, permitted for ${TARGET_PLATFORM_LABELS[platform]}.`,
      reason: null,
      usageNote,
    };
  }

  // Below the platform's bar. A modification or a direct write to an SAP table
  // is Rebuild whatever the catalog says — checked before the catalog path so
  // it can never be shadowed by a coincidentally-available successor (roadmap
  // 6.7: "eine Modifikation ist Rebuild, niemals Blocked").
  if (input.hasModification) {
    return {
      objectName,
      bucket: 'rebuild',
      rule: 'rebuild-own-work',
      evidence:
        'A modification was detected in the code (ARCHITECTURE.md §4.3) — a modification is always Rebuild, never Blocked.',
      reason: null,
      usageNote,
    };
  }
  if (input.hasOwnWriteAccess) {
    return {
      objectName,
      bucket: 'rebuild',
      rule: 'rebuild-own-work',
      evidence: "The code writes directly to this SAP table — that access is the project's own work, never SAP's.",
      reason: null,
      usageNote,
    };
  }

  // Blocked by SAP exists to separate SAP's unfinished roadmap from the
  // project's own unfinished work (roadmap 6.7), so it is concluded only for a
  // real catalog object — never for the project's own code or a heuristic
  // estimate, which fall to Rebuild by elimination below.
  const isCatalogObject = input.levelProvenance === 'catalog' || input.levelProvenance === 'catalog-residual';
  if (isCatalogObject) {
    if (!input.catalog) {
      return {
        objectName,
        bucket: null,
        rule: null,
        evidence: null,
        reason: {
          code: 'catalog-evidence-missing',
          detail:
            `${objectName} was graded from the Cloudification Repository, but no successor/extension-path `
            + 'lookup was supplied for it — Blocked and Rebuild cannot be told apart without it.',
        },
        usageNote,
      };
    }
    if (!input.catalog.hasPath) {
      return {
        objectName,
        bucket: 'blocked-by-sap',
        rule: 'blocked-no-path',
        evidence:
          'No released successor and no extension path in the Cloudification Repository'
          + (input.catalog.state ? ` (state: ${input.catalog.state}).` : '.'),
        reason: null,
        usageNote,
      };
    }
    return {
      objectName,
      bucket: 'rebuild',
      rule: 'rebuild-path',
      evidence:
        'A successor or extension path exists in the Cloudification Repository'
        + (input.catalog.state ? ` (state: ${input.catalog.state})` : '')
        + " — making the move is the project's own work.",
      reason: null,
      usageNote,
    };
  }

  // Not a catalog object at all: the project's own code, or a heuristic
  // estimate. Needed and below the platform's bar is the project's own
  // homework, never SAP's — Rebuild by elimination, not by a guessed catalog
  // verdict.
  return {
    objectName,
    bucket: 'rebuild',
    rule: 'rebuild-own-work',
    evidence:
      `Level ${input.level} (${input.levelProvenance}) is below what ${TARGET_PLATFORM_LABELS[platform]} keeps `
      + "— this is the project's own object, not an SAP catalog entry, so rebuilding it is the project's own work.",
    reason: null,
    usageNote,
  };
}

export interface PublicCloudFitSummary {
  targetPlatform: TargetPlatform | null;
  counts: Record<PublicCloudFitBucket, number> & { notAssigned: number };
  /** Object names in 'blocked-by-sap' — listed, because ADR-033 states this as a per-object fact, never a threshold. */
  blockingObjects: string[];
  /** True as soon as one object is Blocked by SAP: "ein Objekt ... blockiert die Public-Cloud-Entscheidung" (DESIGN.md §5.6) — no percentage. */
  decisionBlocked: boolean;
  /** Set when the project has no usage import at all: Retire is then reachable only through a confirmed Drop decision, never through "no usage known". */
  usageImportCaveat: string | null;
}

/**
 * Aggregate a project's assignments into the four bucket counts, the objects
 * that block a Public-Cloud decision, and the honesty caveats a summary card
 * has to carry (roadmap 6.7's "say so in the output rather than guessing").
 */
export function summarizePublicCloudFit(
  assignments: readonly PublicCloudFitAssignment[],
  opts: { targetPlatform: TargetPlatform | null; usageImported: boolean },
): PublicCloudFitSummary {
  const counts: PublicCloudFitSummary['counts'] = { retire: 0, 'blocked-by-sap': 0, rebuild: 0, keep: 0, notAssigned: 0 };
  const blockingObjects: string[] = [];
  for (const a of assignments) {
    if (a.bucket) {
      counts[a.bucket] += 1;
      if (a.bucket === 'blocked-by-sap') blockingObjects.push(a.objectName);
    } else {
      counts.notAssigned += 1;
    }
  }
  return {
    targetPlatform: opts.targetPlatform,
    counts,
    blockingObjects,
    decisionBlocked: blockingObjects.length > 0,
    usageImportCaveat: opts.usageImported
      ? null
      : 'No usage import exists for this project. Retire can only be concluded from a confirmed Drop decision, never from unknown usage.',
  };
}

/**
 * The answer sentence a card leads with (ADR-029: "erst die Antwort, dann die
 * Zahl") — e.g. "4 objects block a Public Cloud decision." Never a percentage:
 * the design doc is explicit that this statement needs no threshold.
 */
export function publicCloudFitHeadline(summary: PublicCloudFitSummary): string {
  if (!summary.targetPlatform) return 'Target platform not set — Public-Cloud-Fit cannot be concluded yet.';
  const platformLabel = TARGET_PLATFORM_LABELS[summary.targetPlatform];
  if (summary.decisionBlocked) {
    const n = summary.blockingObjects.length;
    return `${n} object${n === 1 ? '' : 's'} block${n === 1 ? 's' : ''} a ${platformLabel} decision.`;
  }
  return `No object without a path blocks a ${platformLabel} decision.`;
}
