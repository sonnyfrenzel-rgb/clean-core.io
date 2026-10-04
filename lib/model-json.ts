/**
 * Reading a JSON object out of a model answer — tolerant of the slips a model
 * makes in *spelling* JSON, strict about everything else.
 *
 * Owner report 03.10.2026: the Transformation stage failed on Z_MM_PO_APPROVAL
 * with "The model answered with text instead of the JSON this stage asked
 * for", and the second try worked. The answer was neither prose nor cut off.
 * `/api/gemini` returned it with HTTP 200, so the provider had reported
 * `finishReason: STOP` (`lib/model-completion.ts` refuses anything else). One
 * real call with the same prompt the same day reproduced it on the first try:
 * a complete answer (`STOP`, 4,737 output tokens, 14,104 characters) that
 * `JSON.parse` refused with "Bad escaped character in JSON at position 10397".
 * The model had written the ABAP string template `|\{ "banfn": ... }|` into a
 * JSON string as `\{` — an escape JSON does not have. ABAP escapes `{`, `}`,
 * `|` and `\` with a backslash inside string templates, so any generated ABAP
 * that builds a JSON payload by hand, which an event publisher does, can carry
 * it. Whether it happens depends on the code the model chose to write, which
 * is why the same prompt failed once and passed once.
 *
 * What is tolerated, in this order, each only when the plain parse failed:
 *
 *   1. one markdown fence around the whole answer (```json … ```);
 *   2. prose before or after the object — the first balanced top-level
 *      object is taken, found by a scanner that knows JSON strings, so a brace
 *      inside a string never counts;
 *   3. inside strings only: a backslash before a character JSON does not
 *      escape is kept as a literal backslash (`\{` reads as the two characters
 *      `\{`, which is what the ABAP source says), and a raw control character
 *      is escaped. Nothing is dropped or invented — the text the model wrote
 *      is the text that comes out.
 *
 * What is never done: `eval`, guessing a missing closing brace, or accepting a
 * value that is not a plain object. Content validation is the caller's and is
 * not touched here.
 *
 * Pure and import-free, so the rules are tested without a model
 * (`tests/model-json.spec.ts`).
 */

export type UnusableJsonReason =
  /** No text at all. */
  | 'empty'
  /** An object opens and never closes — the answer ends inside it. */
  | 'unbalanced'
  /** Text that is not a JSON object, even after the tolerances above. */
  | 'not-json';

export type ModelJsonResult =
  | { ok: true; value: Record<string, unknown>; tolerated: Array<'fence' | 'surrounding-text' | 'escapes'> }
  | { ok: false; reason: UnusableJsonReason };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** One fence around the whole answer, and only then. */
