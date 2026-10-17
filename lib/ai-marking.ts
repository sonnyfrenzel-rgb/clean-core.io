/**
 * Machine-readable marking of model-generated content — AI Act Art. 50(2)
 * (roadmap 3.0.17, legal deadline 02.12.2026; owner decision 17.10.2026 on G05).
 *
 * One statement, built here and nowhere else:
 *
 *     Generated with AI assistance (<provider> <model>) by Clean-Core.io <version>, <date>
 *
 * It travels two ways:
 *
 *   1. as one header comment in every artefact a model wrote or co-wrote, in
 *      the artefact's own comment syntax (`withAiMarking`): ABAP `*`, TypeScript
 *      and CDS `//`, Markdown, HTML and XML `<!-- -->`, YAML and Dockerfile `#`.
 *      JSON and CSV have no comments; they are covered by the metadata route;
 *   2. as a metadata field (`aiMarkingField`) in the exports — the delivery
 *      package's `manifest.json`, the documentation and test exports — and, as
 *      a new versioned field, in the signed audit pack (`lib/audit-pack-canonical.ts`).
 *
 * **Provider and model are never written here.** They come from what the
 * server observed: the model receipt of the call (`lib/model-receipt.ts`),
 * recorded with the artefact when it is stored (`aiModelRecordOf`), or the
 * signed run's model card for the analysis narrative. An artefact a model wrote
 * whose call was not recorded says so — "provider and model not recorded" —
 * instead of a name nobody observed.
 *
 * **What is not marked.** A file the engine wrote alone (a template, a record,
 * the deterministic scaffold) carries no line, and deterministic findings are
 * never marked (G05). A file with an engine frame and model-written bodies is
 * co-written and carries the line.
 *
 * Pure: imports only the provider labels, which are themselves import-free, so
 * the pages, the export builders and the server share it.
 */

import { providerLabelOfReceiptId } from './model-providers';

/** The words every marking begins with — what a reader, or a scanner, looks for. */
export const AI_MARKING_PREFIX = 'Generated with AI assistance';

/** The provision the marking answers. */
export const AI_MARKING_BASIS = 'EU AI Act, Article 50(2)';

/** The words in place of provider and model when no call was recorded for the artefact. */
export const AI_MODEL_NOT_RECORDED = 'provider and model not recorded';

/** The words in place of the date when the generation's date was not recorded. */
export const AI_DATE_NOT_RECORDED = 'date not recorded';

/**
 * Who wrote a model-written artefact, as far as it was observed. Every field
 * may be unknown: an artefact stored before the record existed, or one whose
 * receipt did not verify, is still model-written and still marked.
 */
export interface AiAuthorship {
  /** The provider id a receipt names (`google-gemini`, `anthropic`), or null. */
  provider: string | null;
  /** The model id the provider was actually called with, or null. */
  modelId: string | null;
  /** True when the account's own key served the call; null when not known. */
  byok: boolean | null;
  /** When the artefact was generated (ISO 8601 instant or date), or null. */
  generatedAt: string | null;
  /** The Clean-Core.io version that generated it, or null (the caller's version is used). */
  appVersion: string | null;
}

/**
 * What the server writes beside an artefact when it stores one a model wrote
 * — built only from a receipt the server verified (`verifyModelReceiptIssuer`),
 * never from what a page says about its own call.
 */
export interface AiModelRecord {
  receipt: 'verified';
  provider: string;
  modelId: string;
  byok: boolean;
  /** ISO instant of the call the receipt was issued for. */
  generatedAt: string;
  /** The server's version when it stored the artefact. */
  appVersion: string;
}

/** The record of a verified receipt's claims. */
export function aiModelRecordOf(claims: { provider: string; modelId: string; byok: boolean; iat: number }, appVersion: string): AiModelRecord {
  return {
    receipt: 'verified',
    provider: claims.provider,
    modelId: claims.modelId,
    byok: claims.byok,
    generatedAt: new Date(claims.iat).toISOString(),
    appVersion,
  };
}

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

/** A stored record read back leniently; null for anything that is not one. */
export function storedAiModelRecord(value: unknown): AiModelRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (r.receipt !== 'verified') return null;
  if (typeof r.provider !== 'string' || !r.provider || typeof r.modelId !== 'string' || !r.modelId) return null;
  if (typeof r.byok !== 'boolean' || typeof r.generatedAt !== 'string' || !ISO_DATE.test(r.generatedAt)) return null;
  return {
    receipt: 'verified',
    provider: r.provider,
    modelId: r.modelId,
    byok: r.byok,
    generatedAt: r.generatedAt,
    appVersion: typeof r.appVersion === 'string' && r.appVersion ? r.appVersion : '',
  };
}

