/**
 * Changing a project's target — edition and release — after the first run
 * (owner, 06.10.2026: the IT view's "Target profile" box offers it to the
 * owner; the change affects everything, so it is asked first and a new signed
 * analysis run is started).
 *
 * The target lives in the signed assessment profile, and `assessmentTarget` /
 * `s4Deployment` are written by `POST /api/runs/create` and nothing else. So a
 * change is never a field write: it is a new run under the new profile, the
 * same request the start sends (`lib/engine-run.ts`). The route then records
 * the change the way it records any profile change (`auditMetadata.sourceChange`
 * with `reason: 'profile'`), and every reader that treats a changed source as
 * stale treats the changed target the same way.
 *
 * Pure and client-safe: the route reads `isTargetChange` to meter the run, the
 * dialog reads `targetChangeImpact` to say what the change does before the
 * click, and the profile box reads `targetChangeNotice` afterwards. All three
 * stand on the same facts, so the preview cannot promise what the server or
 * the notice then contradict.
 */

import { buildSourceChangeRecord } from './artefact-digest';
import { declaredTargetOf } from './assessment-target';
import { targetEditionOf, type TargetEdition } from './target-edition';
import { PHASES, workflowSteps, type PhaseKey } from './workflow-steps';
import type { Project } from './types';

