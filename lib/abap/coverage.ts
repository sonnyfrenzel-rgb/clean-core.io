import { tokenize } from './declaration-parser';

/**
 * What the evidence engine did NOT judge.
 *
 * Why this exists: a program with no findings reads as a clean program, and for
 * two of the seven starter examples that was wrong in the most visible place the
 * product has. `Z_SALES_ORDER_CREATOR` — a legacy sales-order program — returns
 * zero findings while making three local `CALL FUNCTION` calls, because the RFC
 * detector only fires on `CALL FUNCTION ... DESTINATION`. `Z_INVOICE_EXTRACTOR`
 * returns two findings and writes a file with `OPEN DATASET`, which no detector
 * looks at. Somebody opening this product for the first time is more likely than
 * not to land on a legacy example the engine calls spotless.
 *
 * The detectors for those constructs are a later release. What is wrong *now* is
 * not the missing detector, it is the silence: "no findings" and "nothing to
 * find" are different statements, and only one of them was true.
 *
 * So the engine says what it stepped over. This is deliberately not a finding
 * list — an unassessed construct is not a defect, and presenting it as one would
 * trade a false clean bill for a false accusation. It is the boundary of the
 * question the engine actually answered.
 *
 * Every match runs over `tokenize()` output, which strips full-line and inline
 * comments and respects string and backtick literals — so a construct named in a
 * comment or inside a quoted string is not a hit.
 */

export type CoverageGap =
  | 'file-io'
  | 'classic-list-output'
  | 'local-function-call'
  | 'dynamic-invocation'
  | 'macro'
  | 'generated-code';

export interface UnassessedConstruct {
  gap: CoverageGap;
  /** What was seen, in the reader's words rather than a regex. */
  label: string;
  /** Why the detector set cannot judge it — not an accusation, a limit. */
  why: string;
  line: number;
  snippet: string;
}

export interface CoverageReport {
  unassessed: UnassessedConstruct[];
  /** True when nothing in the source falls outside what the detectors judge. */
  complete: boolean;
  /** One line per distinct gap, for a surface that has no room for every hit. */
  gaps: Array<{ gap: CoverageGap; label: string; count: number; firstLine: number }>;
}

interface Rule {
  gap: CoverageGap;
  label: string;
  why: string;
  /** Applied to the comment-stripped, upper-cased statement text. */
  test: (upper: string) => boolean;
}

const RULES: Rule[] = [
  {
    gap: 'file-io',
    label: 'Application-server file access',
    why: 'No detector evaluates dataset I/O, so neither the data leaving the system nor its replacement path has been assessed.',
    test: (s) => /^(OPEN|READ|CLOSE|DELETE)\s+DATASET\b/.test(s) || /^TRANSFER\b/.test(s),
  },
  {
    gap: 'local-function-call',
    label: 'Local function-module call',
    why: 'Only CALL FUNCTION with DESTINATION is assessed, as an RFC. A local call — a BAPI among them — is not looked at, so whether a released API replaces it is unknown.',
    // A quoted name and no DESTINATION anywhere in the statement.
    test: (s) => /^CALL\s+FUNCTION\s+'/.test(s) && !/\bDESTINATION\b/.test(s),
  },
  {
    gap: 'dynamic-invocation',
    label: 'Dynamic call or field access',
    why: 'The target is computed at runtime, so static analysis cannot name what is reached. The call may resolve to something the engine would otherwise flag.',
    test: (s) =>
      // CALL FUNCTION <variable> — a name that is not a literal
      /^CALL\s+FUNCTION\s+(?!')/.test(s) ||
      /^CALL\s+METHOD\s*\(/.test(s) ||
      /^CREATE\s+OBJECT\s*\(/.test(s) ||
      /^PERFORM\s*\(/.test(s) ||
      /\bASSIGN\s*\(/.test(s),
  },
  {
    gap: 'classic-list-output',
    label: 'Classic list output',
    why: 'WRITE list processing does not exist in ABAP for Cloud Development, but no detector scores it — the classic UI detectors cover dynpro and classic ALV only. Recorded as unassessed rather than scored, because turning it into a finding would re-grade existing analyses.',
    // `WRITE x TO y` is string formatting, not list output, so it is excluded.
    test: (s) => /^WRITE\b/.test(s) && !/\bTO\b/.test(s),
  },
  {
    gap: 'macro',
    label: 'Macro definition',
    why: 'Macro bodies are expanded by the compiler, not by this engine, so any statement written inside one is invisible to every detector.',
    test: (s) => /^DEFINE\s+\w/.test(s),
  },
  {
    gap: 'generated-code',
    label: 'Code generated at runtime',
    why: 'The program writes or generates further ABAP, whose content does not exist until it runs and therefore cannot be assessed here.',
    test: (s) => /^INSERT\s+REPORT\b/.test(s) || /^GENERATE\s+SUBROUTINE\s+POOL\b/.test(s),
  },
];

/** Keeps a snippet readable in a table cell without hiding what matched. */
function trim(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}...` : flat;
}

export function assessCoverage(code: string): CoverageReport {
  const unassessed: UnassessedConstruct[] = [];

  for (const stmt of tokenize(code)) {
    const upper = stmt.text.toUpperCase().trim();
    for (const rule of RULES) {
      if (!rule.test(upper)) continue;
      unassessed.push({
        gap: rule.gap,
        label: rule.label,
        why: rule.why,
        line: stmt.line,
        snippet: trim(stmt.text),
      });
      // One statement is reported once, under the first rule that claims it.
      break;
    }
  }

  const byGap = new Map<CoverageGap, { gap: CoverageGap; label: string; count: number; firstLine: number }>();
  for (const u of unassessed) {
    const seen = byGap.get(u.gap);
    if (seen) seen.count += 1;
    else byGap.set(u.gap, { gap: u.gap, label: u.label, count: 1, firstLine: u.line });
  }

  return {
    unassessed,
    complete: unassessed.length === 0,
    gaps: [...byGap.values()].sort((a, b) => a.firstLine - b.firstLine),
  };
}

/**
 * The sentence a surface should print instead of implying a clean result.
 *
 * Returns null when coverage is complete, so a caller can render nothing rather
 * than a reassurance — "we checked everything" is a claim with its own burden.
 */
export function coverageCaveat(report: CoverageReport): string | null {
  if (report.complete) return null;
  const parts = report.gaps.map(
    (g) => `${g.count} × ${g.label.toLowerCase()}`,
  );
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Not assessed: ${list}. A result covers what the engine checks, which is not the whole program.`;
}