function stripFence(text: string): string | null {
  const m = /^```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```\s*$/.exec(text);
  if (m) return m[1];
  // An opening fence whose closing fence never came: the answer is cut off,
  // and the scanner below reports it as unbalanced.
  const open = /^```[A-Za-z0-9_-]*[ \t]*\r?\n/.exec(text);
  return open ? text.slice(open[0].length) : null;
}

/**
 * The end index (exclusive) of the object that opens at `start`, or -1 when it
 * never closes. String-aware: braces inside strings and escaped quotes do not
 * count.
 */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const VALID_ESCAPE = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't']);

/**
 * Inside strings only: a backslash before a character JSON does not escape
 * becomes a literal backslash, and a raw control character is escaped.
 * Outside strings nothing is changed.
 */
export function repairStringEscapes(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      const next = text[i + 1];
      if (next !== undefined && VALID_ESCAPE.has(next)) {
        out += ch + next;
        i++;
      } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
        out += text.slice(i, i + 6);
        i += 5;
      } else {
        // The backslash the model meant literally; the next character is read
        // on its own on the next turn of the loop.
        out += '\\\\';
      }
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/** The JSON object in a model answer, or the reason there is none. */
export function parseModelJsonObject(answer: string | null | undefined): ModelJsonResult {
  if (typeof answer !== 'string' || !answer.trim()) return { ok: false, reason: 'empty' };
  const trimmed = answer.trim();

  const plain = tryParse(trimmed);
  if (plain.ok) return isPlainObject(plain.value) ? { ok: true, value: plain.value, tolerated: [] } : { ok: false, reason: 'not-json' };

  const tolerated: Array<'fence' | 'surrounding-text' | 'escapes'> = [];
  let body = trimmed;
  const unfenced = stripFence(trimmed);
  if (unfenced !== null) {
    body = unfenced.trim();
    tolerated.push('fence');
  }

  // The first `{` that opens an object which closes and parses. A `{` in the
  // prose before the object is skipped by trying the next one; the number of
  // tries is bounded so a pathological answer cannot make this quadratic.
  let sawUnclosed = false;
  let from = 0;
  for (let tries = 0; tries < 32; tries++) {
    const start = body.indexOf('{', from);
    if (start < 0) break;
    const end = objectEnd(body, start);
    if (end < 0) {
      sawUnclosed = true;
      // An object that never closes swallows everything after it; a later
      // `{` inside it cannot be the outermost object.
      break;
    }
    const candidate = body.slice(start, end);
    const surrounded = start > 0 || end < body.length;
    const direct = tryParse(candidate);
    if (direct.ok && isPlainObject(direct.value)) {
      return { ok: true, value: direct.value, tolerated: surrounded ? [...tolerated, 'surrounding-text'] : tolerated };
    }
    const repaired = tryParse(repairStringEscapes(candidate));
    if (repaired.ok && isPlainObject(repaired.value)) {
      return {
        ok: true,
        value: repaired.value,
        tolerated: [...tolerated, ...(surrounded ? (['surrounding-text'] as const) : []), 'escapes'],
      };
    }
    from = end;
  }
  return { ok: false, reason: sawUnclosed ? 'unbalanced' : 'not-json' };
}

/**
 * Why a generation's answer could not be used, as far as JSON goes: one of the
 * parse reasons above, or the proxy's report that the provider cut the answer
 * off at its length limit (`truncated`).
 */
export type UnusableAnswer = UnusableJsonReason | 'truncated';

/**
 * The proxy's refusal, read as an unusable answer when it is one that a second
 * attempt can fix: cut off at the length limit, or ended without a reason. A
 * content-filter block is not — the same prompt meets the same filter — and
 * neither is any other refusal (rate limit, switched-off stage, no key).
 * Duck-typed on `{ code, reason }` (`GeminiCallError` in `lib/gemini.ts`) so
 * this module stays import-free.
 */
export function unusableFromModelError(err: unknown): UnusableAnswer | null {
  if (typeof err !== 'object' || err === null) return null;
  const { code, reason } = err as { code?: unknown; reason?: unknown };
  if (code !== 'model-incomplete') return null;
  if (reason === 'truncated') return 'truncated';
  if (reason === 'empty') return 'empty';
  if (reason === 'unfinished') return 'unbalanced';
  return null;
}

/**
 * The progress line shown before the one automatic retry. `noun` names what
 * the stage asked for — `package` for Transformation, `test suite` for Testing.
 */
export function retryNotice(first: UnusableAnswer, noun = 'package'): string {
  const what =
    first === 'truncated' || first === 'unbalanced'
      ? 'The first answer was cut off before it was complete.'
      : first === 'empty'
        ? 'The first answer was empty.'
        : `The first answer was not the JSON ${noun} this stage asked for.`;
  return `${what} Retrying once — a second model call …`;
}

/**
 * What the reader is told when no attempt gave a usable answer. Every sentence
 * keeps the stage's promise that nothing was saved, and none calls a cut-off
 * answer "text instead of JSON".
 */
export function unusableAnswerMessage(reason: UnusableAnswer, attempts: number, noun = 'package'): string {
  const kept = 'Nothing was saved — the previous version is untouched.';
  const tries = attempts > 1 ? ` This happened on both attempts (the stage retries once on its own).` : '';
  switch (reason) {
    case 'truncated':
      return `The answer was cut off at the model's length limit — the ${noun} for this program did not fit in one answer.${tries} ${kept} Try the generation again; if it is cut off again, the program is too large to transform in one answer — generate from a smaller part of it.`;
    case 'unbalanced':
      return `The answer ended before its JSON was complete, so it was cut off.${tries} ${kept} Try the generation again.`;
    case 'empty':
      return `The model returned an empty answer.${tries} ${kept} Try the generation again.`;
    default:
      return `The model returned prose instead of the JSON ${noun} this stage asked for.${tries} ${kept} Try again.`;
  }
}
