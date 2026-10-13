/**
 * Concept successors — where the code uses a classic concept for which ABAP
 * Cloud has a different one (DSAG guideline review B2, owner 13.10.2026).
 *
 * A curated list, not a catalog lookup: the rows come from the DSAG ABAP
 * guideline's table of new concepts, and each one is labelled as that — "DSAG
 * ABAP guideline, not SAP's catalog". A row stays in only where the repo's own
 * SAP data backs it (`lib/abap/generated/cloudification-repo.*.json`), and
 * `backing` says how far: SAP's release data names the successor itself, or
 * only lists the successor's objects as released while the old→new mapping is
 * the guide's, or nothing in SAP's data confirms it.
 * `tests/concept-successors.spec.ts` holds every claim of `backing` and
 * `levelToday` against those files.
 *
 * Deliberately not in the list (owner rule 13.10.2026: the guide is a source
 * to check against, not an authority):
 *   - SOST → "Monitor Email Transmissions (F5442)" and SE63 → "Maintain
 *     Translations (F4950)": transactions a user starts, not something code
 *     shows, and the app IDs are in none of the repo's SAP sources.
 *   - The guide's column "Alt (Level B-D)": the old objects are mostly level B
 *     in SAP's classification (classic APIs), so each row states its own state
 *     instead of a blanket B-D, and never says the classic use must go.
 *
 * Shown in Design and in Transformation's quality tips; outside the engine and
 * outside the signed run — nothing here enters evidence, a run or an audit
 * pack. Pure: no imports, no network.
 */

export type ConceptSuccessorKey = 'application-log' | 'application-job' | 'mail' | 'bopf' | 'table-maintenance';

/**
 * How far the repo's SAP data backs a row:
 *   - `sap-successor`: SAP's own data names the successor for the old object.
 *   - `sap-released`: the successor's objects are released in SAP's release
 *     data; that they succeed the old concept is the guide's statement.
 *   - `unconfirmed`: SAP's data in this repo confirms neither — the row is the
 *     guide's alone and says so.
 */
export type ConceptBacking = 'sap-successor' | 'sap-released' | 'unconfirmed';

export interface ConceptSuccessor {
  key: ConceptSuccessorKey;
  area: string;
  /** What the code uses, in a few words. */
  classic: string;
  /** The ABAP Cloud concept, in a few words. */
  successor: string;
  /** Released objects of the successor, as SAP's release data lists them. */
  successorObjects: readonly string[];
  /** What SAP's data says about the old objects today — never "must be replaced". */
  levelToday: string;
  backing: ConceptBacking;
  /** Where in the guide the row comes from. */
  guide: { file: string; heading: string };
}

/** The label every surface prints with the list. */
export const CONCEPT_SUCCESSOR_SOURCE = "DSAG ABAP guideline, not SAP's catalog";

/** The attribution the list carries (CC BY 4.0). */
export const CONCEPT_SUCCESSOR_ATTRIBUTION =
  '“DSAG ABAP-Leitfaden” by DSAG e.V. and contributors, CC BY 4.0 — translated from German and paraphrased.';

export const BACKING_LABEL: Record<ConceptBacking, string> = {
  'sap-successor': "SAP's release data names this successor",
  'sap-released': "Successor released in SAP's release data; the mapping is the guide's",
  unconfirmed: "Not confirmed by SAP's data in this tool",
};

// DSAG ABAP guideline: clean-core/solution-approach.md § Neue Konzepte
const GUIDE = { file: 'clean-core/solution-approach.md', heading: 'Neue Konzepte' } as const;

export const CONCEPT_SUCCESSORS: readonly ConceptSuccessor[] = [
  {
    key: 'application-log',
    area: 'Application log',
    classic: 'BAL_* / APPL_LOG_* function modules, SLG0 / SLG1',
    successor: 'Application Log API (ABAP Cloud)',
    successorObjects: ['CL_BALI_LOG', 'CL_BALI_OBJECT_HANDLER'],
    levelToday: 'SAP classifies the BAL_* function modules as classic APIs (level B): usable in classic ABAP, not in ABAP Cloud.',
    backing: 'sap-released',
    guide: GUIDE,
  },
  {
    key: 'application-job',
    area: 'Background job',
    classic: 'JOB_OPEN / JOB_SUBMIT / JOB_CLOSE, SUBMIT … VIA JOB, SM36 / SM37',
    successor: 'Application Job (a class started by the job scheduler)',
    successorObjects: ['IF_APJ_DT_EXEC_OBJECT', 'IF_APJ_RT_EXEC_OBJECT', 'CL_APJ_RT_API'],
    levelToday: 'SAP classifies JOB_OPEN, JOB_SUBMIT and JOB_CLOSE as classic APIs (level B): usable in classic ABAP, not in ABAP Cloud.',
    backing: 'sap-released',
    guide: GUIDE,
  },
  {
    key: 'mail',
    area: 'E-mail',
    classic: 'CL_BCS and the SAPoffice send function modules',
    successor: 'CL_BCS_MAIL_MESSAGE',
    successorObjects: ['CL_BCS_MAIL_MESSAGE'],
    levelToday: 'SAP will not release CL_BCS for ABAP Cloud and names CL_BCS_MAIL_MESSAGE as its successor; the SAPoffice send modules are classic APIs with the same successor.',
    backing: 'sap-successor',
    guide: GUIDE,
  },
  {
    key: 'bopf',
    area: 'Programming model',
    classic: 'BOPF (/BOBF/ objects)',
    successor: 'ABAP RESTful Application Programming Model (RAP)',
    successorObjects: [],
    levelToday: 'SAP classifies the /BOBF/ objects as classic APIs (level B) and names no successor for them in its data.',
    backing: 'unconfirmed',
    guide: GUIDE,
  },
  {
    key: 'table-maintenance',
    area: 'Table maintenance',
    classic: 'SM30 / SM31, VIEW_MAINTENANCE_CALL',
    successor: 'Business Configuration (a RAP-based maintenance object)',
    successorObjects: ['CL_BCFG_CD_REUSE_API_FACTORY'],
    levelToday: 'SAP classifies VIEW_MAINTENANCE_CALL as a classic API (level B): usable in classic ABAP, not in ABAP Cloud.',
    backing: 'sap-released',
    guide: GUIDE,
  },
];

