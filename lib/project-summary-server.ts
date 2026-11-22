import { buildBpmnExportFromSource, READING_WRAP } from '@/lib/bpmn/export';
import { deriveBusinessRules } from '@/lib/abap/business-rule-set';
import { parseBpmn } from '@/lib/process-map';
import { mapThumbOf, processTitleOf, PROJECT_SUMMARY_VERSION, type ProjectSummary } from '@/lib/project-summary';
import { headerTitleOf } from '@/lib/program-summary-facts';
import { engineReads3021Apply } from '@/lib/abap/engine-reads-3021-gate';

/**
 * The server half of the project summary (`lib/project-summary.ts`, ADR-123 (5), W11): computing it and writing it
 * with the Admin SDK. Server-only — it reaches the engine and Firestore's admin client.
 *
 * Every write here goes to the one key `summary` of the project document, never to a run and never to an audit
 * pack. A failure to write it fails nothing else: the tile then says "Map after the next run", as for a project the
 * backfill has not reached.
 */

/** The map's figures from a BPMN file: its compact top level and the elements on every level. */
export function mapFiguresOf(xml: string): Pick<ProjectSummary, 'mapThumb' | 'mapSteps'> {
  let mapSteps: number | null = null;
  try {
    mapSteps = parseBpmn(xml).elements.length;
  } catch {
    mapSteps = null;
  }
  return { mapThumb: mapThumbOf(xml), mapSteps };
}

export interface SummaryInput {
  runId: string;
  sourceSha256: string;
  /** The source the run analysed. */
  source: string;
  processName: string;
  sourceFileName: string;
  /** The engine the run was made by — the rules and the map are read for it. */
  engineVersion: string | null;
  cleanCoreScore: number | null;
  recommendation: string | null;
  /** The latest saved drawing, when the process has revisions beyond the reconstructed one. */
  revision?: { xml: string; revision: number } | null;
}

/** The summary of one run: the map as revision 1 draws it (or the latest saved drawing), the rules, the score. */
export function computeProjectSummary(input: SummaryInput, now: Date = new Date()): ProjectSummary {
  let map: Pick<ProjectSummary, 'mapThumb' | 'mapSteps'> = { mapThumb: null, mapSteps: null };
  let mapRevision = 1;
  if (input.revision && input.revision.xml) {
    map = mapFiguresOf(input.revision.xml);
    mapRevision = input.revision.revision;
  } else {
    try {
      const { xml } = buildBpmnExportFromSource(input.source, {
        processName: input.processName || input.sourceFileName,
        sourceFileName: input.sourceFileName,
        // As the map in Analyze draws it (`hooks/useProcessMap.ts`): a run without a stamp draws with this release.
        ...(input.engineVersion ? { exporterVersion: input.engineVersion } : {}),
        // The reading map's rows (Analyze draws it wrapped), so the thumbnail has the map's shape, not one long line.
        wrap: READING_WRAP,
      });
      map = mapFiguresOf(xml);
    } catch {
      /* no map: the tile says so */
    }
  }
  let rulesDerived: number | null = null;
  try {
    rulesDerived = deriveBusinessRules(input.source, input.engineVersion).rules.length;
  } catch {
    rulesDerived = null;
  }
  return {
    version: PROJECT_SUMMARY_VERSION,
    runId: input.runId,
    sourceSha256: input.sourceSha256,
    ...map,
    mapRevision,
    rulesDerived,
    cleanCoreScore: typeof input.cleanCoreScore === 'number' && Number.isFinite(input.cleanCoreScore) ? input.cleanCoreScore : null,
    recommendation: input.recommendation,
    processTitle: processTitleFor(input.source, input.engineVersion),
    writtenAt: now.toISOString(),
  };
}

/**
 * The business name of the process (owner decision 14.11.2026): the title line of the source's header as the engine
 * reads it for this run — only for an engine that reads it (`ENGINE_READS_3021_FROM`, where Analyze shows it as the
 * author's claim). No model is asked for it; without a title line the tile keeps the project's name.
 */
export function processTitleFor(source: string, engineVersion: string | null): string | null {
  if (!engineReads3021Apply(engineVersion)) return null;
  try {
    return processTitleOf(headerTitleOf(source)?.text);
  } catch {
    return null;
  }
}

type AdminDb = FirebaseFirestore.Firestore;

/**
 * Writes the whole summary after a signed run — only while the project's active run is still the run the summary is
 * of (lawyer, statement 20c E3 (4); QA review ddce067b4191). Two runs of one project can commit one after the other
 * and write their summaries in the other order; without this check the late write of the earlier run would put its
 * summary under the newer run's source. Returns whether it wrote. (The backfill writes with its own precondition.)
 */
export async function writeProjectSummary(db: AdminDb, projectId: string, summary: ProjectSummary): Promise<boolean> {
  const ref = db.collection('projects').doc(projectId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('activeRunId') !== summary.runId) return false;
    tx.update(ref, { summary });
    return true;
  });
}

/**
 * A saved drawing changes the map, not the run: only the map's three fields are replaced, and only while the summary
 * belongs to the run the drawing was made on (a summary of another run is left for the next run to replace), and only
 * with a drawing at least as new as the one it shows.
 */
export async function refreshSummaryMap(
  db: AdminDb,
  projectId: string,
  runId: string | null,
  drawing: { xml: string; revision: number },
): Promise<boolean> {
  const ref = db.collection('projects').doc(projectId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const summary = snap.get('summary') as Partial<ProjectSummary> | undefined;
    if (!summary || typeof summary !== 'object' || !runId || summary.runId !== runId) return false;
    // A refresh that arrives late never puts an older drawing over a newer one.
    if (typeof summary.mapRevision === 'number' && drawing.revision < summary.mapRevision) return false;
    const map = mapFiguresOf(drawing.xml);
    tx.update(ref, {
      'summary.mapThumb': map.mapThumb,
      'summary.mapSteps': map.mapSteps,
      'summary.mapRevision': drawing.revision,
      'summary.writtenAt': new Date().toISOString(),
    });
    return true;
  });
}
