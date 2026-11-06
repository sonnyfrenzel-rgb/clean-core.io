import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { TERMS_VERSION } from '@/lib/constants';
import { TERMS_LABEL, legalDocumentBlocks } from '@/lib/legal/documents';
import { toArchiveMarkdown } from '@/lib/legal/markup';
import type { LegalLang } from '@/lib/legal/open-values';
import { ARCHIVED_TERMS_VERSIONS, normaliseTermsText, parseArchivedTerms, type ArchivedTermsVersion } from '@/lib/terms-versions';
import { CHANGE_REASONS, type ChangeReason } from './reasons';

/**
 * The changes of an amendment of the Terms, generated from the texts — for the
 * notice under Terms 10.1 ("the amended text, a clear indication of the
 * provisions that are changing, and the reason for the amendment").
 *
 * Generated, never written by hand, so the notice cannot drift from what the
 * page publishes: the old side is the archived file of the version in force
 * (its digest is checked against `lib/terms-versions.ts`), the new side is the
 * live source rendered exactly as `/terms` and the archive render it
 * (`legalDocumentBlocks` → `toArchiveMarkdown`). Run it at send time; a clause
 * edited after a frozen copy was taken would otherwise go out with old words.
 *
 * Unit of comparison: a numbered clause ("5.2" with every unnumbered paragraph
 * that follows it), or, in a section without numbers, the section. Where the
 * numbering itself changed — v2.2.0 section 1 and 5 had none, v2.3.0 has 1.1–1.6
 * and 5.1–5.4 — the section is compared as one, because a clause-by-clause
 * pairing would claim a correspondence nobody drew.
 *
 * Pure apart from reading the archived file; no database, no network.
 */

export type ChangeKind = 'changed' | 'added' | 'removed' | 'heading';

/** One token of a word diff; `mark` is set on what the other side does not have. */
export interface DiffToken {
  text: string;
  mark: boolean;
}

export interface TermsChange {
  /** "1", "5.2", "10.4", "preamble", "provider", "contact"; "4:heading" for a heading. */
  id: string;
  /** The section the clause belongs to ("1" … "13", "preamble", "provider", "contact"). */
  section: string;
  kind: ChangeKind;
  /** Section heading of the new version (old for a removed section), per language. */
  heading: Record<LegalLang, string>;
  /** Old wording, paragraphs. Only English exists for the versions before v2.3.0. */
  oldParas: string[];
  /** New wording, paragraphs, per language. Empty for a removed clause. */
  newParas: Record<LegalLang, string[]>;
  /** The English word diff: old paragraphs with the removed words marked, new ones with the added words marked. */
  diff: { old: DiffToken[][]; new: DiffToken[][] };
  /** The reason under Terms 10.4, or null when nobody has written one yet. */
  reason: ChangeReason | null;
}

export interface TermsChanges {
  from: { version: string; label: string; effectiveOn: string; file: string; languages: LegalLang[] };
  to: { version: string; label: string };
  changes: TermsChange[];
  /** Clause ids of the new text, per language — they must agree. */
  clauseIds: Record<LegalLang, string[]>;
  /** Changed clauses without a reason: the notice must not go out while this is not empty. */
  missingReasons: string[];
  /** Reasons written for a clause that no longer changes (or no longer exists). */
  staleReasons: string[];
  /** Open-value markers ("[open: …]") still in the new wording. */
  openMarkers: string[];
  /** SHA-256 over the canonical JSON of what the notice states — recorded with every send. */
  digest: string;
}

/* ------------------------------------------------------------------ parsing */

export interface TermsSection {
  key: string;
  heading: string;
  /** The heading without its number, for comparing headings. */
  title: string;
  paras: string[];
}

export interface TermsClause {
  id: string;
  section: string;
  paras: string[];
}

/** The navigation list after the contact block is not contract text. */
const NAVIGATION = /^(Published versions|Previous versions|Veröffentlichte Fassungen|Frühere Fassungen)$/i;

/** Sections of an archive-format text (the subset `toArchiveMarkdown` writes). */
export function parseTermsSections(markdown: string): TermsSection[] {
  const sections: TermsSection[] = [];
  let current: TermsSection = { key: 'preamble', heading: '', title: '', paras: [] };
  let seenNumbered = false;
  let stop = false;
  for (const block of parseArchivedTerms(markdown)) {
    if (stop) break;
    if (block.kind === 'heading') {
      if (block.level === 1) continue;
      if (NAVIGATION.test(block.text)) {
        stop = true;
        continue;
      }
      sections.push(current);
      const numbered = /^(\d+)\.\s+(.*)$/.exec(block.text);
      if (numbered) seenNumbered = true;
      current = {
        key: numbered ? numbered[1] : seenNumbered ? 'contact' : 'provider',
        heading: block.text,
        title: numbered ? numbered[2] : block.text,
        paras: [],
      };
      continue;
    }
    if (block.kind === 'list') for (const item of block.items) current.paras.push(`- ${item}`);
    else current.paras.push(block.lines.join('\n'));
  }
  sections.push(current);
  return sections.filter((s) => s.key !== 'preamble' || s.paras.length > 0);
}

