import { useEffect, useMemo, useState } from 'react';
import { sha256Hex } from '@/lib/artefact-digest';
import type { ProcessMapModel } from '@/lib/process-map';
import type { ProcessDocument } from '@/lib/process-document';

/**
 * The process description of the signed source, built when the stage opens
 * (owner 03.10.2026: "the process documentation should be created as soon as
 * the tool is opened").
 *
 * Engine only: no model is called, nothing is written and nothing costs — it
 * is the same reading the map and the handbook already did, put in order. The
 * builder and its readers are imported inside the effect, so a reader who
 * never opens Documentation never downloads them. The two model inputs — the
 * run's narrative and the stored statement proposals — are used only when they
 * are there, and only as proposals.
 *
 * Held by a key over the source digest, the map and the model inputs: a
 * document built for another source is never shown as this one's.
 */
export interface ProcessDocumentState {
  document: ProcessDocument | null;
  status: 'idle' | 'loading' | 'ready' | 'failed';
}

export interface ProcessDocumentProposal {
  text: string;
  anchors: ReadonlyArray<{ lineStart: number; lineEnd: number }>;
  contradicts?: boolean;
}

export function useProcessDocument(
  source: string | null,
  model: ProcessMapModel | null,
  narrative: string | null,
  proposals: readonly ProcessDocumentProposal[] | null,
): ProcessDocumentState {
  const key = useMemo(() => {
    if (!source || !model) return '';
    const extra = sha256Hex(`${narrative ?? ''}|${JSON.stringify(proposals ?? [])}`);
    return `${sha256Hex(source)}|${model.xml.length}|${model.elements.length}|${model.naming.named}|${extra}`;
  }, [source, model, narrative, proposals]);
  const [held, setHeld] = useState<{ key: string; value: ProcessDocumentState }>({
    key: '',
    value: { document: null, status: 'idle' },
  });

  useEffect(() => {
    if (!source || !model || !key) return;
    let cancelled = false;
    import('@/lib/process-document-build')
      .then((builder) => {
        if (cancelled) return;
        const document = builder.buildProcessDocument({ source, map: model, narrative, proposals });
        setHeld({ key, value: { document, status: 'ready' } });
      })
      .catch((err) => {
        console.error('Process description could not be built:', err);
        if (!cancelled) setHeld({ key, value: { document: null, status: 'failed' } });
      });
    return () => {
      cancelled = true;
    };
  }, [source, model, narrative, proposals, key]);

  if (!key) return { document: null, status: 'idle' };
  return held.key === key ? held.value : { document: null, status: 'loading' };
}