export interface ConceptSuccessorHit {
  row: ConceptSuccessor;
  /** What the code names, upper case, first occurrence each. */
  found: { name: string; line: number }[];
}

/** One detector per row: the names in the code that show the classic concept. */
const DETECT: Record<ConceptSuccessorKey, RegExp[]> = {
  'application-log': [
    /\bCALL\s+FUNCTION\s+'((?:BAL|APPL_LOG)_[A-Z0-9_]+)'/gi,
    /\b(?:CALL|LEAVE\s+TO)\s+TRANSACTION\s+'(SLG[01])'/gi,
  ],
  'application-job': [
    /\bCALL\s+FUNCTION\s+'(JOB_(?:OPEN|SUBMIT|CLOSE)|BP_JOB_[A-Z0-9_]+)'/gi,
    /\bSUBMIT\b[^.]*?\b(VIA\s+JOB)\b/gi,
    /\b(?:CALL|LEAVE\s+TO)\s+TRANSACTION\s+'(SM3[67])'/gi,
  ],
  mail: [
    /\b(CL_BCS|CL_DOCUMENT_BCS|CL_SAPUSER_BCS|CL_CAM_ADDRESS_BCS)\b/gi,
    /\bCALL\s+FUNCTION\s+'(SO_(?:NEW_DOCUMENT_ATT_SEND|NEW_DOCUMENT_SEND|DOCUMENT_SEND)_API1)'/gi,
  ],
  bopf: [/(\/BOBF\/[A-Z0-9_]+)/gi],
  'table-maintenance': [
    /\bCALL\s+FUNCTION\s+'(VIEW_MAINTENANCE_CALL)'/gi,
    /\b(?:CALL|LEAVE\s+TO)\s+TRANSACTION\s+'(SM3[01])'/gi,
  ],
};

/**
 * Statements of the source with comments removed: a full-line comment (`*`)
 * and the rest of a line after `"`. Statements are joined across lines, so a
 * `SUBMIT … VIA JOB` written over several lines is one statement, anchored at
 * the line it starts on.
 */
function statements(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let text = '';
  let start = 0;
  source.replace(/\r\n?/g, '\n').split('\n').forEach((raw, i) => {
    if (/^\*/.test(raw)) return;
    const code = stripLineComment(raw);
    if (!code.trim()) return;
    if (!text) start = i + 1;
    // A period outside a literal ends a statement; enough for the names read here.
    for (const part of code.split(/(?<=\.)(?=(?:[^']*'[^']*')*[^']*$)/)) {
      if (!text.trim()) start = i + 1;
      text += ` ${part}`;
      if (/\.\s*$/.test(part)) {
        out.push({ text, line: start });
        text = '';
      }
    }
  });
  if (text.trim()) out.push({ text, line: start });
  return out;
}

/** The line without its `"` comment; a `"` inside a literal is not one. */
function stripLineComment(line: string): string {
  let inLiteral = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'") inLiteral = !inLiteral;
    else if (c === '"' && !inLiteral) return line.slice(0, i);
  }
  return line;
}

/** The rows the source shows a classic concept for, in list order. */
export function conceptSuccessorsOf(source: string | null | undefined): ConceptSuccessorHit[] {
  if (!source) return [];
  const stmts = statements(source);
  const hits: ConceptSuccessorHit[] = [];
  for (const row of CONCEPT_SUCCESSORS) {
    const seen = new Map<string, number>();
    for (const s of stmts) {
      for (const re of DETECT[row.key]) {
        for (const m of s.text.matchAll(re)) {
          const name = m[1].replace(/\s+/g, ' ').toUpperCase();
          if (!seen.has(name)) seen.set(name, s.line);
        }
      }
    }
    if (seen.size) {
      hits.push({
        row,
        found: [...seen].map(([name, line]) => ({ name, line })).sort((a, b) => a.line - b.line || a.name.localeCompare(b.name)),
      });
    }
  }
  return hits;
}
