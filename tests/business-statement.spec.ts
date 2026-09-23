import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  attachTo,
  buildBusinessStatements,
  resolveValue,
  type BusinessStatement,
} from '../lib/abap/business-statement';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { readStatements } from '../lib/abap/statement-reader';
import {
  readCases,
  readWithEngine,
  statementTokens,
  STATEMENT_MATCH_THRESHOLD,
} from './helpers/korpus-comparison';
import { tableTerm, termFor } from '../lib/abap/business-glossary';
import { PROVENANCE } from '../lib/provenance';

/**
 * Der Fachsatz-Erzeuger der Engine (Roadmap 17.7, Weg A).
 *
 * Dieses Spec prüft **nicht**, wie gut die Sätze sind — das tut der Korpus
 * (`tests/korpus/baseline.json`, Facette `fachsaetze`), und zwar mit einem
 * Vergleicher, den dieser Schritt nicht angefasst hat. Hier stehen die drei
 * Zusagen, die 17.7 dem Erzeuger auferlegt und die eine Trefferzahl nicht
 * abdeckt:
 *
 * 1. **Unschärfe wird aufgelöst und ausgewiesen, in dieser Reihenfolge.**
 *    Kein Element trägt „nicht bestimmt" *statt* einer Aussage.
 * 2. **Regel 6 bleibt, wo sie steht.** Die Knotenbeschriftung des Skeletts ist
 *    weiter ein wörtliches Token; der Fachsatz ist eine Ebene daneben.
 * 3. **Deterministisch.** Kein Modell, kein Netz, kein Schlüssel — und
 *    derselbe Quelltext ergibt denselben Satz.
 */

/**
 * Der Wortschatz, den dieses Modul führt — großzügig gelesen, damit die
 * Obergrenze unten keine zu kleine Zahl ausrechnet.
 */
const HOUSE_VOCABULARY = `ausgegeben ausgabe selektiert gelesen ermittelt geaendert persistiert
verworfen aufgerufen uebergeben uebernommen gesetzt verlassen block reportingblock
zurueckgekehrt geschrieben nichts treffer treffern liste ergebnis enthaelt zeile zeilen
satz saetze commit work rollback ausgefuehrt registriert verbuchung baustein
funktionsbaustein unterprogramm methode berechtigung geprueft meldung tabelle konstante
zuweisung laufzeit eingabe eingegebenen entscheidet welche negative groesser kleiner
einschliesslich erhalten setzen leere sonst beendet screenfolge angelegt gebunden
struktur komponente instanz klasse erbt kindklasse include benoetigt datenbankoperation
mandant anmeldemandanten praedikat automatik zugriffskontrolle entitaet umgangen
asynchron task gestartet kindprogramm destination benachrichtigt grossbuchstaben
gewandelt zusicherung laufzeitfehler abgebrochen belegt erreichen code`.split(/\s+/);

const CASES = readCases();
const ALL: Array<{ case: string; file: string; statement: BusinessStatement }> = CASES.flatMap((korpusCase) =>
  korpusCase.sources.flatMap((source) =>
    buildBusinessStatements(source.code).map((statement) => ({
      case: korpusCase.id,
      file: source.name,
      statement,
    })),
  ),
);

test('die Engine erzeugt überhaupt Fachsätze — für jeden Fall des Korpus', () => {
  // Vor 17.7 war die Antwort null, über alle 68 Fälle. Das war eine Messung,
  // keine Verdrahtung, und dieser Test hält den Unterschied fest.
  expect(ALL.length, 'kein einziger erzeugter Fachsatz').toBeGreaterThan(0);
  const silent = CASES.filter(
    (korpusCase) => !ALL.some((entry) => entry.case === korpusCase.id),
  ).map((korpusCase) => korpusCase.id);
  expect(silent.join(', '), 'diese Fälle bekommen von der Engine keinen einzigen Satz').toEqual('');
});