/** Clauses of one section: a paragraph opening "5.2 " starts one; what follows belongs to it. */
export function sectionClauses(section: TermsSection): TermsClause[] {
  const clauses: TermsClause[] = [];
  let current: TermsClause | null = null;
  for (const para of section.paras) {
    const m = /^(\d+\.\d+)\s/.exec(para);
    if (m || !current) {
      current = { id: m ? m[1] : section.key, section: section.key, paras: [] };
      clauses.push(current);
    }
    current.paras.push(para);
  }
  return clauses;
}

/** All clause ids of a text, in order. */
export function clauseIdsOf(markdown: string): string[] {
  return parseTermsSections(markdown).flatMap((s) => sectionClauses(s).map((c) => c.id));
}

/* ------------------------------------------------------------------ diffing */

/** Typographic quotes and runs of white space are not a change of wording. */
export function normaliseWording(text: string): string {
  return text
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function samewording(a: string[], b: string[]): boolean {
  return normaliseWording(a.join('\n\n')) === normaliseWording(b.join('\n\n'));
}

const BREAK = '\u0000¶';
/** A hard line break inside a paragraph (the address block); kept as a token of its own. */
export const LINE_BREAK = '\n';

function tokens(paras: string[]): string[] {
  const out: string[] = [];
  paras.forEach((p, i) => {
    if (i > 0) out.push(BREAK);
    p.split('\n').forEach((line, k) => {
      if (k > 0) out.push(LINE_BREAK);
      out.push(...line.split(/\s+/).filter(Boolean));
    });
  });
  return out;
}

/**
 * A word diff by longest common subsequence: the old paragraphs with every
 * word the new text does not keep marked, and the new paragraphs with every
 * word the old text did not have marked. Paragraph breaks are tokens of their
 * own, so a paragraph stays a paragraph on both sides.
 */
export function wordDiff(oldParas: string[], newParas: string[]): { old: DiffToken[][]; new: DiffToken[][] } {
  const a = tokens(oldParas);
  const b = tokens(newParas);
  // A comma that only joined the lines of the address block into one is not a changed word.
  const key = (t: string) => normaliseWording(t).replace(/,$/, '');
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const lcs = new Int32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] = key(a[i]) === key(b[j]) ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const keptA = new Array<boolean>(n).fill(false);
  const keptB = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) {
      keptA[i++] = true;
      keptB[j++] = true;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) i++;
    else j++;
  }
  const split = (toks: string[], kept: boolean[]): DiffToken[][] => {
    const paras: DiffToken[][] = [[]];
    toks.forEach((t, k) => {
      if (t === BREAK) paras.push([]);
      else paras[paras.length - 1].push({ text: t, mark: !kept[k] });
    });
    return paras;
  };
  return { old: split(a, keptA), new: split(b, keptB) };
}

/* ------------------------------------------------------- the version in force */

/**
 * The version the notice compares against: the newest archived version that is
 * not the one being announced. Before v2.3.0 that is v2.2.0, archived in
 * English only (the German contract version is new with v2.3.0, section 1.4).
 */
export function versionInForce(target: string = TERMS_VERSION): ArchivedTermsVersion {
  const entry = ARCHIVED_TERMS_VERSIONS.find((v) => v.version !== target);
  if (!entry) throw new Error('no archived version before the one announced');
  return entry;
}

const ROOT = path.resolve(__dirname, '..', '..');
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The archived text of the version in force, checked against its recorded digest. */
export function readArchivedText(entry: ArchivedTermsVersion, root: string = ROOT): string {
  const text = normaliseTermsText(fs.readFileSync(path.join(root, entry.file), 'utf8'));
  if (sha256(text) !== entry.sha256) throw new Error(`${entry.file} does not match its archived digest — a published version was edited`);
  return text;
}

/** The new wording exactly as `/terms` (and the archive) render it today. */
export function liveTermsMarkdown(lang: LegalLang): string {
  return toArchiveMarkdown(legalDocumentBlocks('terms', lang));
}

/* ------------------------------------------------------------------ the list */

export interface BuildTermsChangesInput {
  oldEn: string;
  newEn: string;
  newDe: string;
  reasons?: Readonly<Record<string, ChangeReason>>;
  from?: TermsChanges['from'];
  to?: TermsChanges['to'];
}

const OPEN_MARKER = /\[(?:open|offen): [^\]]*\]/g;

