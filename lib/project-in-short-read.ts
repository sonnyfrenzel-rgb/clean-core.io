import type { AroundSentence } from '@/lib/around-the-map';

/**
 * The reader half of "In short" (`lib/project-in-short.ts`, AB-14c): the stored record's shape and its strict read-back,
 * without the engine. My workspace reads it in the browser (`lib/home-rows.ts`), so this module imports nothing but
 * types — the writer half, which runs the engine's summary, stays on the server.
 *
 * Pure: no React, no Firestore, no network, no model, no engine.
 */

export const PROJECT_IN_SHORT_VERSION = 1;

/** The longest sentence a stored "In short" carries; a longer one is not read back. */
export const IN_SHORT_SENTENCE_MAX = 400;

export interface ProjectInShort {
  version: typeof PROJECT_IN_SHORT_VERSION;
  /** The signed run the sentences were read for — `project.activeRunId` when it was written. */
  runId: string;
  /** SHA-256 of the source that run analysed. */
  sourceSha256: string;
  /** The engine the run was made by; the sentences are read for it. */
  engineVersion: string;
  /** One or two sentences, each with its line label ("L42", "L60-75"). Empty when the engine said nothing. */
  sentences: AroundSentence[];
  /** Who wrote them. Only the engine, ever. */
  by: 'engine';
  /** ISO time of the write. */
  writtenAt: string;
}

/**
 * The most sentences a stored "In short" carries — the Business page's `DOES_SENTENCES` (`lib/around-the-map.ts`),
 * repeated here so the reader needs no engine; `tests/home-rows.spec.ts` holds the two equal.
 */
export const IN_SHORT_SENTENCES = 2;

/** One line of plain text: no control characters, no markup, within {@link IN_SHORT_SENTENCE_MAX}. */
export function isPlainSentence(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text.length > 0 && text.length <= IN_SHORT_SENTENCE_MAX && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/.test(text);
}

/** "L42" or "L60-75". */
export function isAnchorLabel(value: unknown): value is string {
  return typeof value === 'string' && /^L\d{1,6}(?:-\d{1,6})?$/.test(value);
}

/**
 * The stored "In short" of a project, read back strictly — or `null`. Null when there is none, when it belongs to
 * another run than the project's active one, or when any part of it is not exactly the shape written above: the
 * card then shows no "In short" (H-O6), never a sentence of an earlier run or one it cannot vouch for.
 */
export function inShortOf(project: { activeRunId?: unknown; inShort?: unknown } | null | undefined): ProjectInShort | null {
  const raw = project?.inShort;
  const runId = project?.activeRunId;
  if (!raw || typeof raw !== 'object' || typeof runId !== 'string' || !runId) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== PROJECT_IN_SHORT_VERSION || r.runId !== runId || r.by !== 'engine') return null;
  if (typeof r.sourceSha256 !== 'string' || typeof r.engineVersion !== 'string' || typeof r.writtenAt !== 'string') return null;
  if (!Array.isArray(r.sentences) || r.sentences.length > IN_SHORT_SENTENCES) return null;
  const sentences: AroundSentence[] = [];
  for (const s of r.sentences as unknown[]) {
    if (!s || typeof s !== 'object') return null;
    const { text, anchor } = s as Record<string, unknown>;
    if (!isPlainSentence(text) || !isAnchorLabel(anchor)) return null;
    sentences.push({ text: text.trim(), anchor });
  }
  return {
    version: PROJECT_IN_SHORT_VERSION,
    runId,
    sourceSha256: r.sourceSha256,
    engineVersion: r.engineVersion,
    sentences,
    by: 'engine',
    writtenAt: r.writtenAt,
  };
}
