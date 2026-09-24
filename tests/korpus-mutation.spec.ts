import { test, expect } from '@playwright/test';
import {
  compareAll,
  compareCase,
  forbiddenViolations,
  readCases,
  readForbiddenConclusions,
  readWithEngine,
  ENGINE_PRODUCER,
  NO_PRODUCER,
  PROBE_PRODUCERS,
  type ClassResult,
  type SkeletonMutation,
  type StatementProducer,
} from './helpers/korpus-comparison';
import type { SkeletonEdge, SkeletonNode, ProcessSkeleton } from '../lib/abap/process-skeleton';

/**
 * Empfindlichkeitsprobe des Korpus-Vergleichers (Roadmap 1.9).
 *
 * Ein Vergleicher, der bei verfälschter Engine-Antwort grün bleibt, misst
 * nichts — und genau das war der Zustand bis zum 22.09.2026: `compareSkeleton`
 * rief `buildProcessFacts` und verglich zeilenweise gegen Verzweigungen und
 * Blöcke, weder Knotenart noch Kante. Eine Änderung am Skelett konnte dort
 * nicht rot werden.
 *
 * Diese Datei dreht die Frage um: sie verfälscht **das Gelesene**, nicht die
 * Engine (`lib/` wird nicht angefasst), und besteht darauf, dass jede
 * Verfälschung in der Facette `skelett` rot wird. Fällt einer dieser Tests, ist
 * nicht die Engine kaputt, sondern der Vergleicher blind geworden.
 *
 * **Was diese Proben nicht sind.** Die Roadmap 1.9 nennt „die sechs Mutanten
 * M01–M06 des Gegenreviews". Die liegen im privaten Prüfpaket
 * `clean-core-review-c5085bb.zip` (§15) und **nicht in diesem Repository**;
 * eine Suche über `tests/`, `docs/` und `scripts/` findet sie nirgends. Sie
 * hier nach Gutdünken nachzubauen hieße, sechs erfundene Proben unter ihrem
 * Namen zu führen und die Abnahme an der eigenen Erfindung zu messen. Die
 * sieben Proben unten sind deshalb eigene, benannte Verfälschungen; M01–M06
 * bleiben offen, bis das Prüfpaket vorliegt.
 */

type Probe = {
  name: string;
  why: string;
  mutate: SkeletonMutation;
  /**
   * Auf `false`, wenn die Verfälschung keinen übereinstimmenden Fall mehr zum
   * Fallen bringen **kann**, weil keiner der grünen Fälle das Konstrukt noch
   * enthält. Die Probe misst dann, dass der Vergleicher die Verfälschung
   * überhaupt sieht — schwächer, und mit einer Begründung an der Probe, die
   * sagt warum.
   */
  green?: false;
};

const withNodes = (skeleton: ProcessSkeleton, nodes: SkeletonNode[]): ProcessSkeleton => ({ ...skeleton, nodes });
const withEdges = (skeleton: ProcessSkeleton, edges: SkeletonEdge[]): ProcessSkeleton => ({ ...skeleton, edges });

