/**
 * Der Referenzkorpus gegen die Engine — die Vergleichsschicht.
 *
 * Der Korpus und die Engine sprechen nicht dieselbe Sprache. Der Korpus
 * arbeitet mit Regelnummern (`R01@1.0.0`), einem Clean-Core-Level A–D je
 * Artefakt, SAP-Objekten mit Eigentümer und Verwendung, einem Prozessskelett
 * mit Knotentypen und Fachsätzen. `lib/abap/` kennt davon: Befunde mit einer
 * `kind`-Marke und einer Startzeile, eine Datenkopplung über Tabellennamen,
 * Verzweigungen und Blöcke, und — in einem *anderen* Modul, das nicht am
 * Evidenzbericht hängt — eine Katalognote A–D je Objekt.
 *
 * Deshalb wird nicht „der Fall" verglichen, sondern je **Aussageklasse**
 * getrennt, und jede Klasse sagt von sich aus, ob sie überhaupt vergleichbar
 * ist. Eine Klasse, für die die Engine kein Gegenstück hat, ist
 * `nicht-vergleichbar` — das ist kein Fehler des Korpus und kein Fehler der
 * Engine, sondern eine Aussage über den Stand von Phase 2, und sie wird als
 * solche gezählt.
 *
 * Was hier bewusst *nicht* passiert: die Sollantworten werden nicht
 * umgedeutet, damit sie passen. Wo die Zuordnung eine Auslegung ist — und die
 * Regel-auf-`kind`-Tabelle unten ist eine —, steht sie an einer Stelle,
 * sichtbar und mit Begründung, statt verteilt in Vergleichen.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { buildAbapEvidence, type AbapEvidenceReport, type EvidenceKind } from '../../lib/abap/evidence-model';
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
import { gradeSapObjectUse } from '../../lib/abap/catalog-service';
import {
  objectUseFromAccess,
  worstGrade,
  type CloudReadinessGrade,
  type ObjectUse,
} from '../../lib/abap/abcd-classification';

/**
 * Das Bündel. `KORPUS_ROOT` lässt sich überschreiben, damit derselbe Vergleich
 * gegen ein älteres Bündel laufen kann, ohne das im Baum zu tauschen — so
 * entsteht die Differenz zwischen zwei Fassungen des Fallbuchs aus zwei Läufen
 * desselben Codes und nicht aus zwei Erinnerungen.
 */
export const KORPUS_ROOT = process.env.KORPUS_ROOT ?? join(process.cwd(), 'tests/korpus');

// ---------------------------------------------------------------------------
// Das Bündel
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
       * Die Felder, die 2.15 (Gateway-Klasse), 2.16 (Lane) und 2.17
       * (Parallelität) füllen werden. Heute steht in keiner der 68
       * `expected.json` eines davon; sie werden trotzdem gelesen, damit der
       * Vergleicher rot wird, sobald ein Fall sie trägt und die Engine sie
       * nicht liefert — und damit die Facette bis dahin „nicht geprüft" sagt
       * statt `agree` (CR-05).
       */
      gatewayClass?: string | null;
      parallel?: boolean | null;
      lane?: string | null;
    }>;
    edges: Array<{ from: string; to: string; condition: string | null }>;
    /** 2.16: Lanes mit Beweis. Heute in keinem Fall gesetzt. */
    lanes?: Array<{ id: string; evidence?: string | null; anchor?: KorpusAnchor | null }> | null;
  };
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
// Die Auslegung, die dieser Vergleich braucht — an einer Stelle
// ---------------------------------------------------------------------------

/**
 * Korpusregel -> Befundmarke der Engine, **an einem benannten Konstrukt**.
 *
 * Die Engine vergibt keine Regelnummern (`EvidenceFinding` hat kein `rule`-Feld
 * und keine Regelversion); ihre stabile Identität ist `kind`. Eine Regel auf
 * eine Marke abzubilden reicht deshalb nicht: R25 (LUW) deckt im Korpus
 * `IN UPDATE TASK`, `COMMIT WORK`, `ROLLBACK WORK`, `BAPI_TRANSACTION_COMMIT`
 * und die impliziten Commits ab — die Engine kennt davon genau zwei Marken.
 * Ein Sollbefund an `ROLLBACK WORK` als „von der Engine verfehlt" zu zählen
 * wäre falsch: die Engine führt diese Aussage nicht, sie verfehlt sie nicht.
 *
 * Eine Brücke gilt deshalb erst, wenn die **ABAP-Anweisung am Anker** das
 * benannte Konstrukt trägt. Das ist ein Blick in den Quelltext, nicht in die
 * Prosa der Sollaussage, und damit nachprüfbar. Findet keine Brücke ein
 * Konstrukt, ist der Sollbefund `nicht-vergleichbar` — gezählt, nicht verfehlt.
 */
export interface RuleBridge {
  rule: string;
  kinds: EvidenceKind[];
  construct: RegExp;
  /** Warum die Engine hier dieselbe Sache meint. */
  why: string;
}

