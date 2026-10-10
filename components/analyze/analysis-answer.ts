/**
 * The answer at the top of the Analyze stage, as words — deterministic.
 *
 * DESIGN.md ADR-029 ("the answer first, then the figure") and §2.11: a business
 * reader gets one sentence that says what the analysis found, before any table.
 * Every word below is derived from the run's own evidence — the engine's
 * findings and their severities, the line count, the route the rules
 * recommended (or an earlier build's switch stored), and the tables the code
 * writes. Nothing is asked of a model and nothing is guessed: where a figure is
 * missing, the sentence says so instead of filling it in.
 *
 * Pure and import-free (types only), so a spec can hold the wording without a
 * browser.
 */

import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import { BTP, BTP_FIRST, isSideBySideRoute } from '@/lib/sap-naming';

export type SeverityKey = 'Critical' | 'High' | 'Medium' | 'Low';

export interface FindingGroup {
  finding: EvidenceFinding;
  lines: number[];
  snippets: string[];
}

export interface FindingCounts {
  /** Distinct findings — one per pattern and object, as the table lists them. */
  total: number;
  bySeverity: Record<SeverityKey, number>;
}

const SEVERITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

/**
 * One row per pattern and object, the lines it occurs on gathered — the same
 * grouping the findings table has always used, held here once so the sentence
 * and the table count the same thing.
 */
