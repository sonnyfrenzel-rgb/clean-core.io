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

/**
 * Ein UPDATE mit Schlüssel sagt „des angegebenen …", eines ohne nicht.
 *
 * Die Unterscheidung existierte bis zum 23.09.2026 nicht, ohne dass etwas rot
 * wurde: in der Erkennung stand ein echtes Backspace-Zeichen (0x08) an der
 * Stelle der Wortgrenze — `/<BS>WHERE…/` statt `/\bWHERE…/`. ABAP-Quelltext
 * enthält keine Steuerzeichen, also traf die Regel nie und `keyed` war immer
 * falsch. Gefunden hat es die QA-Delta-Prüfung von e24d1fb; kein Test des
 * Erzeugers hatte den Zweig je betreten.
 *
 * Der Test prüft beide Seiten. Eine Prüfung nur auf den Schlüsselfall wäre
 * wieder grün, wenn jemand `keyed` fest auf `true` setzt.
 *
 * Die Tabelle ist `KNA1`, weil der Unterschied nur bei einer Tabelle sichtbar
 * wird, die das Wörterbuch kennt — bei einer unbekannten fällt der Satz auf den
 * wörtlichen Namen zurück und spricht gar nicht von „angegeben".
 */
test('ein UPDATE mit Schlüssel wird als solches beschrieben, eines ohne nicht', () => {
  const zeilen = (...z: string[]) => z.join('\n') + '\n';

  const updateSatz = (quelle: string): BusinessStatement => {
    const treffer = buildBusinessStatements(quelle).filter((s) => /wird geändert\./.test(s.core));
    expect(treffer, `kein UPDATE-Satz für:\n${quelle}`).toHaveLength(1);
    return treffer[0];
  };

  const mitSchluessel = updateSatz(
    zeilen('REPORT z_t.', 'PARAMETERS p_kunnr TYPE kunnr.', 'UPDATE kna1 SET land1 = @lv_neu WHERE kunnr = p_kunnr.'),
  );
  const ohneSchluessel = updateSatz(zeilen('REPORT z_t.', 'UPDATE kna1 SET land1 = @lv_neu.'));

  expect(
    mitSchluessel.core,
    'ein UPDATE mit WHERE auf einen Eingabeparameter trifft eine bestimmte Zeile — der Satz muss das sagen',
  ).toContain('angegebenen');

  expect(
    ohneSchluessel.core,
    'ein UPDATE ohne WHERE trifft alles; „des angegebenen" wäre hier eine Erfindung',
  ).not.toContain('angegebenen');

  // Der Vorbehalt bleibt in beiden Fällen: ein Schlüssel im WHERE sagt nicht,
  // dass es die Zeile gibt.
  for (const satz of [mitSchluessel, ohneSchluessel]) {
    expect(satz.text).toContain('Ob eine Zeile getroffen wird');
  }
});

// ---------------------------------------------------------------------------
// Die Fehlmuster aus dem Prozess-Benchmark (F1–F12)
//
// Jeder Test unten benennt ein Muster, das fünf unabhängige Richter an den
// Sätzen dieses Erzeugers gefunden haben, und hält die Korrektur mit einem
// eigens geschriebenen Minimal-ABAP fest — kein Fall aus dem Benchmark.
// ---------------------------------------------------------------------------

const quelle = (...z: string[]) => z.join('\n') + '\n';
const saetze = (code: string) => buildBusinessStatements(code).map((s) => s.text);
const satzAn = (code: string, zeile: number) =>
  buildBusinessStatements(code)
    .filter((s) => s.anchors.some((a) => a.lineStart <= zeile && zeile <= a.lineEnd))
    .map((s) => s.text);

