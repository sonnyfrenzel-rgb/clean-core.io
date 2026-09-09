import type { EvidenceFinding } from './evidence-model';

/**
 * Ties every sentence of the model's narrative back to a line of code, or says
 * plainly that it could not be tied to one.
 *
 * Both roadmaps written for this product name traceability as the first of three
 * conditions without which the whole business proposition fails — "a narrative
 * without line references is an LLM opinion, and that is what the consultancies
 * already sell" — and both then schedule it for 2027 behind two full releases.
 * A precondition postponed sixteen months is not a precondition.
 *
 * It was also costed as weeks of work. It is not: `EvidenceFinding` has carried
 * `id`, `lineStart` and `lineEnd` since the engine was written, so every
 * statement the model is asked to make already has something true to point at.
 * The work is the contract — asking for citations, then checking them — not new
 * analysis.
 *
 * Two anchor forms, and the difference between them matters:
 *
 *   [F-017]     a finding id. Verifiable: the id is either in the evidence
 *               report the model was given, or it was invented.
 *   [L380-412]  a raw line range. Checkable only against the file's length,
 *               so it can be plausible and still wrong.
 *
 * Anything that fails validation is *not* silently dropped. An invented anchor is
 * a more serious event than a missing one — a sentence with no citation is
 * honestly unevidenced, while a sentence citing F-999 is dressed up as evidence
 * it does not have — so the two are counted and reported separately.
 */

export type AnchorKind = 'finding' | 'lines';

export interface ResolvedAnchor {
  /** Verbatim, as it appeared in the text. */
  raw: string;
  kind: AnchorKind;
  /** Finding id, when the anchor named one. */
  findingId?: string;
  lineStart: number;
  lineEnd: number;
}

export type SentenceStatus = 'anchored' | 'unevidenced' | 'invalid-anchor';

export interface NarrativeSentence {
  /** The sentence with its anchor markers removed, for display. */
  text: string;
  anchors: ResolvedAnchor[];
  /** Anchors that did not resolve — an invented id, or a line past the file. */
  rejected: string[];
  status: SentenceStatus;
}

export interface AnchoredNarrative {
  sentences: NarrativeSentence[];
  anchoredCount: number;
  unevidencedCount: number;
  invalidCount: number;
  totalCount: number;
  /**
   * Share of sentences carrying at least one valid anchor, 0–100.
   *
   * `null` when there are no sentences. A rate over nothing is not 100 % — that
   * is the shape of claim this whole exercise exists to stop.
   */
  traceabilityRate: number | null;
}

/** `[F-017]`, `[L380]`, `[L380-412]` — case-insensitive, tolerant of spaces. */
const ANCHOR_PATTERN = /\[\s*(?:(F-[A-Za-z0-9_-]+)|L\s*(\d+)\s*(?:[-–]\s*(\d+))?)\s*\]/gi;

