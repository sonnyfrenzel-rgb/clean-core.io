/**
 * The reference corpus against the engine — the comparison layer.
 *
 * The corpus and the engine do not speak the same language. The corpus works
 * with rule numbers (`R01@1.0.0`), one clean core level A–D per artefact, SAP
 * objects with owner and usage, a process skeleton with node types, and
 * business statements. Of that, `lib/abap/` knows: findings with a `kind` mark
 * and a start line, a data coupling over table names, branches and blocks, and
 * — in a *different* module that is not attached to the evidence report — a
 * catalogue grade A–D per object.
 *
 * So the comparison is not of "the case" but separate per **statement class**,
 * and each class says on its own whether it is comparable at all. A class for
 * which the engine has no counterpart is `nicht-vergleichbar` (not comparable)
 * — that is neither a fault of the corpus nor a fault of the engine, but a
 * statement about the state of phase 2, and it is counted as such.
 *
 * What deliberately does *not* happen here: the expected answers are not
 * reinterpreted to make them fit. Where the mapping is an interpretation — and
 * the rule-to-`kind` table below is one — it sits in one place, visible and
 * with its reason, instead of being spread across comparisons.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { buildAbapEvidence, type AbapEvidenceReport, type EvidenceKind } from '../../lib/abap/evidence-model';
import type { CoverageGap } from '../../lib/abap/coverage';
import { extractDataCoupling } from '../../lib/abap/code-assessment';
import { routeExtensibility } from '../../lib/abap/extensibility-router';
import { buildProcessFacts, type ProcessFacts } from '../../lib/abap/process-facts';
import {
  buildProcessSkeleton,
  type ProcessSkeleton,
  type SkeletonEdgeKind,
  type SkeletonNodeKind,
} from '../../lib/abap/process-skeleton';
import { readStatements, type AbapStatement } from '../../lib/abap/statement-reader';
import { buildBusinessStatements } from '../../lib/abap/business-statement';
import { gradeSapObjectUse } from '../../lib/abap/catalog-service';
import {
  objectUseFromAccess,
  worstGrade,
  type CloudReadinessGrade,
  type ObjectUse,
} from '../../lib/abap/abcd-classification';

/**
 * The bundle. `KORPUS_ROOT` can be overridden so the same comparison can run
 * against an older bundle without swapping it in the tree — that way the
 * difference between two versions of the case book comes from two runs of the
 * same code and not from two recollections.
 */
export const KORPUS_ROOT = process.env.KORPUS_ROOT ?? join(process.cwd(), 'tests/korpus');

// ---------------------------------------------------------------------------
// The bundle
// ---------------------------------------------------------------------------

export interface KorpusAnchor {
  file: string | null;
  line: number | null;
  token: number | null;
  expressionPath: string | null;
  raw: string;
}

export interface KorpusFinding {
  id: string;
  rule: string | null;
  ruleVersion: string | null;
  ruleRaw: string | null;
  anchor: KorpusAnchor | null;
  severity: string | null;
  statement: string | null;
  sources: string[];
  profiles: string[] | null;
}

export interface KorpusObject {
  name: string | null;
  owner: string | null;
  usage: string | null;
  anchor: KorpusAnchor | null;
  identity: { objectType?: string; tadirObject?: string; objectKey?: string } | null;
  successors: unknown[] | null;
  successorStatus: string | null;
}

export interface KorpusExpected {
  id: string;
  title: string | null;
  classes: string[];
  classic_level: string | null;
  known_worst_level: string | null;
  cloud_api_surface: string | null;
  beleggrad: string | null;
  independence: string[];
  findings: KorpusFinding[];
  securityFindings: KorpusFinding[];
  objects: KorpusObject[];
  businessStatements: Array<{ id: string; text: string | null; anchors: KorpusAnchor[] }>;
  skeleton: {
    nodes: Array<{
      id: string;
      type: string | null;
      anchor: KorpusAnchor | null;
      meaning: string | null;
      /**
       * The fields that 2.15 (gateway class), 2.16 (lane) and 2.17
       * (parallelism) will fill. Today none of the 68 `expected.json` files
       * carries any of them; they are read anyway so the comparer turns red as
       * soon as a case carries one and the engine does not deliver it — and so
       * that until then the facet says "not checked" instead of `agree`
       * (CR-05).
       */
      gatewayClass?: string | null;
      parallel?: boolean | null;
      lane?: string | null;
    }>;
    edges: Array<{ from: string; to: string; condition: string | null }>;
    /** 2.16: lanes with proof. Set in no case today. */
    lanes?: Array<{ id: string; evidence?: string | null; anchor?: KorpusAnchor | null }> | null;
  };
  /**
   * The case book's explicitly **forbidden** statements (roadmap 17.9).
   *
   * 47 of the 68 cases carry this field, 197 sentences in all; until
   * 23.09.2026 nobody read it. It is the only expected value in the corpus
   * that says what the code does **not** support at a given place — and so
   * the only basis on which invention can be measured without punishing
   * thoroughness (see `compareBusinessStatements`, part 4).
   */
  forbiddenConclusions?: string[] | null;
  declaredEmpty: { findings: boolean; objects: boolean };
  expectedByProfile: Array<{ label: string; classic_level?: string }> | null;
}

export interface KorpusProfile {
  edition?: string | null;
  abap_language_version?: string | null;
  profiles?: Array<{ label: string; edition: string | null; abap_language_version: string | null }>;
}

export interface KorpusCase {
  id: string;
  expected: KorpusExpected;
  profile: KorpusProfile;
  sources: Array<{ name: string; code: string; lineCount: number }>;
}

export interface KorpusManifest {
  book: { path: string; sha256: string; caseCount: number };
  cases: Array<{ id: string; files: Array<{ name: string; sha256: string }> }>;
}

export function readManifest(): KorpusManifest {
  return JSON.parse(readFileSync(join(KORPUS_ROOT, 'manifest.json'), 'utf8')) as KorpusManifest;
}

export function readCases(): KorpusCase[] {
  const manifest = readManifest();
  return manifest.cases.map((entry) => {
    const dir = join(KORPUS_ROOT, 'cases', entry.id);
    const sources = readdirSync(dir)
      .filter((name) => name.endsWith('.abap'))
      .sort()
      .map((name) => {
        const code = readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n');
        return { name, code, lineCount: code.split('\n').length - 1 };
      });
    return {
      id: entry.id,
      expected: JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as KorpusExpected,
      profile: JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8')) as KorpusProfile,
      sources,
    };
  });
}

// ---------------------------------------------------------------------------
// The interpretation this comparison needs — in one place
// ---------------------------------------------------------------------------

/**
 * Corpus rule -> engine finding mark, **at a named construct**.
 *
 * The engine assigns no rule numbers (`EvidenceFinding` has no `rule` field
 * and no rule version); its stable identity is `kind`. Mapping a rule onto a
 * mark is therefore not enough: in the corpus R25 (LUW) covers
 * `IN UPDATE TASK`, `COMMIT WORK`, `ROLLBACK WORK`, `BAPI_TRANSACTION_COMMIT`
 * and the implicit commits — of those, the engine knows exactly two marks.
 * Counting an expected finding at `ROLLBACK WORK` as "missed by the engine"
 * would be wrong: the engine does not carry that statement, it does not miss
 * it.
 *
 * A bridge therefore only applies when the **ABAP statement at the anchor**
 * carries the named construct. That is a look at the source, not at the prose
 * of the expected statement, and so it can be checked. If no bridge finds a
 * construct, the expected finding is `nicht-vergleichbar` — counted, not missed.
 */
export interface RuleBridge {
  rule: string;
  /**
   * Engine finding marks — or, as `gap:<gap>`, a place the engine explicitly
   * carries as *not determined* (`coverage.unassessed`). An expected statement
   * "this is not known" (R16) has no finding counterpart in the engine and
   * should not have one: an include that was not read is not a defect of the
   * code but a limit of the answer. The engine naming that limit at the same
   * statement is the same statement.
   */
  kinds: EngineMark[];
  construct: RegExp;
  /** Why the engine means the same thing here. */
  why: string;
}

/** A finding mark, or a place the engine carries as not determined. */
export type EngineMark = EvidenceKind | `gap:${CoverageGap}`;

export const RULE_BRIDGES: RuleBridge[] = [
  {
    rule: 'R01',
    kinds: ['standard-table-read'],
    construct: /\bSELECT\b/i,
    why: 'Direct read of an SAP object; the engine reports the same SELECT as standard-table-read.',
  },
  {
    rule: 'R01',
    kinds: ['standard-table-read'],
    construct: /\bGET\s+(?!BADI|TIME|PARAMETER|RUN|BIT|CURSOR|REFERENCE|LOCALE|DATASET|PF-STATUS|PROPERTY)\w/i,
    why:
      'Read through a logical database. R01 condition (c) refers LDB reads to R33, and R33 says that ' +
      '`GET <node>` receives the record per event — the SELECT runs in the LDB, not in this source. That is ' +
      'exactly what the engine reports at the GET: a standard-table-read via the route logical-database, with that ' +
      'sentence in its reason. The exception list keeps out the other GET statements that are not LDB nodes ' +
      '(GET BADI, GET TIME, GET PARAMETER …).',
  },
  {
    rule: 'R02',
    kinds: ['standard-table-write'],
    construct: /\b(INSERT|UPDATE|MODIFY|DELETE)\b/i,
    why: 'Direct write to an SAP table; the engine reports the same DML as standard-table-write.',
  },
  {
    rule: 'R13b',
    kinds: ['native-sql'],
    construct: /(EXEC\s+SQL|cl_sql_statement|execute_update|execute_query)/i,
    why: 'Literal with consumers — of the consumer classes of the rule, the engine knows only Native SQL and ADBC.',
  },
  {
    rule: 'R16',
    kinds: ['gap:include-not-read'],
    construct: /^\s*INCLUDE\s+(?!STRUCTURE\b|TYPE\b)[\w/]+/i,
    why:
      'Unresolved customer dependency at a program include: the text of the include is not available, so its ' +
      'behaviour must not be presented as known. The engine carries exactly that at the same statement as not ' +
      'determined (coverage gap include-not-read: "Include … was not uploaded — what it does is not ' +
      'determined"). INCLUDE STRUCTURE/TYPE is a type component (R29), not an include in this sense.',
  },
  {
    rule: 'R25',
    kinds: ['update-task'],
    construct: /\bIN\s+UPDATE\s+TASK\b/i,
    why: 'Registration with the update task; the engine carries the mark update-task for it.',
  },
  {
    rule: 'R25',
    kinds: ['commit-work'],
    construct: /\bCOMMIT\s+WORK\b/i,
    why: 'Explicit transaction boundary; the engine carries the mark commit-work for it.',
  },
  {
    rule: 'R28',
    kinds: ['authority-check'],
    construct: /\bAUTHORITY-CHECK\b/i,
    why: 'Of the security statement class, the engine knows exactly the AUTHORITY-CHECK — not injection, not PRIVILEGED ACCESS, not CLIENT SPECIFIED.',
  },
  {
    rule: 'R32',
    kinds: ['enhancement', 'modification'],
    construct: /(ENHANCEMENT|CALL\s+CUSTOMER-FUNCTION|CL_EXITHANDLER|GET\s+BADI)/i,
    why: 'Host context at a syntactic marker; the engine reads the same markers as enhancement or modification.',
  },
  {
    rule: 'R34',
    kinds: ['submit'],
    construct: /\bSUBMIT\b/i,
    why: 'Cross-program call via SUBMIT; the engine carries the mark submit for it.',
  },
  {
    rule: 'R34',
    kinds: ['bdc'],
    construct: /\bCALL\s+TRANSACTION\b/i,
    why: 'Batch input via CALL TRANSACTION; the engine carries the mark bdc for it.',
  },
  {
    rule: 'R34',
    kinds: ['rfc-call'],
    construct: /\bDESTINATION\b/i,
    why: 'System boundary via an RFC with a destination; the engine carries the mark rfc-call for it.',
  },
];

/**
 * Which engine finding marks occur in a bridge at all. Only these count as a
 * contradiction in the negative controls; a `hardcoded-value` in CC-016 would
 * not violate "no findings in the v1 rule contract", because the contract
 * does not carry that statement.
 */
const MAPPED_KINDS = new Set<EngineMark>(RULE_BRIDGES.flatMap((bridge) => bridge.kinds));
const BRIDGED_RULES = new Set(RULE_BRIDGES.map((bridge) => bridge.rule));

/**
 * Usage in the corpus -> access type of the data coupling. Only table objects
 * (`objectType: 'TABL'`) are compared: that is the surface `extractDataCoupling`
 * models. A function module, a BAdI or a message class is an object in the
 * corpus, but not in the same list in the engine — that is not comparable,
 * not missing.
 */
