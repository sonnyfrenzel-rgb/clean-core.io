import { anchorHolds, sourceLines, type RequirementSet } from '@/lib/functional-requirements';

/**
 * A model's proposal for clearer wording of the functional requirements —
 * Optional, asked for by a button only.
 *
 * The engine writes every requirement (`lib/functional-requirements.ts`): its
 * existence, its anchors, its priority, its acceptance criteria. All the model
 * may touch is the one "The system shall …" sentence, and only within what the
 * engine's sentence and the quoted lines already say. The answer is a JSON
 * object; it is validated on the server against the source the server holds:
 *
 *   - an id that is not a requirement of this source is dropped;
 *   - a sentence that does not start with "The system shall", carries
 *     Markdown, is not one sentence or is longer than the limit is dropped;
 *   - a number in the sentence that neither the engine's sentence nor the
 *     anchored lines contain is dropped — a model must not invent a threshold;
 *   - every anchor the sentence cites must exist in the source **and** be one
 *     of that requirement's own anchors; one that is not is dropped with the
 *     reason `anchor-not-in-source` or `anchor-not-of-requirement`.
 *
 * What survives is a proposal: shown with the chip *Model proposal*, the
 * engine's sentence beneath it, in every export too. Pure, no imports beyond
 * the builder.
 */

export const WORDING_FORMAT_VERSION = 1 as const;
export const WORDING_STAGE = 'design' as const;
/** The largest answer the server reads. */
export const MAX_WORDING_ANSWER = 120_000;
export const MAX_STATEMENT_LENGTH = 260;

export type WordingDiscardReason =
  | 'unknown-id'
  | 'duplicate-id'
  | 'not-a-shall'
  | 'markup'
  | 'too-long'
  | 'number-not-in-code'
  | 'no-anchor'
  | 'anchor-not-in-source'
  | 'anchor-not-of-requirement'
  | 'not-json';

export const WORDING_DISCARD_TEXT: Readonly<Record<WordingDiscardReason, string>> = {
  'unknown-id': 'names no requirement of this source',
  'duplicate-id': 'repeats a requirement already worded',
  'not-a-shall': 'does not start with "The system shall"',
  markup: 'carries formatting characters',
  'too-long': 'is longer than one requirement sentence',
  'number-not-in-code': 'states a number the code does not contain',
  'no-anchor': 'cites no line',
  'anchor-not-in-source': 'cites a line that does not exist in the source',
  'anchor-not-of-requirement': 'cites a line that is not one of the requirement’s anchors',
  'not-json': 'is not the JSON object asked for',
};

export interface WordingDiscard {
  id: string | null;
  reason: WordingDiscardReason;
}

export interface WordingValidation {
  /** Requirement id → the proposed sentence that held. */
  wording: Record<string, string>;
  discarded: WordingDiscard[];
}

export interface RequirementWordingRecord {
  formatVersion: typeof WORDING_FORMAT_VERSION;
  /** SHA-256 of the source the requirements were read from. */
  digest: string;
  wording: Record<string, string>;
  discarded: WordingDiscard[];
  origin: {
    source: 'model';
    receipt: 'verified';
    provider: string | null;
    modelId: string | null;
    byok: boolean;
    issuedAt: number | null;
    textSha256: string | null;
  };
  proposedAt: string;
}

export function isRequirementWordingRecord(value: unknown): value is RequirementWordingRecord {
  const r = value as RequirementWordingRecord | null;
  return !!r && typeof r === 'object' && r.formatVersion === WORDING_FORMAT_VERSION
    && typeof r.digest === 'string' && !!r.wording && typeof r.wording === 'object' && !Array.isArray(r.wording)
    && Array.isArray(r.discarded) && !!r.origin && r.origin.source === 'model';
}

