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
 * The engine's business-statement generator (roadmap 17.7, Path A).
 *
 * This spec does **not** check how good the sentences are — the corpus does
 * that (`tests/korpus/baseline.json`, facet `fachsaetze`), with a comparator
 * this step did not touch. What stands here are the three promises 17.7
 * imposes on the generator and that a hit count does not cover:
 *
 * 1. **Vagueness is resolved and then declared, in that order.**
 *    No element carries "not determined" *instead of* a statement.
 * 2. **Rule 6 stays where it is.** The skeleton's node label is still a
 *    literal token; the business statement is a layer beside it.
 * 3. **Deterministic.** No model, no network, no key — and the same source
 *    yields the same sentence.
 */

/**
 * The vocabulary this module uses — read generously, so that the ceiling
 * below does not compute too small a number.
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

test('the engine produces business statements at all — for every case of the corpus', () => {
  // Before 17.7 the answer was zero, across all 68 cases. That was a
  // measurement, not wiring, and this test holds on to the difference.
  expect(ALL.length, 'not a single business statement produced').toBeGreaterThan(0);
  const silent = CASES.filter(
    (korpusCase) => !ALL.some((entry) => entry.case === korpusCase.id),
  ).map((korpusCase) => korpusCase.id);
  expect(silent.join(', '), 'these cases get not a single sentence from the engine').toEqual('');
});

test('"not determined" never takes the place of a sentence (requirement 3)', () => {
  // The easy way would be to fall silent at every gap and pass the silence off
  // as honesty. That is exactly what is forbidden here: first the best
  // statement the evidence supports, then the remaining uncertainty *on* it.
  const broken: string[] = [];
  for (const entry of ALL) {
    const { core, text, uncertainties, provenance } = entry.statement;
    if (!core.trim()) broken.push(`${entry.case}/${entry.statement.id}: empty core sentence`);
    if (provenance !== 'reconstructed') {
      broken.push(`${entry.case}/${entry.statement.id}: provenance ${provenance} instead of reconstructed`);
    }
    if (!text.startsWith(core)) {
      broken.push(`${entry.case}/${entry.statement.id}: the caveat comes before the statement`);
    }
    for (const note of uncertainties) {
      if (note.provenance !== 'not-determined') {
        broken.push(`${entry.case}/${entry.statement.id}: caveat with a foreign provenance`);
      }
    }
    // A statement that consists of nothing but a caveat is no statement.
    if (/^(nicht bestimmt|unbekannt|nicht belegt)\.?$/i.test(core.trim())) {
      broken.push(`${entry.case}/${entry.statement.id}: "${core}" is not a business statement`);
    }
  }
  expect(broken.slice(0, 10).join('\n')).toEqual('');
});

test('the provenance comes from lib/provenance.ts and is never invented anew', () => {
  // There, `reconstructed` means: "Derived from the code, not confirmed by
  // anyone." That is exactly what an engine sentence is, and that is why no
  // value of its own stands here.
  expect(PROVENANCE.reconstructed.value).toBe('reconstructed');
  expect(PROVENANCE['not-determined'].value).toBe('not-determined');
  const values = new Set(ALL.map((entry) => entry.statement.provenance));
  expect([...values]).toEqual(['reconstructed']);
});

test('every anchor points to an ABAP statement that exists', () => {
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

test('the same source yields the same sentence — no model, no chance', () => {
  for (const korpusCase of CASES.slice(0, 12)) {
    for (const source of korpusCase.sources) {
      const first = buildBusinessStatements(source.code);
      const second = buildBusinessStatements(source.code);
      expect(JSON.stringify(second), `${korpusCase.id}/${source.name} is not reproducible`).toEqual(
        JSON.stringify(first),
      );
    }
  }
});

test('step 1 before step 2: the value is resolved before it is flagged', () => {
  // CC-036 names the table through a constant; CC-011 names the function
  // module through an assignment. A generator that says "not determined" here
  // has skipped the resolution — and that is the error 17.7 forbids.
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

test('Rule 6 stays in the skeleton: the business statement is a layer beside it', () => {
  // (a) The dependency points one way only. If `process-skeleton.ts` imported
  //     the generator, an invented phrase could end up in a node label without
  //     anyone noticing.
  const skeletonSource = readFileSync(join(process.cwd(), 'lib/abap/process-skeleton.ts'), 'utf8');
  expect(
    skeletonSource.includes('business-statement'),
    'process-skeleton.ts must not know the business-statement generator — otherwise Rule 6 is open',
  ).toBe(false);

  // (b) The skeleton comes back from the attachment unchanged, and the labels
  //     remain literal tokens from the source.
  for (const korpusCase of CASES.slice(0, 20)) {
    for (const source of korpusCase.sources) {
      const skeleton = buildProcessSkeleton(source.code);
      const before = JSON.stringify(skeleton);
      const attached = attachTo(skeleton.nodes, buildBusinessStatements(source.code));
      expect(JSON.stringify(skeleton), `${korpusCase.id}: attachTo changed the skeleton`).toEqual(before);
      for (const [nodeId, statement] of attached) {
        const node = skeleton.nodes.find((candidate) => candidate.id === nodeId);
        expect(node, `${korpusCase.id}: sentence on a node that does not exist`).toBeTruthy();
        expect(statement.core.length, `${korpusCase.id}/${nodeId}: empty sentence on the node`).toBeGreaterThan(0);
      }
    }
  }
});

test('the business statement sits on the BPMN element, not in a list beside it (requirement 2)', () => {
  // Measured, not claimed: how many nodes with a line anchor get a sentence?
  // The number may drop as the skeleton grows — but not to zero, and not below
  // half, otherwise the Business view is a list again.
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
  expect(anchored, 'no node of the corpus carries a line anchor').toBeGreaterThan(100);
  expect(
    withSentence / anchored,
    `only ${withSentence} of ${anchored} anchored nodes carry a business statement`,
  ).toBeGreaterThan(0.5);
});

/**
 * **The ceiling — measured, not claimed.**
 *
 * The acceptance figure from 17.7 ("≥ 120 of 173") was set in 17.6, before
 * there was a generator; the roadmap itself says: *"A target figure for the
 * first generator is still missing."* This test works out what a
 * **sentence kit can reach at all**, and generously so: it assumes a
 * generator that hits, in every expected sentence, exactly the words derivable
 * from the anchor — every word of the ABAP statement, every translation in the
 * glossary, plus the whole vocabulary the sentences of this module use. No
 * generator that invents nothing can do better than that one.
 *
 * What remains is the part of the expected sentences that is **not in the
 * code**: the casebook's judgement prose — "not evidenced", "unknown in the
 * slice", "a business statement about 'customers' cannot be supported here",
 * references to F03, S11 and to other cases. Whoever wants to raise this
 * number has to make the engine say these sentences; they are judgement, not
 * derivation.
 */