const PROBES: Probe[] = [
  {
    name: 'S1 — die Rücksprungkante wird eine gewöhnliche Sequenz',
    why: 'Ohne `loop-back` ist eine Schleife im Export ein Faden, der zurückzeigt, und kein Zyklus (2.17 b).',
    // **Seit Roadmap 2.17 (b) kann diese Probe keinen grünen Fall mehr fällen,
    // und das ist gemessen, nicht vermutet.** Ein `LOOP AT` über eine Tabelle,
    // dessen Körper den Block nicht verlässt, ist keine Schleife mit
    // Rücksprungkante mehr, sondern eine Mehrfach-Instanz-Aktivität, die ihren
    // Körper enthält. Im Korpus bleiben genau vier `loop-back`-Kanten übrig, in
    // CC-030 und CC-048 — beide stimmen in der Facette `skelett` ohnehin nicht
    // überein. Von den 16 grünen Fällen trägt **keiner** noch einen
    // Schleifenknoten; der einzige, der einen trug, war CC-007, und der ist mit
    // 2.17 (b) selbst auf `disagree` gegangen (siehe `tests/korpus/baseline.json`).
    // Die Probe misst deshalb, dass der Vergleicher die Verfälschung überhaupt
    // noch sieht. Sie hier grün zu machen, indem man eine andere Verfälschung
    // unter denselben Namen setzt, wäre die Empfindlichkeitsprobe an der eigenen
    // Erfindung gemessen — genau das, was der Kopf dieser Datei verbietet.
    green: false,
    mutate: (skeleton) =>
      withEdges(
        skeleton,
        skeleton.edges.map((edge) => (edge.kind === 'loop-back' ? { ...edge, kind: 'sequence' } : edge)),
      ),
  },
  {
    name: 'S2 — jedes Gateway wird eine Aktivität',
    why: 'Genau die Änderung, die 2.15 an technischen Gateways vornimmt: sie muss am Korpus sichtbar werden.',
    mutate: (skeleton) =>
      withNodes(
        skeleton,
        skeleton.nodes.map((node) => (node.kind === 'gateway' ? { ...node, kind: 'task' } : node)),
      ),
  },
  {
    name: 'S3 — der Leseknoten entfällt',
    why: 'Ein verschwundener Datenspeicher ist die Art Verlust, die eine Ampel melden muss.',
    mutate: (skeleton) => withNodes(skeleton, skeleton.nodes.filter((node) => node.kind !== 'read')),
  },
  {
    name: 'S4 — die bedingte Kante verliert ihre Bedingung',
    why: 'Eine Entscheidung ohne bedingte Ausgänge ist keine Entscheidung mehr.',
    mutate: (skeleton) =>
      withEdges(
        skeleton,
        skeleton.edges.map((edge) => (edge.kind === 'conditional' ? { ...edge, kind: 'sequence' } : edge)),
      ),
  },
  {
    name: 'S5 — jeder Anker verrutscht um drei Zeilen',
    why: 'Der Anker ist die halbe Identität eines Knotens (Regel 7); ein verrutschter Anker ist ein falscher Beleg.',
    mutate: (skeleton) =>
      withNodes(
        skeleton,
        skeleton.nodes.map((node) =>
          node.anchor
            ? { ...node, anchor: { ...node.anchor, lineStart: node.anchor.lineStart + 3, lineEnd: node.anchor.lineEnd + 3 } }
            : node,
        ),
      ),
  },
  {
    name: 'S6 — eine Kante fehlt',
    why: 'Der Fluss ist die Aussage des Skeletts; ein fehlender Fluss zerlegt den Prozess still in Teile.',
    mutate: (skeleton) => withEdges(skeleton, skeleton.edges.slice(1)),
  },
  {
    name: 'S7 — der Endknoten entfällt',
    why: 'Ein Prozess ohne Ende ist in BPMN kein Prozess, und der Korpus zeichnet je Abbruch ein Ende.',
    mutate: (skeleton) => withNodes(skeleton, skeleton.nodes.filter((node) => node.kind !== 'end')),
  },
];

const BASE = compareAll().filter((result) => result.class === 'skelett');
const GREEN = new Set(BASE.filter((result) => result.state === 'agree').map((result) => result.case));

test('der ungestörte Lauf hat überhaupt etwas Grünes, an dem sich rot werden lässt', () => {
  expect(GREEN.size, 'ohne einen einzigen übereinstimmenden Fall misst diese Probe nichts').toBeGreaterThan(5);
});

const BASE_BY_CASE = new Map(BASE.map((result) => [result.case, result]));