const USAGE_TO_ACCESS: Record<string, 'Read' | 'Write'> = {
  read: 'Read',
  join_read: 'Read',
  ldb_read: 'Read',
  read_privileged: 'Read',
  read_cross_client: 'Read',
  read_authentication_data: 'Read',
  write: 'Write',
  customer_table_write: 'Write',
  write_native_sql: 'Write',
  write_native_sql_via_adbc: 'Write',
};

/** The deployment the engine is run with — from the case's target profile. */
export function deploymentOf(profile: KorpusProfile): 'public' | 'private' {
  const first = profile.profiles && profile.profiles.length > 0 ? profile.profiles[0] : profile;
  const edition = (first.edition ?? '').toLowerCase();
  const language = (first.abap_language_version ?? '').toLowerCase();
  return edition.includes('btp') || language.includes('cloud') ? 'public' : 'private';
}

// ---------------------------------------------------------------------------
// One engine run over one case
// ---------------------------------------------------------------------------

export interface EngineReading {
  perFile: Array<{
    file: string;
    evidence: AbapEvidenceReport;
    facts: ProcessFacts;
    /**
     * The **real** process skeleton from `lib/abap/process-skeleton.ts`.
     *
     * Until 1.9 only `facts` stood here, and `compareSkeleton` compared line by
     * line against branches and blocks — neither node kind nor edge. A comparer
     * that never calls the skeleton cannot catch a change to the skeleton;
     * that is exactly the purpose of this facet, and exactly what 2.15, 2.16
     * and 2.17 build on.
     */
    skeleton: ProcessSkeleton;
    statements: AbapStatement[];
    tables: Array<{ name: string; access: string; custom: boolean }>;
  }>;
  /** All object names the engine saw across the whole case. */
  objectNames: Set<string>;
  /**
   * The worst grade across all objects seen — per object the grade the
   * analysis panel shows for the same object: `gradeSapObjectUse` with the
   * access type from `extractDataCoupling`, the same function and the same
   * input as `/api/abcd-classify`. A name that only a finding mentions has no
   * access type and gets the grade of its name.
   *
   * The roll-up rule itself (`worstGrade`) is a construct of this comparison:
   * the product shows no overall grade for a program, only one grade per row
   * and their distribution.
   */
  worst: CloudReadinessGrade;
  /** Only as a sign of life: the route has no counterpart in the corpus. */
  routeCount: number;
  /**
   * The business statements this run produced.
   *
   * They live here and not in the comparer, because otherwise the comparer
   * would be both: producer and judge. Since 17.7 `ENGINE_PRODUCER` hangs off
   * this seam, and nothing in the comparison itself was changed for it.
   */
  businessStatements: GeneratedStatement[];
  /** Who produced them. Appears in every piece of evidence of the `fachsaetze` facet. */
  producer: StatementProducer;
}

/**
 * An intervention in what was read, **before** comparing.
 *
 * Only for the sensitivity probe (`tests/korpus-mutation.spec.ts`): a comparer
 * that stays green on a falsified engine answer measures nothing. The
 * intervention never changes `lib/` and is not set in a normal run.
 */
export type SkeletonMutation = (skeleton: ProcessSkeleton, file: string) => ProcessSkeleton;

export function readWithEngine(
  korpusCase: KorpusCase,
  mutate?: SkeletonMutation,
  producer: StatementProducer = ENGINE_PRODUCER,
): EngineReading {
  const deployment = deploymentOf(korpusCase.profile);
  const objectNames = new Set<string>();
  const uses = new Map<string, ObjectUse>();
  let routeCount = 0;
  const perFile = korpusCase.sources.map((source) => {
    const evidence = buildAbapEvidence(source.code, source.name, deployment);
    const facts = buildProcessFacts(source.code);
    const tables = extractDataCoupling(source.code).map((entry) => ({
      name: entry.tableName.toUpperCase(),
      access: entry.accessType,
      custom: entry.isCustom,
    }));
    for (const table of tables) {
      objectNames.add(table.name);
      // Across several files, what the panel would see per file is combined:
      // a write anywhere makes the usage a write.
      const use = objectUseFromAccess(table.access);
      if (use && uses.get(table.name) !== 'write') uses.set(table.name, use);
    }
    for (const finding of evidence.findings) {
      if (finding.objectName) objectNames.add(finding.objectName.toUpperCase());
    }
    routeCount += routeExtensibility(evidence, deployment).checkpoints.length;
    const built = buildProcessSkeleton(source.code);
    const skeleton = mutate ? mutate(built, source.name) : built;
    return { file: source.name, evidence, facts, skeleton, statements: readStatements(source.code), tables };
  });
  const grades = [...objectNames].map((name) => gradeSapObjectUse(name, uses.get(name) ?? null).grade);
  const base = { perFile, objectNames, worst: worstGrade(grades), routeCount };
  return { ...base, producer, businessStatements: producer.produce(korpusCase, base) };
}

// ---------------------------------------------------------------------------
// The comparison, per statement class
// ---------------------------------------------------------------------------

export const STATEMENT_CLASSES = ['befunde', 'level', 'objekte', 'skelett', 'fachsaetze'] as const;
export type StatementClass = (typeof STATEMENT_CLASSES)[number];

export type Verdict = 'engine-defekt' | 'korpus-offen' | 'nicht-vergleichbar';

/**
 * What a facet says on its own about its own scope (roadmap 1.9).
 *
 * Before this step a statement class had only `agree`/`disagree`, and that was
 * the gap: `skelett` stood at `agree` 47 times while across those cases
 * **71 of 390 expected nodes (18.2 %)** were compared at all, and `fachsaetze`
 * stood at `agree` 68 times with the reason "the engine produces no business
 * statements". A green that means "not checked" is exactly finding CR-05 of the
 * counter-review. So every facet now carries its check status:
 *
 * - `compared` — it really was compared against the engine,
 * - `not_checked` — the engine (or the case) does not carry this statement;
 *   that must never lead to `agree`,
 * - `anchor_validation_passed` — **only** checked that the anchors point into
 *   the source. A syntactic anchor check is no statement about the content,
 *   and so it gets a name of its own instead of a green.
 */
export type AspectStatus = 'compared' | 'not_checked' | 'anchor_validation_passed';

export interface FacetAspect {
  /** The name of the sub-check, as the roadmap names it. */
  name: string;
  status: AspectStatus;
  /** Numerator and denominator: how much of what the case claims was checked. */
  compared: number;
  total: number;
  /** Why the status is what it is. For `not_checked`, the place that resolves it. */
  note: string;
}

export interface ClassResult {
  case: string;
  class: StatementClass;
  state: 'agree' | 'disagree';
  /** Set only on `disagree` — the reason the ratchet records. */
  verdict: Verdict | null;
  /**
   * The facet's numerator and denominator: how many expected statements of
   * this class were comparable at all, out of how many. `agree` below half is
   * forbidden in `skelett` (1.9).
   */
  scope: { compared: number; total: number };
  /** The sub-checks of this facet, each with its own status and denominator. */
  aspects: FacetAspect[];
  /**
   * What was actually compared, in numbers and examples. Still German, like
   * every facet `note`: both are stored verbatim in `tests/korpus/baseline.json`
   * (`reason`, `aspects`), and the ratchet compares them character for character.
   */
  evidence: string;
}

/** The core of a result; scope and facet status come from `done`. */
type ClassCore = Omit<ClassResult, 'scope' | 'aspects'>;

const GRADE_ORDER: CloudReadinessGrade[] = ['A', 'B', 'C', 'D'];

function levelRank(level: string | null): number {
  if (!level) return -1;
  const first = level.trim().charAt(0).toUpperCase();
  const index = GRADE_ORDER.indexOf(first as CloudReadinessGrade);
  return index;
}

/** The ABAP statement whose line range contains an anchor line. */
function statementAt(statements: AbapStatement[], line: number): AbapStatement | null {
  return statements.find((s) => s.lineStart <= line && line <= s.lineEnd) ?? null;
}

/**
 * A sub-check with numerator and denominator. Without a denominator a status
 * is a claim: "checked" says nothing as long as it stays open of what.
 */
function facet(name: string, compared: number, total: number, note: string, status?: AspectStatus): FacetAspect {
  return { name, status: status ?? (compared > 0 ? 'compared' : 'not_checked'), compared, total, note };
}

function sample(items: string[], limit = 4): string {
  if (items.length === 0) return '—';
  const head = items.slice(0, limit).join(', ');
  return items.length > limit ? `${head} … (+${items.length - limit})` : head;
}

function compareFindings(korpusCase: KorpusCase, reading: EngineReading): ClassResult {
  const expected = [...korpusCase.expected.findings, ...korpusCase.expected.securityFindings];
  const byFile = new Map(reading.perFile.map((entry) => [entry.file, entry]));
  const scope = { compared: 0, total: expected.length };
  const aspects: FacetAspect[] = [];
  const done = (core: ClassCore): ClassResult => ({
    ...core,
    scope: { ...scope },
    aspects:
      aspects.length > 0
        ? aspects
        : [
            facet(
              'regelbruecke',
              scope.compared,
              scope.total,
              'Ein Sollbefund ist vergleichbar, wenn eine Regelbrücke greift und die Anweisung am Anker ihr Konstrukt trägt.',
            ),
          ],
  });

  const engineMapped: string[] = [];
  for (const entry of reading.perFile) {
    for (const finding of entry.evidence.findings) {
      if (MAPPED_KINDS.has(finding.kind)) engineMapped.push(`${entry.file}:${finding.lineStart} ${finding.kind}`);
    }
  }

  // Negative control: the case says in words that there is no finding.
  if (korpusCase.expected.declaredEmpty.findings) {
    const state = engineMapped.length === 0 ? 'agree' : 'disagree';
    scope.compared = 1;
    scope.total = 1;
    aspects.push(
      facet('negativkontrolle', 1, 1, 'Der Fall erklärt „keine Befunde"; geprüft wird, ob die Engine schweigt.', 'compared'),
    );
    return done({
      case: korpusCase.id,
      class: 'befunde',
      state,
      verdict: state === 'agree' ? null : 'engine-defekt',
      evidence:
        `Negativkontrolle: der Fall erklärt „keine Findings im endlichen Regelvertrag". ` +
        `Die Engine meldet ${engineMapped.length} Befund(e) einer zugeordneten Marke: ${sample(engineMapped)}.`,
    });
  }

  const exact: string[] = [];
  const onlyInStatement: string[] = [];
  const missed: string[] = [];
  const notComparable: string[] = [];

  for (const finding of expected) {
    const anchor = finding.anchor;
    const file = anchor?.file ?? korpusCase.sources[0]?.name ?? '';
    const entry = byFile.get(file);
    const label = `${finding.id} ${finding.ruleRaw ?? '?'}@${anchor?.raw ?? '?'}`;
    if (!entry || anchor?.line == null || finding.rule == null || !BRIDGED_RULES.has(finding.rule)) {
      notComparable.push(`${label} — keine Brücke für ${finding.rule ?? 'Regel unbekannt'}`);
      continue;
    }
    const statement = statementAt(entry.statements, anchor.line);
    const text = statement?.text ?? '';
    const bridges = RULE_BRIDGES.filter(
      (bridge) => bridge.rule === finding.rule && bridge.construct.test(text),
    );
    if (bridges.length === 0) {
      notComparable.push(`${label} — ${finding.rule} ohne Gegenstück an „${text.slice(0, 48) || '(keine Anweisung)'}"`);
      continue;
    }
    const kinds = new Set(bridges.flatMap((bridge) => bridge.kinds));
    const from = statement?.lineStart ?? anchor.line;
    const to = statement?.lineEnd ?? anchor.line;
    const inStatement = [
      ...entry.evidence.findings,
      // A place carried as not determined counts only through a bridge that
      // names it explicitly (`gap:…`); it never counts as a finding.
      ...entry.evidence.coverage.unassessed.map((u) => ({ kind: `gap:${u.gap}` as EngineMark, lineStart: u.line })),
    ].filter((f) => kinds.has(f.kind) && f.lineStart >= from && f.lineStart <= to);
    if (inStatement.some((f) => f.lineStart === anchor.line)) exact.push(label);
    else if (inStatement.length > 0) {
      onlyInStatement.push(`${label} → Engine ${inStatement[0].kind}@${file}:${inStatement[0].lineStart}`);
    } else missed.push(`${label} erwartet ${[...kinds].join('|')} in ${file}:${from}–${to}`);
  }

  const comparable = exact.length + onlyInStatement.length + missed.length;
  scope.compared = comparable;
  const head =
    `${comparable} von ${expected.length} Sollbefunden vergleichbar; ${exact.length} auf der Ankerzeile, ` +
    `${onlyInStatement.length} nur in derselben Anweisung, ${missed.length} verfehlt.`;
  const tail = notComparable.length > 0 ? ` Ohne Gegenstück: ${sample(notComparable)}.` : '';

  if (comparable === 0) {
    return done({
      case: korpusCase.id,
      class: 'befunde',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence: `${head} Die Engine meldet an diesem Fall: ${sample(engineMapped)}.${tail}`,
    });
  }
  if (missed.length > 0) {
    return done({
      case: korpusCase.id,
      class: 'befunde',
      state: 'disagree',
      verdict: 'engine-defekt',
      evidence: `${head} Verfehlt: ${sample(missed)}. Engine an diesem Fall: ${sample(engineMapped)}.${tail}`,
    });
  }
  if (onlyInStatement.length > 0) {
    return done({
      case: korpusCase.id,
      class: 'befunde',
      state: 'disagree',
      verdict: 'korpus-offen',
      evidence:
        `${head} Die Engine sieht das Konstrukt, verankert es aber am Anweisungsbeginn: ${sample(onlyInStatement)}. ` +
        `R27 legt genau das als Primäranker fest; diese Fälle verankern stattdessen die Zeile, auf der das Objekt genannt wird. ` +
        `Das ist der Widerspruch zwischen v1-Ankerkonvention und R27, den das Fallbuch selbst benennt — die Sollangabe bleibt unverändert, die Frage geht an die Fallautoren.${tail}`,
    });
  }
  return done({ case: korpusCase.id, class: 'befunde', state: 'agree', verdict: null, evidence: `${head}${tail}` });
}