test('the ceiling of a sentence kit is measured and named', () => {
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
  // The value measured on 23.09.2026, in German: **116** — recomputed by
  // setting the bound to something unsatisfiable for a trial run and reading
  // the reported number. At the time the acceptance figure from 17.6 (120) lay
  // just above it.
  //
  // Since 01.10.2026 generator and casebook are English (Sonny: "everything
  // English"), and the same computation yields **143**. The reason is the
  // language, not a better generator: English writes a German compound as two
  // words ("Kundennummer" → "customer number"), and the Dice measure counts
  // each of them. The number is therefore not comparable with the German one,
  // and the statement "120 is unreachable for Path A" no longer holds as such —
  // whether the acceptance figure is reset for English is Sonny's decision.
  //
  // The bound below deliberately sits under the measured value, not on it — it
  // may move as the glossary grows, and fails when it shrinks.
  expect(
    reachable,
    `A sentence kit can hit at most ${reachable} of ${total} expected sentences — ` +
      'the ceiling has dropped, the glossary has shrunk',
  ).toBeGreaterThan(130);
});

/**
 * An UPDATE with a key says "of the specified …", one without does not.
 *
 * Until 23.09.2026 the distinction did not exist, and nothing turned red: the
 * detection held a real backspace character (0x08) where the word boundary
 * belonged — `/<BS>WHERE…/` instead of `/\bWHERE…/`. ABAP source contains no
 * control characters, so the rule never matched and `keyed` was always false.
 * The QA delta review of e24d1fb found it; no test of the generator had ever
 * entered the branch.
 *
 * The test checks both sides. A check on the keyed case alone would be green
 * again if someone hard-wired `keyed` to `true`.
 *
 * The table is `KNA1` because the difference only shows for a table the
 * glossary knows — for an unknown one the sentence falls back to the literal
 * name and does not speak of "specified" at all.
 */
