import type { DocAnchor } from '@/lib/process-documentation';
import type { ProvenanceValue } from '@/lib/provenance';
import {
  absentClaims,
  assertsCapability,
  isOrganisational,
  readCapabilityFacts,
  type CapabilityFacts,
} from '@/lib/documentation-capabilities';

/**
 * Every sentence of the business SOP with its basis — owner 11.10.2026, on the
 * external review of the FI Collection Worklist package (F-06: "good technical
 * evidence becomes false certainty in the business SOP").
 *
 * The process documentation already marks each statement Reconstructed, Model
 * proposal or Not determined. The SOP did not: a model's narrative stood as one
 * paragraph under a step the code proves, and read as if the code proved it —
 * "cross-checked against company ledger control totals", "override with the
 * approval of the AR Lead", "a RACI with job titles". From here on the SOP
 * carries the same provenance, sentence by sentence:
 *
 *   - **Reconstructed** — the model tagged the sentence as read from the code
 *     and the sentence *is* one the engine wrote for this step (`stepSentences`:
 *     the 17.7 sentence at the element, an engine sentence of the step's own
 *     lines, or the step's plain name — compared after folding case, spaces,
 *     quotes and the closing stop), and nothing in it asserts a capability the
 *     source shows to be absent. Its lines are the engine sentence's lines.
 *     A cited line alone is not enough (QA review of 35b97d90c6e1): a line of
 *     the step shows *that* something happens there, not that the model's
 *     sentence says it right — "the worklist shows each open item" at a
 *     `SELECT` line is the model's wording;
 *   - **Model proposal** — the model's wording, unchecked. Where the model
 *     cited lines of the step they stay with the sentence as a pointer
 *     ("Model proposal, cites L24"), never as proof;
 *   - **Proposal — not in the program** — an organisational element the code
 *     cannot hold (roles and job titles, approval, override, escalation, dual
 *     control, policy) or a capability the engine shows to be absent (posting
 *     without a COMMIT or a changed table, ledger reconciliation without a
 *     ledger read, credit exposure, correspondence, an audit log). Never shown
 *     as current practice;
 *   - **Confirmed** — what the owner recorded (the RACI the owner saved);
 *   - **Not determined** — the field is empty.
 *
 * The check is deterministic and runs on every rendering — the stage, the
 * Confluence page and the delivery package's `business-documentation.md` — so
 * a layer stored before this rule is read under it too: its narrative is split
 * into sentences, each a proposal at best.
 *
 * Pure and engine-free.
 */

export type SopBasis = 'reconstructed' | 'proposed' | 'not-in-program' | 'not-determined' | 'confirmed';

export interface SopStatement {
  text: string;
  basis: SopBasis;
  /**
   * Reconstructed: the lines of the engine sentence it is. Model proposal: the
   * lines of the step the model cited — a pointer, not proof. Otherwise empty.
   */
  anchors: DocAnchor[];
  /** Why it has this basis, when it is not the plain one: the capability that is absent, the line that did not hold it. */
  reason: string | null;
  /** The reason in a few words, printed beside the sentence in a file: "no posting in the code", "organisational". */
  short?: string | null;
}

/** How each basis reads, and the chip it maps to (`lib/provenance.ts` holds the words of the chips). */
export const SOP_BASIS: Readonly<Record<SopBasis, { label: string; chip: ProvenanceValue; note?: string }>> = {
  reconstructed: { label: 'Reconstructed', chip: 'reconstructed', note: 'from the code' },
  proposed: { label: 'Model proposal', chip: 'proposed' },
  'not-in-program': { label: 'Proposal — not in the program', chip: 'proposed', note: 'not in the program' },
  'not-determined': { label: 'Not determined', chip: 'not-determined' },
  confirmed: { label: 'Confirmed', chip: 'confirmed' },
};

export const ORGANISATIONAL_REASON =
  'An organisational element the code cannot hold — roles, approval, escalation or policy are for the business to decide.';
