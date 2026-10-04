/**
 * The text format of the requirements specification — a small, closed subset
 * of Markdown that a field of the specification may hold (owner 04.10.2026:
 * "cleanly formattable" — formatting that stays controlled, not free-form).
 *
 * What a field can say, and nothing more:
 *
 *   - paragraphs, separated by an empty line;
 *   - a bulleted list (`- item`) and a numbered list (`1. item`);
 *   - **bold**, *italic*, `inline code` and [a link](https://example.com).
 *
 * Why a format of our own and not a rich-text editor: the editor of the
 * workspace writes this text and nothing else, so what is stored is plain text
 * a reviewer can read in the database, every export spells it out of one parse
 * tree (Markdown, Confluence HTML, Word), and no HTML from a browser is ever
 * stored or rendered. The screen renders the tree as React elements; the HTML
 * export escapes every text node and lets a link through only when its target
 * is `http(s):` or `mailto:` (`isSafeHref`). A link to anything else stays
 * visible as text. No new dependency.
 *
 * Pure: no DOM, no network, no clock.
 */

export type RichInline =
  | { t: 'text'; v: string }
  | { t: 'b'; c: RichInline[] }
  | { t: 'i'; c: RichInline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: RichInline[] };

export type RichBlock =
  | { t: 'p'; c: RichInline[] }
  | { t: 'ul'; items: RichInline[][] }
  | { t: 'ol'; items: RichInline[][] };

/** The longest text one field of the specification may hold. */
export const RICH_TEXT_LIMIT = 4_000;

/** A link target the exports and the screen let through: web and mail only. */
export function isSafeHref(href: string): boolean {
  const t = href.trim();
  if (!t || t.length > 2_000) return false;
  if (/[\s"'<>`]/.test(t)) return false;
  return /^https?:\/\/[^/]/i.test(t) || /^mailto:[^@\s]+@[^@\s]+$/i.test(t);
}

/**
 * The text as it is stored: line breaks as `\n`, no control characters, no
 * run of more than one empty line, no trailing blanks, at most the limit.
 */
export function normalizeRich(text: string, limit = RICH_TEXT_LIMIT): string {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    // Control characters other than the line break and the tab have no place in a requirement.
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limit);
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;

/** The text as blocks. Never throws; anything it does not know is text. */
export function parseRich(text: string): RichBlock[] {
  const lines = normalizeRich(text, Number.MAX_SAFE_INTEGER).split('\n');
  const blocks: RichBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n')) });
    para = [];
  };
  for (const line of lines) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const kind = bullet ? 'ul' : 'ol';
      const item = parseInline((bullet ?? numbered)![1]);
      const last = blocks[blocks.length - 1];
      if (last && last.t === kind) last.items.push(item);
      else blocks.push(kind === 'ul' ? { t: 'ul', items: [item] } : { t: 'ol', items: [item] });
      continue;
    }
    if (!line.trim()) {
      flush();
      // An empty line also ends a list, so the next list starts again at 1.
      blocks.push({ t: 'p', c: [] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks.filter((b) => b.t !== 'p' || b.c.length > 0);
}

/** One line's inline marks. Bold and italic may hold each other once; code and link text are literal. */
export function parseInline(text: string, depth = 0): RichInline[] {
  const out: RichInline[] = [];
  let buf = '';
  const push = (node: RichInline) => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
    out.push(node);
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length && /[\\*`[\]()_-]/.test(text[i + 1])) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        push({ t: 'code', v: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '*' && text[i + 1] === '*' && depth < 2) {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        push({ t: 'b', c: parseInline(text.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '*' && text[i + 1] !== '*' && depth < 2) {
      const end = findClosingStar(text, i + 1);
      if (end > i + 1) {
        push({ t: 'i', c: parseInline(text.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const close = text.indexOf('](', i + 1);
      const paren = close > i ? text.indexOf(')', close + 2) : -1;
      if (close > i + 1 && paren > close + 2 && !text.slice(i + 1, close).includes('[')) {
        const label = text.slice(i + 1, close);
        const href = text.slice(close + 2, paren).trim();
        if (isSafeHref(href)) {
          push({ t: 'link', href, c: [{ t: 'text', v: label }] });
        } else {
          // Not a target we let through: the reader still sees what was written.
          buf += `${label} (${href})`;
        }
        i = paren + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  if (buf) out.push({ t: 'text', v: buf });
  return out;
}

function findClosingStar(text: string, from: number): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === '\\') {
      j += 1;
      continue;
    }
    if (text[j] === '*' && text[j + 1] !== '*' && text[j - 1] !== ' ') return j;
  }
  return -1;
}

/** The text of inline nodes, without marks — for a table cell, a title, a search. */
export function inlinePlain(nodes: readonly RichInline[]): string {
  return nodes
    .map((n) => (n.t === 'text' || n.t === 'code' ? n.v : n.t === 'link' ? `${inlinePlain(n.c)} (${n.href})` : inlinePlain(n.c)))
    .join('');
}

/** The whole text without marks; list items on lines of their own. */
export function richPlain(text: string): string {
  return parseRich(text)
    .map((b) =>
      b.t === 'p'
        ? inlinePlain(b.c)
        : b.items.map((item, i) => `${b.t === 'ul' ? '•' : `${i + 1}.`} ${inlinePlain(item)}`).join('\n'),
    )
    .join('\n\n');
}

/** HTML-escape one text node. */
export function escapeRichText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlineHtml(nodes: readonly RichInline[]): string {
  return nodes
    .map((n) => {
      if (n.t === 'text') return escapeRichText(n.v).replace(/\n/g, '<br>');
      if (n.t === 'code') return `<code>${escapeRichText(n.v)}</code>`;
      if (n.t === 'b') return `<strong>${inlineHtml(n.c)}</strong>`;
      if (n.t === 'i') return `<em>${inlineHtml(n.c)}</em>`;
      // A link reaches here only through `isSafeHref`; it is escaped all the same.
      return isSafeHref(n.href)
        ? `<a href="${escapeRichText(n.href)}" rel="noopener noreferrer">${inlineHtml(n.c)}</a>`
        : escapeRichText(`${inlinePlain(n.c)} (${n.href})`);
    })
    .join('');
}

/** The text as escaped HTML — the Confluence page and the clipboard. */
export function richHtml(text: string): string {
  return parseRich(text)
    .map((b) =>
      b.t === 'p'
        ? `<p>${inlineHtml(b.c)}</p>`
        : `<${b.t}>${b.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${b.t}>`,
    )
    .join('');
}

function inlineMarkdown(nodes: readonly RichInline[]): string {
  return nodes
    .map((n) => {
      if (n.t === 'text') return n.v.replace(/([\\*`[\]])/g, '\\$1');
      if (n.t === 'code') return `\`${n.v.replace(/`/g, "'")}\``;
      if (n.t === 'b') return `**${inlineMarkdown(n.c)}**`;
      if (n.t === 'i') return `*${inlineMarkdown(n.c)}*`;
      return `[${inlineMarkdown(n.c)}](${n.href})`;
    })
    .join('');
}

