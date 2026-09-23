/**
 * Wires the evidence engine's findings, the usage import and the Cloudification
 * Repository lookup into `public-cloud-fit.ts`'s pure rule table — roadmap 6.7.
 *
 * This file does NOT import `catalog-service.ts` (~5 MB of generated catalog
 * JSON, read at module load) — it used to, before roadmap "SAP-Katalog im
 * Browser-Bundle" found that `components/workspace/PublicCloudFitPanel.tsx`,
 * a client component, was shipping that JSON to the browser through exactly
 * this file. The grading and no-path lookups are `deps`, a REQUIRED
 * parameter with no default: the one real-catalog implementation lives at the
 * one call site allowed to import `catalog-service.ts` at all —
 * `/api/abcd-classify` (server-only) — and the client batches the same
 * questions through that route and passes a lookup over the answers. A test
 * that wants to check the WIRING — which finding kind sets
 * `hasOwnWriteAccess`, which usage fact becomes which `ObjectUsageEvidence` —
 * injects a fake and never touches the generated JSON or depends on a catalog
 * sync leaving today's fixtures true tomorrow.
 */

import type { EvidenceFinding } from './evidence-model';
import type { GradedObject, ObjectUse } from './abcd-classification';
import type { UsageReport } from './usage-model';
import {
  assignPublicCloudFit,
  summarizePublicCloudFit,
  type CatalogPathEvidence,
  type CatalogSnapshot,
  type ObjectCatalogEvidence,
  type ObjectDropDecision,
  type ObjectUsageEvidence,
  type PublicCloudFitAssignment,
  type PublicCloudFitObjectInput,
  type PublicCloudFitSummary,
  type TargetPlatform,
} from './public-cloud-fit';

/** The one finding shape this resolver reads — narrower than the full `EvidenceFinding`. */
export type PublicCloudFitFinding = Pick<EvidenceFinding, 'objectName' | 'kind'>;

/**
 * Which `EvidenceKind`s (`evidence-model.ts`) name a table use, and what use
 * they name. Kinds absent from this map (RFC calls, enhancements, …) still
 * register the object so it gets a level, just with no read/write use — which
 * is the same as not knowing the use at all (`gradeSapObjectUse(name, null)`).
 */
const USE_OF_KIND: Partial<Record<EvidenceFinding['kind'], ObjectUse>> = {
  'standard-table-read': 'read',
  'standard-table-write': 'write',
  'custom-table-write': 'write',
  'table-access': 'read', // fires for a READ of a customer's own table (evidence-model.ts's isCustom && !isWrite branch)
};

export interface PublicCloudFitResolverInput {
  findings: PublicCloudFitFinding[];
  /** `null` when no usage import exists for the project at all. */
  usageReport: UsageReport | null;
  /** `Project.s4Deployment`, unchanged — `null` when not yet chosen. */
  targetPlatform: TargetPlatform | null;
  /**
   * Confirmed Drop decisions, keyed by upper-cased object name.
   *
   * No part of this codebase currently links a `process-states.ts` rule or
   * element confirmation to a specific ABAP object (a table, a class) — that
   * link is a future roadmap step. A caller that has built one passes it here
   * and rule 1's Drop branch applies in full; every caller today passes `{}`,
   * and Retire is then reachable only through measured usage, which is the
   * honest state of the feature rather than a placeholder pretending to be a
   * lookup that does not exist yet.
   */
  dropDecisions?: Record<string, ObjectDropDecision>;
  /**
   * The synced SAP repository files behind every path statement, for the
   * "Datenbasis und Datum" roadmap 6.7 asks the fourth bucket to carry.
   * Omitted rather than filled with a plausible date when the caller does not
   * have it — `summarizePublicCloudFit` then says the date is not available
   * here instead of printing one nobody measured.
   */
  catalogBasis?: readonly CatalogSnapshot[] | null;
}

export interface ResolverDeps {
  gradeObjectUse: (name: string, use: ObjectUse | null) => GradedObject;
  hasNoPath: (name: string) => boolean;
}

/** One object's aggregated evidence from the findings list, before grading. */
interface ObjectFindingFacts {
  use: ObjectUse | null;
  hasModification: boolean;
  hasOwnWriteAccess: boolean;
}

/**
 * The findings, reduced to one row of facts per object — exported so a caller
 * that must gather a fact about each object BEFORE this resolver runs (the
 * client's `/api/abcd-classify` batch call, since this module takes the
 * catalog lookups as `deps` rather than fetching them) asks about exactly the
 * `{ name, use }` pairs the resolver itself will grade, not a guess at them.
 */