/**
 * Split prose into sentences.
 *
 * Deliberately conservative: it breaks on `.`, `!` or `?` followed by whitespace
 * and a capital or digit, and refuses to break after a known abbreviation or a
 * single capital letter. ABAP prose is full of things a naive splitter mangles —
 * `e.g.`, `I_SalesDocument`, `Rel. 2023` — and a splitter that invents sentence
 * boundaries would invent unevidenced sentences along with them.
 */
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'cf', 'approx', 'no', 'fig', 'rel', 'st', 'dr', 'mr', 'ms']);

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    const after = text.slice(i + 1);
    const boundary = /^\s+["'(]?[A-Z0-9]/.test(after) || /^\s*$/.test(after);
    if (!boundary) continue;

    if (ch === '.') {
      const before = text.slice(start, i);
      const lastWord = (before.match(/([A-Za-z.]+)$/)?.[1] || '').toLowerCase();
      // "e.g." and friends, and a lone initial such as "J." — not endings.
      if (ABBREVIATIONS.has(lastWord.replace(/\.$/, '')) || /^[a-z]$/i.test(lastWord)) continue;
    }

    const sentence = text.slice(start, i + 1).trim();
    if (sentence) out.push(sentence);
    start = i + 1;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Read the anchors out of one sentence and check each against the evidence.
 *
 * `totalLines` is the length of the analysed file. Without it a line anchor
 * cannot be falsified at all, so it is required rather than optional — an
 * unfalsifiable check is decoration.
 */
function resolveAnchors(
  sentence: string,
  findingsById: Map<string, EvidenceFinding>,
  totalLines: number,
): { anchors: ResolvedAnchor[]; rejected: string[]; stripped: string } {
  const anchors: ResolvedAnchor[] = [];
  const rejected: string[] = [];

  for (const match of sentence.matchAll(ANCHOR_PATTERN)) {
    const raw = match[0];
    const findingId = match[1];

    if (findingId) {
      const finding = findingsById.get(findingId.toUpperCase());
      if (!finding) {
        rejected.push(raw);
        continue;
      }
      anchors.push({
        raw,
        kind: 'finding',
        findingId: finding.id,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd ?? finding.lineStart,
      });
      continue;
    }

    const from = Number(match[2]);
    const to = match[3] ? Number(match[3]) : from;
    const sane = Number.isInteger(from) && from >= 1 && to >= from && to <= totalLines;
    if (!sane) {
      rejected.push(raw);
      continue;
    }
    anchors.push({ raw, kind: 'lines', lineStart: from, lineEnd: to });
  }

  const stripped = sentence.replace(ANCHOR_PATTERN, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
  return { anchors, rejected, stripped };
}

/**
 * Turn a block of narrative into sentences with their evidence attached.
 *
 * Nothing is removed. A sentence the model could not or would not cite stays in
 * the output marked `unevidenced`, because deleting it would leave a narrative
 * that reads as fully sourced while the gaps are invisible — a worse outcome
 * than an honest gap, and the exact failure the anchors exist to prevent.
 */
export function anchorNarrative(
  text: string,
  findings: EvidenceFinding[],
  totalLines: number,
): AnchoredNarrative {
  const findingsById = new Map(findings.map((f) => [f.id.toUpperCase(), f]));
  const sentences: NarrativeSentence[] = [];

  for (const raw of splitSentences(text || '')) {
    const { anchors, rejected, stripped } = resolveAnchors(raw, findingsById, totalLines);
    const status: SentenceStatus =
      anchors.length > 0 ? 'anchored' : rejected.length > 0 ? 'invalid-anchor' : 'unevidenced';
    sentences.push({ text: stripped || raw, anchors, rejected, status });
  }

  const anchoredCount = sentences.filter((s) => s.status === 'anchored').length;
  const invalidCount = sentences.filter((s) => s.status === 'invalid-anchor').length;
  const unevidencedCount = sentences.filter((s) => s.status === 'unevidenced').length;

  return {
    sentences,
    anchoredCount,
    unevidencedCount,
    invalidCount,
    totalCount: sentences.length,
    traceabilityRate: sentences.length ? Math.round((anchoredCount / sentences.length) * 100) : null,
  };
}

/**
 * The instruction handed to the model, kept next to the parser that enforces it.
 *
 * A prompt in one file and its validator in another drift, and a validator that
 * has drifted from its prompt rejects correct output — which trains whoever is
 * left to loosen the validator.
 */
export function anchorInstruction(findings: EvidenceFinding[]): string {
  const ids = findings.slice(0, 40).map((f) => `${f.id} (lines ${f.lineStart}${f.lineEnd && f.lineEnd !== f.lineStart ? `–${f.lineEnd}` : ''}: ${f.title})`);
  return [
    'CITATIONS — every prose field below must be traceable to the code.',
    '',
    'End each sentence that makes a claim about this program with an anchor:',
    '  [F-017]     cite a finding id from the evidence report above, or',
    '  [L380-412]  cite a line range in the file.',
    '',
    'Rules:',
    '- Only cite finding ids that appear in the evidence report. An id that is not',
    '  there is treated as a fabrication and is reported as one — an uncited',
    '  sentence is accepted, an invented citation is not.',
    '- Only cite line numbers that exist in the file.',
    '- If a sentence is general advice rather than a statement about this code,',
    '  leave it uncited. That is a valid outcome and is labelled as such.',
    '',
    ids.length ? `Finding ids available:\n${ids.map((i) => `  ${i}`).join('\n')}` : '',
  ].join('\n');
}