test('F1 — CHECK sagt die Folge seines Orts und die Bedingung, wie sie ist', () => {
  // In einer FORM ohne Schleife: die Routine wird verlassen, nichts läuft „weiter".
  const imUnterprogramm = satzAn(
    quelle('FORM freigabe USING iv_art TYPE c.', "  CHECK iv_art = 'A'.", '  WRITE / iv_art.', 'ENDFORM.'),
    2,
  ).join(' ');
  expect(imUnterprogramm).toContain('Unterprogramm freigabe');
  expect(imUnterprogramm).toContain('gleich A');
  expect(imUnterprogramm).not.toMatch(/Schleife|kleinere/);

  // In einem Ereignisblock: der Block wird verlassen.
  const imEreignis = satzAn(
    quelle('REPORT z_f1.', 'PARAMETERS p_echt AS CHECKBOX.', 'START-OF-SELECTION.', '  CHECK p_echt IS NOT INITIAL.', "  WRITE / 'X'."),
    4,
  ).join(' ');
  expect(imEreignis).toContain('Ereignisblock START-OF-SELECTION');
  expect(imEreignis).toContain('nicht leer');
  expect(imEreignis).not.toMatch(/Schleife|kleinere/);

  // In einer Schleife mit Gleichheit: der Durchlauf wird übersprungen, aber
  // „kleinere" gibt es bei einer Gleichheitsprüfung nicht.
  const inSchleife = satzAn(
    quelle('FORM zeilen TABLES it_pos.', '  LOOP AT it_pos INTO DATA(ls_pos).', "    CHECK ls_pos-kz = 'L'.", '  ENDLOOP.', 'ENDFORM.'),
    3,
  ).join(' ');
  expect(inSchleife).toContain('Schleifendurchlauf');
  expect(inSchleife).not.toContain('kleinere');

  // Ein SELECT in eine Tabelle öffnet keine Schleife — auch nicht mit
  // CORRESPONDING FIELDS OF TABLE. Der CHECK dahinter steht in der Routine.
  const nachSelect = satzAn(
    quelle(
      'FORM lesen.',
      '  SELECT * FROM zstamm INTO CORRESPONDING FIELDS OF TABLE gt_stamm.',
      '  CHECK gt_stamm IS NOT INITIAL.',
      'ENDFORM.',
    ),
    3,
  ).join(' ');
  expect(nachSelect).toContain('Unterprogramm lesen');
  expect(nachSelect).not.toContain('Schleife');

  // Wo „kleinere" wahr ist, bleibt es: ein Größenvergleich über ein bekanntes
  // Fachwort in einer Schleife.
  const groesse = satzAn(
    quelle('LOOP AT gt_pos INTO gs_pos.', '  CHECK gs_pos-betrag >= 100.', 'ENDLOOP.'),
    2,
  ).join(' ');
  expect(groesse).toContain('kleinere werden übersprungen, die Schleife läuft weiter');
});

test('F2 — die Wortwahl nach sy-subrc folgt der Anweisung, die es gesetzt hat', () => {
  const nach = (...setter: string[]) =>
    satzAn(quelle('FORM probe.', ...setter, '  IF sy-subrc <> 0.', "    WRITE / 'FEHLER'.", '    RETURN.', '  ENDIF.', 'ENDFORM.'), setter.length + 2).join(' ');

  // Ein Lesen: „Treffer" ist hier das richtige Wort und bleibt.
  expect(nach('  SELECT SINGLE name1 FROM zkunde INTO @DATA(lv_name) WHERE id = @gv_id.')).toContain('Ohne Treffer');

  const berechtigung = nach("  AUTHORITY-CHECK OBJECT 'Z_BELEG' ID 'ACTVT' FIELD '02'.");
  expect(berechtigung).toContain('Ohne Berechtigung auf Z_BELEG');
  expect(berechtigung).not.toContain('Treffer');

  const sperre = nach("  CALL FUNCTION 'ENQUEUE_EZBELEG' EXPORTING id = gv_id EXCEPTIONS foreign_lock = 1 OTHERS = 2.");
  expect(sperre).toContain('Sperre');
  expect(sperre).not.toContain('Treffer');

  const aufruf = nach("  CALL FUNCTION 'Z_BELEG_SENDEN' EXPORTING id = gv_id EXCEPTIONS failed = 1.");
  expect(aufruf).toContain('Scheitert der Aufruf von Z_BELEG_SENDEN');

  expect(nach('  OPEN DATASET gv_datei FOR INPUT IN TEXT MODE ENCODING DEFAULT.')).toContain('Datei nicht öffnen');
  expect(nach('  INSERT zbeleg FROM gs_beleg.')).toContain('Datenbankänderung');

  // Wo die setzende Anweisung nicht eindeutig ist — hier liegt ein Zweig
  // dazwischen —, bleibt der Satz neutral statt geraten.
  const offen = nach("  IF gv_modus = 'A'.", "    SELECT SINGLE name1 FROM zkunde INTO @DATA(lv_x) WHERE id = @gv_id.", '  ENDIF.');
  expect(offen).toContain('Rückgabewert ungleich 0');
  expect(offen).not.toContain('Treffer');
});