for (const probe of PROBES) {
  test(`${probe.name} wird in der Facette skelett rot`, () => {
    const mutated = compareAll(probe.mutate).filter((result) => result.class === 'skelett');

    if (probe.green === false) {
      // Kein grüner Fall trägt das Konstrukt mehr. Gemessen wird, dass der
      // Vergleicher die Verfälschung sieht: mindestens ein Fall berichtet nach
      // der Verfälschung etwas anderes als davor.
      const moved = mutated.filter((result) => {
        const before = BASE_BY_CASE.get(result.case);
        return before != null && (before.state !== result.state || before.evidence !== result.evidence);
      });
      expect(
        moved.map((result) => result.case),
        `${probe.why}\nDer Vergleicher sieht diese Verfälschung an keinem einzigen Fall mehr — weder an ` +
          `einem übereinstimmenden noch an einem abweichenden. Dann misst diese Probe nichts.`,
      ).not.toEqual([]);
      return;
    }

    const fell = mutated.filter((result) => GREEN.has(result.case) && result.state === 'disagree');
    expect(
      fell.length,
      `${probe.why}\nKein einziger übereinstimmender Fall ist gefallen — der Vergleicher sieht diese ` +
        `Verfälschung nicht. Das ist ein Defekt in tests/helpers/korpus-comparison.ts, nicht in lib/abap/.`,
    ).toBeGreaterThan(0);
  });
}

// ---------------------------------------------------------------------------
// Dieselbe Frage an die Facette `fachsaetze` (Roadmap 17.5)
// ---------------------------------------------------------------------------

/**
 * Die Facette `fachsaetze` hatte bis zum 23.09.2026 dasselbe Problem wie
 * `skelett` vor 1.9 — schlimmer sogar: sie war hart auf `disagree` verdrahtet
 * und verglich den Inhalt überhaupt nicht. „0 agree / 68 disagree" hieß deshalb
 * nicht „das Produkt versagt", sondern „es wurde nichts verglichen".
 *
 * Diese Proben beantworten die Abnahmefrage aus 17.5: **bewegt sich die Zahl,
 * wenn man den Erzeuger ändert, und wird die Facette rot, wenn er schlechter
 * wird?** Der Erzeuger der Proben ist `PROBE_PRODUCERS.echo` — er schreibt das
 * Fallbuch ab und ist ausdrücklich kein Erzeuger des Produkts; ohne ihn gäbe es
 * nichts, an dem sich rot werden ließe, weil heute niemand Fachsätze erzeugt.
 */
type StatementProbe = {
  name: string;
  why: string;
  producer: StatementProducer;
  /** Auf `true`, wenn diese Probe absichtlich **nicht** rot werden darf. */
  stayGreen?: true;
};

const drop = (text: string) => text.split(' ').slice(0, -2).join(' ');

const STATEMENT_PROBES: StatementProbe[] = [
  {
    name: 'F0 — derselbe Satz, um zwei Wörter gekürzt (Gegenprobe, muss grün bleiben)',
    why: 'Ein Maß, das jede Umformulierung bestraft, misst die Wortwahl und nicht die Aussage.',
    producer: PROBE_PRODUCERS.echo(drop),
    stayGreen: true,
  },
  {
    name: 'F1 — jeder Satz wandert drei Zeilen weiter',
    why: 'Der Anker ist der Schlüssel; ein Satz an der falschen Anweisung ist ein falscher Beleg, egal wie gut er klingt.',
    producer: PROBE_PRODUCERS.echo(undefined, 3),
  },
  {
    name: 'F2 — der Satz des Nachbarn steht am eigenen Anker',
    why: 'Richtig verankert, falsch gesagt: genau der Fehler, den ein reiner Ankercheck nie gesehen hat.',
    producer: {
      name: 'probe:nachbarsatz',
      note: 'Empfindlichkeitsprobe — verschiebt die Texte gegen die Anker.',
      produce: (korpusCase) => {
        const statements = korpusCase.expected.businessStatements;
        return statements.map((statement, index) => ({
          id: `G-${statement.id}`,
          text: statements[(index + 1) % statements.length].text ?? '',
          anchors: statement.anchors.map((anchor) => ({ file: anchor.file, line: anchor.line })),
        }));
      },
    },
  },
  {
    name: 'F3 — jeder zweite Satz entfällt',
    why: 'Ein Erzeuger, der die Hälfte still auslässt, hat nicht zugestimmt — er hat geschwiegen.',
    producer: PROBE_PRODUCERS.echo(undefined, 0, (index) => index % 2 === 0),
  },
  {
    name: 'F4 — aus jedem Satz wird die Executive Summary',
    why:
      'Das ist, was `lib/analysis-prompt.ts` heute beim Modell bestellt: eine „business executive summary" statt ' +
      'der verankerten Einzelaussage. Diese Probe misst den Unterschied, um den es in 17.6 geht.',
    producer: PROBE_PRODUCERS.echo(() => 'Das Programm verarbeitet Daten und gibt ein Ergebnis aus.'),
  },
];