test('an UPDATE with a key is described as such, one without is not', () => {
  const zeilen = (...z: string[]) => z.join('\n') + '\n';

  const updateSatz = (quelle: string): BusinessStatement => {
    const treffer = buildBusinessStatements(quelle).filter((s) => /is changed\./.test(s.core));
    expect(treffer, `no UPDATE sentence for:\n${quelle}`).toHaveLength(1);
    return treffer[0];
  };

  const mitSchluessel = updateSatz(
    zeilen('REPORT z_t.', 'PARAMETERS p_kunnr TYPE kunnr.', 'UPDATE kna1 SET land1 = @lv_neu WHERE kunnr = p_kunnr.'),
  );
  const ohneSchluessel = updateSatz(zeilen('REPORT z_t.', 'UPDATE kna1 SET land1 = @lv_neu.'));

  expect(
    mitSchluessel.core,
    'an UPDATE with WHERE on an input parameter hits a specific row — the sentence must say so',
  ).toContain('specified');

  expect(
    ohneSchluessel.core,
    'an UPDATE without WHERE hits everything; "of the specified" would be an invention here',
  ).not.toContain('specified');

  // The caveat stays in both cases: a key in the WHERE does not say that the
  // row exists.
  for (const satz of [mitSchluessel, ohneSchluessel]) {
    expect(satz.text).toContain('does not guarantee that a row is hit');
  }
});

// ---------------------------------------------------------------------------
// The failure patterns from the process benchmark (F1–F12)
//
// Each test below names a pattern that five independent judges found in the
// sentences of this generator, and pins the correction with a minimal ABAP
// written for the purpose — not a case from the benchmark.
// ---------------------------------------------------------------------------

const quelle = (...z: string[]) => z.join('\n') + '\n';
const saetze = (code: string) => buildBusinessStatements(code).map((s) => s.text);
const satzAn = (code: string, zeile: number) =>
  buildBusinessStatements(code)
    .filter((s) => s.anchors.some((a) => a.lineStart <= zeile && zeile <= a.lineEnd))
    .map((s) => s.text);

test('F1 — CHECK states the consequence for where it stands and the condition as it is', () => {
  // In a FORM without a loop: the routine is exited, nothing "continues".
  const imUnterprogramm = satzAn(
    quelle('FORM freigabe USING iv_art TYPE c.', "  CHECK iv_art = 'A'.", '  WRITE / iv_art.', 'ENDFORM.'),
    2,
  ).join(' ');
  expect(imUnterprogramm).toContain('subroutine freigabe');
  expect(imUnterprogramm).toContain('the field iv_art is A');
  expect(imUnterprogramm).not.toMatch(/loop|smaller/);

  // In an event block: the block is exited.
  const imEreignis = satzAn(
    quelle('REPORT z_f1.', 'PARAMETERS p_echt AS CHECKBOX.', 'START-OF-SELECTION.', '  CHECK p_echt IS NOT INITIAL.', "  WRITE / 'X'."),
    4,
  ).join(' ');
  expect(imEreignis).toContain('event block START-OF-SELECTION');
  expect(imEreignis).toContain('not empty');
  expect(imEreignis).not.toMatch(/loop|smaller/);

  // In a loop with an equality: the pass is skipped, but there are no
  // "smaller ones" in an equality check.
  const inSchleife = satzAn(
    quelle('FORM zeilen TABLES it_pos.', '  LOOP AT it_pos INTO DATA(ls_pos).', "    CHECK ls_pos-kz = 'L'.", '  ENDLOOP.', 'ENDFORM.'),
    3,
  ).join(' ');
  expect(inSchleife).toContain('loop pass');
  expect(inSchleife).not.toContain('smaller');

  // A SELECT into a table opens no loop — not with CORRESPONDING FIELDS OF
  // TABLE either. The CHECK after it stands in the routine.
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

  // Where "smaller ones" is true, it stays: a magnitude comparison on a known
  // business term inside a loop.
  const groesse = satzAn(
    quelle('LOOP AT gt_pos INTO gs_pos.', '  CHECK gs_pos-betrag >= 100.', 'ENDLOOP.'),
    2,
  ).join(' ');
  expect(groesse).toContain('smaller ones are skipped, and the loop continues');
});