/** The authorship a stored record states; every field unknown when there is none. */
export function authorshipOfRecord(record: AiModelRecord | null): AiAuthorship {
  if (!record) return { provider: null, modelId: null, byok: null, generatedAt: null, appVersion: null };
  return { provider: record.provider, modelId: record.modelId, byok: record.byok, generatedAt: record.generatedAt, appVersion: record.appVersion || null };
}

/** Nothing a comment syntax could close or break: one line, no double hyphen, no star-slash. */
function plain(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/-{2,}/g, '-').replace(/\*\//g, '* /').replace(/\s{2,}/g, ' ').trim();
}

/** "Google Gemini gemini-2.5-pro", or the words for a call nobody recorded. */
export function aiModelWords(a: Pick<AiAuthorship, 'provider' | 'modelId'>): string {
  if (!a.provider || !a.modelId) return AI_MODEL_NOT_RECORDED;
  return `${providerLabelOfReceiptId(a.provider) ?? a.provider} ${a.modelId}`;
}

/** YYYY-MM-DD of the generation, or the words for a date nobody recorded. */
export function aiDateWords(generatedAt: string | null): string {
  const m = typeof generatedAt === 'string' ? ISO_DATE.exec(generatedAt) : null;
  return m ? m[1] : AI_DATE_NOT_RECORDED;
}

/**
 * The statement: `Generated with AI assistance (<provider> <model>) by
 * Clean-Core.io <version>, <date>`. The version is the one the authorship
 * names, else `fallbackVersion` — the version building the export.
 */
export function aiMarkingStatement(a: AiAuthorship, fallbackVersion: string): string {
  const version = a.appVersion || fallbackVersion;
  return plain(`${AI_MARKING_PREFIX} (${aiModelWords(a)}) by Clean-Core.io ${version}, ${aiDateWords(a.generatedAt)}`);
}

/** The metadata field of an export: the same statement, and its parts for a machine to read. */
export interface AiMarkingField {
  statement: string;
  provider: string | null;
  model: string | null;
  /** Whose key served the call: `own`, `platform`, or null when not recorded. */
  keyOwner: 'own' | 'platform' | null;
  /** YYYY-MM-DD, or null when not recorded. */
  generatedOn: string | null;
  basis: string;
}

export function aiMarkingField(a: AiAuthorship, fallbackVersion: string): AiMarkingField {
  const date = aiDateWords(a.generatedAt);
  return {
    statement: aiMarkingStatement(a, fallbackVersion),
    provider: a.provider && a.modelId ? a.provider : null,
    model: a.provider && a.modelId ? a.modelId : null,
    keyOwner: a.byok === null || !a.provider || !a.modelId ? null : a.byok ? 'own' : 'platform',
    generatedOn: date === AI_DATE_NOT_RECORDED ? null : date,
    basis: AI_MARKING_BASIS,
  };
}

/** The name of the HTML `<meta>` element an HTML export carries the statement in. */
export const AI_MARKING_META_NAME = 'ai-generated';

