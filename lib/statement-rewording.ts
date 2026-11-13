import type { StatementContext } from './business-statement-prompt';

/**
 * The business statements reworded for a business reader — strategy c of the
 * model-combination study (owner decision 13.11.2026, `docs/design/model-combination.md` §3.6).
 *
 * The draft of the statements stage (`lib/business-statement-prompt.ts`) says
 * everything the code does, anchored line by line, and reads technically: field
 * and table names where a business term belongs. Measured blind on the 150
 * learn cases of the process benchmark, 48 % of the draft's sentences were
 * marked technical. This module hands the checked draft back to the product
 * model at a low thinking level with one order — say it for a business reader,
 * keep every fact — and reads the answer sentence by sentence against the
 * draft. A rewording stands only when it kept what the draft said; otherwise
 * the draft's sentence stands, and the reader never sees the difference as an
 * error. Measured: 87.8 % of the expected statements equal (draft alone
 * 85.2 %), technical sentences 20 % (draft 48 %).
 *
 * **The prompt is not the defence.** `mergeStatementRewording` is:
 *
 *   - the anchors, the element and the (absent) uncertainty must be exactly the
 *     draft's — a rewording may not move a sentence to other lines;
 *   - every number and every quoted literal of the draft must stand in the
 *     rewording; an identifier the draft did not name may not appear;
 *   - the words that carry control flow (ends, stops, is left, is skipped,
 *     continues, …) must be the same families on both sides. The one wrong
 *     sentence the measured rewording added came from here: "start-of-selection
 *     is left" became "processing ends", and the log that is still written was
 *     gone with it;
 *   - the words that carry a negation or a limit ("not", "only", "without",
 *     "unless", … as `lib/plain-wording.ts` counts them) must be as many on
 *     both sides;
 *   - one sentence of at most the statement bound, no Markdown, no line break.
 *
 * Deterministic, so the server merges what the browser previewed and the
 * stored sentences are a function of the two answers the receipts bind
 * (`app/api/projects/[projectId]/statement-proposal/route.ts`). The merged
 * answer is then validated like a draft (`validateStatementAnswer`), so an
 * anchor the draft never had cannot enter through the rewording either.
 *
 * Pure: the browser and the route both read this file. The prompt text is the
 * one the measurement used, character for character; a change here is a new
 * measurement (`tests/prozess-benchmark/weg-b-model.ts --mode rewrite`).
 */

/** The answer shape within the statements stage (`lib/model-response-schema.ts`); thinks LOW (`lib/model-thinking.ts`). */
export const STATEMENT_REWORDING_SHAPE = 'statements-rewording' as const;

/** Bumped when the prompt below changes; the measurement is of version 1. */
export const STATEMENT_REWORDING_PROMPT_VERSION = 1;

/**
 * The deployment's switch: `GEMINI_STATEMENTS_REWORDING=on` on the service.
 * Off unless set — the product asks for the draft alone, as before. Read on the
 * server and reported to the browser by `GET /api/model-stages`.
 */
export const STATEMENTS_REWORDING_ENV = 'GEMINI_STATEMENTS_REWORDING';

export function statementsRewordingOn(env: Readonly<Record<string, string | undefined>>): boolean {
  return (env[STATEMENTS_REWORDING_ENV] ?? '').trim().toLowerCase() === 'on';
}

/** The longest sentence a rewording may be — the statement bound of `lib/business-statement-prompt.ts`. */
export const REWORDING_MAX_LENGTH = 400;

/** What the rewording is given and read against: the checked draft's sentence, where it stands, which element. */
export interface RewordableStatement {
  text: string;
  anchors: ReadonlyArray<{ file: string; lineStart: number }>;
  element: { id: string } | null;
}