test('F2 — the wording after sy-subrc follows the statement that set it', () => {
  const nach = (...setter: string[]) =>
    satzAn(quelle('FORM probe.', ...setter, '  IF sy-subrc <> 0.', "    WRITE / 'FEHLER'.", '    RETURN.', '  ENDIF.', 'ENDFORM.'), setter.length + 2).join(' ');

  // A read: "hit" is the right word here, and it stays.
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

  // Where the setting statement is not unambiguous — here a branch lies in
  // between — the sentence stays neutral instead of guessing.
  const offen = nach("  IF gv_modus = 'A'.", "    SELECT SINGLE name1 FROM zkunde INTO @DATA(lv_x) WHERE id = @gv_id.", '  ENDIF.');
  expect(offen).toContain('return code other than 0');
  expect(offen).not.toMatch(/\bhits?\b/);
});

test('F3 — only GET <node> is a logical database; GET PARAMETER, TIME, REFERENCE are not', () => {
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
    expect(text, `line ${zeile}`).not.toContain('logical database');
    expect(text.length, `line ${zeile} has no sentence`).toBeGreaterThan(0);
  }
  expect(satzAn(code, 3).join(' ')).toContain('user parameter BUK');
  expect(satzAn(code, 6).join(' ')).toContain('logical database');
});

