import { test, expect } from '@playwright/test';
import {
  ENGINE_PRODUCER,
  MIN_FORBIDDEN_CORE_TOKENS,
  compareAll,
  compareCase,
  readBaseline,
  readCases,
  readWithEngine,
  resultId,
  PENDING_SKELETON_ASPECTS,
  SKELETON_BRIDGES,
  type ClassResult,
  type FacetAspect,
  type KorpusCase,
  NO_PRODUCER,
  STATEMENT_MATCH_THRESHOLD,
  readForbiddenConclusions,
  statementSimilarity,
  statementTokens,
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
    // Bis 17.5 stand hier „kein fachsaetze-Ergebnis ist je grün". Das war
    // richtig gemessen und falsch formuliert: die Facette war hart auf
    // `disagree` verdrahtet, und ein Test, der eine Verdrahtung bestätigt,
    // misst die Verdrahtung. Die Regel, die wirklich gilt, ist die aus 1.9:
    // grün nur, wenn der **Inhalt** verglichen wurde und die Deckung
    // vollständig ist. Solange niemand Fachsätze erzeugt (17.6), fällt darunter
    // kein einziger Fall — geprüft wird aber die Regel, nicht das Ergebnis.
    const unearned = LIVE.filter((result) => {
      if (result.class !== 'fachsaetze' || result.state !== 'agree') return false;
      const content = result.aspects.find((aspect) => aspect.name === 'fachsatzinhalt');
      return (
        content == null ||
        content.status !== 'compared' ||
        content.compared === 0 ||
        content.compared !== content.total ||
        result.scope.compared !== result.scope.total
      );
    });
    expect(
      unearned.map(show).join('\n'),
      'Grün in fachsaetze heißt: jeder Sollsatz hatte ein erzeugtes Gegenstück an derselben ABAP-Anweisung, ' +
        'und jedes davon lag über der Schwelle. Alles andere ist „nicht geprüft".',
    ).toEqual('');
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

  test('ein Sollwert aus 2.15/2.16/2.17 wird nicht als verglichen gezählt', () => {
    // Anlass: QA-Review von `9e408888bfec`, Fingerabdruck `c100d056f0d2`. Bis
    // dahin hob das bloße **Vorhandensein** von `gatewayClass`, `lane` oder
    // `parallel` die Facette auf `compared` — verglichen wurde nichts, und der
    // Fall blieb grün. Heute trägt keine der 68 expected.json eines dieser
    // Felder, der Fehler wäre also erst mit 2.10 sichtbar geworden; diese Probe
    // nimmt ihn vorweg, indem sie einem echten, übereinstimmenden Fall genau
    // einen Sollwert unterschiebt — an der gelesenen Sollantwort, nicht an der
    // Engine (`lib/` wird nicht angefasst).
    const green = new Set(
      LIVE.filter((result) => result.class === 'skelett' && result.state === 'agree').map((result) => result.case),
    );
    const cases = readCases().filter((korpusCase) => green.has(korpusCase.id));
    const withGateway = cases.find((korpusCase) =>
      korpusCase.expected.skeleton.nodes.some((node) => node.type === 'gateway'),
    );
    expect(withGateway, 'kein übereinstimmender Fall mit Gateway — die Probe misst sonst nichts').toBeTruthy();

    const clone = (korpusCase: KorpusCase): KorpusCase => JSON.parse(JSON.stringify(korpusCase)) as KorpusCase;
    const probes: Array<{ facet: string; why: string; make: (source: KorpusCase) => KorpusCase }> = [
      {
        facet: 'gateway-klasse',
        why: 'Der Fall nennt eine Gateway-Klasse (2.15); die Engine führt kein solches Feld.',
        make: (source) => {
          const copy = clone(source);
          const node = copy.expected.skeleton.nodes.find((entry) => entry.type === 'gateway');
          if (node) node.gatewayClass = 'exclusive';
          return copy;
        },
      },
      {
        facet: 'lanes',
        why: 'Der Fall nennt eine Lane mit Beweis (2.16); das Skelett erzeugt keine Lanes.',
        make: (source) => {
          const copy = clone(source);
          copy.expected.skeleton.lanes = [{ id: 'L1', evidence: 'AUTHORITY-CHECK', anchor: null }];
          return copy;
        },
      },
      {
        facet: 'parallelitaet',
        why: 'Der Fall nennt einen parallelen Knoten (2.17); das Skelett kennt keine Parallelität.',
        make: (source) => {
          const copy = clone(source);
          const node = copy.expected.skeleton.nodes[0];
          if (node) node.parallel = true;
          return copy;
        },
      },
    ];

    const bad: string[] = [];
    for (const probe of probes) {
      const source = withGateway as KorpusCase;
      const reading = readWithEngine(source);
      const result = compareCase(probe.make(source), reading).find((entry) => entry.class === 'skelett');
      const aspect = result?.aspects.find((entry) => entry.name === probe.facet);
      if (!aspect) {
        bad.push(`  ${probe.facet}: Teilprüfung fehlt`);
        continue;
      }
      if (aspect.status !== 'not_checked' || aspect.compared !== 0) {
        bad.push(
          `  ${probe.facet}: Status „${aspect.status}" mit Zähler ${aspect.compared}, obwohl nichts verglichen wurde. ${probe.why}`,
        );
      }
      if (result?.state === 'agree') {
        bad.push(`  ${probe.facet}: der Fall ${source.id} bleibt grün, obwohl ein Sollwert ungeprüft danebenliegt.`);
      }
    }
    expect(bad.join('\n')).toEqual('');
  });

  test('die offenen Teilprüfungen stehen an einer benannten Stelle', () => {
    // Der zweite Weg aus dem Befund — wirklich vergleichen — wäre heute kein
    // Vergleich: `lib/abap/process-skeleton.ts` führt weder Gateway-Klasse noch
    // Lane noch Parallel-Marker. Deshalb die Einhängestelle: wer 2.15/2.16/2.17
    // baut, findet hier, was er zu ersetzen hat.
    expect(PENDING_SKELETON_ASPECTS.map((aspect) => aspect.name)).toEqual([
      'gateway-klasse',
      'lanes',
      'parallelitaet',
    ]);
    for (const aspect of PENDING_SKELETON_ASPECTS) {
      expect(aspect.step, `${aspect.name} ohne Roadmap-Schritt`).toMatch(/^2\.1[567]$/);
      expect(aspect.what.length, `${aspect.name} ohne Beschreibung der Sollaussage`).toBeGreaterThan(5);
    }
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

test.describe('die verbotenen Aussagen werden verglichen (Roadmap 17.9)', () => {
  const ALL = readCases().map((korpusCase) => ({ id: korpusCase.id, list: readForbiddenConclusions(korpusCase) }));
  const FLAT = ALL.flatMap((entry) => entry.list.map((conclusion) => ({ case: entry.id, conclusion })));

  test('jede Facette fachsaetze führt die Teilprüfung „verbotene-aussagen"', () => {
    const missing = LIVE.filter(
      (result) => result.class === 'fachsaetze' && !result.aspects.some((aspect) => aspect.name === 'verbotene-aussagen'),
    );
    expect(
      missing.map(show).join('\n'),
      'Ohne diese Teilprüfung steht in der Baseline keine Zahl gegen Erfindung — und genau das war der Zustand ' +
        'bis zum 23.09.2026 (Roadmap 17.9).',
    ).toEqual('');
  });

  test('die Kernbildung ist abzählbar: jeder Satz ist vergleichbar oder benannt nicht vergleichbar', () => {
    // Es gibt keine dritte Kategorie und kein stilles Übergehen. Wo kein Kern
    // gebildet werden kann, steht der Grund am Satz (`why`) und der Satz fällt
    // aus dem Nenner — er gilt nie als bestanden.
    const comparable = FLAT.filter((entry) => entry.conclusion.cores.length > 0);
    const open = FLAT.filter((entry) => entry.conclusion.cores.length === 0);
    expect(comparable.length + open.length).toBe(FLAT.length);
    const silent = open.filter((entry) => entry.conclusion.why.length < 20);
    expect(silent.map((entry) => entry.case).join(', '), 'ein nicht vergleichbarer Satz ohne Grund').toEqual('');
    // Gemessen am 23.09.2026: 197 Sätze, 173 mit Kern, 24 ohne — die 24 sind
    // durchweg Einstufungsurteile („Kein D", „Nicht A", „kein Unknown"), aus
    // denen sich kein Fachsatz bilden lässt.
    expect(FLAT.length, 'der Korpus führt keine verbotenen Aussagen mehr').toBeGreaterThan(190);
    expect(
      comparable.length,
      `Von ${FLAT.length} verbotenen Aussagen haben nur ${comparable.length} einen Kern.`,
    ).toBeGreaterThan(160);
    for (const entry of comparable) {
      for (const core of entry.conclusion.cores) {
        expect(
          statementTokens(core).size,
          `${entry.case}: der Kern «${core}» hat weniger als ${MIN_FORBIDDEN_CORE_TOKENS} Inhaltswörter`,
        ).toBeGreaterThanOrEqual(MIN_FORBIDDEN_CORE_TOKENS);
      }
    }
  });

  test('ein Satz ohne Ankerpräfix gilt für den ganzen Fall und wird nicht übergangen', () => {
    // Die Handwerksfrage aus 17.9: 39 der 197 Sätze tragen kein Präfix
    // `source.abap:NN`. 21 davon nennen ihren Anker hinter einer Profilangabe
    // („Profil 2, source.abap:1"); 18 gelten wirklich für die gesamte Scheibe.
    // Die werden gegen **jeden** erzeugten Satz des Falls gemessen — sonst
    // wäre ein Fünftel des Sollwerts still abgewertet.
    const wholeSlice = FLAT.filter(
      (entry) => entry.conclusion.anchors.length === 0 && entry.conclusion.cores.length > 0,
    );
    expect(wholeSlice.length, 'kein einziger Satz gilt für die ganze Scheibe — dann misst diese Probe nichts').toBeGreaterThan(5);

    const sample = wholeSlice[0];
    const korpusCase = readCases().find((entry) => entry.id === sample.case)!;
    const file = korpusCase.sources[0].name;
    const said = {
      name: 'probe:ganze-scheibe',
      note: 'Sagt eine verbotene Aussage ohne Ankerpräfix an einer beliebigen Zeile des Falls.',
      produce: () => [{ id: 'V-1', text: sample.conclusion.cores[0], anchors: [{ file, line: 1 }] }],
    };
    const result = compareCase(korpusCase, readWithEngine(korpusCase, undefined, said)).find(
      (entry) => entry.class === 'fachsaetze',
    );
    const aspect = result?.aspects.find((entry) => entry.name === 'verbotene-aussagen');
    expect(
      aspect?.compared,
      `${sample.case}: der Satz «${sample.conclusion.cores[0]}» gilt für die gesamte Scheibe und wurde an ` +
        'Zeile 1 wörtlich gesagt — die Teilprüfung hat ihn trotzdem als eingehalten gezählt.',
    ).toBeLessThan(aspect?.total ?? 0);
  });

  test('ein Satz **mit** Anker gilt nur dort — sonst wäre der Anker keine Bedingung', () => {
    // Die Gegenprobe zur vorigen: derselbe Text an einer Anweisung, die der
    // verbotene Satz nicht nennt, ist keine Verletzung. Ohne diese Hälfte
    // wäre die Messung eine Wortsuche über den ganzen Fall.
    const anchored = FLAT.find(
      (entry) => entry.conclusion.anchors.length > 0 && entry.conclusion.cores.length > 0,
    )!;
    const korpusCase = readCases().find((entry) => entry.id === anchored.case)!;
    const taken = new Set(anchored.conclusion.anchors.map((anchor) => anchor.line));
    const free = Array.from({ length: korpusCase.sources[0].lineCount }, (_, index) => index + 1).find(
      (line) => !taken.has(line),
    )!;
    const elsewhere = {
      name: 'probe:falscher-anker',
      note: 'Sagt eine verankerte verbotene Aussage an einer anderen Anweisung.',
      produce: () => [
        { id: 'V-1', text: anchored.conclusion.cores[0], anchors: [{ file: korpusCase.sources[0].name, line: free }] },
      ],
    };
    const result = compareCase(korpusCase, readWithEngine(korpusCase, undefined, elsewhere)).find(
      (entry) => entry.class === 'fachsaetze',
    );
    const aspect = result?.aspects.find((entry) => entry.name === 'verbotene-aussagen');
    expect(
      aspect?.compared,
      `${anchored.case}: derselbe Text an Zeile ${free} statt an ${[...taken].join('/')} wurde als Verletzung ` +
        'gezählt — dann ist der Anker keine Bedingung mehr.',
    ).toBe(aspect?.total);
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

// ---------------------------------------------------------------------------
// Das Textmaß der Fachsätze (Roadmap 17.5)
// ---------------------------------------------------------------------------

test.describe('das Fachsatzmaß ist offengelegt und begründet', () => {
  const STATEMENTS = readCases().flatMap((korpusCase) =>
    korpusCase.expected.businessStatements.map((statement) => ({
      case: korpusCase.id,
      id: statement.id,
      text: statement.text ?? '',
      lines: new Set(statement.anchors.map((anchor) => `${anchor.file}:${anchor.line}`)),
    })),
  );

  test('der Korpus trägt die 173 Sollsätze, an denen gemessen wird', () => {
    expect(STATEMENTS.length, 'ohne Sollsätze misst diese Facette nichts').toBeGreaterThan(150);
    expect(STATEMENTS.every((statement) => statement.text.length > 10)).toBe(true);
  });

  test('die Schwelle liegt in der gemessenen Lücke', () => {
    // Die Begründung der Schwelle, bei jedem Lauf neu gerechnet statt als Prosa
    // im Kommentar. Fällt dieser Test, weil das Fallbuch gewachsen ist, dann
    // wird die Schwelle **neu begründet** — nicht nachgezogen.
    let worstUnrelated = 0;
    let worstUnrelatedPair = '';
    for (let i = 0; i < STATEMENTS.length; i += 1) {
      for (let j = i + 1; j < STATEMENTS.length; j += 1) {
        const a = STATEMENTS[i];
        const b = STATEMENTS[j];
        if (a.case !== b.case) continue;
        // Nur Paare, die über **verschiedene** Stellen sprechen: die sollen
        // niemals als „dasselbe gesagt" durchgehen.
        if ([...a.lines].some((line) => b.lines.has(line))) continue;
        const score = statementSimilarity(a.text, b.text);
        if (score > worstUnrelated) {
          worstUnrelated = score;
          worstUnrelatedPair = `${a.id}/${b.id}`;
        }
      }
    }
    // Die mildeste Umformulierung, die noch dasselbe meint: derselbe Satz ohne
    // seine letzten zwei Wörter. Sie muss über der Schwelle bleiben.
    let mildestParaphrase = 1;
    let mildestParaphraseId = '';
    for (const statement of STATEMENTS) {
      const score = statementSimilarity(statement.text, statement.text.split(' ').slice(0, -2).join(' '));
      if (score < mildestParaphrase) {
        mildestParaphrase = score;
        mildestParaphraseId = statement.id;
      }
    }
    expect(
      worstUnrelated,
      `Zwei Sollsätze über verschiedene Stellen (${worstUnrelatedPair}) erreichen ${worstUnrelated.toFixed(3)} — ` +
        `über der Schwelle ${STATEMENT_MATCH_THRESHOLD}. Dann zählt das Maß Verschiedenes als dasselbe.`,
    ).toBeLessThan(STATEMENT_MATCH_THRESHOLD);
    expect(
      mildestParaphrase,
      `Die mildeste Umformulierung (${mildestParaphraseId}) fällt auf ${mildestParaphrase.toFixed(3)} — ` +
        `unter der Schwelle ${STATEMENT_MATCH_THRESHOLD}. Dann ist das Maß spröde und bestraft die Wortwahl.`,
    ).toBeGreaterThan(STATEMENT_MATCH_THRESHOLD);
  });

  test('das Maß ist nachrechenbar und hat keine versteckte Klugheit', () => {
    expect(statementSimilarity('Der Kunde wird gelesen.', 'Der Kunde wird gelesen.')).toBe(1);
    expect(statementSimilarity('Der Kunde wird gelesen.', '')).toBe(0);
    expect(statementSimilarity('', '')).toBe(0);
    // Funktionswörter allein sind kein Inhalt.
    expect(statementSimilarity('Der die das und oder', 'Der die das und oder')).toBe(0);
    // Dice von Hand: {kunde, gelesen} gegen {kunde, geschrieben} = 2·1/4 = 0,5.
    expect(statementSimilarity('Der Kunde wird gelesen.', 'Der Kunde wird geschrieben.')).toBeCloseTo(0.5, 6);
    // Der ABAP-Bezeichner unterscheidet, der Unterstrich bleibt deshalb stehen.
    expect(statementTokens('lv_count wird überschrieben').has('lv_count')).toBe(true);
  });

  test('der Vergleich fragt wirklich einen Erzeuger — und heute gibt es keinen', () => {
    // Die Naht für 17.6. Ein Vergleicher, der den Erzeuger nie aufruft, kann
    // dessen Änderung nicht fangen; das ist derselbe Befund, der 1.9 an der
    // Facette `skelett` ausgelöst hat.
    let asked = 0;
    const spy = {
      name: 'probe:zaehler',
      note: 'Zählt nur, ob überhaupt gefragt wird.',
      produce: () => {
        asked += 1;
        return [];
      },
    };
    const korpusCase = readCases()[0];
    compareCase(korpusCase, readWithEngine(korpusCase, undefined, spy));
    expect(asked, 'der Lauf hat den Erzeuger nie gefragt').toBe(1);

    // Und was er liefert, muss in der Facette **ankommen**. Vor 17.5 war
    // `compareBusinessStatements` hart auf `disagree` verdrahtet und nahm die
    // Engine-Lesung gar nicht entgegen; ein Erzeuger hätte dort nichts bewegt.
    const first = korpusCase.expected.businessStatements[0];
    expect(first, 'der erste Fall trägt keinen Sollsatz — die Probe misst sonst nichts').toBeTruthy();
    const oneHit = {
      name: 'probe:ein-treffer',
      note: 'Legt genau einen Sollsatz wortgleich an seinen eigenen Anker.',
      produce: () => [{ id: 'G-1', text: first.text ?? '', anchors: first.anchors }],
    };
    const withOne = compareCase(korpusCase, readWithEngine(korpusCase, undefined, oneHit)).find(
      (result) => result.class === 'fachsaetze',
    );
    expect(withOne?.scope.compared, 'der erzeugte Satz kommt in der Facette nicht an').toBe(1);
    expect(
      withOne?.aspects.find((aspect) => aspect.name === 'fachsatzinhalt')?.compared,
      'der Inhalt wurde nicht gemessen',
    ).toBe(1);

    // Und jeder Beleg nennt den Erzeuger beim Namen — vor 17.7 war das
    // `kein-erzeuger`, seitdem die Engine. Ein Beleg ohne Namen sagt nicht,
    // **was** gemessen wurde, und genau das war der Befund CR-05.
    expect(NO_PRODUCER.produce(korpusCase, readWithEngine(korpusCase))).toEqual([]);
    const live = LIVE.filter((result) => result.class === 'fachsaetze');
    for (const result of live) {
      expect(result.evidence, `${result.case}: der Beleg nennt den Erzeuger nicht`).toContain(
        ENGINE_PRODUCER.name,
      );
    }
    const total = live.reduce((sum, result) => sum + result.scope.total, 0);
    expect(total, 'der Korpus führt keine Sollfachsätze mehr').toBeGreaterThan(150);
  });
});