export const RULE_BRIDGES: RuleBridge[] = [
  {
    rule: 'R01',
    kinds: ['standard-table-read'],
    construct: /\bSELECT\b/i,
    why: 'Direktes Lesen eines SAP-Objekts; die Engine meldet denselben SELECT als standard-table-read.',
  },
  {
    rule: 'R01',
    kinds: ['standard-table-read'],
    construct: /\bGET\s+(?!BADI|TIME|PARAMETER|RUN|BIT|CURSOR|REFERENCE|LOCALE|DATASET|PF-STATUS|PROPERTY)\w/i,
    why:
      'Lesen über eine logische Datenbank. R01 Bedingung (c) verweist das LDB-Lesen an R33, und R33 sagt, dass ' +
      '`GET <node>` den Satz je Ereignis erhält — der SELECT läuft in der LDB, nicht in dieser Quelle. Genau das ' +
      'meldet die Engine am GET: einen standard-table-read über die Route logical-database, mit dem Satz in der ' +
      'Begründung. Die Ausnahmeliste hält die anderen GET-Anweisungen heraus, die keine LDB-Knoten sind ' +
      '(GET BADI, GET TIME, GET PARAMETER …).',
  },
  {
    rule: 'R02',
    kinds: ['standard-table-write'],
    construct: /\b(INSERT|UPDATE|MODIFY|DELETE)\b/i,
    why: 'Direktes Schreiben auf eine SAP-Tabelle; die Engine meldet dasselbe DML als standard-table-write.',
  },
  {
    rule: 'R13b',
    kinds: ['native-sql'],
    construct: /(EXEC\s+SQL|cl_sql_statement|execute_update|execute_query)/i,
    why: 'Literal mit Konsumenten — von den Konsumentenklassen der Regel kennt die Engine nur Native SQL und ADBC.',
  },
  {
    rule: 'R25',
    kinds: ['update-task'],
    construct: /\bIN\s+UPDATE\s+TASK\b/i,
    why: 'Registrierung beim Verbucher; die Engine führt dafür die Marke update-task.',
  },
  {
    rule: 'R25',
    kinds: ['commit-work'],
    construct: /\bCOMMIT\s+WORK\b/i,
    why: 'Explizite Transaktionsgrenze; die Engine führt dafür die Marke commit-work.',
  },
  {
    rule: 'R28',
    kinds: ['authority-check'],
    construct: /\bAUTHORITY-CHECK\b/i,
    why: 'Von der Aussageklasse Sicherheit kennt die Engine genau den AUTHORITY-CHECK — nicht Injektion, nicht PRIVILEGED ACCESS, nicht CLIENT SPECIFIED.',
  },
  {
    rule: 'R32',
    kinds: ['enhancement', 'modification'],
    construct: /(ENHANCEMENT|CALL\s+CUSTOMER-FUNCTION|CL_EXITHANDLER|GET\s+BADI)/i,
    why: 'Hostkontext an einem syntaktischen Marker; die Engine liest dieselben Marker als enhancement bzw. modification.',
  },
  {
    rule: 'R34',
    kinds: ['submit'],
    construct: /\bSUBMIT\b/i,
    why: 'Programmübergreifender Aufruf über SUBMIT; die Engine führt dafür die Marke submit.',
  },
  {
    rule: 'R34',
    kinds: ['bdc'],
    construct: /\bCALL\s+TRANSACTION\b/i,
    why: 'Batch-Input über CALL TRANSACTION; die Engine führt dafür die Marke bdc.',
  },
  {
    rule: 'R34',
    kinds: ['rfc-call'],
    construct: /\bDESTINATION\b/i,
    why: 'Systemgrenze über einen RFC mit Destination; die Engine führt dafür die Marke rfc-call.',
  },
];

/**
 * Welche Befundmarken der Engine überhaupt in einer Brücke vorkommen. Nur diese
 * zählen bei den Negativkontrollen als Widerspruch; ein `hardcoded-value` in
 * CC-016 wäre kein Verstoß gegen „keine Findings im v1-Regelvertrag", weil der
 * Vertrag diese Aussage nicht führt.
 */
const MAPPED_KINDS = new Set<EvidenceKind>(RULE_BRIDGES.flatMap((bridge) => bridge.kinds));
const BRIDGED_RULES = new Set(RULE_BRIDGES.map((bridge) => bridge.rule));

/**
 * Verwendung im Korpus -> Zugriffsart der Datenkopplung. Nur Tabellenobjekte
 * (`objectType: 'TABL'`) werden verglichen: das ist die Fläche, die
 * `extractDataCoupling` modelliert. Ein Funktionsbaustein, ein BAdI oder eine
 * Nachrichtenklasse steht im Korpus als Objekt, in der Engine aber nicht in
 * derselben Liste — das ist nicht vergleichbar, nicht fehlend.
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

/** Das Deployment, mit dem die Engine gefahren wird — aus dem Zielprofil des Falls. */
export function deploymentOf(profile: KorpusProfile): 'public' | 'private' {
  const first = profile.profiles && profile.profiles.length > 0 ? profile.profiles[0] : profile;
  const edition = (first.edition ?? '').toLowerCase();
  const language = (first.abap_language_version ?? '').toLowerCase();
  return edition.includes('btp') || language.includes('cloud') ? 'public' : 'private';
}

// ---------------------------------------------------------------------------
// Ein Lauf der Engine über einen Fall
// ---------------------------------------------------------------------------

export interface EngineReading {
  perFile: Array<{
    file: string;
    evidence: AbapEvidenceReport;
    facts: ProcessFacts;
    /**
     * Das **echte** Prozessskelett aus `lib/abap/process-skeleton.ts`.
     *
     * Bis 1.9 stand hier nur `facts`, und `compareSkeleton` verglich
     * zeilenweise gegen Verzweigungen und Blöcke — weder Knotenart noch Kante.
     * Ein Vergleicher, der das Skelett nie aufruft, kann keine Änderung am
     * Skelett fangen; genau das ist der Zweck dieser Facette, und genau darauf
     * bauen 2.15, 2.16 und 2.17 auf.
     */
    skeleton: ProcessSkeleton;
    statements: AbapStatement[];
    tables: Array<{ name: string; access: string; custom: boolean }>;
  }>;
  /** Alle Objektnamen, die die Engine über den ganzen Fall gesehen hat. */
  objectNames: Set<string>;
  /**
   * Die schlechteste Note über alle gesehenen Objekte — je Objekt die Note, die
   * das Analyse-Panel für dasselbe Objekt zeigt: `gradeSapObjectUse` mit der
   * Zugriffsart aus `extractDataCoupling`, dieselbe Funktion und dieselbe
   * Eingabe wie `/api/abcd-classify`. Ein Name, den nur ein Befund nennt, hat
   * keine Zugriffsart und bekommt die Note seines Namens.
   *
   * Die Rollup-Regel selbst (`worstGrade`) ist eine Bildung dieses Vergleichs:
   * das Produkt zeigt keine Gesamtnote für ein Programm, nur eine Note je Zeile
   * und deren Verteilung.
   */
  worst: CloudReadinessGrade;
  /** Nur als Lebenszeichen: die Route ist im Korpus ohne Gegenstück. */
  routeCount: number;
  /**
   * Die Fachsätze, die dieser Lauf erzeugt hat — heute keine (Roadmap 17.5).
   *
   * Sie stehen hier und nicht im Vergleicher, weil der Vergleicher sonst
   * beides wäre: Erzeuger und Richter. Wer 17.6 entscheidet, hängt seinen
   * Erzeuger an `readWithEngine` und ändert an der Facette nichts.
   */
  businessStatements: GeneratedStatement[];
  /** Wer sie erzeugt hat. Steht in jedem Beleg der Facette `fachsaetze`. */
  producer: StatementProducer;
}