export interface TargetFacts {
  edition: TargetEdition;
  /** The declared release, trimmed; empty when none is declared. */
  release: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The target the project is assessed against now — the two facts the route reads. */
export function projectTarget(project: unknown): TargetFacts {
  const doc = isObj(project) ? project : {};
  return { edition: targetEditionOf(doc.s4Deployment), release: declaredTargetOf(doc).release };
}

/** Releases compare as the route normalises them: trimmed, inner whitespace collapsed. */
export function normaliseRelease(release: string): string {
  return release.trim().replace(/\s+/g, ' ');
}

export function sameTarget(a: TargetFacts, b: TargetFacts): boolean {
  return a.edition === b.edition && normaliseRelease(a.release) === normaliseRelease(b.release);
}

const EDITION_WORDS: Record<TargetEdition, string> = { public: 'Public Edition', private: 'Private Edition' };

/** "Private Edition 2023 FPS03", "Public Edition" — the target in words. */
export function targetWords(t: TargetFacts): string {
  const release = normaliseRelease(t.release);
  return release ? `${EDITION_WORDS[t.edition]} ${release}` : EDITION_WORDS[t.edition];
}

/**
 * Is this run a change of the project's target, and nothing else?
 *
 * True only when all of these hold: the project already has a signed run, the
 * run is over exactly the source that run signed (the same fingerprint), and
 * the edition or the declared release differs from what the project carries.
 * A first run, a run over changed source, or the same target again is not a
 * target change — so this cannot be used to re-run anything for free that is
 * not a change of target. `/api/runs/create` reads it to meter the run
 * (`reserveRunQuota`, owner decision 06.10.2026: changing the target of a
 * starter example is free, also repeatedly).
 */
export function isTargetChange(args: { project: unknown; sourceSha256: string; next: TargetFacts }): boolean {
  const { project, sourceSha256, next } = args;
  if (!isObj(project) || !str(project.activeRunId).trim()) return false;
  const audit = isObj(project.auditMetadata) ? project.auditMetadata : {};
  const fingerprint = isObj(audit.inputFingerprint) ? str(audit.inputFingerprint.sha256) : '';
  if (!fingerprint || !sourceSha256 || fingerprint !== sourceSha256) return false;
  return !sameTarget(projectTarget(project), next);
}

/* ------------------------------------------------------- before the click */

export interface OutdatedTool {
  key: PhaseKey;
  label: string;
}

export interface TargetChangeImpact {
  /** The tools whose work on record will read as built for a previous target profile. */
  outdated: OutdatedTool[];
  /** A decision record is on the project (draft or confirmed) and will no longer be the current one. */
  decision: { status: 'draft' | 'confirmed'; id: string } | null;
}

/** The stored decision record's status and name, read without validating the whole record. */
function storedDecision(project: Project | null): { status: 'draft' | 'confirmed'; id: string; boundRunId: string } | null {
  const raw = project ? (project as unknown as Record<string, unknown>).decision : null;
  if (!isObj(raw)) return null;
  const status = raw.status === 'confirmed' ? 'confirmed' : raw.status === 'draft' || raw.status === undefined ? 'draft' : null;
  if (!status) return null;
  return { status, id: str(raw.decisionId) || 'DEC', boundRunId: str(raw.boundRunId) };
}

/**
 * What a target change will leave outdated, computed before the click with the
 * mechanism the run will use: the route records the digests of the artefacts
 * standing now with `reason: 'profile'`, and `workflowSteps` reads a tool whose
 * work still carries a recorded digest as stale. So the preview runs exactly
 * that — the record built from the project as it is, laid over it — and lists
 * the tools that would turn stale. Nothing is guessed from the tool names.
 *
 * The decision is the other half. A decision binds the run it was read from
 * (`boundRunId`); once the new run is the project's, a confirmed record shows
 * as outdated on the decision card and a draft is derived again on the new
 * run (`lib/decision-draft.ts`, `lib/handover.ts` `decisionIsCurrent`). No
 * write is needed for either, and none is made.
 */
export function targetChangeImpact(project: Project | null, now: string = new Date().toISOString()): TargetChangeImpact {
  if (!project) return { outdated: [], decision: null };
  const before = workflowSteps(project);
  const previous = str(project.auditMetadata?.inputFingerprint?.sha256) || 'unknown';
  const record = {
    ...buildSourceChangeRecord(project as unknown as Record<string, unknown>, previous, 'target-change-preview', now),
    reason: 'profile' as const,
  };
  const after = workflowSteps({
    ...project,
    auditMetadata: { ...(project.auditMetadata ?? {}), sourceChange: record },
  } as Project);
  const outdated = after
    .filter((s) => s.key !== 'analyze' && s.state === 'stale' && before.find((b) => b.key === s.key)?.state !== 'stale')
    .map((s) => ({ key: s.key, label: s.label }));
  const decision = storedDecision(project);
  return { outdated, decision: decision ? { status: decision.status, id: decision.id } : null };
}

/* -------------------------------------------------------- after the change */

export interface TargetChangeNotice {
  /** ISO day of the change, as the server recorded it. */
  day: string;
  /** The previous target in words, where the change record names it. */
  from: string | null;
  to: string;
  /** Tools whose work was built for the previous target and has not been redone. */
  outdated: OutdatedTool[];
  /** The stored decision was read from an earlier run. */
  decisionOutdated: boolean;
}

/**
 * The notice in the profile box after a target change: while the active run is
 * the one that changed the target, and something it left outdated is still
 * outdated — or the change is less than a day old, so the owner who just made
 * it sees it confirmed even on a project with nothing built yet.
 */
export function targetChangeNotice(project: Project | null, nowMs: number = Date.now()): TargetChangeNotice | null {
  if (!project) return null;
  const record = project.auditMetadata?.sourceChange as
    | (Record<string, unknown> & { at?: unknown; runId?: unknown; reason?: unknown; previousTarget?: unknown })
    | undefined;
  const active = str(project.activeRunId);
  if (!record || record.reason !== 'profile' || !active || str(record.runId) !== active) return null;
  const at = str(record.at);
  const prev = isObj(record.previousTarget) ? record.previousTarget : null;
  const from = prev
    ? targetWords({ edition: targetEditionOf(prev.edition), release: str(prev.release) })
    : null;
  const outdated = workflowSteps(project)
    .filter((s) => s.key !== 'analyze' && s.state === 'stale')
    .map((s) => ({ key: s.key, label: PHASES.find((p) => p.key === s.key)?.label ?? s.label }));
  const decision = storedDecision(project);
  const decisionOutdated = Boolean(decision && decision.boundRunId && decision.boundRunId !== active);
  const recent = at ? nowMs - Date.parse(at) < 24 * 60 * 60 * 1000 : false;
  if (outdated.length === 0 && !decisionOutdated && !recent) return null;
  return { day: at.slice(0, 10), from, to: targetWords(projectTarget(project)), outdated, decisionOutdated };
}
