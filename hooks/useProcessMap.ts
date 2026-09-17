import { useEffect, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { sha256Hex } from '@/lib/artefact-digest';
import type { NamingAvailability } from '@/lib/process-naming';
import type { ProcessMapModel, ProcessMapRecord } from '@/lib/process-map';

/**
 * The process map of a project, and its stored traceability quote — roadmap 2.5.
 *
 * Everything heavy is imported when a reader opens a stage that shows the map,
 * not when the bundle loads: the ABAP reader, the BPMN writer and the view model
 * are three dynamic imports here, and bpmn-js is a fourth inside the canvas.
 *
 * The order is not arbitrary. The skeleton and the BPMN come from the **source
 * the run signed** and from nothing else; the business names are fetched and
 * *applied* to that reading, so a naming made for an earlier source is shown as
 * not applied rather than drawn. No model is called from here — this view shows
 * what is already there, and asking for names is roadmap 2.4's own action.
 *
 * The quote is measured by the server (`POST /api/projects/{id}/process-map`)
 * and only when the stored one is missing or belongs to other bytes. A number
 * the browser could supply would be a claim about itself.
 *
 * What is held is keyed by project and source digest, and the key is compared on
 * every read: a model built for a source that has since changed is never shown
 * as the current one, it is simply not there yet.
 */
export type ProcessMapStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface ProcessMapState {
  status: ProcessMapStatus;
  model: ProcessMapModel | null;
  /** ISO time the stored quote was measured, when there is one for this source. */
  measuredAt: string | null;
  /** Why there is no map, in one sentence. Null while there is one. */
  reason: string | null;
}

export interface SignedSource {
  source: string;
  fileName: string;
}

interface Held {
  key: string;
  model: ProcessMapModel | null;
  measuredAt: string | null;
  failed: boolean;
}

async function authHeader(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/**
 * The stored quote for this source, measuring it once if nobody has.
 *
 * Failing to store a quote does not fail the map: the map is drawn from the
 * file, the quote is a record about it, and a reader who cannot write one still
 * gets the sentence computed from the same `stats`.
 */
async function ensureQuote(projectId: string, sourceSha256: string): Promise<string | null> {
  const path = `/api/projects/${encodeURIComponent(projectId)}/process-map`;
  try {
    const headers = await authHeader();
    const read = await fetch(path, { headers });
    if (read.ok) {
      const body = (await read.json()) as { record?: ProcessMapRecord | null };
      if (body.record && body.record.sourceSha256 === sourceSha256) return body.record.measuredAt;
    }
    const written = await fetch(path, { method: 'POST', headers });
    if (!written.ok) return null;
    const body = (await written.json()) as { record?: ProcessMapRecord | null };
    return body.record?.measuredAt ?? null;
  } catch {
    return null;
  }
}

const NO_SIGNED_SOURCE =
  'The map is drawn from the source the active run signed. There is none for this project yet.';
const UNREADABLE = 'The process could not be read back from this source.';

export function useProcessMap(
  projectId: string | null,
  signed: SignedSource | null,
  processName: string,
  availability: NamingAvailability | null,
): ProcessMapState {
  const [held, setHeld] = useState<Held>({ key: '', model: null, measuredAt: null, failed: false });

  const source = signed?.source ?? null;
  const fileName = signed?.fileName ?? null;
  // Primitives, not the object: `useModelAvailability` returns a fresh one on
  // every render, and an object in the dependency list would rebuild the map on
  // every render of the page around it.
  const availabilityKnown = availability?.known === true;
  const keyAvailable = availability?.keyAvailable === true;
  const namingStageOn = availability?.stages?.naming !== false;

  const key = projectId && source && fileName ? `${projectId}|${sha256Hex(source)}|${fileName}` : '';

  useEffect(() => {
    if (!projectId || !source || !fileName || !key) return;

    let cancelled = false;

    const build = async () => {
      const [naming, exporter, mapper, client] = await Promise.all([
        import('@/lib/process-naming'),
        import('@/lib/bpmn/export'),
        import('@/lib/process-map'),
        import('@/lib/process-naming-client'),
      ]);
      if (cancelled) return;

      const context = naming.namingContextOf(source);
      const record = await client.fetchProcessNaming(projectId);
      if (cancelled) return;

      const named = naming.applyNaming(
        context,
        record,
        record ? null : naming.absenceBeforeCall(
          availabilityKnown ? { known: true, keyAvailable, stages: { naming: namingStageOn } } : null,
        ),
      );
      const bpmn = exporter.buildBpmnExportFromSource(source, {
        processName: processName || fileName,
        sourceFileName: fileName,
      });
      const model = mapper.buildProcessMapModel({ bpmn, named, fileName });
      if (cancelled) return;

      setHeld({ key, model, measuredAt: null, failed: false });

      const measuredAt = await ensureQuote(projectId, sha256Hex(source));
      if (cancelled || !measuredAt) return;
      setHeld((previous) => (previous.key === key ? { ...previous, measuredAt } : previous));
    };

    build().catch(() => {
      if (cancelled) return;
      setHeld({ key, model: null, measuredAt: null, failed: true });
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, source, fileName, processName, availabilityKnown, keyAvailable, namingStageOn, key]);

  if (!key) return { status: 'idle', model: null, measuredAt: null, reason: NO_SIGNED_SOURCE };
  if (held.key !== key) return { status: 'loading', model: null, measuredAt: null, reason: null };
  if (held.failed) return { status: 'failed', model: null, measuredAt: null, reason: UNREADABLE };
  if (!held.model) return { status: 'loading', model: null, measuredAt: null, reason: null };
  return { status: 'ready', model: held.model, measuredAt: held.measuredAt, reason: null };
}
