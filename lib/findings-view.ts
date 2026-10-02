/**
 * How the evidence engine's findings are *shown* on the Analyze stage — the
 * style-independent half of "Analyze focus" (owner, 01.10.2026: the list was
 * far too long, nothing told the eye where to look, and the titles shouted).
 *
 * Four things live here, all pure and deterministic, so the visual direction
 * the owner picks later can restyle the screen without touching a rule:
 *
 *   1. **Calm wording** — `calmTitle`, `calmRecommendation`. The engine's own
 *      strings are part of the signed run (`app/api/runs/create/route.ts` puts
 *      `evidenceReport.findings` into the signed payload), so they are never
 *      rewritten at the source; this is a display mapping only. Severity lives
 *      in the severity chip and is not shouted a second time in the title.
 *   2. **Grouping and progressive disclosure** — one group per kind of finding
 *      ("Direct reads of SAP standard tables (14)"), critical and high groups
 *      open, five rows first and "Show N more"; a search or a severity filter
 *      opens every group it matches.
 *   3. **Focus** — `lookHereFirst`: the two or three findings that matter most,
 *      each with the rule that picked it. Fixed rules, no model.
 *   4. **Data for the visuals** — severity, kind, clean-core level and target
 *      distributions, and where in the program the findings sit.
 *
 * Nothing here invents a figure: every count is a count of findings the engine
 * produced, and anything without a value (a level not looked up, a finding
 * without a line) is said as such rather than placed somewhere.
 */

import type { EvidenceFinding, EvidenceKind } from './abap/evidence-model';
import { ABCD_META, type CloudReadinessGrade } from './abap/abcd-classification';

/* ------------------------------------------------------------------ types */

export type FindingSeverity = EvidenceFinding['severity'];
export type ShownSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

/** One row: a pattern on one object, with every line it occurs on. */
export interface FindingRow {
  finding: EvidenceFinding;
  lines: number[];
  snippets: string[];
}

export const SEVERITY_ORDER: readonly FindingSeverity[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];
const RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
const rank = (s: string | undefined) => RANK[s ?? ''] ?? 9;

/** How many rows a group shows before "Show N more". */
export const GROUP_PAGE_SIZE = 5;

/* ------------------------------------------------------------ 1. wording */

/**
 * Words that keep their capital letter in a sentence-case title: names of
 * products and technologies, not emphasis. Anything written in capitals
 * (EBAN, BDC, RFC, ALV) or mixed case (TCode, BAdI) is a name already and is
 * kept as written.
 */
const KEEP_CAPITALISED = new Set(['SAP', 'Dynpro', 'Fiori', 'ABAP', 'Open', 'Business', 'Credit']);

/**
 * The engine's title, in sentence case and without a severity prefix:
 * "CRITICAL: Direct Write to SAP Standard Table EBAN" → "Direct write to SAP
 * standard table EBAN". Display only — the signed title is unchanged.
 */
export function calmTitle(title: string): string {
  const bare = title.replace(/^(CRITICAL|HIGH|MEDIUM|LOW|INFO)\s*:\s*/i, '').trim();
  const words = bare.split(/(\s+|[()/,])/);
  let first = true;
  return words
    .map((w) => {
      if (!/\S/.test(w) || /^[()/,]$/.test(w)) return w;
      if (first) {
        first = false;
        return w;
      }
      // Only plain Capitalised words are lowered: "Write", "Standard", "Table".
      if (/^[A-Z][a-z]+$/.test(w) && !KEEP_CAPITALISED.has(w)) return w.toLowerCase();
      return w;
    })
    .join('');
}

/**
 * The engine's recommendation without shouting: "REPLACE IMMEDIATELY with …
 * Do NOT perform …" reads "Replace with … Do not perform …". The advice is the
 * same; urgency is the severity chip's job. Display only.
 */