/** The metadata route of an HTML export: `<meta name="ai-generated" content="…">`, the statement escaped. */
export function aiMarkingMetaTag(statement: string): string {
  const content = plain(statement).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<meta name="${AI_MARKING_META_NAME}" content="${content}">`;
}

/**
 * An HTML export with the marking: every statement as a header comment line
 * (after the doctype, which must stay first) and as a `<meta name="ai-generated">`
 * in the head. A fragment without a head — the HTML half of a clipboard copy —
 * carries the meta elements right below the comments. Unchanged without a statement.
 */
export function withAiMarkingHtml(html: string, statements: readonly string[]): string {
  if (statements.length === 0) return html;
  const comments = statements.map((s) => aiMarkingComment('markup', s)).join('\n');
  const metas = statements.map(aiMarkingMetaTag).join('');
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  // The head comes after the doctype, so the meta elements go in first and the doctype's position stays put.
  const withMeta = head ? `${html.slice(0, head.index + head[0].length)}${metas}${html.slice(head.index + head[0].length)}` : html;
  const doctype = /<!doctype[^>]*>/i.exec(withMeta);
  if (doctype) {
    const at = doctype.index + doctype[0].length;
    return `${withMeta.slice(0, at)}\n${comments}${head ? '' : `\n${metas}`}${withMeta.slice(at)}`;
  }
  return head ? `${comments}\n${withMeta}` : `${comments}\n${metas}${withMeta}`;
}

/**
 * The content with one header comment line per statement — an export that carries the text of several models (the
 * business layer and the analysis model's proposal, say) names every one of them. Idempotent like `withAiMarking`:
 * the marking lines already at the top are replaced, never doubled. Unchanged without a statement or a syntax.
 */
export function withAiMarkings(path: string, content: string, statements: readonly string[]): string {
  const syntax = commentSyntaxOf(path);
  if (!syntax || statements.length === 0) return content;
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const at = mustStayFirst(lines[0] ?? '') ? 1 : 0;
  let end = at;
  while (end < lines.length && MARKING_LINE.test(lines[end])) end++;
  lines.splice(at, end - at, ...statements.map((s) => aiMarkingComment(syntax, s)));
  return lines.join(eol);
}

/* ------------------------------------------------------------ comment syntax */

export type CommentSyntax = 'abap' | 'slash' | 'markup' | 'hash';

/**
 * The comment syntax of a file, from its name; null for a format without
 * comments (JSON, CSV) or one this does not know — those are covered by the
 * metadata field, never by a guess at a syntax.
 */
export function commentSyntaxOf(path: string): CommentSyntax | null {
  const name = path.split('/').pop() ?? path;
  const lower = name.toLowerCase();
  if (/\.abap$/.test(lower)) return 'abap';
  // CDS (CAP `.cds`, ABAP CDS DDL `.asddls`, access controls `.asdcls`, behaviour `.asbdef`, service definitions `.srvdsrv`) and the TypeScript family.
  if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|cds|asddls|asdcls|asbdef|srvdsrv|ddls)$/.test(lower)) return 'slash';
  if (/\.(md|markdown|html|htm|xml|bpmn|svg)$/.test(lower)) return 'markup';
  if (/\.(ya?ml|sh|toml)$/.test(lower) || lower === 'dockerfile' || lower === '.dockerignore' || lower === '.gitignore') return 'hash';
  return null;
}

/** The header line in a syntax. */
export function aiMarkingComment(syntax: CommentSyntax, statement: string): string {
  const s = plain(statement);
  switch (syntax) {
    case 'abap':
      // A full-line ABAP comment: `*` in the first column.
      return `* ${s}`;
    case 'slash':
      return `// ${s}`;
    case 'markup':
      return `<!-- ${s} -->`;
    case 'hash':
      return `# ${s}`;
  }
}

/** A line that is a marking, in any of the four syntaxes. */
const MARKING_LINE = /^(?:\* |\/\/ |<!-- |# )Generated with AI assistance \(.*$/;

/** Lines a header must stay below: a shebang, an XML declaration, an HTML doctype. */
function mustStayFirst(line: string): boolean {
  return /^#!/.test(line) || /^<\?xml\b/i.test(line) || /^<!doctype\b/i.test(line);
}

/** True when the content already carries a marking among its first lines. */
export function hasAiMarking(content: string): boolean {
  return content.split(/\r?\n/, 4).some((l) => MARKING_LINE.test(l));
}

/** The marking a content carries among its first lines, or null. */
export function aiMarkingOf(content: string): string | null {
  for (const l of content.split(/\r?\n/, 4)) {
    if (!MARKING_LINE.test(l)) continue;
    return l.replace(/^(?:\* |\/\/ |<!-- |# )/, '').replace(/ -->$/, '');
  }
  return null;
}

/**
 * The content with the marking as its header comment, in the file's own
 * syntax. Unchanged for a file without a comment syntax. Idempotent: a marking
 * already at the top is replaced, never doubled. A shebang, an XML declaration
 * or an HTML doctype stays the first line (a comment before a doctype would put
 * a browser into quirks mode).
 */
export function withAiMarking(path: string, content: string, statement: string): string {
  const syntax = commentSyntaxOf(path);
  if (!syntax) return content;
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const header = aiMarkingComment(syntax, statement);
  const at = mustStayFirst(lines[0] ?? '') ? 1 : 0;
  const existing = lines.slice(0, 4).findIndex((l) => MARKING_LINE.test(l));
  if (existing !== -1) {
    lines[existing] = header;
    return lines.join(eol);
  }
  lines.splice(at, 0, header);
  return lines.join(eol);
}
