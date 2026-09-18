/**
 * The project search index — roadmap 6.6, `DESIGN.md` §2.1 ("Shell Bar …
 * Suche ⌘K") and §5.9's precedent for the pattern.
 *
 * Five kinds, because the roadmap row names five: *Elemente, Regeln, Findings,
 * Zeilen und Glossar*. Every one of the first four is read off data the
 * workspace already holds — the process reading `FirstLook` computed for this
 * screen, and the run's own worklist — rather than recomputed here, for the
 * same reason `lib/first-look.ts` gives for not calling `buildAbapEvidence` a
 * second time: a second computation of the same evidence is a second place for
 * it to disagree with the first. The glossary is static and always present.
 *
 * **No model call anywhere in this file.** Every function below is pure and
 * synchronous; nothing imports `lib/gemini.ts` or `fetch`s anything. The
 * glossary answer a hit carries is `lib/glossary-lookup.ts`'s own text.
 *
 * **What "link to it" means today.** An element and a rule are read from the
 * process reading that `documentation` renders (`ProcessMap`, the business
 * rules panel); a finding is read from the worklist `analyze` renders
 * (`GapsWorklist`). Neither of those pages yet carries a per-row DOM anchor a
 * URL fragment could land on — that is a gap this step surfaces rather than
 * papers over with an `href` that only looks like it goes somewhere — so a hit
 * links to the *page* that lists it. A source line is the one kind with an
 * address stable enough to act on outside any page (`L<n>`), and is offered as
 * such.
 */

import { anchorLabel, type SourceReading } from './first-look';
import type { Project, WorklistItem } from './types';
import type { SkeletonNode } from './abap/process-skeleton';
import type { BusinessRule } from './abap/business-rule-set';
import { GLOSSARY_ITEMS } from './glossary';
import { glossaryAnswerText } from './glossary-lookup';

export type SearchResultKind = 'element' | 'rule' | 'finding' | 'source-line' | 'glossary';

/** What a reader sees named beside every hit — roadmap 6.6: "was für ein Ding". */
export const SEARCH_KIND_LABEL: Record<SearchResultKind, string> = {
  element: 'Element',
  rule: 'Rule',
  finding: 'Finding',
  'source-line': 'Source line',
  glossary: 'Glossary',
};

export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  detail: string;
  /** A line anchor (`L231`, `L380-412`), or `null` when the item carries none. */
  anchor: string | null;
  /** Where a click goes. `null` only for a glossary hit, which answers in place. */
  href: string | null;
  /** Set only on a glossary hit — the answer itself, so no navigation is needed. */
  glossaryAnswer?: string;
  glossarySource?: string;
}

export interface WorkspaceSearchIndexInput {
  projectId: string;
  project: Project | null;
  /** The process reading `FirstLook` produced for this project, if any. */
  reading: SourceReading | null;
}

/** Boilerplate flow markers, not things a reader would ever search for. */
const SKIPPED_NODE_KINDS = new Set(['start', 'end']);

function elementResults(projectId: string, nodes: readonly SkeletonNode[]): SearchResult[] {
  return nodes
    .filter((node) => !SKIPPED_NODE_KINDS.has(node.kind) && node.label.trim().length > 0)
    .map((node) => ({
      id: `element:${node.id}`,
      kind: 'element' as const,
      title: node.label,
      detail: `${node.kind} · ${node.region}`,
      anchor: node.anchor ? anchorLabel(node.anchor.lineStart, node.anchor.lineEnd) : null,
      href: `/project/${projectId}/documentation`,
    }));
}

function firstAnchorOf(rule: BusinessRule): string | null {
  for (const sentence of rule.sentences) {
    const first = sentence.anchors[0];
    if (first) return anchorLabel(first.lineStart, first.lineEnd);
  }
  return null;
}

function ruleResults(projectId: string, rules: readonly BusinessRule[]): SearchResult[] {
  return rules.map((rule) => ({
    id: `rule:${rule.id}`,
    kind: 'rule' as const,
    title: `${rule.id} · ${rule.text}`,
    detail: rule.type,
    anchor: firstAnchorOf(rule),
    href: `/project/${projectId}/documentation`,
  }));
}

function findingResults(projectId: string, worklist: readonly WorklistItem[]): SearchResult[] {
  return worklist.map((item) => ({
    id: `finding:${item.id}`,
    kind: 'finding' as const,
    title: item.title,
    detail: [item.category, item.severity].filter(Boolean).join(' · '),
    anchor: item.targetAnchor ?? (item.location || null),
    href: `/project/${projectId}/analyze`,
  }));
}