export const EXCEPTION_REASON =
  'A business fallback the program does not have: the code shows the message, not who handles it.';
const NO_LINE_REASON = 'The model named no line of this step that holds it.';
const NOT_ENGINE_REASON = 'The model\'s wording: the engine wrote no such sentence for this step, so the cited line is a pointer, not proof.';

/** A sentence the engine wrote for a step, with its lines (`stepSentencesOf` in `lib/business-sop-prompt.ts`). */
export interface SopSentence {
  text: string;
  anchors: DocAnchor[];
}

const lineWords = (anchors: readonly DocAnchor[]) => {
  const lines = [...new Set(anchors.map((a) => (a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`)))];
  return `${lines.slice(0, 3).join(', ')}${lines.length > 3 ? ' …' : ''}`;
};
const UNCHECKED_REASON = 'The program\'s capabilities were not recorded with this documentation, so this cannot be checked against the code.';

/** "Reconstructed, L42" · "Model proposal" · "Model proposal, cites L42" · "Proposal — not in the program". */
export function sopBasisText(s: Pick<SopStatement, 'basis' | 'anchors'>): string {
  const label = SOP_BASIS[s.basis].label;
  if (!s.anchors.length) return label;
  if (s.basis === 'reconstructed') return `${label}, ${lineWords(s.anchors)}`;
  if (s.basis === 'proposed') return `${label}, cites ${lineWords(s.anchors)}`;
  return label;
}

/** A sentence with its basis, for a file: "The list shows … (Reconstructed, L42)". */
export function sopStatementLine(s: SopStatement): string {
  return `${s.text} (${sopBasisText(s)}${s.basis === 'not-in-program' && s.short ? `: ${s.short}` : ''})`;
}

export interface SopContext {
  /** The step's lines: the call and the body of the routine it runs. Empty: no line can carry a claim. */
  stepLines: readonly DocAnchor[];
  /** What the program can do (`CapabilityFacts`); null when not recorded — then nothing is upgraded. */
  facts: CapabilityFacts | null;
  /** The role names the proposal uses — a sentence that names one is organisational. */
  roles?: readonly string[];
  /** The engine's sentences of the step (`SopSentence`). None: no claim is Reconstructed. */
  stepSentences?: readonly SopSentence[];
}

/** A sentence folded for comparison: case, spaces, typographic quotes and dashes, the closing stop. */
const fold = (t: string) => t
  .replace(/[“”„"]/g, '"')
  .replace(/[‘’‚']/g, "'")
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/[.!?]+$/, '')
  .toLowerCase();

const clean = (value: unknown): string | null => {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t && !/^(?:n\/?a|none|-|—)$/i.test(t) ? t : null;
};

/** The sentences of a paragraph. */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z“"(])/).map((s) => s.trim()).filter(Boolean);
}

const lineNumbers = (value: unknown): number[] => {
  const raw = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v === 'number' && Number.isInteger(v) && v > 0) out.push(v);
    else if (typeof v === 'string') {
      for (const m of v.matchAll(/(\d+)(?:\s*[-–]\s*(\d+))?/g)) {
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        if (a > 0 && b >= a && b - a < 2000) out.push(a, ...(b > a ? [b] : []));
      }
    }
  }
  return [...new Set(out)];
};

const within = (line: number, ranges: readonly DocAnchor[]) => ranges.some((r) => r.lineStart <= line && line <= r.lineEnd);

/**
 * One sentence of the model, judged. `claimedCode` is the model's own tag
 * (`basis: "code"`); a sentence without a tag is a proposal at best.
 */
export function judgeSentence(text: string, claimedCode: boolean, lines: readonly number[], ctx: SopContext): SopStatement {
  const absent = absentClaims(text, ctx.facts);
  if (absent.length) return { text, basis: 'not-in-program', anchors: [], reason: absent[0].reason, short: absent[0].short };
  if (isOrganisational(text, ctx.roles ?? [])) return { text, basis: 'not-in-program', anchors: [], reason: ORGANISATIONAL_REASON, short: 'organisational' };
  if (!claimedCode) return { text, basis: 'proposed', anchors: [], reason: null };
  if (!ctx.facts && assertsCapability(text)) return { text, basis: 'proposed', anchors: [], reason: UNCHECKED_REASON };
  const own = fold(text);
  const engine = (ctx.stepSentences ?? []).find((s) => s.anchors.length > 0 && fold(s.text) === own);
  if (engine) return { text, basis: 'reconstructed', anchors: engine.anchors.map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd })), reason: null };
  const held = lines.filter((l) => within(l, ctx.stepLines));
  if (!held.length) return { text, basis: 'proposed', anchors: [], reason: NO_LINE_REASON };
  return { text, basis: 'proposed', anchors: held.map((l) => ({ lineStart: l, lineEnd: l })), reason: NOT_ENGINE_REASON };
}

/**
 * The statements of one SOP row: the model's claims when it tagged them
 * (`claims: [{ text, basis: "code" | "proposal", lines }]`), else the
 * sentences of its narrative, each a proposal at best. The business exception
 * is always an organisational proposal.
 */
export function sopStatementsOf(
  row: Record<string, unknown> | undefined,
  ctx: SopContext,
): { statements: SopStatement[]; exception: SopStatement | null } {
  if (!row) return { statements: [], exception: null };
  const statements: SopStatement[] = [];
  if (Array.isArray(row.claims) && row.claims.length) {
    for (const claim of row.claims) {
      if (!claim || typeof claim !== 'object') continue;
      const c = claim as Record<string, unknown>;
      const text = clean(c.text);
      if (!text) continue;
      const code = typeof c.basis === 'string' && /^(?:code|reconstructed|source)$/i.test(c.basis.trim());
      statements.push(judgeSentence(text, code, lineNumbers(c.lines), ctx));
    }
  } else {
    const narrative = clean(row.narrative);
    for (const sentence of narrative ? splitSentences(narrative) : []) statements.push(judgeSentence(sentence, false, [], ctx));
  }
  const exceptionText = clean(row.businessException);
  const exception: SopStatement | null = exceptionText
    ? { text: exceptionText, basis: 'not-in-program', anchors: [], reason: EXCEPTION_REASON, short: 'a business fallback' }
    : null;
  return { statements, exception };
}

/** The facts a stored layer carries (written with it since 3.0.10), when the caller has none of its own. */
export function layerFacts(layer: unknown): CapabilityFacts | null {
  return layer && typeof layer === 'object' ? readCapabilityFacts((layer as Record<string, unknown>).facts) : null;
}

/**
 * The engine's sentences a stored row carries (`stepSentences`, written by
 * `enrichBusinessLayer`, which drops any the model wrote). A row stored without
 * them has no claim Reconstructed — generating the layer again records them.
 */
export function rowSentences(row: Record<string, unknown> | undefined): SopSentence[] {
  if (!row || !Array.isArray(row.stepSentences)) return [];
  const out: SopSentence[] = [];
  for (const s of row.stepSentences) {
    if (!s || typeof s !== 'object') continue;
    const { text, anchors } = s as { text?: unknown; anchors?: unknown };
    if (typeof text !== 'string' || !Array.isArray(anchors)) continue;
    const valid = anchors
      .filter((a): a is DocAnchor => !!a && typeof a === 'object' && Number.isInteger((a as DocAnchor).lineStart) && Number.isInteger((a as DocAnchor).lineEnd))
      .map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd }));
    if (valid.length) out.push({ text, anchors: valid });
  }
  return out;
}

/** The step lines a stored row carries (`stepLines`, written with it since 3.0.10). */
export function rowLines(row: Record<string, unknown> | undefined): DocAnchor[] {
  if (!row || !Array.isArray(row.stepLines)) return [];
  return row.stepLines
    .filter((a): a is DocAnchor => !!a && typeof a === 'object' && Number.isInteger((a as DocAnchor).lineStart) && Number.isInteger((a as DocAnchor).lineEnd))
    .map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd }));
}
