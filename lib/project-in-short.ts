import { programSummaryFactsOf } from '@/lib/program-summary-facts';
import { businessInShort, programSummary } from '@/lib/program-summary-text';
import { doesOf, DOES_SENTENCES, type AroundSentence } from '@/lib/around-the-map';
import { isAnchorLabel, isPlainSentence, PROJECT_IN_SHORT_VERSION, type ProjectInShort } from '@/lib/project-in-short-read';

/**
 * "In short" for the home page's Continue card (AB-14c data, stored from 3.2.0 with AB-14b; owner question H-O6,
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
 * Pure: no React, no Firestore, no network, no model. The reader half, which the browser runs, is
 * `lib/project-in-short-read.ts` (no engine in its import graph); it is re-exported here.
 */

export {
  IN_SHORT_SENTENCE_MAX,
  inShortOf,
  isAnchorLabel,
  isPlainSentence,
  PROJECT_IN_SHORT_VERSION,
  type ProjectInShort,
} from '@/lib/project-in-short-read';

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