test('F3 — nur GET <knoten> ist eine logische Datenbank; GET PARAMETER, TIME, REFERENCE nicht', () => {
  const code = quelle(
    'REPORT z_f3.',
    'INITIALIZATION.',
    "  GET PARAMETER ID 'BUK' FIELD p_bukrs.",
    '  GET TIME STAMP FIELD gv_stempel.',
    '  GET REFERENCE OF gs_kopf INTO gr_kopf.',
    'GET pernr.',
    "  WRITE / 'X'.",
  );
  for (const zeile of [3, 4, 5]) {
    const text = satzAn(code, zeile).join(' ');
    expect(text, `Zeile ${zeile}`).not.toContain('logischen Datenbank');
    expect(text.length, `Zeile ${zeile} hat keinen Satz`).toBeGreaterThan(0);
  }
  expect(satzAn(code, 3).join(' ')).toContain('Benutzerparameter BUK');
  expect(satzAn(code, 6).join(' ')).toContain('logischen Datenbank');
});

test('F4 — CALL TRANSACTION sagt den Aufruf, nicht einen aus dem Namen gelesenen Zweck', () => {
  const code = quelle(
    'REPORT z_f4.',
    'START-OF-SELECTION.',
    "  SET PARAMETER ID 'AUN' FIELD gv_beleg.",
    "  CALL TRANSACTION 'ZANZ' AND SKIP FIRST SCREEN.",
    "  CALL TRANSACTION 'ZAEND' USING gt_bdc MODE 'N' UPDATE 'S' MESSAGES INTO gt_msg.",
  );
  const anzeige = satzAn(code, 4).join(' ');
  expect(anzeige).toContain('Die Transaktion ZANZ wird');
  expect(anzeige).toContain('Einstiegsbild wird übersprungen');
  expect(anzeige).not.toMatch(/Anlage|angestoßen/);

  const mappe = satzAn(code, 5).join(' ');
  expect(mappe).toContain('Batch-Input');
  expect(mappe).toContain('Modus N');
  expect(mappe).toContain('synchron');
  expect(mappe).not.toContain('Anlage');
});

test('F5 — MESSAGE … INTO und WRITE … TO geben nichts aus', () => {
  const code = quelle(
    'FORM pruefen CHANGING cv_text TYPE string.',
    "  MESSAGE e010(zbel) WITH gv_beleg INTO cv_text.",
    "  MESSAGE e011(zbel) RAISING nicht_gefunden.",
    '  WRITE gv_betrag TO gv_anzeige CURRENCY gv_waehrung.',
    "  MESSAGE s012(zbel) DISPLAY LIKE 'E'.",
    "  WRITE / gv_betrag CURRENCY gv_waehrung.",
    'ENDFORM.',
  );
  const into = satzAn(code, 2).join(' ');
  expect(into).toContain('in cv_text übernommen');
  expect(into).toContain('angezeigt wird dabei nichts');
  expect(into).not.toMatch(/Meldung wird ausgegeben/);

  const raising = satzAn(code, 3).join(' ');
  expect(raising).toContain('Ausnahme nicht_gefunden wird ausgelöst');
  expect(raising).not.toMatch(/wird ausgegeben/);

  const formatiert = satzAn(code, 4).join(' ');
  expect(formatiert).toContain('in gv_anzeige übernommen');
  expect(formatiert).not.toMatch(/wird ausgegeben/);

  // Eine echte Meldung sagt ihren Typ; eine echte Ausgabe bleibt eine Ausgabe,
  // ohne die Formatierungszusätze als Inhalt zu lesen.
  expect(satzAn(code, 5).join(' ')).toContain('Statusmeldung 012(ZBEL) wird ausgegeben, angezeigt wie eine Fehlermeldung');
  const ausgabe = satzAn(code, 6).join(' ');
  expect(ausgabe).toContain('ausgegeben');
  expect(ausgabe).not.toContain('CURRENCY');
});

