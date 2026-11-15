import { programSummaryFactsOf } from '@/lib/program-summary-facts';
import { businessInShort, programSummary } from '@/lib/program-summary-text';
import { doesOf, DOES_SENTENCES, type AroundSentence } from '@/lib/around-the-map';

/**
 * "In short" for the home page's Continue card (AB-14c data, stored from v3.2.0 with AB-14b; owner question H-O6,
 * recommendation taken: written server-side when the run is created, no client field, no model).
 *
 * The sentences are the engine's own "What this program does" of the Business page (`doesOf` in
 * `lib/around-the-map.ts`): at most {@link DOES_SENTENCES} sentences, each with its line, cut at the summary's own
 * seams, never led by what the program does not do. Never a model's wording — the card marks it *Reconstructed from
 * the code*, and a model's text would need the AI mark and its check against the facts.
 *
 * Stored on the project document as `inShort`, by the Admin SDK only (`lib/project-in-short-server.ts`, called from
 * `POST /api/runs/create` after the signed transaction). It is not part of the run, its signature or the audit pack,
 * and it is bound to the run it was read for by `runId`: a sentence of an earlier run is never read back for a later
 * one ({@link inShortOf}).
 *
 * Pure: no React, no Firestore, no network, no model. The reader half runs in the browser.
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

/** The engine's "What this program does" for a source, as the Business page reads it — or none. */
export function inShortSentencesOf(source: string, engineVersion: string): AroundSentence[] {
  try {
    const facts = programSummaryFactsOf(source, { engineVersion });
    const lines = businessInShort(programSummary(facts), { codes: false });
    // `null`: no model's proposal is ever taken here.
    return doesOf(lines, null)
      .sentences.map((s) => ({ text: s.text.replace(/\s+/g, ' ').trim(), anchor: s.anchor }))
      .filter((s) => isPlainSentence(s.text) && isAnchorLabel(s.anchor))
      .slice(0, DOES_SENTENCES);
  } catch {
    return [];
  }
}

export interface InShortInput {
  runId: string;
  sourceSha256: string;
  source: string;
  engineVersion: string;
}

/** The record written with a run. Pure — the clock is passed in for the spec. */
export function computeProjectInShort(input: InShortInput, now: Date = new Date()): ProjectInShort {
  return {
    version: PROJECT_IN_SHORT_VERSION,
    runId: input.runId,
    sourceSha256: input.sourceSha256,
    engineVersion: input.engineVersion,
    sentences: inShortSentencesOf(input.source, input.engineVersion),
    by: 'engine',
    writtenAt: now.toISOString(),
  };
}

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
  if (!Array.isArray(r.sentences) || r.sentences.length > DOES_SENTENCES) return null;
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