function compareLevel(korpusCase: KorpusCase, reading: EngineReading): ClassResult {
  const expected = korpusCase.expected.classic_level;
  const engine = reading.worst;
  // The class carries exactly one expected statement: the artefact's level.
  const scope = { compared: 0, total: 1 };
  const done = (core: ClassCore): ClassResult => ({
    ...core,
    scope: { ...scope },
    aspects: [
      facet(
        'artefaktlevel',
        scope.compared,
        scope.total,
        'Vergleichbar nur, wenn der Fall ein einzelnes Level nennt und die Engine überhaupt ein Objekt gesehen hat.',
      ),
    ],
  });
  const base = `Korpus ${expected ?? '(Paar)'} · Engine (schlechteste Katalognote über ${reading.objectNames.size} Objekt(e)) ${engine}`;

  if (korpusCase.expected.expectedByProfile) {
    return done({
      case: korpusCase.id,
      class: 'level',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence: `${base}. Fallpaar: die Antwort hängt am Zielprofil, und der Evidenzbericht der Engine trägt kein Profil im Schlüssel (R31).`,
    });
  }
  if (reading.objectNames.size === 0) {
    return done({
      case: korpusCase.id,
      class: 'level',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence:
        `${base}. Die Engine hat an diesem Fall kein einziges Objekt gesehen, also auch keine Note vergeben — ` +
        `die A kommt aus worstGrade([]), das für die leere Liste 'A' liefert. Zu vergleichen gibt es hier nichts; ` +
        `festzuhalten ist, dass „kein Beleg" in dieser Funktion als bestes Ergebnis herauskommt.`,
    });
  }
  const expectedRank = levelRank(expected);
  if (expectedRank < 0) {
    return done({
      case: korpusCase.id,
      class: 'level',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence:
        `${base}. Der Fall antwortet „${expected ?? '—'}" — das ist eine Aussage über die Vollständigkeit der Scheibe, ` +
        `und Vollständigkeit führt lib/abap/ nicht: der Evidenzbericht hat kein Feld, das „diese Frage ist mit dem gelieferten Code nicht entscheidbar" sagen könnte.`,
    });
  }
  scope.compared = 1;
  if (expected === engine) {
    return done({ case: korpusCase.id, class: 'level', state: 'agree', verdict: null, evidence: base });
  }
  const engineRank = levelRank(engine);
  if (engineRank < expectedRank) {
    return done({
      case: korpusCase.id,
      class: 'level',
      state: 'disagree',
      verdict: 'engine-defekt',
      evidence: `${base}. Die Engine urteilt milder als der Fall — ein falsches Grün ist die eine Richtung, in der ein Levelunterschied gefährlich ist.`,
    });
  }
  // Stricter than the case. That is only a defect when the case bases its
  // milder answer on a successor listed in the same catalogue: then the grade
  // reads the same entry and leaves half of it unread.
  const withSuccessor = korpusCase.expected.objects.filter(
    (object) => object.identity?.objectType === 'TABL' && (object.successors?.length ?? 0) > 0,
  );
  if (withSuccessor.length > 0) {
    return done({
      case: korpusCase.id,
      class: 'level',
      state: 'disagree',
      verdict: 'engine-defekt',
      evidence:
        `${base}. Die Engine urteilt strenger. Der Fall begründet sein ${expected} mit dem katalogisierten Nachfolger ` +
        `(${sample(withSuccessor.map((o) => `${o.name} → ${(o.successors as Array<{ tadirObjName?: string }>)[0]?.tadirObjName ?? '?'}`))}), ` +
        `der aus derselben Quelle stammt, aus der die Engine ihre Note zieht. Eine Note, die den Nachfolger nicht berücksichtigt, liest den Katalogeintrag zur Hälfte.`,
    });
  }
  return done({
    case: korpusCase.id,
    class: 'level',
    state: 'disagree',
    verdict: 'nicht-vergleichbar',
    evidence:
      `${base}. Die Engine urteilt strenger, und der Fall stützt sein Level nicht auf einen katalogisierten Nachfolger. ` +
      `Der Korpus vergibt ein Level je Artefakt unter einem Regelvertrag, die Engine eine Katalognote je Objekt; ein Artefaktlevel gibt es in lib/abap/ nicht.`,
  });
}

function compareObjects(korpusCase: KorpusCase, reading: EngineReading): ClassResult {
  const tables = korpusCase.expected.objects.filter((object) => object.identity?.objectType === 'TABL');
  const engineTables = new Map<string, string>();
  for (const entry of reading.perFile) for (const table of entry.tables) engineTables.set(table.name, table.access);
  const scope = { compared: 0, total: korpusCase.expected.objects.length };
  const aspects: FacetAspect[] = [];
  const done = (core: ClassCore): ClassResult => ({
    ...core,
    scope: { ...scope },
    aspects:
      aspects.length > 0
        ? aspects
        : [
            facet(
              'tabellenobjekte',
              scope.compared,
              scope.total,
              'Die Datenkopplung der Engine führt nur Tabellen; Bausteine, BAdIs und Programme stehen dort nicht.',
            ),
          ],
  });

  if (korpusCase.expected.declaredEmpty.objects) {
    const state = engineTables.size === 0 ? 'agree' : 'disagree';
    scope.compared = 1;
    scope.total = 1;
    aspects.push(
      facet('negativkontrolle', 1, 1, 'Der Fall erklärt „keine externe Repository-Identität"; geprüft wird, ob die Engine schweigt.', 'compared'),
    );
    return done({
      case: korpusCase.id,
      class: 'objekte',
      state,
      verdict: state === 'agree' ? null : 'engine-defekt',
      evidence:
        `Der Fall erklärt „keine explizite externe SAP-Repository-Identität". ` +
        `Die Engine meldet ${engineTables.size} Tabelle(n): ${sample([...engineTables.keys()])}.`,
    });
  }
  if (tables.length === 0) {
    return done({
      case: korpusCase.id,
      class: 'objekte',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence:
        `${korpusCase.expected.objects.length} Sollobjekt(e), keines vom Typ TABL — ` +
        `${sample([...new Set(korpusCase.expected.objects.map((o) => `${o.name}/${o.identity?.objectType ?? '?'}`))])}. ` +
        `Die Datenkopplung der Engine führt nur Tabellen; Bausteine, BAdIs und Programme stehen dort nicht.`,
    });
  }

  const missing: string[] = [];
  const wrongAccess: string[] = [];
  const declared = new Set(korpusCase.expected.objects.map((o) => (o.name ?? '').toUpperCase()));
  for (const object of tables) {
    const name = (object.name ?? '').toUpperCase();
    const access = engineTables.get(name);
    if (access == null) {
      missing.push(`${name} (${object.usage ?? '?'})`);
      continue;
    }
    const wanted = USAGE_TO_ACCESS[(object.usage ?? '').split(',')[0].trim()];
    if (wanted && access !== wanted && access !== 'Read/Write') {
      wrongAccess.push(`${name}: Korpus ${object.usage} · Engine ${access}`);
    }
  }
  // Names the case does not carry as an object. Not every one is an error —
  // the case names only what counts for the expected answer — but a macro
  // placeholder or a local variable in this list is an invented dependency,
  // and then it stands here, where someone reads it.
  const undeclared = [...engineTables.keys()].filter((name) => !declared.has(name));
  scope.compared = tables.length;
  const state = missing.length === 0 && wrongAccess.length === 0 ? 'agree' : 'disagree';
  return done({
    case: korpusCase.id,
    class: 'objekte',
    state,
    verdict: state === 'agree' ? null : 'engine-defekt',
    evidence:
      `${tables.length} Tabellenobjekt(e) im Fall; Engine sieht ${engineTables.size}: ${sample([...engineTables.keys()])}. ` +
      `Fehlend: ${sample(missing)}. Zugriffsart abweichend: ${sample(wrongAccess)}. ` +
      `Vom Fall nicht geführt: ${sample(undeclared)}.`,
  });
}

// ---------------------------------------------------------------------------
// The skeleton — the facet that compared nothing before 1.9
// ---------------------------------------------------------------------------

/**
 * Corpus node type -> engine node kind, **at a named construct**.
 *
 * The same discipline as `RULE_BRIDGES`, for the same reason: the two
 * vocabularies do not coincide, and a mapping without a look at the source
 * would be a claim. The corpus writes `transaction` on a `CALL TRANSACTION` as
 * well as on a `COMMIT WORK` — the first is a call activity, the second an LUW
 * boundary that `process-skeleton.ts` deliberately carries as an annotation
 * (`commit-boundary`) and as an effect state (`luw`, 2.12), not as a node. A
 * bridge therefore only applies when the **ABAP statement at the anchor**
 * carries the named construct; otherwise the expected node is
 * `nicht-vergleichbar` — counted, not missed.
 *
 * Measured on 22.09.2026 across all 68 cases (probe against
 * `buildProcessSkeleton`): 43 of 49 nodes of corpus type `action` sit on a pure
 * assignment (`rv_route = 'INVALID'`, `APPEND … TO lt_…`,
 * `MOVE-CORRESPONDING`). The skeleton draws effect and flow, not value
 * assignment — so `action` carries a construct and not the empty permission.
 */
export interface SkeletonBridge {
  /** The node type as the case book writes it. */
  type: string;
  /** The node kinds from `SkeletonNodeKind` that mean the same thing. */
  kinds: SkeletonNodeKind[];
  /** The construct the statement at the anchor must carry. */
  construct: RegExp;
  /** Why the engine means the same thing here. */
  why: string;
}

/**
 * The functional notation of a method call — `lo->m( … )`, `cls=>m( … )`,
 * `me->m( … )`, `lv = lo->m( … )`, `DATA(x) = lo->m( … )` and, inside a class,
 * the bare `m( … )` at the start of the statement. Since D2 (27.09.2026) the
 * engine reads exactly these forms as a call (`methodCallsIn` in
 * `process-skeleton.ts`, resolution via `lib/abap/method-resolution.ts`) and
 * draws them like `CALL METHOD`. A construct that knew only `CALL METHOD` made
 * every expected call in this notation "not comparable" — a gap in the
 * measurement, not in the engine. `DATA(x) = …` without a call is a
 * declaration and stays out.
 */
const FUNCTIONAL_METHOD_CALL = String.raw`^(?:[\w/<>]+(?:->|=>))+[\w/~]+\(|^(?!(?:DATA|FINAL)\()[\w/~]+\(`;
const withMethodCalls = (construct: RegExp): RegExp =>
  new RegExp(`${construct.source}|${FUNCTIONAL_METHOD_CALL}`, construct.flags);

