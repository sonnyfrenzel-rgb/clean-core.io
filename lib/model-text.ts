/**
 * Text a language model wrote, on its way to a human — `DESIGN.md` §3.1.
 *
 * The rule is one sentence: what the model wrote appears like every other text
 * in this product — rendered, factual, with no trace of where it came from in
 * the text itself. Where it came from is said by the chip *Model proposal*
 * (`lib/provenance.ts`), never by the prose.
 *
 * Why it is worth a guard rather than a code review: the damage is not that a
 * `**` looks untidy. It is that a page which reads like a chatbot devalues the
 * evidence standing next to it, and this audience is sceptical by trade. One
 * "Certainly!" above a signed run costs more than the run earned.
 *
 * Three checks, and they are deliberately not one list:
 *
 *   - **Markdown residue** — `**`, `##`, a stray backtick, a literal `\n`. Model
 *     output is either rendered safely or cleaned before display. Files whose
 *     format *is* Markdown are exempt, and only those.
 *   - **The blocklist** (ADR-020) — nine wordings that are never right, in model
 *     output or in our own copy. The guard breaks the build on these.
 *   - **The style list** — "delve into", "seamless", "robust" as filler. A text
 *     scan cannot tell filler from domain language: "robust error handling" is
 *     correct ABAP English. So these are reported to people (QA and UX agents
 *     raise them as `low`) and never fail a build. `findStyleTells` is the
 *     function that says so in its own name.
 *
 * Plus the symbolism rule, which is about icons and labels rather than prose:
 * no sparkles, robots, wands or brains for model work, no "AI-powered", no
 * "magic", no "Smart …", and "Ask AI" is called "Ask this case".
 *
 * What is **not** in here, on purpose: the em dash, the tricolon, and the
 * hedging chain. They are the usual tells in someone else's guard, and §3.1
 * does not list them — this product's own voice is full of em dashes, and a
 * guard that fires on the house style is a guard people switch off.
 */

export type ModelTextSurface =
  /** Rendered in the browser. */
  | 'screen'
  /** HTML export (audit pack, report). */
  | 'html-export'
  /** PDF export. */
  | 'pdf-export'
  /** Mail body, HTML or plain text. */
  | 'email'
  /** A `.md` file: Markdown is the format, so Markdown is not residue. */
  | 'markdown-export';

export type ModelTextFindingKind = 'markdown' | 'blocklist' | 'symbol' | 'style';

export interface ModelTextFinding {
  kind: ModelTextFindingKind;
  /** What was found, as it appeared. */
  term: string;
  /** Index in the input, so a caller can point at it. */
  index: number;
  /** A short window around the hit, for the failure message. */
  excerpt: string;
  /** What to do instead. */
  advice: string;
}

/**
 * Never — in model output or in our own copy. `DESIGN.md` §3.1, blocklist.
 *
 * Matched case-insensitively and on word boundaries, so "AI-powered" is caught
 * in "AI-powered explanations" and `certainly` without the exclamation mark is
 * not: the tell is the exclamation, not the adverb.
 */
export const AI_TELL_BLOCKLIST: readonly string[] = Object.freeze([
  'As an AI',
  'as a language model',
  'I hope this helps',
  'Great question',
  'Certainly!',
  "Let's dive in",
  "In today's fast-paced world",
  'AI is thinking',
  'AI-powered',
]);

/**
 * Reported, never enforced. `DESIGN.md` §3.1, style list.
 *
 * "robust" and "comprehensive" are in here as *filler*, and no scanner can tell
 * filler from "robust error handling". That is exactly why this list does not
 * fail a build.
 */
export const AI_STYLE_LIST: readonly string[] = Object.freeze([
  'delve into',
  "It's important to note",
  'It is important to note',
  "It's worth noting",
  'In conclusion',
  'seamless',
  'seamlessly',
  'unlock',
  'elevate',
  'empower',
  'game-changer',
  'cutting-edge',
  'robust',
  'comprehensive',
]);

