import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { assessCoverage } from '../lib/abap/coverage';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel, type ProcessMapModel } from '../lib/process-map';
import { STATE_LABELS, type ElementState, type ProcessStates, type StateEntry } from '../lib/process-states';
import { NEED_WITHOUT_CODE } from '../lib/process-target';
import {
  NOT_DETERMINED,
  buildProcessBrief,
  briefStatements,
  type BriefStatement,
  type ProcessBrief,
} from '../lib/brief/model';
import { PROVENANCE } from '../lib/provenance';
import { briefBlocks, briefPdf } from '../lib/brief/pdf';
import { readPdfText, wrapText, textWidth } from '../lib/brief/pdf-writer';
import { buildBriefPackage } from '../lib/brief/package';

/**
 * The Kurzbrief — roadmap 4.4.
 *
 * Without a server and without a browser: the brief is a pure derivation over a
 * reconstructed process, the rules, the coverage sweep and the confirmations,
 * and what it says must not depend on a route, a store or a render.
 *
 * The Ist is built out of real ABAP through 2.6 and 2.4 rather than written out
 * as a fixture object — same reason as `tests/process-target.spec.ts`: a
 * hand-built model would let a wrong derivation pass by agreeing with itself.
 * The fixture is chosen so that all four cases the brief has to tell apart are
 * really in it: elements with a line range, an element without one, a statement
 * whose table is named at runtime, and a subject that exists only in the target.
 *
 * Nothing here samples. The completeness assertion walks **every** statement of
 * **every** section, and the count it asserts against is the brief's own.
 */

const ROOT = path.resolve(__dirname, '..');
const FILE_NAME = 'Z_BRIEF_FIXTURE.abap';

/** Line feeds only: the same bytes here and in CI (`CLAUDE.md`, gotchas). */
const FIXTURE = [
  'REPORT z_brief_fixture.',                        //  1
  '',                                               //  2
  'CONSTANTS lc_limit TYPE p VALUE 5000.',          //  3
  '',                                               //  4
  'START-OF-SELECTION.',                            //  5
  '  PERFORM check_limit.',                         //  6
  '  PERFORM read_table.',                          //  7
  '  PERFORM post_document.',                       //  8
  '',                                               //  9
  'FORM check_limit.',                              // 10
  "  IF lv_amount > '5000'.",                       // 11
  '    MESSAGE e001(zmm).',                         // 12
  '  ELSE.',                                        // 13
  "    UPDATE zmm_log SET note = 'ok'.",            // 14
  '  ENDIF.',                                       // 15
  'ENDFORM.',                                       // 16
  '',                                               // 17
  'FORM read_table.',                               // 18
  '  SELECT * FROM (lv_table) INTO TABLE lt_rows.', // 19 — target named at runtime
  'ENDFORM.',                                       // 20
  '',                                               // 21
  'FORM post_document.',                            // 22
  "  IF lv_kind = 'A'.",                            // 23
  '    INSERT INTO zmm_doc VALUES ls_row.',         // 24
  '  ELSE.',                                        // 25
  "    UPDATE zmm_doc SET flag = 'X'.",             // 26
  '  ENDIF.',                                       // 27
  "  CALL FUNCTION 'Z_SEND_MAIL'.",                 // 28
  '',                                               // 29 — no ENDFORM: the end of
].join('\n');                                       //      this routine has nothing to anchor to

const LINES = FIXTURE.split('\n').length;
const GENERATED_AT = '2026-09-18T08:00:00.000Z';
const SONNY = { uid: 'uid-sonny', name: 'Sonny Frenzel' };

function bpmn() {
  return buildBpmnExportFromSource(FIXTURE, {
    processName: 'Emergency purchase approval',
    sourceFileName: FILE_NAME,
  });
}

function istModel(): ProcessMapModel {
  const named = applyNaming(namingContextOf(FIXTURE), null, 'no-key');
  return buildProcessMapModel({ bpmn: bpmn(), named, fileName: FILE_NAME });
}

function entry(subject: string, state: ElementState, kind: 'element' | 'rule' = 'element'): StateEntry {
  return {
    subject,
    kind,
    state,
    note: state === 'change' || state === 'drop' ? 'Decided on 18.09.' : null,
    account: SONNY,
    confirmedAt: '2026-09-18T09:30:00.000Z',
    revision: 2,
  };
}