export const SKELETON_BRIDGES: SkeletonBridge[] = [
  {
    type: 'start',
    kinds: ['start'],
    construct: /[\s\S]/,
    why:
      'Process start. The engine opens a start node for every event block and for the implicit ' +
      'START-OF-SELECTION; which statement that is, it decides itself, hence no construct filter.',
  },
  {
    type: 'event_block',
    kinds: ['start'],
    construct: /[\s\S]/,
    why:
      'In §5.8 an event block is a start event of its own region; the engine carries it as a region with ' +
      'a start node, not as a node kind of its own.',
  },
  {
    type: 'end',
    kinds: ['end', 'end-error'],
    construct: /^(RETURN|EXIT|STOP|LEAVE|ENDFORM|ENDMETHOD|ENDMODULE|ENDFUNCTION|ENDLOOP|ENDIF|ENDCASE|ENDSELECT|MESSAGE|RAISE|ASSERT|CHECK|SUBMIT)\b/i,
    why:
      'End of a path. The engine knows `end` and `end-error`; which of the two, it decides at the ' +
      'statement, and both count as a hit here.',
  },
  {
    type: 'return',
    kinds: ['end', 'end-error'],
    construct: /^(RETURN|EXIT|LEAVE)\b/i,
    why: 'Like `end`: the case draws the return as the end of the path.',
  },
  {
    type: 'gateway',
    kinds: ['gateway'],
    construct: /^(IF|ELSEIF|ELSE|CASE|WHEN|CHECK|ASSERT|AT)\b/i,
    why:
      'Exclusive gateway. The engine opens it at IF/ELSEIF/CASE/WHEN and at a CHECK that is not a run ' +
      'switch. A `gateway` on a CATCH is therefore not comparable — TRY/CATCH is not a branch of the ' +
      'reader but a gap that the case book itself names as such in §8.',
  },
  {
    type: 'loop',
    kinds: ['loop'],
    construct: /^(LOOP|DO|WHILE|SELECT|AT|PROVIDE)\b/i,
    why: 'Iteration. The skeleton draws every loop as `loop`, including `SELECT … ENDSELECT` and `DO`/`WHILE`.',
  },
  {
    type: 'read',
    kinds: ['read'],
    construct: /\b(SELECT|OPEN\s+CURSOR|FETCH|GET)\b/i,
    why: 'Data store being read; the engine carries `read` for it.',
  },
  {
    type: 'write',
    kinds: ['write'],
    construct: /\b(INSERT|UPDATE|MODIFY|DELETE)\b/i,
    why: 'Data store being written; the engine carries `write` for it.',
  },
  {
    type: 'output',
    kinds: ['output', 'send-task', 'user-task', 'end-error'],
    construct: /^(WRITE|MESSAGE|NEW-PAGE|SKIP|ULINE|FORMAT|CALL\s+SCREEN|CALL\s+FUNCTION|PERFORM|LEAVE|TRANSFER|OPEN\s+DATASET|CLOSE\s+DATASET)\b/i,
    why:
      'Output. The engine distinguishes the result list (`output`), sending (`send-task`), screen ' +
      'output (`user-task`) and the error message that ends the path (`end-error`); the corpus ' +
      'treats these as one type. All four therefore count as a hit.',
  },
  {
    type: 'action',
    kinds: [
      'task',
      'service-task',
      'user-task',
      'send-task',
      'business-rule-task',
      'sub-process',
      'call-activity',
      'transaction',
      'output',
      'read',
      'write',
    ],
    construct: withMethodCalls(/^(CALL\s+(FUNCTION|METHOD|SCREEN|TRANSACTION|BADI)|PERFORM|SUBMIT|MESSAGE|WRITE|EXPORT|IMPORT|TRANSFER|OPEN\s+DATASET|ENQUEUE|DEQUEUE|AUTHORITY-CHECK|SELECT|INSERT|UPDATE|MODIFY|DELETE|COMMIT|ROLLBACK)\b/i),
    why:
      'A step without a type of its own in the case book. The engine gives the step a kind from §5.8 — which ' +
      'one, it decides at the construct — so every activity kind counts as a hit. A pure value assignment ' +
      'carries none of these constructs: the skeleton draws effect and flow, not assignment, and a node ' +
      'on one is not comparable rather than missed.',
  },
  {
    type: 'call',
    kinds: ['call-activity', 'service-task', 'sub-process', 'transaction', 'user-task', 'task'],
    construct: withMethodCalls(/^(CALL\s+(FUNCTION|METHOD|SCREEN|TRANSACTION|BADI)|PERFORM|SUBMIT)\b/i),
    why:
      'Call with a known target; the engine names it after what the target does. A method call counts in ' +
      'every notation the engine has read as a call since D2 (`withMethodCalls`).',
  },
  {
    type: 'opaque_call',
    kinds: ['call-opaque', 'service-task', 'call-activity', 'sub-process', 'transaction', 'user-task'],
    construct: withMethodCalls(/^(CALL\s+(FUNCTION|METHOD|SCREEN|TRANSACTION|BADI)|PERFORM|SUBMIT|CREATE\s+OBJECT)\b/i),
    why:
      'Call whose source the reader does not have. The engine carries `call-opaque`, but names the call after ' +
      'its kind when the statement reveals it (a `CALL FUNCTION` stays a service activity even when ' +
      'the function module is not in the slice).',
  },
  {
    type: 'opaque_call',
    kinds: ['send-task'],
    construct: /^CALL\s+FUNCTION\b/i,
    why:
      'A function module that §5.8 recognises as sending (row send task: mail, message, outbound IDoc) is no ' +
      'longer an opaque call for the reader: the engine names it after its effect, just as it otherwise names a ' +
      '`CALL FUNCTION` a service activity. The same statement, read more closely — not a different step.',
  },
  {
    type: 'call',
    kinds: ['business-rule-task', 'read', 'write'],
    construct: withMethodCalls(/^(PERFORM|CALL\s+METHOD)\b/i),
    why:
      'A call of a routine in this source. §5.8 draws a small routine as **one** step ' +
      '(`collapseSmallRegions`) and names it after its effect — if it only reads, it is a read; if it only ' +
      'writes, a write; if it classifies from literals, a decision table (business rule task). The node ' +
      'sits on the call line and means the same call.',
  },
  {
    type: 'opaque_call',
    kinds: ['business-rule-task', 'read', 'write'],
    construct: withMethodCalls(/^(PERFORM|CALL\s+METHOD)\b/i),
    why:
      'As with `call`: the case book took the target to be opaque, the engine found the routine in the source ' +
      'and draws it per §5.8 as one step with its effect (read, write, ' +
      'decision table) — the same call, read more closely.',
  },
  {
    type: 'call-opaque',
    kinds: ['call-opaque'],
    construct: /[\s\S]/,
    why: 'The same kind, in the engine\'s spelling — one case writes it that way.',
  },
  {
    type: 'transaction',
    kinds: ['transaction', 'call-activity'],
    construct: /\bCALL\s+TRANSACTION\b/i,
    why:
      'Call activity on a transaction. **Not** the LUW boundary: the corpus also writes `transaction` on ' +
      'COMMIT WORK and ROLLBACK WORK, and `process-skeleton.ts` carries those not as a node but as an annotation ' +
      '(`commit-boundary`) and, since 2.12, as an effect state in the model (`luw`: triggered/discarded). Such ' +
      'nodes are not comparable here; `tests/luw-states.spec.ts` checks the states on CC-026/CC-027.',
  },
  {
    type: 'external_program',
    kinds: ['call-activity', 'transaction'],
    construct: /\b(SUBMIT|CALL\s+TRANSACTION)\b/i,
    why: 'Cross-program call; the engine carries it as a call activity.',
  },
  {
    type: 'update_task',
    kinds: ['service-task'],
    construct: /\bIN\s+UPDATE\s+TASK\b/i,
    why:
      'Registration with the update task; the engine draws the CALL FUNCTION as a service activity and puts ' +
      '`effectState = registered` on the node (2.12) — the kind stays, the state sits beside it.',
  },
  {
    type: 'async',
    kinds: ['service-task'],
    construct: /\b(STARTING\s+NEW\s+TASK|IN\s+BACKGROUND\s+TASK|RECEIVE\s+RESULTS)\b/i,
    why:
      'Asynchronous call. Until 2.17 there is no kind of its own for it — a `STARTING NEW TASK` stays a ' +
      'service activity; parallelism is carried as a sub-check of its own, not hidden here.',
  },
  {
    type: 'rfc',
    kinds: ['service-task', 'call-activity'],
    construct: /\bDESTINATION\b/i,
    why: 'System boundary via an RFC with a destination.',
  },
  {
    type: 'lock',
    kinds: ['service-task'],
    construct: /\b(ENQUEUE|DEQUEUE)_/i,
    why: 'Lock module; the engine draws it as a service activity like any other CALL FUNCTION.',
  },
];

/**
 * How the condition of an expected flow relates to the engine's edge kind.
 *
 * The case book writes the condition in words ("always", "next iteration",
 * "no more rows") or as an expression from the source. The engine writes a
 * kind. Nothing beyond the kind can be compared here without reinterpreting
 * the expected value — and the condition text itself stays unchecked, because
 * rule 6 takes it verbatim from the source while the case book paraphrases it.
 *
 * The `label` values stay German: they go into the evidence text that the
 * baseline stores verbatim.
 */
const EDGE_EXPECTATIONS: Array<{ condition: RegExp; kinds: SkeletonEdgeKind[]; label: string }> = [
  {
    condition: /^(always|normal return|call returns.*|.*returns normally)$/i,
    kinds: ['sequence', 'default'],
    label: 'unbedingt',
  },
  { condition: /^next iteration$/i, kinds: ['loop-back'], label: 'Rücksprung' },
  { condition: /^(next row|for each .*)$/i, kinds: ['sequence', 'conditional'], label: 'in den Schleifenkörper' },
  { condition: /^(no more rows|exhausted)$/i, kinds: ['sequence', 'default'], label: 'aus der Schleife' },
  { condition: /^(sonst|other command|else)$/i, kinds: ['default', 'conditional'], label: 'Sonst-Zweig' },
];

const CONDITIONAL_EDGE: SkeletonEdgeKind[] = ['conditional', 'default', 'boundary'];

function expectedEdgeKinds(condition: string | null): { kinds: SkeletonEdgeKind[]; label: string } {
  const text = (condition ?? '').trim();
  for (const entry of EDGE_EXPECTATIONS) {
    if (entry.condition.test(text)) return { kinds: entry.kinds, label: entry.label };
  }
  return { kinds: CONDITIONAL_EDGE, label: 'bedingt' };
}

/**
 * The three skeleton statements the comparer does **not yet** compare — in one
 * place, named, with the roadmap step that resolves them.
 *
 * Occasion: QA review of `9e408888bfec`, fingerprint `c100d056f0d2`. A facet
 * whose status hangs on the mere presence of the expected field counts
 * unchecked expected values as compared — the same kind of green that 1.9
 * (CR-05) abolished. So only *what* will one day be compared stands here,
 * never a status: `compareSkeleton` assigns that as a fixed `not_checked`.
 *
 * Whoever builds 2.15, 2.16 or 2.17 has their hook here: entry out, real
 * comparison in, rewrite the baseline. The change of check status is a ratchet
 * in `tests/korpus-facets.spec.ts` and so it shows.
 *
 * `what` and `absent` stay German: they go into the facet note that the
 * baseline stores verbatim.
 */
export interface PendingSkeletonAspect {
  /** The facet name as it stands in the result and in the baseline. */
  name: string;
  /** The roadmap step that resolves this sub-check. */
  step: string;
  /** What the case claims, as a phrase — for the reason. */
  what: string;
  /** The same phrase negated, for the (today always) empty case. */
  absent: string;
  /** How many expected values the case carries for it (0 everywhere today). */
  given: (counts: { gatewayClassGiven: number; lanes: number; parallel: number }) => number;
  /** The denominator: how many places of this kind the case knows at all. */
  total: (counts: { gateways: number; lanes: number; parallel: number }) => number;
}

export const PENDING_SKELETON_ASPECTS: PendingSkeletonAspect[] = [
  {
    name: 'gateway-klasse',
    step: '2.15',
    what: 'eine Gateway-Klasse',
    absent: 'keine Gateway-Klasse (Sollfeld leer)',
    given: (counts) => counts.gatewayClassGiven,
    total: (counts) => counts.gateways,
  },
  {
    name: 'lanes',
    step: '2.16',
    what: 'eine Lane mit Beweis',
    absent: 'keine Lane (Sollfeld leer), und das Skelett erzeugt keine',
    given: (counts) => counts.lanes,
    total: (counts) => counts.lanes,
  },
  {
    name: 'parallelitaet',
    step: '2.17',
    what: 'einen parallelen Knoten',
    absent: 'keinen parallelen Knoten (Sollfeld leer)',
    given: (counts) => counts.parallel,
    total: (counts) => counts.parallel,
  },
];

