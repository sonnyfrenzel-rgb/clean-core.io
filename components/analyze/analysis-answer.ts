/**
 * The answer at the top of the Analyze stage, as words — deterministic.
 *
 * DESIGN.md ADR-029 ("the answer first, then the figure") and §2.11: a business
 * reader gets one sentence that says what the analysis found, before any table.
 * Every word below is derived from the run's own evidence — the engine's
 * findings and their severities, the line count, the route the rules
 * recommended or the reader chose, and the number of things the page lists as
 * not determined. Nothing is asked of a model and nothing is guessed: where a
 * figure is missing, the sentence says so instead of filling it in.
 *
 * Pure and import-free (types only), so a spec can hold the wording without a
 * browser.
 */

import type { EvidenceFinding } from '@/lib/abap/evidence-model';

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

/** The route as a reader says it — never the stored enum. */
export function plainRoute(route: string | null | undefined): string | null {
  if (!route) return null;
  if (route.includes('BTP')) return 'a side-by-side extension on SAP BTP';
  if (route.includes('ABAP Cloud') || route.includes('RAP')) return 'on-stack ABAP Cloud inside S/4HANA';
  return null;
}

/** The short form for a figure tile. */
export function shortRoute(route: string | null | undefined): string | null {
  if (!route) return null;
  if (route.includes('BTP')) return 'BTP side-by-side';
  if (route.includes('ABAP Cloud') || route.includes('RAP')) return 'ABAP Cloud on-stack';
  return null;
}

export interface AnswerInput {
  counts: FindingCounts;
  /** Lines of source the engine read; 0 when the source is not on the page. */
  lines: number;
  /** The route shown on the page (the stored one), or null. */
  route: string | null | undefined;
  /** The reader pressed "Switch track": the shown route is theirs, not the rules'. */
  routeChosenByReader: boolean;
  /** How many items the "could not determine" section lists. */
  notDetermined: number;
}

export interface AnalysisAnswerText {
  /** The answer, one line: the title of the section. */
  headline: string;
  /** Two or three sentences under it, each a fact of this run. */
  detail: string;
}

export function analysisAnswer(input: AnswerInput): AnalysisAnswerText {
  const { counts, lines, route, routeChosenByReader, notDetermined } = input;
  const { Critical: critical, High: high, Medium: medium, Low: low } = counts.bySeverity;
  const routeWords = plainRoute(route);

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

  const parts: string[] = [];
  const read = lines > 0 ? `read all ${lines.toLocaleString('en-US')} lines` : 'read the source';
  if (counts.total === 0) {
    parts.push(`The engine ${read} without a model. Its checks are not the whole program, so this is not a clean bill.`);
  } else {
    const spread = [
      critical ? `${critical} critical` : null,
      high ? `${high} high` : null,
      medium ? `${medium} medium` : null,
      low ? `${low} low` : null,
    ].filter(Boolean);
    parts.push(
      `The engine ${read} without a model and rated each finding by severity` +
        (spread.length ? `: ${spread.join(', ')}.` : '.'),
    );
  }

  if (!routeWords) {
    parts.push('No extensibility route has been determined for it.');
  } else if (routeChosenByReader) {
    parts.push(`You chose ${routeWords} as its target; the rules had recommended the other route.`);
  } else {
    parts.push(`By fixed rules, the recommended target for it is ${routeWords}.`);
  }

  if (notDetermined > 0) {
    parts.push(
      `${plural(notDetermined, 'thing', 'things')} this analysis could not determine ${notDetermined === 1 ? 'is' : 'are'} listed at the end, each with its reason.`,
    );
  }

  return { headline, detail: parts.join(' ') };
}