test('„nicht bestimmt" tritt nie an die Stelle eines Satzes (Forderung 3)', () => {
  // Der bequeme Weg wäre, bei jeder Lücke zu schweigen und das Schweigen als
  // Ehrlichkeit auszugeben. Genau das ist hier untersagt: erst die
  // bestmögliche belegbare Aussage, dann der Rest an Unsicherheit *an* ihr.
  const broken: string[] = [];
  for (const entry of ALL) {
    const { core, text, uncertainties, provenance } = entry.statement;
    if (!core.trim()) broken.push(`${entry.case}/${entry.statement.id}: leerer Kernsatz`);
    if (provenance !== 'reconstructed') {
      broken.push(`${entry.case}/${entry.statement.id}: Herkunft ${provenance} statt reconstructed`);
    }
    if (!text.startsWith(core)) {
      broken.push(`${entry.case}/${entry.statement.id}: der Vorbehalt steht vor der Aussage`);
    }
    for (const note of uncertainties) {
      if (note.provenance !== 'not-determined') {
        broken.push(`${entry.case}/${entry.statement.id}: Vorbehalt mit fremder Herkunft`);
      }
    }
    // Eine Aussage, die nur aus einem Vorbehalt besteht, ist keine Aussage.
    if (/^(nicht bestimmt|unbekannt|nicht belegt)\.?$/i.test(core.trim())) {
      broken.push(`${entry.case}/${entry.statement.id}: „${core}" ist kein Fachsatz`);
    }
  }
  expect(broken.slice(0, 10).join('\n')).toEqual('');
});

test('die Herkunft kommt aus lib/provenance.ts und ist nie neu erfunden', () => {
  // `reconstructed` heißt dort: „Derived from the code, not confirmed by
  // anyone." Genau das ist ein Engine-Satz, und deshalb steht hier kein
  // eigener Wert.
  expect(PROVENANCE.reconstructed.value).toBe('reconstructed');
  expect(PROVENANCE['not-determined'].value).toBe('not-determined');
  const values = new Set(ALL.map((entry) => entry.statement.provenance));
  expect([...values]).toEqual(['reconstructed']);
});

test('jeder Anker zeigt auf eine ABAP-Anweisung, die es gibt', () => {
  const broken: string[] = [];
  for (const korpusCase of CASES) {
    for (const source of korpusCase.sources) {
      const statements = readStatements(source.code);
      for (const produced of buildBusinessStatements(source.code)) {
        for (const anchor of produced.anchors) {
          const hit = statements.some(
            (statement) => statement.lineStart === anchor.lineStart && statement.lineEnd === anchor.lineEnd,
          );
          if (!hit) broken.push(`${korpusCase.id}/${produced.id}: ${anchor.lineStart}-${anchor.lineEnd}`);
        }
      }
    }
  }
  expect(broken.slice(0, 10).join(', ')).toEqual('');
});

test('derselbe Quelltext ergibt denselben Satz — kein Modell, kein Zufall', () => {
  for (const korpusCase of CASES.slice(0, 12)) {
    for (const source of korpusCase.sources) {
      const first = buildBusinessStatements(source.code);
      const second = buildBusinessStatements(source.code);
      expect(JSON.stringify(second), `${korpusCase.id}/${source.name} ist nicht reproduzierbar`).toEqual(
        JSON.stringify(first),
      );
    }
  }
});

test('Schritt 1 vor Schritt 2: der Wert wird aufgelöst, bevor er bemängelt wird', () => {
  // CC-036 nennt die Tabelle über eine Konstante; CC-011 den Baustein über
  // eine Zuweisung. Ein Erzeuger, der hier „nicht bestimmt" sagt, hat die
  // Auflösung übersprungen — und das ist der Fehler, den 17.7 verbietet.
  const constantCase = readStatements(
    readFileSync(join(process.cwd(), 'tests/korpus/cases/CC-036/source.abap'), 'utf8'),
  );
  const constant = resolveValue('lc_tab', constantCase, constantCase.length);
  expect(constant.value).toBe('KNA1');
  expect(constant.from).toBe('constant');

  const assignedCase = readStatements(
    readFileSync(join(process.cwd(), 'tests/korpus/cases/CC-011/source.abap'), 'utf8'),
  );
  const assigned = resolveValue('lv_function', assignedCase, assignedCase.length);
  expect(assigned.value).toBe('CONVERSION_EXIT_ALPHA_INPUT');
  expect(assigned.from).toBe('assignment');
});