function compareSkeleton(korpusCase: KorpusCase, reading: EngineReading): ClassResult {
  const skeleton = korpusCase.expected.skeleton;
  const nodes = skeleton.nodes;
  const byFile = new Map(reading.perFile.map((entry) => [entry.file, entry]));
  const defaultFile = korpusCase.sources[0]?.name ?? '';

  const hit: string[] = [];
  const missed: string[] = [];
  const wrongKind: string[] = [];
  const notComparable: string[] = [];
  /** Expected node id -> engine node id. The basis of the edge comparison. */
  const resolved = new Map<string, string>();

  for (const node of nodes) {
    const file = node.anchor?.file ?? defaultFile;
    const entry = byFile.get(file);
    const line = node.anchor?.line;
    const label = `${node.id}/${node.type ?? '?'}@${node.anchor?.raw ?? '?'}`;
    if (!entry || line == null || node.type == null) {
      notComparable.push(`${label} — ohne Anker oder ohne Art`);
      continue;
    }
    const statement = statementAt(entry.statements, line);
    const text = statement?.text ?? '';
    const bridges = SKELETON_BRIDGES.filter((bridge) => bridge.type === node.type && bridge.construct.test(text));
    if (bridges.length === 0) {
      notComparable.push(`${label} — keine Brücke für „${node.type}" an „${text.slice(0, 40) || '(keine Anweisung)'}"`);
      continue;
    }
    const allowed = new Set<SkeletonNodeKind>(bridges.flatMap((bridge) => bridge.kinds));
    // The same notion of anchor as for findings: the statement, not the
    // line. `SELECT … INTO TABLE` spans five lines, and CC-001 anchors it on
    // the FROM line, the engine on the first.
    const from = statement?.lineStart ?? line;
    const to = statement?.lineEnd ?? line;
    const atAnchor = entry.skeleton.nodes.filter(
      (candidate) => candidate.anchor != null && candidate.anchor.lineStart >= from && candidate.anchor.lineStart <= to,
    );
    if (atAnchor.length === 0) {
      missed.push(`${label} erwartet ${[...allowed].join('|')} in ${file}:${from}–${to}`);
      continue;
    }
    const match = atAnchor.find((candidate) => allowed.has(candidate.kind));
    if (!match) {
      wrongKind.push(`${label} → Engine ${sample([...new Set(atAnchor.map((c) => c.kind))], 3)}`);
      continue;
    }
    resolved.set(node.id, match.id);
    hit.push(label);
  }

  const comparableNodes = hit.length + missed.length + wrongKind.length;

  // --- Edges. An expected edge is comparable only when both ends are resolved
  //     to an engine node; otherwise nobody would know what to look for.
  const edgeHit: string[] = [];
  const edgeMissing: string[] = [];
  const edgeWrongKind: string[] = [];
  let edgeNotComparable = 0;
  const engineEdges = reading.perFile.flatMap((entry) => entry.skeleton.edges);
  for (const edge of skeleton.edges) {
    const fromId = resolved.get(edge.from);
    const toId = resolved.get(edge.to);
    if (!fromId || !toId) {
      edgeNotComparable += 1;
      continue;
    }
    const expectation = expectedEdgeKinds(edge.condition);
    const candidates = engineEdges.filter((candidate) => candidate.from === fromId && candidate.to === toId);
    const label = `${edge.from}→${edge.to} („${(edge.condition ?? '').slice(0, 28)}", ${expectation.label})`;
    if (candidates.length === 0) {
      edgeMissing.push(label);
      continue;
    }
    if (candidates.some((candidate) => expectation.kinds.includes(candidate.kind))) edgeHit.push(label);
    else edgeWrongKind.push(`${label} → Engine ${sample([...new Set(candidates.map((c) => c.kind))], 3)}`);
  }
  const comparableEdges = edgeHit.length + edgeMissing.length + edgeWrongKind.length;

  // --- The three sub-checks that 2.15, 2.16 and 2.17 will fill.
  //
  // QA review of `9e408888bfec`, fingerprint `c100d056f0d2`: until then each
  // of these three sub-checks raised its status to `compared` as soon as an
  // expected value **appeared** — it was never compared. That is exactly the
  // mechanism 1.9 was built against (CR-05): a green that means "not
  // checked". Today none of the 68 `expected.json` files carries any of the
  // three fields, so the fault was not yet in effect; it would have taken
  // effect with the first case from 2.10, and then an expected value would
  // have sat there silently while the facet said "compared".
  //
  // The first of the two ways was chosen: the facets stay `not_checked`,
  // **even when expected values are present**, and their numerator stays 0.
  // Really comparing would not be a comparison today:
  // `lib/abap/process-skeleton.ts` carries neither a gateway class nor a lane
  // nor a parallel marker (`SkeletonNode` has none of these fields, and the
  // file header says explicitly that lanes and parallel gateways come later).
  // Every expected value would be compared against `undefined` and so be
  // "missed by the engine" across the board — a red that says nothing about
  // the engine.
  //
  // `PENDING_SKELETON_ASPECTS` is the named hook: whoever builds 2.15, 2.16 or
  // 2.17 replaces the entry here with a real comparison and rewrites the
  // baseline — the status change `not_checked` → `compared` is the ratchet
  // that makes this visible.
  //
  // So that an expected value does not lie silent until then: a case that
  // carries one of the three fields does not count as agreeing (see below).
  const gatewayNodes = nodes.filter((node) => node.type === 'gateway');
  const gatewayClassGiven = gatewayNodes.filter((node) => (node.gatewayClass ?? null) != null);
  const laneGiven = skeleton.lanes ?? [];
  const parallelGiven = nodes.filter((node) => node.parallel === true);

  const pending: Array<{ name: string; step: string; what: string; absent: string; given: number; total: number }> =
    PENDING_SKELETON_ASPECTS.map((aspect) => ({
      name: aspect.name,
      step: aspect.step,
      what: aspect.what,
      absent: aspect.absent,
      given: aspect.given({ gatewayClassGiven: gatewayClassGiven.length, lanes: laneGiven.length, parallel: parallelGiven.length }),
      total: aspect.total({ gateways: gatewayNodes.length, lanes: laneGiven.length, parallel: parallelGiven.length }),
    }));
  /** Expected values for which there is no comparison today. Empty everywhere today. */
  const unchecked = pending.filter((entry) => entry.given > 0);

  const aspects: FacetAspect[] = [
    facet(
      'knotenart',
      comparableNodes,
      nodes.length,
      'Knotenart je Anker über alle Arten aus SkeletonNodeKind, Brücke nur bei passendem Konstrukt.',
    ),
    facet(
      'kanten',
      comparableEdges,
      skeleton.edges.length,
      'Kantenart (sequence/conditional/default/loop-back/boundary) zwischen zwei aufgelösten Knoten.',
    ),
    // Numerator fixed at 0 and status fixed at `not_checked`: nothing is
    // compared here, and a present expected value changes nothing about that
    // (c100d056f0d2).
    ...pending.map((entry) =>
      facet(
        entry.name,
        0,
        entry.total,
        entry.given > 0
          ? `Der Fall nennt ${entry.given}× ${entry.what}; die Engine führt dieses Feld nicht — nicht geprüft, ` +
            `Roadmap ${entry.step}. Der Sollwert ist damit offen, nicht erfüllt.`
          : `Der Fall nennt ${entry.absent} — nicht geprüft, Roadmap ${entry.step}.`,
        'not_checked',
      ),
    ),
  ];

  const scope = { compared: comparableNodes, total: nodes.length };
  const done = (core: ClassCore): ClassResult => ({ ...core, scope, aspects });

  const engineNodeCount = reading.perFile.reduce((sum, entry) => sum + entry.skeleton.nodes.length, 0);
  const noEntry = reading.perFile
    .flatMap((entry) => entry.skeleton.notes)
    .filter((note) => note.reason === 'no-entry-point');
  const head =
    `${comparableNodes} von ${nodes.length} Sollknoten verglichen (${hit.length} getroffen, ${missed.length} ohne Knoten, ` +
    `${wrongKind.length} mit anderer Art); ${comparableEdges} von ${skeleton.edges.length} Sollkanten verglichen ` +
    `(${edgeHit.length} getroffen, ${edgeMissing.length} fehlend, ${edgeWrongKind.length} mit anderer Art, ` +
    `${edgeNotComparable} ohne aufgelöste Enden). Die Engine baut an diesem Fall ${engineNodeCount} Knoten.`;
  const tail = notComparable.length > 0 ? ` Nicht vergleichbar: ${sample(notComparable)}.` : '';

  if (comparableNodes === 0) {
    return done({
      case: korpusCase.id,
      class: 'skelett',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence:
        `${head}${tail}` +
        (noEntry.length > 0
          ? ' Die Engine meldet „no-entry-point": sie findet in dieser Quelle keinen Einstieg und zeichnet deshalb nichts (Roadmap 2.14).'
          : ''),
    });
  }

  // Below half, the number itself is the finding: a green here would mean the
  // majority of expected nodes had been checked, and that would not be true (1.9).
  if (comparableNodes * 2 < nodes.length) {
    return done({
      case: korpusCase.id,
      class: 'skelett',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence: `${head} Weniger als die Hälfte der Sollknoten war vergleichbar; das Ergebnis trägt keine Aussage.${tail}`,
    });
  }

  const broken = missed.length + wrongKind.length + edgeMissing.length + edgeWrongKind.length;
  if (broken > 0) {
    return done({
      case: korpusCase.id,
      class: 'skelett',
      state: 'disagree',
      verdict: 'engine-defekt',
      evidence:
        `${head} Ohne Knoten: ${sample(missed)}. Andere Knotenart: ${sample(wrongKind)}. ` +
        `Fehlende Kante: ${sample(edgeMissing)}. Andere Kantenart: ${sample(edgeWrongKind)}.${tail}`,
    });
  }
  // Nodes and edges agree — but the case carries an expected statement for
  // which there is no comparison today. An `agree` here would mean "all
  // checked", and that would be the lie from CR-05 with other fields
  // (c100d056f0d2).
  if (unchecked.length > 0) {
    return done({
      case: korpusCase.id,
      class: 'skelett',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence:
        `${head} Knoten und Kanten stimmen überein, doch der Fall nennt Sollwerte, für die der Vergleicher ` +
        `heute keine Prüfung hat: ${unchecked.map((entry) => `${entry.given}× ${entry.what} (Roadmap ${entry.step})`).join(', ')}. ` +
        `Solange die Engine diese Felder nicht führt, ist das eine Aussage über den Umfang der Prüfung — kein Grün.${tail}`,
    });
  }
  return done({ case: korpusCase.id, class: 'skelett', state: 'agree', verdict: null, evidence: `${head}${tail}` });
}

// ---------------------------------------------------------------------------
// Business statements: the text measure, the anchor key and the producer (roadmap 17.5)
// ---------------------------------------------------------------------------

/**
 * The function words that, in a business statement, say nothing about the code.
 *
 * A stop list is an interpretation, so it sits here, visible and complete,
 * instead of vanishing into a similarity number. It contains only English
 * function words — no domain term, no ABAP identifier, nothing that could
 * distinguish two statements by content.
 *
 * English since 01.10.2026 (owner decision "alles Englisch"): the engine's
 * business statements and the case book's expected statements are English, and
 * the list is the English counterpart of the German one it replaces, word for
 * word where English has the word (`der/die/das` → `the`, `wird/werden` →
 * `is/are`, `ohne` → `without` …). Words under three letters fall out anyway.
 */
export const STATEMENT_STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'but', 'not', 'are', 'was', 'were', 'been', 'being', 'has', 'have', 'had',
  'with', 'without', 'from', 'for', 'over', 'under', 'after', 'before', 'through', 'against',
  'only', 'also', 'still', 'then', 'when', 'that', 'this', 'these', 'those', 'its', 'their',
  'they', 'them', 'all', 'each', 'every', 'per', 'thereby', 'thus', 'there', 'than', 'how',
  'does', 'did', 'any', 'via', 'into', 'which',
]);

/**
 * A business statement split into content words.
 *
 * Normalisation, open and in this order: lower case, umlauts and ß expanded
 * (`ä`→`ae` … `ß`→`ss`), everything except `a–z`, `0–9` and `_` turned into
 * separators, words under three characters and the stop list above removed.
 * `_` stays, because ABAP identifiers such as `lv_count` are exactly the word
 * on which two statements differ.
 */
export function statementTokens(text: string): Set<string> {
  return new Set(
    (text ?? '')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9_]+/g, ' ')
      .split(' ')
      .filter((token) => token.length >= 3 && !STATEMENT_STOPWORDS.has(token)),
  );
}

/**
 * The measure: the Dice coefficient over these content words, `2·|A∩B| / (|A|+|B|)`.
 *
 * Why this one and not a clever one: it can be recomputed by hand, it needs no
 * model, no embedding and no key, and for every value it says which words it
 * comes from. A number whose derivation nobody can check would be exactly the
 * mistake the second measurement of 23.09. made.
 */
