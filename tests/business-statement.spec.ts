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
const HOUSE_VOCABULARY = `output selected read determined changed persisted
discarded called passed placed set exited block reporting
returns processing written nothing hit hits list result contains row rows
record records commit work rollback executed registered update task
function module subroutine method authorization checked message table constant
assignment runtime input entered decides negative greater smaller less
including receive empty otherwise ended screen sequence created bound
structure component instance class inherits child include needs database operation
client logon predicate automatically access control entity bypassed
asynchronously started program destination notified upper case
converted assertion error terminates evidenced reached code`.split(/\s+/);

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
test('die Obergrenze eines Satzbaukastens ist gemessen und benannt', () => {
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
  // Der gemessene Wert am 23.09.2026, auf Deutsch: **116** — nachgerechnet,
  // indem die Schranke testweise unerfüllbar gesetzt und die gemeldete Zahl
  // gelesen wurde. Damals lag die Abnahme aus 17.6 (120) knapp darüber.
  //
  // Seit dem 01.10.2026 sind Erzeuger und Fallbuch Englisch (Sonny: „alles
  // Englisch"), und dieselbe Rechnung ergibt **143**. Der Grund ist die Sprache,
  // nicht ein besserer Erzeuger: Englisch schreibt ein deutsches Kompositum in
  // zwei Wörtern („Kundennummer" → „customer number"), und das Dice-Maß zählt
  // jedes davon. Die Zahl ist deshalb nicht mit der deutschen vergleichbar, und
  // die Aussage „120 ist für Weg A unerreichbar" gilt so nicht mehr — ob die
  // Abnahme auf Englisch neu gesetzt wird, ist Sonnys Entscheidung.
  //
  // Die Schranke unten steht bewusst unter dem Messwert und nicht darauf — sie
  // darf sich bewegen, wenn das Wörterbuch wächst, und fällt, wenn es schrumpft.
  expect(
    reachable,
    `Ein Satzbaukasten kann höchstens ${reachable} von ${total} Sollsätzen treffen — ` +
      'die Obergrenze ist gefallen, das Wörterbuch ist geschrumpft',
  ).toBeGreaterThan(130);
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
    const treffer = buildBusinessStatements(quelle).filter((s) => /is changed\./.test(s.core));
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
  ).toContain('specified');

  expect(
    ohneSchluessel.core,
    'ein UPDATE ohne WHERE trifft alles; „of the specified" wäre hier eine Erfindung',
  ).not.toContain('specified');

  // Der Vorbehalt bleibt in beiden Fällen: ein Schlüssel im WHERE sagt nicht,
  // dass es die Zeile gibt.
  for (const satz of [mitSchluessel, ohneSchluessel]) {
    expect(satz.text).toContain('does not guarantee that a row is hit');
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
  expect(imUnterprogramm).toContain('subroutine freigabe');
  expect(imUnterprogramm).toContain('the field iv_art is A');
  expect(imUnterprogramm).not.toMatch(/loop|smaller/);

  // In einem Ereignisblock: der Block wird verlassen.
  const imEreignis = satzAn(
    quelle('REPORT z_f1.', 'PARAMETERS p_echt AS CHECKBOX.', 'START-OF-SELECTION.', '  CHECK p_echt IS NOT INITIAL.', "  WRITE / 'X'."),
    4,
  ).join(' ');
  expect(imEreignis).toContain('event block START-OF-SELECTION');
  expect(imEreignis).toContain('not empty');
  expect(imEreignis).not.toMatch(/loop|smaller/);

  // In einer Schleife mit Gleichheit: der Durchlauf wird übersprungen, aber
  // „kleinere" gibt es bei einer Gleichheitsprüfung nicht.
  const inSchleife = satzAn(
    quelle('FORM zeilen TABLES it_pos.', '  LOOP AT it_pos INTO DATA(ls_pos).', "    CHECK ls_pos-kz = 'L'.", '  ENDLOOP.', 'ENDFORM.'),
    3,
  ).join(' ');
  expect(inSchleife).toContain('loop pass');
  expect(inSchleife).not.toContain('smaller');

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
  expect(nachSelect).toContain('subroutine lesen');
  expect(nachSelect).not.toContain('loop');

  // Wo „kleinere" wahr ist, bleibt es: ein Größenvergleich über ein bekanntes
  // Fachwort in einer Schleife.
  const groesse = satzAn(
    quelle('LOOP AT gt_pos INTO gs_pos.', '  CHECK gs_pos-betrag >= 100.', 'ENDLOOP.'),
    2,
  ).join(' ');
  expect(groesse).toContain('smaller ones are skipped, and the loop continues');
});