const fachsaetze = (results: ClassResult[]) => results.filter((result) => result.class === 'fachsaetze');
const green = (results: ClassResult[]) => new Set(fachsaetze(results).filter((r) => r.state === 'agree').map((r) => r.case));
const compared = (results: ClassResult[]) => fachsaetze(results).reduce((sum, r) => sum + r.scope.compared, 0);
const hits = (results: ClassResult[]) =>
  fachsaetze(results).reduce((sum, r) => sum + (r.aspects.find((a) => a.name === 'fachsatzinhalt')?.compared ?? 0), 0);

// **Seit 17.7 ist die Vorgabe der Engine-Erzeuger.** Der leere Stand wird
// deshalb ausdrücklich angefordert: er ist weiter der Nullpunkt, gegen den
// diese Probe misst, aber nicht mehr der Normallauf.
const NO_PRODUCER_RUN = compareAll(undefined, NO_PRODUCER);
const ECHO_RUN = compareAll(undefined, PROBE_PRODUCERS.echo());

test('die Zahl bewegt sich, wenn man den Erzeuger ändert', () => {
  // Die Abnahmebedingung aus 17.5, als Messung: ohne Erzeuger null, mit dem
  // Soll-Echo die Obergrenze. Seit 17.7 steht dazwischen der gemessene Stand
  // der Engine in `tests/korpus/baseline.json`.
  expect(compared(NO_PRODUCER_RUN), 'ohne Erzeuger darf nichts als verglichen gelten').toBe(0);
  expect(hits(NO_PRODUCER_RUN), 'ohne Erzeuger darf es keinen Treffer geben').toBe(0);
  expect(green(NO_PRODUCER_RUN).size, 'ohne Erzeuger darf kein Fall grün sein').toBe(0);

  expect(compared(ECHO_RUN), 'mit einem Erzeuger muss die Zahl sich bewegen').toBeGreaterThan(150);
  expect(hits(ECHO_RUN)).toBe(compared(ECHO_RUN));
  expect(green(ECHO_RUN).size, 'ein perfekter Erzeuger muss grün werden können').toBeGreaterThan(60);
});

for (const probe of STATEMENT_PROBES) {
  test(`${probe.name}`, () => {
    const mutated = compareAll(undefined, probe.producer);
    const before = green(ECHO_RUN);
    const after = green(mutated);

    if (probe.stayGreen) {
      const lost = [...before].filter((id) => !after.has(id));
      expect(
        lost.join(', '),
        `${probe.why}\nDiese Fälle sind gefallen, obwohl die Aussage dieselbe geblieben ist.`,
      ).toEqual('');
      return;
    }

    const fell = [...before].filter((id) => !after.has(id));
    expect(
      fell.length,
      `${probe.why}\nKein einziger übereinstimmender Fall ist gefallen — die Facette sieht diese ` +
        `Verschlechterung nicht. Das ist ein Defekt in tests/helpers/korpus-comparison.ts.`,
    ).toBeGreaterThan(0);
  });
}

// ---------------------------------------------------------------------------
// Verbotene Aussagen: die Halluzinationsmessung (Roadmap 17.9)
// ---------------------------------------------------------------------------

/**
 * Dieselbe Frage ein drittes Mal, und diesmal gegen **Erfindung**: sieht die
 * Facette es, wenn ein Erzeuger genau das sagt, was der Fall ausdrücklich
 * verbietet?
 *
 * Der Korpus führt in 47 von 68 Fällen 197 verbotene Aussagen. Die Probe
 * `PROBE_PRODUCERS.forbidden` schreibt erst das Fallbuch ab — Abdeckung und
 * Inhalt bleiben damit heil, und was fällt, fällt wirklich wegen der
 * verbotenen Aussage — und sagt dann zusätzlich jeden ableitbaren Kern an
 * dessen eigenem Anker.
 */
