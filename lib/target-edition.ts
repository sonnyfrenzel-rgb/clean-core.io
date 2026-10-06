/**
 * The edition a project is assessed against, read from `Project.s4Deployment`.
 *
 * Every new project carries its own, asked on the screen that started it
 * (`components/TargetEditionChoice.tsx`). A project without one — created
 * before 06.10.2026, or never run — reads as the Public Edition: the default
 * POST /api/runs/create and the evidence route have always used. Client
 * readers take it from here so that no screen assesses the same project
 * against another edition than the server signs (until 06.10.2026 the start
 * hook read a missing target as Private while the route read it as Public).
 */
export type TargetEdition = 'public' | 'private';

export const DEFAULT_TARGET_EDITION: TargetEdition = 'public';

export function targetEditionOf(value: unknown): TargetEdition {
  return value === 'private' ? 'private' : value === 'public' ? 'public' : DEFAULT_TARGET_EDITION;
}