/** Labels that dress model work up as a trick. `DESIGN.md` §3.1, third bullet. */
export const AI_SYMBOL_LABELS: readonly string[] = Object.freeze([
  'magic',
  'Ask AI',
  'AI magic',
]);

/**
 * Emoji used as the icon for model work — and, in interface text, any emoji at
 * all. Sparkles, robot, wand, brain, and the rest of the chatbot iconography.
 */
const EMOJI_PATTERN =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F0FF}]/gu;

/** "Smart Anything" as a product label — `Smart` followed by a capitalised word. */
const SMART_LABEL_PATTERN = /\bSmart\s+[A-Z][a-z]+/g;

function excerptAround(text: string, index: number, length: number): string {
  const from = Math.max(0, index - 30);
  const to = Math.min(text.length, index + length + 30);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ')}${to < text.length ? '…' : ''}`;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary match for a phrase that may start or end with punctuation.
 *
 * `\b` on either side of "Certainly!" would never match — `!` is not a word
 * character, so there is no boundary after it. The boundary is therefore only
 * asserted on the side that actually begins or ends with a letter or digit.
 */
function phrasePattern(phrase: string): RegExp {
  const body = escapeRegExp(phrase);
  const left = /^[\w]/.test(phrase) ? '\\b' : '';
  const right = /[\w]$/.test(phrase) ? '\\b' : '';
  return new RegExp(`${left}${body}${right}`, 'gi');
}

function findPhrases(
  text: string,
  phrases: readonly string[],
  kind: ModelTextFindingKind,
  advice: string,
): ModelTextFinding[] {
  const found: ModelTextFinding[] = [];
  for (const phrase of phrases) {
    const pattern = phrasePattern(phrase);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      found.push({
        kind,
        term: match[0],
        index: match.index,
        excerpt: excerptAround(text, match.index, match[0].length),
        advice,
      });
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** The nine wordings that never ship. */
export function findBlockedPhrases(text: string): ModelTextFinding[] {
  return findPhrases(
    text,
    AI_TELL_BLOCKLIST,
    'blocklist',
    'Say the thing itself. Where the text came from is the job of the provenance chip.',
  );
}

/**
 * The style list — advice for a human, never a build failure.
 *
 * Kept separate from `inspectModelText` so that no caller can accidentally
 * enforce it by passing one more flag.
 */
export function findStyleTells(text: string): ModelTextFinding[] {
  const found = findPhrases(
    text,
    AI_STYLE_LIST,
    'style',
    'Reads like filler. Leave it where it is domain language ("robust error handling").',
  );

  // An opening that ends in an exclamation mark — "Great news!", "Welcome!".
  const firstSentence = /^\s*[^.!?\n]{3,120}!/.exec(text);
  if (firstSentence) {
    found.push({
      kind: 'style',
      term: firstSentence[0].trim(),
      index: firstSentence.index,
      excerpt: excerptAround(text, firstSentence.index, firstSentence[0].length),
      advice: 'An opening with an exclamation mark reads as a chatbot greeting.',
    });
  }

  return found.sort((a, b) => a.index - b.index);
}

/** Sparkles, robots, wands, "magic", "Smart …", "Ask AI". */
export function findAiSymbolism(text: string): ModelTextFinding[] {
  const found = findPhrases(
    text,
    AI_SYMBOL_LABELS,
    'symbol',
    'Name the work, not the trick. "Ask AI" is "Ask this case".',
  );

  for (const pattern of [EMOJI_PATTERN, SMART_LABEL_PATTERN]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      found.push({
        kind: 'symbol',
        term: match[0],
        index: match.index,
        excerpt: excerptAround(text, match.index, match[0].length),
        advice: 'No emoji and no "Smart …" label in interface text.',
      });
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  }

  return found.sort((a, b) => a.index - b.index);
}

/**
 * Raw Markdown that reached a surface which does not render it.
 *
 * Each entry names the shape and what the reader sees instead of it.
 */
const MARKDOWN_RESIDUE: { name: string; pattern: RegExp }[] = [
  { name: 'code fence', pattern: /```/g },
  { name: 'bold marker', pattern: /\*\*/g },
  { name: 'underscore emphasis', pattern: /(^|\s)__[^\s_][^_]*__(?=\s|$|[.,;:!?)])/gm },
  { name: 'heading marker', pattern: /^[ \t]*#{1,6}[ \t]+\S/gm },
  { name: 'bullet marker', pattern: /^[ \t]*[-*][ \t]+\S/gm },
  { name: 'inline code', pattern: /`[^`\n]+`/g },
  { name: 'markdown link', pattern: /\[[^\]\n]+\]\([^)\n]+\)/g },
  { name: 'literal newline escape', pattern: /\\n/g },
];

export function findMarkdownResidue(text: string): ModelTextFinding[] {
  const found: ModelTextFinding[] = [];
  for (const { name, pattern } of MARKDOWN_RESIDUE) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      found.push({
        kind: 'markdown',
        term: `${name}: ${match[0].trim().slice(0, 40)}`,
        index: match.index,
        excerpt: excerptAround(text, match.index, match[0].length),
        advice: 'Render the Markdown, or run the text through stripModelMarkdown() first.',
      });
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/**
 * Everything that must not reach this surface.
 *
 * The style list is not in here — see the head of the file. Markdown residue is
 * skipped for `markdown-export` and for nothing else.
 */
export function inspectModelText(text: string, surface: ModelTextSurface): ModelTextFinding[] {
  const findings = [...findBlockedPhrases(text), ...findAiSymbolism(text)];
  if (surface !== 'markdown-export') findings.push(...findMarkdownResidue(text));
  return findings.sort((a, b) => a.index - b.index);
}

/**
 * Markdown out, readable text in its place.
 *
 * Conservative where ABAP and Markdown collide: `__` is only emphasis when the
 * pair stands between spaces, so `Z_MM_PO_TOP` and `CALL FUNCTION 'Z__X'` come
 * through untouched. A heading loses its hashes and keeps its words; a link
 * keeps its text and puts the target in brackets after it, which is also the
 * print rule (§7.1).
 */
export function stripModelMarkdown(text: string): string {
  return (
    text
      // A literal backslash-n in a JSON string that nobody parsed.
      .replace(/\\n/g, '\n')
      // Fences: keep the code, drop the rails and any language hint.
      .replace(/```[a-zA-Z0-9+-]*\n?/g, '')
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
      .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, '$1 ($2)')
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/(^|\s)__([^\s_][^_]*)__(?=\s|$|[.,;:!?)])/g, '$1$2')
      .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,;:!?)])/g, '$1$2')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/^[ \t]*[-*][ \t]+/gm, '• ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * The call a display, export or mail path makes.
 *
 * Returns the cleaned text and everything that was wrong with the input, so a
 * caller can both ship the clean version and log what it had to repair. It does
 * not throw: a mail that goes out with the tell removed beats a mail that does
 * not go out.
 */
export function cleanModelText(
  text: string,
  surface: ModelTextSurface,
): { text: string; findings: ModelTextFinding[] } {
  const findings = inspectModelText(text, surface);
  const cleaned = surface === 'markdown-export' ? text : stripModelMarkdown(text);
  return { text: cleaned, findings };
}

/**
 * For the places where shipping the tell is worse than shipping nothing — a
 * fixed interface string, a template, a subject line.
 */
export function assertNoAiTells(text: string, where: string): void {
  const findings = [...findBlockedPhrases(text), ...findAiSymbolism(text)];
  if (findings.length === 0) return;
  throw new Error(
    `AI tells in ${where}:\n${findings.map((f) => `  ${f.kind}: ${f.term} — ${f.excerpt}`).join('\n')}`,
  );
}