test('F6 — „es wird nichts geschrieben" und „kein COMMIT WORK" nur, wenn der Weg es trägt', () => {
  const waechter = (...danach: string[]) =>
    quelle(
      'REPORT z_f6.',
      'PARAMETERS p_id TYPE c LENGTH 10.',
      'START-OF-SELECTION.',
      '  IF p_id IS INITIAL.',
      "    WRITE / 'KEIN_SCHLUESSEL'.",
      '    RETURN.',
      '  ENDIF.',
      "  UPDATE zbeleg SET status = 'X' WHERE id = p_id.",
      ...danach,
    );
  // Der einfache Fall trägt die Aussage: nichts anderes läuft danach.
  expect(satzAn(waechter(), 4).join(' ')).toContain('es wird nichts geschrieben');

  // Ein späteres Ereignis, das etwas aufruft, macht sie unbelegt.
  const mitEnde = satzAn(waechter('END-OF-SELECTION.', '  PERFORM protokoll_sichern.'), 4).join(' ');
  expect(mitEnde).toContain('vor der Datenbankoperation zurückgekehrt');
  expect(mitEnde).not.toContain('nichts geschrieben');

  // Ein Wächter, der selbst sichert, schreibt.
  const sichernd = satzAn(
    quelle(
      'REPORT z_f6b.',
      'START-OF-SELECTION.',
      '  IF gt_daten IS INITIAL.',
      '    PERFORM protokoll_sichern.',
      '    RETURN.',
      '  ENDIF.',
      '  MODIFY zbeleg FROM TABLE gt_daten.',
    ),
    3,
  ).join(' ');
  expect(sichernd).not.toContain('nichts geschrieben');

  // Ein EXIT in einer Schleife verlässt nur die Schleife.
  const schleife = satzAn(
    quelle('REPORT z_f6c.', 'LOOP AT gt_pos INTO gs_pos.', "  IF gs_pos-kz = 'E'.", '    EXIT.', '  ENDIF.', 'ENDLOOP.', 'DELETE FROM zbeleg WHERE id = gv_id.'),
    3,
  ).join(' ');
  expect(schleife).toContain('Schleife verlassen');
  expect(schleife).not.toContain('Datenbankoperation');

  // „kein COMMIT WORK" nicht neben einem BAPI_TRANSACTION_COMMIT …
  const bapi = satzAn(
    quelle('REPORT z_f6d.', "UPDATE zbeleg SET status = 'X' WHERE id = gv_id.", "CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'."),
    2,
  ).join(' ');
  expect(bapi).not.toMatch(/kein COMMIT|nicht persistiert/);
  // … und nicht in einer Routine ohne Programm: dort schreibt der Aufrufer fest.
  const routine = satzAn(quelle('FORM speichern.', "  UPDATE zbeleg SET status = 'X' WHERE id = gv_id.", 'ENDFORM.'), 2).join(' ');
  expect(routine).not.toMatch(/kein COMMIT|nicht persistiert/);
  // Wo es wahr ist, bleibt es stehen.
  expect(satzAn(quelle('REPORT z_f6e.', "UPDATE zbeleg SET status = 'X' WHERE id = gv_id."), 2).join(' ')).toContain(
    'kein COMMIT WORK',
  );

  // Ein MODIFY auf eine interne Tabelle oder das Bild schreibt nicht in die Datenbank.
  const intern = satzAn(quelle('REPORT z_f6f.', 'MODIFY gt_pos FROM gs_pos INDEX 1.'), 2).join(' ');
  expect(intern).toContain('internen Tabelle gt_pos');
  expect(intern).not.toMatch(/kein COMMIT|eingefügt oder überschrieben/);
});

test('F7 — „nicht belegt" nur, wenn das Aufrufziel wirklich fehlt', () => {
  const code = quelle(
    'REPORT z_f7.',
    'CLASS lcl_protokoll DEFINITION.',
    '  PUBLIC SECTION.',
    '    METHODS sichern.',
    'ENDCLASS.',
    'CLASS lcl_protokoll IMPLEMENTATION.',
    '  METHOD sichern.',
    "    CALL FUNCTION 'Z_PROTOKOLL_SICHERN'.",
    '    COMMIT WORK.',
    '  ENDMETHOD.',
    'ENDCLASS.',
    'START-OF-SELECTION.',
    '  DATA(go_log) = NEW lcl_protokoll( ).',
    '  PERFORM abschluss.',
    '  go_log->sichern( ).',
    '  PERFORM fremd IN PROGRAM zanderes.',
    "  cl_fremd=>sichern( ).",
    'FORM abschluss.',
    "  UPDATE zlauf SET status = 'E' WHERE id = gv_id.",
    'ENDFORM.',
  );
  const form = satzAn(code, 14).join(' ');
  expect(form).toContain('Unterprogramm abschluss');
  expect(form).toContain('ändert ZLAUF');
  expect(form).not.toContain('nicht belegt');

  const methode = satzAn(code, 15).join(' ');
  expect(methode).toContain('ruft Z_PROTOKOLL_SICHERN auf');
  expect(methode).toContain('COMMIT WORK');
  expect(methode).not.toContain('nicht belegt');

  // Was nicht im Ausschnitt steht, bleibt „nicht belegt" — auch eine globale
  // Klasse, deren Methode zufällig so heißt wie eine lokale.
  expect(satzAn(code, 16).join(' ')).toContain('nicht belegt');
  expect(satzAn(code, 17).join(' ')).toContain('nicht belegt');
});

