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
import { readStatements, type AbapStatement } from '../../lib/abap/statement-reader';
import { gradeSapObject } from '../../lib/abap/catalog-service';
import { worstGrade, type CloudReadinessGrade } from '../../lib/abap/abcd-classification';

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
    nodes: Array<{ id: string; type: string | null; anchor: KorpusAnchor | null; meaning: string | null }>;
    edges: Array<{ from: string; to: string; condition: string | null }>;
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
    statements: AbapStatement[];
    tables: Array<{ name: string; access: string; custom: boolean }>;
  }>;
  /** Alle Objektnamen, die die Engine über den ganzen Fall gesehen hat. */
  objectNames: Set<string>;
  /** Die schlechteste Katalognote über alle gesehenen Objekte. */
  worst: CloudReadinessGrade;
  /** Nur als Lebenszeichen: die Route ist im Korpus ohne Gegenstück. */
  routeCount: number;
}

export function readWithEngine(korpusCase: KorpusCase): EngineReading {
  const deployment = deploymentOf(korpusCase.profile);
  const objectNames = new Set<string>();
  let routeCount = 0;
  const perFile = korpusCase.sources.map((source) => {
    const evidence = buildAbapEvidence(source.code, source.name, deployment);
    const facts = buildProcessFacts(source.code);
    const tables = extractDataCoupling(source.code).map((entry) => ({
      name: entry.tableName.toUpperCase(),
      access: entry.accessType,
      custom: entry.isCustom,
    }));
    for (const table of tables) objectNames.add(table.name);
    for (const finding of evidence.findings) {
      if (finding.objectName) objectNames.add(finding.objectName.toUpperCase());
    }
    routeCount += routeExtensibility(evidence, deployment).checkpoints.length;
    return { file: source.name, evidence, facts, statements: readStatements(source.code), tables };
  });
  const grades = [...objectNames].map((name) => gradeSapObject(name).grade);
  return { perFile, objectNames, worst: worstGrade(grades), routeCount };
}

// ---------------------------------------------------------------------------
// Der Vergleich, je Aussageklasse
// ---------------------------------------------------------------------------

export const STATEMENT_CLASSES = ['befunde', 'level', 'objekte', 'skelett', 'fachsaetze'] as const;
export type StatementClass = (typeof STATEMENT_CLASSES)[number];

export type Verdict = 'engine-defekt' | 'korpus-offen' | 'nicht-vergleichbar';

export interface ClassResult {
  case: string;
  class: StatementClass;
  state: 'agree' | 'disagree';
  /** Nur bei `disagree` gesetzt — der Grund, den die Ratsche festhält. */
  verdict: Verdict | null;
  /** Was tatsächlich verglichen wurde, in Zahlen und Beispielen. */
  evidence: string;
}

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

function sample(items: string[], limit = 4): string {
  if (items.length === 0) return '—';
  const head = items.slice(0, limit).join(', ');
  return items.length > limit ? `${head} … (+${items.length - limit})` : head;
}