/** The prompt. Its text is the measured one; see the module header. */
export function buildStatementRewordingPrompt(context: StatementContext, statements: readonly RewordableStatement[]): string {
  const given = statements.map((s) => ({
    text: s.text,
    anchors: anchorsOf(s),
    element: s.element?.id ?? null,
    uncertainty: null,
  }));
  const lines: string[] = [
    'You reword business statements about a piece of ABAP code for a business reader who does not read ABAP.',
    '',
    'Below is a JSON list of statements. Each is anchored to code lines and may name a process element. Reword only the "text":',
    '1. Say what happens in business terms: name the business thing (the customer, the order quantity, the posting date), not the',
    '   variable or the technical field. A table or field name may stay at most once, in parentheses, where no business term is evident.',
    '2. Keep every fact: every literal value, number, comparison boundary, condition and outcome, every "not", "only", "unless".',
    '   Do not add a fact, an assessment or a consequence the statement does not state. Do not drop a clause.',
    '3. One sentence, English, passive voice, plain words, no Markdown, no backticks, at most 300 characters. Merge nothing, split nothing.',
    '4. Keep "anchors", "element" and "uncertainty" exactly as given, in the same order: one output statement per input statement.',
    '',
    'Answer with JSON only, in exactly this shape and with no other keys:',
    '{"statements":[{"text":"<reworded statement>","anchors":["<file>:<line>"],"element":"<as given>","uncertainty":"<as given>"}]}',
    '',
    'Statements:',
    JSON.stringify(given),
  ];
  for (const src of context.sources) {
    lines.push('', `Source ${src.name}, with line numbers (for the facts; describe nothing that is not in a statement above):`);
    src.code.split('\n').slice(0, src.lineCount).forEach((text, index) => {
      lines.push(`${String(index + 1).padStart(4)}  ${text}`);
    });
  }
  return lines.join('\n');
}

function anchorsOf(s: RewordableStatement): string[] {
  return s.anchors.map((a) => `${a.file}:${a.lineStart}`);
}

/* ------------------------------------------------------------------ *
 * The guard. A rewording that fails any rule leaves the draft's sentence.
 * ------------------------------------------------------------------ */

export type RewordingRejection =
  /** The answer has no entry at this position, or not an object. */
  | 'missing'
  | 'malformed'
  | 'anchors-changed'
  | 'element-changed'
  /** The rewording carries an uncertainty of its own; the draft's sentence already holds its caveat. */
  | 'uncertainty-added'
  | 'empty'
  | 'too-long'
  | 'markup'
  /** A number or a quoted literal of the draft is gone. */
  | 'fact-lost'
  /** An identifier (table, field, variable, class) the draft did not name. */
  | 'identifier-added'
  /** The control-flow words differ: a step that ended, stopped, was left or skipped in one sentence and not in the other. */
  | 'control-flow'
  /** Fewer or more negations or limits than the draft. */
  | 'negation-changed'
  /** Word for word the draft's sentence. Kept as the draft's, not counted as reworded. */
  | 'unchanged';

/**
 * The families of words that carry control flow. A rewording and its draft
 * must name the same families — not the same words: "is left" and "leaves"
 * are one family, "ends" and "end" another. "return code" and "return value"
 * are data, not flow, and are left out of the return family.
 */
const CONTROL_FLOW_FAMILIES: ReadonlyArray<{ name: string; words: RegExp }> = [
  { name: 'leave', words: /\b(?:leav\w*|left)\b/gi },
  { name: 'exit', words: /\bexit\w*\b/gi },
  { name: 'return', words: /\breturn\w*\b(?!\s+(?:code|value|codes|values|parameter|parameters))/gi },
  { name: 'stop', words: /\b(?:stop\w*|halt\w*)\b/gi },
  { name: 'end', words: /\b(?:end|ends|ended|ending|terminat\w*|finish\w*)\b/gi },
  { name: 'abort', words: /\babort\w*\b/gi },
  { name: 'skip', words: /\b(?:skip\w*|bypass\w*|omit\w*)\b/gi },
  { name: 'continue', words: /\b(?:continu\w*|proceed\w*|resum\w*|goes on|go on|carries on|carry on)\b/gi },
  // Explicit loop words only: "each", "every" and "per" are how a business reader says the same thing
  // ("for every order", "per customer") and would reject a rewording for saying it plainly.
  { name: 'loop', words: /\b(?:loop\w*|repeat\w*|iterat\w*|one by one|in turn)\b/gi },
];

/**
 * The words that carry a negation or a limit, counted per family on both
 * sides — the same generous lists `lib/plain-wording.ts` uses, so the two
 * rewordings of the product read the same words as meaning.
 */