test('F8 — der Rückgabewert landet beim Empfänger links vom =, nicht bei der Klasse vor =>', () => {
  const code = quelle(
    'REPORT z_f8.',
    'START-OF-SELECTION.',
    '  cl_fremd_liste=>erzeugen( IMPORTING eo_liste = go_liste CHANGING ct_daten = gt_daten ).',
    '  zcl_fremd_lader=>neu_aufbauen( ).',
    '  gv_anzahl = zcl_fremd_lader=>zaehlen( ).',
  );
  const importing = satzAn(code, 3).join(' ');
  expect(importing).not.toContain('nach cl_fremd_liste');
  expect(importing).toContain('in go_liste übernommen');

  const ohne = satzAn(code, 4).join(' ');
  expect(ohne).not.toMatch(/Rückgabewert|übernommen/);
  expect(ohne).toContain('Die Methode neu_aufbauen von zcl_fremd_lader wird aufgerufen');

  expect(satzAn(code, 5).join(' ')).toContain('nach gv_anzahl übernommen');
});

test('F9 — LEAVE sagt, wohin es geht: Folgebild, Listenende, Programmende', () => {
  const code = quelle(
    'MODULE user_command_0100 INPUT.',
    '  CASE ok_code.',
    "    WHEN 'WEITER'.",
    '      LEAVE TO SCREEN 200.',
    "    WHEN 'ZURUECK'.",
    '      LEAVE TO SCREEN 0.',
    "    WHEN 'ENDE'.",
    '      LEAVE PROGRAM.',
    "    WHEN 'LISTE'.",
    '      LEAVE LIST-PROCESSING.',
    '  ENDCASE.',
    'ENDMODULE.',
  );
  const weiter = satzAn(code, 4).join(' ');
  expect(weiter).toContain('Bild 200');
  expect(weiter).not.toContain('Screenfolge wird beendet');
  expect(satzAn(code, 6).join(' ')).toContain('Screenfolge wird beendet');
  expect(satzAn(code, 8).join(' ')).toContain('Programm wird beendet');
  const liste = satzAn(code, 10).join(' ');
  expect(liste).toContain('Listenverarbeitung wird verlassen');
  expect(liste).not.toContain('Screenfolge');
});

test('F10 — keine Übergaben und Wirkungen, die der Code nicht trägt', () => {
  const code = quelle(
    'REPORT z_f10.',
    'PARAMETERS p_ziel TYPE rfcdest.',
    'START-OF-SELECTION.',
    '  GET BADI go_badi.',
    '  CALL BADI go_badi->pruefen EXPORTING is_kopf = gs_kopf it_pos = gt_pos CHANGING cv_ok = gv_ok.',
    "  CALL FUNCTION 'Z_ZAEHLER_LESEN' EXPORTING iv_id = gv_id IMPORTING ev_stand = gv_stand.",
    "  CALL FUNCTION 'Z_ABGLEICH' DESTINATION p_ziel EXPORTING iv_id = gv_id.",
  );
  const badi = satzAn(code, 5).join(' ');
  expect(badi).toContain('gs_kopf');
  expect(badi).toContain('gt_pos');
  expect(badi).toContain('pruefen');
  expect(badi).not.toMatch(/Betrag|Routentext|Freigabeprozess/);

  const baustein = satzAn(code, 6).join(' ');
  expect(baustein).toContain('Z_ZAEHLER_LESEN');
  expect(baustein).toContain('gv_stand');
  expect(baustein).not.toContain('konvertiert');

  const rfc = satzAn(code, 7).join(' ');
  expect(rfc).toContain('Z_ABGLEICH wird in einem entfernten System über die eingegebene Destination aufgerufen');
  expect(rfc).not.toContain('benachrichtigt');
});