/**
 * Ein Eingriff in das Gelesene, **bevor** verglichen wird.
 *
 * Nur für die Empfindlichkeitsprobe (`tests/korpus-mutation.spec.ts`): ein
 * Vergleicher, der bei einer verfälschten Engine-Antwort grün bleibt, misst
 * nichts. Der Eingriff verändert nie `lib/` und ist im Normallauf nicht gesetzt.
 */
export type SkeletonMutation = (skeleton: ProcessSkeleton, file: string) => ProcessSkeleton;

export function readWithEngine(
  korpusCase: KorpusCase,
  mutate?: SkeletonMutation,
  producer: StatementProducer = NO_PRODUCER,
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
      // Über mehrere Dateien gilt, was das Panel je Datei sähe, zusammengefasst:
      // ein Schreiben irgendwo macht die Verwendung zum Schreiben.
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
// Der Vergleich, je Aussageklasse
// ---------------------------------------------------------------------------

export const STATEMENT_CLASSES = ['befunde', 'level', 'objekte', 'skelett', 'fachsaetze'] as const;
export type StatementClass = (typeof STATEMENT_CLASSES)[number];

export type Verdict = 'engine-defekt' | 'korpus-offen' | 'nicht-vergleichbar';

/**
 * Was eine Facette von sich aus über ihren eigenen Umfang sagt (Roadmap 1.9).
 *
 * Vor diesem Schritt hatte eine Aussageklasse nur `agree`/`disagree`, und das
 * war die Lücke: `skelett` stand 47-mal auf `agree`, während über diese Fälle
 * **71 von 390 Sollknoten (18,2 %)** überhaupt verglichen wurden, und
 * `fachsaetze` stand 68-mal auf `agree` mit dem Grund „die Engine erzeugt keine
 * Fachsätze". Ein Grün, das „nicht geprüft" heißt, ist genau der Befund CR-05
 * des Gegenreviews. Deshalb trägt jede Facette jetzt ihren Prüfstatus:
 *
 * - `compared` — es wurde wirklich gegen die Engine verglichen,
 * - `not_checked` — die Engine (oder der Fall) führt diese Aussage nicht; das
 *   darf nie zu `agree` führen,
 * - `anchor_validation_passed` — es wurde **nur** geprüft, dass die Anker in
 *   den Quelltext zeigen. Ein syntaktischer Ankercheck ist keine Aussage über
 *   den Inhalt, und er bekommt deshalb einen eigenen Namen statt eines Grüns.
 */
export type AspectStatus = 'compared' | 'not_checked' | 'anchor_validation_passed';

export interface FacetAspect {
  /** Der Name der Teilprüfung, so wie die Roadmap sie nennt. */
  name: string;
  status: AspectStatus;
  /** Zähler und Nenner: wie viel von dem, was der Fall behauptet, geprüft wurde. */
  compared: number;
  total: number;
  /** Warum der Status so ist. Bei `not_checked` die Stelle, die ihn auflöst. */
  note: string;
}

export interface ClassResult {
  case: string;
  class: StatementClass;
  state: 'agree' | 'disagree';
  /** Nur bei `disagree` gesetzt — der Grund, den die Ratsche festhält. */
  verdict: Verdict | null;
  /**
   * Zähler und Nenner der Facette: wie viele Sollaussagen dieser Klasse
   * überhaupt vergleichbar waren, von wie vielen. `agree` unter der Hälfte ist
   * in `skelett` verboten (1.9).
   */
  scope: { compared: number; total: number };
  /** Die Teilprüfungen dieser Facette, jede mit eigenem Status und Nenner. */
  aspects: FacetAspect[];
  /** Was tatsächlich verglichen wurde, in Zahlen und Beispielen. */
  evidence: string;
}

/** Der Kern eines Ergebnisses; Umfang und Facettenstatus kommen aus `done`. */
type ClassCore = Omit<ClassResult, 'scope' | 'aspects'>;

const GRADE_ORDER: CloudReadinessGrade[] = ['A', 'B', 'C', 'D'];

function levelRank(level: string | null): number {
  if (!level) return -1;
  const first = level.trim().charAt(0).toUpperCase();
  const index = GRADE_ORDER.indexOf(first as CloudReadinessGrade);
  return index;
}

/** Die ABAP-Anweisung, in deren Zeilenbereich eine Ankerzeile liegt. */
function statementAt(statements: AbapStatement[], line: number): AbapStatement | null {
  return statements.find((s) => s.lineStart <= line && line <= s.lineEnd) ?? null;
}

/**
 * Eine Teilprüfung mit Zähler und Nenner. Ohne Nenner ist ein Status eine
 * Behauptung: „geprüft" sagt nichts, solange offen bleibt, wovon.
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

  // Negativkontrolle: der Fall sagt in Worten, dass es keinen Befund gibt.
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
    const inStatement = entry.evidence.findings.filter(
      (f) => kinds.has(f.kind) && f.lineStart >= from && f.lineStart <= to,
    );
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
  // Die Klasse führt genau eine Sollaussage: das Level des Artefakts.
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
  // Strenger als der Fall. Das ist nur dann ein Defekt, wenn der Fall seine
  // mildere Antwort auf einen Nachfolger stützt, der im selben Katalog steht:
  // dann liest die Note denselben Eintrag und lässt die Hälfte davon liegen.
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
  // Namen, die der Fall nicht als Objekt führt. Nicht jeder ist ein Fehler —
  // der Fall nennt nur, was für die Sollantwort zählt —, aber ein Makroplatz-
  // halter oder eine lokale Variable in dieser Liste ist eine erfundene
  // Abhängigkeit, und die steht dann hier, wo sie jemand liest.
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
// Das Skelett — die Facette, die vor 1.9 nichts verglich
// ---------------------------------------------------------------------------

/**
 * Korpus-Knotenart -> Knotenart der Engine, **an einem benannten Konstrukt**.
 *
 * Dieselbe Disziplin wie bei `RULE_BRIDGES` und aus demselben Grund: die beiden
 * Vokabulare sind nicht deckungsgleich, und eine Zuordnung ohne Blick in den
 * Quelltext wäre eine Behauptung. Der Korpus schreibt `transaction` sowohl an
 * ein `CALL TRANSACTION` als auch an ein `COMMIT WORK` — das erste ist eine
 * Aufruf-Aktivität, das zweite eine LUW-Grenze, die `process-skeleton.ts`
 * bewusst als Anmerkung (`commit-boundary`) führt und nicht als Knoten. Eine
 * Brücke gilt deshalb erst, wenn die **ABAP-Anweisung am Anker** das benannte
 * Konstrukt trägt; sonst ist der Sollknoten `nicht-vergleichbar` — gezählt,
 * nicht verfehlt.
 *
 * Gemessen am 22.09.2026 über alle 68 Fälle (Probe gegen `buildProcessSkeleton`):
 * 43 von 49 Knoten der Korpusart `action` sitzen auf einer reinen Zuweisung
 * (`rv_route = 'INVALID'`, `APPEND … TO lt_…`, `MOVE-CORRESPONDING`). Das
 * Skelett zeichnet Wirkung und Fluss, keine Wertzuweisung — deshalb trägt
 * `action` ein Konstrukt und nicht die leere Erlaubnis.
 */
export interface SkeletonBridge {
  /** Die Knotenart, wie das Fallbuch sie schreibt. */
  type: string;
  /** Die Knotenarten aus `SkeletonNodeKind`, die dasselbe meinen. */
  kinds: SkeletonNodeKind[];
  /** Das Konstrukt, das die Anweisung am Anker tragen muss. */
  construct: RegExp;
  /** Warum die Engine hier dieselbe Sache meint. */
  why: string;
}

export const SKELETON_BRIDGES: SkeletonBridge[] = [
  {
    type: 'start',
    kinds: ['start'],
    construct: /[\s\S]/,
    why:
      'Prozessstart. Die Engine öffnet für jeden Ereignisblock und für das implizite START-OF-SELECTION einen ' +
      'Startknoten; welche Anweisung das ist, entscheidet sie selbst, deshalb ohne Konstruktfilter.',
  },
  {
    type: 'event_block',
    kinds: ['start'],
    construct: /[\s\S]/,
    why:
      'Ein Ereignisblock ist in §5.8 ein Startereignis der eigenen Region; die Engine führt ihn als Region mit ' +
      'einem Startknoten, nicht als eigene Knotenart.',
  },
  {
    type: 'end',
    kinds: ['end', 'end-error'],
    construct: /^(RETURN|EXIT|STOP|LEAVE|ENDFORM|ENDMETHOD|ENDMODULE|ENDFUNCTION|ENDLOOP|ENDIF|ENDCASE|ENDSELECT|MESSAGE|RAISE|ASSERT|CHECK|SUBMIT)\b/i,
    why:
      'Ende eines Pfades. Die Engine kennt `end` und `end-error`; welches von beiden, entscheidet sie an der ' +
      'Anweisung, und beide zählen hier als Treffer.',
  },
  {
    type: 'return',
    kinds: ['end', 'end-error'],
    construct: /^(RETURN|EXIT|LEAVE)\b/i,
    why: 'Wie `end`: der Fall zeichnet den Rücksprung als Ende des Pfades.',
  },
  {
    type: 'gateway',
    kinds: ['gateway'],
    construct: /^(IF|ELSEIF|ELSE|CASE|WHEN|CHECK|ASSERT|AT)\b/i,
    why:
      'Exklusives Gateway. Die Engine öffnet es an IF/ELSEIF/CASE/WHEN und an einem CHECK, das kein Laufschalter ' +
      'ist. Ein `gateway` auf einem CATCH ist damit nicht vergleichbar — TRY/CATCH ist keine Verzweigung des ' +
      'Lesers, sondern eine Lücke, die das Fallbuch §8 selbst als solche benennt.',
  },
  {
    type: 'loop',
    kinds: ['loop'],
    construct: /^(LOOP|DO|WHILE|SELECT|AT|PROVIDE)\b/i,
    why: 'Iteration. Das Skelett zeichnet jede Schleife als `loop`, auch `SELECT … ENDSELECT` und `DO`/`WHILE`.',
  },
  {
    type: 'read',
    kinds: ['read'],
    construct: /\b(SELECT|OPEN\s+CURSOR|FETCH|GET)\b/i,
    why: 'Lesender Datenspeicher; die Engine führt dafür `read`.',
  },
  {
    type: 'write',
    kinds: ['write'],
    construct: /\b(INSERT|UPDATE|MODIFY|DELETE)\b/i,
    why: 'Schreibender Datenspeicher; die Engine führt dafür `write`.',
  },
  {
    type: 'output',
    kinds: ['output', 'send-task', 'user-task', 'end-error'],
    construct: /^(WRITE|MESSAGE|NEW-PAGE|SKIP|ULINE|FORMAT|CALL\s+SCREEN|CALL\s+FUNCTION|PERFORM|LEAVE|TRANSFER|OPEN\s+DATASET|CLOSE\s+DATASET)\b/i,
    why:
      'Ausgabe. Die Engine unterscheidet die Ergebnisliste (`output`), das Versenden (`send-task`), die ' +
      'Bildschirmausgabe (`user-task`) und die Fehlermeldung, die den Pfad beendet (`end-error`); der Korpus ' +
      'fasst das als eine Art. Alle vier zählen deshalb als Treffer.',
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
    construct: /^(CALL\s+(FUNCTION|METHOD|SCREEN|TRANSACTION|BADI)|PERFORM|SUBMIT|MESSAGE|WRITE|EXPORT|IMPORT|TRANSFER|OPEN\s+DATASET|ENQUEUE|DEQUEUE|AUTHORITY-CHECK|SELECT|INSERT|UPDATE|MODIFY|DELETE|COMMIT|ROLLBACK)\b/i,
    why:
      'Ein Schritt ohne eigene Art im Fallbuch. Die Engine vergibt dem Schritt eine Art aus §5.8 — welche, ' +
      'entscheidet sie am Konstrukt —, deshalb zählt jede Aktivitätsart als Treffer. Eine reine Wertzuweisung ' +
      'trägt keines dieser Konstrukte: das Skelett zeichnet Wirkung und Fluss, keine Zuweisung, und ein Knoten ' +
      'darauf ist nicht vergleichbar statt verfehlt.',
  },
  {
    type: 'call',
    kinds: ['call-activity', 'service-task', 'sub-process', 'transaction', 'user-task', 'task'],
    construct: /^(CALL\s+(FUNCTION|METHOD|SCREEN|TRANSACTION|BADI)|PERFORM|SUBMIT)\b/i,
    why: 'Aufruf mit bekanntem Ziel; die Engine benennt ihn nach dem, was das Ziel tut.',
  },
  {
    type: 'opaque_call',
    kinds: ['call-opaque', 'service-task', 'call-activity', 'sub-process', 'transaction', 'user-task'],
    construct: /^(CALL\s+(FUNCTION|METHOD|SCREEN|TRANSACTION|BADI)|PERFORM|SUBMIT|CREATE\s+OBJECT)\b/i,
    why:
      'Aufruf, dessen Quelle der Leser nicht hat. Die Engine führt `call-opaque`, benennt den Aufruf aber nach ' +
      'seiner Art, wenn die Anweisung sie hergibt (ein `CALL FUNCTION` bleibt eine Service-Aktivität, auch wenn ' +
      'der Baustein nicht in der Scheibe liegt).',
  },
  {
    type: 'call-opaque',
    kinds: ['call-opaque'],
    construct: /[\s\S]/,
    why: 'Dieselbe Art, in der Schreibweise der Engine — ein Fall schreibt sie so.',
  },
  {
    type: 'transaction',
    kinds: ['transaction', 'call-activity'],
    construct: /\bCALL\s+TRANSACTION\b/i,
    why:
      'Aufruf-Aktivität auf eine Transaktion. **Nicht** die LUW-Grenze: der Korpus schreibt `transaction` auch an ' +
      'COMMIT WORK und ROLLBACK WORK, und die führt `process-skeleton.ts` bewusst als Anmerkung ' +
      '(`commit-boundary`), nicht als Knoten. Solche Knoten sind nicht vergleichbar.',
  },
  {
    type: 'external_program',
    kinds: ['call-activity', 'transaction'],
    construct: /\b(SUBMIT|CALL\s+TRANSACTION)\b/i,
    why: 'Programmübergreifender Aufruf; die Engine führt ihn als Aufruf-Aktivität.',
  },
  {
    type: 'update_task',
    kinds: ['service-task'],
    construct: /\bIN\s+UPDATE\s+TASK\b/i,
    why: 'Registrierung beim Verbucher; die Engine zeichnet den CALL FUNCTION als Service-Aktivität.',
  },
  {
    type: 'async',
    kinds: ['service-task'],
    construct: /\b(STARTING\s+NEW\s+TASK|IN\s+BACKGROUND\s+TASK|RECEIVE\s+RESULTS)\b/i,
    why:
      'Asynchroner Aufruf. Bis 2.17 gibt es dafür keine eigene Art — ein `STARTING NEW TASK` bleibt eine ' +
      'Service-Aktivität; die Parallelität wird als eigene Teilprüfung geführt, nicht hier versteckt.',
  },
  {
    type: 'rfc',
    kinds: ['service-task', 'call-activity'],
    construct: /\bDESTINATION\b/i,
    why: 'Systemgrenze über einen RFC mit Destination.',
  },
  {
    type: 'lock',
    kinds: ['service-task'],
    construct: /\b(ENQUEUE|DEQUEUE)_/i,
    why: 'Sperrbaustein; die Engine zeichnet ihn als Service-Aktivität wie jeden anderen CALL FUNCTION.',
  },
];

/**
 * Wie die Bedingung eines Sollflusses zur Kantenart der Engine steht.
 *
 * Das Fallbuch schreibt die Bedingung in Worten („always", „next iteration",
 * „no more rows") oder als Ausdruck aus der Quelle. Die Engine schreibt eine
 * Art. Mehr als die Art lässt sich hier nicht vergleichen, ohne die Sollangabe
 * umzudeuten — und der Bedingungstext selbst bleibt ungeprüft, weil Regel 6 ihn
 * wörtlich aus der Quelle nimmt, das Fallbuch ihn aber paraphrasiert.
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
 * Die drei Skelettaussagen, die der Vergleicher **noch nicht** vergleicht —
 * an einer Stelle, benannt, mit dem Roadmap-Schritt, der sie auflöst.
 *
 * Anlass: QA-Review von `9e408888bfec`, Fingerabdruck `c100d056f0d2`. Eine
 * Facette, deren Status am bloßen Vorhandensein des Sollfelds hängt, zählt
 * ungeprüfte Sollwerte als verglichen — dieselbe Sorte Grün, die 1.9 (CR-05)
 * abgeschafft hat. Deshalb steht hier nur, *was* einmal verglichen wird, nie
 * ein Status: den vergibt `compareSkeleton` fest als `not_checked`.
 *
 * Wer 2.15, 2.16 oder 2.17 baut, hat hier seine Einhängestelle: Eintrag raus,
 * echter Vergleich rein, Baseline neu schreiben. Der Wechsel des Prüfstatus
 * ist in `tests/korpus-facets.spec.ts` eine Ratsche und fällt damit auf.
 */
export interface PendingSkeletonAspect {
  /** Der Facettenname, wie er im Ergebnis und in der Baseline steht. */
  name: string;
  /** Der Roadmap-Schritt, der diese Teilprüfung auflöst. */
  step: string;
  /** Was der Fall behauptet, in einem Satzteil — für die Begründung. */
  what: string;
  /** Derselbe Satzteil verneint, für den (heute immer) leeren Fall. */
  absent: string;
  /** Wie viele Sollwerte der Fall dafür trägt (heute überall 0). */
  given: (counts: { gatewayClassGiven: number; lanes: number; parallel: number }) => number;
  /** Der Nenner: wie viele Stellen dieser Art der Fall überhaupt kennt. */
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
  /** Sollknoten-Id -> Knoten-Id der Engine. Die Grundlage des Kantenvergleichs. */
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
    // Derselbe Ankerbegriff wie bei den Befunden: die Anweisung, nicht die
    // Zeile. `SELECT … INTO TABLE` steht über fünf Zeilen, und CC-001
    // verankert es auf der FROM-Zeile, die Engine auf der ersten.
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

  // --- Kanten. Vergleichbar ist eine Sollkante nur, wenn beide Enden auf einen
  //     Engine-Knoten aufgelöst sind; sonst wüsste niemand, wonach gesucht wird.
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

  // --- Die drei Teilprüfungen, die 2.15, 2.16 und 2.17 füllen werden.
  //
  // QA-Review von `9e408888bfec`, Fingerabdruck `c100d056f0d2`: bis dahin hob
  // jede dieser drei Teilprüfungen ihren Status auf `compared`, sobald ein
  // Sollwert **auftauchte** — verglichen wurde er nie. Das ist genau der
  // Mechanismus, gegen den 1.9 gebaut wurde (CR-05): ein Grün, das „nicht
  // geprüft" heißt. Heute trägt keine der 68 `expected.json` eines der drei
  // Felder, der Fehler war also noch nicht wirksam; wirksam geworden wäre er
  // mit dem ersten Fall aus 2.10, und dann hätte ein Sollwert still danebenge-
  // legen, während die Facette „verglichen" sagt.
  //
  // Gewählt ist der erste der beiden Wege: die Facetten bleiben `not_checked`,
  // **auch wenn Sollwerte da sind**, und ihr Zähler bleibt 0. Wirklich zu
  // vergleichen wäre heute kein Vergleich: `lib/abap/process-skeleton.ts`
  // führt weder eine Gateway-Klasse noch eine Lane noch einen Parallel-Marker
  // (`SkeletonNode` hat keines dieser Felder, und der Kopf der Datei sagt für
  // Lanes und parallele Gateways ausdrücklich, dass sie später kommen). Jeder
  // Sollwert wäre gegen `undefined` verglichen und damit pauschal „von der
  // Engine verfehlt" — eine Rotfärbung, die nichts über die Engine aussagt.
  //
  // `PENDING_SKELETON_ASPECTS` ist die benannte Einhängestelle: wer 2.15, 2.16
  // oder 2.17 baut, ersetzt hier den Eintrag durch einen echten Vergleich und
  // schreibt die Baseline neu — der Statuswechsel `not_checked` → `compared`
  // ist die Ratsche, die das sichtbar macht.
  //
  // Damit ein Sollwert bis dahin nicht still liegen bleibt: ein Fall, der eines
  // der drei Felder trägt, gilt nicht als übereinstimmend (siehe unten).
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
  /** Sollwerte, für die es heute keinen Vergleich gibt. Heute überall leer. */
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
    // Zähler fest 0 und Status fest `not_checked`: hier wird nichts verglichen,
    // und ein vorhandener Sollwert ändert daran nichts (c100d056f0d2).
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

  // Unter der Hälfte ist die Zahl selbst der Befund: ein Grün hieße hier, die
  // Mehrheit der Sollknoten sei geprüft worden, und das wäre nicht wahr (1.9).
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
  // Knoten und Kanten stimmen — aber der Fall trägt eine Sollaussage, für die
  // es heute keinen Vergleich gibt. Ein `agree` hieße hier „alles geprüft",
  // und das wäre die Lüge aus CR-05 mit anderen Feldern (c100d056f0d2).
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
// Fachsätze: das Textmaß, der Ankerschlüssel und der Erzeuger (Roadmap 17.5)
// ---------------------------------------------------------------------------

/**
 * Die Funktionswörter, die aus einem Fachsatz nichts über den Code sagen.
 *
 * Eine Streichliste ist eine Auslegung, und sie steht deshalb hier, sichtbar und
 * vollständig, statt in einer Ähnlichkeitszahl zu verschwinden. Sie enthält
 * ausschließlich deutsche Funktionswörter — kein Fachwort, kein ABAP-Bezeichner,
 * nichts, was zwei Sätze inhaltlich unterscheiden könnte.
 */
export const STATEMENT_STOPWORDS: ReadonlySet<string> = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem', 'einen', 'eines',
  'und', 'oder', 'aber', 'nicht', 'kein', 'keine', 'wird', 'werden', 'wurde', 'worden', 'sind',
  'ist', 'war', 'sein', 'seine', 'hat', 'haben', 'als', 'wie', 'mit', 'ohne', 'von', 'vom',
  'zum', 'zur', 'fuer', 'ueber', 'unter', 'auf', 'aus', 'bei', 'nach', 'vor', 'durch', 'gegen',
  'nur', 'auch', 'noch', 'dann', 'wenn', 'dass', 'sich', 'ihre', 'ihr', 'alle', 'jeder', 'jede',
  'jedes', 'man', 'pro', 'dabei', 'damit', 'dadurch',
]);

