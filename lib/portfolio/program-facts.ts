import { gradeSapObjectUse, hasNoReleasedApiPath } from '@/lib/abap/catalog-service';
import { catalogSnapshotKeyForProject } from '@/lib/abap/catalog-snapshots';
import { isCustomerObject, type ObjectUse } from '@/lib/abap/abcd-classification';
import { collectObjectFacts, resolvePublicCloudFit, type PublicCloudFitFinding } from '@/lib/abap/public-cloud-fit-resolver';
import { routeKindLabel } from '@/lib/abap/extensibility-router';
import { includesNamed } from '@/lib/own-code-import';
import type { ProgramFacts, ProgramObjectFact } from './aggregate';

/**
 * The facts of one program, read from its project and its signed run —
 * roadmap 3.0.21 (2). Server-only: it reaches the SAP catalog through
 * `catalog-service.ts`, which never travels to a browser
 * (`tests/client-catalog-boundary.spec.ts`).
 *
 * **From the signed run, not recomputed.** The score, the findings and their
 * kinds are the ones the run signed (`cleanCoreScore`, `evidenceReport`), so a
 * figure in the overview is the figure the project's own run carries; the
 * engine is not run again over hundreds of sources. Two things are read beside
 * it, the same way each project's own cards read them:
 *
 *   - the **level** of every object, graded with the catalog snapshot of the
 *     project's target (`gradeSapObjectUse`, as the IT view and the
 *     Public-Cloud-Fit card grade it) — never stored, never signed;
 *   - the **bucket** of every object, by the one resolver the
 *     Public-Cloud-Fit card uses (`resolvePublicCloudFit`), with the project's
 *     usage import and target platform.
 *
 * And from the stored source, the includes it names that were never uploaded
 * (an expanded include stands as a comment, so only unread ones are found).
 */

export interface StoredProject {
  id: string;
  data: Record<string, unknown>;
}

export interface StoredRun {
  cleanCoreScore?: unknown;
  evidenceReport?: unknown;
  status?: unknown;
}

function signedFindingsOf(run: StoredRun | null): { objectName?: string; kind: string }[] {
  if (!run || !Array.isArray(run.evidenceReport)) return [];
  return run.evidenceReport
    .filter((f): f is { objectName?: unknown; kind: unknown } => Boolean(f) && typeof f === 'object')
    .filter((f) => typeof f.kind === 'string')
    .map((f) => ({ kind: f.kind as string, ...(typeof f.objectName === 'string' ? { objectName: f.objectName } : {}) }));
}

export function programFactsOf(project: StoredProject, run: StoredRun | null): ProgramFacts {
  const data = project.data;
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : project.id;
  const source = typeof data.legacyCode === 'string' ? data.legacyCode : '';
  const analysed = Boolean(run) && (run!.status === undefined || run!.status === 'completed');
  const score = analysed && typeof run!.cleanCoreScore === 'number' ? run!.cleanCoreScore : null;
  const findings = analysed ? signedFindingsOf(run) : [];

  let objects: ProgramObjectFact[] = [];
  if (analysed) {
    const snapshot = catalogSnapshotKeyForProject(data);
    const gradeObjectUse = (n: string, u: ObjectUse | null) => gradeSapObjectUse(n, u, snapshot);
    const targetPlatform = data.s4Deployment === 'private' ? 'private' : data.s4Deployment === 'public' ? 'public' : null;
    const usageReport = data.usageReport && typeof data.usageReport === 'object' ? (data.usageReport as never) : null;
    const resolverFindings = findings as PublicCloudFitFinding[];
    const { assignments } = resolvePublicCloudFit(
      { findings: resolverFindings, usageReport, targetPlatform },
      { gradeObjectUse, hasNoPath: (n) => hasNoReleasedApiPath(n, snapshot) },
    );
    const facts = collectObjectFacts(resolverFindings);
    objects = assignments.map((a) => {
      const use = facts.get(a.objectName)?.use ?? null;
      return {
        name: a.objectName,
        sap: !isCustomerObject(a.objectName),
        level: gradeObjectUse(a.objectName, use).grade,
        use: use === 'read' || use === 'write' ? use : null,
        bucket: a.bucket,
        notAssigned: a.bucket ? null : a.reason?.code ?? null,
      };
    });
  }

  const byKind = new Map<string, number>();
  for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);

  return {
    projectId: project.id,
    name,
    analysed,
    score,
    includesNotRead: source ? includesNamed(source) : [],
    objects,
    kinds: [...byKind.entries()].map(([kind, count]) => ({ kind, label: routeKindLabel(kind as never), count })),
  };
}