export function statementSimilarity(a: string, b: string): number {
  const left = statementTokens(a);
  const right = statementTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

/**
 * The threshold — **calibrated on the corpus, not guessed.**
 *
 * Measured on 23.09.2026 across all 173 expected statements (recompute with the
 * test on the threshold lying in the measured gap in
 * `tests/korpus-facets.spec.ts`, which rebuilds the same numbers on every run):
 *
 * - Two **different** expected statements of the same case over **different**
 *   anchors: 115 pairs, highest value **0.400**, 95th percentile 0.267,
 *   median 0.051.
 * - The same statement with its last two words cut — the mildest rewording
 *   that still means the same: 173 pairs, **lowest** value **0.571**,
 *   median 0.909.
 *
 * Between 0.400 and 0.571 there is a gap, and `0.50` lies in it: above every
 * measured pair that does **not** mean the same, and below every one that
 * does. That is the whole justification; it is reproducible and it can tip
 * over when the case book grows — then the test fails and the threshold is
 * justified anew instead of being nudged along.
 *
 * **The honest limit:** two expected statements at the *same* anchor can be
 * closer than 0.50 — CC-042-B01/B02 sit at 0.667 and differ only in
 * `KNA1`/`KNB1`. That is why the matching is one-to-one and greedy; one
 * produced statement cannot credit two expected ones. A producer that
 * delivers only one of two statements gets no counterpart for the other and
 * so no `compared`.
 */
export const STATEMENT_MATCH_THRESHOLD = 0.5;

/**
 * The key by which two statements are comparable at all: the **ABAP
 * statement** that contains the anchor line — not the line itself.
 *
 * Reason: the case book anchors the same sentence sometimes on
 * `source.abap:6`, sometimes on `source.abap:6–7`, because a `SELECT` spans two
 * lines. Two sentences about the same statement talk about the same thing; two
 * sentences about different statements do not. If there is no statement at
 * the line (comment, blank line), the line itself stays the key — nothing is
 * guessed.
 */
export function anchorKeys(
  anchors: Array<{ file: string | null; line: number | null }>,
  reading: Pick<EngineReading, 'perFile'>,
): Set<string> {
  const keys = new Set<string>();
  for (const anchor of anchors) {
    if (!anchor.file || anchor.line == null) continue;
    const file = reading.perFile.find((entry) => entry.file === anchor.file);
    const statement = file ? statementAt(file.statements, anchor.line) : null;
    keys.add(statement ? `${anchor.file}#${statement.lineStart}-${statement.lineEnd}` : `${anchor.file}@${anchor.line}`);
  }
  return keys;
}

/** A business statement as a producer delivers it. */
export interface GeneratedStatement {
  id: string;
  text: string;
  anchors: Array<{ file: string | null; line: number | null }>;
}

/**
 * Who produces the business statements — the seam that 17.6 fills.
 *
 * It is explicitly **empty**, because nobody fills it today, and it is
 * explicitly **there**, so the first real producer is measured without
 * anything in this facet having to be rebuilt. Inventing a producer here
 * would pre-empt 17.6 and be a product decision that belongs to Sonny.
 *
 * `name` and `note` go verbatim into evidence and facet notes that the
 * baseline stores, so the values below stay German.
 */
export interface StatementProducer {
  /** Appears in the evidence of every result; without a name nobody knows what was measured. */
  name: string;
  /** Why there is (no)thing — goes verbatim into the sub-check's reason. */
  note: string;
  produce(korpusCase: KorpusCase, reading: Omit<EngineReading, 'businessStatements' | 'producer'>): GeneratedStatement[];
}

/**
 * The state as of then, measured and not claimed: **nobody produces business
 * statements.**
 *
 * Checked on 23.09.2026 across `lib/`, `app/` and `components/` — no hit for
 * `businessStatement`, `business_statement` or `Fachsatz`; `readWithEngine`
 * calls `buildAbapEvidence`, `buildProcessFacts`, `buildProcessSkeleton`,
 * `readStatements`, `extractDataCoupling`, `routeExtensibility` and
 * `gradeSapObjectUse`, and none of them returns a sentence.
 * `process-skeleton.ts` says explicitly about its node labels: "A token out of
 * the source. Never a phrase this engine made up (rule 6)." In
 * `lib/analysis-prompt.ts` the model is asked for a "business executive
 * summary" — not an anchored single statement, and the path there goes over
 * the network and so cannot be measured here anyway.
 */
export const NO_PRODUCER: StatementProducer = {
  name: 'kein-erzeuger',
  note:
    'Heute erzeugt kein Modul des Produkts verankerte Fachsätze (Roadmap 17.6 ist offen: Engine oder Modell). ' +
    'Diese Facette misst den ersten Erzeuger ohne Umbau.',
  produce: () => [],
};

/**
 * **The product's producer** (roadmap 17.7, way A — decided 23.09.2026).
 *
 * `lib/abap/business-statement.ts` builds the statements deterministically
 * from the source: no model call, no network, no key, and the same source
 * yields the same statement. Since that step it is the **default** of
 * `readWithEngine` — `NO_PRODUCER` stays exported because the sensitivity
 * probe in `tests/korpus-mutation.spec.ts` still measures the empty state
 * against it.
 *
 * This seam is the only connection between producer and comparer: **nothing**
 * in the comparison itself was changed for 17.7. Producer and judge stay two.
 */
export const ENGINE_PRODUCER: StatementProducer = {
  name: 'engine:fachsatz',
  note:
    'Die Engine erzeugt die Fachsätze deterministisch aus dem Quelltext ' +
    '(lib/abap/business-statement.ts, Roadmap 17.7, Herkunft „reconstructed").',
  produce: (korpusCase) =>
    korpusCase.sources.flatMap((source) =>
      buildBusinessStatements(source.code).map((statement) => ({
        id: `${source.name}:${statement.id}`,
        text: statement.text,
        anchors: statement.anchors.map((anchor) => ({ file: source.name, line: anchor.lineStart })),
      })),
    ),
};

/**
 * Probes for the sensitivity measurement — **never in a normal run.**
 *
 * They are not a producer of the product and must never become one:
 * `SOLL_ECHO` copies the case book and would know nothing about foreign code.
 * Their only purpose is the question 17.5 has to answer — *does the number
 * move when the producer changes, and does the facet turn red when it gets
 * worse?* `tests/korpus-mutation.spec.ts` runs them.
 */
export const PROBE_PRODUCERS = {
  /** The perfect producer: it copies the expected statements. The upper bound of the measurement. */
  echo: (transform?: (text: string, index: number) => string, shift = 0, keep?: (index: number) => boolean): StatementProducer => ({
    name: 'probe:soll-echo',
    note: 'Empfindlichkeitsprobe — schreibt das Fallbuch ab und ist kein Erzeuger des Produkts.',
    produce: (korpusCase) =>
      korpusCase.expected.businessStatements
        .filter((_, index) => (keep ? keep(index) : true))
        .map((statement, index) => ({
          id: `G-${statement.id}`,
          text: transform ? transform(statement.text ?? '', index) : (statement.text ?? ''),
          anchors: statement.anchors.map((anchor) => ({
            file: anchor.file,
            line: anchor.line == null ? null : anchor.line + shift,
          })),
        })),
  }),
  /**
   * **The producer that hallucinates** (roadmap 17.9).
   *
   * It first copies the case book — so coverage and content stay intact and
   * really only the new sub-check fires — and then additionally says, for
   * every forbidden statement of the case, exactly its core, at its own
   * anchor. A facet that stays green under this measures nothing against
   * invention.
   *
   * Statements without an anchor apply to the whole case
   * (`FORBIDDEN_WHOLE_SLICE`); the probe therefore attaches them to the first
   * line of the first source — the comparison measures them against every
   * produced statement anyway.
   */
  forbidden: (): StatementProducer => ({
    name: 'probe:verbotene-aussage',
    note: 'Empfindlichkeitsprobe — sagt zusätzlich zu den Sollsätzen genau das, was der Fall verbietet.',
    produce: (korpusCase) => {
      const fallback = korpusCase.sources[0]?.name ?? null;
      const echoed = korpusCase.expected.businessStatements.map((statement) => ({
        id: `G-${statement.id}`,
        text: statement.text ?? '',
        anchors: statement.anchors.map((anchor) => ({ file: anchor.file, line: anchor.line })),
      }));
      // Every core, not only the first (QA review of 4b4586aff273): otherwise a
      // regression that no longer recognises a later core would go unnoticed.
      const said = readForbiddenConclusions(korpusCase)
        .filter((entry) => entry.cores.length > 0)
        .flatMap((entry, index) =>
          entry.cores.map((core, coreIndex) => ({
            id: `V-${index + 1}-${coreIndex + 1}`,
            text: core,
            anchors:
              entry.anchors.length > 0
                ? entry.anchors.map((anchor) => ({ file: anchor.file, line: anchor.line as number | null }))
                : [{ file: fallback, line: 1 as number | null }],
          })),
        );
      return [...echoed, ...said];
    },
  }),
} as const;

// ---------------------------------------------------------------------------
// Forbidden statements: the hallucination measurement (roadmap 17.9)
// ---------------------------------------------------------------------------

/**
 * A forbidden statement, broken down into what can be measured.
 *
 * In 47 of 68 cases the corpus carries a `forbiddenConclusions` field with
 * **197 sentences** in all, 158 of them with an anchor prefix `source.abap:NN`
 * — written by hand, in the repository for months, and until 23.09.2026 this
 * comparer did not mention the field once. The same pattern as with
 * `businessStatements` before 17.5: an expected value lies there, nothing
 * compares it.
 *
 * **Why this is the right measurement against invention.** A produced
 * statement *without* an expected statement is not a hallucination but more
 * coverage than the case book wrote; a rule "extras are errors" would have
 * punished 17.7 for being more thorough. A hallucination is a statement the
 * code **does not support at its anchor** — and exactly those are what these
 * 197 sentences name.
 *
 * **The machine is the same as in 17.5, just inverted:** the same Dice
 * coefficient (`statementSimilarity`), the same threshold
 * (`STATEMENT_MATCH_THRESHOLD`), the same anchor logic (`anchorKeys`, the ABAP
 * statement and not the line). If a produced statement reaches the threshold
 * against a forbidden statement, that is an **error** instead of a hit.
 */
export interface ForbiddenConclusion {
  /** The sentence as it stands in the case book. It goes verbatim into every piece of evidence. */
  raw: string;
  /** The prefix before the dash, verbatim; `null` when there is none. */
  scopeText: string | null;
  /**
   * The anchors from the prefix. **Empty means: the sentence applies to the
   * whole case** (see `FORBIDDEN_WHOLE_SLICE` below) — not: it is skipped.
   */
  anchors: Array<{ file: string | null; line: number }>;
  /** The first clause: everything before the justification (see `forbiddenClause`). */
  clause: string;
  /**
   * The cores measured against. **Empty means `not comparable`** — counted
   * and named, never silently booked as passed.
   */
  cores: string[];
  /** Why there is no core. Stated so the gap is visible. */
  why: string;
}

/**
 * **The 39 sentences without an anchor prefix** ("whole slice — …", "both
 * profiles — …", and the few with no prefix at all) apply to the **whole
 * case**.
 *
 * The alternative would be to skip them because the comparison goes through
 * the anchor — and that would silently devalue a fifth of the expected value.
 * So they are measured against **every** produced statement of the case. That
 * is the stricter reading, and it is the right one: "no authority check is
 * visible in the slice" forbids the statement everywhere in the case, not at
 * one line.
 *
 * This constant has no technical purpose; it is here so the decision has a
 * name and can be cited in `compareBusinessStatements`.
 */
export const FORBIDDEN_WHOLE_SLICE = 'whole slice';

/**
 * The prefix of a forbidden sentence is a **scope** and not a statement — but
 * only when it consists solely of scope indications.
 *
 * It is checked by striking out: profile indications, "whole slice", file
 * names with a line, line lists, ranges, token offsets (`+4`) and punctuation
 * are removed. If anything is left, the dash was part of the sentence and not
 * a separator — then there is no prefix, and the sentence applies to the whole
 * case. Nothing is guessed.
 */
function forbiddenScopeResidue(prefix: string): string {
  return prefix
    .replace(/Profile?\s*\d+(\s*(and|or|,)\s*\d+)*/g, '')
    .replace(/both profiles/g, '')
    .replace(new RegExp(FORBIDDEN_WHOLE_SLICE, 'g'), '')
    .replace(/[A-Za-z0-9_.]+\.abap/g, '')
    .replace(/[:\d+–—…\-\s,]/g, '')
    .trim();
}

/** The anchors of a prefix, in the notation the case book uses. */
function forbiddenAnchors(prefix: string, fallbackFile: string | null): Array<{ file: string | null; line: number }> {
  const anchors: Array<{ file: string | null; line: number }> = [];
  let current: string | null = fallbackFile;
  for (const rawPiece of prefix.split(',')) {
    // Profile indications go first: "Profile 1 and 2" must not become line 1
    // and line 2. Token offsets (`+4`, `+1 … +3`) denote a place *inside* the
    // statement on the same line and do not change the anchor.
    const piece = rawPiece
      .replace(/Profile?\s*\d+(\s*(and|or)\s*\d+)*/g, '')
      .replace(/both profiles/g, '')
      .replace(/\+\s*\d+/g, '');
    const file = /([A-Za-z0-9_.]+\.abap)\s*:/.exec(piece);
    if (file) current = file[1];
    const body = file ? piece.slice(file.index + file[0].length) : piece;
    const range = /(\d+)\s*[–—-]\s*(\d+)/.exec(body);
    if (range) {
      for (let line = Number(range[1]); line <= Number(range[2]); line += 1) anchors.push({ file: current, line });
      continue;
    }
    for (const match of body.matchAll(/\d+/g)) anchors.push({ file: current, line: Number(match[0]) });
  }
  return anchors;
}

/**
 * **The first clause — and why the rest must not be measured with it.**
 *
 * Almost every forbidden sentence has two parts: the prohibition and its
 * justification, separated by `;`, `:` or a full stop. The justification is a
 * **true** statement about the code:
 *
 * > "Do not report an unguarded empty-table FAE**; guard and return are
 * > present.**"
 *
 * Taking the whole sentence as the core would forbid the producer exactly what
 * it *should* say. So the core comes from the first clause only; parentheses
 * (rule citations such as `(R13a)`, `(REV2-04)`, `(Grok H-023)`) are dropped,
 * because they are provenance and not a statement about the code.
 *
 * Splitting happens outside quotation marks and parentheses — otherwise a
 * colon inside a quotation would cut the core apart.
 */
function forbiddenClause(body: string): string {
  let depth = 0;
  let quoted = false;
  let cut = body.length;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    // English quotes open and close with the same mark; the German „…“ of
    // the case book before 01.10.2026 is still read.
    if (ch === '„' || (!quoted && (ch === '"' || ch === '“'))) quoted = true;
    else if (quoted && (ch === '"' || ch === '“' || ch === '”')) quoted = false;
    else if (!quoted && ch === '(') depth += 1;
    else if (!quoted && ch === ')') depth = Math.max(0, depth - 1);
    else if (!quoted && depth === 0) {
      if (ch === ';' || ch === ':' || (ch === '.' && /\s|^$/.test(body[i + 1] ?? ''))) {
        cut = i;
        break;
      }
    }
  }
  return body.slice(0, cut).replace(/\([^)]*\)/g, ' ').trim();
}

