/**
 * Where a key-user decision changes what the seven tools do (roadmap 3.0.19,
 * part B — "When the decision is key user …").
 *
 * The step list itself is built in `lib/key-user-steps.ts` from the engine's
 * key-user reading (`AbapEvidenceReport.keyUser`). This module holds the one
 * answer every tool asks before it shows anything different:
 *
 *   - `keyUserGateOpen(project)` — the signed run's engine names key-user
 *     candidates (`KEY_USER_FROM`). A project analysed by an older engine
 *     answers false here and every tool stays exactly as it was.
 *   - `isKeyUserDecision(project)` — the target signed off in Design is
 *     `keyuser` (`TARGET_ARCHITECTURES`), on a run whose engine reads key user.
 *     Then Transformation generates no code, Testing writes no test code,
 *     Economics prices configuration, and Delivery carries the step list.
 *   - `keyUserModeOf(project, list)` — `whole` for that decision; `split` where
 *     the decision builds code (RAP or CAP) and the reading is `partial`: code
 *     is generated for `codeParts` only and the steps cover the rest; `none`
 *     otherwise.
 *
 * Management, Business and IT are views: nothing here is stored per view, and
 * nothing here is stored at all — the list is rebuilt from the signed source.
 *
 * Pure and client-safe: no React, no Firestore, no engine import beyond types.
 */

import type { AbapEvidenceReport } from './abap/evidence-model';
import { keyUserApplies } from './abap/key-user-gate';
import { engineVersionOfProject } from './run-engine-version';
import { buildKeyUserSteps, type KeyUserStep, type KeyUserStepList } from './key-user-steps';
import type { KeyUserContextInput } from './transformation-context';

/** Where the delivery package carries the step list. */
export const KEY_USER_STEPS_PATH = 'docs/key-user-steps.md';

type ProjectLike = {
  targetArchitecture?: unknown;
  approvedByArchitect?: unknown;
  activeRunId?: unknown;
  analyzerVersion?: unknown;
  auditMetadata?: unknown;
} | null | undefined;

/** True when the signed run's engine names key-user candidates (`KEY_USER_FROM`). */
export function keyUserGateOpen(project: ProjectLike): boolean {
  return keyUserApplies(engineVersionOfProject(project ?? null));
}

/** The decision signed off in Design is key-user extensibility, on a run whose engine reads key user. */
export function isKeyUserDecision(project: ProjectLike): boolean {
  return !!project && project.targetArchitecture === 'keyuser' && project.approvedByArchitect === true && keyUserGateOpen(project);
}

/** The step list of the evidence this project's run reads, or null (an older engine, no reading). */
export function keyUserStepsOf(evidence: Pick<AbapEvidenceReport, 'keyUser'> | null | undefined, project: ProjectLike): KeyUserStepList | null {
  if (!evidence?.keyUser || !keyUserGateOpen(project)) return null;
  return buildKeyUserSteps(evidence.keyUser);
}

export type KeyUserMode = 'whole' | 'split' | 'none';

/**
 * `whole`: the decision is key user — no code for any part. `split`: the
 * decision builds code and the reading splits — code for `codeParts` only.
 * `none`: nothing changes.
 */
export function keyUserModeOf(project: ProjectLike, list: KeyUserStepList | null): KeyUserMode {
  if (isKeyUserDecision(project)) return 'whole';
  if (!list || !keyUserGateOpen(project)) return 'none';
  const decided = project?.targetArchitecture;
  const buildsCode = decided === undefined || decided === null || decided === 'rap' || decided === 'cap';
  return buildsCode && list.scope === 'partial' && list.steps.length > 0 ? 'split' : 'none';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 steps in 2 apps, 9 entries, 5 acceptance checks" — the effort as counts, never as an amount. */
export function keyUserEffortLine(list: KeyUserStepList): string {
  const apps = new Set(list.steps.map((s) => s.app)).size;
  return `${plural(list.effort.steps, 'step')} in ${plural(apps, 'app')}, ${plural(list.effort.entries, 'entry', 'entries')}, ${plural(list.effort.checks, 'acceptance check')}`;
}

/** `L12`, `L12–14` for a step's anchors — the ABAP lines it replaces or relies on. */
export function stepLines(step: Pick<KeyUserStep, 'anchors'>): string {
  return step.anchors.map((a) => (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`)).join(', ');
}

/**
 * Scaffold 20 (owner decision 19.10.2026): the lines the planner leaves to the
 * key user in a program that splits — every `replaced` anchor of every step.
 * Null unless the mode is `split`: a whole key-user decision builds nothing at
 * all, and every other program is planned as it always was.
 */
export function keyUserPlanRanges(
  list: KeyUserStepList | null,
  mode: KeyUserMode,
): { ranges: Array<{ lineStart: number; lineEnd: number; step: string }> } | null {
  if (!list || mode !== 'split') return null;
  const ranges = list.steps.flatMap((s) => s.anchors.filter((a) => a.role === 'replaced').map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd, step: s.id })));
  return ranges.length > 0 ? { ranges } : null;
}

/** The PLATFORM KNOWLEDGE input for a split program, declared in `lib/transformation-context.ts`. */
export type { KeyUserContextInput };

/**
 * What a generation of a split program is told: which parts a key user
 * configures (not generated) and which stay code. Null unless the reading is
 * `partial` with at least one step — a whole-program reading under a code
 * decision is the owner's choice to build it, and generates the whole program.
 */
export function keyUserContextOf(evidence: Pick<AbapEvidenceReport, 'keyUser'> | null | undefined, project: ProjectLike): KeyUserContextInput | null {
  const list = keyUserStepsOf(evidence, project);
  if (!list || keyUserModeOf(project, list) !== 'split') return null;
  return {
    steps: list.steps.map((s) => ({ id: s.id, app: s.app, title: s.title, lines: stepLines(s) })),
    codeParts: list.codeParts.map((p) => ({ id: p.id, part: p.part, lines: stepLines(p) })),
  };
}