const FORBIDDEN_RUN = compareAll(undefined, PROBE_PRODUCERS.forbidden());

const forbiddenAspect = (result: ClassResult) => result.aspects.find((a) => a.name === 'verbotene-aussagen');

test('V1 — ein Erzeuger, der eine verbotene Aussage sagt, macht die Facette rot', () => {
  const before = green(ECHO_RUN);
  const after = green(FORBIDDEN_RUN);
  const fell = [...before].filter((id) => !after.has(id));
  expect(
    fell.length,
    'Kein einziger übereinstimmender Fall ist gefallen, obwohl der Erzeuger wörtlich sagt, was der Fall ' +
      'verbietet. Dann misst die Teilprüfung „verbotene-aussagen" nichts.',
  ).toBeGreaterThan(20);

  // Und zwar **wegen** der verbotenen Aussage: Abdeckung und Inhalt sind in
  // dieser Probe unverändert, weil sie die Sollsätze mitliefert.
  expect(hits(FORBIDDEN_RUN), 'die Probe hat den Inhalt beschädigt — dann beweist ihr Rot nichts').toBe(
    hits(ECHO_RUN),
  );
  const stillPassing = fachsaetze(FORBIDDEN_RUN).filter((result) => {
    const aspect = forbiddenAspect(result);
    return aspect != null && aspect.status === 'compared' && aspect.compared > 0;
  });
  expect(
    stillPassing.map((r) => `${r.case}: ${forbiddenAspect(r)?.compared}/${forbiddenAspect(r)?.total}`).join('\n'),
    'Jede vergleichbare verbotene Aussage wurde wörtlich gesagt; keine darf als eingehalten gelten.',
  ).toEqual('');
});

test('V2 — das Fallbuch verletzt sich nicht selbst (die Kalibrierung der Kernbildung)', () => {
  // Die Gegenprobe zu der Regel, die den **Kern** einer verbotenen Aussage
  // bildet (`forbiddenCores`): wäre sie zu weitherzig, träfe sie die
  // Sollsätze desselben Falls — die sprechen über dieselben Zeilen, mit
  // denselben Bezeichnern, über dasselbe Thema. Der Soll-Echo-Erzeuger sagt
  // genau die 173 Sollsätze; keine einzige verbotene Aussage darf anschlagen.
  const violated = fachsaetze(ECHO_RUN).filter((result) => {
    const aspect = forbiddenAspect(result);
    return aspect != null && aspect.status === 'compared' && aspect.compared < aspect.total;
  });
  expect(
    violated.map((result) => `  ${result.case}: ${result.evidence}`).join('\n'),
    'Ein Sollsatz des Fallbuchs schlägt gegen eine verbotene Aussage desselben Falls an. Entweder ist die ' +
      'Kernbildung in forbiddenCores zu weitherzig — dann wird sie enger begründet, nicht die Schwelle ' +
      'verschoben — oder das Fallbuch widerspricht sich.',
  ).toEqual('');
});

test('V4 — die Probe sagt jeden Kern einer verbotenen Aussage, nicht nur den ersten', () => {
  // QA-Review von 4b4586aff273: die Probe sagte nur `cores[0]`, und eine
  // Regression, die einen späteren Kern nicht mehr erkennt, blieb unbemerkt.
  const probe = PROBE_PRODUCERS.forbidden();
  let multiCore = 0;
  for (const korpusCase of readCases()) {
    const reading = readWithEngine(korpusCase, undefined, probe);
    const said = reading.businessStatements.filter((statement) => (statement.id ?? '').startsWith('V-'));
    const conclusions = readForbiddenConclusions(korpusCase).filter((entry) => entry.cores.length > 0);
    multiCore += conclusions.filter((entry) => entry.cores.length > 1).length;
    const cores = conclusions.flatMap((entry) => entry.cores);
    expect(said.map((statement) => statement.text), korpusCase.id).toEqual(cores);
    // Jeder einzelne Kern schlägt für sich an, an seinem eigenen Satz.
    const violations = forbiddenViolations(conclusions, reading);
    for (const statement of said) {
      expect(
        violations.some((v) => v.statementId === statement.id && v.core === statement.text),
        `${korpusCase.id}: der Kern «${statement.text}» wurde gesagt und nicht erkannt`,
      ).toBe(true);
    }
  }
  expect(multiCore, 'kein Fall hat eine verbotene Aussage mit mehr als einem Kern — dann prüft V4 nichts').toBeGreaterThan(0);
});