/**
 * **The packaging of a forbidden statement — enumerated in full.**
 *
 * "Do not **report** finding X" is linguistically not the statement X. But the
 * measurement is against sentences that *claim* X, so the measure needs the
 * core and not the packaging. The packaging consists of two sorts of words,
 * and both stand here, visible and countable, instead of vanishing into a
 * number — the same rule as for `STATEMENT_STOPWORDS` and `RULE_BRIDGES`:
 *
 * 1. **Negation.** In the German list this replaced, `nicht`, `kein` and
 *    `keine` were already stop words of the measure; `keinen`, `keiner`,
 *    `keinem`, `keines`, `nie` and `weder` were missing there and belonged
 *    here.
 * 2. **Reporting verbs.** They turn a statement into an instruction to the
 *    producer — "report", "derive", "claim", "invent". No business statement
 *    about ABAP code uses them; they occur only in the packaging.
 *
 * **What deliberately does *not* stand here:** the class nouns "finding",
 * "business statement", "node", "level". They look like packaging, but they
 * are the only place where some sentences still carry content at all ("no
 * third read finding"), and striking them would be an interpretation that
 * cannot be justified. Where they dilute the core, the actual statement is in
 * the quotation anyway (rule 1 in `forbiddenCores`).
 */
export const FORBIDDEN_PACKAGING: ReadonlySet<string> = new Set([
  // English since 01.10.2026, the counterpart of the German list word for word:
  // negation (nicht, nie, kein…, weder) and the reporting verbs (melden,
  // ableiten, behaupten, unterstellen, erfinden, kodieren, klassifizieren,
  // bewerten, werten, behandeln, modellieren, vorschlagen, verwerfen, dürfen).
  'not', 'never', 'none', 'neither', 'nor', 'dont', 'doesnt',
  'report', 'reports', 'reported', 'derive', 'derived', 'claim', 'claimed',
  'imply', 'implied', 'invent', 'invented', 'encode', 'encoded',
  'classify', 'classified', 'assess', 'assessed', 'rate', 'rated', 'treat', 'treated', 'model', 'modelled',
  'propose', 'proposed', 'discard', 'discarded', 'may', 'must',
]);

/** Normalise a word the way `statementTokens` does — for the lookup above. */
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_]+/g, '');
}

/** Strip the packaging; the rest is the core from which the measure takes its words. */
function stripPackaging(text: string): string {
  return text
    .split(/\s+/)
    .filter((word) => !FORBIDDEN_PACKAGING.has(normalizeWord(word)))
    .join(' ');
}

/**
 * **The lower bound of a core: two content words.**
 *
 * A core of a single word — "kernel call", "level" — is not a statement but a
 * word lookup; the Dice measure would give any short sentence with that word
 * a hit. Two words are the shortest thing the measure can express as a claim,
 * and the threshold 0.50 then still requires that the produced statement
 * carries both words **and** is itself at most six content words long
 * (`2·2 / (2+6) = 0.50`). Below that nothing is guessed: the sentence counts
 * as **not comparable**, not as passed.
 */
export const MIN_FORBIDDEN_CORE_TOKENS = 2;

/**
 * The core of a forbidden statement, in two disclosed stages.
 *
 * 1. **The quotation.** Where the case book puts the forbidden statement in
 *    quotation marks — "authority check missing", "the update runs after the
 *    end of the program" — it is there verbatim, and that is the safest core
 *    there is. Every quotation in the first clause becomes a core of its own;
 *    a produced statement that reaches one of them violates the sentence.
 * 2. **The negation.** Without a usable quotation, the first clause without
 *    its packaging (`FORBIDDEN_PACKAGING`) remains.
 *
 * If less than `MIN_FORBIDDEN_CORE_TOKENS` remains after that, there is no
 * core — the sentence is not comparable and is counted as such.
 */
/**
 * Quotation marks: English `"…"`/`“…”`, and the German „…" of the case book
 * before 01.10.2026 — opened with U+201E and closed sometimes with U+201C,
 * sometimes with the straight `"`. All of them are taken.
 */
