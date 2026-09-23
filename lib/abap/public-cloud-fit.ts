/**
 * Public-Cloud-Fit and the four buckets — roadmap 6.7, `DESIGN.md` §5.6
 * (ADR-033, Sonny 15.09.2026), with CR-17 and CR-18 applied.
 *
 * Sorts one ABAP object into Retire · No catalogued path · Rebuild · Keep, or
 * leaves it unassigned with a reason. The rule table below is ADR-033
 * transcribed, not reinterpreted — every branch cites the sentence it
 * implements so a reader can check the code against the design doc line by
 * line:
 *
 *   | # | Bucket             | Rule                                                              | Evidence at the object              |
 *   |---|--------------------|-------------------------------------------------------------------|--------------------------------------|
 *   | 1 | Retire             | the rule this object serves is confirmed "Drop" — OR the usage    | decision with revision · or usage   |
 *   |   |                    | import shows zero executions over at least 13 months (the second  | import with its capture method      |
 *   |   |                    | is a *candidate*, an open check — CR-17)                          |                                      |
 *   | 2 | No catalogued path | needed, below the platform's bar, an SAP object for which the     | the two repository files, by name   |
 *   |   |                    | Cloudification Repository names no released API and no successor  | and sync date                        |
 *   | 3 | Rebuild            | needed, below the bar, and a successor or extension path IS named | successor API · BAdI · finding      |
 *   |   |                    | — as well as every modification and every own write access to an  |                                      |
 *   |   |                    | SAP table: that is the project's own work, never SAP's            |                                      |
 *   | 4 | Keep               | needed and permitted for the project's target platform: Public    | level and target platform           |
 *   |   |                    | Edition only level A, Private Edition level A or B                |                                      |
 *   | — | not assigned       | level unknown or not determined                                    | with reason                         |
 *
 * "The first applicable rule wins" (ADR-033) — this module checks them in that
 * order and returns on the first match.
 *
 * **Why the fourth bucket is not called "Blocked by SAP" (CR-18).** It was, and
 * that name is a verdict: it says the way forward is SAP's fault and SAP's
 * homework. The catalog does not support a verdict — it supports an *absence*.
 * SAP publishes no released API and no successor for the object, and that is a
 * gap in what is known, not a finding about anyone's code. "Blocked by SAP" is
 * a conclusion that needs three more things this engine does not have: a
 * confirmed business need, a target profile (roadmap 7.10) and alternatives
 * that were actually checked. So the bucket states the gap — *no catalogued
 * path* — and every object in it carries a `reviewTask`: something for a person
 * to find out, with the data basis and its date beside it so they know what was
 * looked at and how old it is.
 *
 * The difference a reader has to be able to see is **who has the work**:
 *
 *   Rebuild            — we know how. The catalog names a successor or an
 *                        extension path; moving to it is this project's work,
 *                        and it can be planned and costed.
 *   No catalogued path — nobody has named a way yet. The next step is a
 *                        question to ask, not work to schedule — and not a
 *                        defect in this code.
 *
 * `PUBLIC_CLOUD_FIT_BUCKET_MEANINGS` carries exactly that sentence per bucket,
 * so a surface prints the distinction rather than leaving it to a label.
 *
 * Two further things the rule table does NOT reduce to a single, uniform
 * "Level C or D" test, on purpose:
 *
 *   - **The bucket depends on the target platform.** The same level-B object is
 *     Keep in the Private Edition and Rebuild-or-no-path in the Public Edition
 *     (DESIGN.md §5.6: "Dasselbe B-Objekt ist in der Private Edition Keep, in
 *     der Public Edition Rebuild oder Blocked by SAP"). Rather than hard-coding
 *     "C or D" as the threshold — which would be silently wrong for that exact
 *     B-on-Public-Edition case the design doc calls out by name — this module
 *     derives it from `isKeepEligible()`: whatever does not clear Keep's bar for
 *     the chosen platform is what the path question then splits.
 *   - **A modification or an own write to an SAP table is Rebuild even where the
 *     catalog names no path, and even where the level would qualify for Keep**,
 *     because the roadmap states the precedence explicitly ("Modifikationen sind
 *     Rebuild") and because the fourth bucket exists to separate what nobody has
 *     answered yet from the project's own unfinished work — a modification is
 *     always the latter. The checked order is therefore **Retire · own work ·
 *     Keep · path question**: the level says what SAP permits, not what the
 *     project has already done to the object. It was Keep-first until
 *     f9695d22d124, and a level-A object with a modification came out as "Keep,
 *     nothing to do". Do not move it back.
 *
 * **Absence of a flag is not evidence of a path (CR-18, second half).**
 * `catalog-service.ts` answers one question — `hasNoReleasedApiPath()` — and a
 * `false` from it means "not flagged", which is only the same as "a path
 * exists" for an object the release file actually lists. For an object listed in
 * neither SAP file, `false` means nothing was looked up, because there is
 * nothing to look up. This module therefore takes a three-valued
 * `CatalogPathEvidence` rather than a boolean `hasPath`: the same mistake at
 * catalog scale is what let 367 objects with no released path read as
 * `clean-core-ready` (finding 20fe6d7b4308), and it was live here too — 8 of the
 * 31 objects the shipped examples sorted into Rebuild were told "a successor or
 * extension path exists in the Cloudification Repository" for objects the
 * repository has never heard of.
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
 * here, and not in the resolver that feeds this module. Nothing below computes
 * a percentage or a share; every figure a surface prints from here is a count of
 * objects this engine actually sorted.
 */

