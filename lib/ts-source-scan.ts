/**
 * A small lexical reading of generated TypeScript/JavaScript: which characters
 * are code, and which are inside a string, a comment, a regular expression or
 * the text of a template literal.
 *
 * Pure, no imports. Used by the mutant generator (`lib/testing-mutation.ts`),
 * the endpoint detection of the invariants (`lib/testing-invariants.ts`) and
 * the hard-coded-literal lint (`lib/code-draft-rules.ts`): each of them must
 * not mistake `"a <= b"` in a message or `// req.query.x` in a comment for code.
 *
 * It is a heuristic reader, not a parser. A `/` starts a regular expression
 * where an operand is expected (after `(`, `,`, `=`, an operator, `return`, …)
 * and is a division elsewhere — the rule every JavaScript tokenizer without a
 * grammar uses. What it gets wrong it gets wrong the same way every time.
 */

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
const REGEX_AFTER_CHAR = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

/**
 * `mask[i] === 1` when `src[i]` is code. Quotes, comment markers and regex
 * slashes are not code; `${` and `}` of a template substitution are.
 */
export function codeMask(src: string): Uint8Array {
  const n = src.length;
  const mask = new Uint8Array(n);
  // One entry per open `{`: true when it is the `${` of a template.
  const braces: boolean[] = [];
  let lastChar = '';
  let lastWord = '';
  let i = 0;

  // Scan template text from `i` (just after a backtick or a closing `}` of a
  // substitution) to its end or the next `${`.
  const templateText = (): void => {
    while (i < n) {
      const c = src[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '`') {
        i++;
        lastChar = 'x';
        lastWord = '';
        return;
      }
      if (c === '$' && src[i + 1] === '{') {
        mask[i] = 1;
        mask[i + 1] = 1;
        braces.push(true);
        i += 2;
        lastChar = '{';
        lastWord = '';
        return;
      }
      i++;
    }
  };

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      lastChar = 'x';
      lastWord = '';
      continue;
    }
    if (c === '`') {
      i++;
      templateText();
      continue;
    }
    if (c === '/' && (REGEX_AFTER_CHAR.has(lastChar) || REGEX_AFTER_WORD.has(lastWord))) {
      i++;
      let inClass = false;
      while (i < n && src[i] !== '\n') {
        const r = src[i];
        if (r === '\\') {
          i += 2;
          continue;
        }
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) break;
        i++;
      }
      i++;
      while (i < n && /[a-z]/i.test(src[i])) i++;
      lastChar = 'x';
      lastWord = '';
      continue;
    }
    if (c === '{') braces.push(false);
    if (c === '}') {
      const wasTemplate = braces.pop();
      if (wasTemplate) {
        mask[i] = 1;
        i++;
        templateText();
        continue;
      }
    }
    mask[i] = 1;
    if (/[A-Za-z0-9_$]/.test(c)) {
      lastWord = /[A-Za-z0-9_$]/.test(lastChar) ? lastWord + c : c;
      lastChar = c;
    } else if (!/\s/.test(c)) {
      lastChar = c;
      lastWord = '';
    }
    i++;
  }
  return mask;
}

const OPEN: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/**
 * The index of the bracket that closes the one at `open`, counting only code
 * characters; -1 when it is not closed.
 */
export function matchClose(src: string, mask: Uint8Array, open: number): number {
  const first = src[open];
  if (!OPEN[first] || !mask[open]) return -1;
  const stack: string[] = [];
  for (let i = open; i < src.length; i++) {
    if (!mask[i]) continue;
    const c = src[i];
    if (OPEN[c]) stack.push(OPEN[c]);
    else if (c === ')' || c === ']' || c === '}') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/** Every match of `re` (global) whose first character is code. */
export function codeMatches(src: string, mask: Uint8Array, re: RegExp): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = g.exec(src)) !== null) {
    if (mask[m.index]) out.push(m);
    if (m[0].length === 0) g.lastIndex++;
  }
  return out;
}

/** 1-based line of an offset. */
export function lineAt(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

/** Is the whole span code (no part of it inside a string or comment)? */
export function isCodeSpan(mask: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i < end; i++) if (!mask[i]) return false;
  return true;
}