/**
 * Ein Fachsatz in Inhaltswörter zerlegt.
 *
 * Normalisierung, offen und in dieser Reihenfolge: Kleinschreibung, Umlaute und
 * ß aufgelöst (`ä`→`ae` … `ß`→`ss`), alles außer `a–z`, `0–9` und `_` zu
 * Trennern, Wörter unter drei Zeichen und die Streichliste oben entfernt.
 * `_` bleibt, weil ABAP-Bezeichner wie `lv_count` genau das Wort sind, an dem
 * zwei Sätze sich unterscheiden.
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
 * Das Maß: der Dice-Koeffizient über diese Inhaltswörter, `2·|A∩B| / (|A|+|B|)`.
 *
 * Warum dieses und kein cleveres: es ist von Hand nachrechenbar, es braucht kein
 * Modell, keine Einbettung und keinen Schlüssel, und es sagt bei jedem Wert, aus
 * welchen Wörtern er kommt. Eine Zahl, deren Zustandekommen niemand nachprüfen
 * kann, wäre hier genau der Fehler, den die Zweitmessung vom 23.09. gemacht hat.
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
 * Die Schwelle — **am Korpus kalibriert, nicht geraten.**
 *
 * Gemessen am 23.09.2026 über alle 173 Sollsätze (nachzurechnen mit dem Test
 * „die Schwelle liegt in der gemessenen Lücke" in `tests/korpus-facets.spec.ts`,
 * der dieselben Zahlen bei jedem Lauf neu bildet):
 *
 * - Zwei **verschiedene** Sollsätze desselben Falls über **verschiedene** Anker:
 *   115 Paare, höchster Wert **0,400**, 95. Perzentil 0,267, Median 0,051.
 * - Derselbe Satz, um seine letzten zwei Wörter gekürzt — die mildeste
 *   Umformulierung, die noch dasselbe meint: 173 Paare, **niedrigster** Wert
 *   **0,571**, Median 0,909.
 *
 * Zwischen 0,400 und 0,571 liegt eine Lücke, und `0.50` liegt in ihr: über jedem
 * gemessenen Paar, das **nicht** dasselbe meint, und unter jedem, das es tut.
 * Das ist die ganze Begründung; sie ist reproduzierbar und sie kann kippen, wenn
 * das Fallbuch wächst — dann fällt der Test, und die Schwelle wird neu begründet
 * statt nachgezogen.
 *
 * **Die ehrliche Grenze:** zwei Sollsätze am *selben* Anker können sich näher
 * stehen als 0,50 — CC-042-B01/B02 liegen bei 0,667 und unterscheiden sich nur
 * in `KNA1`/`KNB1`. Deshalb ist die Zuordnung eins zu eins und gierig; ein
 * erzeugter Satz kann nicht zwei Sollsätze gutschreiben. Ein Erzeuger, der von
 * zwei Sätzen nur einen liefert, bekommt für den anderen kein Gegenstück und
 * damit kein `compared`.
 */