test('Regel 6 bleibt im Skelett: der Fachsatz ist eine Ebene daneben', () => {
  // (a) Die Abhängigkeit zeigt nur in eine Richtung. Importierte
  //     `process-skeleton.ts` den Erzeuger, könnte eine erfundene Phrase in
  //     eine Knotenbeschriftung geraten, ohne dass es jemand bemerkt.
  const skeletonSource = readFileSync(join(process.cwd(), 'lib/abap/process-skeleton.ts'), 'utf8');
  expect(
    skeletonSource.includes('business-statement'),
    'process-skeleton.ts darf den Fachsatz-Erzeuger nicht kennen — sonst ist Regel 6 offen',
  ).toBe(false);

  // (b) Das Skelett kommt unverändert aus der Zuordnung zurück, und die
  //     Beschriftungen bleiben wörtliche Tokens aus der Quelle.
  for (const korpusCase of CASES.slice(0, 20)) {
    for (const source of korpusCase.sources) {
      const skeleton = buildProcessSkeleton(source.code);
      const before = JSON.stringify(skeleton);
      const attached = attachTo(skeleton.nodes, buildBusinessStatements(source.code));
      expect(JSON.stringify(skeleton), `${korpusCase.id}: attachTo hat das Skelett verändert`).toEqual(before);
      for (const [nodeId, statement] of attached) {
        const node = skeleton.nodes.find((candidate) => candidate.id === nodeId);
        expect(node, `${korpusCase.id}: Satz an einem Knoten, den es nicht gibt`).toBeTruthy();
        expect(statement.core.length, `${korpusCase.id}/${nodeId}: leerer Satz am Knoten`).toBeGreaterThan(0);
      }
    }
  }
});

test('der Fachsatz steht am BPMN-Element, nicht in einer Liste daneben (Forderung 2)', () => {
  // Gemessen, nicht behauptet: wie viele Knoten mit Zeilenanker bekommen einen
  // Satz? Die Zahl darf sinken, wenn das Skelett wächst — aber nicht auf null,
  // und nicht unter die Hälfte, sonst ist die Business-Sicht wieder eine Liste.
  let anchored = 0;
  let withSentence = 0;
  for (const korpusCase of CASES) {
    for (const source of korpusCase.sources) {
      const skeleton = buildProcessSkeleton(source.code);
      const attached = attachTo(skeleton.nodes, buildBusinessStatements(source.code));
      for (const node of skeleton.nodes) {
        if (!node.anchor) continue;
        anchored += 1;
        if (attached.has(node.id)) withSentence += 1;
      }
    }
  }
  expect(anchored, 'kein Knoten des Korpus trägt einen Zeilenanker').toBeGreaterThan(100);
  expect(
    withSentence / anchored,
    `nur ${withSentence} von ${anchored} verankerten Knoten tragen einen Fachsatz`,
  ).toBeGreaterThan(0.5);
});

