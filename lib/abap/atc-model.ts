/**
 * ATC Import Data Model (roadmap 7.1)
 *
 * Types for importing ABAP Test Cockpit (ATC) results — the check findings a
 * customer's own SAP system produced, exported and handed to this product.
 *
 * The whole point of this module, said once so every reader of the types below
 * carries it: **an `AtcFinding` is a claim ATC made, not a fact this product
 * established.** Nothing here upgrades it to one. `AtcFinding` is a distinct
 * type from `EvidenceFinding` (`./evidence-model`) on purpose — the two are
 * never merged into one array, one severity or one count. Where the two are
 * compared at all, it is through `atc-join.ts`, and that comparison stays a
 * side-by-side observation, never a verdict of one side on the other (roadmap
 * 7.1, honesty rules 1–3; see `tests/atc-provenance-guard.spec.ts`).
 */

/**
 * ATC's own three priorities, read from whichever column and vocabulary the
 * export used (numeric `1`/`2`/`3`, or the English/German words). `unknown`
 * is a fourth, deliberate value — for a priority cell the parser could not
 * read at all — and is not the same as `info`: a finding of unknown priority
 * is not thereby a minor one (mirrors `UsageRecord.callCount`'s `null`, never
 * `0`, in `usage-model.ts`).
 */
export type AtcPriority = 'error' | 'warning' | 'info' | 'unknown';

/**
 * The shapes an ATC result is read from (roadmap 3.0.21): a table (CSV, TSV or
 * XLSX, from the SAP GUI list or an ADT export), the ADT ATC worklist XML, or
 * checkstyle XML as CI pipelines write it. Closed: the server refuses any other
 * value (`lib/project-commands.ts`).
 */
export const ATC_FORMATS = ['table', 'adt-worklist-xml', 'checkstyle-xml'] as const;
export type AtcFormat = (typeof ATC_FORMATS)[number];

export const ATC_RUN_DATE_SOURCES = ['file', 'declared'] as const;
export type AtcRunDateSource = (typeof ATC_RUN_DATE_SOURCES)[number];

/** A row the import did not take over, and why. */
export interface AtcQuarantineEntry {
  /** Spreadsheet row number, header = 1 — or, for an XML file, the finding's position in it, from 1. */
  row: number;
  objectName: string;
  reason: string;
}

/**
 * One line of an ATC worklist: one check, on one object, as ATC reported it.
 *
 * Only the fields a check result needs to be shown and compared are kept.
 * Anything an export carries beyond these — in particular the columns that
 * name a person (author, reviewer, last changed by) — is stripped before this
 * type is ever populated; see `atc-privacy.ts`.
 */
export interface AtcFinding {
  /** ABAP object name, normalized to UPPER CASE — the join key against evidence. */
  objectName: string;
  /** ABAP object type: PROG / CLAS / FUGR / FUNC / INTF ... when the export names one. */
  objectType?: string;
  /** ATC's own check identifier ("CL_CI_TEST_..." or a customer check variant's short id), when present. */
  checkId?: string;
  /** The human title of the check, when the export names one separately from the message. */
  checkTitle?: string;
  /** The finding text ATC produced for this line. Never rewritten. */
  message: string;
  priority: AtcPriority;
  /**
   * Line number inside the object — or inside `include`, when the export names
   * one — as ATC reported it. The object comparison (`atc-join.ts`) never reads
   * it; the line comparison (`atc-lines.ts`) places it in the analysed source,
   * through the include map when the program was uploaded with its includes.
   */
  line?: number;
  /**
   * The include the line stands in, when the export names one other than the
   * object (an ADT worklist's finding location, roadmap 3.0.21). Upper-cased.
   */
  include?: string;
  /**
   * Whether the export marked this finding as exempted (a customer's own
   * waiver, decided in ATC — never decided here). `undefined` when the export
   * carries no exemption column at all, which is different from a column that
   * says "not exempted".
   */
  exempted?: boolean;
}

export interface AtcReport {
  findings: AtcFinding[];
  /**
   * Fixed at `'atc'`. Unlike the usage import (`UsageReport.source`, which
   * distinguishes SCMON/UPL/ST03N because the three count different things),
   * an ATC worklist is one shape however it was exported — CSV or XLSX, from
   * SAP GUI or from ADT. The field still exists, and is still validated
   * server-side (`lib/project-commands.ts`), so a future second ATC export
   * shape does not have to guess a vocabulary under time pressure.
   */
  source: 'atc';
  /**
   * Rows not taken over: no object name, no finding text. Shown before the
   * import is confirmed and kept with it — the same contract as
   * `UsageReport.quarantined`.
   */
  quarantined?: AtcQuarantineEntry[];
  /** ISO date: when the import was performed. */
  importedAt: string;
  /**
   * The shape the file had (roadmap 3.0.21). Absent on a report imported
   * before 3.0.21, which was always a table.
   */
  format?: AtcFormat;
  /**
   * ISO date of the ATC run the results come from — "from your ATC run of
   * <date>". Read from the file where it says (an ADT worklist's timestamp),
   * else entered by the person importing it, else absent: then the panel says
   * when the file was imported and that the run date is not known.
   */
  runAt?: string;
  /** Where `runAt` came from: the file, or the person who imported it. */
  runAtSource?: AtcRunDateSource;
  /** Parser warnings (unmapped columns, unreadable priorities, etc.). Never silently guessed. */
  warnings: string[];
  /** Retention TTL — ISO date after which this report may be auto-deleted. */
  retentionExpiresAt?: string;
}

/* ───────────────────────────── the comparison, never a merge ───────────── */

/**
 * How one object's ATC results and this product's own evidence findings
 * relate — an observation about **coverage**, never a verdict on either side
 * (honesty rule 3). Read each value exactly as worded, because the natural
 * misreading is the one this type exists to prevent:
 *
 * - `'both'`: ATC reported at least one finding for this object, and the
 *   engine's evidence findings name it too. This says the two overlap on the
 *   object — it does not say they found the *same* issue, and the two
 *   finding lists are kept apart (`atcFindings`, `engineFindingIds`),
 *   never combined into one count (honesty rule 2).
 * - `'atc-only'`: ATC reported a finding for this object and the engine's
 *   evidence findings do not name it. This is **not** "the engine missed a
 *   real defect" — the engine has no detector for whatever ATC's check
 *   covers, or never analysed this object at all (an include outside the
 *   upload, say). It is a gap in what this product's own evidence can speak
 *   to, not a correction of it.
 * - `'engine-only'`: the engine's evidence findings name this object and the
 *   imported ATC results do not. This is **not** "ATC checked this object and
 *   found it clean" — most ATC exports carry only what failed a check, so an
 *   object's absence from the import is silence, not a pass. Whether ATC ever
 *   ran against this object at all is not knowable from a worklist of
 *   findings alone.
 */
export type AtcComparisonState = 'both' | 'atc-only' | 'engine-only';

export interface AtcJoinRow {
  objectName: string;
  state: AtcComparisonState;
  /** ATC's own findings for this object — empty when `state === 'engine-only'`. */
  atcFindings: AtcFinding[];
  /** IDs of the engine's evidence findings for this object — empty when `state === 'atc-only'`. */
  engineFindingIds: string[];
}
