/**
 * The one place every public figure comes from.
 *
 * Roadmap 0.2 (`docs/roadmap/SCHNITT-0-UMFANG.md` §2, `UX-E14-F01:R0`): Phase 0
 * is "Belegt" — nothing on a public page claims more than the data behind it
 * supports. Before this module existed, the object count was read live in some
 * places (`app/page.tsx` via `getCatalogStats()`) and typed in by hand elsewhere
 * (`23,000+`), and the two drifted the moment a catalog sync moved the real
 * number. This module does not compute anything new — every figure below is a
 * read of a function that already existed (`getCatalogStats`, the two synced
 * catalog artifacts' own `meta`, `lib/version.ts`, `lib/reference-analysis.ts`,
 * the rule version from `lib/abap/level-rule-version.ts` via
 * `getLevelRuleVersion()`) — it only gives a public page one name to import
 * instead of five, so "which pages agree" becomes "which pages import this".
 *
 * Server-only, like `lib/abap/catalog-service.ts` underneath it: `getFacts()`
 * transitively reads both generated catalog artifacts (~4.2 MB combined) and the
 * reference ABAP file from disk. There is no npm `server-only` package in this
 * repo's dependencies (see the gotcha in CLAUDE.md about not touching
 * package-lock.json on local Node 20), so this is enforced by convention and by
 * `tests/copy-ci-guard.spec.ts`, the same way `catalog-service.ts` already is —
 * never import this file from a component that carries `'use client'`, and never
 * from a file a client component imports. A public page reads it directly as a
 * server component (see `app/page.tsx`), and `/facts.json` reads it from a route
 * handler; neither ships it to the browser.
 */
import {
  getCatalogStats,
  getMergedCatalogVersion,
  getLevelRuleVersion,
  getPublishedGradeDistribution,
  type LevelRuleArtifact,
} from './abap/catalog-service';
import type { CloudReadinessGrade } from './abap/abcd-classification';
import { APP_VERSION, APP_RELEASE_DATE_ISO } from './version';
import { getReferenceAnalysis, REFERENCE_FILE } from './reference-analysis';

/** One synced SAP repository file, with the hash and date a reader can check it against. */
export type FactsArtifact = LevelRuleArtifact;

export interface FactsReferenceRun {
  fileName: string;
  linesOfCode: number;
  totalFindings: number;
  /** Findings the engine settles by pointing at a released successor. */
  resolvedCount: number;
  /** Findings that need an architect's decision. */
  decisionCount: number;
  /** Findings out of reach for any generator (Dynpro, modifications, native SQL). */
  handedBackCount: number;
  cleanCoreScore: number;
}

export interface Facts {
  /** Union of both catalog artifacts — every object we can state a level for. */
  objectCount: number;
  /** Objects the merged catalog resolves to a released successor. */
  successorCount: number;
  /** A–D census across everything SAP has published (not any customer's code). */
  levelDistribution: Record<CloudReadinessGrade, number>;
  /** Newer of the two artifacts' sync dates, YYYY-MM-DD — see getCatalogStats(). */
  catalogSyncDate: string;
  /** Both synced repository files, each with its own hash and sync date. */
  catalogArtifacts: FactsArtifact[];
  /** Traceability string for the merged catalog (curated layer + repository release). */
  catalogVersion: string;
  engineVersion: string;
  engineReleaseDate: string;
  /** The published A–D precedence rule's version line, e.g. "levels 3f9a2c1e0b7d · …". */
  ruleVersion: string;
  /** Twelve hex characters over the rule's own decision table (see level-rule-version.ts). */
  ruleFingerprint: string;
  referenceRun: FactsReferenceRun;
}

let cache: Facts | null = null;

/**
 * All of it, computed once per server process and reused.
 *
 * Every field is a read of an existing function, not a new derivation — see the
 * module comment for which one. Caching only avoids re-parsing the ~4.2 MB
 * catalog artifacts and re-running the reference analysis on every request; the
 * underlying functions are themselves already cheap after their own first call
 * (`getLevelRuleVersion` caches, `MERGED_TABLE_MAP` is built once at import time).
 */
export function getFacts(): Facts {
  if (cache) return cache;

  const stats = getCatalogStats();
  const ruleVersion = getLevelRuleVersion();
  const grades = getPublishedGradeDistribution();
  const reference = getReferenceAnalysis();

  cache = {
    objectCount: stats.classifiedObjects,
    successorCount: stats.mappedWithSuccessor,
    levelDistribution: grades.distribution,
    catalogSyncDate: stats.syncDate,
    catalogArtifacts: ruleVersion.artifacts,
    catalogVersion: getMergedCatalogVersion(),
    engineVersion: APP_VERSION,
    engineReleaseDate: APP_RELEASE_DATE_ISO,
    ruleVersion: ruleVersion.version,
    ruleFingerprint: ruleVersion.fingerprint,
    referenceRun: {
      fileName: reference.fileName,
      linesOfCode: reference.linesOfCode,
      totalFindings: reference.totalFindings,
      resolvedCount: reference.resolved.count,
      decisionCount: reference.decision.count,
      handedBackCount: reference.handedBack.count,
      cleanCoreScore: reference.cleanCoreScore,
    },
  };
  return cache;
}

/**
 * A short, honest label for the object count — never a rounded stand-in.
 *
 * `objectCount` can only be zero if both generated catalog artifacts were empty,
 * which cannot happen with the files committed to this repo; the branch exists
 * so a future build that genuinely lost the sync says so instead of quietly
 * reprinting the last number anyone typed by hand (the defect this module
 * replaces — see the module comment).
 */
export function formatObjectCount(facts: Pick<Facts, 'objectCount'>): string {
  return facts.objectCount > 0
    ? `${facts.objectCount.toLocaleString('en-US')} objects`
    : 'object count unavailable';
}

/** Re-exported so a caller of getFacts() does not also need to import reference-analysis.ts. */
export { REFERENCE_FILE };