/** The prompt. The engine's facts go in; one sentence per id comes back. */
export function wordingPrompt(set: RequirementSet): string {
  const items = set.requirements.map((r) => ({
    id: r.id,
    statement: r.statement,
    rationale: r.rationale,
    anchors: r.anchors.map((a) => (a.lineEnd > a.lineStart ? `L${a.lineStart}-${a.lineEnd}` : `L${a.lineStart}`)),
    code: r.anchors.slice(0, 2).map((a) => a.quote).join('\n'),
  }));
  return [
    'You rewrite functional requirements that were reconstructed from SAP ABAP code, for a requirement specification read by business analysts.',
    'For every item, write ONE plain English sentence that says the same as "statement", more clearly.',
    'Rules:',
    '- Start with "The system shall".',
    '- Keep every fact of "statement"; add none. Use only numbers, codes and names that appear in "statement" or "code".',
    '- Name no currency or unit the code does not state.',
    '- Plain text only: no Markdown, no quotes around the whole sentence, no line breaks. At most 220 characters.',
    '- Cite at least one of the item\'s own "anchors" exactly as given.',
    'Answer with JSON only, in this form:',
    '{"requirements":[{"id":"FR-001","statement":"The system shall …","anchors":["L12"]}]}',
    '',
    'Items:',
    JSON.stringify(items),
  ].join('\n');
}

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}

const ANCHOR = /^L?(\d+)(?:\s*-\s*L?(\d+))?$/i;

function parseAnchor(value: unknown): { lineStart: number; lineEnd: number } | null {
  if (typeof value === 'number' && Number.isInteger(value)) return { lineStart: value, lineEnd: value };
  if (typeof value !== 'string') return null;
  const m = ANCHOR.exec(value.trim());
  if (!m) return null;
  const lineStart = Number(m[1]);
  return { lineStart, lineEnd: m[2] ? Number(m[2]) : lineStart };
}

function cleanJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(t);
}

/**
 * Validate a model answer against the requirement set of `source`. The set is
 * rebuilt by the caller from the source it holds — on the server, the stored one.
 */
export function validateWording(set: RequirementSet, source: string, text: string): WordingValidation {
  const lines = sourceLines(source);
  const out: WordingValidation = { wording: {}, discarded: [] };
  let parsed: unknown;
  try {
    parsed = cleanJson(text);
  } catch {
    out.discarded.push({ id: null, reason: 'not-json' });
    return out;
  }
  const list = (parsed as { requirements?: unknown })?.requirements;
  if (!Array.isArray(list)) {
    out.discarded.push({ id: null, reason: 'not-json' });
    return out;
  }
  const byId = new Map(set.requirements.map((r) => [r.id, r]));
  for (const raw of list.slice(0, 500)) {
    const item = raw as { id?: unknown; statement?: unknown; anchors?: unknown };
    const id = typeof item?.id === 'string' ? item.id.trim() : null;
    const req = id ? byId.get(id) : undefined;
    const drop = (reason: WordingDiscardReason) => out.discarded.push({ id: id && id.length <= 20 ? id : null, reason });
    if (!req || !id) { drop('unknown-id'); continue; }
    if (out.wording[id]) { drop('duplicate-id'); continue; }
    const statement = typeof item.statement === 'string' ? item.statement.replace(/\s+/g, ' ').trim() : '';
    if (!statement.startsWith('The system shall ')) { drop('not-a-shall'); continue; }
    if (/[*_#`[\]<>]|\n/.test(statement)) { drop('markup'); continue; }
    if (statement.length > MAX_STATEMENT_LENGTH || (statement.match(/[.!?](\s|$)/g) ?? []).length > 1) { drop('too-long'); continue; }
    const known = new Set([...numbersIn(req.statement), ...req.anchors.flatMap((a) => numbersIn(a.quote))]);
    const citedLines = new Set<number>();
    const anchors = Array.isArray(item.anchors) ? item.anchors.map(parseAnchor) : [];
    if (!anchors.length || anchors.some((a) => a === null)) { drop('no-anchor'); continue; }
    let anchorProblem: WordingDiscardReason | null = null;
    for (const a of anchors as Array<{ lineStart: number; lineEnd: number }>) {
      if (!anchorHolds(a, lines)) { anchorProblem = 'anchor-not-in-source'; break; }
      const own = req.anchors.some((r) => a.lineStart >= r.lineStart && a.lineEnd <= r.lineEnd);
      if (!own) { anchorProblem = 'anchor-not-of-requirement'; break; }
      for (let l = a.lineStart; l <= a.lineEnd; l++) citedLines.add(l);
    }
    if (anchorProblem) { drop(anchorProblem); continue; }
    // Line numbers the sentence names are anchors, not facts; everything else must be in the code.
    const withoutLineRefs = statement.replace(/\bL\d+(?:-\d+)?\b/g, '');
    if (numbersIn(withoutLineRefs).some((n) => !known.has(n))) { drop('number-not-in-code'); continue; }
    out.wording[id] = statement;
  }
  return out;
}
