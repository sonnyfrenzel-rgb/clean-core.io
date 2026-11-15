import type { Project } from '@/lib/types';
import { formatIsoDate, formatTextDate } from '@/lib/format';
import { countSourceLines } from '@/lib/source-lines';
import { sourceFileName } from '@/lib/source-file-name';
import { summaryOf } from '@/lib/project-summary';
import { HOME_STATUS_LABEL, HOME_STATUS_ORDER, homeStatus, type HomeStatus, type HomeStatusKind } from '@/lib/home-status';

/**
 * One row of the home page's project list (AB-14b, mockup `docs/roadmap/home-mockup-v2.html`, states 2–9, 11, 12):
 * four columns — Project, Status, Next step, Last change — and, behind the "Figures" switch, one line of figures.
 *
 * **The row source is lean (H-O9).** The list used to read the newest 25 project
 * documents in the browser, source code and all, so a 26th project was nowhere on the page and its search could not
 * find it. Rows of the account's own projects are now computed on the server (`GET /api/workspace-rows`) from every
 * project it owns and sent without the source: a `HomeRow` carries no line of code, no artefact and no model text —
 * {@link HOME_ROW_KEYS} is the whole of it, and the spec holds that. Search, filters and sort then run over all rows.
 *
 * A project another account shared with this one is still read through the rules, document by document
 * (`/api/shared-projects` names the ids), and put through the same {@link toHomeRow} in the browser.
 *
 * Every value is a fact with a source or an absence with a name, as in `lib/workspace-rows.ts`: `null` is not zero.
 *
 * Pure: no React, no Firestore, no fetch.
 */

export interface HomeRow {
  id: string;
  /** What the reader called it. */
  name: string;
  /** The program's own name — "Z_MM_PO_APPROVAL" — or null when nothing names it yet. The only identifier (AB-14b). */
  program: string | null;
  access: 'own' | 'shared';
  /** Started from one of the shipped examples: fictitious code, real engine output. */
  fromExample: boolean;
  /** A source is staged: a run can be started on it. */
  hasSource: boolean;
  /** A signed run is on record. */
  hasRun: boolean;
  /** Lines of the analysed source (the run's figure), or of the staged one; null when nothing is staged. */
  lines: number | null;
  linesFromRun: boolean;
  /** Findings on record, or null when nothing analysed this project. */
  findings: number | null;
  /** The run's clean core score from the server-written project summary, or null. */
  score: number | null;
  status: HomeStatus;
  /** ISO 8601 day of the last change, for sorting; null when the project carries no date. */
  lastChange: string | null;
  /** The same day as the list prints it — "6 Nov 2026" (H-O10). */
  lastChangeText: string | null;
  /**
   * Changes when the run or the source changes: the key the figures of a row (levels, rules) are read again by
   * (`hooks/useWorkspaceRowFacts.ts`). Never the source itself.
   */
  factsKey: string;
}

/** Every key a row carries. A key outside this list is not sent — the spec checks it. */
export const HOME_ROW_KEYS: readonly (keyof HomeRow)[] = [
  'id', 'name', 'program', 'access', 'fromExample', 'hasSource', 'hasRun', 'lines', 'linesFromRun', 'findings', 'score',
  'status', 'lastChange', 'lastChangeText', 'factsKey',
];

/** "Z_MM_PO_APPROVAL.abap" → "Z_MM_PO_APPROVAL". */
export function programNameOf(fileName: string | null): string | null {
  if (!fileName) return null;
  const name = fileName.trim().replace(/\.(abap|txt)$/i, '');
  return name || null;
}

export function toHomeRow(project: Project & { id: string }, access: 'own' | 'shared' = 'own'): HomeRow {
  const source = typeof project.legacyCode === 'string' ? project.legacyCode : '';
  const hasSource = source.trim().length > 0;
  const hasRun = typeof project.activeRunId === 'string' && project.activeRunId.trim().length > 0;
  const recordedLines = project.auditMetadata?.inputFingerprint?.lineCount;
  const lines = typeof recordedLines === 'number' ? recordedLines : hasSource ? countSourceLines(source) : null;
  const changed = project.updatedAt ?? project.createdAt;
  const summary = summaryOf(project as { activeRunId?: unknown; summary?: unknown });
  return {
    id: project.id,
    name: typeof project.name === 'string' && project.name.trim() ? project.name : project.id,
    program: programNameOf(sourceFileName(project)),
    access,
    fromExample: project.fromExample === true,
    hasSource,
    hasRun,
    lines,
    linesFromRun: typeof recordedLines === 'number',
    findings: hasRun && Array.isArray(project.worklist) ? project.worklist.length : null,
    score: summary?.cleanCoreScore ?? null,
    status: homeStatus(project),
    lastChange: changed ? formatIsoDate(changed) : null,
    lastChangeText: changed ? formatTextDate(changed) : null,
    factsKey: `${hasRun ? project.activeRunId : ''}:${source.length}`,
  };
}

/* ------------------------------------------------------------------ filter, sort, show */

/** Filters appear from this many projects on (mockup: `FILTERS_FROM`). */
export const FILTERS_FROM = 10;

/** Rows shown before "Show all" (mockup: `FIRST_ROWS`). */
export const FIRST_ROWS = 10;

/** The attention card's most rows (plan AB-14b: "at most three"). */
export const ATTENTION_SHOWN = 3;