export const STATEMENT_MATCH_THRESHOLD = 0.5;

/**
 * Der Schlüssel, über den zwei Sätze überhaupt vergleichbar sind: die
 * **ABAP-Anweisung**, in der die Ankerzeile liegt — nicht die Zeile selbst.
 *
 * Grund: das Fallbuch verankert denselben Satz mal auf `source.abap:6`, mal auf
 * `source.abap:6–7`, weil ein `SELECT` über zwei Zeilen geht. Zwei Sätze über
 * dieselbe Anweisung sprechen über dieselbe Sache; zwei Sätze über verschiedene
 * Anweisungen nicht. Findet sich an der Zeile keine Anweisung (Kommentar,
 * Leerzeile), bleibt die Zeile selbst der Schlüssel — geraten wird nichts.
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

/** Ein Fachsatz, wie ein Erzeuger ihn liefert. */
export interface GeneratedStatement {
  id: string;
  text: string;
  anchors: Array<{ file: string | null; line: number | null }>;
}

/**
 * Wer die Fachsätze erzeugt — die Naht, die 17.6 füllt.
 *
 * Sie ist ausdrücklich **leer**, weil heute niemand sie füllt, und sie ist
 * ausdrücklich **da**, damit der erste echte Erzeuger gemessen wird, ohne dass
 * an dieser Facette noch etwas umgebaut werden muss. Einen Erzeuger hier zu
 * erfinden wäre 17.6 vorweggenommen und eine Produktentscheidung, die Sonny
 * gehört.
 */