const LIMIT_FAMILIES: readonly RegExp[] = [
  /\b(?:not|no|never|none|nothing|nobody|without|unless|except|excepting|neither|nor|cannot|other than|rather than|instead|missing|absent|(?:exclud|fail|lack|block|reject|avoid|prevent|ceas|eliminat|remov|disappear)\w*|un(?:listed|used|met|handled|processed|answered|reached|reachable|necessary|changed|known|available|authori[sz]ed))\b|n['’]t\b/gi,
  /\b(?:only|solely|exclusively|just|merely|alone|hard-?coded|fixed)\b/gi,
];

const countOf = (family: RegExp, text: string): number => (text.match(family) ?? []).length;
const familiesIn = (text: string): Set<string> => new Set(CONTROL_FLOW_FAMILIES.filter((f) => countOf(f.words, text) > 0).map((f) => f.name));

/** The numbers and quoted literals of a sentence, as they must reappear. */
export function factsOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/'[^']*'|"[^"]*"|\b\d+(?:[.,]\d+)?\b/g)) {
    const raw = m[0];
    out.push(raw.startsWith('"') ? `'${raw.slice(1, -1)}'` : raw);
  }
  return out;
}

/** Identifiers as ABAP names them: upper-case tokens of three or more characters, digits and underscores allowed. */
function identifiersOf(text: string): Set<string> {
  return new Set([...text.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)].map((m) => m[0]));
}

function sameAnchors(given: unknown, draft: RewordableStatement): boolean {
  if (!Array.isArray(given) || !given.every((a) => typeof a === 'string')) return false;
  const a = [...(given as string[])].map((s) => s.trim()).sort();
  const b = [...anchorsOf(draft)].sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Why one rewording may not stand against its draft, or null when it may. */
export function rewordingProblem(draft: RewordableStatement, entry: unknown): RewordingRejection | null {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return 'missing';
  const r = entry as Record<string, unknown>;
  if (typeof r.text !== 'string') return 'malformed';
  if (!sameAnchors(r.anchors, draft)) return 'anchors-changed';
  if ((typeof r.element === 'string' ? r.element.trim() : null) !== (draft.element?.id ?? null)) return 'element-changed';
  if (r.uncertainty != null && !(typeof r.uncertainty === 'string' && r.uncertainty.trim() === '')) return 'uncertainty-added';
  const text = r.text.replace(/\s+/g, ' ').trim();
  const original = draft.text.replace(/\s+/g, ' ').trim();
  if (!text) return 'empty';
  if (text.length > REWORDING_MAX_LENGTH) return 'too-long';
  if (/\n/.test(r.text) || /[*#`<>[\]{}|]/.test(text)) return 'markup';
  if (text === original) return 'unchanged';
  if (factsOf(original).some((f) => !text.includes(f))) return 'fact-lost';
  const known = identifiersOf(original);
  if ([...identifiersOf(text)].some((id) => !known.has(id))) return 'identifier-added';
  const flowDraft = familiesIn(original);
  const flowReworded = familiesIn(text);
  if (flowDraft.size !== flowReworded.size || [...flowDraft].some((f) => !flowReworded.has(f))) return 'control-flow';
  if (LIMIT_FAMILIES.some((family) => countOf(family, text) !== countOf(family, original))) return 'negation-changed';
  return null;
}

export interface RewordingMerge {
  /** The merged answer, in the statements stage's answer format, for `validateStatementAnswer`. */
  text: string;
  reworded: number;
  kept: number;
  rejected: Partial<Record<RewordingRejection, number>>;
  /** Per draft statement, in order: true when the rewording stands. */
  wordedByModel: boolean[];
}

/**
 * The reworded answer read against the draft, statement by statement. Never
 * throws: an answer that is not JSON, not an object or short keeps every
 * draft sentence, and says so in `rejected`.
 */
export function mergeStatementRewording(draft: readonly RewordableStatement[], answer: unknown): RewordingMerge {
  let entries: unknown[] = [];
  if (typeof answer === 'string') {
    try {
      const parsed = JSON.parse(answer) as { statements?: unknown };
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.statements)) entries = parsed.statements;
    } catch {
      entries = [];
    }
  }
  const rejected: Partial<Record<RewordingRejection, number>> = {};
  const wordedByModel: boolean[] = [];
  let reworded = 0;
  let kept = 0;
  const statements = draft.map((d, i) => {
    const problem = rewordingProblem(d, entries[i]);
    const base = { anchors: anchorsOf(d), element: d.element?.id ?? null, uncertainty: null };
    if (problem === null) {
      reworded += 1;
      wordedByModel.push(true);
      return { text: ((entries[i] as Record<string, unknown>).text as string).replace(/\s+/g, ' ').trim(), ...base };
    }
    rejected[problem] = (rejected[problem] ?? 0) + 1;
    kept += 1;
    wordedByModel.push(false);
    return { text: d.text, ...base };
  });
  return { text: JSON.stringify({ statements }), reworded, kept, rejected, wordedByModel };
}