/** 3.5's record, assembled the way its store will: absent means undecided. */
function states(...entries: StateEntry[]): ProcessStates {
  const bySubject: Record<string, StateEntry> = {};
  for (const e of entries) bySubject[e.subject] = e;
  const counts = { keep: 0, change: 0, drop: 0, clarify: 0, undecided: 0 };
  for (const e of entries) counts[e.state] += 1;
  return { bySubject, counts };
}

function brief(confirmed: ProcessStates | null = null): ProcessBrief {
  const map = istModel();
  return buildProcessBrief({
    map,
    stats: bpmn().stats,
    rules: deriveBusinessRules(FIXTURE),
    coverage: assessCoverage(FIXTURE),
    states: confirmed,
  });
}

/** The first element that carries a line range, and the first that does not. */
function anchoredId(map: ProcessMapModel): string {
  const element = map.elements.find((e) => e.anchor !== null);
  if (!element) throw new Error('the fixture draws nothing with a line range');
  return element.id;
}

function unanchoredId(map: ProcessMapModel): string {
  const element = map.elements.find((e) => e.anchor === null);
  if (!element) throw new Error('the fixture draws nothing without a line range');
  return element.id;
}

/** Text with every space taken out — survives both wrapping and a hard break. */
const squash = (text: string) => text.replace(/\s+/g, '');

/* ------------------------------------------------------------------ */

test.describe('the fixture really holds the four cases', () => {
  test('anchored and unanchored elements, a runtime target, and rules', () => {
    const map = istModel();
    expect(map.elements.filter((e) => e.anchor !== null).length).toBeGreaterThan(3);
    expect(map.elements.filter((e) => e.anchor === null).length).toBeGreaterThan(0);
    expect(
      assessCoverage(FIXTURE).unassessed.filter((c) => c.gap === 'dynamic-target').length,
      'the fixture has to contain a table named at runtime',
    ).toBeGreaterThan(0);
    expect(deriveBusinessRules(FIXTURE).rules.length).toBeGreaterThan(0);
  });
});

test.describe('every statement is anchored or says it is not determined', () => {
  test('over all of them, in every section — not a sample', () => {
    const made = brief(states(entry(anchoredId(istModel()), 'keep')));
    const all = briefStatements(made);

    expect(all.length, 'nothing to walk — the assertion would be vacuous').toBeGreaterThan(20);
    expect(all.length, 'the walk and the brief must count the same statements').toBe(made.counts.statements);
    expect(made.sections.map((s) => s.key)).toEqual(['picture', 'rules', 'questions']);

    const offenders: string[] = [];
    for (const statement of all) {
      const anchored = statement.anchors.length > 0;
      const named = statement.undetermined !== null;
      if (anchored === named) {
        offenders.push(`${statement.id} — anchors: ${statement.anchors.length}, undetermined: ${named}`);
        continue;
      }
      if (statement.evidence.trim() === '') offenders.push(`${statement.id} — no evidence line`);
      if (!anchored && !statement.evidence.startsWith(NOT_DETERMINED)) {
        offenders.push(`${statement.id} — unanchored but the evidence line does not say so`);
      }
      if (anchored && statement.evidence.startsWith(NOT_DETERMINED)) {
        offenders.push(`${statement.id} — anchored but the evidence line says it is not determined`);
      }
      if (!anchored && (statement.undetermined?.reason ?? '').trim() === '') {
        offenders.push(`${statement.id} — not determined, and no reason given`);
      }
      for (const anchor of statement.anchors) {
        if (!Number.isInteger(anchor.lineStart) || !Number.isInteger(anchor.lineEnd)) {
          offenders.push(`${statement.id} — anchor is not a pair of line numbers`);
        } else if (anchor.lineStart < 1 || anchor.lineEnd < anchor.lineStart || anchor.lineEnd > LINES) {
          offenders.push(`${statement.id} — anchor ${anchor.lineStart}..${anchor.lineEnd} is not in the file`);
        }
      }
    }
    expect(offenders, `statements without an anchor and without a word for it:\n${offenders.join('\n')}`).toEqual([]);

    expect(made.counts.anchored + made.counts.undetermined).toBe(made.counts.statements);
    expect(made.counts.anchored).toBe(all.filter((s) => s.anchors.length > 0).length);
    // Both kinds are really in there, so neither branch above is untested.
    expect(made.counts.anchored).toBeGreaterThan(0);
    expect(made.counts.undetermined).toBeGreaterThan(0);
  });

  test('every element the map draws is in the picture, anchored or named', () => {
    const map = istModel();
    const picture = brief().sections[0];
    expect(picture.statements.map((s) => s.subject)).toEqual(map.elements.map((e) => e.id));
    for (const element of map.elements) {
      const statement = picture.statements.find((s) => s.subject === element.id);
      expect(statement, `${element.id} is not in the brief`).toBeTruthy();
      expect(statement!.anchors.length > 0).toBe(element.anchor !== null);
    }
  });

  test('a rule sentence carries the anchors the rule reader gave it', () => {
    const rules = deriveBusinessRules(FIXTURE);
    const first = rules.rules[0];
    const statements = brief().sections[1].statements.filter((s) => s.subject === first.id);
    // One statement per sentence, plus the one that says where the rule decides.
    expect(statements.length).toBe(first.sentences.length + 1);
    expect(statements[0].anchors).toEqual(
      first.sentences[0].anchors.map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd })),
    );
  });
});

