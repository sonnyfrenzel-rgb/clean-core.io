/**
 * Which rule of the Clean Core Score a run is scored by (owner decision
 * 11.10.2026, QA full review of v3.0.7, 3a31270a65a0).
 *
 * In Private Edition a write to the program's own Z/Y tables is on-stack
 * developer extensibility — the route's own rationale says it is no clean core
 * violation — and since 3.0.9 it costs no score points there. Public Cloud
 * keeps the deduction, and a write to a namespaced (`/NS/`) table is not the
 * customer's own by its name alone, so it keeps it too. Writes to SAP standard
 * tables are charged in both editions, as before.
 *
 * The score has no rule version of its own; the engine version stamped into
 * every run (`analyzerVersion`, `modelCard.engineVersion`) says which rule the
 * run was scored by. A run signed before 3.0.9 keeps its value and is never
 * re-scored; wherever a screen recomputes the score to compare it with the
 * signed one, it must recompute with the rule of that run, or every such run
 * would read as "differs". So every caller names the deployment and the
 * engine version — there is no default rule.
 *
 * Pure: no imports, no I/O.
 */

/**
 * - `custom-writes-charged`: every write to a custom table costs points (the
 *   rule before 3.0.9, and Public Cloud's rule).
 * - `own-custom-writes-free`: writes to the program's own Z/Y tables cost
 *   nothing (Private Edition from 3.0.9).
 */
export type ScoreRule = 'custom-writes-charged' | 'own-custom-writes-free';

/** The first engine version that scores own Z/Y writes free in Private Edition. */
export const OWN_TABLE_WRITES_FREE_FROM = '3.0.9';

/** `[major, minor, patch]` of `v3.0.9`, `3.0.9` or `3.0.9-dev.1`; null for anything else. */
export function parseEngineVersion(version: unknown): [number, number, number] | null {
  if (typeof version !== 'string') return null;
  const m = /^\s*v?(\d+)\.(\d+)\.(\d+)/i.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `version` is `min` or later. A missing or unreadable version is not. */
export function engineVersionAtLeast(version: unknown, min: string): boolean {
  const v = parseEngineVersion(version);
  const floor = parseEngineVersion(min);
  if (!v || !floor) return false;
  for (let i = 0; i < 3; i++) {
    if (v[i] !== floor[i]) return v[i] > floor[i];
  }
  return true;
}

/**
 * The rule a run of this deployment and engine version is scored by. A
 * missing or unreadable engine version is read as a run before 3.0.9: the old
 * rule, which is what every run without the stamp was scored by.
 */
export function scoreRuleFor(deploymentModel: 'public' | 'private', engineVersion: string | null | undefined): ScoreRule {
  return deploymentModel === 'private' && engineVersionAtLeast(engineVersion, OWN_TABLE_WRITES_FREE_FROM)
    ? 'own-custom-writes-free'
    : 'custom-writes-charged';
}

/** A table in the customer's own namespace by its name: Z or Y. A `/NS/` name is not. */
export function isOwnTableName(name: unknown): boolean {
  return typeof name === 'string' && /^[ZY]/i.test(name.trim());
}

/**
 * The engine version a signed run was made with, as the hydrated project
 * carries it: the run's own `analyzerVersion` (inside its signature) first,
 * the model card's copy second, otherwise null — which `scoreRuleFor` reads
 * as the old rule.
 */
export function signedEngineVersionOf(project: {
  analyzerVersion?: unknown;
  auditMetadata?: { modelCard?: { engineVersion?: unknown } | null } | null;
} | null | undefined): string | null {
  if (!project) return null;
  if (typeof project.analyzerVersion === 'string' && project.analyzerVersion.trim()) return project.analyzerVersion;
  const card = project.auditMetadata?.modelCard?.engineVersion;
  return typeof card === 'string' && card.trim() ? card : null;
}