test('F11 — ein Satz je Aussage: keine Wiederholung derselben Sache an derselben Stelle', () => {
  const code = quelle(
    'REPORT z_f11.',
    'START-OF-SELECTION.',
    '  SELECT kunnr, name1 FROM kna1 INTO TABLE @DATA(lt_kunden).',
    '  IF lt_kunden IS INITIAL.',
    "    WRITE / 'KEINE'.",
    '    RETURN.',
    '  ENDIF.',
    '  LOOP AT lt_kunden INTO DATA(ls_kunde).',
    '    WRITE: / ls_kunde-kunnr, ls_kunde-name1.',
    '  ENDLOOP.',
    "  IF gv_modus = 'A'.",
    "    WRITE / 'ANLEGEN'.",
    '  ELSE.',
    "    WRITE / 'AENDERN'.",
    '  ENDIF.',
    "  CALL FUNCTION 'Z_UMRECHNEN' EXPORTING iv_wert = gv_wert IMPORTING ev_wert = gv_neu.",
  );
  const alle = buildBusinessStatements(code);
  const an = (zeile: number) => alle.filter((s) => s.anchors.some((a) => a.lineStart === zeile));

  // Die Ausgabeliste ist ein Satz; die Spalten bekommen keinen eigenen daneben.
  expect(an(9).map((s) => s.text)).toEqual(['Bei Treffern werden Kundennummer und Name als Liste ausgegeben.']);

  // Wächter und Zweig über dasselbe IF sind ein Satz, nicht zwei oder drei.
  expect(an(4).length).toBe(1);
  expect(an(4)[0].text).toContain('Ohne Treffer wird KEINE ausgegeben');

  // Ein IF … ELSE ist eine Entscheidung mit zwei Ausgängen: ein Satz.
  const entscheidung = an(12);
  expect(entscheidung.filter((s) => s.grain === 'group').length).toBe(1);
  expect(entscheidung.find((s) => s.grain === 'group')!.text).toContain('sonst AENDERN ausgegeben');

  // „übergibt … und übernimmt dessen Ausgabe nach …" nennt das Ergebnis schon.
  expect(an(16).filter((s) => /übernommen|übernimmt/.test(s.text)).length).toBe(1);
});

test('F12 — kein erratenes Geschlecht vor Bezeichnern, Verb passt zum Subjekt', () => {
  const code = quelle(
    'REPORT z_f12.',
    'START-OF-SELECTION.',
    '  return_code = 1.',
    '  IF lv_msgno IS INITIAL.',
    "    gv_stufe = 'E'.",
    '  ENDIF.',
    '  IF gs_pos-betrag < 0.',
    "    gv_route = 'NEGATIV'.",
    '  ENDIF.',
    '  SELECT SINGLE matnr FROM zmatzuo INTO gv_matnr WHERE kdmat = gv_kdmat.',
    '  SELECT SINGLE @abap_true FROM zsperre INTO @DATA(lv_da) WHERE id = @gv_id.',
  );
  const alle = saetze(code).join(' ');
  expect(alle).not.toMatch(/\bdie return_code\b|\bDie return_code\b/);
  expect(alle).toContain('Das Feld return_code wird auf 1 gesetzt');

  const zweig = satzAn(code, 5).join(' ');
  expect(zweig).not.toMatch(/Eine leere lv_msgno|setzen die/);
  expect(zweig).toContain('Wenn das Feld lv_msgno leer ist, wird das Feld gv_stufe auf E gesetzt');

  // Mit einem bekannten Fachwort bleibt das Mehrzahl-Subjekt, und das Verb passt.
  expect(satzAn(code, 8).join(' ')).toContain('Negative Beträge setzen die Route auf NEGATIV');

  expect(satzAn(code, 10).join(' ')).toContain('Die Materialnummer aus zmatzuo wird gelesen');
  expect(satzAn(quelle('REPORT z.', 'SELECT SINGLE zfeld FROM zmatzuo INTO gv_x.'), 2).join(' ')).toContain('Das Feld zfeld aus zmatzuo wird gelesen');
  const existenz = satzAn(code, 11).join(' ');
  expect(existenz).toContain('geprüft, ob es einen passenden Satz in zsperre');
  expect(existenz).not.toContain('abap_true');
});