function glossaryResults(): SearchResult[] {
  return Object.entries(GLOSSARY_ITEMS).map(([key, item]) => ({
    id: `glossary:${key}`,
    kind: 'glossary' as const,
    title: item.shortName,
    detail: item.term,
    anchor: null,
    href: null,
    glossaryAnswer: glossaryAnswerText(item),
    glossarySource: item.source,
  }));
}

/**
 * The fixed part of the index — everything except source lines, which are
 * matched on demand in `searchWorkspace` rather than materialised up front
 * (a 1,000-line example would otherwise put a thousand unused rows in memory
 * for every keystroke that never asks for one).
 *
 * Cheap enough to rebuild on every render of the shell: a real project's
 * skeleton, rule set, worklist and the glossary together run to a few hundred
 * entries at most, never the tens of thousands a debounce would be for.
 */
export function buildWorkspaceSearchIndex({ projectId, project, reading }: WorkspaceSearchIndexInput): SearchResult[] {
  const elements = reading ? elementResults(projectId, reading.skeleton.nodes) : [];
  const rules = reading ? ruleResults(projectId, reading.ruleSet.rules) : [];
  const findings = project?.worklist ? findingResults(projectId, project.worklist) : [];
  return [...elements, ...rules, ...findings, ...glossaryResults()];
}

/** `231` or `L231` — the same shape `lib/process-navigation.ts` recognises. */
const LINE_QUERY = /^l?\s*(\d+)$/i;

/** Below this length a text scan of every line is more noise than signal. */
const MIN_TEXT_QUERY = 3;

/** At most this many source-line hits, so one common word does not bury everything else. */
const MAX_LINE_HITS = 5;

function sourceLineResults(projectId: string, legacyCode: string, raw: string): SearchResult[] {
  const lines = legacyCode.split('\n');
  const lineMatch = LINE_QUERY.exec(raw);

  if (lineMatch) {
    const n = Number(lineMatch[1]);
    if (!Number.isInteger(n) || n < 1 || n > lines.length) return [];
    const text = lines[n - 1].trim();
    return [{
      id: `source-line:${n}`,
      kind: 'source-line',
      title: `Line ${n}`,
      detail: text || '(blank line)',
      anchor: `L${n}`,
      href: `/project/${projectId}/documentation`,
    }];
  }

  if (raw.length < MIN_TEXT_QUERY) return [];
  const q = raw.toLowerCase();
  const hits: SearchResult[] = [];
  for (let i = 0; i < lines.length && hits.length < MAX_LINE_HITS; i += 1) {
    if (!lines[i].toLowerCase().includes(q)) continue;
    hits.push({
      id: `source-line:${i + 1}`,
      kind: 'source-line',
      title: `Line ${i + 1}`,
      detail: lines[i].trim(),
      anchor: `L${i + 1}`,
      href: `/project/${projectId}/documentation`,
    });
  }
  return hits;
}

const rank = (result: SearchResult, q: string): number => {
  const title = result.title.toLowerCase();
  if (title === q) return 0;
  if (title.startsWith(q)) return 1;
  return 2;
};

/**
 * Every hit for a query, best first — the fixed index plus, when the project's
 * source is available, whatever source lines match.
 *
 * An empty query returns nothing: `DESIGN.md` §2.5's live-filter answers "what
 * matches so far", not "everything there is", and a dialog that opened onto a
 * few hundred rows would be the keyboard-trap failure this step's
 * accessibility rules exist to rule out, just made of results instead of tab
 * stops.
 */
export function searchWorkspace(
  index: readonly SearchResult[],
  context: { projectId: string; legacyCode?: string },
  query: string,
): SearchResult[] {
  const raw = query.trim();
  if (!raw) return [];
  const q = raw.toLowerCase();

  const fixed = index.filter(
    (result) =>
      result.title.toLowerCase().includes(q) ||
      result.detail.toLowerCase().includes(q) ||
      (result.anchor?.toLowerCase().includes(q) ?? false),
  );
  const lines = context.legacyCode ? sourceLineResults(context.projectId, context.legacyCode, raw) : [];

  return [...fixed, ...lines].sort((a, b) => rank(a, q) - rank(b, q));
}