import { RETIREMENT_WINDOW_DAYS } from './usage-model';

export type CloudReadinessGrade = 'A' | 'B' | 'C' | 'D' | 'Unknown';

/** `Project.s4Deployment` (`lib/types.ts`) — passed through unchanged, no relabelling layer to drift from it. */
export type TargetPlatform = 'public' | 'private';

export type PublicCloudFitBucket = 'retire' | 'no-catalogued-path' | 'rebuild' | 'keep';

/** The four, in the order DESIGN.md §5.6 lists them. */
export const PUBLIC_CLOUD_FIT_BUCKETS: readonly PublicCloudFitBucket[] = Object.freeze([
  'retire',
  'no-catalogued-path',
  'rebuild',
  'keep',
]);

export const PUBLIC_CLOUD_FIT_BUCKET_LABELS: Record<PublicCloudFitBucket, string> = Object.freeze({
  retire: 'Retire',
  'no-catalogued-path': 'No catalogued path',
  rebuild: 'Rebuild',
  keep: 'Keep',
});

/**
 * One sentence per bucket saying **who has the work** — the distinction the
 * labels alone do not carry, and the reason the fourth bucket was renamed
 * (CR-18). A surface prints these next to the headings rather than inventing
 * its own wording, so "Rebuild" and "No catalogued path" cannot drift into
 * reading like two grades of the same failure.
 */