test('17.9 — die Sätze sagen nicht, was der Code an ihrem Anker nicht trägt', () => {
  const code = quelle(
    'REPORT z_verboten.',
    'CLASS lcl_zaehler DEFINITION.',
    '  PUBLIC SECTION.',
    '    CLASS-METHODS naechster RETURNING VALUE(rv_nummer) TYPE i.',
    'ENDCLASS.',
    'CLASS lcl_zaehler IMPLEMENTATION.',
    '  METHOD naechster.',
    '    rv_nummer = 7.',
    '  ENDMETHOD.',
    'ENDCLASS.',
    'START-OF-SELECTION.',
    '  PERFORM: lesen, rechnen, ausgeben.',
    "  AUTHORITY-CHECK OBJECT 'Z_LISTE' ID 'ACTVT' FIELD '03'.",
    '  SELECT kunnr FROM kna1 FOR ALL ENTRIES IN @gt_schluessel WHERE kunnr = @gt_schluessel-kunnr INTO TABLE @DATA(lt_da).',
  );
  // Drei Aufrufe nacheinander, nicht einer mit zwei Parametern.
  expect(satzAn(code, 12).join(' ')).toContain('Die Unterprogramme lesen, rechnen und ausgeben werden nacheinander aufgerufen, jedes ohne Parameter');
  // Eine Berechtigungsprüfung, deren Ergebnis niemand liest, schützt nichts.
  expect(satzAn(code, 13).join(' ')).toContain('Das Ergebnis der Prüfung wird nicht ausgewertet');
  // Ein RETURNING-Parameter ist das Ergebnis der Methode, kein Feld mit eigenem Namen.
  expect(satzAn(code, 8).join(' ')).toContain('Die Methode naechster gibt den Wert 7 zurück');
  // FOR ALL ENTRIES liest zu den Einträgen einer Tabelle, nicht „die Kunden".
  expect(satzAn(code, 14).join(' ')).toContain('zu den Einträgen aus gt_schluessel');
});

test('weitere Aussagen, die der Code nicht trägt: Auflösung, LOOP … WHERE, ASSIGN, TRANSLATE, SUBMIT VIA JOB', () => {
  const code = quelle(
    'REPORT z_weitere.',
    'START-OF-SELECTION.',
    "  SELECT SINGLE low FROM tvarvc INTO gv_tab WHERE name = 'Z_QUELLE'.",
    '  IF sy-subrc <> 0.',
    "    gv_tab = 'ZVORSCHLAG'.",
    '  ENDIF.',
    '  SELECT SINGLE wert FROM (gv_tab) INTO gv_wert.',
    "  LOOP AT gt_pos INTO gs_pos WHERE kz = 'L'.",
    '  ENDLOOP.',
    '  ASSIGN gs_pos TO <ls_pos>.',
    '  TRANSLATE gv_name TO UPPER CASE.',
    "  SUBMIT zfolge VIA JOB gv_job NUMBER gv_nummer AND RETURN.",
  );
  // Ein Literal neben einem gelesenen Wert ist ein Vorschlag, keine Festlegung.
  const dynamisch = satzAn(code, 7).join(' ');
  expect(dynamisch).not.toContain('festgelegt');
  expect(dynamisch).not.toContain('entscheidet die Eingabe');
  expect(dynamisch).toContain('steht erst zur Laufzeit in gv_tab fest');

  const schleife = satzAn(code, 8).join(' ');
  expect(schleife).not.toContain('Jede Zeile');
  expect(schleife).toContain('bei denen das Feld kz gleich L ist');

  expect(satzAn(code, 10).join(' ')).not.toContain('anderen Programms');
  expect(satzAn(code, 11).join(' ')).not.toMatch(/Eingabe/);
  expect(satzAn(code, 12).join(' ')).toContain('Hintergrundjobs');
});

test('Wortwahl — SAP-Standardtabellen und -felder heißen fachlich, mit dem richtigen Artikel', () => {
  const code = quelle(
    'REPORT z_wort.',
    'PARAMETERS p_ebeln TYPE ebeln.',
    'START-OF-SELECTION.',
    '  SELECT matnr, werks FROM marc INTO TABLE @DATA(lt_marc).',
    "  UPDATE ekko SET loekz = 'L' WHERE ebeln = p_ebeln.",
    '  SELECT SINGLE lifnr FROM ekko INTO @DATA(lv_lifnr) WHERE ebeln = @p_ebeln.',
  );
  expect(satzAn(code, 4).join(' ')).toContain('Materialnummer und Werk');
  // Bestellung ist weiblich: „der angegebenen Bestellung", nicht „des …".
  expect(satzAn(code, 5).join(' ')).toContain('der angegebenen Bestellung');
  expect(satzAn(code, 6).join(' ')).toContain('Lieferantennummer der Bestellung');
});