test('F4 — CALL TRANSACTION states the call, not a purpose read from the name', () => {
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

test('F5 — MESSAGE … INTO and WRITE … TO output nothing', () => {
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

  // A real message states its type; a real output stays an output, without
  // reading the formatting additions as content.
  expect(satzAn(code, 5).join(' ')).toContain('status message 012(ZBEL) is output, displayed like an error message');
  const ausgabe = satzAn(code, 6).join(' ');
  expect(ausgabe).toContain('is output');
  expect(ausgabe).not.toContain('CURRENCY');
});

test('F6 — "nothing is written" and "no COMMIT WORK" only when the path supports it', () => {
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
  // The simple case supports the statement: nothing else runs afterwards.
  expect(satzAn(waechter(), 4).join(' ')).toContain('nothing is written');

  // A later event that calls something leaves it unevidenced.
  const mitEnde = satzAn(waechter('END-OF-SELECTION.', '  PERFORM protokoll_sichern.'), 4).join(' ');
  expect(mitEnde).toContain('processing returns before the database operation');
  expect(mitEnde).not.toContain('nothing is written');

  // A guard that saves on its own does write.
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

  // An EXIT in a loop leaves only the loop.
  const schleife = satzAn(
    quelle('REPORT z_f6c.', 'LOOP AT gt_pos INTO gs_pos.', "  IF gs_pos-kz = 'E'.", '    EXIT.', '  ENDIF.', 'ENDLOOP.', 'DELETE FROM zbeleg WHERE id = gv_id.'),
    3,
  ).join(' ');
  expect(schleife).toContain('loop is exited');
  expect(schleife).not.toContain('database operation');

  // No "no COMMIT WORK" next to a BAPI_TRANSACTION_COMMIT …
  const bapi = satzAn(
    quelle('REPORT z_f6d.', "UPDATE zbeleg SET status = 'X' WHERE id = gv_id.", "CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'."),
    2,
  ).join(' ');
  expect(bapi).not.toMatch(/no COMMIT|not persisted/);
  // … and not in a routine without a program: there the caller commits.
  const routine = satzAn(quelle('FORM speichern.', "  UPDATE zbeleg SET status = 'X' WHERE id = gv_id.", 'ENDFORM.'), 2).join(' ');
  expect(routine).not.toMatch(/no COMMIT|not persisted/);
  // Where it is true, it stays.
  expect(satzAn(quelle('REPORT z_f6e.', "UPDATE zbeleg SET status = 'X' WHERE id = gv_id."), 2).join(' ')).toContain(
    'no COMMIT WORK',
  );

  // A MODIFY on an internal table or on the screen does not write to the database.
  const intern = satzAn(quelle('REPORT z_f6f.', 'MODIFY gt_pos FROM gs_pos INDEX 1.'), 2).join(' ');
  expect(intern).toContain('internal table gt_pos');
  expect(intern).not.toMatch(/no COMMIT|inserted or overwritten/);
});

test('F7 — "not evidenced" only when the call target is really missing', () => {
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

  // What is not in the excerpt stays "not evidenced" — including a global
  // class whose method happens to share its name with a local one.
  expect(satzAn(code, 16).join(' ')).toContain('not evidenced');
  expect(satzAn(code, 17).join(' ')).toContain('not evidenced');
});

test('F8 — the return value lands in the receiver left of the =, not in the class before =>', () => {
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

test('F9 — LEAVE says where it goes: next screen, end of list, end of program', () => {
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

test('F10 — no hand-overs and effects the code does not support', () => {
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

test('F11 — one sentence per statement: no repetition of the same thing at the same place', () => {
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

  // The output list is one sentence; the columns get no sentence of their own beside it.
  expect(an(9).map((s) => s.text)).toEqual(['With hits, the customer number and the name are output as a list.']);

  // Guard and branch over the same IF are one sentence, not two or three.
  expect(an(4).length).toBe(1);
  expect(an(4)[0].text).toContain('Without a hit, KEINE is output');

  // An IF … ELSE is one decision with two exits: one sentence.
  const entscheidung = an(12);
  expect(entscheidung.filter((s) => s.grain === 'group').length).toBe(1);
  expect(entscheidung.find((s) => s.grain === 'group')!.text).toContain('otherwise AENDERN is output');

  // "passes … and takes its output into …" already names the result.
  expect(an(16).filter((s) => /placed in|takes its output/.test(s.text)).length).toBe(1);
});

test('F12 — no guessed gender before identifiers, the verb agrees with the subject', () => {
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

  // With a known business term the plural subject stays, and the verb agrees.
  expect(satzAn(code, 8).join(' ')).toContain('Negative amounts set the route to NEGATIV');

  expect(satzAn(code, 10).join(' ')).toContain('The material number from zmatzuo is read');
  expect(satzAn(quelle('REPORT z.', 'SELECT SINGLE zfeld FROM zmatzuo INTO gv_x.'), 2).join(' ')).toContain('The field zfeld from zmatzuo is read');
  const existenz = satzAn(code, 11).join(' ');
  expect(existenz).toContain('checked whether there is a matching record in zsperre');
  expect(existenz).not.toContain('abap_true');
});

test('17.9 — the sentences do not say what the code at their anchor does not support', () => {
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
  // Three calls one after another, not one with two parameters.
  expect(satzAn(code, 12).join(' ')).toContain('The subroutines lesen, rechnen and ausgeben are called one after another, each without parameters');
  // An authorization check whose result nobody reads protects nothing.
  expect(satzAn(code, 13).join(' ')).toContain('The result of the check is not evaluated');
  // A RETURNING parameter is the method's result, not a field with a name of its own.
  expect(satzAn(code, 8).join(' ')).toContain('The method naechster returns the value 7');
  // FOR ALL ENTRIES reads for the entries of a table, not "the customers".
  expect(satzAn(code, 14).join(' ')).toContain('for the entries from gt_schluessel');
});

test('FOR ALL ENTRIES over a table nobody checks for content says what an empty table does (carried QA finding 657629d1daa0)', () => {
  const select = '  SELECT kunnr FROM kna1 FOR ALL ENTRIES IN @gt_x WHERE kunnr = @gt_x-kunnr INTO TABLE @DATA(lt_da).';
  const ungeprueft = satzAn(quelle('REPORT z.', 'START-OF-SELECTION.', select), 3).join(' ');
  expect(ungeprueft).toContain('If gt_x is empty, the restriction is dropped and all rows are read.');
  // `>= 1` and `GE 1` are the same guard as `> 0` (QA finding 66d825effb5c).
  for (const guard of ['  IF gt_x IS NOT INITIAL.', '  IF lines( gt_x ) > 0.', '  IF lines( gt_x ) >= 1.', '  IF lines( gt_x ) GE 1.', '  CHECK gt_x[] IS NOT INITIAL.']) {
    const code = guard.startsWith('  CHECK')
      ? quelle('REPORT z.', 'START-OF-SELECTION.', guard, select)
      : quelle('REPORT z.', 'START-OF-SELECTION.', guard, select, '  ENDIF.');
    const geprueft = satzAn(code, 4).join(' ');
    expect(geprueft, guard).toContain('for the entries from gt_x');
    expect(geprueft, guard).not.toContain('is empty, the restriction is dropped');
  }
});

test('more statements the code does not support: resolution, LOOP … WHERE, ASSIGN, TRANSLATE, SUBMIT VIA JOB', () => {
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
  // A literal next to a value that is read is a default, not a fixed setting.
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

test('wording — SAP standard tables and fields go by their business names, with the right article', () => {
  const code = quelle(
    'REPORT z_wort.',
    'PARAMETERS p_ebeln TYPE ebeln.',
    'START-OF-SELECTION.',
    '  SELECT matnr, werks FROM marc INTO TABLE @DATA(lt_marc).',
    "  UPDATE ekko SET loekz = 'L' WHERE ebeln = p_ebeln.",
    '  SELECT SINGLE lifnr FROM ekko INTO @DATA(lv_lifnr) WHERE ebeln = @p_ebeln.',
  );
  expect(satzAn(code, 4).join(' ')).toContain('material number and plant');
  // EKKO's business name is "purchase order", and with a key "the specified".
  expect(satzAn(code, 5).join(' ')).toContain('of the specified purchase order');
  expect(satzAn(code, 6).join(' ')).toContain('supplier number of the purchase order');
});

test('F11/F4 — chained output in a branch without a second sentence; a dialog call is not a database operation', () => {
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

  // QA cb41c1e00bc0: that no list sentence is left is not enough — the chain
  // must stand in the branch sentence, whole, with its condition, and exactly once.
  const an5 = buildBusinessStatements(code).filter((s) => s.anchors.some((a) => a.lineStart === 5));
  const zweig = an5.filter((s) => s.grain === 'group');
  expect(zweig.length, 'exactly one branch sentence carries the chain').toBe(1);
  expect(zweig[0].text).toMatch(/^If the field p_test is set, /);
  for (const wert of ['the material number', 'the plant', 'TEST']) expect(zweig[0].text).toContain(`${wert} is output`);
  expect(zweig[0].text).toContain('the loop pass is skipped');
  // Beside it, line 5 carries at most the sentence about the output literal —
  // no column of the chain a second time without its condition.
  const daneben = an5.filter((s) => s.grain === 'statement').map((s) => s.text);
  expect(daneben.filter((text) => /material number|plant/.test(text))).toEqual([]);
  expect(daneben).toEqual(['TEST is output. The output only proves that this point in the code was reached.']);
});

test('QA d7a7d3a66683 — "nothing is written" only where source order is execution order', () => {
  const waechter = (...z: string[]) => satzAn(quelle(...z), z.findIndex((zeile) => /IF p_stop/.test(zeile)) + 1).join(' ');
  const danach = ['  IF p_stop = abap_true.', '    RETURN.', '  ENDIF.'];

  // Supported: one program, an event that runs once, nothing before it. Also
  // with a second IF that writes only on the other path — whoever sets p_stop
  // never reaches it.
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
  // In a loop, an earlier pass has already written.
  ohneAussage(
    'loop',
    waechter(
      'REPORT z_d7b.',
      'START-OF-SELECTION.',
      '  LOOP AT gt_kunden INTO gs_kunde.',
      ...danach,
      "    UPDATE kna1 SET sperr = 'X' WHERE kunnr = gs_kunde-kunnr.",
      '  ENDLOOP.',
    ),
  );
  // A call before the guard can write — here it does.
  ohneAussage(
    'PERFORM before',
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
  // An event that stands **before** the guard in the source has already written.
  ohneAussage(
    'INITIALIZATION before',
    waechter(
      'REPORT z_d7d.',
      'INITIALIZATION.',
      '  DELETE FROM zlog WHERE datum < sy-datum.',
      'START-OF-SELECTION.',
      ...danach,
      "  UPDATE kna1 SET loevm = 'X' WHERE kunnr = '1'.",
    ),
  );
  // An event that runs repeatedly: the previous user command has written.
  ohneAussage(
    'AT USER-COMMAND',
    waechter('REPORT z_d7e.', 'AT USER-COMMAND.', ...danach, "  UPDATE zbeleg SET status = 'X' WHERE id = gv_id."),
  );
  // An include without REPORT returns to a caller that carries on.
  ohneAussage('include', waechter(...danach, "UPDATE zbeleg SET status = 'X' WHERE id = gv_id."));
});

test('QA b7e191a72212 — a local effect only when the receiver is the local class', () => {
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

  // A foreign class: not the local `save` that happens to share the name.
  for (const fremd of [zeile(1), zeile(2)]) {
    expect(fremd).toContain('The method save of lo_fremd is called');
    expect(fremd).not.toContain('ZLOG');
    expect(fremd).toContain('not evidenced in the supplied code');
  }
  // A local child class inherits `save` — the effect is its own.
  expect(zeile(3)).toContain('The method save of lo_kind is called; it changes ZLOG');
  // An object without a declaration: which implementation runs is open — no effect.
  expect(zeile(4)).not.toContain('ZLOG');
  expect(zeile(4)).toContain('Which implementation of save runs here');

  // And the negative statement on the database change before it: a foreign
  // call afterwards can commit, so no "no COMMIT WORK".
  const mitFremd = quelle(...klassen, "  UPDATE zbeleg SET status = 'X' WHERE id = gv_id.", '  lo_fremd->save( ).');
  expect(satzAn(mitFremd, klassen.length + 1).join(' ')).not.toContain('no COMMIT WORK');
  const mitLokal = quelle(...klassen, "  UPDATE zbeleg SET status = 'X' WHERE id = gv_id.", '  lo_kind->save( ).');
  expect(satzAn(mitLokal, klassen.length + 1).join(' ')).toContain('no COMMIT WORK');
});

test('QA 594357222bd7 — a flag without a guessed gender, in the branch and in the guard', () => {
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
  // A field the glossary knows goes by its business term.
  expect(satzAn(code, 10).join(' ')).toContain('If the deletion flag is set');
});

test('QA b8f597730411 — SELECT … WHERE states its restriction, MESSAGE … INTO in a branch outputs nothing', () => {
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
  // Without WHERE no restriction is invented.
  expect(satzAn(code, 5).join(' ')).toBe('Records from zbeleg are selected.');
  const schleife = satzAn(code, 6).join(' ');
  expect(schleife).toContain('with the entered status');
  expect(schleife).not.toMatch(/\b(?:all|each|every)\b/i);

  // In the branch sentence, MESSAGE … INTO stays a placement, not an output.
  const zweig = buildBusinessStatements(code).filter((s) => s.grain === 'group' && s.anchors.some((a) => a.lineStart === 10));
  expect(zweig.length).toBe(1);
  expect(zweig[0].text).toContain('the message text is placed in gv_text');
  expect(zweig[0].text).not.toMatch(/is output|is displayed/);
});

test('QA 23c5c0362148 — a copy of sy-subrc carries the meaning of its setting statement for as long as it holds', () => {
  const pruefung = (...zeilen: string[]) =>
    satzAn(quelle('FORM probe.', ...zeilen, '  IF lv_rc <> 0.', '    RETURN.', '  ENDIF.', 'ENDFORM.'), zeilen.length + 2).join(' ');
  const auth = "  AUTHORITY-CHECK OBJECT 'Z_BELEG' ID 'ACTVT' FIELD '02'.";
  const lesen = '  SELECT SINGLE name1 FROM zkunde INTO @DATA(lv_name) WHERE id = @gv_id.';

  // The copy after an authorization check: no "hits".
  const kopie = pruefung(auth, '  lv_rc = sy-subrc.');
  expect(kopie).toContain('Without authorization for Z_BELEG, the block is exited');
  expect(kopie).not.toMatch(/\bhits?\b/);
  expect(pruefung(auth, '  DATA(lv_rc) = sy-subrc.')).toContain('Without authorization for Z_BELEG');

  // A read **after** the copy changes sy-subrc, not the copy.
  const danachGelesen = pruefung(auth, '  lv_rc = sy-subrc.', lesen);
  expect(danachGelesen).toContain('Without authorization for Z_BELEG');
  expect(danachGelesen).not.toMatch(/\bhits?\b/);

  // Copied after the read: then they are hits.
  expect(pruefung(auth, lesen, '  lv_rc = sy-subrc.')).toContain('Without a hit');

  // Overwritten, cleared or copied only in a branch: the variable no longer
  // (reliably) holds the sy-subrc — the sentence stays neutral.
  for (const [label, ...zeilen] of [
    ['overwritten', auth, '  lv_rc = sy-subrc.', '  lv_rc = gv_anderes.'],
    ['cleared', auth, '  lv_rc = sy-subrc.', '  CLEAR lv_rc.'],
    ['in a branch', auth, '  IF gv_modus = 1.', '    lv_rc = sy-subrc.', '  ENDIF.'],
    ['from a call', auth, '  lv_rc = sy-subrc.', "  CALL FUNCTION 'Z_PRUEFEN' IMPORTING ev_rc = lv_rc."],
  ]) {
    const text = pruefung(...zeilen);
    expect(text, label).toContain('If the field lv_rc is not 0');
    expect(text, label).not.toMatch(/authorization for Z_BELEG, the block|\bhits?\b/);
  }
});