export interface StatementProducer {
  /** Steht im Beleg jedes Ergebnisses; ohne Namen weiß niemand, was gemessen wurde. */
  name: string;
  /** Warum es (nicht) etwas gibt — geht wörtlich in die Begründung der Teilprüfung. */
  note: string;
  produce(korpusCase: KorpusCase, reading: Omit<EngineReading, 'businessStatements' | 'producer'>): GeneratedStatement[];
}

/**
 * Der heutige Stand, gemessen und nicht behauptet: **niemand erzeugt Fachsätze.**
 *
 * Nachgeprüft am 23.09.2026 über `lib/`, `app/` und `components/` — kein Treffer
 * auf `businessStatement`, `business_statement` oder `Fachsatz`; `readWithEngine`
 * ruft `buildAbapEvidence`, `buildProcessFacts`, `buildProcessSkeleton`,
 * `readStatements`, `extractDataCoupling`, `routeExtensibility` und
 * `gradeSapObjectUse`, und keine davon gibt einen Satz zurück.
 * `process-skeleton.ts` sagt über seine Knotenbeschriftung ausdrücklich: „A token
 * out of the source. Never a phrase this engine made up (rule 6)." Das Modell
 * bestellt in `lib/analysis-prompt.ts` eine „business executive summary" — keinen
 * verankerten Einzelsatz, und der Weg dorthin führt über das Netz und ist damit
 * hier ohnehin nicht messbar.
 */