test.describe('the traceability quote is carried, never recomputed', () => {
  test('the three counts come from the export', () => {
    const stats = bpmn().stats;
    const made = brief();
    expect(made.traceability.flowNodes).toBe(stats.flowNodes);
    expect(made.traceability.anchored).toBe(stats.anchored);
    expect(made.traceability.unanchored).toBe(stats.unanchored);
    expect(made.traceability.percent).toBe(istModel().traceability.percent);
    expect(made.traceability.sentence).toBe(istModel().traceability.sentence);
  });

  test('and the document prints no percentage the map did not produce', () => {
    const made = brief(states(entry(anchoredId(istModel()), 'keep')));
    const text = readPdfText(briefPdf(made, { generatedAt: GENERATED_AT }));
    const percentages = [...text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => m[1]);
    expect(percentages.length, 'the quote has to be in the document at all').toBeGreaterThan(0);
    const allowed = made.traceability.percent === null ? [] : [made.traceability.percent.toFixed(1)];
    expect(
      [...new Set(percentages)].filter((value) => !allowed.includes(value)),
      'a percentage in the brief that the map never measured',
    ).toEqual([]);
  });
});

test.describe('a need without code gets no anchor — C23-A06', () => {
  test('not from a neighbour, not from a parent, not at all', () => {
    const map = istModel();
    const drawn = entry('Need_credit_check', 'clarify');
    const made = brief(states(entry(anchoredId(map), 'keep'), drawn));

    const statement = briefStatements(made).find((s) => s.subject === 'Need_credit_check');
    expect(statement, 'the need is missing from the brief').toBeTruthy();
    expect(statement!.anchors).toEqual([]);
    expect(statement!.undetermined?.reason).toBe(NEED_WITHOUT_CODE);
    expect(statement!.evidence).toContain(NOT_DETERMINED);
    expect(statement!.evidence, 'a line number was borrowed from somewhere').not.toMatch(/\bline[s]? \d/);

    // And the anchored neighbour still has its own, so the assertion above is
    // not passing because nothing anywhere carries an anchor.
    const neighbour = briefStatements(made).find((s) => s.subject === anchoredId(map));
    expect(neighbour!.anchors.length).toBeGreaterThan(0);
  });
});

test.describe('clarify and undecided stay two facts', () => {
  test('counted apart and worded apart', () => {
    const map = istModel();
    const asked = anchoredId(map);
    const made = brief(states(entry(asked, 'clarify')));
    const questions = made.sections[2];

    const clarified = questions.statements.find((s) => s.subject === asked);
    expect(clarified, 'the subject somebody asked about is missing').toBeTruthy();
    expect(clarified!.text).toContain('clarified');
    expect(clarified!.text).toContain(SONNY.name);

    // The element the reconstruction found no line for is a question of its own.
    const where = questions.statements.find(
      (s) => s.subject === unanchoredId(map) && s.text.startsWith('Where does'),
    );
    expect(where, 'an element without a line anchor is not asked about').toBeTruthy();
    expect(where!.anchors).toEqual([]);

    const undecided = questions.statements.filter((s) => s.text.includes('nobody has said anything'));
    expect(undecided.length, 'the fixture has subjects nobody spoke about').toBeGreaterThan(0);
    for (const statement of undecided) {
      expect(statement.text, 'an undecided subject was worded as a question somebody asked').not.toContain('clarified');
    }

    // Two numbers in the lead, and each one has to match its own list of
    // statements. One number for both would satisfy a looser assertion.
    const asksFor = /(\d+) asked to be clarified/.exec(questions.lead);
    const nobody = /(\d+) nobody has decided/.exec(questions.lead);
    expect(asksFor, 'the lead does not count what was asked about').toBeTruthy();
    expect(nobody, 'the lead does not count what nobody decided').toBeTruthy();
    expect(Number(asksFor![1])).toBe(1);
    expect(Number(nobody![1])).toBe(undecided.length);
    expect(Number(nobody![1]), 'the two counts are the same number').not.toBe(Number(asksFor![1]));
    expect(questions.statements.filter((s) => s.text.includes('clarified')).length).toBe(1);
  });

  test('a statement an account confirmed carries who said so and when', () => {
    const map = istModel();
    const kept = anchoredId(map);
    const made = brief(states(entry(kept, 'change')));
    const statement = briefStatements(made).find((s) => s.subject === kept);
    expect(statement!.confirmation).toBeTruthy();
    expect(statement!.confirmation!.label).toBe('Change deliberately');
    expect(statement!.confirmation!.account).toBe(SONNY.name);
    expect(statement!.confirmation!.revision).toBe(2);
    // And it is a property of the statement, never a statement of its own.
    expect(briefStatements(made).some((s) => s.text.startsWith('Confirmed:'))).toBe(false);
  });
});