export function buildTermsChanges(input: BuildTermsChangesInput): TermsChanges {
  const reasons = input.reasons ?? CHANGE_REASONS;
  const oldSections = parseTermsSections(input.oldEn);
  const enSections = parseTermsSections(input.newEn);
  const deSections = parseTermsSections(input.newDe);
  const byKey = (list: TermsSection[]) => new Map(list.map((s) => [s.key, s]));
  const oldBy = byKey(oldSections);
  const deBy = byKey(deSections);

  const clauseIds = {
    en: enSections.flatMap((s) => sectionClauses(s).map((c) => c.id)),
    de: deSections.flatMap((s) => sectionClauses(s).map((c) => c.id)),
  };

  const changes: TermsChange[] = [];
  const push = (c: Omit<TermsChange, 'reason' | 'diff'>) =>
    changes.push({ ...c, diff: wordDiff(c.oldParas, c.newParas.en), reason: reasons[c.id] ?? null });

  const order = [...enSections.map((s) => s.key), ...oldSections.map((s) => s.key).filter((k) => !enSections.some((s) => s.key === k))];
  for (const key of order) {
    const en = enSections.find((s) => s.key === key) ?? null;
    const old = oldBy.get(key) ?? null;
    const de = deBy.get(key) ?? null;
    const heading = { en: en?.heading ?? old?.heading ?? '', de: de?.heading ?? en?.heading ?? old?.heading ?? '' };
    if (!old && en) {
      push({ id: key, section: key, kind: 'added', heading, oldParas: [], newParas: { en: en.paras, de: de?.paras ?? [] } });
      continue;
    }
    if (old && !en) {
      push({ id: key, section: key, kind: 'removed', heading, oldParas: old.paras, newParas: { en: [], de: [] } });
      continue;
    }
    if (!old || !en) continue;

    if (normaliseWording(old.title) !== normaliseWording(en.title)) {
      push({ id: `${key}:heading`, section: key, kind: 'heading', heading, oldParas: [old.heading], newParas: { en: [en.heading], de: de ? [de.heading] : [] } });
    }

    const oldClauses = sectionClauses(old);
    const enClauses = sectionClauses(en);
    const deClauses = de ? sectionClauses(de) : [];
    const common = enClauses.filter((c) => oldClauses.some((o) => o.id === c.id));
    if (common.length === 0) {
      // The numbering itself changed: one entry for the whole section.
      if (!samewording(old.paras, en.paras)) {
        push({ id: key, section: key, kind: 'changed', heading, oldParas: old.paras, newParas: { en: en.paras, de: de?.paras ?? [] } });
      }
      continue;
    }
    for (const c of enClauses) {
      const o = oldClauses.find((x) => x.id === c.id);
      const d = deClauses.find((x) => x.id === c.id);
      const newParas = { en: c.paras, de: d?.paras ?? [] };
      if (!o) push({ id: c.id, section: key, kind: 'added', heading, oldParas: [], newParas });
      else if (!samewording(o.paras, c.paras)) push({ id: c.id, section: key, kind: 'changed', heading, oldParas: o.paras, newParas });
    }
    for (const o of oldClauses) {
      if (!enClauses.some((c) => c.id === o.id)) push({ id: o.id, section: key, kind: 'removed', heading, oldParas: o.paras, newParas: { en: [], de: [] } });
    }
  }

  const changedIds = new Set(changes.map((c) => c.id));
  const openMarkers = [
    ...new Set(
      changes.flatMap((c) => [...c.newParas.en, ...c.newParas.de].flatMap((p) => p.match(OPEN_MARKER) ?? [])),
    ),
  ];
  const canonical = changes.map((c) => ({ id: c.id, kind: c.kind, oldParas: c.oldParas, newParas: c.newParas, reason: c.reason }));
  return {
    from: input.from ?? { version: '', label: '', effectiveOn: '', file: '', languages: ['en'] },
    to: input.to ?? { version: TERMS_VERSION, label: TERMS_LABEL },
    changes,
    clauseIds,
    missingReasons: changes.filter((c) => !c.reason).map((c) => c.id),
    staleReasons: Object.keys(reasons).filter((id) => !changedIds.has(id)),
    openMarkers,
    digest: sha256(JSON.stringify({ from: input.from?.version ?? null, to: input.to?.version ?? TERMS_VERSION, changes: canonical })),
  };
}

/** The changes from the version in force to the live texts — what the notice states at send time. */
export function currentTermsChanges(root: string = ROOT): TermsChanges {
  const inForce = versionInForce();
  return buildTermsChanges({
    oldEn: readArchivedText(inForce, root),
    newEn: liveTermsMarkdown('en'),
    newDe: liveTermsMarkdown('de'),
    from: {
      version: inForce.version,
      label: inForce.label,
      effectiveOn: inForce.effectiveOn,
      file: inForce.file,
      languages: ['en', ...(inForce.translations ?? []).map((t) => t.lang)],
    },
    to: { version: TERMS_VERSION, label: TERMS_LABEL },
  });
}
