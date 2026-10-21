import type { AbapEvidenceReport, EvidenceKind } from './evidence-model';
import { scoreFromFindings, scoreWithUnassessed } from '../clean-core-score';
import { engineVersionAtLeast, scoreRuleFor } from '../score-rule';
import { BTP, IN_APP_ROUTE, SIDE_BY_SIDE_ROUTE } from '../sap-naming';
import { precisionFixesApply } from './precision-fixes-gate';
import { readClaimsApply } from './read-claims-gate';
import { citeStatement, statedRequirementsApply, statedTargetOf, type StatedRequirement } from './stated-requirements';
import { keyUserApplies } from './key-user-gate';
import type { KeyUserBlockerCode, KeyUserReading, KeyUserScope, KeyUserTool } from './key-user-candidates';

export interface DecisionCheckpoint {
  checkpointName: string;
  question: string;
  evaluation: string;
  /** `Key-User Preferred` from 3.0.19 (`KEY_USER_FROM`), on the key-user checkpoint only, where the whole program is key user. */
  resultState: 'In-App Preferred' | 'Side-by-Side Preferred' | 'Key-User Preferred' | 'Neutral';
  cleanCoreImpact: string;
}

export interface ComparativeTrack {
  technicalFeasibility: 'Highly Compatible' | 'Partially Compatible' | 'Incompatible';
  fitDetails: string;
  pros: string[];
  cons: string[];
}

export interface ExtensibilityRouteReport {
  recommendedRoute: typeof SIDE_BY_SIDE_ROUTE | typeof IN_APP_ROUTE;
  confidenceScore: number;
  rationale: string;
  targetArtifact: string;
  cleanCoreScore: number;
  checkpoints: DecisionCheckpoint[];
  comparativeAnalysis: {
    inAppABAPCloud: ComparativeTrack;
    sideBySideBTP: ComparativeTrack;
  };
  evidenceCounts: {
    totalFindings: number;
    criticalFindings: number;
    supportingFindings: number;
  };
  assumptions: string[];
  /**
   * What the requirements the owner stated in the source did to the route
   * (from 3.0.17, `STATED_REQUIREMENTS_FROM`). Absent for a run of an earlier
   * engine and for a source that states no target, so such a report is the
   * one it always was.
   */
  statedRequirements?: StatedRouteBasis;
  /**
   * Key user as the fourth option beside standard, RAP and CAP (from 3.0.19,
   * `KEY_USER_FROM`): what the engine read of the key-user candidates
   * (`AbapEvidenceReport.keyUser`). Absent for a run of an earlier engine, so
   * such a report is the one it always was. `recommendedRoute` stays the code
   * route — the route the code part takes, and the whole program's should the
   * key-user candidates not hold.
   */
  keyUser?: KeyUserRouteBasis;
}

/** The key-user reading as the route report carries it — counts, ids and reasons, never the step list. */
export interface KeyUserRouteBasis {
  scope: KeyUserScope;
  /** True only for `whole-program`: key user is the recommended option, and code is built for no part. */
  recommended: boolean;
  parts: KeyUserReading['parts'];
  /** `A` only where the whole program is key user: a key-user extension uses released extension points only. */
  levelByConstruction: 'A' | null;
  /** `anchor` is the part's first line in the route report's own form, `from line N` (`routeAnchors`). */
  candidates: Array<{ id: string; tool: KeyUserTool; app: string; part: string; anchor: string }>;
  rejected: Array<{ id: string; wouldBe: KeyUserTool; part: string; verdict: 'code' | 'not-determined'; reason: string; codes: KeyUserBlockerCode[] }>;
  sentence: string;
}

/**
 * The line references of a key-user sentence in the form the rest of the route
 * report uses: `from line N`, the first line only, with a count where there
 * were several.
 *
 * The route report names a place by the first line of what it summarises —
 * every other sentence of the router says `from line N` — and the reading
 * itself (`AbapEvidenceReport.keyUser`, the step list) keeps every line. A
 * report that also said `at line N`, `(line N, M)` and carried a bare number
 * held the same anchors in three forms, and the formatting property of
 * `tests/abap-metamorphic.spec.ts` reads anchors in that one form: a re-wrapped
 * or commented program has to come back with the same route at moved anchors.
 * A range keeps its first line only, because the number of lines a statement
 * spans is formatting, not content.
 */
export function routeAnchors(text: string): string {
  return text
    .replace(/\((?:at )?lines? (\d+)((?:(?:, | and )\d+)*)(?:\s*[–-]\s*\d+)?\)/g, (_m, first: string, rest: string) => {
      const more = rest ? rest.match(/\d+/g)!.length : 0;
      return more ? `(from line ${first}, ${more + 1}× in all)` : `(from line ${first})`;
    })
    .replace(/(?<!from )\b(?:at )?lines? (\d+)((?:(?:, | and )\d+)*)(?:\s*[–-]\s*\d+)?/g, (_m, first: string, rest: string) => {
      const more = rest ? rest.match(/\d+/g)!.length : 0;
      return more ? `from line ${first} (${more + 1}× in all)` : `from line ${first}`;
    });
}

/** The route report's view of a key-user reading. */
export function keyUserRouteBasis(reading: KeyUserReading): KeyUserRouteBasis {
  const firstLine = (anchors: ReadonlyArray<{ lineStart: number }>) => anchors.reduce((min, a) => Math.min(min, a.lineStart), anchors[0]?.lineStart ?? 0);
  return {
    scope: reading.scope,
    recommended: reading.scope === 'whole-program',
    parts: reading.parts,
    levelByConstruction: reading.levelByConstruction,
    candidates: reading.candidates.map((c) => ({ id: c.id, tool: c.tool, app: c.app, part: c.part.name, anchor: `from line ${firstLine(c.anchors)}` })),
    rejected: reading.rejected.map((r) => ({ id: r.id, wouldBe: r.wouldBe, part: r.part.name, verdict: r.verdict, reason: routeAnchors(r.reason), codes: [...new Set(r.blockers.map((b) => b.code))] })),
    sentence: routeAnchors(reading.sentence),
  };
}

/** The stated requirements that bear on the route, and what they did to it. */
export interface StatedRouteBasis {
  /** The target the binding statements set, or null (none, or contradictory). */
  target: 'side-by-side' | 'on-stack' | null;
  /** The route follows the stated target where the code alone would not. */
  followed: boolean;
  /** The code forces the route the statement does not name; the code's route stands. */
  conflict: boolean;
  /** Binding statements on both sides; they set no target. */
  contradictory: boolean;
  /** The items named in the rationale, in source order. */
  items: Array<Pick<StatedRequirement, 'label' | 'lineStart' | 'lineEnd' | 'target' | 'binding'>>;
}

/**
 * Finding kinds that run inside SAP's own processing — an enhancement or BAdI
 * implementation, an exit or VOFM routine, a modification. A requirement that
 * states side-by-side as the target does not move them: they are where SAP's
 * transaction calls them, and a separate runtime is not called there. So
 * where one is found, a stated side-by-side target is a conflict, not the route
 * (`STATED_REQUIREMENTS_FROM`).
 */
const IN_PROCESS_KINDS: ReadonlySet<string> = new Set(['enhancement', 'hook-implementation', 'modification']);

/**
 * A finding kind in the words a report may print.
 *
 * The checkpoints and the track comparison used to print fixed lists of
 * constructs — "BDC, RFC, Custom writes", "custom data persistence or legacy
 * GUI/local file dependencies" — whenever a side-by-side route was chosen, so a
 * program whose only finding was an RFC call was told that BDC screens, native
 * SQL and direct standard-table writes had to be replaced and that its route
 * came from custom persistence. None of it was in its evidence.
 * A signed
 * route report that names constructs the source does not contain is not
 * project-specific evidence, whatever else it gets right — so every sentence
 * that names a construct now names one that was found, through this map.
 */
const KIND_LABELS: Record<string, string> = {
  'table-access': 'reads of custom tables',
  'standard-table-read': 'reads of SAP standard tables',
  'standard-table-write': 'direct writes to SAP standard tables',
  'custom-table-write': 'writes to custom persistence',
  'rfc-call': 'RFC calls',
  bdc: 'BDC screen automation',
  dynpro: 'Dynpro screens',
  'classic-alv': 'classic ALV output',
  'gui-download': 'frontend file services',
  'native-sql': 'native SQL',
  'update-task': 'update-task processing',
  'commit-work': 'explicit COMMIT WORK',
  submit: 'SUBMIT program coupling',
  'authority-check': 'authority checks',
  'hardcoded-value': 'hardcoded environment values',
  'unreleased-api': 'use of unreleased APIs',
  'legacy-mail': 'legacy SAPOffice mail',
  'credit-management': 'custom credit management logic',
  'batch-input': 'batch input',
  'business-rule': 'business rules',
  enhancement: 'enhancement technologies',
  modification: 'core modifications',
  // The kinds of 3.0.12 (`GUIDELINE_CHECKS_FROM`); no run of an earlier
  // engine has them, so no signed sentence moves.
  'security-review': 'security review tasks',
  'sap-code-copy': 'possible copies of SAP code',
  bopf: 'BOPF business objects',
  'gateway-classic-service': 'classic SAP Gateway (SEGW) services',
  'ddic-cds-view': 'DDIC-based CDS views',
  'parallel-processing': 'parallel processing with asynchronous RFC',
  // The kinds of 3.0.13 (`PRECISION_FIXES_FROM`, `engine-rules.ts`).
  'system-time': "decisions on the server's date and time",
  'hook-implementation': 'exit, BAdI and VOFM implementations',
  'form-output': 'form output',
  'abap-proxy': 'ABAP proxies',
  'own-enhancement-point': 'enhancement points in your own code',
  // The kinds of 3.0.18 (`ENGINE_READS_FROM`, `evidence-model.ts`).
  'classic-api': 'classic APIs not released for ABAP Cloud',
  'dataset-io': 'files on the application server',
};

const labelFor = (kind: string) => KIND_LABELS[kind] ?? kind;

/**
 * The plain name of an evidence kind for a screen — "Direct writes to SAP
 * standard tables", not `standard-table-write`. A kind without a label is
 * spelled out word by word rather than shown as its key.
 */