/**
 * **Die Obergrenze — gemessen, nicht behauptet.**
 *
 * Die Abnahmezahl aus 17.7 („≥ 120 von 173") ist in 17.6 gesetzt worden, bevor
 * es einen Erzeuger gab; die Roadmap sagt selbst: *„Eine Zielzahl für den
 * ersten Erzeuger fehlt noch."* Dieser Test rechnet nach, was ein
 * **Satzbaukasten überhaupt erreichen kann**, und zwar großzügig: er unterstellt
 * einen Erzeuger, der aus jedem Sollsatz genau die Wörter trifft, die aus dem
 * Anker ableitbar sind — jedes Wort der ABAP-Anweisung, jede Übersetzung des
 * Wörterbuchs, dazu den ganzen Wortschatz, den die Sätze dieses Moduls führen.
 * Besser als dieser Erzeuger kann keiner werden, der nichts erfindet.
 *
 * Was übrig bleibt, ist der Teil der Sollsätze, der **nicht im Code steht**:
 * die Beurteilungsprosa des Fallbuchs — „nicht belegt", „im Slice unbekannt",
 * „ein Fachsatz über ‚Kunden' ist hier nicht tragbar", Verweise auf F03, S11
 * und auf andere Fälle. Wer diese Zahl heben will, muss die Engine diese Sätze
 * sagen lassen; sie sind Bewertung, nicht Ableitung.
 */
test('die Abnahmezahl 120 liegt über dem, was ein Satzbaukasten erreichen kann', () => {
  const house = HOUSE_VOCABULARY;
  let reachable = 0;
  let total = 0;
  for (const korpusCase of CASES) {
    const reading = readWithEngine(korpusCase);
    for (const expected of korpusCase.expected.businessStatements) {
      total += 1;
      const words = new Set<string>(house);
      for (const anchor of expected.anchors) {
        const file = reading.perFile.find((entry) => entry.file === anchor.file);
        const statement =
          file && anchor.line != null
            ? file.statements.find((s) => s.lineStart <= anchor.line! && anchor.line! <= s.lineEnd)
            : null;
        if (!statement) continue;
        for (const token of statementTokens(statement.text)) {
          words.add(token);
          for (const word of statementTokens(termFor(token).singular)) words.add(word);
          for (const word of statementTokens(termFor(token).plural)) words.add(word);
          const table = tableTerm(token);
          if (table) {
            for (const word of statementTokens(table.singular)) words.add(word);
            for (const word of statementTokens(table.plural)) words.add(word);
          }
        }
      }
      const soll = statementTokens(expected.text ?? '');
      const shared = [...soll].filter((token) => words.has(token)).length;
      const ceiling = shared === 0 ? 0 : (2 * shared) / (shared + soll.size);
      if (ceiling >= STATEMENT_MATCH_THRESHOLD) reachable += 1;
    }
  }
  expect(total).toBe(173);
  // Der gemessene Wert am 23.09.2026: **116** — nachgerechnet, indem die Schranke
  // testweise unerfüllbar gesetzt und die gemeldete Zahl gelesen wurde. Im
  // Kommentar stand zuvor 107; das war der Stand, bevor das Wörterbuch fertig
  // war, und es ist genau die Sorte Zahl, die später als Beleg gelesen wird.
  //
  // 116 ist die Obergrenze für einen Erzeuger, der nichts erfindet. Die Abnahme
  // aus 17.6 lautet 120 — sie ist damit für Weg A allein nicht erreichbar, aber
  // knapp: es fehlen vier Sollsätze, nicht dreizehn.
  //
  // Die Schranke unten steht bewusst darunter und nicht darauf — sie darf sich
  // bewegen, wenn das Wörterbuch wächst.
  expect(reachable, 'die Obergrenze ist gefallen — das Wörterbuch ist geschrumpft').toBeGreaterThan(95);
  expect(
    reachable,
    `Ein Satzbaukasten kann höchstens ${reachable} von ${total} Sollsätzen treffen. ` +
      'Die Abnahmezahl 120 aus 17.7 ist damit nicht erreichbar, ohne dass die Engine ' +
      'die Beurteilungsprosa des Fallbuchs mitspricht — das wäre Erfindung, nicht Ableitung. ' +
      'Diese Zahl gehört Sonny: entweder die Abnahme wird auf das Messbare gesetzt, ' +
      'oder 17.7 bleibt offen und 17.8 (das Modell) muss den Rest tragen.',
  ).toBeLessThan(120);
});