test('F11/F4 — Kettenausgabe im Zweig ohne zweiten Satz; ein Dialogaufruf ist keine Datenbankoperation', () => {
  const code = quelle(
    'REPORT z_nachtrag.',
    'START-OF-SELECTION.',
    '  LOOP AT gt_pos INTO gs_pos.',
    "    IF p_test = 'X'.",
    "      WRITE: / gs_pos-matnr, gs_pos-werks, 'TEST'.",
    '      CONTINUE.',
    '    ENDIF.',
    '  ENDLOOP.',
    '  READ TABLE gt_pos INTO gs_pos INDEX 1.',
    '  IF sy-subrc <> 0.',
    "    MESSAGE s001(zz).",
    '    RETURN.',
    '  ENDIF.',
    "  CALL TRANSACTION 'ZANZEIGE' AND SKIP FIRST SCREEN.",
  );
  expect(satzAn(code, 5).filter((s) => /werden ausgegeben/.test(s))).toEqual([]);
  expect(satzAn(code, 10).join(' ')).not.toContain('Datenbankoperation');
});

test('QA d7a7d3a66683 — „es wird nichts geschrieben" nur, wo die Quellreihenfolge die Ausführung ist', () => {
  const waechter = (...z: string[]) => satzAn(quelle(...z), z.findIndex((zeile) => /IF p_stop/.test(zeile)) + 1).join(' ');
  const danach = ['  IF p_stop = abap_true.', '    RETURN.', '  ENDIF.'];

  // Getragen: ein Programm, ein einmal laufendes Ereignis, davor nichts. Auch
  // mit einem zweiten IF, das nur auf dem anderen Weg schreibt — wer p_stop
  // setzt, erreicht es nicht.
  const getragen = waechter(
    'REPORT z_d7a.',
    'PARAMETERS: p_stop AS CHECKBOX, p_gut AS CHECKBOX.',
    'START-OF-SELECTION.',
    ...danach,
    "  IF p_gut = 'X'.",
    "    UPDATE kna1 SET loevm = 'X' WHERE kunnr = '1'.",
    '  ENDIF.',
  );
  expect(getragen).toContain('vor der Datenbankoperation zurückgekehrt; es wird nichts geschrieben');

  const ohneAussage = (label: string, text: string) => {
    expect(text, label).toContain('vor der Datenbankoperation zurückgekehrt');
    expect(text, label).not.toContain('nichts geschrieben');
  };
  // In einer Schleife hat ein früherer Durchlauf schon geschrieben.
  ohneAussage(
    'Schleife',
    waechter(
      'REPORT z_d7b.',
      'START-OF-SELECTION.',
      '  LOOP AT gt_kunden INTO gs_kunde.',
      ...danach,
      "    UPDATE kna1 SET sperr = 'X' WHERE kunnr = gs_kunde-kunnr.",
      '  ENDLOOP.',
    ),
  );
  // Ein Aufruf vor dem Wächter kann schreiben — hier tut er es.
  ohneAussage(
    'PERFORM davor',
    waechter(
      'REPORT z_d7c.',
      'START-OF-SELECTION.',
      '  PERFORM protokoll.',
      ...danach,
      "  UPDATE kna1 SET loevm = 'X' WHERE kunnr = '1'.",
      'FORM protokoll.',
      '  INSERT zlog FROM gs_log.',
      'ENDFORM.',
    ),
  );
  // Ein Ereignis, das in der Quelle **vor** dem Wächter steht, hat schon geschrieben.
  ohneAussage(
    'INITIALIZATION davor',
    waechter(
      'REPORT z_d7d.',
      'INITIALIZATION.',
      '  DELETE FROM zlog WHERE datum < sy-datum.',
      'START-OF-SELECTION.',
      ...danach,
      "  UPDATE kna1 SET loevm = 'X' WHERE kunnr = '1'.",
    ),
  );
  // Ein mehrfach laufendes Ereignis: der vorige Benutzerbefehl hat geschrieben.
  ohneAussage(
    'AT USER-COMMAND',
    waechter('REPORT z_d7e.', 'AT USER-COMMAND.', ...danach, "  UPDATE zbeleg SET status = 'X' WHERE id = gv_id."),
  );
  // Ein Include ohne REPORT kehrt zu einem Aufrufer zurück, der weitermacht.
  ohneAussage('Include', waechter(...danach, "UPDATE zbeleg SET status = 'X' WHERE id = gv_id."));
});