export function calmRecommendation(text: string): string {
  return text
    .replace(/\bREPLACE IMMEDIATELY\b/g, 'Replace')
    .replace(/\bIMMEDIATELY\b/g, '')
    .replace(/\bDo NOT\b/g, 'Do not')
    .replace(/\bDO NOT\b/g, 'Do not')
    .replace(/\bNOT\b/g, 'not')
    .replace(/\bMUST\b/g, 'must')
    .replace(/\bNEVER\b/g, 'never')
    .replace(/\bofficial SAP released\b/g, 'released SAP')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ------------------------------------------------------- kinds and labels */

/**
 * What a group of findings is called, in a reader's words — the plural for a
 * group heading, the singular for a single row. Fixed per kind; a kind the
 * list does not know falls back to its id, said plainly, rather than a guess.
 */
export const KIND_LABEL: Readonly<Record<EvidenceKind, { one: string; many: string }>> = {
  'table-access': { one: 'Table access', many: 'Table accesses' },
  'custom-table-write': { one: 'Write to a custom table', many: 'Writes to custom tables' },
  'standard-table-read': { one: 'Direct read of an SAP standard table', many: 'Direct reads of SAP standard tables' },
  'standard-table-write': { one: 'Direct write to an SAP standard table', many: 'Direct writes to SAP standard tables' },
  'rfc-call': { one: 'Remote function call', many: 'Remote function calls' },
  bdc: { one: 'Batch input to a transaction', many: 'Batch input to transactions' },
  dynpro: { one: 'Classic screen (Dynpro)', many: 'Classic screens (Dynpro)' },
  'classic-alv': { one: 'Classic ALV list', many: 'Classic ALV lists' },
  'gui-download': { one: 'File transfer through the SAP GUI', many: 'File transfers through the SAP GUI' },
  'native-sql': { one: 'Native SQL', many: 'Native SQL statements' },
  'update-task': { one: 'Update task', many: 'Update tasks' },
  'commit-work': { one: 'Explicit transaction control', many: 'Explicit transaction control' },
  submit: { one: 'Call of another program (SUBMIT)', many: 'Calls of other programs (SUBMIT)' },
  'authority-check': { one: 'Authorization check', many: 'Authorization checks' },
  'hardcoded-value': { one: 'Hard-coded value', many: 'Hard-coded values' },
  'unreleased-api': { one: 'Call of an unreleased SAP API', many: 'Calls of unreleased SAP APIs' },
  'legacy-mail': { one: 'Classic mail sending', many: 'Classic mail sending' },
  'credit-management': { one: 'Custom credit management logic', many: 'Custom credit management logic' },
  'batch-input': { one: 'Batch input session', many: 'Batch input sessions' },
  'business-rule': { one: 'Business rule', many: 'Business rules' },
  enhancement: { one: 'Enhancement', many: 'Enhancements' },
  modification: { one: 'Modification of SAP code', many: 'Modifications of SAP code' },
};

export function kindLabel(kind: string, count: number): string {
  const entry = KIND_LABEL[kind as EvidenceKind];
  if (!entry) return kind;
  return count === 1 ? entry.one : entry.many;
}

/* ------------------------------------------------------ 2. rows and groups */

/**
 * One row per pattern and object, the lines it occurs on gathered and sorted —
 * the same deduplication the answer above the list counts.
 */
export function findingRows(findings: readonly EvidenceFinding[]): FindingRow[] {
  const grouped = new Map<string, FindingRow>();
  for (const ef of findings) {
    const key = `${ef.kind}::${ef.objectName || ef.title}`;
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.lines.includes(ef.lineStart)) existing.lines.push(ef.lineStart);
      if (ef.snippet && !existing.snippets.includes(ef.snippet)) existing.snippets.push(ef.snippet);
      // A row is as severe as its most severe occurrence.
      if (rank(ef.severity) < rank(existing.finding.severity)) existing.finding = ef;
    } else {
      grouped.set(key, { finding: ef, lines: [ef.lineStart], snippets: ef.snippet ? [ef.snippet] : [] });
    }
  }
  const rows = Array.from(grouped.values());
  for (const r of rows) r.lines.sort((a, b) => a - b);
  return rows.sort(compareRows);
}

/** Most severe first; within a severity, more occurrences first, then the earlier line. */
function compareRows(a: FindingRow, b: FindingRow): number {
  return (
    rank(a.finding.severity) - rank(b.finding.severity) ||
    b.lines.length - a.lines.length ||
    (a.lines[0] ?? 0) - (b.lines[0] ?? 0)
  );
}

export interface KindGroup {
  kind: string;
  /** "Direct reads of SAP standard tables". */
  label: string;
  rows: FindingRow[];
  /** The most severe row of the group. */
  worst: FindingSeverity;
  /** Open on first view: the group holds a critical or a high finding. */
  openByDefault: boolean;
}

