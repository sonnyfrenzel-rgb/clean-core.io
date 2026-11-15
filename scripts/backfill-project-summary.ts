/**
 * scripts/backfill-project-summary.ts — one-off: give every project that has a
 * signed run the project summary My workspace's tiles read (3.3.0, ADR-123 (5),
 * W11; `lib/project-summary.ts`).
 *
 * Since 3.3.0 `POST /api/runs/create` writes `summary` with each signed run and
 * `POST /api/projects/{id}/process-revisions` refreshes its map with each saved
 * drawing. A project analysed before has none, and its tile says "Map after the
 * next run". This script writes it once, from the same inputs the run route
 * uses: the project's source when its SHA-256 is the one the active run signed,
 * that run's score, recommendation and engine version, and — when the process
 * has saved drawings of that source — the newest drawing's map. The business
 * name the tile shows as its title (`processTitle`, the source header's title
 * line, owner decision 14.11.2026) is read from the same source.
 *
 * The rule is `planProjectSummary` below (pure). A project is left alone when it
 * has no active run, its run cannot be read, its source is not the signed one,
 * or it already holds a complete summary of its active run — so a second run
 * finds nothing to do. A summary written before `processTitle` existed is
 * written again, whole, from the same run. Like every summary, it is written with the Admin SDK, outside
 * the signed run, and never touches a run or an audit pack.
 *
 * Usage:
 *   npx tsx scripts/backfill-project-summary.ts                  # dry run: counts only
 *   npx tsx scripts/backfill-project-summary.ts --apply          # write `summary`
 *   npx tsx scripts/backfill-project-summary.ts --database <id>  # another database (default FIRESTORE_DB_ID)
 *
 * Needs Application Default Credentials (`gcloud auth application-default
 * login`); with `FIRESTORE_EMULATOR_HOST` set it talks to the emulator instead.
 *
 * **Whether and when this runs against production is the owner's decision.**
 * It is not wired into any workflow and refuses to run in CI: the repository
 * and its Actions logs are public. **It prints counts only** — no name, no
 * address, no document id.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldPath, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { sha256Hex } from '../lib/artefact-digest';
import { PROCESS_REVISION_COLLECTION } from '../lib/process-revisions';
import { revisionDocData } from '../lib/process-revision-store';
import { summaryOf, type ProjectSummary } from '../lib/project-summary';
import { computeProjectSummary } from '../lib/project-summary-server';
import { APP_VERSION } from '../lib/version';

const PROJECT_ID = 'cleancore-491216';
const PAGE_SIZE = 100;

export type SummarySkip = 'no-run' | 'has-summary' | 'run-unreadable' | 'source-not-signed';

/** What the backfill needs of a project, its active run and its newest saved drawing. */
export interface SummaryPlanInput {
  project: Record<string, unknown>;
  run: Record<string, unknown> | null;
  /** The newest process revision of the project, with its BPMN in `xml`; `null` when there is none. */
  latestRevision: Record<string, unknown> | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The summary a project gets, or why it gets none. Pure: the engine runs, nothing is read or written. */
export function planProjectSummary(input: SummaryPlanInput, now: Date = new Date()): { summary: ProjectSummary } | { skip: SummarySkip } {
  const { project, run, latestRevision } = input;
  const runId = str(project.activeRunId);
  if (!runId) return { skip: 'no-run' };
  // A summary of the active run is complete once it carries the business name (`processTitle`, a string or null —
  // 3.3.0, owner decision 14.11.2026); one written before that key existed is written again, whole, from the same run.
  const stored = project.summary as Record<string, unknown> | undefined;
  if (summaryOf(project as { activeRunId?: unknown; summary?: unknown }) && stored && 'processTitle' in stored) return { skip: 'has-summary' };
  if (!run) return { skip: 'run-unreadable' };
  const source = str(project.legacyCode);
  const fingerprint = (project.auditMetadata as { inputFingerprint?: { sha256?: unknown; fileName?: unknown } } | undefined)?.inputFingerprint;
  const signedSha = str(fingerprint?.sha256);
  if (!source.trim() || !signedSha || sha256Hex(source) !== signedSha) return { skip: 'source-not-signed' };
  const revisionNumber = typeof latestRevision?.revision === 'number' ? latestRevision.revision : 0;
  const drawing =
    revisionNumber > 1 && str(latestRevision?.xml) && str(latestRevision?.sourceSha256) === signedSha
      ? { xml: str(latestRevision?.xml), revision: revisionNumber }
      : null;
  const score = run.cleanCoreScore;
  return {
    summary: computeProjectSummary(
      {
        runId,
        sourceSha256: signedSha,
        source,
        processName: str(project.name),
        sourceFileName: str(run.fileName) || str(fingerprint?.fileName) || 'source.abap',
        engineVersion: str(run.analyzerVersion) || APP_VERSION,
        cleanCoreScore: typeof score === 'number' && Number.isFinite(score) ? score : null,
        recommendation: str(run.originalRecommendation) || null,
        revision: drawing,
      },
      now,
    ),
  };
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.error('Refusing to run in CI: the Actions log of this repository is public, and this script is run by hand.');
    process.exit(2);
  }
  const apply = process.argv.includes('--apply');
  const databaseId = process.argv.includes('--database') ? argValue('--database') : FIRESTORE_DB_ID;
  if (!databaseId || databaseId.startsWith('--')) {
    console.error('--database needs a database id; nothing was changed.');
    process.exit(2);
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (!getApps().length) {
    initializeApp(emulator ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db = getFirestore(getApps()[0], databaseId);
  console.log(`target: ${emulator ? `emulator (${emulator})` : 'production'}, project ${PROJECT_ID}, database ${databaseId}`);

  const counts: Record<SummarySkip | 'scanned' | 'toWrite' | 'written' | 'failed', number> = {
    scanned: 0, 'no-run': 0, 'has-summary': 0, 'run-unreadable': 0, 'source-not-signed': 0, toWrite: 0, written: 0, failed: 0,
  };
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = db.collection('projects').orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const docs = (await query.get()).docs;
    if (docs.length === 0) break;
    for (const doc of docs) {
      counts.scanned++;
      const project = doc.data();
      const runId = str(project.activeRunId);
      let run: Record<string, unknown> | null = null;
      let latestRevision: Record<string, unknown> | null = null;
      if (runId) {
        const runSnap = await doc.ref.collection('runs').doc(runId).get();
        run = runSnap.exists ? (runSnap.data() as Record<string, unknown>) : null;
        const rev = await doc.ref.collection(PROCESS_REVISION_COLLECTION).orderBy('revision', 'desc').limit(1).get();
        latestRevision = rev.empty ? null : revisionDocData(rev.docs[0].data());
      }
      const plan = planProjectSummary({ project, run, latestRevision });
      if ('skip' in plan) {
        counts[plan.skip]++;
        continue;
      }
      counts.toWrite++;
      if (!apply) continue;
      try {
        // Precondition: a project written since it was read (a new run writes its own summary) is not overwritten.
        await doc.ref.update({ summary: plan.summary }, { lastUpdateTime: doc.updateTime });
        counts.written++;
      } catch {
        counts.failed++;
      }
    }
    cursor = docs[docs.length - 1];
    if (docs.length < PAGE_SIZE) break;
  }

  console.log('');
  console.log(`projects scanned:                          ${counts.scanned}`);
  console.log(`  without a signed run (left alone):       ${counts['no-run']}`);
  console.log(`  with a summary of their run already:     ${counts['has-summary']}`);
  console.log(`  whose run could not be read:             ${counts['run-unreadable']}`);
  console.log(`  whose source is not the signed one:      ${counts['source-not-signed']}`);
  console.log(`  to get a summary:                        ${counts.toWrite}`);
  if (!apply) {
    console.log('');
    console.log('DRY RUN — nothing was changed. Re-run with --apply to write the summaries.');
    return;
  }
  console.log(`wrote ${counts.written} summary(ies); ${counts.failed} changed since they were read (re-run picks them up).`);
}

if (process.argv[1] && /backfill-project-summary/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message.split('\n')[0] : String(err));
    process.exit(1);
  });
}
