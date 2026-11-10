/**
 * ATC × engine, by line (roadmap 3.0.21, owner decision 22.10.2026: ATC
 * results are evidence beside the engine's, mismatches shown honestly).
 *
 * The object comparison (`atc-join.ts`) asks whether both name the same
 * object, and for a customer program that rarely says much: ATC names the
 * program it checked, the engine names the SAP objects the program uses. Where
 * an ATC finding carries a line, the sharper question is whether the engine
 * reports something on that same line of this source. This module answers it,
 * finding by finding, and nothing more:
 *
 *   - `same-line` — the engine reports a finding on the line ATC points at.
 *     Both point at the line; that does not make them the same issue.
 *   - `atc-only` — the line is part of this source and the engine reports
 *     nothing on it. The engine may have no detector for what ATC checked; this
 *     is a gap in what it covers, not a defect ATC proved it missed.
 *   - `outside` — the object or include ATC checked is not part of this
 *     source (an include that was not uploaded, another program), or the line
 *     lies beyond it. Not compared.
 *   - `no-line` — the export names no line. Not compared.
 *
 * And the other way: engine findings on lines of a checked object where ATC
 * reports nothing. Silence, not a pass — a worklist lists what failed a check.
 *
 * Lines of an include are placed through the include map of the analysed
 * source (`include-resolution.ts`), so an ATC finding at line 12 of
 * `ZFOO_F01` meets the engine finding on the line where ZFOO_F01's line 12
 * stands in the joined source. Never merged, never counted together, never
 * part of a signed run or the score: the ATC finding stays ATC's claim.
 */

import type { AtcFinding, AtcFormat, AtcReport } from './atc-model';
import type { EvidenceFinding } from './evidence-model';
import { classifySource, joinedLineOf, readIncludeAnchors } from './include-resolution';
import { formatTextDate } from '../format';

const FORMAT_WORDS: Record<AtcFormat, string> = {
  table: 'a table export',
  'adt-worklist-xml': 'an ATC worklist (XML)',
  'checkstyle-xml': 'checkstyle XML',
};

/**
 * Where the imported results come from, in one line — "From your ATC run of 21
 * Oct 2026 · an ATC worklist (XML)". The run date is said only where the file
 * says it or the person who imported it entered it, and which of the two it
 * was; without one, the line says when the file was imported and that the run
 * date is not known.
 */
export function atcRunLabel(report: Pick<AtcReport, 'runAt' | 'runAtSource' | 'importedAt' | 'format'>): string {
  const format = FORMAT_WORDS[report.format ?? 'table'];
  const run = formatTextDate(report.runAt);
  if (run && report.runAtSource === 'file') return `From your ATC run of ${run} · ${format}`;
  if (run && report.runAtSource === 'declared') return `From your ATC run of ${run} (date as entered on import) · ${format}`;
  const imported = formatTextDate(report.importedAt);
  return `From your ATC results, imported ${imported ?? 'on a date not recorded'} — the file does not say when ATC ran · ${format}`;
}

export type AtcLineState = 'same-line' | 'atc-only' | 'outside' | 'no-line';

export interface AtcLineRow {
  finding: AtcFinding;
  state: AtcLineState;
  /** The line of the analysed source ATC's line stands on; null when not placed. */
  line: number | null;
  /** IDs of the engine's findings on that line — empty unless `same-line`. */
  engineFindingIds: string[];
}

export interface AtcLineComparison {
  rows: AtcLineRow[];
  byState: Record<AtcLineState, number>;
  /** Engine findings on lines of a checked object where no placed ATC finding stands. */
  engineOnly: string[];
  /** The objects of this source ATC's results name — main program and includes. */
  checkedObjects: string[];
}

/**
 * Compare an ATC import with the engine's findings line by line over the
 * analysed `source`. `fileName` names the main program when its text has no
 * header. Pure.
 */
export function compareAtcByLine(
  atc: Pick<AtcReport, 'findings'>,
  findings: readonly Pick<EvidenceFinding, 'id' | 'lineStart' | 'lineEnd'>[],
  source: string,
  fileName: string,
): AtcLineComparison {
  const anchors = readIncludeAnchors(source);
  const mainObject = classifySource(source, fileName || 'source').object;
  const inSource = new Set<string>([mainObject]);
  for (const part of anchors.parts) if (part.object) inSource.add(part.object);
  const totalLines = source.split(/\r?\n/).length;

  const onLine = (line: number) =>
    findings.filter((f) => line >= f.lineStart && line <= (typeof f.lineEnd === 'number' ? f.lineEnd : f.lineStart)).map((f) => f.id);

  const byState: Record<AtcLineState, number> = { 'same-line': 0, 'atc-only': 0, outside: 0, 'no-line': 0 };
  const checked = new Set<string>();
  const placedLines = new Set<number>();
  const rows: AtcLineRow[] = atc.findings.map((finding) => {
    const object = (finding.include ?? finding.objectName).toUpperCase();
    const where = inSource.has(object) ? object : null;
    if (where) checked.add(where);
    if (finding.line === undefined) {
      byState['no-line'] += 1;
      return { finding, state: 'no-line', line: null, engineFindingIds: [] };
    }
    const line = where ? joinedLineOf(anchors, where === mainObject ? null : where, finding.line, mainObject) : null;
    if (line === null || line > totalLines) {
      byState.outside += 1;
      return { finding, state: 'outside', line: null, engineFindingIds: [] };
    }
    placedLines.add(line);
    const ids = onLine(line);
    const state: AtcLineState = ids.length > 0 ? 'same-line' : 'atc-only';
    byState[state] += 1;
    return { finding, state, line, engineFindingIds: ids };
  });

  // Engine findings ATC is silent on — only within objects ATC's results name,
  // because an object ATC never mentions may simply not have been checked.
  const engineOnly: string[] = [];
  if (checked.size > 0) {
    for (const f of findings) {
      const end = typeof f.lineEnd === 'number' ? f.lineEnd : f.lineStart;
      let touched = false;
      for (let l = f.lineStart; l <= end && !touched; l += 1) touched = placedLines.has(l);
      if (touched) continue;
      const at = anchors.joined ? anchors.at[f.lineStart - 1] : null;
      const object = at ? (at.object ?? mainObject) : mainObject;
      if (checked.has(object)) engineOnly.push(f.id);
    }
  }

  return { rows, byState, engineOnly, checkedObjects: [...checked] };
}