export function collectObjectFacts(findings: readonly PublicCloudFitFinding[]): Map<string, ObjectFindingFacts> {
  const byObject = new Map<string, ObjectFindingFacts>();
  for (const f of findings) {
    const name = (f.objectName || '').trim().toUpperCase();
    if (!name) continue;
    const facts = byObject.get(name) ?? { use: null, hasModification: false, hasOwnWriteAccess: false };
    if (f.kind === 'modification') facts.hasModification = true;
    // "Own write access to an SAP table" (ADR-033) is specifically a write to a
    // STANDARD table — writing to the project's own Z/Y table is ordinary and
    // does not, by itself, force a Rebuild.
    if (f.kind === 'standard-table-write') facts.hasOwnWriteAccess = true;
    const use = USE_OF_KIND[f.kind];
    // A write seen anywhere for this object is not downgraded to a read by a
    // later, unrelated finding — reads and writes both name the object, but a
    // write is the stricter reading `gradeSapObjectUse` expects when the two
    // disagree (mirrors `objectUseFromAccess`'s own "mixed access counts as a
    // write" rule).
    if (use === 'write' || (use && facts.use !== 'write')) facts.use = use;
    byObject.set(name, facts);
  }
  return byObject;
}

/**
 * What the catalog can say about one object's way forward.
 *
 * `hasNoPath` answers one question — `catalog-service.ts`'s
 * `hasNoReleasedApiPath()` — and a `false` from it is NOT "a path exists". It
 * is "not flagged", which only means a path exists for an object the release
 * file actually lists: `buildMerged()` flags a listed object whenever it is
 * neither released nor carries a successor, so listed-and-unflagged does mean a
 * path. For an object the release file never mentions, the same `false` means
 * nothing was looked up.
 *
 * The two used to collapse into one boolean, and the sentence the panel then
 * printed for an unlisted object — "a successor or extension path exists in the
 * Cloudification Repository" — cited an entry the repository does not have. It
 * is the same shape as the 367-object finding in `catalog-service.ts`
 * (20fe6d7b4308): absence of a flag read as evidence.
 *
 * `cloudView`/`classicView` (`abcd-classification.ts`) are the honest signal for
 * which file knows the object, and they already travel through
 * `/api/abcd-classify` with the grade, so this needs no second lookup.
 */
function pathEvidenceFor(graded: GradedObject, hasNoPath: boolean): CatalogPathEvidence {
  if (hasNoPath) return 'none-named';
  const inReleaseFile = graded.cloudView !== undefined && graded.cloudView !== 'unlisted';
  return inReleaseFile ? 'successor-named' : 'not-in-release-file';
}

/** One object's usage evidence, or `null` when the import carries nothing usable for it. */
function usageEvidenceFor(name: string, report: UsageReport | null): ObjectUsageEvidence | null {
  if (!report?.window) return null; // no DECLARED window — the same position usage-join.ts's zeroMeansDormant takes
  const record = report.records.find((r) => r.objectName.toUpperCase() === name);
  if (!record || record.callCount === null) return null; // no record, or an unmeasured one — never treated as a zero
  return {
    source: report.source,
    windowFrom: report.window.from,
    windowTo: report.window.to,
    windowDays: report.window.days,
    zeroExecutions: record.callCount === 0,
  };
}

/**
 * The `{ name, use }` pairs `resolvePublicCloudFit` will grade, in the shape
 * `/api/abcd-classify` accepts (`objects: Array<string | { name, use }>`).
 * Exported so a client caller can batch exactly these keys through the route
 * — and no others — rather than re-deriving which objects need a use-aware
 * grade and risking the two falling out of step.
 */
export function publicCloudFitLookupObjects(
  findings: readonly PublicCloudFitFinding[],
): { name: string; use: ObjectUse | null }[] {
  return [...collectObjectFacts(findings)].map(([name, f]) => ({ name, use: f.use }));
}

/**
 * Resolve one project's Public-Cloud-Fit assignments and summary from its
 * evidence findings, its usage import (if any) and its target platform.
 *
 * `deps` is required, not defaulted — see the file header on why this module
 * carries no catalog implementation of its own to fall back to.
 */
export function resolvePublicCloudFit(
  input: PublicCloudFitResolverInput,
  deps: ResolverDeps,
): { assignments: PublicCloudFitAssignment[]; summary: PublicCloudFitSummary } {
  const { gradeObjectUse, hasNoPath } = deps;
  const dropDecisions = input.dropDecisions ?? {};
  const facts = collectObjectFacts(input.findings);

  const assignments: PublicCloudFitAssignment[] = [];
  for (const [name, f] of facts) {
    const graded = gradeObjectUse(name, f.use);
    const catalog: ObjectCatalogEvidence = {
      state: graded.state,
      pathEvidence: pathEvidenceFor(graded, hasNoPath(name)),
      listedInClassificationFile: graded.classicView !== undefined && graded.classicView !== 'unlisted',
    };
    const objectInput: PublicCloudFitObjectInput = {
      objectName: name,
      level: graded.grade,
      levelProvenance: graded.provenance,
      dropDecision: dropDecisions[name] ?? null,
      usage: usageEvidenceFor(name, input.usageReport),
      catalog,
      hasModification: f.hasModification,
      hasOwnWriteAccess: f.hasOwnWriteAccess,
    };
    assignments.push(assignPublicCloudFit(objectInput, input.targetPlatform));
  }
  assignments.sort((a, b) => (a.objectName < b.objectName ? -1 : a.objectName > b.objectName ? 1 : 0));

  const summary = summarizePublicCloudFit(assignments, {
    targetPlatform: input.targetPlatform,
    usageImported: Boolean(input.usageReport),
    catalogBasis: input.catalogBasis ?? null,
  });

  return { assignments, summary };
}