test('V5 — auch ein Fall ohne Sollfachsatz wird gegen seine verbotenen Aussagen gemessen', () => {
  // QA-Review von 4b4586aff273: der Zweig ohne Sollfachsatz kehrte vor der
  // Prüfung zurück, und eine gesagte verbotene Aussage blieb ungeprüft.
  const korpusCase = readCases().find((c) => readForbiddenConclusions(c).some((entry) => entry.cores.length > 0));
  expect(korpusCase, 'kein Fall mit vergleichbarer verbotener Aussage').toBeTruthy();
  if (!korpusCase) return;
  const withoutStatements = { ...korpusCase, expected: { ...korpusCase.expected, businessStatements: [] } };
  const result = compareCase(withoutStatements, readWithEngine(withoutStatements, undefined, PROBE_PRODUCERS.forbidden()))
    .find((r) => r.class === 'fachsaetze');
  const aspect = result ? forbiddenAspect(result) : undefined;
  expect(aspect?.status).toBe('compared');
  expect(aspect?.total).toBeGreaterThan(0);
  expect(aspect?.compared, 'jede verbotene Aussage wurde gesagt; keine darf als eingehalten gelten').toBe(0);
  expect(result?.verdict).toBe('engine-defekt');
});

test('V3 — der Erzeuger des Produkts nennt seine Zahl', () => {
  // Keine Abnahmeschwelle, sondern eine Ratsche: die Zahl wird **berichtet**
  // und steht je Fall in `tests/korpus/baseline.json`. Steigt sie, ist das ein
  // Befund am Erzeuger — und kein Grund, die Schranke oder die Schwelle zu
  // verschieben (Roadmap 17.9).
  const run = compareAll(undefined, ENGINE_PRODUCER);
  const aspects = fachsaetze(run).map(forbiddenAspect);
  const total = aspects.reduce((sum, a) => sum + (a?.total ?? 0), 0);
  const kept = aspects.reduce((sum, a) => sum + (a?.compared ?? 0), 0);
  const checked = aspects.filter((a) => a?.status === 'compared').length;
  expect(total, 'der Korpus führt keine vergleichbaren verbotenen Aussagen mehr').toBeGreaterThan(150);
  expect(checked, 'in keinem Fall wurde gegen eine verbotene Aussage gemessen').toBeGreaterThan(40);
  expect(
    total - kept,
    `Der Engine-Erzeuger verletzt ${total - kept} von ${total} vergleichbaren verbotenen Aussagen.`,
  ).toBeLessThanOrEqual(4);
});

test('die vier anderen Facetten bewegen sich nicht, wenn nur der Erzeuger wechselt', () => {
  // Ein Erzeuger für Fachsätze darf an `befunde`, `level`, `objekte` und
  // `skelett` nichts ändern; täte er es, wäre die Naht undicht.
  const key = (result: ClassResult) => `${result.case}|${result.class}|${result.state}|${result.verdict}`;
  const other = (results: ClassResult[]) => results.filter((r) => r.class !== 'fachsaetze').map(key);
  expect(other(ECHO_RUN)).toEqual(other(NO_PRODUCER_RUN));
  // Auch die Halluzinationsprobe aus 17.9 darf an den vier anderen nichts rühren.
  expect(other(FORBIDDEN_RUN)).toEqual(other(NO_PRODUCER_RUN));
});
