import { test, expect } from '@playwright/test';
import {
  compareAll,
  readBaseline,
  resultId,
  SKELETON_BRIDGES,
  type ClassResult,
  type FacetAspect,
} from './helpers/korpus-comparison';

/**
 * Der Facettenstatus des Korpus-Vergleichers (Roadmap 1.9, CR-05).
 *
 * Der Gegenreview c5085bb hat der Korpus-Ampel vorgehalten, dass sie nicht
 * prüft, was sie sagt, und die Zahlen gaben ihm recht: über die 47 Fälle, die
 * in der Klasse `skelett` auf `agree` standen, waren **71 von 390 Sollknoten
 * (18,2 %)** überhaupt vergleichbar — CC-001 stand grün mit dem Grund „2 von 8
 * Knoten vergleichbar" —, und `fachsaetze` stand 68-mal grün mit dem Grund
 * „die Engine erzeugt keine Fachsätze". Ein Grün, das „nicht geprüft" heißt,
 * ist schlimmer als eine offene Abweichung: die Übereinstimmungszahlen werden
 * als Beleg gelesen, und `docs/ROADMAP.md` 2.10 macht „das Skelett stimmt
 * überein" zur Abnahmebedingung.
 *
 * Diese Datei hält die vier Zusagen aus 1.9 — und sie hält sie an der
 * **lebenden** Messung, nicht an der Baseline: eine Baseline lässt sich neu
 * schreiben, eine Messung nicht.
 */

const LIVE: ClassResult[] = compareAll();
const BASELINE = readBaseline();

function show(result: ClassResult): string {
  return `  ${result.case} [${result.class}] ${result.scope.compared}/${result.scope.total}\n      ${result.evidence}`;
}

test.describe('kein Grün ohne Deckung', () => {
  test('kein agree in skelett unter 50 % vergleichbaren Knoten', () => {
    const thin = LIVE.filter(
      (result) => result.class === 'skelett' && result.state === 'agree' && result.scope.compared * 2 < result.scope.total,
    );
    expect(
      thin.map(show).join('\n'),
      'Ein Fall gilt in der Facette skelett nur dann als übereinstimmend, wenn mindestens die Hälfte seiner ' +
        'Sollknoten überhaupt vergleichbar war. Alles darunter ist eine Aussage über den Umfang der Prüfung, ' +
        'keine über die Engine.',
    ).toEqual('');
  });

  test('keine Facette ist agree, ohne etwas verglichen zu haben', () => {
    const empty = LIVE.filter((result) => result.state === 'agree' && result.scope.compared === 0);
    expect(
      empty.map(show).join('\n'),
      'Zähler 0 heißt: es wurde nichts verglichen. Das ist nie eine Übereinstimmung.',
    ).toEqual('');
  });

  test('die Facette fachsaetze führt „nicht geprüft" nie als Grün', () => {
    // Die Engine erzeugt keine Fachsätze (Roadmap 2.4). Was der Vergleich hier
    // tut, ist ein rein syntaktischer Ankercheck, und der heißt jetzt so.
    const green = LIVE.filter((result) => result.class === 'fachsaetze' && result.state === 'agree');
    expect(green.map(show).join('\n')).toEqual('');
    const withoutName = LIVE.filter(
      (result) =>
        result.class === 'fachsaetze' &&
        result.scope.total > 0 &&
        !result.aspects.some((aspect) => aspect.status === 'anchor_validation_passed' || aspect.name === 'ankerpruefung'),
    );
    expect(
      withoutName.map(show).join('\n'),
      'Ein bestandener Ankercheck heißt anchor_validation_passed und nicht „stimmt überein".',
    ).toEqual('');
  });

  test('kein Grund behauptet mehr, die Engine baue kein Prozessskelett', () => {
    // `lib/abap/process-skeleton.ts` gibt es seit Phase 2; der Satz stand bis
    // zum 22.09.2026 in jedem einzelnen Skelettergebnis und war seitdem falsch.
    const offenders = [
      ...LIVE.filter((result) => /baut kein Prozessskelett|erzeugt kein Prozessskelett/.test(result.evidence)).map(show),
      ...BASELINE.entries
        .filter((entry) => /baut kein Prozessskelett|erzeugt kein Prozessskelett/.test(entry.reason))
        .map((entry) => `  ${entry.case} [${entry.class}] (Baseline)`),
    ];
    expect(offenders.join('\n')).toEqual('');
  });
});