/** The text as Markdown — normalised, so a stored text and its export agree. */
export function richMarkdown(text: string): string {
  return parseRich(text)
    .map((b) =>
      b.t === 'p'
        ? inlineMarkdown(b.c)
        : b.items.map((item, i) => `${b.t === 'ul' ? '-' : `${i + 1}.`} ${inlineMarkdown(item)}`).join('\n'),
    )
    .join('\n\n');
}

/** Whether a text holds anything but blanks. */
export function richIsEmpty(text: string | null | undefined): boolean {
  return !text || !richPlain(text).trim();
}

/** The five marks the editor's bar puts on a selection. */
export type RichMark = 'bold' | 'italic' | 'code' | 'link' | 'ul' | 'ol';

/** Applies one mark to the selection of a text, returning the new text and selection. */
export function applyMark(text: string, start: number, end: number, mark: RichMark, href = 'https://'): { text: string; start: number; end: number } {
  const selected = text.slice(start, end);
  if (mark === 'ul' || mark === 'ol') {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEndAt = text.indexOf('\n', end);
    const lineEnd = lineEndAt === -1 ? text.length : lineEndAt;
    const block = text.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    const already = lines.every((l) => (mark === 'ul' ? /^\s*[-*]\s+/.test(l) : /^\s*\d+[.)]\s+/.test(l)));
    const next = lines
      .map((l, i) => {
        const bare = l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '');
        return already ? bare : `${mark === 'ul' ? '-' : `${i + 1}.`} ${bare}`;
      })
      .join('\n');
    return { text: text.slice(0, lineStart) + next + text.slice(lineEnd), start: lineStart, end: lineStart + next.length };
  }
  const wrap = mark === 'bold' ? ['**', '**'] : mark === 'italic' ? ['*', '*'] : mark === 'code' ? ['`', '`'] : ['[', `](${href})`];
  const inner = selected || (mark === 'link' ? 'link text' : mark === 'code' ? 'code' : 'text');
  const out = text.slice(0, start) + wrap[0] + inner + wrap[1] + text.slice(end);
  return { text: out, start: start + wrap[0].length, end: start + wrap[0].length + inner.length };
}