const QUOTED_CORE = /(?:„|"|“)([^„"“”]*?)["“”]/g;

export function forbiddenCores(clause: string): string[] {
  const marks = clause.matchAll(QUOTED_CORE);
  // **Nothing** is stripped inside a quotation: it stands verbatim for the
  // forbidden statement, and whatever is in it belongs to it. The packaging
  // always lies outside the quotation marks — in `No business statement
  // "NO_AUTH is reported"`, "reported" is part of the statement, not of the
  // prohibition.
  const quoted = [...marks].map((match) => match[1]);
  if (quoted.length > 0) {
    // **The quotation is final.** Where the case book put the forbidden
    // statement in quotation marks, it said exactly which words are
    // forbidden. If the quotation is not enough for a core, the sentence is
    // **not** widened to its surroundings — the measure would then claim
    // something the case did not forbid in that form. Measured, not assumed:
    // exactly this widening turned the counter-probe F0 in
    // `tests/korpus-mutation.spec.ts` red on 23.09.2026. From the then-German
    // sentence "no business statement 'it outputs 0'" (quotation: one content
    // word) came the core «business statement it outputs 0», and it hit, at
    // 0.50, the expected statement "the counter value is output" — a true
    // statement, counted as a hallucination. The word "business statement"
    // came from the packaging.
    return quoted.filter((core) => statementTokens(core).size >= MIN_FORBIDDEN_CORE_TOKENS);
  }
  const core = stripPackaging(clause);
  return statementTokens(core).size >= MIN_FORBIDDEN_CORE_TOKENS ? [core] : [];
}

/** One sentence from `forbiddenConclusions`, broken down. */
export function parseForbiddenConclusion(raw: string, fallbackFile: string | null): ForbiddenConclusion {
  const dash = raw.indexOf('—');
  const prefix = dash > 0 ? raw.slice(0, dash).trim() : '';
  const isScope = dash > 0 && forbiddenScopeResidue(prefix) === '';
  const body = isScope ? raw.slice(dash + 1).trim() : raw.trim();
  const anchors = isScope ? forbiddenAnchors(prefix, fallbackFile) : [];
  const clause = forbiddenClause(body);
  const cores = forbiddenCores(clause);
  return {
    raw,
    scopeText: isScope ? prefix : null,
    anchors,
    clause,
    cores,
    why:
      cores.length > 0
        ? ''
        : `not comparable: no core of ${MIN_FORBIDDEN_CORE_TOKENS} content words can be formed from "${clause}"`,
  };
}

/** All forbidden statements of a case, broken down. */
export function readForbiddenConclusions(korpusCase: KorpusCase): ForbiddenConclusion[] {
  const fallback = korpusCase.sources[0]?.name ?? null;
  return (korpusCase.expected.forbiddenConclusions ?? []).map((raw) => parseForbiddenConclusion(raw, fallback));
}

/** A violation: which forbidden sentence, by which produced statement, with which score. */
export interface ForbiddenViolation {
  conclusion: ForbiddenConclusion;
  statementId: string;
  core: string;
  score: number;
}

/**
 * The comparison itself — the same threshold, the same anchors, inverted sign.
 *
 * Scope: a sentence **with** an anchor is measured only against produced
 * statements at the same ABAP statement (`anchorKeys`, as in 17.5); a sentence
 * **without** an anchor against every produced statement of the case
 * (`FORBIDDEN_WHOLE_SLICE`).
 */
export function forbiddenViolations(
  conclusions: ForbiddenConclusion[],
  reading: EngineReading,
): ForbiddenViolation[] {
  const produced = reading.businessStatements;
  const producedKeys = produced.map((statement) => anchorKeys(statement.anchors, reading));
  const violations: ForbiddenViolation[] = [];
  for (const conclusion of conclusions) {
    if (conclusion.cores.length === 0) continue;
    const keys = anchorKeys(conclusion.anchors, reading);
    for (let p = 0; p < produced.length; p += 1) {
      const inScope = keys.size === 0 || [...keys].some((key) => producedKeys[p].has(key));
      if (!inScope) continue;
      for (const core of conclusion.cores) {
        const score = statementSimilarity(core, produced[p].text);
        if (score >= STATEMENT_MATCH_THRESHOLD) {
          violations.push({ conclusion, statementId: produced[p].id, core, score });
        }
      }
    }
  }
  return violations;
}

/**
 * Business statements — the comparison that was none until 23.09.2026.
 *
 * Until 1.9 the class stood at `agree` 68 times, because the only check — do
 * the anchors point into the source? — passed. 1.9 turned that into an honest
 * `anchor_validation_passed` and hard-wired the facet to `disagree`. Honest,
 * but blind: 0 agree / 68 disagree did not mean "the product fails" but
 * "nothing was compared", and as long as that stands, no prompt change and no
 * model change can show whether it improved anything (roadmap 17.5).
 *
 * This comparison really measures, and **deterministically**: no model as
 * judge, no network, no key. It has three parts, and each is open:
 *
 * 1. **The anchor is the key** (`anchorKeys`). Two statements about the same
 *    ABAP statement are comparable, two about different ones are not. A
 *    statement without a counterpart at the same anchor is **not compared** —
 *    it counts in the denominator, never in the numerator.
 * 2. **The text measure** (`statementSimilarity`) is a Dice coefficient over
 *    normalised content words. Simple and recomputable, with a threshold
 *    calibrated on the corpus itself (see `STATEMENT_MATCH_THRESHOLD`).
 * 3. **The producer** (`StatementProducer`) is interchangeable. Since 17.7 the
 *    default is `ENGINE_PRODUCER` — `lib/abap/business-statement.ts`,
 *    deterministic and without a model. `NO_PRODUCER` stays alongside because
 *    the sensitivity probe still measures the empty state against it. Rule 6
 *    in the skeleton is untouched by this: the node label stays a verbatim
 *    token, the business statement is a layer of its own in a file of its own.
 */
function compareBusinessStatements(korpusCase: KorpusCase, reading: EngineReading): ClassResult {
  const statements = korpusCase.expected.businessStatements;
  const byName = new Map(korpusCase.sources.map((source) => [source.name, source.lineCount]));
  const done = (core: ClassCore, aspects: FacetAspect[], scope: { compared: number; total: number }): ClassResult => ({
    ...core,
    scope,
    aspects,
  });

  const produced = reading.businessStatements;

  // --- The forbidden statements (roadmap 17.9) ------------------------------
  //
  // The same machine as the content comparison, inverted: the same Dice
  // coefficient, the same threshold, the same anchor logic — only here a hit
  // is an **error**. What a core is and what stays not comparable is in
  // `forbiddenCores`; how statements without an anchor are treated, in
  // `FORBIDDEN_WHOLE_SLICE`.
  //
  // Measured before the branch without an expected business statement, not
  // after it: the forbidden statements do not depend on the expected
  // statements but on what the producer says — and it says something even in
  // a case without an expected statement. Until the QA review of 4b4586aff273
  // this branch returned first, and a forbidden statement in such a case went
  // unchecked.
  const conclusions = readForbiddenConclusions(korpusCase);
  const comparableConclusions = conclusions.filter((entry) => entry.cores.length > 0);
  const uncomparableConclusions = conclusions.filter((entry) => entry.cores.length === 0);
  const violations = forbiddenViolations(comparableConclusions, reading);
  const violated = new Set(violations.map((entry) => entry.conclusion.raw));
  const forbiddenChecked = produced.length > 0 && comparableConclusions.length > 0;
  const forbiddenFacet = facet(
    'verbotene-aussagen',
    forbiddenChecked ? comparableConclusions.length - violated.size : 0,
    comparableConclusions.length,
    conclusions.length === 0
      ? 'Dieser Fall nennt keine verbotene Aussage; es gibt hier nichts zu verletzen und nichts zu belegen.'
      : comparableConclusions.length === 0
        ? `Alle ${conclusions.length} verbotenen Aussagen dieses Falls sind nicht vergleichbar: aus keiner ` +
          `lässt sich ein Kern mit ${MIN_FORBIDDEN_CORE_TOKENS} Inhaltswörtern bilden (forbiddenCores). ` +
          `${sample(uncomparableConclusions.map((entry) => entry.clause))}.`
        : !forbiddenChecked
          ? `${conclusions.length} verbotene Aussage(n), davon ${comparableConclusions.length} mit einem Kern — ` +
            `aber kein erzeugter Satz, gegen den sich messen ließe. ${reading.producer.note}`
          : `Zähler: eingehaltene verbotene Aussagen. Nenner: die ${comparableConclusions.length} von ` +
            `${conclusions.length}, aus denen sich ein Kern bilden lässt (forbiddenCores). ` +
            `Nicht vergleichbar und deshalb weder verletzt noch bestanden: ` +
            `${uncomparableConclusions.length === 0 ? 'keine' : sample(uncomparableConclusions.map((entry) => entry.clause))}.`,
    forbiddenChecked ? 'compared' : 'not_checked',
  );
  const forbiddenEvidence =
    conclusions.length === 0
      ? ' Der Fall nennt keine verbotene Aussage.'
      : ` Verbotene Aussagen: ${comparableConclusions.length} von ${conclusions.length} mit Kern` +
        `${forbiddenChecked ? '' : ' (nichts erzeugt, also nichts gemessen)'}, ` +
        `${violated.size} davon verletzt: ${sample(
          violations.map((entry) => `${entry.statementId} → «${entry.core}» ${entry.score.toFixed(2)}`),
        )}.`;

  if (statements.length === 0) {
    if (conclusions.length === 0) {
      return done(
        {
          case: korpusCase.id,
          class: 'fachsaetze',
          state: 'disagree',
          verdict: 'nicht-vergleichbar',
          evidence:
            'Der Fall führt keine fachlichen Ground-Truth-Kandidaten; es gibt hier weder etwas zu prüfen noch etwas zu vergleichen.',
        },
        [
          facet('fachsatzinhalt', 0, 0, 'Kein Sollfachsatz im Fall.', 'not_checked'),
          facet(
            'verbotene-aussagen',
            0,
            0,
            'Kein Sollfachsatz im Fall; ohne erzeugte Aussage gibt es auch keine verbotene zu verletzen.',
            'not_checked',
          ),
        ],
        { compared: 0, total: 0 },
      );
    }
    return done(
      {
        case: korpusCase.id,
        class: 'fachsaetze',
        state: 'disagree',
        // A forbidden statement stays a producer defect even when the case
        // carries no expected statement that could otherwise be compared.
        verdict: violated.size > 0 ? 'engine-defekt' : 'nicht-vergleichbar',
        evidence:
          `Der Fall führt keine fachlichen Ground-Truth-Kandidaten; es gibt keinen Sollsatz zu vergleichen. ` +
          `Erzeuger „${reading.producer.name}" lieferte ${produced.length} Satz/Sätze.${forbiddenEvidence}`,
      },
      [facet('fachsatzinhalt', 0, 0, 'Kein Sollfachsatz im Fall.', 'not_checked'), forbiddenFacet],
      { compared: 0, total: 0 },
    );
  }

  // --- Part 1: the anchor check, unchanged since 1.9 -------------------------
  const broken: string[] = [];
  let checked = 0;
  for (const statement of statements) {
    for (const anchor of statement.anchors) {
      checked += 1;
      const limit = anchor.file ? byName.get(anchor.file) : undefined;
      if (limit == null) broken.push(`${statement.id}: Datei ${anchor.file ?? '?'} nicht im Fall`);
      else if (anchor.line == null || anchor.line < 1 || anchor.line > limit) {
        broken.push(`${statement.id}: Zeile ${anchor.line} außerhalb von ${anchor.file} (${limit} Zeilen)`);
      }
    }
  }

  // --- Part 2: the content, with the anchor as key ---------------------------
  const keysOf = (anchors: Array<{ file: string | null; line: number | null }>) => anchorKeys(anchors, reading);

  /**
   * All pairs that talk about the same place at all, with their score. The
   * matching is **one-to-one and greedy**: best pair first, then both sides
   * are used up. Without this rule a single produced statement could credit
   * two expected statements at the same anchor — the corpus has exactly such
   * pairs (CC-042-B01/B02 share line 4 and differ only in the table name,
   * Dice 0.67). On a tie the number of shared anchor keys decides, then the
   * id; that makes the run reproducible.
   */
  const pairs: Array<{ expected: number; produced: number; score: number; shared: number }> = [];
  const expectedKeys = statements.map((statement) => keysOf(statement.anchors));
  const producedKeys = produced.map((statement) => keysOf(statement.anchors));
  for (let e = 0; e < statements.length; e += 1) {
    for (let p = 0; p < produced.length; p += 1) {
      const shared = [...expectedKeys[e]].filter((key) => producedKeys[p].has(key)).length;
      if (shared === 0) continue;
      pairs.push({ expected: e, produced: p, score: statementSimilarity(statements[e].text ?? '', produced[p].text), shared });
    }
  }
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      b.shared - a.shared ||
      statements[a.expected].id.localeCompare(statements[b.expected].id) ||
      (produced[a.produced].id ?? '').localeCompare(produced[b.produced].id ?? ''),
  );
  const takenExpected = new Set<number>();
  const takenProduced = new Set<number>();
  const hits: string[] = [];
  const misses: string[] = [];
  for (const pair of pairs) {
    if (takenExpected.has(pair.expected) || takenProduced.has(pair.produced)) continue;
    takenExpected.add(pair.expected);
    takenProduced.add(pair.produced);
    const label = `${statements[pair.expected].id}↔${produced[pair.produced].id ?? '?'} ${pair.score.toFixed(2)}`;
    if (pair.score >= STATEMENT_MATCH_THRESHOLD) hits.push(label);
    else misses.push(label);
  }
  const uncovered = statements.filter((_, index) => !takenExpected.has(index)).map((statement) => statement.id);
  const comparedCount = takenExpected.size;
  const extra = produced.filter((_, index) => !takenProduced.has(index)).length;

  // --- Part 3, the forbidden statements, sits above, before the branch
  // without an expected business statement (`forbiddenFacet`, `forbiddenEvidence`).

  // --- Part 4: status, numerator, denominator ------------------------------
  const aspects: FacetAspect[] = [
    facet(
      'ankerpruefung',
      checked - broken.length,
      checked,
      'Rein syntaktisch: zeigt jeder Anker in eine Zeile, die es in der Quelle gibt?',
      broken.length === 0 ? 'anchor_validation_passed' : 'compared',
    ),
    facet(
      'fachsatzabdeckung',
      comparedCount,
      statements.length,
      produced.length === 0
        ? `Kein Erzeuger: ${reading.producer.note} Dieser Nenner ist der Grund, warum die Facette nicht grün sein darf.`
        : `Wie viele Sollsätze haben überhaupt einen erzeugten Satz an derselben ABAP-Anweisung? Erzeuger: ${reading.producer.name}.`,
      comparedCount > 0 ? 'compared' : 'not_checked',
    ),
    facet(
      'fachsatzinhalt',
      hits.length,
      comparedCount,
      comparedCount === 0
        ? `Nichts war vergleichbar — kein erzeugter Satz teilt eine Anweisung mit einem Sollsatz. ${reading.producer.note}`
        : `Dice über normalisierte Inhaltswörter, Schwelle ${STATEMENT_MATCH_THRESHOLD.toFixed(2)} (am Korpus kalibriert, siehe STATEMENT_MATCH_THRESHOLD).`,
      comparedCount > 0 ? 'compared' : 'not_checked',
    ),
    forbiddenFacet,
  ];

  /**
   * **Why half coverage is not enough here, unlike in `skelett`.**
   *
   * There the 50 % rule stands because the engine does not carry whole node
   * kinds — that is non-comparability, not deviation. Here it is the other way
   * round: an expected statement with no produced counterpart at the same
   * statement means the producer read the same source and said nothing at
   * that place. A green over a producer that silently leaves out a third of
   * the statements would be exactly the green that means "not checked" (1.9,
   * CR-05).
   *
   * What deliberately does **not** count here: produced statements with no
   * expected statement at the same place (`extra`). The case book nowhere
   * declares its business statement list complete — `declaredEmpty` exists for
   * findings and objects, not for business statements — and what the corpus
   * does not claim, this comparison must not use against a producer. So the
   * number goes into the evidence, and it is the quantity 17.6 has to decide
   * on.
   */
  const agree =
    broken.length === 0 && comparedCount === statements.length && misses.length === 0 && violated.size === 0;
  const verdict: Verdict | null = agree
    ? null
    : broken.length > 0
      ? 'korpus-offen'
      : violated.size > 0
        ? // A forbidden statement is a producer defect and not an open
          // question for the corpus: the case wrote it down explicitly.
          'engine-defekt'
        : produced.length === 0 || comparedCount === 0
          ? 'nicht-vergleichbar'
          : 'engine-defekt';

  const head =
    `${statements.length} Sollfachsatz/-sätze mit ${checked} Anker(n); ${broken.length} zeigen nicht in den Quelltext: ${sample(broken)}. ` +
    `Erzeuger „${reading.producer.name}" lieferte ${produced.length} Satz/Sätze. `;
  const tail =
    produced.length === 0
      ? `Nichts zu vergleichen — ${reading.producer.note} Der Ankercheck allein ist keine Übereinstimmung (anchor_validation_passed).`
      : comparedCount === 0
        ? `Kein erzeugter Satz steht an einer ABAP-Anweisung, die auch ein Sollsatz nennt — nicht verglichen, nicht verfehlt.`
        : `${comparedCount} von ${statements.length} Sollsätzen vergleichbar (Anker geteilt), davon ${hits.length} über der Schwelle: ${sample(hits)}. ` +
          `Darunter: ${sample(misses)}. Ohne Gegenstück: ${sample(uncovered)}. Erzeugte Sätze ohne Sollsatz an derselben Stelle: ${extra}.`;
  return done(
    {
      case: korpusCase.id,
      class: 'fachsaetze',
      state: agree ? 'agree' : 'disagree',
      verdict,
      evidence: `${head}${tail}${forbiddenEvidence}`,
    },
    aspects,
    { compared: comparedCount, total: statements.length },
  );
}

export function compareCase(korpusCase: KorpusCase, reading: EngineReading): ClassResult[] {
  return [
    compareFindings(korpusCase, reading),
    compareLevel(korpusCase, reading),
    compareObjects(korpusCase, reading),
    compareSkeleton(korpusCase, reading),
    compareBusinessStatements(korpusCase, reading),
  ];
}

export function compareAll(mutate?: SkeletonMutation, producer: StatementProducer = ENGINE_PRODUCER): ClassResult[] {
  const results: ClassResult[] = [];
  for (const korpusCase of readCases()) {
    results.push(...compareCase(korpusCase, readWithEngine(korpusCase, mutate, producer)));
  }
  return results;
}

export function resultId(result: Pick<ClassResult, 'case' | 'class'>): string {
  return `${result.case}|${result.class}`;
}

// ---------------------------------------------------------------------------
// The ratchet
// ---------------------------------------------------------------------------

export interface BaselineEntry {
  case: string;
  class: StatementClass;
  state: 'agree' | 'disagree';
  verdict: Verdict | null;
  /**
   * The facet's numerator and denominator (1.9). Without them the ratchet was
   * blind to the difference between "checked and agreeing" and "not checked":
   * CC-001 stood at `agree` with the reason "2 of 8 nodes comparable".
   */
  scope: { compared: number; total: number };
  /** The check status per sub-check, with its own denominator. */
  aspects: FacetAspect[];
  reason: string;
}

export interface Baseline {
  book: { path: string; sha256: string };
  written: string;
  entries: BaselineEntry[];
}

export function baselinePath(): string {
  return join(KORPUS_ROOT, 'baseline.json');
}

export function readBaseline(): Baseline {
  return JSON.parse(readFileSync(baselinePath(), 'utf8')) as Baseline;
}

export function baselineExists(): boolean {
  return existsSync(baselinePath());
}
