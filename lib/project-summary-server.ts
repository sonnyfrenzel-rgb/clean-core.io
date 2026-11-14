import { buildBpmnExportFromSource, READING_WRAP } from '@/lib/bpmn/export';
import { deriveBusinessRules } from '@/lib/abap/business-rule-set';
import { parseBpmn } from '@/lib/process-map';
import { mapThumbOf, PROJECT_SUMMARY_VERSION, type ProjectSummary } from '@/lib/project-summary';

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
  engineVersion: string;
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
        exporterVersion: input.engineVersion,
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
    writtenAt: now.toISOString(),
  };
}

type AdminDb = FirebaseFirestore.Firestore;

/** Writes the whole summary — after a signed run, and from the backfill. */
export async function writeProjectSummary(db: AdminDb, projectId: string, summary: ProjectSummary): Promise<void> {
  await db.collection('projects').doc(projectId).update({ summary });
}

/**
 * A saved drawing changes the map, not the run: only the map's three fields are replaced, and only while the summary
 * belongs to the run the drawing was made on (a summary of another run is left for the next run to replace).
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