function compareFindings(korpusCase: KorpusCase, reading: EngineReading): ClassResult {
  const expected = [...korpusCase.expected.findings, ...korpusCase.expected.securityFindings];
  const byFile = new Map(reading.perFile.map((entry) => [entry.file, entry]));

  const engineMapped: string[] = [];
  for (const entry of reading.perFile) {
    for (const finding of entry.evidence.findings) {
      if (MAPPED_KINDS.has(finding.kind)) engineMapped.push(`${entry.file}:${finding.lineStart} ${finding.kind}`);
    }
  }

  // Negativkontrolle: der Fall sagt in Worten, dass es keinen Befund gibt.
  if (korpusCase.expected.declaredEmpty.findings) {
    const state = engineMapped.length === 0 ? 'agree' : 'disagree';
    return {
      case: korpusCase.id,
      class: 'befunde',
      state,
      verdict: state === 'agree' ? null : 'engine-defekt',
      evidence:
        `Negativkontrolle: der Fall erklärt „keine Findings im endlichen Regelvertrag". ` +
        `Die Engine meldet ${engineMapped.length} Befund(e) einer zugeordneten Marke: ${sample(engineMapped)}.`,
    };
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
  const head =
    `${comparable} von ${expected.length} Sollbefunden vergleichbar; ${exact.length} auf der Ankerzeile, ` +
    `${onlyInStatement.length} nur in derselben Anweisung, ${missed.length} verfehlt.`;
  const tail = notComparable.length > 0 ? ` Ohne Gegenstück: ${sample(notComparable)}.` : '';

  if (comparable === 0) {
    return {
      case: korpusCase.id,
      class: 'befunde',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence: `${head} Die Engine meldet an diesem Fall: ${sample(engineMapped)}.${tail}`,
    };
  }
  if (missed.length > 0) {
    return {
      case: korpusCase.id,
      class: 'befunde',
      state: 'disagree',
      verdict: 'engine-defekt',
      evidence: `${head} Verfehlt: ${sample(missed)}. Engine an diesem Fall: ${sample(engineMapped)}.${tail}`,
    };
  }
  if (onlyInStatement.length > 0) {
    return {
      case: korpusCase.id,
      class: 'befunde',
      state: 'disagree',
      verdict: 'korpus-offen',
      evidence:
        `${head} Die Engine sieht das Konstrukt, verankert es aber am Anweisungsbeginn: ${sample(onlyInStatement)}. ` +
        `R27 legt genau das als Primäranker fest; diese Fälle verankern stattdessen die Zeile, auf der das Objekt genannt wird. ` +
        `Das ist der Widerspruch zwischen v1-Ankerkonvention und R27, den das Fallbuch selbst benennt — die Sollangabe bleibt unverändert, die Frage geht an die Fallautoren.${tail}`,
    };
  }
  return { case: korpusCase.id, class: 'befunde', state: 'agree', verdict: null, evidence: `${head}${tail}` };
}

function compareLevel(korpusCase: KorpusCase, reading: EngineReading): ClassResult {
  const expected = korpusCase.expected.classic_level;
  const engine = reading.worst;
  const base = `Korpus ${expected ?? '(Paar)'} · Engine (schlechteste Katalognote über ${reading.objectNames.size} Objekt(e)) ${engine}`;

  if (korpusCase.expected.expectedByProfile) {
    return {
      case: korpusCase.id,
      class: 'level',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence: `${base}. Fallpaar: die Antwort hängt am Zielprofil, und der Evidenzbericht der Engine trägt kein Profil im Schlüssel (R31).`,
    };
  }
  if (reading.objectNames.size === 0) {
    return {
      case: korpusCase.id,
      class: 'level',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence:
        `${base}. Die Engine hat an diesem Fall kein einziges Objekt gesehen, also auch keine Note vergeben — ` +
        `die A kommt aus worstGrade([]), das für die leere Liste 'A' liefert. Zu vergleichen gibt es hier nichts; ` +
        `festzuhalten ist, dass „kein Beleg" in dieser Funktion als bestes Ergebnis herauskommt.`,
    };
  }
  const expectedRank = levelRank(expected);
  if (expectedRank < 0) {
    return {
      case: korpusCase.id,
      class: 'level',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence:
        `${base}. Der Fall antwortet „${expected ?? '—'}" — das ist eine Aussage über die Vollständigkeit der Scheibe, ` +
        `und Vollständigkeit führt lib/abap/ nicht: der Evidenzbericht hat kein Feld, das „diese Frage ist mit dem gelieferten Code nicht entscheidbar" sagen könnte.`,
    };
  }
  if (expected === engine) {
    return { case: korpusCase.id, class: 'level', state: 'agree', verdict: null, evidence: base };
  }
  const engineRank = levelRank(engine);
  if (engineRank < expectedRank) {
    return {
      case: korpusCase.id,
      class: 'level',
      state: 'disagree',
      verdict: 'engine-defekt',
      evidence: `${base}. Die Engine urteilt milder als der Fall — ein falsches Grün ist die eine Richtung, in der ein Levelunterschied gefährlich ist.`,
    };
  }
  // Strenger als der Fall. Das ist nur dann ein Defekt, wenn der Fall seine
  // mildere Antwort auf einen Nachfolger stützt, der im selben Katalog steht:
  // dann liest die Note denselben Eintrag und lässt die Hälfte davon liegen.
  const withSuccessor = korpusCase.expected.objects.filter(
    (object) => object.identity?.objectType === 'TABL' && (object.successors?.length ?? 0) > 0,
  );
  if (withSuccessor.length > 0) {
    return {
      case: korpusCase.id,
      class: 'level',
      state: 'disagree',
      verdict: 'engine-defekt',
      evidence:
        `${base}. Die Engine urteilt strenger. Der Fall begründet sein ${expected} mit dem katalogisierten Nachfolger ` +
        `(${sample(withSuccessor.map((o) => `${o.name} → ${(o.successors as Array<{ tadirObjName?: string }>)[0]?.tadirObjName ?? '?'}`))}), ` +
        `der aus derselben Quelle stammt, aus der die Engine ihre Note zieht. Eine Note, die den Nachfolger nicht berücksichtigt, liest den Katalogeintrag zur Hälfte.`,
    };
  }
  return {
    case: korpusCase.id,
    class: 'level',
    state: 'disagree',
    verdict: 'nicht-vergleichbar',
    evidence:
      `${base}. Die Engine urteilt strenger, und der Fall stützt sein Level nicht auf einen katalogisierten Nachfolger. ` +
      `Der Korpus vergibt ein Level je Artefakt unter einem Regelvertrag, die Engine eine Katalognote je Objekt; ein Artefaktlevel gibt es in lib/abap/ nicht.`,
  };
}

function compareObjects(korpusCase: KorpusCase, reading: EngineReading): ClassResult {
  const tables = korpusCase.expected.objects.filter((object) => object.identity?.objectType === 'TABL');
  const engineTables = new Map<string, string>();
  for (const entry of reading.perFile) for (const table of entry.tables) engineTables.set(table.name, table.access);

  if (korpusCase.expected.declaredEmpty.objects) {
    const state = engineTables.size === 0 ? 'agree' : 'disagree';
    return {
      case: korpusCase.id,
      class: 'objekte',
      state,
      verdict: state === 'agree' ? null : 'engine-defekt',
      evidence:
        `Der Fall erklärt „keine explizite externe SAP-Repository-Identität". ` +
        `Die Engine meldet ${engineTables.size} Tabelle(n): ${sample([...engineTables.keys()])}.`,
    };
  }
  if (tables.length === 0) {
    return {
      case: korpusCase.id,
      class: 'objekte',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence:
        `${korpusCase.expected.objects.length} Sollobjekt(e), keines vom Typ TABL — ` +
        `${sample([...new Set(korpusCase.expected.objects.map((o) => `${o.name}/${o.identity?.objectType ?? '?'}`))])}. ` +
        `Die Datenkopplung der Engine führt nur Tabellen; Bausteine, BAdIs und Programme stehen dort nicht.`,
    };
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
  const state = missing.length === 0 && wrongAccess.length === 0 ? 'agree' : 'disagree';
  return {
    case: korpusCase.id,
    class: 'objekte',
    state,
    verdict: state === 'agree' ? null : 'engine-defekt',
    evidence:
      `${tables.length} Tabellenobjekt(e) im Fall; Engine sieht ${engineTables.size}: ${sample([...engineTables.keys()])}. ` +
      `Fehlend: ${sample(missing)}. Zugriffsart abweichend: ${sample(wrongAccess)}. ` +
      `Vom Fall nicht geführt: ${sample(undeclared)}.`,
  };
}

/**
 * Ein Knoten ist vergleichbar, wenn die Anweisung an seinem Anker ein
 * Konstrukt trägt, das `control-flow.ts` bzw. `block-structure.ts` führt.
 * `gateway` auf einem `CATCH` ist damit nicht vergleichbar — TRY/CATCH ist
 * keine Verzweigung im Sinne des Lesers, sondern eine Lücke, die das Fallbuch
 * §8 selbst als solche benennt. `loop` steht im Skelett für jede Iteration,
 * also auch für `SELECT … ENDSELECT` und `DO`/`WHILE`.
 */
const GATEWAY_KEYWORDS = /^(IF|ELSEIF|ELSE|CASE|WHEN)\b/i;
const LOOP_BLOCK_KINDS = new Set(['loop', 'select', 'do', 'while', 'at', 'provide']);
const LOOP_KEYWORDS = /^(LOOP|DO|WHILE|SELECT|AT|PROVIDE)\b/i;

function compareSkeleton(korpusCase: KorpusCase, reading: EngineReading): ClassResult {
  const nodes = korpusCase.expected.skeleton.nodes;
  const byFile = new Map(reading.perFile.map((entry) => [entry.file, entry]));
  const defaultFile = korpusCase.sources[0]?.name ?? '';

  const missed: string[] = [];
  const hit: string[] = [];
  const notComparable: string[] = [];

  for (const node of nodes) {
    const file = node.anchor?.file ?? defaultFile;
    const entry = byFile.get(file);
    const line = node.anchor?.line;
    const label = `${node.id}/${node.type}@${node.anchor?.raw ?? '?'}`;
    if (!entry || line == null || (node.type !== 'gateway' && node.type !== 'loop')) {
      notComparable.push(label);
      continue;
    }
    const statement = statementAt(entry.statements, line);
    const keyword = statement?.keyword ?? '';
    if (node.type === 'gateway') {
      if (!GATEWAY_KEYWORDS.test(keyword)) {
        notComparable.push(`${label} (Anweisung „${keyword || '—'}" ist keine Verzweigung des Lesers)`);
        continue;
      }
      // Ein IF/ELSEIF/ELSE ist in `control-flow.ts` ein Branch mit Armen; das
      // Skelett zeichnet jeden Arm als eigenes Gateway. Beide Formen zählen.
      const found = entry.facts.control.branches.some(
        (branch) => branch.lineStart === line || branch.arms.some((arm) => arm.header.lineStart === line),
      );
      if (found) hit.push(label);
      else missed.push(label);
      continue;
    }
    if (!LOOP_KEYWORDS.test(keyword)) {
      notComparable.push(`${label} (Anweisung „${keyword || '—'}" ist keine Iteration des Lesers)`);
      continue;
    }
    const found = entry.facts.structure.blocks.some(
      (block) => LOOP_BLOCK_KINDS.has(block.kind) && block.lineStart === line,
    );
    if (found) hit.push(label);
    else missed.push(label);
  }

  const comparable = hit.length + missed.length;
  const tail =
    `Nicht vergleichbar: ${notComparable.length} Knoten — ` +
    `die Engine baut kein Prozessskelett, buildProcessFacts liefert Anweisungen, Blöcke, Verzweigungen und einen Aufrufgraphen. ` +
    `${sample(notComparable)}.`;

  if (comparable === 0) {
    return {
      case: korpusCase.id,
      class: 'skelett',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence: `${nodes.length} Skelettknoten, keiner an einem Konstrukt, das der Leser führt. ${tail}`,
    };
  }
  const state = missed.length === 0 ? 'agree' : 'disagree';
  return {
    case: korpusCase.id,
    class: 'skelett',
    state,
    verdict: state === 'agree' ? null : 'engine-defekt',
    evidence:
      `${comparable} von ${nodes.length} Knoten vergleichbar; ${hit.length} getroffen, ${missed.length} ohne Entsprechung: ${sample(missed)}. ${tail}`,
  };
}

function compareBusinessStatements(korpusCase: KorpusCase): ClassResult {
  const statements = korpusCase.expected.businessStatements;
  const byName = new Map(korpusCase.sources.map((source) => [source.name, source.lineCount]));
  if (statements.length === 0) {
    return {
      case: korpusCase.id,
      class: 'fachsaetze',
      state: 'disagree',
      verdict: 'nicht-vergleichbar',
      evidence: 'Der Fall führt keine fachlichen Ground-Truth-Kandidaten.',
    };
  }
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
  const state = broken.length === 0 ? 'agree' : 'disagree';
  return {
    case: korpusCase.id,
    class: 'fachsaetze',
    state,
    verdict: state === 'agree' ? null : 'korpus-offen',
    evidence:
      `${statements.length} Fachsatz/Fachsätze mit ${checked} Anker(n); ${broken.length} zeigen nicht in den Quelltext: ${sample(broken)}. ` +
      `Mehr ist hier nicht zu prüfen: die Engine erzeugt keine Fachsätze.`,
  };
}

export function compareCase(korpusCase: KorpusCase, reading: EngineReading): ClassResult[] {
  return [
    compareFindings(korpusCase, reading),
    compareLevel(korpusCase, reading),
    compareObjects(korpusCase, reading),
    compareSkeleton(korpusCase, reading),
    compareBusinessStatements(korpusCase),
  ];
}

export function compareAll(): ClassResult[] {
  const results: ClassResult[] = [];
  for (const korpusCase of readCases()) {
    results.push(...compareCase(korpusCase, readWithEngine(korpusCase)));
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