test.describe('the download holds the PDF and the BPMN', () => {
  test('two files, and the BPMN is the export byte for byte', () => {
    const exported = bpmn();
    const pack = buildBriefPackage({
      brief: brief(),
      bpmnXml: exported.xml,
      name: 'Emergency purchase approval_Process',
      generatedAt: GENERATED_AT,
    });

    expect(pack.files.length).toBe(2);
    expect(pack.name).toMatch(/-brief\.zip$/);
    expect(pack.files[0].name).toMatch(/-brief\.pdf$/);
    expect(pack.files[1].name).toMatch(/\.bpmn$/);
    // Identity, not equivalence: the same string the export returned.
    expect(pack.files[1].data).toBe(exported.xml);
    expect(pack.files[0].data).toBeInstanceOf(Uint8Array);
  });

  test('the PDF is a PDF, and every statement is in it', () => {
    const made = brief(states(entry(anchoredId(istModel()), 'keep'), entry('Need_credit_check', 'clarify')));
    const bytes = briefPdf(made, { generatedAt: GENERATED_AT });

    const head = Array.from(bytes.slice(0, 8)).map((b) => String.fromCharCode(b)).join('');
    expect(head).toBe('%PDF-1.4');
    const tail = Array.from(bytes.slice(-6)).map((b) => String.fromCharCode(b)).join('');
    expect(tail).toBe('%%EOF\n');
    expect(bytes.length).toBeGreaterThan(4000);

    const flat = squash(readPdfText(bytes));
    const missing = briefStatements(made)
      .filter((s) => !flat.includes(squash(s.text)) || !flat.includes(squash(s.evidence)))
      .map((s) => s.id);
    expect(missing, `statements that never reached the page:\n${missing.join(', ')}`).toEqual([]);

    // The head matter too, so nobody can read the document without reading what
    // it is and what it is not.
    expect(flat).toContain(squash(made.disclaimer));
    expect(flat).toContain(squash(made.traceability.sentence));
    for (const section of made.sections) expect(flat).toContain(squash(section.title));
  });

  test('every page is numbered, and the pages are counted', () => {
    const bytes = briefPdf(brief(), { generatedAt: GENERATED_AT });
    const text = readPdfText(bytes);
    const numbers = [...text.matchAll(/^(\d+) \/ (\d+)$/gm)];
    expect(numbers.length, 'no page number reached the document').toBeGreaterThan(1);
    const total = Number(numbers[0][2]);
    expect(numbers.length).toBe(total);
    expect(numbers.map((m) => Number(m[1]))).toEqual(
      Array.from({ length: total }, (_, i) => i + 1),
    );
    // And the page tree says the same number.
    const latin = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
    expect(latin).toContain('/Type /Pages /Kids [ ');
    expect(latin).toContain(`/Count ${total}`);
  });

  test('the same brief and the same time give the same bytes', () => {
    const made = brief(states(entry(anchoredId(istModel()), 'keep')));
    const first = briefPdf(made, { generatedAt: GENERATED_AT });
    const second = briefPdf(brief(states(entry(anchoredId(istModel()), 'keep'))), { generatedAt: GENERATED_AT });
    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
  });
});