export const PUBLIC_CLOUD_FIT_BUCKET_MEANINGS: Record<PublicCloudFitBucket, string> = Object.freeze({
  retire: 'The object goes away. Nothing has to be built for it.',
  'no-catalogued-path':
    'Nobody has named a way yet. SAP publishes no released API and no successor for these objects, so the next step '
    + 'is a question someone has to answer — not work this project can plan, and not a fault in this code.',
  rebuild:
    'The way is known and the work sits with this project: SAP names a successor or an extension path to move to.',
  keep: 'The object stays as it is on the chosen platform. Nothing has to be built for it.',
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
 * What the Cloudification Repository can and cannot say about this object's way
 * forward. Three values, not a boolean — see the file header on why `false`
 * from `hasNoReleasedApiPath()` is not the same answer for a listed object as
 * for an unlisted one.
 *
 *   successor-named      the release file lists the object and the repository
 *                        carries a path for it: the object is released itself,
 *                        or a successor is named. A lookup that found something.
 *   none-named           the repository lists the object and names no successor
 *                        and no extension path — `hasNoReleasedApiPath()`.
 *   not-in-release-file  the release file, which is where a released successor
 *                        would be named, does not mention the object at all.
 *                        Nothing was looked up because nothing is listed.
 */
export type CatalogPathEvidence = 'successor-named' | 'none-named' | 'not-in-release-file';

export interface ObjectCatalogEvidence {
  /** verbatim SAP state, when the object carries one — 'released' | 'deprecated' | 'notToBeReleased' | 'classicAPI' | 'noAPI'. */
  state?: string;
  pathEvidence: CatalogPathEvidence;
  /**
   * Whether SAP's *classification* file (the second of the two, roadmap 7.9 /
   * CR-01) mentions the object. Used only to word the review task: "neither of
   * SAP's two files knows it" and "only the classification file knows it" are
   * different questions to go and ask.
   */
  listedInClassificationFile?: boolean;
}

/** One synced SAP repository file, as `getLevelRuleVersion()` publishes it. Verbatim; never a date this module made up. */
export interface CatalogSnapshot {
  /** file name as SAP publishes it, e.g. 'objectReleaseInfoLatest.json'. */
  file: string;
  /** date of the sync, YYYY-MM-DD. */
  syncedAt: string;
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
  /** What the Cloudification Repository can say, or `null` when no lookup was supplied at all. */
  catalog: ObjectCatalogEvidence | null;
  /** A modification marker was found on this object (`*{ INSERT|REPLACE|DELETE`, ARCHITECTURE.md §4.3). */
  hasModification: boolean;
  /** The project's own code writes directly to this SAP table (`standard-table-write`, `evidence-model.ts`). */
  hasOwnWriteAccess: boolean;
}

export type PublicCloudFitRule =
  | 'retire-drop'
  | 'retire-candidate-zero-usage'
  | 'no-catalogued-path-none-named'
  | 'no-catalogued-path-not-listed'
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
   * This assignment is an open question, not a settled answer: the bucket says
   * where the object stands today, and something still has to be found out
   * before anyone acts on it. True for every object in *No catalogued path*
   * (CR-18) and for a Retire candidate derived from usage (CR-17).
   */
  openCheck: boolean;
  /** Present exactly when `openCheck` — phrased as a task for a person, never as a grade on the code. */
  reviewTask: string | null;
  /** Whether SAP's repository knows this object at all. A project where nothing is listed says so in a word, not as a 0. */
  catalogListed: boolean;
  /**
   * A usage-derived caveat shown alongside whatever bucket was concluded —
   * never a bucket by itself. DESIGN.md §5.6: "Weniger als 13 Monate ergeben
   * nie Retire, sondern 'Usage window too short: 4 months — needs 13.'" A
   * short window does not block Keep/Rebuild/no-path from being concluded on
   * other grounds; it only explains why usage did not, by itself, retire it.
   */
  usageNote: string | null;
}

/** Roughly a calendar month; only used for the sentence a reader reads, never for the >= 13-months decision itself. */
function monthsBetween(days: number): number {
  return Math.round(days / 30.44);
}

/** Whether a declared window (inclusive) contains at least one 31 December. */
function windowSpansYearBoundary(from: string, to: string): boolean {
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
 * How the figure was captured — the "Erfassungsart" roadmap 6.7 asks a Retire
 * candidate to name next to source and period.
 *
 * It matters because none of the four is a complete record of what ran: a
 * monitor records while it is switched on, workload statistics aggregate, and a
 * hand-entered number was never a measurement. A reader deciding to retire code
 * on "no executions" needs to know which of those produced the zero.
 */
const USAGE_CAPTURE_METHOD: Record<ObjectUsageEvidence['source'], string> = Object.freeze({
  scmon: 'the ABAP Call Monitor (SCMON), which records calls only while it is switched on',
  upl: 'Usage Procedure Logging (UPL), which records calls only while it is switched on',
  st03n: 'workload statistics (ST03N), which aggregate workload rather than log each object',
  manual: 'a figure entered by hand, which is not a system measurement',
});

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
 * qualifies only in the Private Edition. Exported because the path question
 * below is defined as "whatever this returns false for" — see the file header
 * on why that is not the same as a hard-coded "C or D".
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
  // "Listed" is the repository's own knowledge of the object, not this module's
  // verdict about it: `catalog-residual` is `abcd-classification.ts`'s word for
  // an object in neither SAP file.
  const catalogListed = input.levelProvenance === 'catalog';

  const base = {
    objectName,
    bucket: null as PublicCloudFitBucket | null,
    rule: null as PublicCloudFitRule | null,
    evidence: null as string | null,
    reason: null as PublicCloudFitReason | null,
    openCheck: false,
    reviewTask: null as string | null,
    catalogListed,
    usageNote,
  };
  const settled = (
    bucket: PublicCloudFitBucket,
    rule: PublicCloudFitRule,
    evidence: string,
    extra: Partial<PublicCloudFitAssignment> = {},
  ): PublicCloudFitAssignment => ({ ...base, bucket, rule, evidence, ...extra });
  const open = (
    bucket: PublicCloudFitBucket,
    rule: PublicCloudFitRule,
    evidence: string,
    reviewTask: string,
  ): PublicCloudFitAssignment => settled(bucket, rule, evidence, { openCheck: true, reviewTask });
  const unassigned = (reason: PublicCloudFitReason): PublicCloudFitAssignment => ({ ...base, reason });

  // Rule 1 — Retire. Checked first and unconditionally, per "the first
  // applicable rule wins": a confirmed Drop or a long-enough measured zero
  // settles where the object stands regardless of level, catalog data, or even
  // a target platform nobody has chosen yet.
  if (input.dropDecision) {
    const d = input.dropDecision;
    return settled(
      'retire',
      'retire-drop',
      `Confirmed Drop for ${d.subject} (revision ${d.revision}, confirmed by ${d.accountName} on ${d.confirmedAt.slice(0, 10)}).`,
    );
  }
  if (input.usage?.zeroExecutions && input.usage.windowDays >= RETIREMENT_WINDOW_DAYS) {
    const u = input.usage;
    // CR-17, confirmed: a measured zero is a *candidate*, not a decision, and
    // the window spanning a 31 December is calendar arithmetic — the import
    // carries no field saying a year-end close actually ran in it. This used to
    // read "(13 months, includes year-end close)", which stated as observed the
    // one thing that made the retirement safe. DESIGN.md §5.6 still quotes that
    // older sentence; CR-17 is the later decision and wins.
    const spansYearBoundary = windowSpansYearBoundary(u.windowFrom, u.windowTo);
    return open(
      'retire',
      'retire-candidate-zero-usage',
      `No executions recorded from ${u.windowFrom} to ${u.windowTo} (${monthsBetween(u.windowDays)} months), `
        + `captured by ${USAGE_CAPTURE_METHOD[u.source]}.`
        + (spansYearBoundary
          ? ' The window spans a 31 December — that is calendar information; whether a year-end close ran in it is not part of this import.'
          : ''),
      'Retire candidate, not a decision: confirm with the business that nothing still depends on this object. '
        + 'An import that recorded no execution does not say the object is no longer needed.',
    );
  }

  // Everything past Retire needs a level — a level nobody could determine is
  // "not assigned", never a guessed bucket (roadmap 6.7 honesty rule; see also
  // `tests/unearned-verdicts-guard.spec.ts`).
  if (input.level === 'Unknown') {
    return unassigned({
      code: 'level-not-determined',
      detail:
        'No clean-core level could be assigned to this object. Provide risk/criticality data or import '
        + 'ATC findings before a Public-Cloud-Fit bucket can be concluded — never a default bucket for a '
        + 'level that is not known.',
    });
  }

  // Keep, Rebuild and the path question all read the level against the target
  // platform — without one chosen, none of the three can be concluded either.
  if (!platform) {
    return unassigned({
      code: 'target-platform-not-set',
      detail:
        'The project has no target platform yet. Keep, Rebuild and the catalogued-path question all depend on it '
        + '(Public Edition allows only level A; Private Edition allows A or B) — set the target deployment '
        + 'before these buckets can be concluded.',
    });
  }

  // Rule 3, own work — checked before Keep *and* before the path question.
  //
  // The rule table above says a modification and an own write access to an SAP
  // table are Rebuild, full stop: "das ist die Arbeit des Projekts, nie die von
  // SAP". This stood after `isKeepEligible`, so a level-A object the project had
  // modified came back as Keep — "nothing to do" for code that carries a
  // modification, the one sentence this module may never say (QA full review,
  // f9695d22d124). Being permitted for the platform says what SAP allows; it
  // says nothing about what the project has since done to the object. Retire
  // stays rule 1 above: a confirmed Drop or a measured zero settles the object
  // whether or not it was modified on the way out.
  if (input.hasModification) {
    return settled(
      'rebuild',
      'rebuild-own-work',
      'A modification was detected in the code (ARCHITECTURE.md §4.3). A modification is the project\'s own work, '
        + 'so it is always Rebuild — never an open question about SAP\'s catalogue.',
    );
  }
  if (input.hasOwnWriteAccess) {
    return settled(
      'rebuild',
      'rebuild-own-work',
      "The code writes directly to this SAP table — that access is the project's own work, never SAP's, "
        + 'so the way forward is known and sits here.',
    );
  }

  // Rule 4 — Keep.
  if (isKeepEligible(input.level, platform)) {
    return settled('keep', 'keep-platform-level', `Level ${input.level}, permitted for ${TARGET_PLATFORM_LABELS[platform]}.`);
  }

  // Below the platform's bar, and with no own work of its own to explain it.
  //
  // The fourth bucket exists to separate what nobody has answered yet from the
  // project's own unfinished work (roadmap 6.7), so it is reached only for an
  // SAP object — the project's own code and a heuristic estimate fall to
  // Rebuild by elimination below, where the work provably sits here.
  const isSapObject = input.levelProvenance === 'catalog' || input.levelProvenance === 'catalog-residual';
  if (isSapObject) {
    if (!input.catalog) {
      return unassigned({
        code: 'catalog-evidence-missing',
        detail:
          `${objectName} was graded against SAP's repository, but no successor/extension-path lookup was supplied `
          + 'for it — whether a path is catalogued cannot be told without one, and this module does not assume either answer.',
      });
    }
    const stateClause = input.catalog.state ? ` SAP's state for it: ${input.catalog.state}.` : '';

    if (input.catalog.pathEvidence === 'none-named') {
      return open(
        'no-catalogued-path',
        'no-catalogued-path-none-named',
        `SAP's Cloudification Repository lists this object and names no released successor and no extension path.${stateClause}`,
        'Ask SAP or your architect whether a released path exists that the repository does not yet name, and record the '
          + 'answer with its date. Until it is answered, this object has no catalogued way onto '
          + `${TARGET_PLATFORM_LABELS[platform]} — which is a gap in what SAP has published, not a finding about this code.`,
      );
    }

    if (input.catalog.pathEvidence === 'not-in-release-file') {
      const whereItIsKnown = input.catalog.listedInClassificationFile
        ? "Only SAP's classification file mentions it; the release file, which is where a released successor would be named, does not."
        : "Neither of SAP's two repository files mentions it.";
      return open(
        'no-catalogued-path',
        'no-catalogued-path-not-listed',
        `${whereItIsKnown} Nothing was looked up for it, because there is nothing listed to look up.${stateClause}`,
        'Check the object name against the current SAP release notes and confirm whether it is an SAP object at all. '
          + 'Being absent from the repository is not a statement that no path exists — it is the absence of a statement, '
          + 'and someone has to go and get one.',
      );
    }

    return settled(
      'rebuild',
      'rebuild-path',
      "SAP's Cloudification Repository names a released path for this object — a successor, or the object itself as a "
        + `released API.${stateClause} Making the move is known work and sits with this project.`,
    );
  }

  // Not an SAP object at all: the project's own code, or a heuristic estimate.
  // Needed and below the platform's bar is the project's own homework — Rebuild
  // by elimination, not by a guessed catalog verdict.
  return settled(
    'rebuild',
    'rebuild-own-work',
    `Level ${input.level} (${input.levelProvenance}) is below what ${TARGET_PLATFORM_LABELS[platform]} keeps `
      + "— this is the project's own object, not an SAP catalog entry, so rebuilding it is the project's own work.",
  );
}

export interface PublicCloudFitSummary {
  targetPlatform: TargetPlatform | null;
  counts: Record<PublicCloudFitBucket, number> & { notAssigned: number };
  /** Object names in 'no-catalogued-path' — listed, because ADR-033 states this as a per-object fact, never a threshold. */
  objectsWithoutCataloguedPath: string[];
  /** True as soon as one object has no catalogued path: "ein Objekt ... blockiert die Public-Cloud-Entscheidung" (DESIGN.md §5.6) — no percentage. */
  decisionBlocked: boolean;
  /** How many assignments are open questions rather than settled answers (CR-17, CR-18). A count of objects, not a share. */
  openCheckCount: number;
  /** How many objects SAP's repository knows at all. */
  catalogListedCount: number;
  /**
   * Set when the project has objects but none of them is in SAP's repository.
   * A word, not a zero: "0 without a catalogued path" would read as a clean
   * bill of health for a project the catalogue was never able to speak about.
   */
  noCatalogMatchNote: string | null;
  /** Set when the project has no usage import at all: Retire is then reachable only through a confirmed Drop decision, never through "no usage known". */
  usageImportCaveat: string | null;
  /** The synced SAP files behind every path statement above, or `null` when the caller could not supply them. */
  catalogBasis: CatalogSnapshot[] | null;
  /** The data basis and its date as one sentence (roadmap 6.7) — or, without one, the admission that the date is not available here. */
  catalogBasisNote: string;
}

/**
 * Aggregate a project's assignments into the four bucket counts, the objects
 * whose path nobody has named, and the honesty caveats a summary card has to
 * carry (roadmap 6.7's "say so in the output rather than guessing").
 */
export function summarizePublicCloudFit(
  assignments: readonly PublicCloudFitAssignment[],
  opts: {
    targetPlatform: TargetPlatform | null;
    usageImported: boolean;
    /** The synced repository files behind the path statements; omit or pass `null` rather than inventing a date. */
    catalogBasis?: readonly CatalogSnapshot[] | null;
  },
): PublicCloudFitSummary {
  const counts: PublicCloudFitSummary['counts'] = {
    retire: 0,
    'no-catalogued-path': 0,
    rebuild: 0,
    keep: 0,
    notAssigned: 0,
  };
  const objectsWithoutCataloguedPath: string[] = [];
  let openCheckCount = 0;
  let catalogListedCount = 0;
  for (const a of assignments) {
    if (a.bucket) {
      counts[a.bucket] += 1;
      if (a.bucket === 'no-catalogued-path') objectsWithoutCataloguedPath.push(a.objectName);
    } else {
      counts.notAssigned += 1;
    }
    if (a.openCheck) openCheckCount += 1;
    if (a.catalogListed) catalogListedCount += 1;
  }

  const basis = opts.catalogBasis && opts.catalogBasis.length ? [...opts.catalogBasis] : null;

  return {
    targetPlatform: opts.targetPlatform,
    counts,
    objectsWithoutCataloguedPath,
    decisionBlocked: objectsWithoutCataloguedPath.length > 0,
    openCheckCount,
    catalogListedCount,
    noCatalogMatchNote:
      assignments.length > 0 && catalogListedCount === 0
        ? "None of these objects is listed in SAP's Cloudification Repository, so every line below rests on the object's "
          + 'name and this code — not on a catalog entry.'
        : null,
    usageImportCaveat: opts.usageImported
      ? null
      : 'No usage import exists for this project. Retire can only be concluded from a confirmed Drop decision, never from unknown usage.',
    catalogBasis: basis,
    catalogBasisNote: basis
      ? `Data basis: ${basis.map((a) => `${a.file} (synced ${a.syncedAt})`).join(', ')}.`
      : "Data basis: SAP's Cloudification Repository. Its sync date is not available in this view — /facts names both "
        + 'files and the day each was last synced.',
  };
}

/**
 * The answer sentence a card leads with (ADR-029: "erst die Antwort, dann die
 * Zahl") — e.g. "4 objects have no catalogued path." Never a percentage: the
 * design doc is explicit that this statement needs no threshold.
 *
 * It names the open question rather than pronouncing a blockage on the code
 * (CR-18): what is blocked is the decision, and what blocks it is something
 * nobody has answered yet.
 */
export function publicCloudFitHeadline(summary: PublicCloudFitSummary): string {
  if (!summary.targetPlatform) return 'Target platform not set — Public-Cloud-Fit cannot be concluded yet.';
  const platformLabel = TARGET_PLATFORM_LABELS[summary.targetPlatform];
  if (summary.decisionBlocked) {
    const n = summary.objectsWithoutCataloguedPath.length;
    return `${n} object${n === 1 ? ' has' : 's have'} no catalogued path — that has to be answered before a ${platformLabel} decision.`;
  }
  return `No object is waiting on a catalogued path for a ${platformLabel} decision.`;
}