export function evidenceKindLabel(kind: string): string {
  const label = KIND_LABELS[kind] ?? kind.replace(/[-_]+/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The plain words for a finding kind — the same map the route report prints,
 * exported so the IT view's findings route names a kind the way the router
 * does instead of keeping a second list of the same 22 words.
 */
export const routeKindLabel = labelFor;

/**
 * One construct that drove the route off the stack, with its evidence.
 *
 * Roadmap 8.2 needs the *reason an alternative was rejected*, at the line it
 * stands on. That reason is exactly the rule below, so it is exported rather
 * than reproduced: a second implementation of "what forces side-by-side" is a
 * second answer, and the two would disagree the first time one of them moved.
 */
export interface RouteDriver {
  kind: EvidenceKind;
  /** The words a report may print for this kind — `KIND_LABELS`. */
  label: string;
  count: number;
  /** The lowest `lineStart` among the findings of this kind. */
  firstLine: number;
  /** Finding ids, in the order the evidence reports them. */
  findingIds: string[];
}

/**
 * The first engine version whose route a frontend file feature no longer
 * chooses (roadmap 3.0.12, owner decision 12.10.2026; CO review F14, PP F11,
 * SD R12).
 *
 * Until then a single `GUI_UPLOAD` or `GUI_DOWNLOAD` made the route
 * side-by-side, with the rationale "Frontend GUI file services are used.
 * Decoupled web client uploads on SAP BTP are required" — our own sentence, in
 * every reviewed package (FI, CO, PP, SD), including programs that only
 * download a list. It was not true: a download is an export of a list, which a
 * Fiori list report does on-stack, and an upload is a file a RAP business
 * object takes as a large object (attachment) field from S/4HANA 2022 on.
 * Neither needs a separate runtime. So a frontend file feature is now rework
 * on-stack, like a dynpro or a classic ALV, and never a route driver.
 *
 * A run signed with an earlier engine keeps the rule it was signed with, the
 * way the score does (`lib/score-rule.ts`): its route is recomputed with its
 * own engine version wherever a screen compares it with the signed one.
 */
export const GUI_FILE_NO_ROUTE_DRIVER_FROM = '3.0.12';

/** Whether a frontend file feature can choose the route for a run of this engine version. */
export function guiFileDrivesRoute(engineVersion: string | null | undefined): boolean {
  return !engineVersionAtLeast(engineVersion, GUI_FILE_NO_ROUTE_DRIVER_FROM);
}

/** Upload, download, a path dialog only (from 3.0.18), or not readable — what a frontend file finding does, read off what it calls. */
export type GuiFileDirection = 'upload' | 'download' | 'dialog' | 'unknown';

/**
 * The direction of one frontend file finding, from the module or method it
 * calls: `GUI_UPLOAD` / `WS_UPLOAD` read a file from the user's PC;
 * `GUI_DOWNLOAD` / `WS_DOWNLOAD` write one. `CL_GUI_FRONTEND_SERVICES` with
 * neither in the statement is not guessed.
 *
 * Before 3.0.18 `FILE_OPEN_DIALOG` counted as an upload and `FILE_SAVE_DIALOG`
 * as a download. A dialog only lets the user choose a path; it transfers no
 * file. With `dialogsChoosePaths`
 * (`READ_CLAIMS_FROM`) a statement that calls a dialog and no transfer is a
 * `dialog`; a run of an earlier engine keeps the reading it signed.
 */
export function guiFileDirection(
  finding: { objectName?: string | null; snippet?: string | null },
  dialogsChoosePaths = false,
): GuiFileDirection {
  const text = `${finding.objectName ?? ''} ${finding.snippet ?? ''}`;
  if (dialogsChoosePaths) {
    const up = /\b(?:GUI|WS)_UPLOAD\b/i.test(text);
    const down = /\b(?:GUI|WS)_DOWNLOAD\b/i.test(text);
    if (up && !down) return 'upload';
    if (down && !up) return 'download';
    if (!up && !down && /\bFILE_(?:OPEN|SAVE)_DIALOG\b/i.test(text)) return 'dialog';
    return 'unknown';
  }
  const up = /\b(?:GUI|WS)_UPLOAD\b|\bFILE_OPEN_DIALOG\b/i.test(text);
  const down = /\b(?:GUI|WS)_DOWNLOAD\b|\bFILE_SAVE_DIALOG\b/i.test(text);
  if (up && !down) return 'upload';
  if (down && !up) return 'download';
  return 'unknown';
}

/**
 * The first engine version whose route BDC, native SQL, a local RFC and — in
 * the Public Edition — writes to custom or SAP standard tables no longer
 * choose (roadmap 3.0.12, finding C1 of the DSAG ABAP guide review, owner
 * decision 13.10.2026).
 *
 * Until then each of them made the route side-by-side on its own. None of
 * them is a reason to leave the stack:
 *
 *   - BDC (`CALL TRANSACTION … USING`) does not run in ABAP Cloud, and its
 *     dynpros carry no stability contract. The answer is the released API for
 *     the same business object, called on-stack; where SAP has released none,
 *     a wrapper around the classic API plus an influence request to SAP
 *     (Private Edition and on-premise — the Public Edition gives no access to
 *     an unreleased object to wrap). A side-by-side service would need the
 *     same released API, so moving the code off the stack solves nothing.
 *   - Native SQL (`EXEC SQL`, ADBC) is rewritten in ABAP SQL against released
 *     CDS views or the customer's own CDS view entities, on-stack.
 *   - A call of an RFC-enabled function module with `DESTINATION 'NONE'` or
 *     `DESTINATION IN GROUP` (parallel processing) stays in this system. Only a
 *     call to another system — any other destination, a variable one included,
 *     because the code does not show it is local — remains a route driver.
 *   - Public Edition: a custom table is developer extensibility on-stack (a
 *     database table in the customer namespace, a RAP business object on it).
 *     A direct write to an SAP standard table is not clean core in any
 *     edition, and a side-by-side service cannot write SAP's tables either:
 *     the remedy is the released API, which is a finding to fix, not a runtime
 *     to choose.
 *
 * Sources: the DSAG ABAP guide (github.com/1DSAG/ABAP-Leitfaden, commit
 * 100600df, CC BY 4.0; translated from German, paraphrased) — clean-core/
 * solution-approach.md "ABAP Cloud" (one development model for SAP BTP, ABAP
 * environment, S/4HANA Cloud Public and Private Edition and on-premise) and
 * "Level Concept" (wrapper plus influence request), architectural-concepts.md
 * "Kopplung" (clean core is reachable on the own system without side-by-side;
 * tightly coupled applications belong on the stack). Where the guide was not
 * followed word for word:
 *   - "Kopplung" says a tightly coupled application "should be built
 *     on-premise". On-premise is a deployment, not an extension style; in the
 *     Public Edition the same answer is on-stack developer extensibility, so
 *     this rule says "on-stack" (`IN_APP_ROUTE`).
 *   - "Level Concept" offers a wrapper wherever an API is not released. A
 *     wrapper needs access to the unreleased object, which only Private
 *     Edition and on-premise give (classic ABAP in a separate software
 *     component); in the Public Edition the answer is the influence request
 *     alone, and the sentences below say so.
 *   - The guide is not consistent on RFC (integration/index.md keeps existing
 *     RFC, its own table there says to avoid it). A call to another system
 *     therefore stays a driver; only the local call, which integrates nothing,
 *     is dropped.
 *
 * A run signed with an earlier engine keeps the rule it was signed with, like
 * `GUI_FILE_NO_ROUTE_DRIVER_FROM`.
 */
export const ON_STACK_CONSTRUCTS_FROM = '3.0.12';

/**
 * The router's assumption for a Public Edition target, from 3.0.12 (SAP's
 * product name, owner decision 13.10.2026). Exported because a contract whose
 * run bound no target must not carry it: the router is handed `public` as its
 * default there, and the most permissive target is not one to state unbound
 * (`lib/architecture-contract.ts`, preconditions).
 */
export const PUBLIC_TARGET_ASSUMPTION =
  'SAP S/4HANA Cloud Public Edition selected as the target — custom code uses released APIs only (clean core level A); an unreleased API cannot be wrapped.';

/**
 * The same assumption from 3.0.18 (`READ_CLAIMS_FROM`). The words above read
 * as a statement about the analysed code — "custom code uses released APIs
 * only (clean core level A)" — and stood next to the unreleased-API and
 * standard-table-write findings that contradict it.
 * This one states the target's rule and says that selecting the
 * target does not establish it for the code. Runs of an earlier engine keep
 * the words above.
 */
export const PUBLIC_TARGET_RULE_ASSUMPTION =
  'SAP S/4HANA Cloud Public Edition selected as the target — the target admits custom code that uses released APIs only (clean core level A), and an unreleased API cannot be wrapped there; selecting the target does not establish that the analysed code meets this.';

/** Whether BDC, native SQL, a local RFC and Public Edition table writes can choose the route for a run of this engine version. */
export function legacyConstructsDriveRoute(engineVersion: string | null | undefined): boolean {
  return !engineVersionAtLeast(engineVersion, ON_STACK_CONSTRUCTS_FROM);
}

/** Where an RFC finding calls: this system (`local`) or another one (`outbound`). */
export type RfcTarget = 'local' | 'outbound';

/**
 * Where one `rfc-call` finding calls, read off its statement.
 *
 * Local: `DESTINATION 'NONE'` (this system, a new session) and `DESTINATION IN
 * GROUP` (parallel processing on this system's servers), and a statement whose
 * only `DESTINATION` is a parameter of that name — the call itself has no
 * destination addition. Everything else is
 * outbound: a literal naming another destination, `'BACK'` (the calling
 * system), and a variable or constant — the code does not show where it
 * points, so it is not shown to be local. A finding that carries `rfcTarget`
 * (a findings row, which has no snippet) is read by that; one with neither is
 * outbound, which is what every RFC finding was before 3.0.12.
 */
export function rfcCallTarget(finding: { snippet?: string | null; rfcTarget?: RfcTarget | null }): RfcTarget {
  if (finding.rfcTarget === 'local' || finding.rfcTarget === 'outbound') return finding.rfcTarget;
  const snippet = finding.snippet ?? '';
  if (!snippet.trim()) return 'outbound';
  // `DESTINATION` followed by `=` is a parameter of that name, not the
  // addition (`CALL FUNCTION 'RFC_CONNECTION_CLOSE' EXPORTING destination =
  // …`): a statement with no addition calls this system.
  const m = /\bDESTINATION\s+(IN\s+GROUP\b|'(?:[^']|'')*'|`[^`]*`|[\w/-]+)/i.exec(snippet);
  if (!m) return 'local';
  const dest = m[1].replace(/\s+/g, ' ').toUpperCase();
  if (dest === 'IN GROUP') return 'local';
  if (/^['`]\s*NONE\s*['`]$/.test(dest)) return 'local';
  return 'outbound';
}

/** A finding as `routeDrivers` reads it. */
export type RouteDriverFinding = {
  id: string;
  lineStart: number;
  kind: string;
  /** The statement, which says where an RFC goes (`rfcCallTarget`). */
  snippet?: string | null;
  /** Where an RFC goes, for a caller that holds no snippet (`ItFindingRow`). */
  rfcTarget?: RfcTarget | null;
};

/**
 * The constructs that choose a side-by-side route, in the order the rule reads
 * them. Empty means the code forces no split: `needsBtp` is `drivers.length >
 * 0` and nothing else. From 3.0.17 a route can still be side-by-side with no
 * driver, when a requirement the owner states in the source sets it
 * (`STATED_REQUIREMENTS_FROM`, `routeExtensibility`) — a statement, never a
 * driver.
 *
 * From 3.0.12 (`ON_STACK_CONSTRUCTS_FROM`) one construct chooses it: an RFC
 * call to another system. Before, six did — custom persistence and direct
 * writes to standard tables in the Public Edition only (CR-04, see
 * `routeExtensibility`), BDC, every RFC call, native SQL and a frontend file
 * feature (`GUI_FILE_NO_ROUTE_DRIVER_FROM`). `engineVersion` picks the rule;
 * there is no default, so no caller picks a rule silently.
 */
export function routeDrivers(
  // What it reads and nothing more, so a caller holding only findings — the
  // architecture canvas — passes them without a cast.
  evidence: { findings: ReadonlyArray<RouteDriverFinding> },
  deploymentModel: 'public' | 'private',
  engineVersion: string | null,
): RouteDriver[] {
  const driver = (kind: EvidenceKind, keep: (f: RouteDriverFinding) => boolean = () => true): RouteDriver | null => {
    const hits = evidence.findings.filter((f) => f.kind === kind && keep(f));
    if (hits.length === 0) return null;
    return {
      kind,
      label: labelFor(kind),
      count: hits.length,
      firstLine: hits.reduce((min, f) => Math.min(min, f.lineStart), hits[0].lineStart),
      findingIds: hits.map((f) => f.id),
    };
  };
  const ordered: Array<RouteDriver | null> = legacyConstructsDriveRoute(engineVersion)
    ? [
        deploymentModel === 'public' ? driver('custom-table-write') : null,
        driver('bdc'),
        driver('rfc-call'),
        driver('native-sql'),
        guiFileDrivesRoute(engineVersion) ? driver('gui-download') : null,
        deploymentModel === 'public' ? driver('standard-table-write') : null,
      ]
    : [driver('rfc-call', (f) => rfcCallTarget(f) === 'outbound')];
  return ordered.filter((d): d is RouteDriver => d !== null);
}

type GuiFileFinding = { objectName?: string | null; snippet?: string | null; lineStart: number };

/**
 * What the frontend file features of a program mean for its route, upload and
 * download apart (from 3.0.12). It names the finding and its line, says what
 * replaces it on-stack, and — for an upload — names the requirement that would
 * justify a side-by-side service instead, which the code cannot show. It never
 * says side-by-side is required: no file feature makes it so.
 */
export function guiFileSentence(files: readonly GuiFileFinding[], precise = false, dialogsChoosePaths = false): string {
  const by = (dir: GuiFileDirection) => files.filter((f) => guiFileDirection(f, dialogsChoosePaths) === dir);
  const named = (list: readonly GuiFileFinding[]) => {
    const names = [...new Set(list.map((f) => (f.objectName || 'CL_GUI_FRONTEND_SERVICES').toUpperCase()))].join(', ');
    const first = list.reduce((min, f) => Math.min(min, f.lineStart), list[0].lineStart);
    return `${names}, from line ${first}`;
  };
  const parts: string[] = [];
  const downloads = by('download');
  const uploads = by('upload');
  const unknown = by('unknown');
  // Empty before 3.0.18: `guiFileDirection` reads a dialog as a transfer there.
  const dialogs = by('dialog');
  if (downloads.length && precise) {
    // From 3.0.13 (`PRECISION_FIXES_FROM`): the finding shows that a file is
    // downloaded, not what it holds — a PDF is no list.
    parts.push(`The frontend file download (${named(downloads)}) writes a file to the user's PC; what the file holds is not read here. In ABAP Cloud a download is served on-stack — a table by a Fiori list report's spreadsheet export, any other file by a RAP large object field (S/4HANA 2022 on) — so the download forces no side-by-side split.`);
  } else if (downloads.length) {
    parts.push(`The frontend file download (${named(downloads)}) writes a list to the user's PC: in ABAP Cloud a Fiori list report exports it to a spreadsheet on-stack, so the download forces no side-by-side split.`);
  }
  if (uploads.length) {
    parts.push(`The frontend file upload (${named(uploads)}) reads a file from the user's PC: a RAP business object takes a file as a large object (attachment) field from S/4HANA 2022 on, so the upload alone forces no side-by-side split — a side-by-side service needs a requirement the code does not show, such as external users, files arriving from several systems, or a volume the S/4HANA stack should not carry.`);
  }
  if (dialogs.length) {
    // Named by the method the statement calls: `dialog` is only read off one.
    const methods = [...new Set(dialogs.flatMap((f) => (`${f.objectName ?? ''} ${f.snippet ?? ''}`.match(/\bFILE_(?:OPEN|SAVE)_DIALOG\b/gi) ?? []).map((m) => m.toUpperCase())))];
    const first = dialogs.reduce((min, f) => Math.min(min, f.lineStart), dialogs[0].lineStart);
    parts.push(`The frontend file dialogs (${methods.join(', ')}, from line ${first}) let the user choose a file path; the dialog itself reads or writes no file, and whether the program transfers one is not shown by this call. SAP GUI's file dialogs do not run in ABAP Cloud, where a Fiori app has the user choose the file in the browser, so they force no side-by-side split.`);
  }
  if (unknown.length) {
    parts.push(`The frontend file services (${named(unknown)}) do not run in ABAP Cloud and are replaced on-stack — an export by a Fiori list report, an upload by a RAP large object field (S/4HANA 2022 on); they force no side-by-side split.`);
  }
  return parts.join(' ');
}

type LinedFinding = { lineStart: number; snippet?: string | null };

const firstLineOf = (list: readonly LinedFinding[]) => list.reduce((min, f) => Math.min(min, f.lineStart), list[0].lineStart);

/**
 * What native SQL, BDC and a local RFC call mean for the route, from 3.0.12
 * (`ON_STACK_CONSTRUCTS_FROM`). Each names its count and first line, says what
 * replaces it on-stack in ABAP Cloud, and that it forces no side-by-side
 * split. Empty when none of them was found.
 *
 * The BDC answer differs by edition: a wrapper around an unreleased classic
 * API exists only where custom code can reach that API — Private Edition and
 * on-premise. In the Public Edition what is left is an influence request to
 * SAP for a released API (see `ON_STACK_CONSTRUCTS_FROM` for why this departs
 * from the DSAG guide's general wording).
 */
export function onStackSentences(
  found: { nativeSql: readonly LinedFinding[]; bdc: readonly LinedFinding[]; localRfc: readonly LinedFinding[] },
  deploymentModel: 'public' | 'private',
  /** From 3.0.18 (`READ_CLAIMS_FROM`): a local call shows no release status, and the sentence claims none. */
  releaseNotShown = false,
): string {
  const parts: string[] = [];
  const { nativeSql, bdc, localRfc } = found;
  if (nativeSql.length) {
    parts.push(`The native SQL (${nativeSql.length}×, EXEC SQL or ADBC, from line ${firstLineOf(nativeSql)}) does not run in ABAP Cloud: it is rewritten on-stack in ABAP SQL against released CDS views or the customer's own CDS view entities, so it forces no side-by-side split.`);
  }
  if (bdc.length) {
    const noApi = deploymentModel === 'public'
      ? 'where SAP has released none, SAP S/4HANA Cloud Public Edition offers no classic API to wrap, and the way forward is an influence request to SAP for a released API'
      : 'where SAP has released none, by a wrapper around the classic API, released for use in ABAP Cloud, together with an influence request to SAP for a released API';
    parts.push(`The BDC screen automation (${bdc.length}×, from line ${firstLineOf(bdc)}) does not run in ABAP Cloud, and the screens it drives carry no stability contract. It is replaced on-stack by the released API of the same business object; ${noApi}. A side-by-side service would need the same released API, so the automation forces no side-by-side split.`);
  }
  if (localRfc.length) {
    const forms = [
      localRfc.some((f) => /\bDESTINATION\s+'\s*NONE\s*'/i.test(f.snippet ?? '')) ? "DESTINATION 'NONE'" : '',
      localRfc.some((f) => /\bDESTINATION\s+IN\s+GROUP\b/i.test(f.snippet ?? '')) ? 'DESTINATION IN GROUP' : '',
      localRfc.some((f) => !/\bDESTINATION\s+(?:IN\s+GROUP\b|'|`|[\w/-])/i.test(f.snippet ?? '')) ? 'no destination addition' : '',
    ].filter(Boolean);
    const how = forms.length ? `${forms.join(', ')}, ` : '';
    const parallel = forms.includes('DESTINATION IN GROUP');
    // Before 3.0.18 the sentence ended "In ABAP Cloud the called function is
    // reached through a released API": where a call goes shows nothing about
    // whether what it calls is released.
    // Runs of an earlier engine keep those words.
    if (releaseNotShown) {
      parts.push(`The function module call(s) read as RFC that stay in this system (${localRfc.length}×, ${how}from line ${firstLineOf(localRfc)}) integrate no other system, so they force no side-by-side split. Whether the called function is released for ABAP Cloud is not established here: on an ABAP Cloud target the call has to reach a released API, and is replaced by one where the function is not released${parallel ? '; parallel processing runs through the released class CL_ABAP_PARALLEL' : ''}.`);
    } else {
      parts.push(`The function module call(s) read as RFC that stay in this system (${localRfc.length}×, ${how}from line ${firstLineOf(localRfc)}) integrate no other system, so they force no side-by-side split. In ABAP Cloud the called function is reached through a released API${parallel ? ', and parallel processing through the released class CL_ABAP_PARALLEL' : ''}.`);
    }
  }
  return parts.join(' ');
}

/**
 * The effort sentence for exit, BAdI and VOFM implementations (3.0.13): per
 * hook, the statements of logic in it and whether it is delegated to a class,
 * taken from the finding's title, which `evidence-model.ts` writes as
 * "<hook>: delegated to <class>" or "<hook>: <n> statements of logic in the hook".
 */
function hookSentence(hooks: readonly AbapEvidenceReport['findings'][number][]): string {
  const delegated = hooks.filter((f) => /: delegated to /.test(f.title));
  const inHook = hooks.filter((f) => !/: delegated to /.test(f.title));
  const parts: string[] = [];
  if (inHook.length) {
    parts.push(`${inHook.length} exit, BAdI or VOFM implementation(s) hold their logic in the hook (${inHook.map((f) => f.title).join('; ')}): moving them means moving that logic statement by statement, which is where the effort lies.`);
  }
  if (delegated.length) {
    parts.push(`${delegated.length} delegate to a class (${delegated.map((f) => f.title).join('; ')}): the logic moves with the class, and only the call in the hook is re-pointed.`);
  }
  return parts.join(' ');
}

/**
 * `engineVersion` is the version the run is (or was) made with: `APP_VERSION`
 * for a new run, the run's own `analyzerVersion` when a signed run is
 * recomputed. It picks the score rule (`lib/score-rule.ts`) — a run signed
 * before 3.0.9 is scored by the rule it was signed with. Null is read as such
 * a run. There is no default, so no caller picks a rule silently.
 */
export function routeExtensibility(
  evidence: AbapEvidenceReport,
  deploymentModel: 'public' | 'private',
  engineVersion: string | null,
): ExtensibilityRouteReport {
  const findings = evidence.findings;
  /**
   * What the engine did not assess.
   *
   * A file of nothing but application-server dataset I/O produces no findings,
   * because no detector claims those statements — and "no findings" then became
   * a Clean Core Score of 100, "Highly feasible. Trivial extension" and "No
   * legacy patterns detected". The code had not been found clean; it had not
   * been read. Incomplete coverage is
   * unknown, and unknown is not clean.
   */
  const coverage = evidence.coverage;
  const coverageIncomplete = coverage ? !coverage.complete : false;
  const unassessedSummary = coverage && coverage.gaps.length
    ? coverage.gaps.map((g) => `${g.count} \u00d7 ${g.label.toLowerCase()} (from line ${g.firstLine})`).join(', ')
    : '';
  // The includes the source names and does not hold, by name (`coverage.ts`).
  const includesNotRead = (coverage?.unassessed ?? []).filter((u) => u.gap === 'include-not-read');
  // Its first sentence names the include and says it is not determined. No
  // line number: the rationale is prose that formatting must not move; the
  // anchor is the construct's own `line`.
  const includesNotReadSentence = includesNotRead.map((u) => `${u.why.split('. ')[0]}.`).join(' ');

  // 1. Calculate Clean Core Score deterministically
  // Start at 100%. Deduct per CATEGORY (not per-finding) with diminishing returns.
  // Rationale: even heavily legacy code retains some reusable business logic,
  // AUTHORITY-CHECK patterns, and clear structure. Score 0% should be reserved
  // for code that is 100% unreleased and untransformable.
  let score = 100;
  
  const standardWrites = findings.filter(f => f.kind === 'standard-table-write');
  const customWrites = findings.filter(f => f.kind === 'custom-table-write');
  const standardReads = findings.filter(f => f.kind === 'standard-table-read');
  const bdcCalls = findings.filter(f => f.kind === 'bdc');
  const rfcCalls = findings.filter(f => f.kind === 'rfc-call');
  const nativeSql = findings.filter(f => f.kind === 'native-sql');
  const fileAccess = findings.filter(f => f.kind === 'gui-download');
  // Enhancement technologies decide the clean core LEVEL, not just the score.
  // Modifications are level D outright; enhancement implementations and points
  // are not-recommended technologies; BAdIs are the level-B case and must not
  // be penalised like the others.
  const modifications = findings.filter(f => f.kind === 'modification');
  const enhancements = findings.filter(
    f => f.kind === 'enhancement' && f.objectType !== 'BAdI',
  );

  // Category-based deductions (capped per category, diminishing returns).
  // The table lives in lib/clean-core-score.ts, where the screen that explains
  // the score reads it too: one table, so the explanation cannot drift from the
  // number it explains. The floor of 5 is applied there as well — even the
  // worst legacy code retains some reusable structure.
  // In Private Edition from 3.0.9 a write to the program's own Z/Y tables costs
  // nothing — the rationale below calls it no clean core violation, and the
  // score now agrees (owner decision 11.10.2026).
  const scoreRule = scoreRuleFor(deploymentModel, engineVersion);
  score = scoreFromFindings(findings, scoreRule);

  // 2. Determine target route
  //
  // CR-04: a write to the customer's own Z-table used to set this on its own, in
  // both deployment models, with the rationale "custom tables require decoupled
  // Side-by-Side architecture". In Private Edition / RISE that is backwards.
  // Custom persistence in the customer namespace is the textbook developer
  // extensibility case: the table is an ABAP Dictionary object and a RAP business
  // object is built on it, on-stack. A Z-table is not a clean core violation —
  // modifying SAP's tables is. So the most common legacy pattern there is was
  // routing people off-stack to BTP.
  //
  // It stays a Side-by-Side trigger in Public Edition, where the strict SaaS
  // model does not offer that path for custom persistence. The distinction is
  // the deployment, not the construct, which is why it is read from
  // `deploymentModel` and not from the finding.
  //
  // From 3.0.12 it is no trigger in Public Edition either: developer
  // extensibility holds custom tables on-stack there too
  // (`ON_STACK_CONSTRUCTS_FROM`). A run of an earlier engine keeps the rule.
  const legacyRule = legacyConstructsDriveRoute(engineVersion);
  // From 3.0.18 the router says only what the findings show (`READ_CLAIMS_FROM`).
  const readClaims = readClaimsApply(engineVersion);
  const customPersistenceForcesBtp = legacyRule && deploymentModel === 'public' && customWrites.length > 0;
  // Before 3.0.12 every RFC call was a trigger; from then on only a call to
  // another system is, and a local one (`DESTINATION 'NONE'`, `IN GROUP`) is
  // rework on-stack (`rfcCallTarget`).
  const outboundRfc = legacyRule ? rfcCalls : rfcCalls.filter((f) => rfcCallTarget(f) === 'outbound');
  const localRfc = legacyRule ? [] : rfcCalls.filter((f) => rfcCallTarget(f) === 'local');

  // The constructs that actually chose the route, in the order the rule reads
  // them, and the one definition of that rule (`routeDrivers` above). Every
  // sentence below that names a construct takes it from here, and so does the
  // architecture contract of roadmap 8.2, which has to give the *same* reason
  // for rejecting the other track.
  const drivers = routeDrivers(evidence, deploymentModel, engineVersion);
  const needsBtp = drivers.length > 0;
  // Before 3.0.12 a frontend file feature chose the route on its own
  // (`GUI_FILE_NO_ROUTE_DRIVER_FROM`); a run of that engine keeps that rule.
  const guiFileRule = guiFileDrivesRoute(engineVersion);

  // From 3.0.17 (`STATED_REQUIREMENTS_FROM`, owner decision 17.10.2026): a
  // target the program's owner states as binding in the source sets the route
  // when the code does not force the other one. Code can force side-by-side
  // (`drivers`) or on-stack (a construct that runs inside SAP's processing,
  // `IN_PROCESS_KINDS`). Only a stated side-by-side target can move the route:
  // without drivers the code's route is on-stack already. The statement never
  // becomes a finding or a driver, and the score does not read it.
  const stated = statedRequirementsApply(engineVersion) ? statedTargetOf(evidence.statedRequirements) : null;
  const inProcess = findings.filter((f) => IN_PROCESS_KINDS.has(f.kind));
  const followStatedSide = Boolean(stated && stated.target === 'side-by-side' && !needsBtp && inProcess.length === 0);
  const statedConflict = Boolean(
    stated && ((stated.target === 'side-by-side' && !needsBtp && inProcess.length > 0) || (stated.target === 'on-stack' && needsBtp)),
  );
  const routeBtp = needsBtp || followStatedSide;
  // From 3.0.19 (`KEY_USER_FROM`): the key-user candidates the evidence read.
  const keyUser = keyUserApplies(engineVersion) && evidence.keyUser ? keyUserRouteBasis(evidence.keyUser) : null;

  const recommendedRoute = routeBtp ? SIDE_BY_SIDE_ROUTE : IN_APP_ROUTE;

  const btpTriggerList = drivers.map((d) => d.label).join(', ');
  const presentCategories = [...new Set(findings.map((f) => f.kind))].map(labelFor).join(', ');

  // A direct write to SAP's rows is not a side-by-side trigger in Private
  // Edition, and it is not compatible with ABAP Cloud either: it stays on-stack
  // only once it is replaced.
  // From 3.0.12 the same holds in Public Edition (`ON_STACK_CONSTRUCTS_FROM`):
  // a side-by-side service cannot write SAP's rows either, so the write is a
  // finding to replace, not a reason to leave the stack.
  const standardWritesOnStack = standardWrites.length > 0 && (deploymentModel === 'private' || !legacyRule);
  // What replaces such a write. A BAPI is a classic API the Public Edition
  // does not offer to custom code, so its sentence names only released ones;
  // the Private Edition words are the ones every earlier run signed.
  const standardWriteRemedy = deploymentModel === 'public'
    ? 'a released API or a RAP action of a released business object'
    : 'a released write API, a BAPI or a RAP action';
  // From 3.0.13 (`PRECISION_FIXES_FROM`) such a write is named whichever
  // finding chose the route. Before, an outbound RFC, a modification or a
  // custom-table write took the rationale and the In-App track, and the write
  // that has to be replaced in any case went unsaid there.
  // A run of an earlier engine keeps its words.
  const standardWritesAlwaysNamed = precisionFixesApply(engineVersion) && standardWrites.length > 0;
  // routeBtp, not needsBtp: a route a stated requirement sets off the stack (from 3.0.17) does not replace these
  // writes on-stack either. Before 3.0.17 the two are the same.
  const standardWritesTooSentence = routeBtp
    ? ` ${standardWrites.length} direct write(s) to SAP standard tables have to be replaced by ${standardWriteRemedy} as well.`
    : '';

  // Constructs that force no side-by-side split but do not run unchanged in
  // ABAP Cloud either: classic enhancements, dynpros, classic ALV, SUBMIT,
  // update tasks, legacy mail and unreleased APIs. They stay on-stack only
  // once replaced, so they may not leave the In-App track rated "Highly
  // Compatible" with "standard reads" as its reason.
  // Reads and writes to the customer's own tables are not
  // among them: ABAP Cloud reads and writes its own tables.
  //
  // An explicit COMMIT WORK is among them: a program
  // whose only construct was a COMMIT WORK came out "High compatibility" with
  // "standard reads" as the reason, and the rationale called it addressed
  // on-stack without saying how. In ABAP Cloud the RAP runtime owns the
  // transaction: a COMMIT WORK inside a RAP handler is forbidden, so the
  // statement has to go and the boundary be left to the RAP save sequence. It
  // forces no side-by-side split. ROLLBACK WORK produces no finding kind, so
  // there is no evidence here to classify for it.
  //
  // From 3.0.12 frontend file services are among them: SAP GUI's file dialogs
  // do not run in ABAP Cloud, and what replaces them — a list report's export,
  // a RAP large object field — runs on-stack (`GUI_FILE_NO_ROUTE_DRIVER_FROM`).
  const ON_STACK_REWORK: ReadonlySet<string> = new Set([
    'dynpro', 'classic-alv', 'submit', 'update-task', 'legacy-mail', 'unreleased-api', 'batch-input', 'commit-work',
    ...(guiFileRule ? [] : ['gui-download']),
    // From 3.0.12 native SQL, BDC and a local RFC are rework on-stack too
    // (`ON_STACK_CONSTRUCTS_FROM`).
    ...(legacyRule ? [] : ['native-sql', 'bdc']),
    // So are the classic constructs the engine reports from 3.0.12 on —
    // parallel processing through asynchronous RFC, BOPF, a SEGW service and a
    // DDIC-based CDS view: each finding says ABAP Cloud does not offer it, so
    // none may leave the In-App track "Highly Compatible".
    // Runs of an earlier engine
    // have no such findings; the gate keeps their rule word for word anyway.
    ...(legacyRule ? [] : ['parallel-processing', 'bopf', 'gateway-classic-service', 'ddic-cds-view']),
    // From 3.0.13: an enhancement point in the customer's own code is no level
    // D technology, but ABAP Cloud has no enhancement points either.
    ...(precisionFixesApply(engineVersion) ? ['own-enhancement-point'] : []),
    // From 3.0.18: a classic API and a file on the application server do not
    // run in ABAP Cloud either; neither forces a side-by-side split.
    ...(readClaims ? ['classic-api', 'dataset-io'] : []),
    ...(localRfc.length > 0 ? ['rfc-call'] : []),
  ]);
  const reworkKinds = [...new Set([
    ...enhancements.map((f) => f.kind),
    ...findings.filter((f) => ON_STACK_REWORK.has(f.kind)).map((f) => f.kind),
  ])];
  const onStackRework = reworkKinds.length > 0;
  const reworkList = reworkKinds.map(labelFor).join(', ');
  // The remedy for a commit is not a released API or BAdI: it is removal. So
  // the "replaced by released APIs" sentence names only the other kinds, and
  // the commit gets its own sentence.
  const explicitCommits = findings.filter((f) => f.kind === 'commit-work');
  const replacedList = reworkKinds.filter((k) => k !== 'commit-work').map(labelFor).join(', ');
  const commitCore = `the explicit COMMIT WORK (${explicitCommits.length}×) conflicts with the RAP transaction lifecycle: it has to be removed and the transaction boundary left to the RAP save sequence before the code runs on ABAP Cloud.`;
  const commitSentence = explicitCommits.length > 0 ? ` T${commitCore.slice(1)}` : '';
  const REPLACED_BY = 'released APIs, a released BAdI or a Fiori/RAP equivalent';
  // Without a commit both sentences read exactly as they did before.
  const reworkCheckpoint = explicitCommits.length === 0
    ? `; it stays on-stack once replaced by ${REPLACED_BY}.`
    : replacedList
    ? `; ${replacedList} stays on-stack once replaced by ${REPLACED_BY}.${commitSentence}`
    : `.${commitSentence}`;
  const reworkFit = explicitCommits.length === 0
    ? `Requires refactoring: ${reworkList} must be replaced by ${REPLACED_BY} before the code runs on ABAP Cloud.`
    : replacedList
    ? `Requires refactoring: ${replacedList} must be replaced by ${REPLACED_BY} before the code runs on ABAP Cloud.${commitSentence}`
    : `Requires refactoring: ${commitCore}`;

  // What this router can say about persistence: a count, not a fit.
  const writeSummary =
    standardWrites.length === 0 && customWrites.length === 0
      ? 'no database write at all'
      : [
          standardWrites.length > 0 ? `${standardWrites.length} write(s) to SAP standard tables` : '',
          customWrites.length > 0 ? `${customWrites.length} write(s) to custom persistence` : '',
        ]
          .filter(Boolean)
          .join(' and ');

  // Calculate confidence score based on the weight of findings
  let confidenceScore = 80;
  // A route chosen from a partial reading is a less confident route, and says so.
  const confidencePenalty = coverageIncomplete ? Math.min(25, (coverage?.gaps.length || 0) * 5 + 10) : 0;
  if (needsBtp) {
    // Custom writes only add confidence where they actually drove the decision.
    const customWeight = customPersistenceForcesBtp ? customWrites.length * 5 : 0;
    confidenceScore = Math.min(95, 80 + customWeight + outboundRfc.length * 5);
  } else {
    confidenceScore = Math.min(90, 70 + standardReads.length * 5);
  }
  // From 3.0.17. A route set by a stated requirement rests on words the engine
  // cannot verify, not on constructs it read: 70, the floor of a code-based
  // on-stack route, and 5 more when a second binding statement says the same
  // (75 at most — below every side-by-side route the code drives). A route the
  // owner's binding statement contradicts keeps the code's reason but loses 15,
  // and statements that contradict each other cost 10: the requirement has to
  // be settled before either route is certain.
  if (followStatedSide && stated) {
    confidenceScore = Math.min(75, 70 + (stated.binding.length - 1) * 5);
  } else if (statedConflict) {
    confidenceScore = Math.max(40, confidenceScore - 15);
  } else if (stated?.contradictory) {
    confidenceScore = Math.max(40, confidenceScore - 10);
  }

  // Rationale
  let rationale = '';
  let namedNotRead = false;
  // Set by the branches whose sentence is about the standard-table writes.
  let rationaleNamesStandardWrites = false;
  if (modifications.length > 0) {
    rationale = `Detected ${modifications.length} core modification(s) to SAP standard code. Modifications are clean core level D: they must be reset to standard via SPAU and the requirement rebuilt on a released extension point before any cloud target is reachable.`;
    // `!needsBtp` for the same reason the two private branches moved below the
    // triggers: this sentence recommends an on-stack target, so it may not be
    // the explanation of a side-by-side route.
  } else if (enhancements.length > 0 && !needsBtp && customWrites.length === 0 && standardWrites.length === 0) {
    rationale = `Detected ${enhancements.length} enhancement implementation(s) or enhancement point(s). These are not-recommended technologies under the clean core level concept; re-point them to a released BAdI or API, which ABAP Cloud (RAP) supports on-stack.`;
  } else if (customPersistenceForcesBtp) {
    // What this sentence may not claim. It used to read "the strict SaaS model
    // does not offer on-stack custom persistence", which is false: S/4HANA
    // Cloud Public Edition has had developer extensibility since ABAP Cloud
    // arrived with ADT and the three-system landscape, and a custom database
    // table is one of the objects it can hold (SAP Learning, "Using Developer
    // In-App Extensibility in SAP S/4HANA Cloud Public Edition"). The route
    // below is a recommendation with a precondition, not a technical
    // impossibility, and it says so (CR-03).
    rationale = `Detected ${customWrites.length} write(s) to custom database persistence. This recommendation routes it to a decoupled Side-by-Side service (CAP). It is not the only option: S/4HANA Cloud Public Edition can hold custom tables on-stack through developer extensibility (ABAP Cloud), where that is set up and the data belongs on the stack — a decision to take on the requirement, not one this analysis can settle from the code.`;
  } else if (legacyRule && standardWrites.length > 0 && deploymentModel === 'public') {
    // The rule of runs made before 3.0.12, kept word for word
    // (`ON_STACK_CONSTRUCTS_FROM`).
    rationale = `Direct writes to standard SAP tables are strictly prohibited in S/4HANA Public Cloud. Side-by-Side integration is required.`;
    rationaleNamesStandardWrites = true;
  } else if (outboundRfc.length > 0) {
    rationale = `RFC integrations are present. These should be externalized via SAP Integration Suite destination service.`;
  } else if (guiFileRule && fileAccess.length > 0) {
    // The rule of runs made before 3.0.12, kept word for word so a signed run
    // recomputes to what it signed. Not said by a newer run: a file feature
    // alone never forces side-by-side (`GUI_FILE_NO_ROUTE_DRIVER_FROM`).
    rationale = `Frontend GUI file services are used. Decoupled web client uploads on ${BTP} are required.`;
  } else if (legacyRule && nativeSql.length > 0) {
    // This branch and the BDC one below are the rule of runs made before
    // 3.0.12, kept word for word; a newer run says what replaces them on-stack
    // (`onStackSentences` below, `ON_STACK_CONSTRUCTS_FROM`).
    //
    // Native SQL and BDC set `needsBtp` and had no branch of their own, so a
    // program whose only finding was an `EXEC SQL` block was routed
    // Side-by-Side and told in the same report that only standard-table reads
    // and low-criticality patterns had been found and that on-stack RAP was the
    // path.
    // Two contradictory recommendations in one signed report is
    // worse than either of them alone.
    rationale = `Detected ${nativeSql.length} native SQL statement(s) (EXEC SQL or ADBC). Native SQL bypasses the database abstraction and does not run in ABAP Cloud at all; the access has to be rewritten in ABAP SQL against released objects, or moved to a decoupled service.`;
  } else if (legacyRule && bdcCalls.length > 0) {
    rationale = `Detected ${bdcCalls.length} BDC screen automation(s) (CALL TRANSACTION). Screen automation depends on SAP GUI dynpros that carry no stability contract; it has to be replaced by a released API, which is a side-by-side integration where none exists on-stack.`;
  } else if (customWrites.length > 0 && deploymentModel === 'public') {
    // Reached from 3.0.12 only: before, a Public Edition custom write chose
    // the route and the branch above (`customPersistenceForcesBtp`) said so.
    rationale = `Detected ${customWrites.length} write(s) to custom database persistence. SAP S/4HANA Cloud Public Edition holds custom tables on-stack through developer extensibility (ABAP Cloud): the table is a database table in the customer namespace and a RAP business object is built on it, so the write forces no side-by-side split. A side-by-side service is a choice to take on the requirement — data shared with other systems, or a volume the S/4HANA stack should not carry — which the code does not show.`;
  } else if (customWrites.length > 0) {
    // The private edition by SAP's product name from 3.0.12 (owner decision
    // 13.10.2026); a run of an earlier engine keeps the words it signed.
    rationale = legacyRule
      ? `Detected ${customWrites.length} write(s) to custom database persistence. In Private Edition / RISE this is on-stack developer extensibility, not a reason to leave the stack: the table is a Dictionary object in the customer namespace and a RAP business object is built on it. Writing to your own table is not a clean core violation — writing to SAP's is.`
      : `Detected ${customWrites.length} write(s) to custom database persistence. In SAP Cloud ERP Private this is on-stack developer extensibility, not a reason to leave the stack: the table is a Dictionary object in the customer namespace and a RAP business object is built on it. Writing to your own table is not a clean core violation — writing to SAP's is.`;
  } else if (standardWrites.length > 0 && deploymentModel === 'public') {
    // Reached from 3.0.12 only (`ON_STACK_CONSTRUCTS_FROM`): leaving the stack
    // does not fix a write to SAP's rows, since a side-by-side service cannot
    // make one either.
    rationale = `Direct writes to standard SAP tables are present. They are not allowed in SAP S/4HANA Cloud Public Edition and are not clean core in any edition, but leaving the stack does not fix them: a side-by-side service cannot write SAP's tables either. The write is replaced on-stack by ${standardWriteRemedy}, so it forces no side-by-side split.`;
    rationaleNamesStandardWrites = true;
  } else if (standardWrites.length > 0) {
    // Not "wrappable". A wrapper ("Tier 2" in the words of runs before 3.0.12) encapsulates an unreleased SAP object
    // so that ABAP Cloud code may reach it; it does not make a direct write to
    // SAP's rows a supported operation, and presenting it as the remedy invited
    // the reader to keep the write and hide it.
    rationale = legacyRule
      ? `Direct writes to standard SAP tables are present. In Private Edition the write can stay on-stack, but it has to be replaced by a released write API, a BAPI or a RAP action: no wrapper makes a direct modification of SAP's own rows a supported operation.`
      : `Direct writes to standard SAP tables are present. In SAP Cloud ERP Private the write can stay on-stack, but it has to be replaced by a released write API, a BAPI or a RAP action: no wrapper makes a direct modification of SAP's own rows a supported operation.`;
    rationaleNamesStandardWrites = true;
  } else if (findings.length > 0) {
    rationale = `No construct that forces a side-by-side split was detected. What was found — ${presentCategories} — is addressed on-stack, so Developer Extensibility (RAP) is the recommended path.`;
  } else if (includesNotRead.length > 0) {
    namedNotRead = true;
    // G4-F2: "no legacy pattern was detected" over a program whose deciding
    // logic sits in an include nobody uploaded reads as a clean result. It is
    // not one: say what was not read, and what the route rests on instead.
    rationale = `Part of the program was not read. ${includesNotReadSentence} No construct that forces a side-by-side split was found in the part that was read, so On-Stack Developer Extensibility (RAP) is recommended for that part only. The whole program is decided only by an analysis of it uploaded together with its includes.`;
  } else {
    rationale = `No legacy pattern was detected in the part of the code the engine assessed. On-Stack Developer Extensibility (RAP) is the recommended path.`;
  }
  // An explicit COMMIT WORK has the same remedy whichever finding chose the
  // branch above. It used to be appended in the generic findings branch only,
  // so a program with a BDC call, an RFC or a modification next to its COMMIT
  // WORK never learned that the commit has to go.
  rationale = `${rationale}${commitSentence}`;
  if (standardWritesAlwaysNamed && !rationaleNamesStandardWrites) {
    rationale = routeBtp
      ? `${rationale} The ${standardWrites.length} direct write(s) to SAP standard tables are not fixed by this route: a side-by-side service cannot write SAP's tables either, so each is replaced by ${standardWriteRemedy}.`
      : `${rationale} The ${standardWrites.length} direct write(s) to SAP standard tables are not clean core in any edition: each is replaced on-stack by ${standardWriteRemedy}.`;
  }
  // From 3.0.12: what native SQL, BDC and a local RFC mean for the route,
  // whichever branch chose it — each names its finding and line and says what
  // replaces it on-stack (`ON_STACK_CONSTRUCTS_FROM`).
  if (!legacyRule) {
    const onStack = onStackSentences({ nativeSql, bdc: bdcCalls, localRfc }, deploymentModel, readClaims);
    if (onStack) rationale = `${rationale} ${onStack}`;
  }
  // What a frontend file feature means for the route, whichever branch chose
  // it — upload and download apart, because they have different remedies.
  if (!guiFileRule && fileAccess.length > 0) rationale = `${rationale} ${guiFileSentence(fileAccess, precisionFixesApply(engineVersion), readClaims)}`;
  // From 3.0.18 (`READ_CLAIMS_FROM`; the findings exist from that engine on):
  // what a file on the application server and a classic API mean for the
  // route, whichever branch chose it.
  if (readClaims) {
    const datasets = findings.filter((f) => f.kind === 'dataset-io');
    if (datasets.length > 0) {
      rationale = `${rationale} The program handles a file on the application server (${datasets.length} statement(s), from line ${Math.min(...datasets.map((f) => f.lineStart))}). ABAP Cloud has no access to the application server's file system: the file is handed over through an interface (SAP Integration Suite, for example its SFTP adapter, or a released API the other side calls), and the ABAP Cloud logic only produces or takes its content.`;
    }
    const classic = findings.filter((f) => f.kind === 'classic-api');
    if (classic.length > 0) {
      const names = [...new Set(classic.map((f) => f.objectName).filter(Boolean))];
      rationale = `${rationale} ${names.join(', ')} ${names.length === 1 ? 'is a classic API' : 'are classic APIs'} SAP does not release for ABAP Cloud: on this route ${names.length === 1 ? 'its call is' : 'their calls are'} replaced by the released API of the same business object, or kept in classic ABAP behind a wrapper.`;
    }
  }
  // From 3.0.13 (`PRECISION_FIXES_FROM`, roadmap 3.0.13 rule 2): how much of
  // an exit, BAdI or VOFM implementation's logic stands in the hook decides the
  // effort of moving it — the statements in the hook and whether it is
  // delegated to a class are said, whichever branch chose the route.
  if (precisionFixesApply(engineVersion)) {
    const hooks = findings.filter((f) => f.kind === 'hook-implementation');
    if (hooks.length > 0) rationale = `${rationale} ${hookSentence(hooks)}`;
  }
  // Every other branch named what it found; with an include not uploaded it
  // also says what it could not have found.
  if (includesNotRead.length > 0 && !namedNotRead) {
    rationale = `${rationale} Part of the program was not read. ${includesNotReadSentence}`;
  }

  // From 3.0.19 (`KEY_USER_FROM`): where the whole program is key user, the
  // rationale leads with it and says what the code route would be; where it
  // splits, it says which parts are key user and that code is built for the
  // rest only.
  if (keyUser?.recommended) {
    rationale = `Key-user extensibility covers the whole program: ${keyUser.sentence} No code is generated for it. Should a candidate not hold once its limit is checked, that part is built in code on this route: ${rationale}`;
  } else if (keyUser && keyUser.scope === 'partial') {
    rationale = `${rationale} Key-user extensibility: ${keyUser.sentence}`;
  }

  // From 3.0.17: what the owner stated in the source, said as stated and
  // never as read from the code (`STATED_REQUIREMENTS_FROM`).
  const statedLines = (list: readonly StatedRequirement[]) => list.map((r) => citeStatement(r, false)).join(', ');
  const statedQuotes = (list: readonly StatedRequirement[]) => list.map((r) => citeStatement(r)).join('; ');
  if (stated && followStatedSide) {
    rationale = `Recommended side-by-side on ${BTP} because the program's owner states it as a binding requirement — stated in the source, not read from the code: ${statedQuotes(stated.binding)}. No construct in the code forces the program on-stack, so the stated target is followed. Read from the code alone, the route would be on-stack: ${rationale}`;
  } else if (stated && statedConflict && stated.target === 'side-by-side') {
    const first = inProcess.reduce((min, f) => Math.min(min, f.lineStart), inProcess[0].lineStart);
    const kinds = [...new Set(inProcess.map((f) => labelFor(f.kind)))].join(', ');
    rationale = `${rationale} The program's owner states side-by-side on ${BTP} as the target — stated in the source, not read from the code: ${statedQuotes(stated.binding)}. The code contradicts it: the ${kinds} (from line ${first}) run inside SAP's own processing and do not move off the stack as they stand, so the route stays with the code. The conflict has to be settled on the requirement.`;
  } else if (stated && statedConflict) {
    rationale = `${rationale} The program's owner states on-stack as the target — stated in the source, not read from the code: ${statedQuotes(stated.binding)}. The code contradicts it: ${btpTriggerList} (from line ${drivers[0].firstLine}) force a side-by-side split, so the route stays with the code. The conflict has to be settled on the requirement.`;
  } else if (stated && stated.target) {
    rationale = `${rationale} The program's owner states the same target in the source — stated there, not read from the code: ${statedLines(stated.binding)}.`;
  } else if (stated && stated.contradictory) {
    rationale = `${rationale} The requirements stated in the source contradict each other — ${statedLines(stated.sides['side-by-side'])} name side-by-side, ${statedLines(stated.sides['on-stack'])} name on-stack — so they set no target, and the route stays with the code.`;
  } else if (stated && stated.soft.length > 0) {
    rationale = `${rationale} The source names a target without binding it — ${stated.soft.map((r) => `${r.target} in ${citeStatement(r, false)}`).join(', ')} — which sets no route.`;
  }

  const targetArtifact = keyUser?.recommended
    ? 'Key-user extensions (configured in the system, no code)'
    : routeBtp ? 'CAP Node.js / Java Application' : 'RAP Business Object';
  const statedSideSentence = stated && followStatedSide
    ? `a requirement stated in the source, not read from the code: ${statedLines(stated.binding)}`
    : '';

  // 3. Build checkpoints
  const checkpoints: DecisionCheckpoint[] = [
    {
      checkpointName: 'Standard Process Fit',
      question: 'Can this requirement be covered by standard SAP Fiori / S/4HANA features?',
      /**
       * This step answered "Yes, code reads standard tables only" from nothing
       * but the absence of writes — a sentence that was false for every program
       * that writes no table and reads none either, and an answer to a question
       * about the *business requirement* derived from a technical count
       * (CR-04). Whether SAP standard already covers the
       * capability is what the standard-coverage analysis asks, with evidence
       * levels and a counter-check; this router has no input that could answer
       * it. So it reports what it did measure and leaves the question open
       * rather than answering it by proxy.
       */
      evaluation: `Not determined here. What this step can see is the code, and the code performs ${writeSummary}. Whether SAP standard already covers the requirement is a question about the business capability — the standard-coverage analysis answers it against scope items, with its own evidence.`,
      resultState: 'Neutral',
      cleanCoreImpact: 'Zero modification where standard covers the process — whether it does is not established by this step.'
    },
    {
      checkpointName: legacyRule ? 'Key User Extensibility (Tier 3)' : 'Key User Extensibility',
      question: 'Can the extension be implemented using low-code/no-code Key User tools?',
      // From 3.0.19 (`KEY_USER_FROM`): what the engine read of the key-user
      // candidates, part by part, instead of a sentence that holds for every program.
      evaluation: keyUser
        ? keyUserEvaluation(keyUser, coverageIncomplete ? unassessedSummary || 'part of the code' : null)
        : findings.length === 0 && coverageIncomplete
        ? `Not established. No pattern was found, but ${unassessedSummary || 'part of the code'} was not assessed by any detector \u2014 feasibility cannot be judged from what was not read.`
        : findings.length === 0
          ? 'No blocker found: the code shows no database write, external integration or other legacy pattern. Whether its logic can be expressed with Key User tools is not assessed by the engine.'
          : `Not indicated. The code contains ${presentCategories}, which Key User tools do not cover as it stands. Whether the requirement could be re-expressed with them is not assessed by the engine.`,
      // Neutral in every case. A finding count says whether a blocker was seen,
      // not whether the logic fits the low-code tools: no findings is not
      // "trivially feasible", and one finding of any kind is not "infeasible".
      // The impact below is what the
      // track offers, not a property of the analysed code (c658f64f147e).
      resultState: keyUser?.recommended ? 'Key-User Preferred' : 'Neutral',
      cleanCoreImpact: keyUser?.recommended
        ? 'Upgrade-stable by construction where every candidate is released for key-user use in the target edition: a key-user extension uses SAP’s key-user extension points. The score measures the code as it stands, not the key-user extension that replaces it.'
        : keyUser && keyUser.scope === 'partial'
        ? 'The key-user parts are upgrade-stable by construction where each candidate is released for key-user use; the code part reaches the level of the route it is built on.'
        : 'Target property of Key User extensions: they use released extension points only. Not established for the analysed code.'
    },
    {
      checkpointName: legacyRule ? 'In-App Developer Extensibility (Tier 1)' : 'In-App Developer Extensibility (ABAP Cloud)',
      question: 'Is the logic compatible with strict ABAP Cloud (RAP) on the S/4HANA stack?',
      evaluation: (needsBtp
        ? `Partial compatibility. What was found — ${btpTriggerList} — cannot run unchanged on the strict ABAP Cloud stack and has to be replaced or decoupled.${standardWritesAlwaysNamed ? standardWritesTooSentence : ''}${commitSentence}`
        : standardWritesOnStack
        ? `Partial compatibility. ${standardWrites.length} direct write(s) to SAP standard tables cannot run unchanged on ABAP Cloud; they have to be replaced by ${standardWriteRemedy}.${commitSentence}`
        : onStackRework
        ? `Partial compatibility. What was found — ${reworkList} — does not run unchanged on ABAP Cloud${reworkCheckpoint}`
        : 'High compatibility. Standard reads and helper logic can be directly modernized using RAP CDS views and classes.')
        + (followStatedSide ? ` The target is set off the stack by ${statedSideSentence}.` : ''),
      resultState: routeBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
      cleanCoreImpact: legacyRule
        ? 'Target: clean core compliant once the code uses released APIs only (Tier 1). Not established for the analysed code.'
        : 'Target: clean core level A (ABAP Cloud) once the code uses released APIs only. Not established for the analysed code.'
    },
    {
      checkpointName: `Side-by-Side Extensibility (${BTP} CAP)`,
      question: 'Does the extension require external persistency, non-ABAP runtime, or decoupling?',
      evaluation: needsBtp
        ? `Required by the evidence that chose this route: ${btpTriggerList}.`
        : followStatedSide
        ? `Required by ${statedSideSentence}. Nothing the engine read in the code requires a separate ${BTP} runtime.`
        // From 3.0.18: not "simple reads" for a program that writes SAP's tables (`READ_CLAIMS_FROM`).
        : readClaims && standardWrites.length > 0
        ? `Optional. Nothing found requires a separate ${BTP} runtime, and none would make the ${standardWrites.length} direct write(s) to SAP standard tables valid: each is replaced by ${standardWriteRemedy} on either track${onStackRework ? `; what else was found — ${reworkList} — is replaced on-stack` : ''}.`
        : onStackRework
        ? `Optional. Nothing found requires a separate ${BTP} runtime; what was found — ${reworkList} — is replaced on-stack.`
        : `Optional. Simple reads do not justify the architectural overhead of a separate ${BTP} runtime.`,
      resultState: routeBtp ? 'Side-by-Side Preferred' : 'In-App Preferred',
      cleanCoreImpact: 'Target: decoupled from the S/4HANA core, with its own lifecycle. Not established for the analysed code.'
    }
  ];

  // 4. Build Comparative Track Analysis
  /**
   * A core modification blocks both tracks, and the report used to rate them
   * anyway.
   *
   * `modifications` is not part of `needsBtp` — nothing about a modification
   * says the requirement belongs off-stack — so a source whose only finding was
   * a modification marker came out as In-App, "Highly Compatible", "Excellent
   * fit", target RAP Business Object, in the same report whose rationale said no
   * cloud target is reachable until the modification is reset via SPAU.
   * The
   * route stays: it is where the requirement goes once the modification is
   * gone. What cannot stay is a positive feasibility rating for code that today
   * lives inside SAP's own program — so both tracks report the blocker, and the
   * assumptions say what the route describes.
   */
  const modificationBlocks = modifications.length > 0;

  const inAppABAPCloud: ComparativeTrack = {
    technicalFeasibility: modificationBlocks ? 'Incompatible' : needsBtp || standardWritesOnStack || onStackRework ? 'Partially Compatible' : 'Highly Compatible',
    fitDetails: modificationBlocks
      ? `Not reachable as it stands. ${modifications.length} core modification(s) sit inside SAP standard code and have to be reset via SPAU before any ABAP Cloud target applies.`
      : needsBtp
      ? `Requires refactoring: ${btpTriggerList} must be replaced with released APIs or decoupled.${standardWritesAlwaysNamed ? standardWritesTooSentence : ''}`
      : standardWritesOnStack
      ? `Requires refactoring: ${standardWrites.length} direct write(s) to SAP standard tables must be replaced by ${standardWriteRemedy}.`
      : onStackRework
      ? reworkFit
      : 'Excellent fit. On-stack RAP execution provides high performance and direct access to standard released views.',
    pros: [
      'High-performance database access (local reads)',
      'Direct integration with SAP GUI / Fiori Launchpad',
      'No latency or external networking overhead'
    ],
    cons: [
      'Increases memory load on S/4HANA application server',
      legacyRule
        ? 'Requires Tier-2 wrapping if unreleased APIs are needed'
        : deploymentModel === 'public'
        ? 'Uses released APIs only: where SAP has released none, an influence request to SAP is the way forward'
        : 'Where an API is not released, needs a wrapper plus an influence request to SAP'
    ]
  };

  const sideBySideBTP: ComparativeTrack = {
    // A stated side-by-side target next to direct writes to SAP standard tables is not highly compatible: a service on
    // BTP cannot write SAP's tables either, and each write is replaced first.
    // From 3.0.18 (`READ_CLAIMS_FROM`) the same holds whatever chose the route: the track was "Highly Compatible", and
    // with no driver "feasible … for simple read-only reports", next to a write to SAP's tables.
    technicalFeasibility: modificationBlocks
      ? 'Incompatible'
      : (followStatedSide || readClaims) && standardWrites.length > 0 ? 'Partially Compatible' : 'Highly Compatible',
    fitDetails: modificationBlocks
      ? 'Not reachable as it stands either. Code that was inserted into an SAP program cannot be moved off the stack before it is removed from it.'
      : needsBtp
      // What chose the route, not a claim that CAP persistence is needed or an
      // isolation design exists.
      ? `Recommended route: what was found (${btpTriggerList}) points off the ABAP Cloud stack. Whether the extension needs its own persistence on ${BTP}, and how it is decoupled, is a design decision this analysis does not establish.${readClaims && standardWrites.length > 0 ? ` First, the ${standardWrites.length} direct write(s) to SAP standard tables are replaced by ${standardWriteRemedy}: a side-by-side service cannot write SAP's tables either.` : ''}`
      : readClaims && !followStatedSide && standardWrites.length > 0
      ? `Not the recommended route: no construct in the code points off the ABAP Cloud stack. Moving off the stack does not fix the ${standardWrites.length} direct write(s) to SAP standard tables either: a side-by-side service cannot write SAP's tables, so each is replaced by ${standardWriteRemedy} on either track.`
      : followStatedSide
      ? `Recommended route: set by ${statedSideSentence}; no construct in the code points off the ABAP Cloud stack. Whether the extension needs its own persistence on ${BTP}, and how it is decoupled, is a design decision this analysis does not establish.${standardWrites.length > 0 ? ` First, the ${standardWrites.length} direct write(s) to SAP standard tables are replaced by ${standardWriteRemedy}: a side-by-side service cannot write SAP's tables either.` : ''}`
      : 'Feasible, but introduces architectural overhead for simple read-only reports.',
    pros: [
      'Maximizes upgrade readiness and isolates extensions',
      'Supports modern web runtimes (Node.js, Java, Python)',
      'Decoupled scaling and independent lifecycle management'
    ],
    cons: [
      'Network latency for database queries (OData overhead)',
      `Requires separate licensing for ${BTP} runtimes`
    ]
  };

  // 5. Calculate evidence counts
  const supportingFindings = needsBtp
    ? legacyRule
      ? customWrites.length + bdcCalls.length + rfcCalls.length + nativeSql.length + (guiFileRule ? fileAccess.length : 0) + (deploymentModel === 'public' ? standardWrites.length : 0)
      // From 3.0.12 the one driver is an RFC call to another system.
      : outboundRfc.length
    // A route set by a stated requirement has no finding behind it.
    : followStatedSide
    ? 0
    : standardReads.length;

  const evidenceCounts = {
    totalFindings: findings.length,
    criticalFindings: findings.filter(f => f.severity === 'Critical').length,
    supportingFindings,
  };

  // 6. Generate context-sensitive assumptions
  const assumptions: string[] = [];
  // "Tier" is the vocabulary of the three-tier extensibility model, which
  // SAP's clean core level concept (levels A–D, 2025) replaced. From
  // 3.0.12 the router speaks in levels and says "a wrapper plus an influence
  // request to SAP" — never that a wrapper makes what it wraps upgrade-stable,
  // because it does not. Runs of an earlier engine keep their words, so a
  // signed report re-renders unchanged (`ON_STACK_CONSTRUCTS_FROM`).
  if (legacyRule) {
    assumptions.push(
      deploymentModel === 'public'
        ? 'S/4HANA Public Cloud deployment model selected — no Tier-2 unreleased API access available.'
        : 'S/4HANA Private Cloud deployment model selected — Tier-2 unreleased API wrapping is available.',
    );
  } else {
    assumptions.push(
      deploymentModel === 'public'
        ? readClaims ? PUBLIC_TARGET_RULE_ASSUMPTION : PUBLIC_TARGET_ASSUMPTION
        : 'SAP Cloud ERP Private selected as the target — where an API is not released, a wrapper plus an influence request to SAP is available.',
    );
  }
  if (modificationBlocks) {
    assumptions.push(`The recommended route is where the requirement goes once the ${modifications.length} core modification(s) have been reset to SAP standard. Until then neither track is reachable: the code runs inside SAP's own program.`);
  }
  if (standardWrites.length > 0 && (!needsBtp || standardWritesAlwaysNamed)) {
    // A wrapper ("Tier 2" before 3.0.12) wraps an unreleased SAP object so ABAP Cloud may *use* it. It does
    // not turn a direct modification of SAP's rows into a supported operation,
    // and this line told the reader it did (dbbc1bf8f01d and its three carries).
    //
    // From 3.0.12 the line says "wrapper", not "Tier-2 wrapper": the level
    // concept replaced the three-tier model (DSAG guide, solution-approach.md
    // "Level Concept"), and the Public Edition, which reaches this line from
    // 3.0.12 on, has no wrapper at all (`ON_STACK_CONSTRUCTS_FROM`).
    assumptions.push(
      legacyRule
        ? 'Direct writes to SAP standard tables are replaced with a released write API, a BAPI or a RAP action. A Tier-2 wrapper may encapsulate an unreleased object for use; it does not make a direct write supported.'
        : deploymentModel === 'public'
        ? `Direct writes to SAP standard tables are replaced with ${standardWriteRemedy}.`
        : `Direct writes to SAP standard tables are replaced with ${standardWriteRemedy}. A wrapper may encapsulate an unreleased object for use; it does not make a direct write supported.`,
    );
  }
  if (outboundRfc.length > 0) {
    assumptions.push('RFC destinations are not yet migrated to SAP Integration Suite or Event Mesh.');
  }
  // From 3.0.12 custom tables stay on-stack in both editions, so there is
  // nothing to decouple and the line would contradict the rationale.
  if (legacyRule && customWrites.length > 0) {
    assumptions.push(`Custom table persistence is not yet decoupled into an ${BTP}-managed database or CAP service.`);
  }
  if (bdcCalls.length > 0) {
    // From 3.0.13 (`PRECISION_FIXES_FROM`) the assumption is about this
    // program, not about SAP: the rationale names the released API that
    // replaces BDC, so "no replacement" contradicted it.
    assumptions.push(precisionFixesApply(engineVersion)
      ? 'The BDC screen automations of this program are not yet replaced; what replaces them is said in the rationale.'
      : 'BDC screen automations have no equivalent Fiori/API-based replacement yet.');
  }
  if (findings.length === 0 && includesNotRead.length > 0) {
    assumptions.push(`Part of the program was not read: the engine did not assess ${unassessedSummary} — the score and the route below describe the part that was read, not the whole object, and finding nothing there is not a clean result.`);
  } else if (findings.length === 0 && coverageIncomplete) {
    assumptions.push(`No legacy pattern was found, but the engine did not assess ${unassessedSummary} \u2014 the score and the route below describe the part that was read, not the whole object.`);
  } else if (findings.length === 0) {
    assumptions.push('No legacy patterns detected \u2014 code may already be partially modernized or very simple.');
  }
  if (coverageIncomplete && findings.length > 0) {
    assumptions.push(`Beyond the findings, the engine did not assess ${unassessedSummary}.`);
  }
  if (stated && stated.target) {
    assumptions.push(`The requirements stated in the source (${statedLines(stated.binding)}) are taken as written: the engine reads them, it does not verify that they are current or approved.`);
  }

  const statedBasis: StatedRouteBasis | null = stated && (stated.target || stated.contradictory || stated.soft.length > 0)
    ? {
        target: stated.target,
        followed: followStatedSide,
        conflict: statedConflict,
        contradictory: stated.contradictory,
        items: (stated.target ? stated.binding : stated.contradictory ? [...stated.sides['side-by-side'], ...stated.sides['on-stack']] : stated.soft)
          .slice()
          .sort((a, b) => a.lineStart - b.lineStart)
          .map(({ label, lineStart, lineEnd, target, binding }) => ({ label, lineStart, lineEnd, target, binding })),
      }
    : null;

  return {
    recommendedRoute,
    confidenceScore: Math.max(30, confidenceScore - confidencePenalty),
    rationale,
    targetArtifact,
    // The score describes what was read. A construct no detector claims cannot
    // count towards a clean result, so an incomplete reading costs the score
    // rather than flattering it: five points per unassessed kind, capped at 30,
    // which is enough that "100 %" never comes out of a file nobody assessed.
    //
    // The floor is the global one. Written as `Math.max(50, …)` the penalty had
    // a floor of its own, and a floor above the scores it was applied to: a
    // heavily legacy program deducted to 25 with two unassessed kinds was
    // published at 50, twice the score, for knowing less about it. A penalty
    // that raises the number is not a penalty.
    cleanCoreScore: coverageIncomplete
      ? scoreWithUnassessed(score, coverage?.gaps.length || 0)
      : score,
    checkpoints,
    comparativeAnalysis: {
      inAppABAPCloud,
      sideBySideBTP
    },
    evidenceCounts,
    assumptions,
    ...(statedBasis ? { statedRequirements: statedBasis } : {}),
    ...(keyUser ? { keyUser } : {}),
  };
}

/** The key-user checkpoint's evaluation from 3.0.19: the reading, then what keeps each other part in code. */
function keyUserEvaluation(keyUser: KeyUserRouteBasis, unassessed: string | null): string {
  const reasons = keyUser.rejected.slice(0, 4).map((r) => `${r.id}: ${r.reason}`).join(' ');
  const more = keyUser.rejected.length > 4 ? ` … ${keyUser.rejected.length - 4} more.` : '';
  if (keyUser.recommended) {
    return `Indicated for the whole program. ${keyUser.sentence} Each candidate holds only once its limit is checked in the target system.`;
  }
  if (keyUser.scope === 'partial') return `Indicated in part. ${keyUser.sentence}${reasons ? ` ${reasons}${more}` : ''}`;
  // What no detector read is neither a candidate nor a part that stays code
  // (roadmap 0.18): the reading of the parts that
  // were read stands, and the rest is named as not assessed. A partial reading's
  // sentence says so itself (`key-user-candidates.ts`); a reading with no
  // candidate did not.
  const unread = unassessed
    ? ` Not established for what was not read: ${unassessed} was not assessed by any detector, and feasibility cannot be judged from what was not read.`
    : '';
  return `Not indicated. ${keyUser.sentence}${reasons ? ` ${reasons}${more}` : ''}${unread}`;
}