test.describe('jede Facette nennt Zähler, Nenner und Prüfstatus', () => {
  test('der Umfang steht an jedem Ergebnis und in jedem Baselineeintrag', () => {
    const bad: string[] = [];
    for (const result of LIVE) {
      if (!Number.isInteger(result.scope.compared) || !Number.isInteger(result.scope.total)) {
        bad.push(`  ${resultId(result)}: Umfang ohne Zahlen`);
      }
      if (result.scope.compared > result.scope.total) {
        bad.push(`  ${resultId(result)}: ${result.scope.compared} von ${result.scope.total} — Zähler über dem Nenner`);
      }
      if (result.aspects.length === 0) bad.push(`  ${resultId(result)}: keine Teilprüfung`);
    }
    for (const entry of BASELINE.entries) {
      if (entry.scope == null || entry.aspects == null) bad.push(`  ${resultId(entry)}: Baselineeintrag ohne Umfang`);
    }
    expect(bad.join('\n')).toEqual('');
  });

  test('jede Teilprüfung trägt einen der drei Prüfstatus und eine Begründung', () => {
    const allowed = new Set(['compared', 'not_checked', 'anchor_validation_passed']);
    const bad: string[] = [];
    for (const result of LIVE) {
      for (const aspect of result.aspects) {
        if (!allowed.has(aspect.status)) bad.push(`  ${resultId(result)}/${aspect.name}: Status „${aspect.status}"`);
        if (aspect.note.length < 20) bad.push(`  ${resultId(result)}/${aspect.name}: Begründung zu dünn`);
        if (aspect.status === 'not_checked' && aspect.compared > 0) {
          bad.push(`  ${resultId(result)}/${aspect.name}: „nicht geprüft" mit Zähler ${aspect.compared}`);
        }
      }
    }
    expect(bad.join('\n')).toEqual('');
  });

  test('die Teilprüfungen für 2.15, 2.16 und 2.17 stehen bereit und sagen ehrlich „nicht geprüft"', () => {
    // Solange kein Fall eine Gateway-Klasse, eine Lane oder einen parallelen
    // Knoten nennt, ist das Sollfeld leer. Ein leeres Sollfeld erfindet keine
    // Werte — es sagt, dass hier nichts geprüft wurde, und es wird rot, sobald
    // 2.10 die Felder liefert und die Engine sie nicht bedient.
    const skeleton = LIVE.filter((result) => result.class === 'skelett');
    for (const name of ['gateway-klasse', 'lanes', 'parallelitaet']) {
      const missing = skeleton.filter((result) => !result.aspects.some((aspect) => aspect.name === name));
      expect(missing.map(show).join('\n'), `Teilprüfung „${name}" fehlt`).toEqual('');
    }
    const invented = skeleton.flatMap((result) =>
      result.aspects
        .filter((aspect) => ['gateway-klasse', 'lanes', 'parallelitaet'].includes(aspect.name))
        .filter((aspect) => aspect.status === 'compared' && aspect.compared === 0)
        .map((aspect) => `  ${result.case}/${aspect.name}: „verglichen" ohne Zähler`),
    );
    expect(invented.join('\n')).toEqual('');
  });

  test('kein Prüfstatus ändert sich unbemerkt', () => {
    // Dieselbe Ratsche wie beim Urteil, eine Ebene tiefer: wenn 2.15/2.16/2.17
    // eine Teilprüfung von „nicht geprüft" auf „verglichen" hebt, ist das eine
    // gute Nachricht, und sie gehört in die Baseline geschrieben.
    const key = (entry: { case: string; class: string }, aspect: FacetAspect) =>
      `${entry.case}|${entry.class}|${aspect.name}`;
    const recorded = new Map<string, string>();
    for (const entry of BASELINE.entries) {
      for (const aspect of entry.aspects ?? []) recorded.set(key(entry, aspect), aspect.status);
    }
    const changed: string[] = [];
    for (const result of LIVE) {
      for (const aspect of result.aspects) {
        const before = recorded.get(key(result, aspect));
        if (before != null && before !== aspect.status) {
          changed.push(`  ${key(result, aspect)}: festgehalten ${before}, jetzt ${aspect.status}`);
        }
      }
    }
    expect(
      changed.join('\n'),
      'Ein Prüfstatus hat sich geändert. Lesen Sie, warum, und schreiben Sie die Baseline neu ' +
        '(npx tsx tests/helpers/korpus-baseline-write.ts).',
    ).toEqual('');
  });
});

test.describe('die Skelettbrücken sind nachlesbar', () => {
  test('jede Brücke nennt eine Knotenart, ein Konstrukt und eine Begründung', () => {
    for (const bridge of SKELETON_BRIDGES) {
      expect(bridge.kinds.length, `${bridge.type} ohne Knotenart der Engine`).toBeGreaterThan(0);
      expect(bridge.why.length, `${bridge.type} ohne Begründung`).toBeGreaterThan(40);
      expect(bridge.construct.source.length, `${bridge.type} ohne Konstrukt`).toBeGreaterThan(2);
    }
  });

  test('der Vergleich fasst das echte Skelett an', () => {
    // Der Befund, der 1.9 ausgelöst hat: die Facette skelett rief
    // `buildProcessFacts` und nie `buildProcessSkeleton`. Eine Facette, die das
    // geprüfte Modul nie aufruft, kann keine Änderung daran fangen — und genau
    // darauf bauen 2.15, 2.16 und 2.17 auf.
    const skeleton = LIVE.filter((result) => result.class === 'skelett');
    const compared = skeleton.reduce((sum, result) => sum + result.scope.compared, 0);
    const total = skeleton.reduce((sum, result) => sum + result.scope.total, 0);
    expect(total, 'der Korpus führt keine Skelettknoten mehr').toBeGreaterThan(400);
    // 18,2 % war der Stand vor 1.9. Die Schwelle ist bewusst weit unter dem
    // gemessenen Wert: sie hält die Regression fest, nicht das Optimum.
    expect(compared / total, `nur ${compared} von ${total} Sollknoten vergleichbar`).toBeGreaterThan(0.5);
  });
});