export const NO_PRODUCER: StatementProducer = {
  name: 'kein-erzeuger',
  note:
    'Heute erzeugt kein Modul des Produkts verankerte Fachsätze (Roadmap 17.6 ist offen: Engine oder Modell). ' +
    'Diese Facette misst den ersten Erzeuger ohne Umbau.',
  produce: () => [],
};

/**
 * Proben für die Empfindlichkeitsmessung — **nie im Normallauf.**
 *
 * Sie sind kein Erzeuger des Produkts und dürfen nie einer werden: `SOLL_ECHO`
 * schreibt das Fallbuch ab und wüsste über fremden Code nichts. Ihr einziger
 * Zweck ist die Frage, die 17.5 beantworten muss — *bewegt sich die Zahl, wenn
 * man den Erzeuger ändert, und wird die Facette rot, wenn er schlechter wird?*
 * `tests/korpus-mutation.spec.ts` fährt sie.
 */
export const PROBE_PRODUCERS = {
  /** Der perfekte Erzeuger: er schreibt die Sollsätze ab. Die Obergrenze der Messung. */
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
} as const;

/**
 * Fachsätze — der Vergleich, der bis zum 23.09.2026 keiner war.
 *
 * Bis 1.9 stand die Klasse 68-mal auf `agree`, weil die einzige Prüfung — zeigen
 * die Anker in den Quelltext? — bestanden wurde. 1.9 hat daraus ein ehrliches
 * `anchor_validation_passed` gemacht und die Facette hart auf `disagree`
 * verdrahtet. Ehrlich, aber blind: 0 agree / 68 disagree hieß nicht „das Produkt
 * versagt", sondern „es wurde nichts verglichen", und solange das so steht, kann
 * keine Prompt- und keine Modelländerung zeigen, ob sie etwas verbessert hat
 * (Roadmap 17.5).
 *
 * Dieser Vergleich misst wirklich, und zwar **deterministisch**: kein Modell als
 * Richter, kein Netz, kein Schlüssel. Er hat drei Teile, und jeder steht offen:
 *
 * 1. **Der Anker ist der Schlüssel** (`anchorKeys`). Zwei Sätze über dieselbe
 *    ABAP-Anweisung sind vergleichbar, zwei Sätze über verschiedene nicht. Ein
 *    Satz ohne Gegenstück am selben Anker ist **nicht verglichen** — er zählt in
 *    den Nenner, nie in den Zähler.
 * 2. **Das Textmaß** (`statementSimilarity`) ist ein Dice-Koeffizient über
 *    normalisierte Inhaltswörter. Simpel und nachrechenbar, mit einer Schwelle,
 *    die am Korpus selbst kalibriert ist (siehe `STATEMENT_MATCH_THRESHOLD`).
 * 3. **Der Erzeuger** (`StatementProducer`) ist austauschbar und heute leer:
 *    `NO_PRODUCER`. Kein Modul in `lib/`, `app/` oder `components/` erzeugt
 *    Fachsätze — eine Suche nach `businessStatement`/`Fachsatz` findet dort
 *    nichts, und `process-skeleton.ts` sagt über seine Knotenbeschriftung
 *    ausdrücklich „a token out of the source, never a phrase this engine made
 *    up". Wer der Erzeuger wird, ist eine Produktentscheidung (17.6). Diese
 *    Facette misst ihn, sobald es ihn gibt, ohne Umbau.
 */
