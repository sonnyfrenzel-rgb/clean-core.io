import { tokenize } from './declaration-parser';
import { maskLiterals } from './statement-reader';
import { readTableDependencies } from './table-dependencies';

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
 * Every match runs over `tokenize()` output with `maskLiterals` applied, so a
 * construct named in a comment or inside a literal is not a hit. The comment
 * claimed that before the masking was there: `tokenize` keeps a literal's
 * content, so `WRITE 'TO'.` satisfied the `WRITE … TO` exclusion and classic
 * list output went unrecorded — a program whose only statement is that one
 * reported complete coverage (full review of b88c77b4b5d1, 610cc2bf910f /
 * cb60ea95bec2). The delimiters stay, because `CALL FUNCTION 'name'` is told
 * from `CALL FUNCTION lv_name` by the quote alone.
 */

export type CoverageGap =
  | 'file-io'
  | 'classic-list-output'
  | 'local-function-call'
  | 'dynamic-invocation'
  | 'dynamic-target'
  | 'macro'
  | 'generated-code'
  | 'include-not-read';

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
  /**
   * Applied to the comment-stripped, literal-masked, upper-cased statement text.
   * `unresolved`
   * says whether `readTableDependencies` left a dynamic target of this statement
   * open — a question the text alone cannot answer, because `FROM (lc_tab)` is
   * closed by a constant declared somewhere else.
   */
  test: (upper: string, at: Context) => boolean;
  /** Read per statement where the sentence has to name what it saw. */
  whyAt?: (upper: string, at: Context) => string;
}

interface Context {
  unresolved: boolean;
  /** Program includes this statement names whose text the source does not hold. */
  includesNotRead: string[];
}

const RULES: Rule[] = [
  {
    // G4-F2: `INCLUDE zcc_ref_021_rules.` named a source the upload did not
    // hold, the rule that decided the result stood in it, and the engine
    // reported no finding, a score of 95 and "no legacy pattern was detected".
    // Nothing had been found clean; the deciding part had not been read. The
    // skeleton (`include-not-read`) and the review tasks already said so; the
    // score, the route and the Design text, which read this report, did not.
    gap: 'include-not-read',
    label: 'Include whose source was not uploaded',
    why: 'The text of the include is not part of this source, so no detector read the statements in it — what it does is not determined, and nothing found or not found here speaks for it.',
    whyAt: (_s, at) =>
      `${at.includesNotRead.map((name) => `Include ${name}`).join(', ')} ${
        at.includesNotRead.length === 1 ? 'was' : 'were'
      } not uploaded — what ${at.includesNotRead.length === 1 ? 'it does' : 'they do'} is not determined. ` +
      'No detector read the statements in it, so nothing found or not found here speaks for them; upload the include with the program to have it read.',
    test: (_s, at) => at.includesNotRead.length > 0,
  },
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
      // A dynamic method name stands in parentheses, and the parenthesis is not
      // always the one right after METHOD. `CALL METHOD (class)=>(meth)` was
      // recognised; `CALL METHOD lo_service->(lv_method)` — the ordinary
      // instance form, and the common one — was not, so a statement whose
      // target no static analysis can name came back with no finding and
      // `coverage.complete = true`, and `routeExtensibility` could score the
      // extension 100 and call it trivial (full review of a19945ef01dc,
      // fd3e6ec4d394). Both selectors, and the object or class before them.
      /^CALL\s+METHOD\s*\(/.test(s) ||
      /^CALL\s+METHOD\s+[\w<>/~-]*(?:->|=>)\s*\(/.test(s) ||
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
    gap: 'dynamic-target',
    label: 'Table or type named at runtime',
    why: 'The statement takes its table or type from a value the source does not close — an input, a variable, SQL text built at runtime. The engine names no target it cannot establish; a value the source shows for it, such as a DEFAULT, is listed as a possible target in the data coupling, never as the dependency.',
    test: (_s, at) => at.unresolved,
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

/**
 * The program includes a statement names: `INCLUDE zfoo.`, `INCLUDE zfoo IF
 * FOUND.`, the chained `INCLUDE: zfoo, zbar.`. `INCLUDE STRUCTURE` and
 * `INCLUDE TYPE` are a type component, not a source — a table dependency read
 * by `table-dependencies.ts` (R29), and no include in this sense (CC-045). The
 * symbol includes in angle brackets (`INCLUDE <icon>.`) are left out with them:
 * they declare SAP's icon and list constants, no logic.
 */
function programIncludesOf(upper: string): string[] {
  // The keyword alone: `included_flag = 1.` is an assignment, not an include.
  const head = /^INCLUDE(?=[\s:])\s*(:?)\s*/.exec(upper);
  if (!head || /^INCLUDE\s+(?:STRUCTURE|TYPE)\b/.test(upper)) return [];
  const rest = upper.slice(head[0].length).replace(/\.\s*$/, '');
  const parts = head[1] ? rest.split(',') : [rest];
  return parts
    .map((part) => /^\s*([\w/]+)(?=\s|$)/.exec(part)?.[1] ?? '')
    .filter((name) => name !== '' && name !== 'STRUCTURE' && name !== 'TYPE');
}

/**
 * The includes whose text this source carries anyway: a user who uploads a
 * program with its includes pastes them into the one source the analysis
 * takes, and each include then begins with the header the ABAP editor writes —
 * `*& Include ZFOO`, or SAP's own `***INCLUDE LZFOOF01.`. Apart from that
 * three-asterisk form, only a comment line whose words *begin* with
 * `Include <name>` counts, and not one with a period after the name:
 * `*INCLUDE zfoo.` is a statement commented out, not the text of zfoo, and a
 * remark such as `* rules (Include ZFOO)` is a remark.
 */
function includesCarried(code: string): Set<string> {
  const carried = new Set<string>();
  for (const line of code.split(/\r?\n/)) {
    const header =
      /^\*{3}INCLUDE\s+([\w/]+)/i.exec(line) ?? /^\*+&?\s*INCLUDE\s+([\w/]+)(?!\s*\.)(?=\s|$)/i.exec(line);
    if (header) carried.add(header[1].toUpperCase());
  }
  return carried;
}

export function assessCoverage(code: string): CoverageReport {
  const unassessed: UnassessedConstruct[] = [];
  const unresolved = new Set(readTableDependencies(code).unresolved.map((target) => target.statement));
  const carried = includesCarried(code);

  for (const [index, stmt] of tokenize(code).entries()) {
    const upper = maskLiterals(stmt.text).toUpperCase().trim();
    const at: Context = {
      unresolved: unresolved.has(index),
      includesNotRead: programIncludesOf(upper).filter((name) => !carried.has(name)),
    };
    for (const rule of RULES) {
      if (!rule.test(upper, at)) continue;
      unassessed.push({
        gap: rule.gap,
        label: rule.label,
        why: rule.whyAt ? rule.whyAt(upper, at) : rule.why,
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