/** The Status filter's extra value: every project with a reason for attention. */
export const ATTENTION_FILTER = 'attention';

export interface HomeFilter {
  search: string;
  /** A status kind, {@link ATTENTION_FILTER}, or '' for any. */
  status: string;
  /** A clean core level the project has findings at — 'A' … 'D' — or '' for any. */
  level: string;
}

export const EMPTY_HOME_FILTER: HomeFilter = { search: '', status: '', level: '' };

export function homeFilterActive(filter: HomeFilter): boolean {
  return filter.search.trim().length > 0 || filter.status.length > 0 || filter.level.length > 0;
}

export type HomeSort = 'last-change' | 'name';

export function sortHomeRows(rows: readonly HomeRow[], sort: HomeSort): HomeRow[] {
  return sort === 'name'
    ? [...rows].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    : // Newest first; a project with no date at all goes last rather than first.
      [...rows].sort((a, b) => (b.lastChange ?? '').localeCompare(a.lastChange ?? ''));
}

/**
 * Live filtering over **every** row. Search is case-insensitive over what the reader has in mind: the name they gave
 * the project and the program's name.
 *
 * @param hasLevel whether a row has findings at a level — `null` while not known. A row still being read is kept,
 *   never hidden for being slow.
 */
export function filterHomeRows(
  rows: readonly HomeRow[],
  filter: HomeFilter,
  hasLevel: (row: HomeRow, level: string) => boolean | null = () => null,
): HomeRow[] {
  const needle = filter.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.status === ATTENTION_FILTER) {
      if (!row.status.attention) return false;
    } else if (filter.status && row.status.kind !== filter.status) return false;
    if (filter.level && hasLevel(row, filter.level) === false) return false;
    if (!needle) return true;
    return `${row.name} ${row.program ?? ''}`.toLowerCase().includes(needle);
  });
}

/** The Status filter's options: the kinds the rows are in, in the order a project moves, then "Needs attention". */
export function homeStatusOptions(rows: readonly HomeRow[]): Array<{ value: string; label: string }> {
  const kinds: HomeStatusKind[] = HOME_STATUS_ORDER.filter((k) => rows.some((r) => r.status.kind === k));
  const options = kinds.map((k) => ({ value: k as string, label: HOME_STATUS_LABEL[k] }));
  if (rows.some((r) => r.status.attention)) options.push({ value: ATTENTION_FILTER, label: ATTENTION_FILTER_LABEL });
  return options;
}

export const ATTENTION_FILTER_LABEL = 'Needs attention';

/**
 * "Needs your attention" — only own projects with a reason (code changed, design no longer fits, a failed test run),
 * newest first, at most {@link ATTENTION_SHOWN}; `total` counts them all. No reason, no card.
 */
export function attentionRows(rows: readonly HomeRow[]): { shown: HomeRow[]; total: number } {
  const all = sortHomeRows(rows.filter((r) => r.access === 'own' && r.status.attention !== null), 'last-change');
  return { shown: all.slice(0, ATTENTION_SHOWN), total: all.length };
}

/* ------------------------------------------------------------------ the route's answer */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strOrNull = (v: unknown) => v === null || typeof v === 'string';
const numOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));

function isHomeStatus(v: unknown): v is HomeStatus {
  if (!isObj(v)) return false;
  if (!HOME_STATUS_ORDER.includes(v.kind as HomeStatusKind)) return false;
  if (!['waiting', 'moving', 'outdated'].includes(v.tone as string)) return false;
  if (typeof v.title !== 'string' || typeof v.detail !== 'string') return false;
  if (!['plain', 'warn', 'err'].includes(v.detailTone as string)) return false;
  if (!numOrNull(v.stepsDone)) return false;
  if (v.attention !== null && !['code-changed', 'design-outdated', 'test-failed'].includes(v.attention as string)) return false;
  if (v.next !== null) {
    if (!isObj(v.next)) return false;
    const n = v.next;
    if (typeof n.label !== 'string' || typeof n.tool !== 'string' || typeof n.path !== 'string' || typeof n.run !== 'boolean') return false;
  }
  return true;
}

/** The rows of `GET /api/workspace-rows`, read back strictly: a row not exactly of the shape is dropped. */
export function homeRowsOf(body: unknown): HomeRow[] | null {
  if (!isObj(body) || !Array.isArray(body.rows)) return null;
  const out: HomeRow[] = [];
  for (const r of body.rows as unknown[]) {
    if (!isObj(r)) continue;
    if (typeof r.id !== 'string' || typeof r.name !== 'string' || !strOrNull(r.program)) continue;
    if (r.access !== 'own' && r.access !== 'shared') continue;
    if (typeof r.fromExample !== 'boolean' || typeof r.hasSource !== 'boolean' || typeof r.hasRun !== 'boolean') continue;
    if (!numOrNull(r.lines) || typeof r.linesFromRun !== 'boolean' || !numOrNull(r.findings) || !numOrNull(r.score)) continue;
    if (!isHomeStatus(r.status) || !strOrNull(r.lastChange) || !strOrNull(r.lastChangeText) || typeof r.factsKey !== 'string') continue;
    const row = Object.fromEntries(HOME_ROW_KEYS.map((k) => [k, r[k]])) as unknown as HomeRow;
    out.push(row);
  }
  return out;
}