/** Groups by kind, the most severe group first, then the larger one. */
export function groupByKind(rows: readonly FindingRow[]): KindGroup[] {
  const byKind = new Map<string, FindingRow[]>();
  for (const r of rows) {
    const list = byKind.get(r.finding.kind) ?? [];
    list.push(r);
    byKind.set(r.finding.kind, list);
  }
  const groups: KindGroup[] = [];
  for (const [kind, list] of byKind) {
    const sorted = [...list].sort(compareRows);
    const worst = sorted[0].finding.severity;
    groups.push({
      kind,
      label: kindLabel(kind, sorted.length),
      rows: sorted,
      worst,
      openByDefault: worst === 'Critical' || worst === 'High',
    });
  }
  return groups.sort(
    (a, b) => rank(a.worst) - rank(b.worst) || b.rows.length - a.rows.length || a.label.localeCompare(b.label),
  );
}

export interface FindingsFilter {
  query: string;
  /** `All` or one severity. */
  severity: 'All' | ShownSeverity;
  /** A stretch of the source picked on the "where in the program" strip. */
  lines?: { from: number; to: number } | null;
}

export const NO_FILTER: FindingsFilter = { query: '', severity: 'All' };

export function filterActive(f: FindingsFilter): boolean {
  return f.query.trim() !== '' || f.severity !== 'All' || Boolean(f.lines);
}