test.describe('the typesetter keeps text inside the column', () => {
  test('no wrapped line is wider than the column, and a long name is broken', () => {
    const width = 483;
    const long = 'ZCL_MM_PURCHASE_REQUISITION_RELEASE_STRATEGY_DETERMINATION_HANDLER_IMPLEMENTATION_FOR_PLANT_1000';
    for (const line of wrapText(`A step named ${long} and some words after it.`, width, 9.5, false)) {
      expect(textWidth(line, 9.5, false)).toBeLessThanOrEqual(width);
    }
    expect(wrapText(long, width, 9.5, false).length, 'a word wider than the column has to be broken').toBeGreaterThan(1);
  });
});

test.describe('the brief is a summary and never evidence', () => {
  test('nothing signed imports it', () => {
    const signed = [
      'lib/audit-pack.ts',
      'lib/audit-pack-build.ts',
      'lib/audit-pack-canonical.ts',
      'app/api/audit-pack/create/route.ts',
      'app/api/runs/create/route.ts',
      'app/api/export/sign/route.ts',
    ];
    for (const rel of signed) {
      const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(source, `${rel} reaches into the brief`).not.toContain('lib/brief');
    }
  });

  test('and the brief says so on its own first page', () => {
    const made = brief();
    expect(made.disclaimer).toContain('no audit pack');
    const flat = squash(readPdfText(briefPdf(made, { generatedAt: GENERATED_AT })));
    expect(flat).toContain(squash('It is not evidence'));
  });
});

test.describe('the brief speaks the one provenance vocabulary', () => {
  /**
   * `lib/provenance.ts` is the nine-value list of `DESIGN.md` §4, and the reason
   * it exists is that the product once wrote provenance freehand: nine concepts,
   * about twenty spellings, "Model estimate" beside "AI Generated" beside
   * "Signed off". The chips were fixed by `CcProvenanceChip`, which has no
   * `label` prop and therefore cannot be told a wrong word.
   *
   * The brief is the first thing that prints provenance into a **file a third
   * party keeps**, and it does not go through a chip — `lib/brief/model.ts` and
   * `lib/brief/pdf.ts` spell the words out. Today they match the list exactly.
   * Nothing made them match and nothing would notice if they stopped: a PDF
   * saying "Nicht bestimmt" or "AI-generated" while every screen says "Not
   * determined" and "Model proposal" is the old failure told once more, in the
   * one artefact that leaves the building and outlives the screen.
   *
   * So the words are compared against the list itself, not against a copy of
   * them. `cc-provenance-guard.spec.ts` walks the component directories and does
   * not reach `lib/brief`; this is that guard for the document.
   */
  const stated = (text: string): BriefStatement => ({
    id: 'picture-x-0',
    subject: 'x',
    text,
    anchors: [],
    undetermined: { label: NOT_DETERMINED, reason: 'the engine established no line range' },
    evidence: `${NOT_DETERMINED} — the engine established no line range`,
    origin: 'model-proposal',
    confirmation: {
      state: 'keep' as ElementState,
      label: STATE_LABELS.keep,
      account: 'someone@example.com',
      confirmedAt: '2026-09-23T10:00:00.000Z',
      revision: 2,
      note: null,
    },
  });

  test('the word for a statement without lines is the list\'s word', () => {
    expect(NOT_DETERMINED).toBe(PROVENANCE['not-determined'].label);

    // And it reaches the page: the constant could be right while the document
    // printed something else around it.
    const flat = squash(readPdfText(briefPdf(brief(), { generatedAt: GENERATED_AT })));
    expect(flat).toContain(squash(PROVENANCE['not-determined'].label));
  });

  test('a model proposal and a confirmation are named as the list names them', () => {
    const made = brief();
    const one: ProcessBrief = {
      ...made,
      sections: made.sections.map((section, i) =>
        i === 0 ? { ...section, statements: [stated('Release the requisition')] } : { ...section, statements: [] },
      ),
    };
    const lines = briefBlocks(one, { generatedAt: GENERATED_AT }).map((b) => b.text);

    const proposal = lines.find((line) => /proposal/i.test(line));
    expect(proposal, 'the document no longer labels a model proposal at all').toBeTruthy();
    expect(
      (proposal as string).startsWith(PROVENANCE.proposed.label),
      `the document says "${proposal}" where the list says "${PROVENANCE.proposed.label}"`,
    ).toBe(true);

    const confirmation = lines.find((line) => /someone@example\.com/.test(line));
    expect(confirmation, 'the confirmation line vanished').toBeTruthy();
    expect(
      (confirmation as string).startsWith(PROVENANCE.confirmed.label),
      `the document says "${confirmation}" where the list says "${PROVENANCE.confirmed.label}"`,
    ).toBe(true);
  });
});