function compareBusinessStatements(korpusCase: KorpusCase, reading: EngineReading): ClassResult {
  const statements = korpusCase.expected.businessStatements;
  const byName = new Map(korpusCase.sources.map((source) => [source.name, source.lineCount]));
  const done = (core: ClassCore, aspects: FacetAspect[], scope: { compared: number; total: number }): ClassResult => ({
    ...core,
    scope,
    aspects,
  });

  if (statements.length === 0) {
    return done(
      {
        case: korpusCase.id,
        class: 'fachsaetze',
        state: 'disagree',
        verdict: 'nicht-vergleichbar',
        evidence:
          'Der Fall führt keine fachlichen Ground-Truth-Kandidaten; es gibt hier weder etwas zu prüfen noch etwas zu vergleichen.',
      },
      [facet('fachsatzinhalt', 0, 0, 'Kein Sollfachsatz im Fall.', 'not_checked')],
      { compared: 0, total: 0 },
    );
  }

  // --- Teil 1: der Ankercheck, unverändert seit 1.9 -------------------------
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

  // --- Teil 2: der Inhalt, über den Anker als Schlüssel ---------------------
  const produced = reading.businessStatements;
  const keysOf = (anchors: Array<{ file: string | null; line: number | null }>) => anchorKeys(anchors, reading);

  /**
   * Alle Paare, die überhaupt über dieselbe Stelle sprechen, mit ihrem Maß.
   * Die Zuordnung ist **eins zu eins und gierig**: das beste Paar zuerst, dann
   * sind beide Seiten verbraucht. Ohne diese Regel könnte ein einziger erzeugter
   * Satz zwei Sollsätze am selben Anker gutschreiben — im Korpus gibt es genau
   * solche Paare (CC-042-B01/B02 teilen Zeile 4 und unterscheiden sich nur im
   * Tabellennamen, Dice 0,67). Bei Gleichstand entscheidet die Zahl der geteilten
   * Ankerschlüssel, dann die ID; der Lauf ist damit reproduzierbar.
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

  // --- Teil 3: Status, Zähler, Nenner --------------------------------------
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
  ];

  /**
   * **Warum hier die halbe Deckung nicht reicht, anders als in `skelett`.**
   *
   * Dort steht die 50-%-Regel, weil die Engine ganze Knotenarten nicht führt —
   * das ist Unvergleichbarkeit und keine Abweichung. Hier ist es umgekehrt: ein
   * Sollsatz ohne erzeugtes Gegenstück an derselben Anweisung heißt, dass der
   * Erzeuger dieselbe Quelle gelesen und an dieser Stelle nichts gesagt hat.
   * Ein Grün über einem Erzeuger, der ein Drittel der Aussagen still auslässt,
   * wäre genau das Grün, das „nicht geprüft" heißt (1.9, CR-05).
   *
   * Was hier bewusst **nicht** zählt: erzeugte Sätze ohne Sollsatz an derselben
   * Stelle (`extra`). Das Fallbuch erklärt seine Fachsatzliste nirgends für
   * vollständig — `declaredEmpty` gibt es für Befunde und Objekte, nicht für
   * Fachsätze —, und was der Korpus nicht behauptet, darf dieser Vergleich
   * nicht gegen einen Erzeuger verwenden. Die Zahl steht deshalb im Beleg, und
   * sie ist die Größe, über die 17.6 zu entscheiden hat.
   */
  const agree = broken.length === 0 && comparedCount === statements.length && misses.length === 0;
  const verdict: Verdict | null = agree
    ? null
    : broken.length > 0
      ? 'korpus-offen'
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
    { case: korpusCase.id, class: 'fachsaetze', state: agree ? 'agree' : 'disagree', verdict, evidence: `${head}${tail}` },
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

export function compareAll(mutate?: SkeletonMutation, producer: StatementProducer = NO_PRODUCER): ClassResult[] {
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
// Die Ratsche
// ---------------------------------------------------------------------------

export interface BaselineEntry {
  case: string;
  class: StatementClass;
  state: 'agree' | 'disagree';
  verdict: Verdict | null;
  /**
   * Zähler und Nenner der Facette (1.9). Ohne sie war die Ratsche blind für
   * den Unterschied zwischen "geprüft und übereinstimmend" und "nicht geprüft":
   * CC-001 stand auf `agree` mit dem Grund "2 von 8 Knoten vergleichbar".
   */
  scope: { compared: number; total: number };
  /** Der Prüfstatus je Teilprüfung, mit eigenem Nenner. */
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