function rowMatches(row: FindingRow, f: FindingsFilter): boolean {
  if (f.severity !== 'All' && row.finding.severity !== f.severity) return false;
  if (f.lines && !row.lines.some((l) => l >= f.lines!.from && l <= f.lines!.to)) return false;
  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  const ef = row.finding;
  return [
    ef.title,
    calmTitle(ef.title),
    ef.kind,
    kindLabel(ef.kind, 1),
    kindLabel(ef.kind, 2),
    ef.objectName ?? '',
    ef.cleanCoreImpact ?? '',
    ef.sapReplacement?.objectName ?? '',
    row.lines.join(' '),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export interface ShownGroup extends KindGroup {
  /** Rows that pass the filter — all rows when there is none. */
  matching: FindingRow[];
  /** Open: by default, or because a filter matched something in it. */
  open: boolean;
}

/**
 * The groups as the list shows them under a filter. Without a filter every
 * group stands with its default; with one, groups without a match are left out
 * and every group with a match is opened, so a search never "finds" something
 * the reader then has to go and unfold. `openState` holds what the reader
 * toggled by hand, which wins over the default — but not over a filter: a
 * filter shows its matches.
 */
export function shownGroups(
  groups: readonly KindGroup[],
  filter: FindingsFilter,
  openState: Readonly<Record<string, boolean>> = {},
): ShownGroup[] {
  const active = filterActive(filter);
  const out: ShownGroup[] = [];
  for (const g of groups) {
    const matching = active ? g.rows.filter((r) => rowMatches(r, filter)) : g.rows;
    if (active && matching.length === 0) continue;
    const open = active ? true : openState[g.kind] ?? g.openByDefault;
    out.push({ ...g, matching, open });
  }
  return out;
}

/** The rows a group shows now, and how many "Show N more" would add. */
export function pageOf(
  rows: readonly FindingRow[],
  expanded: boolean,
  pageSize: number = GROUP_PAGE_SIZE,
): { shown: FindingRow[]; more: number } {
  if (expanded || rows.length <= pageSize) return { shown: [...rows], more: 0 };
  return { shown: rows.slice(0, pageSize), more: rows.length - pageSize };
}

/* ----------------------------------------------------------- 3. focus */

/**
 * Kinds that matter beyond their severity, in this order, each with the plain
 * reason it is shown first. A reason states what the code does — it is not a
 * prediction of what will break.
 */
const FOCUS_KINDS: ReadonlyArray<[string, string]> = [
  ['standard-table-write', 'Writes directly to an SAP standard table'],
  ['modification', 'Changes SAP code itself'],
  ['commit-work', 'Controls the database transaction itself'],
  ['update-task', 'Hands work to an update task'],
  ['bdc', 'Drives an SAP transaction through batch input'],
  ['native-sql', 'Bypasses ABAP SQL with native SQL'],
  ['hardcoded-value', 'Holds a hard-coded value in the source'],
];
const FOCUS_RANK = new Map(FOCUS_KINDS.map(([k], i) => [k, i]));
const FOCUS_WHY = new Map(FOCUS_KINDS);

export interface FocusPick {
  row: FindingRow;
  /** Why this one, in a few words: "Critical · Writes directly to an SAP standard table". */
  why: string;
  /** The rule beyond severity that picked it, or null when severity alone did. */
  reason: string | null;
}

/**
 * "Look here first": at most `max` findings, chosen by fixed rules —
 *
 *   - only critical or high findings, or a medium one of a kind listed above;
 *   - the most severe first; within a severity, a listed kind before others,
 *     in the list's order; then the row with more occurrences;
 *   - one per kind, so three reads of three tables do not crowd out a
 *     transaction-control finding.
 *
 * Fewer than `max` when fewer qualify — never filled up with low findings to
 * reach a number. An empty list says nothing stands out, which is an answer.
 */
export function lookHereFirst(rows: readonly FindingRow[], max = 3): FocusPick[] {
  const eligible = rows.filter((r) => {
    const s = r.finding.severity;
    return s === 'Critical' || s === 'High' || (s === 'Medium' && FOCUS_RANK.has(r.finding.kind));
  });
  const sorted = [...eligible].sort(
    (a, b) =>
      rank(a.finding.severity) - rank(b.finding.severity) ||
      (FOCUS_RANK.get(a.finding.kind) ?? 99) - (FOCUS_RANK.get(b.finding.kind) ?? 99) ||
      b.lines.length - a.lines.length ||
      (a.lines[0] ?? 0) - (b.lines[0] ?? 0),
  );
  const picks: FocusPick[] = [];
  const seen = new Set<string>();
  for (const row of sorted) {
    if (picks.length >= max) break;
    if (seen.has(row.finding.kind)) continue;
    seen.add(row.finding.kind);
    const reason = FOCUS_WHY.get(row.finding.kind);
    picks.push({
      row,
      why: reason ? `${row.finding.severity} · ${reason}` : row.finding.severity,
      reason: reason ?? null,
    });
  }
  return picks;
}

/* ------------------------------------------------- 4. data for the visuals */

export interface DistributionEntry<K extends string = string> {
  key: K;
  label: string;
  count: number;
  /** Share of the total, 0–1; 0 when the total is 0. */
  share: number;
}

function withShares<K extends string>(entries: Array<{ key: K; label: string; count: number }>): DistributionEntry<K>[] {
  const total = entries.reduce((n, e) => n + e.count, 0);
  return entries.map((e) => ({ ...e, share: total > 0 ? e.count / total : 0 }));
}

/** Findings (rows) per severity, Critical → Low, every severity listed even at 0. */
export function severityDistribution(rows: readonly FindingRow[]): DistributionEntry<ShownSeverity>[] {
  const keys: ShownSeverity[] = ['Critical', 'High', 'Medium', 'Low'];
  return withShares(
    keys.map((key) => ({ key, label: key, count: rows.filter((r) => r.finding.severity === key).length })),
  );
}

/** Findings (rows) per kind, the largest first; only kinds that occur. */
export function kindDistribution(rows: readonly FindingRow[]): DistributionEntry[] {
  const groups = groupByKind(rows);
  return withShares(groups.map((g) => ({ key: g.kind, label: g.label, count: g.rows.length }))).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

/** Findings that name a target option, per option. A finding may name several. */
export function targetDistribution(rows: readonly FindingRow[]): DistributionEntry[] {
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of r.finding.targetOptions ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return withShares(Array.from(counts, ([key, count]) => ({ key, label: key, count }))).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

/**
 * Objects per clean core level, A → D, then those without a level as "Not
 * assessed" — counted, not placed on a level. The grades come from the A–D
 * lookup (`/api/abcd-classify`) and are not part of the signed run; the caller
 * says so where it shows them.
 */
export function levelDistribution(grades: readonly CloudReadinessGrade[]): DistributionEntry<CloudReadinessGrade>[] {
  const keys: CloudReadinessGrade[] = ['A', 'B', 'C', 'D', 'Unknown'];
  return withShares(
    keys.map((key) => ({
      key,
      label: key === 'Unknown' ? 'Not assessed' : `Level ${key} · ${ABCD_META[key].label}`,
      count: grades.filter((g) => g === key).length,
    })),
  );
}

export interface SourcePosition {
  line: number;
  /** 0–1 along the source; the first line is 0. */
  at: number;
  severity: FindingSeverity;
  kind: string;
  /** Calm title, for the text alternative and the hover. */
  title: string;
}

/**
 * Every occurrence along the source, for a "where in the program" strip — one
 * entry per line a finding sits on. Lines outside the source (a finding from a
 * longer earlier version) are dropped rather than clamped to the end, and the
 * caller can compare `positions.length` with the occurrences to say so.
 */
export function sourcePositions(rows: readonly FindingRow[], totalLines: number): SourcePosition[] {
  if (!Number.isFinite(totalLines) || totalLines < 1) return [];
  const out: SourcePosition[] = [];
  for (const r of rows) {
    for (const line of r.lines) {
      if (!Number.isFinite(line) || line < 1 || line > totalLines) continue;
      out.push({
        line,
        at: totalLines === 1 ? 0 : (line - 1) / (totalLines - 1),
        severity: r.finding.severity,
        kind: r.finding.kind,
        title: calmTitle(r.finding.title),
      });
    }
  }
  return out.sort((a, b) => a.line - b.line || rank(a.severity) - rank(b.severity));
}

export interface SourceBin {
  /** First and last line the bin covers, inclusive. */
  from: number;
  to: number;
  count: number;
  /** The most severe occurrence in the bin; null when the bin is empty. */
  worst: FindingSeverity | null;
  /** The first line in the bin with a finding — where a click should go. */
  firstLine: number | null;
}

/**
 * The positions in `bins` equal stretches of the source, for a strip that
 * stays readable on a phone. Every line belongs to exactly one bin.
 */
export function sourceBins(positions: readonly SourcePosition[], totalLines: number, bins = 40): SourceBin[] {
  if (!Number.isFinite(totalLines) || totalLines < 1 || bins < 1) return [];
  const n = Math.min(bins, totalLines);
  const out: SourceBin[] = [];
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * totalLines) / n) + 1;
    const to = Math.floor(((i + 1) * totalLines) / n);
    out.push({ from, to, count: 0, worst: null, firstLine: null });
  }
  for (const p of positions) {
    const i = Math.min(n - 1, Math.floor(((p.line - 1) * n) / totalLines));
    const bin = out[i];
    bin.count += 1;
    if (bin.worst === null || rank(p.severity) < rank(bin.worst)) bin.worst = p.severity;
    if (bin.firstLine === null || p.line < bin.firstLine) bin.firstLine = p.line;
  }
  return out;
}

/* ------------------------------------------------- 5. the object page (A) */

/**
 * The use behind a finding's kind, where the kind names one — the same reading
 * `lib/it-findings-build.ts` makes server-side, so a level looked up here for a
 * read of VBAK is the C the IT view shows, never the D of a write.
 */
export function accessUseOfKind(kind: string): 'read' | 'write' | null {
  if (kind.endsWith('-read')) return 'read';
  if (kind.endsWith('-write')) return 'write';
  return null;
}

/** Other ways of grouping the list besides by kind. */
export type GroupingKey = 'kind' | 'severity' | 'line';

/**
 * The rows grouped as the reader picked: by kind (the default), by severity
 * (Critical → Low, then Info), or in source order as one group. Same shape as
 * `groupByKind`, so `shownGroups` filters any of them.
 */
export function groupRows(rows: readonly FindingRow[], by: GroupingKey): KindGroup[] {
  if (by === 'kind') return groupByKind(rows);
  if (by === 'line') {
    if (rows.length === 0) return [];
    const sorted = [...rows].sort((a, b) => (a.lines[0] ?? 0) - (b.lines[0] ?? 0) || rank(a.finding.severity) - rank(b.finding.severity));
    const worst = [...rows].sort(compareRows)[0].finding.severity;
    return [{ kind: 'by-line', label: 'In the order of the source', rows: sorted, worst, openByDefault: true }];
  }
  const out: KindGroup[] = [];
  for (const sev of SEVERITY_ORDER) {
    const list = rows.filter((r) => r.finding.severity === sev).sort(compareRows);
    if (list.length === 0) continue;
    out.push({ kind: `severity-${sev}`, label: sev, rows: list, worst: sev, openByDefault: sev === 'Critical' || sev === 'High' });
  }
  return out;
}

/**
 * The line under a group's name: the objects it touches, as the code names
 * them, the first three and how many more. A group without objects says
 * nothing rather than something made up.
 */
export function groupHint(group: KindGroup): string {
  const names: string[] = [];
  for (const r of group.rows) {
    const n = r.finding.objectName?.trim();
    if (n && !names.includes(n)) names.push(n);
  }
  if (names.length === 0) return '';
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
}

/** Rows of a group that name a released successor (SAP's catalog or the curated mapping). */
export function withSuccessor(rows: readonly FindingRow[]): number {
  return rows.filter((r) => Boolean(r.finding.sapReplacement?.objectName)).length;
}

/** One row of the program map: a kind, and every place it occurs. */
export interface ProgramMapRow {
  kind: string;
  label: string;
  /** Distinct findings (rows) of this kind. */
  count: number;
  dots: SourcePosition[];
}

/**
 * The program map of proposal B — one row per kind, each occurrence at its
 * line. Kinds in the order of the list (`groupByKind`), so the map and the
 * list below it read the same way.
 */
export function programMap(rows: readonly FindingRow[], totalLines: number): ProgramMapRow[] {
  return groupByKind(rows).map((g) => ({
    kind: g.kind,
    label: g.label,
    count: g.rows.length,
    dots: sourcePositions(g.rows, totalLines),
  }));
}

/**
 * What a map row says under its label. A row counts findings the way the list
 * does — one per pattern and object — and draws one dot per place in the code.
 * The two write statements on EBAN in the shipped example (L246, L455) are one
 * finding at two places; the row said "1 finding" over two dots, which read as
 * a miscount. So when the dots outnumber the findings, the row says both.
 */
export function programMapRowCount(row: Pick<ProgramMapRow, 'count' | 'dots'>): string {
  const findings = `${row.count} ${row.count === 1 ? 'finding' : 'findings'}`;
  const places = new Set(row.dots.map((d) => d.line)).size;
  return places > row.count ? `${findings} · ${places} places in the code` : findings;
}

/** A process step as a stretch of the source — the column behind the map. */
export interface ProcessStepBand {
  /** 1-based, in the order the program calls the steps. */
  n: number;
  /** The routine, as the source names it. */
  label: string;
  from: number;
  to: number;
}

/** The parts of a process skeleton this needs — kept structural so the module stays import-free. */
export interface StepSkeleton {
  nodes: ReadonlyArray<{ region: string; expandsTo?: string }>;
  regions: ReadonlyArray<{ key: string; kind: string; label: string; anchor: { lineStart: number } | null }>;
  entries: readonly string[];
}

/**
 * The steps the program runs, as stretches of its source: every routine an
 * entry block calls, from its `FORM` (or `METHOD`, `FUNCTION`, `MODULE`) line
 * to the matching `END…` line. Read off the skeleton the Business view draws
 * and the source text; a routine whose end cannot be found is left out rather
 * than given a guessed length.
 */
export function processStepBands(skeleton: StepSkeleton, source: string): ProcessStepBand[] {
  const lines = source.split(/\r?\n/);
  const regions = new Map(skeleton.regions.map((r) => [r.key, r]));
  const entries = new Set(skeleton.entries);
  const seen = new Set<string>();
  const out: ProcessStepBand[] = [];
  for (const node of skeleton.nodes) {
    if (!entries.has(node.region) || !node.expandsTo || seen.has(node.expandsTo)) continue;
    seen.add(node.expandsTo);
    const region = regions.get(node.expandsTo);
    if (!region || region.kind !== 'sub-process' || !region.anchor) continue;
    const from = region.anchor.lineStart;
    let to = 0;
    for (let i = from; i < lines.length; i++) {
      if (/^\s*END(?:FORM|METHOD|FUNCTION|MODULE)\b/i.test(lines[i])) {
        to = i + 1;
        break;
      }
    }
    if (to < from) continue;
    out.push({ n: out.length + 1, label: region.label, from, to });
  }
  return out;
}

/** A step as a column of the program map: numbered by where it stands in the code. */
export interface StepColumn extends ProcessStepBand {
  /** 1-based, left to right — the order the routines are written in. */
  column: number;
}

/**
 * The map's x-axis is the source line, so its columns stand in the order the
 * routines are written, not the order the program calls them. Numbered by run
 * order they read "2 3 1 4 5" left to right (the example writes
 * READ_REQUISITION before CHECK_AUTHORITY but calls it second). So the columns
 * are numbered left to right, and `runOrder` — the column numbers in the order
 * the program runs them — is set only when that order differs, for the caption
 * to say.
 */
export function stepColumns(steps: readonly ProcessStepBand[]): { columns: StepColumn[]; runOrder: number[] | null } {
  const columns = [...steps]
    .sort((a, b) => a.from - b.from || a.n - b.n)
    .map((s, i) => ({ ...s, column: i + 1 }));
  const byRun = [...columns].sort((a, b) => a.n - b.n).map((c) => c.column);
  const inOrder = byRun.every((c, i) => c === i + 1);
  return { columns, runOrder: inOrder ? null : byRun };
}