export function groupEvidenceFindings(findings: readonly EvidenceFinding[]): FindingGroup[] {
  const grouped = new Map<string, FindingGroup>();
  for (const ef of findings) {
    const key = `${ef.kind}::${ef.objectName || ef.title}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.lines.push(ef.lineStart);
      if (ef.snippet && !existing.snippets.includes(ef.snippet)) existing.snippets.push(ef.snippet);
    } else {
      grouped.set(key, { finding: ef, lines: [ef.lineStart], snippets: ef.snippet ? [ef.snippet] : [] });
    }
  }
  return Array.from(grouped.values()).sort(
    (a, b) => (SEVERITY_ORDER[a.finding.severity] ?? 9) - (SEVERITY_ORDER[b.finding.severity] ?? 9),
  );
}

export function countFindings(groups: readonly FindingGroup[]): FindingCounts {
  const bySeverity: Record<SeverityKey, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const g of groups) {
    const s = g.finding.severity;
    if (s in bySeverity) bySeverity[s as SeverityKey] += 1;
  }
  return { total: groups.length, bySeverity };
}

/**
 * The engine's titles of a few patterns open with the severity in capitals
 * ("CRITICAL: Direct Write to …"). The severity has its own column; said twice
 * in one row it reads as two findings.
 */
export function findingTitle(title: string): string {
  return title.replace(/^(CRITICAL|HIGH|MEDIUM|LOW)\s*:\s*/i, '');
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The route as a reader says it — never the stored enum. `first` is the
 * platform's first mention on the page (roadmap 3.0.15, `lib/sap-naming.ts`).
 */
export function plainRoute(route: string | null | undefined, first = false): string | null {
  if (!route) return null;
  if (isSideBySideRoute(route)) return `a side-by-side extension on ${first ? BTP_FIRST : BTP}`;
  if (route.includes('ABAP Cloud') || route.includes('RAP')) return 'on-stack ABAP Cloud inside S/4HANA';
  return null;
}

/** The short form for a figure tile. */
export function shortRoute(route: string | null | undefined): string | null {
  if (!route) return null;
  if (isSideBySideRoute(route)) return `${BTP} side-by-side`;
  if (route.includes('ABAP Cloud') || route.includes('RAP')) return 'ABAP Cloud on-stack';
  return null;
}

export interface AnswerInput {
  counts: FindingCounts;
  /** Lines of source the engine read; 0 when the source is not on the page. */
  lines: number;
  /** The route shown on the page (the stored one), or null. */
  route: string | null | undefined;
  /**
   * The stored route differs from the recommendation: an earlier build had a
   * switch that wrote it from the browser (removed 10.10.2026), so a project
   * may still carry the reader's choice.
   */
  routeChosenByReader: boolean;
}

export interface AnalysisAnswerText {
  /** The answer, one line: the title of the section. */
  headline: string;
  /**
   * One sentence under it (owner decision 10.10.2026, DESIGN.md §2.11 "nothing
   * twice"): who read what, and the route. The severity spread is the Findings
   * facet's bar, what is not determined is the side card, and the model's
   * summary says what it is on its own fold — none of them is repeated here.
   */
  detail: string;
}

export function analysisAnswer(input: AnswerInput): AnalysisAnswerText {
  const { counts, lines, route, routeChosenByReader } = input;
  const { Critical: critical, High: high } = counts.bySeverity;
  const routeWords = plainRoute(route, true);

  let headline: string;
  if (counts.total === 0) {
    headline = 'The evidence engine found nothing in what it checks';
  } else {
    const serious = [
      critical > 0 ? `${critical} critical` : null,
      high > 0 ? `${high} high` : null,
    ].filter(Boolean);
    headline =
      `${plural(counts.total, 'finding', 'findings')} to review in this code` +
      (serious.length ? ` — ${serious.join(' and ')}` : '');
  }

  const read = lines > 0 ? `read all ${lines.toLocaleString('en-US')} lines` : 'read the source';
  const clean = counts.total === 0 ? '; its checks are not the whole program, so this is not a clean bill' : '';
  const routeClause = !routeWords
    ? 'no extensibility route has been determined for it'
    : routeChosenByReader
      ? `you chose ${routeWords} as its target; the rules had recommended the other route`
      : `by fixed rules, the recommended target is ${routeWords}`;

  return { headline, detail: `The engine ${read} without a model${clean}; ${routeClause}.` };
}

/* ------------------------------------------------------------ data effect */

/** The tables the code writes, by kind — the one finding a manager must not miss (audit §3.7). */
export interface DataEffect {
  /** SAP standard tables written directly, distinct, in the order first found. */
  standard: string[];
  /** Custom (customer-namespace) tables written, distinct, in the order first found. */
  custom: string[];
}

/** The two finding kinds a data effect is read from — also the findings groups the chips open. */
export const DATA_EFFECT_KINDS = { standard: 'standard-table-write', custom: 'custom-table-write' } as const;

/** Read off the engine's findings only: the kind and the object it names. Nothing else is inferred. */
export function dataEffect(findings: readonly EvidenceFinding[]): DataEffect {
  const of = (kind: string) => {
    const names: string[] = [];
    for (const f of findings) {
      if (f.kind !== kind || !f.objectName) continue;
      const name = f.objectName.trim().toUpperCase();
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  };
  return { standard: of(DATA_EFFECT_KINDS.standard), custom: of(DATA_EFFECT_KINDS.custom) };
}

/** A piece of the data-effect sentence: words, or a table that becomes a chip opening its findings group. */
export type EffectPart = { text: string } | { table: string; kind: string };

/** At most this many table names per kind; the rest is counted ("and 3 more"). */
export const EFFECT_NAMES_SHOWN = 4;

/**
 * The data-effect sentence as parts, deterministic: "It writes to 1 SAP
 * standard table (EBAN) and 2 custom tables (ZMM_PO_APPR, ZMM_PO_ATTACH)."
 * With no write found it says so — within what the engine checks, never as a
 * claim about the whole program.
 */
export function dataEffectParts(effect: DataEffect): EffectPart[] {
  const groups = [
    { names: effect.standard, kind: DATA_EFFECT_KINDS.standard, one: 'SAP standard table', many: 'SAP standard tables' },
    { names: effect.custom, kind: DATA_EFFECT_KINDS.custom, one: 'custom table', many: 'custom tables' },
  ].filter((g) => g.names.length > 0);
  if (groups.length === 0) return [{ text: 'In what it checks, the engine found no write to a database table.' }];
  const parts: EffectPart[] = [{ text: 'It writes to ' }];
  groups.forEach((g, gi) => {
    if (gi > 0) parts.push({ text: ' and ' });
    parts.push({ text: `${plural(g.names.length, g.one, g.many)} (` });
    const shown = g.names.slice(0, EFFECT_NAMES_SHOWN);
    shown.forEach((name, i) => {
      if (i > 0) parts.push({ text: ', ' });
      parts.push({ table: name, kind: g.kind });
    });
    const more = g.names.length - shown.length;
    parts.push({ text: more > 0 ? ` and ${more} more)` : ')' });
  });
  parts.push({ text: '.' });
  return parts;
}

/** The same sentence as plain text — for a spec and for a screen reader's summary. */
export function dataEffectSentence(effect: DataEffect): string {
  return dataEffectParts(effect)
    .map((p) => ('text' in p ? p.text : p.table))
    .join('');
}
