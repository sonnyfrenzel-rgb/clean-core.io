import { renderOpenValue, type LegalLang } from './open-values';

/**
 * The legal texts are written in a deliberately tiny markup, so that the words
 * a reader sees, the words an archive file holds and the words a consent record
 * hashes come from one source and cannot drift apart.
 *
 * - `# Title` / `## Heading {#anchor}` / `### Heading`
 * - chunks separated by a blank line; a chunk is a paragraph, and a single
 *   newline inside it is a hard line break (an address block)
 * - a chunk of `- ` lines is a list, one item per line
 * - a chunk starting `> ` is a highlighted box (the Art. 21 notice)
 * - `**bold**` inline
 * - `{{key}}` is an entry of `lib/legal/open-values.ts`
 *
 * No library: the subset is ours, and a page whose point is that its words are
 * exactly these words should not route them through a general Markdown engine.
 */

export type LegalBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string; id?: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'box'; text: string };

const TOKEN = /\{\{([A-Za-z0-9]+)\}\}/g;

/** Every open-value key a source names, in order of first use. */
export function tokensIn(source: string): string[] {
  const keys: string[] = [];
  for (const m of source.matchAll(TOKEN)) if (!keys.includes(m[1])) keys.push(m[1]);
  return keys;
}

/**
 * Replaces every token with its rendering in `lang`. A check renders nothing,
 * so the space a token may leave behind is collapsed, and a space left before
 * punctuation is removed.
 */
export function resolveLegalSource(source: string, lang: LegalLang): string {
  return source
    .replace(TOKEN, (_, key: string) => renderOpenValue(key, lang))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:)])/g, '$1')
    .replace(/ +$/gm, '');
}

export function parseLegalSource(resolved: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  for (const chunk of resolved.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const heading = /^(#{1,3})\s+(.*?)(?:\s+\{#([a-z0-9-]+)\})?$/.exec(trimmed);
    if (heading && !trimmed.includes('\n')) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
        ...(heading[3] ? { id: heading[3] } : {}),
      });
      continue;
    }
    if (/^-\s+/.test(trimmed)) {
      blocks.push({ kind: 'list', items: trimmed.split('\n').map((l) => l.replace(/^-\s+/, '').trim()) });
      continue;
    }
    if (trimmed.startsWith('> ')) {
      blocks.push({ kind: 'box', text: trimmed.split('\n').map((l) => l.replace(/^>\s?/, '')).join(' ').trim() });
      continue;
    }
    blocks.push({ kind: 'paragraph', lines: trimmed.split('\n').map((l) => l.trim()) });
  }
  return blocks;
}

/** Source → blocks in `lang`. */
export function legalBlocks(source: string, lang: LegalLang): LegalBlock[] {
  return parseLegalSource(resolveLegalSource(source, lang));
}

/** The text without inline markup — what a reader's eye gets, and what an archive holds. */
export function plainInline(text: string): string {
  return text.replace(/\*\*/g, '');
}

/** The plain text of one block, the way `innerText` of the rendered block reads. */
export function blockText(block: LegalBlock): string {
  if (block.kind === 'heading') return plainInline(block.text);
  if (block.kind === 'list') return block.items.map(plainInline).join(' ');
  if (block.kind === 'box') return plainInline(block.text);
  return block.lines.map(plainInline).join(' ');
}

/**
 * The archive form: the Markdown subset `lib/terms-versions.ts` reads
 * (`parseArchivedTerms`). One list item per chunk, the way the archive
 * extractor always wrote them; a box becomes a paragraph; no inline markup,
 * no anchors.
 */
export function toArchiveMarkdown(blocks: LegalBlock[]): string {
  const chunks: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'heading') chunks.push(`${'#'.repeat(b.level)} ${plainInline(b.text)}`);
    else if (b.kind === 'list') for (const item of b.items) chunks.push(`- ${plainInline(item)}`);
    else if (b.kind === 'box') chunks.push(plainInline(b.text));
    else chunks.push(b.lines.map(plainInline).join('\n'));
  }
  return `${chunks.join('\n\n')}\n`;
}
