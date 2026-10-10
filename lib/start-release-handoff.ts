/**
 * The release a start screen asked for, handed to the first signed run.
 *
 * The start screens (the example cards and the own-code import) ask a Private
 * Edition project for its release, because a named release selects SAP's
 * release-pinned list (`pinnedSnapshotForRelease`, `lib/assessment-profile.ts`)
 * and so moves the A–D levels and the findings. The release is part of the
 * declared target (`assessmentTarget`), which only `POST /api/runs/create`
 * writes — the create rule and the owner's update in `firestore.rules` do not
 * take it, and that is deliberate: the target changes together with a signed
 * run or not at all. So the start screen does not write it. It leaves it here,
 * and the workspace's first run (`hooks/useStartRun.ts`) sends it as the
 * `targetProfile` of that run — the same field, the same route, the same
 * normalisation "Change target" uses (`components/workspace/TargetChange.tsx`).
 *
 * Module memory, like `lib/own-code-handoff.ts` and for the same reasons: not
 * the URL (anybody can be sent a URL), not browser storage (the Privacy Policy
 * lists it key by key). A client-side navigation keeps it; a reload before the
 * first run does not, and the project then reads SAP's moving list, which the
 * target profile card says, with "Change target" beside it.
 */

let pending: { projectId: string; release: string } | null = null;

/** Leave the release for this project's first run. An empty release leaves nothing. */
export function leaveStartRelease(projectId: string, release: string): void {
  const value = release.trim();
  pending = value ? { projectId, release: value } : null;
}

/** The release left for this project, or `''`. Read without taking it, so a failed start can retry. */
export function startReleaseFor(projectId: string): string {
  return pending && pending.projectId === projectId ? pending.release : '';
}

/** Forget the release once the run that carried it is signed. */
export function clearStartRelease(projectId: string): void {
  if (pending && pending.projectId === projectId) pending = null;
}