test('F2 — die Wortwahl nach sy-subrc folgt der Anweisung, die es gesetzt hat', () => {
  const nach = (...setter: string[]) =>
    satzAn(quelle('FORM probe.', ...setter, '  IF sy-subrc <> 0.', "    WRITE / 'FEHLER'.", '    RETURN.', '  ENDIF.', 'ENDFORM.'), setter.length + 2).join(' ');

  // Ein Lesen: „Treffer" ist hier das richtige Wort und bleibt.
  expect(nach('  SELECT SINGLE name1 FROM zkunde INTO @DATA(lv_name) WHERE id = @gv_id.')).toContain('Without a hit');

  const berechtigung = nach("  AUTHORITY-CHECK OBJECT 'Z_BELEG' ID 'ACTVT' FIELD '02'.");
  expect(berechtigung).toContain('Without authorization for Z_BELEG');
  expect(berechtigung).not.toMatch(/\bhits?\b/);

  const sperre = nach("  CALL FUNCTION 'ENQUEUE_EZBELEG' EXPORTING id = gv_id EXCEPTIONS foreign_lock = 1 OTHERS = 2.");
  expect(sperre).toContain('lock');
  expect(sperre).not.toMatch(/\bhits?\b/);

  const aufruf = nach("  CALL FUNCTION 'Z_BELEG_SENDEN' EXPORTING id = gv_id EXCEPTIONS failed = 1.");
  expect(aufruf).toContain('If the call of Z_BELEG_SENDEN fails');

  expect(nach('  OPEN DATASET gv_datei FOR INPUT IN TEXT MODE ENCODING DEFAULT.')).toContain('file cannot be opened');
  expect(nach('  INSERT zbeleg FROM gs_beleg.')).toContain('database change');

  // Wo die setzende Anweisung nicht eindeutig ist — hier liegt ein Zweig
  // dazwischen —, bleibt der Satz neutral statt geraten.
  const offen = nach("  IF gv_modus = 'A'.", "    SELECT SINGLE name1 FROM zkunde INTO @DATA(lv_x) WHERE id = @gv_id.", '  ENDIF.');
  expect(offen).toContain('return code other than 0');
  expect(offen).not.toMatch(/\bhits?\b/);
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
    expect(text, `Zeile ${zeile}`).not.toContain('logical database');
    expect(text.length, `Zeile ${zeile} hat keinen Satz`).toBeGreaterThan(0);
  }
  expect(satzAn(code, 3).join(' ')).toContain('user parameter BUK');
  expect(satzAn(code, 6).join(' ')).toContain('logical database');
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
  expect(anzeige).toContain('Transaction ZANZ is');
  expect(anzeige).toContain('initial screen is skipped');
  expect(anzeige).not.toMatch(/creat|triggered/);

  const mappe = satzAn(code, 5).join(' ');
  expect(mappe).toContain('batch input');
  expect(mappe).toContain('mode N');
  expect(mappe).toContain('synchronously');
  expect(mappe).not.toContain('creat');
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
  // The sentence of the statement itself — the run of lines 2 to 6 has its own
  // sentence, which rightly says that the status message in line 5 is output.
  const eigener = (zeile: number) =>
    buildBusinessStatements(code)
      .filter((s) => s.anchors.length === 1 && s.anchors[0].lineStart === zeile)
      .map((s) => s.text)
      .join(' ');
  const lauf = saetze(code).find((text) => text.startsWith('The message text is placed in cv_text, '));
  expect(lauf, 'the run of lines 2 to 6 names line 2 as a placement, not an output').toBeTruthy();

  const into = eigener(2);
  expect(into).toContain('placed in cv_text');
  expect(into).toContain('nothing is displayed');
  expect(into).not.toMatch(/(?<!nothing )is output/);

  const raising = eigener(3);
  expect(raising).toContain('exception nicht_gefunden is raised');
  expect(raising).not.toMatch(/(?<!nothing )is output/);
  expect(lauf).toContain('the exception nicht_gefunden is raised');

  const formatiert = eigener(4);
  expect(formatiert).toContain('formatted into gv_anzeige');
  expect(formatiert).not.toMatch(/(?<!nothing )is output/);
  expect(lauf).toContain('a value is formatted into gv_anzeige');

  // Eine echte Meldung sagt ihren Typ; eine echte Ausgabe bleibt eine Ausgabe,
  // ohne die Formatierungszusätze als Inhalt zu lesen.
  expect(satzAn(code, 5).join(' ')).toContain('status message 012(ZBEL) is output, displayed like an error message');
  const ausgabe = satzAn(code, 6).join(' ');
  expect(ausgabe).toContain('is output');
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
  expect(satzAn(waechter(), 4).join(' ')).toContain('nothing is written');

  // Ein späteres Ereignis, das etwas aufruft, macht sie unbelegt.
  const mitEnde = satzAn(waechter('END-OF-SELECTION.', '  PERFORM protokoll_sichern.'), 4).join(' ');
  expect(mitEnde).toContain('processing returns before the database operation');
  expect(mitEnde).not.toContain('nothing is written');

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
  expect(sichernd).not.toContain('nothing is written');

  // Ein EXIT in einer Schleife verlässt nur die Schleife.
  const schleife = satzAn(
    quelle('REPORT z_f6c.', 'LOOP AT gt_pos INTO gs_pos.', "  IF gs_pos-kz = 'E'.", '    EXIT.', '  ENDIF.', 'ENDLOOP.', 'DELETE FROM zbeleg WHERE id = gv_id.'),
    3,
  ).join(' ');
  expect(schleife).toContain('loop is exited');
  expect(schleife).not.toContain('database operation');

  // „kein COMMIT WORK" nicht neben einem BAPI_TRANSACTION_COMMIT …
  const bapi = satzAn(
    quelle('REPORT z_f6d.', "UPDATE zbeleg SET status = 'X' WHERE id = gv_id.", "CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'."),
    2,
  ).join(' ');
  expect(bapi).not.toMatch(/no COMMIT|not persisted/);
  // … und nicht in einer Routine ohne Programm: dort schreibt der Aufrufer fest.
  const routine = satzAn(quelle('FORM speichern.', "  UPDATE zbeleg SET status = 'X' WHERE id = gv_id.", 'ENDFORM.'), 2).join(' ');
  expect(routine).not.toMatch(/no COMMIT|not persisted/);
  // Wo es wahr ist, bleibt es stehen.
  expect(satzAn(quelle('REPORT z_f6e.', "UPDATE zbeleg SET status = 'X' WHERE id = gv_id."), 2).join(' ')).toContain(
    'no COMMIT WORK',
  );

  // Ein MODIFY auf eine interne Tabelle oder das Bild schreibt nicht in die Datenbank.
  const intern = satzAn(quelle('REPORT z_f6f.', 'MODIFY gt_pos FROM gs_pos INDEX 1.'), 2).join(' ');
  expect(intern).toContain('internal table gt_pos');
  expect(intern).not.toMatch(/no COMMIT|inserted or overwritten/);
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
  expect(form).toContain('subroutine abschluss');
  expect(form).toContain('changes ZLAUF');
  expect(form).not.toContain('not evidenced');

  const methode = satzAn(code, 15).join(' ');
  expect(methode).toContain('calls Z_PROTOKOLL_SICHERN');
  expect(methode).toContain('COMMIT WORK');
  expect(methode).not.toContain('not evidenced');

  // Was nicht im Ausschnitt steht, bleibt „nicht belegt" — auch eine globale
  // Klasse, deren Methode zufällig so heißt wie eine lokale.
  expect(satzAn(code, 16).join(' ')).toContain('not evidenced');
  expect(satzAn(code, 17).join(' ')).toContain('not evidenced');
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
  expect(importing).not.toContain('placed in cl_fremd_liste');
  expect(importing).toContain('placed in go_liste');

  const ohne = satzAn(code, 4).join(' ');
  expect(ohne).not.toMatch(/return value|placed in/);
  expect(ohne).toContain('The method neu_aufbauen of zcl_fremd_lader is called');

  expect(satzAn(code, 5).join(' ')).toContain('placed in gv_anzahl');
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
  expect(weiter).toContain('screen 200');
  expect(weiter).not.toContain('screen sequence is ended');
  expect(satzAn(code, 6).join(' ')).toContain('screen sequence is ended');
  expect(satzAn(code, 8).join(' ')).toContain('program is ended');
  const liste = satzAn(code, 10).join(' ');
  expect(liste).toContain('List processing is exited');
  expect(liste).not.toContain('screen sequence');
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
  expect(badi).not.toMatch(/amount|route text|approval/);

  const baustein = satzAn(code, 6).join(' ');
  expect(baustein).toContain('Z_ZAEHLER_LESEN');
  expect(baustein).toContain('gv_stand');
  expect(baustein).not.toContain('converted');

  const rfc = satzAn(code, 7).join(' ');
  expect(rfc).toContain('Z_ABGLEICH is called in a remote system via the entered destination');
  expect(rfc).not.toContain('notif');
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
  expect(an(9).map((s) => s.text)).toEqual(['With hits, the customer number and the name are output as a list.']);

  // Wächter und Zweig über dasselbe IF sind ein Satz, nicht zwei oder drei.
  expect(an(4).length).toBe(1);
  expect(an(4)[0].text).toContain('Without a hit, KEINE is output');

  // Ein IF … ELSE ist eine Entscheidung mit zwei Ausgängen: ein Satz.
  const entscheidung = an(12);
  expect(entscheidung.filter((s) => s.grain === 'group').length).toBe(1);
  expect(entscheidung.find((s) => s.grain === 'group')!.text).toContain('otherwise AENDERN is output');

  // „übergibt … und übernimmt dessen Ausgabe nach …" nennt das Ergebnis schon.
  expect(an(16).filter((s) => /placed in|takes its output/.test(s.text)).length).toBe(1);
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
  // English has no gender to guess; the same mistake would be an article
  // before a bare identifier ("the return_code").
  expect(alle).not.toMatch(/\bthe return_code\b|\bThe return_code\b/);
  expect(alle).toContain('The field return_code is set to 1');

  const zweig = satzAn(code, 5).join(' ');
  expect(zweig).not.toMatch(/An empty lv_msgno| set the/);
  expect(zweig).toContain('If the field lv_msgno is empty, the field gv_stufe is set to E');

  // Mit einem bekannten Fachwort bleibt das Mehrzahl-Subjekt, und das Verb passt.
  expect(satzAn(code, 8).join(' ')).toContain('Negative amounts set the route to NEGATIV');

  expect(satzAn(code, 10).join(' ')).toContain('The material number from zmatzuo is read');
  expect(satzAn(quelle('REPORT z.', 'SELECT SINGLE zfeld FROM zmatzuo INTO gv_x.'), 2).join(' ')).toContain('The field zfeld from zmatzuo is read');
  const existenz = satzAn(code, 11).join(' ');
  expect(existenz).toContain('checked whether there is a matching record in zsperre');
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
  expect(satzAn(code, 12).join(' ')).toContain('The subroutines lesen, rechnen and ausgeben are called one after another, each without parameters');
  // Eine Berechtigungsprüfung, deren Ergebnis niemand liest, schützt nichts.
  expect(satzAn(code, 13).join(' ')).toContain('The result of the check is not evaluated');
  // Ein RETURNING-Parameter ist das Ergebnis der Methode, kein Feld mit eigenem Namen.
  expect(satzAn(code, 8).join(' ')).toContain('The method naechster returns the value 7');
  // FOR ALL ENTRIES liest zu den Einträgen einer Tabelle, nicht „die Kunden".
  expect(satzAn(code, 14).join(' ')).toContain('for the entries from gt_schluessel');
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
  expect(dynamisch).not.toContain('fixed by');
  expect(dynamisch).not.toContain('the input decides');
  expect(dynamisch).toContain('Only at runtime does gv_tab settle');

  const schleife = satzAn(code, 8).join(' ');
  expect(schleife).not.toContain('Every row');
  expect(schleife).toContain('for which the field kz is L');

  expect(satzAn(code, 10).join(' ')).not.toContain('another program');
  expect(satzAn(code, 11).join(' ')).not.toMatch(/input/i);
  expect(satzAn(code, 12).join(' ')).toContain('background job');
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
  expect(satzAn(code, 4).join(' ')).toContain('material number and plant');
  // EKKO heißt fachlich "purchase order", mit Schlüssel "the specified".
  expect(satzAn(code, 5).join(' ')).toContain('of the specified purchase order');
  expect(satzAn(code, 6).join(' ')).toContain('supplier number of the purchase order');
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
  expect(satzAn(code, 5).filter((s) => /are output/.test(s))).toEqual([]);
  expect(satzAn(code, 10).join(' ')).not.toContain('database operation');

  // QA cb41c1e00bc0: dass kein Listensatz mehr dasteht, genügt nicht — die
  // Kette muss im Zweigsatz stehen, ganz, mit seiner Bedingung, und genau einmal.
  const an5 = buildBusinessStatements(code).filter((s) => s.anchors.some((a) => a.lineStart === 5));
  const zweig = an5.filter((s) => s.grain === 'group');
  expect(zweig.length, 'genau ein Zweigsatz trägt die Kette').toBe(1);
  expect(zweig[0].text).toMatch(/^If the field p_test is set, /);
  for (const wert of ['the material number', 'the plant', 'TEST']) expect(zweig[0].text).toContain(`${wert} is output`);
  expect(zweig[0].text).toContain('the loop pass is skipped');
  // Daneben steht an Zeile 5 höchstens der Satz zum ausgegebenen Literal —
  // keine Spalte der Kette ein zweites Mal ohne Bedingung.
  const daneben = an5.filter((s) => s.grain === 'statement').map((s) => s.text);
  expect(daneben.filter((text) => /material number|plant/.test(text))).toEqual([]);
  expect(daneben).toEqual(['TEST is output. The output only proves that this point in the code was reached.']);
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
  expect(getragen).toContain('processing returns before the database operation; nothing is written');

  const ohneAussage = (label: string, text: string) => {
    expect(text, label).toContain('processing returns before the database operation');
    expect(text, label).not.toContain('nothing is written');
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

test('QA b7e191a72212 — eine lokale Wirkung nur, wenn der Empfänger die lokale Klasse ist', () => {
  const klassen = [
    'REPORT z_b7e.',
    'CLASS lcl_log DEFINITION.',
    '  PUBLIC SECTION.',
    '    METHODS save.',
    'ENDCLASS.',
    'CLASS lcl_kind DEFINITION INHERITING FROM lcl_log.',
    'ENDCLASS.',
    'CLASS lcl_log IMPLEMENTATION.',
    '  METHOD save.',
    "    UPDATE zlog SET status = 'S' WHERE id = '1'.",
    '  ENDMETHOD.',
    'ENDCLASS.',
    'DATA lo_fremd TYPE REF TO zcl_extern.',
    'DATA lo_kind TYPE REF TO lcl_kind.',
    'START-OF-SELECTION.',
  ];
  const code = quelle(...klassen, '  lo_fremd->save( ).', '  CALL METHOD lo_fremd->save.', '  lo_kind->save( ).', '  lo_offen->save( ).');
  const zeile = (n: number) => satzAn(code, klassen.length + n).join(' ');

  // Eine fremde Klasse: nicht die lokale `save`, die zufällig gleich heißt.
  for (const fremd of [zeile(1), zeile(2)]) {
    expect(fremd).toContain('The method save of lo_fremd is called');
    expect(fremd).not.toContain('ZLOG');
    expect(fremd).toContain('not evidenced in the supplied code');
  }
  // Eine lokale Kindklasse erbt `save` — die Wirkung gehört ihr.
  expect(zeile(3)).toContain('The method save of lo_kind is called; it changes ZLOG');
  // Ein Objekt ohne Deklaration: offen, welche Implementierung läuft — keine Wirkung.
  expect(zeile(4)).not.toContain('ZLOG');
  expect(zeile(4)).toContain('Which implementation of save runs here');

  // Und die negative Aussage an der Datenbankänderung davor: ein fremder
  // Aufruf danach kann festschreiben, also kein „kein COMMIT WORK".
  const mitFremd = quelle(...klassen, "  UPDATE zbeleg SET status = 'X' WHERE id = gv_id.", '  lo_fremd->save( ).');
  expect(satzAn(mitFremd, klassen.length + 1).join(' ')).not.toContain('no COMMIT WORK');
  const mitLokal = quelle(...klassen, "  UPDATE zbeleg SET status = 'X' WHERE id = gv_id.", '  lo_kind->save( ).');
  expect(satzAn(mitLokal, klassen.length + 1).join(' ')).toContain('no COMMIT WORK');
});

test('QA 594357222bd7 — ein Kennzeichen ohne erratenes Geschlecht, im Zweig und im Wächter', () => {
  const code = quelle(
    'REPORT z_594.',
    'START-OF-SELECTION.',
    "  IF gv_flag = 'X'.",
    "    gv_modus = 'A'.",
    '  ENDIF.',
    "  IF gv_flag <> 'X'.",
    '    RETURN.',
    '  ENDIF.',
    "  IF gs_kunde-loevm = 'X'.",
    "    gv_modus = 'L'.",
    '  ENDIF.',
  );
  const alle = saetze(code).join(' ');
  // No article before a bare identifier: "the field gv_flag", never "the gv_flag".
  expect(alle).not.toMatch(/\b[Tt]he (?:gv_flag|gv_modus|loevm)\b/);
  expect(satzAn(code, 4).join(' ')).toContain('If the field gv_flag is set, the field gv_modus is set to A');
  expect(satzAn(code, 6).join(' ')).toContain('If the field gv_flag is not set, the block is exited');
  // Ein Feld, das das Glossar kennt, heißt mit seinem Fachwort.
  expect(satzAn(code, 10).join(' ')).toContain('If the deletion flag is set');
});

test('QA b8f597730411 — SELECT … WHERE sagt seine Einschränkung, MESSAGE … INTO im Zweig gibt nichts aus', () => {
  const code = quelle(
    'REPORT z_b8f.',
    'PARAMETERS p_status TYPE c LENGTH 1.',
    'START-OF-SELECTION.',
    '  SELECT * FROM zbeleg INTO TABLE @DATA(lt_offen) WHERE status = @p_status.',
    '  SELECT * FROM zbeleg INTO TABLE @DATA(lt_alle).',
    '  SELECT * FROM zbeleg INTO @DATA(ls_beleg) WHERE status = @p_status.',
    '    WRITE / ls_beleg-status.',
    '  ENDSELECT.',
    '  IF gv_id IS INITIAL.',
    '    MESSAGE e001(zz) WITH gv_id INTO gv_text.',
    '  ENDIF.',
  );
  const mitWhere = satzAn(code, 4).join(' ');
  expect(mitWhere).toContain('Records from zbeleg with the entered status are selected');
  expect(mitWhere).not.toMatch(/\b(?:all|each|every)\b/i);
  // Ohne WHERE wird keine Einschränkung erfunden.
  expect(satzAn(code, 5).join(' ')).toBe('Records from zbeleg are selected.');
  const schleife = satzAn(code, 6).join(' ');
  expect(schleife).toContain('with the entered status');
  expect(schleife).not.toMatch(/\b(?:all|each|every)\b/i);

  // MESSAGE … INTO bleibt im Zweigsatz eine Übernahme, keine Ausgabe.
  const zweig = buildBusinessStatements(code).filter((s) => s.grain === 'group' && s.anchors.some((a) => a.lineStart === 10));
  expect(zweig.length).toBe(1);
  expect(zweig[0].text).toContain('the message text is placed in gv_text');
  expect(zweig[0].text).not.toMatch(/is output|is displayed/);
});

test('QA 23c5c0362148 — eine Kopie von sy-subrc trägt die Bedeutung ihrer setzenden Anweisung, solange sie gilt', () => {
  const pruefung = (...zeilen: string[]) =>
    satzAn(quelle('FORM probe.', ...zeilen, '  IF lv_rc <> 0.', '    RETURN.', '  ENDIF.', 'ENDFORM.'), zeilen.length + 2).join(' ');
  const auth = "  AUTHORITY-CHECK OBJECT 'Z_BELEG' ID 'ACTVT' FIELD '02'.";
  const lesen = '  SELECT SINGLE name1 FROM zkunde INTO @DATA(lv_name) WHERE id = @gv_id.';

  // Die Kopie nach einer Berechtigungsprüfung: keine „Treffer".
  const kopie = pruefung(auth, '  lv_rc = sy-subrc.');
  expect(kopie).toContain('Without authorization for Z_BELEG, the block is exited');
  expect(kopie).not.toMatch(/\bhits?\b/);
  expect(pruefung(auth, '  DATA(lv_rc) = sy-subrc.')).toContain('Without authorization for Z_BELEG');

  // Ein Lesen **nach** der Kopie ändert sy-subrc, nicht die Kopie.
  const danachGelesen = pruefung(auth, '  lv_rc = sy-subrc.', lesen);
  expect(danachGelesen).toContain('Without authorization for Z_BELEG');
  expect(danachGelesen).not.toMatch(/\bhits?\b/);

  // Kopiert nach dem Lesen: dann sind es Treffer.
  expect(pruefung(auth, lesen, '  lv_rc = sy-subrc.')).toContain('Without a hit');

  // Überschrieben, geleert oder nur in einem Zweig kopiert: die Variable hält
  // nicht mehr (sicher) das sy-subrc — der Satz bleibt neutral.
  for (const [label, ...zeilen] of [
    ['überschrieben', auth, '  lv_rc = sy-subrc.', '  lv_rc = gv_anderes.'],
    ['geleert', auth, '  lv_rc = sy-subrc.', '  CLEAR lv_rc.'],
    ['im Zweig', auth, '  IF gv_modus = 1.', '    lv_rc = sy-subrc.', '  ENDIF.'],
    ['aus einem Aufruf', auth, '  lv_rc = sy-subrc.', "  CALL FUNCTION 'Z_PRUEFEN' IMPORTING ev_rc = lv_rc."],
  ]) {
    const text = pruefung(...zeilen);
    expect(text, label).toContain('If the field lv_rc is not 0');
    expect(text, label).not.toMatch(/authorization for Z_BELEG, the block|\bhits?\b/);
  }
});
