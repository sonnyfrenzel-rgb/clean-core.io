import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readProcess, readTableAccess, traceabilityOf } from '../lib/first-look';
import { deriveBusinessRules, deriveBusinessRulesFrom } from '../lib/abap/business-rule-set';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { readDemoSwitches } from '../lib/abap/demo-switches';
import { readProgramDomain } from '../lib/abap/program-domain';
import { applyNaming } from '../lib/process-naming';
import { notDetermined } from '../lib/workspace-model';
import { buildBusinessCard, plainWordingFor, programInputsOf } from '../lib/business-card';
import { humaniseField, plainContext } from '../lib/abap/plain-language';
import { processChanges, processStory, type ProcessStory, type StoryChange } from '../lib/process-story';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { businessInShort, programSummary } from '../lib/program-summary-text';
import { openingDecisions, type OpeningDecisions } from '../lib/first-look-plain';
import {
  firstLookPlainSentences,
  isPlainScope,
  plainItemsOf,
  plainLookup,
  plainDigestOf,
  validatePlainWording,
  type PlainWordingRecord,
} from '../lib/plain-wording';
import { readExample } from './helpers/starter-example-files';

/**
 * Roadmap 3.0.20, owner report 21.10.2026 — "ich verstehe überhaupt nicht als
 * business anwender was dieser code hier macht" about the first insights of his
 * goods-receipt / invoice check. The fixture has the same shape (a three-way
 * check through BAPIs, a demo-case CASE with 30 integer arms filling test
 * data, technical guards, 1e9 / 1e12 caps, status INPUT_REJECTED, reversal kind
 * REV, a CSV download); the program itself is not in the repo.
 *
 * Every new reading is behind the 3.0.20 gate (`ENGINE_READS_3020_FROM`): the
 * same source read for 3.0.19 gives the panel the owner saw, pinned here as
 * "before". Server-free: the engine and one static render.
 */

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'first-look', 'zmm-receipt-invoice-check.abap'), 'utf8').replace(/\r\n/g, '\n');
const BEFORE = '3.0.19';
const AFTER = '3.0.20';

/** The same fixture without a demo flag: the CASE is found by its shape alone (3.0.20, shape 5). */
const NO_FLAG = FIXTURE.replace(/^\s*p_demo AS CHECKBOX DEFAULT space,\n/m, '')
  .replace('  IF p_demo = abap_false.\n    RETURN.\n  ENDIF.\n', '')
  .replace('  IF p_demo = abap_false.\n    PERFORM read_documents.\n  ENDIF.\n', '  IF p_case = 0.\n    PERFORM read_documents.\n  ENDIF.\n');

interface Panel {
  inShort: string[];
  story: ProcessStory;
  decides: Array<{ text: string; anchor: string | null }>;
  decidesMore: number;
  technicalRules: number;
  changes: StoryChange[];
  opening: OpeningDecisions | null;
}

/** The panel's content as `FirstLook` builds it, for one engine version. */
function panelOf(source: string, version: string): Panel {
  const proc = readProcess(source);
  const rules = deriveBusinessRulesFrom(source, proc.facts, proc.skeleton, version);
  const card = buildBusinessCard({
    skeleton: proc.skeleton,
    ruleSet: rules,
    dependencies: readTableAccess(source),
    traceability: traceabilityOf(applyNaming(proc.context, null)),
    open: notDetermined(null),
    wording: plainWordingFor(source, proc.skeleton),
    inputs: programInputsOf(proc.facts, (n) => humaniseField(n, plainContext(source))),
  });
  const summary = programSummary(programSummaryFactsOf(source, { skeleton: proc.skeleton, ruleSet: rules, engineVersion: version }));
  const opening = version === AFTER ? openingDecisions(explainBusinessRules(source, rules, proc.facts, version)) : null;
  const ordered = [...card.featured, ...card.rules.filter((r) => !card.featured.some((f) => f.id === r.id))].filter((r) => r.sentence !== null).slice(0, 4);
  const legacy = ordered.map((r) => ({ text: r.sentence as string, anchor: r.anchors[0] ?? null }));
  return {
    inShort: businessInShort(summary, { codes: false }).map((l) => l.text),
    story: processStory(proc.skeleton, source, null, version),
    decides: opening ? opening.rules.map(({ text, anchor }) => ({ text, anchor })) : legacy,
    decidesMore: opening ? opening.more : card.rules.length - legacy.length,
    technicalRules: opening?.technical ?? 0,
    changes: processChanges(proc.skeleton, source, 5, version).changes,
    opening,
  };
}

test.describe('the owner\'s panel, before (3.0.19) — what he reported', () => {
  const before = panelOf(FIXTURE, BEFORE);

  test('In short says what kind of program it is, not what it is for', () => {
    expect(before.inShort[0]).toBe('A read-only report that reads no table by name, selected by document and year.');
  });

  test('the demo cases are step 1, and the checks are a wall of fragments', () => {
    expect(before.story.steps[0].text).toBe('Apply case');
    expect(before.story.steps[0].checks).toEqual(['Demo not selected', 'Case negative or above 31', 'Case']);
    expect(before.story.steps[1].checks.length).toBeGreaterThan(10);
    expect(before.story.testData).toBeUndefined();
  });

  test('"What it decides" leads with the demo case range, and it changes "the docline in the list"', () => {
    expect(before.decides[0].text).toBe('Case negative or above 31');
    expect(before.decidesMore).toBe(34);
    expect(before.changes.map((c) => c.text)).toEqual(['Update the docline in the list']);
  });
});

test.describe('the same panel from engine 3.0.20', () => {
  const after = panelOf(FIXTURE, AFTER);

  test('In short opens with what the program is for, from its names, and says how it gets its data', () => {
    expect(after.inShort.slice(0, 2)).toEqual([
      'Checks supplier invoices against purchase orders and goods receipts, within a tolerance.',
      'A read-only report that gets its data through SAP function calls on supplier invoices, purchase orders and goods movements, selected by document and year.',
    ]);
    // The changes sentence still stands: the purpose line did not say it.
    expect(after.inShort).toContain('It does not post or change data in SAP.');
    expect(after.inShort.join(' ')).not.toContain('reads no table by name');
  });

  test('the demo cases are set apart as a test data switch, not a step', () => {
    expect(after.story.steps.map((s) => s.text)).toEqual(['Evaluate', 'Show results', 'Download CSV']);
    expect(after.story.testData).toEqual({ anchor: 'L59', flag: 'P_DEMO', cases: 30 });
  });

  test('business checks in words, technical ones counted, stops in the program\'s own messages', () => {
    const [evaluate, show] = after.story.steps;
    expect(evaluate.checks).toEqual([
      'Failed or kind REV or reversed',
      'Quantity at most 0',
      'Diff above limit, or inv amount above purchase order amount',
    ]);
    expect(evaluate.technical).toBe(17);
    expect(evaluate.stops).toEqual(['no invoice document found', 'the goods receipt snapshot is not complete']);
    expect(show.checks).toEqual(['Status INPUT_REJECTED']);
    expect(show.technical).toBe(3);
    const all = after.story.steps.flatMap((s) => [...s.checks, ...s.stops]).join(' · ');
    for (const technical of ['Demo not selected', 'Case negative', 'Call failed', 'Code given', 'Dec negative', 'background run', 'Det selected']) {
      expect(all).not.toContain(technical);
    }
  });

  test('"What it decides" names business rules by what they do; caps and decimals are only counted', () => {
    expect(after.decides).toEqual([
      { text: 'Leaves out entries where failed or kind REV or reversed', anchor: 'L264' },
      { text: 'Gives cases with status INPUT_REJECTED their own handling', anchor: 'L311' },
    ]);
    expect(after.technicalRules).toBe(3);
    expect(after.decides.map((d) => d.text).join(' ')).not.toMatch(/1000000000|Case negative|Dec negative/);
  });

  test('"What it changes" says what each line of the result list is marked with', () => {
    expect(after.changes).toEqual([
      {
        text: 'Marks each document line of the result list with a status (input rejected, blocked for payment or matched) and a code (Q001, T001 or T002)',
        anchor: 'L266',
      },
    ]);
  });
});

test.describe('the demo switches (lib/abap/demo-switches.ts, 3.0.20 shapes 4 and 5)', () => {
  test('a FORM that opens with a guard on the demo flag is a demo routine; its case range and arms leave the rules', () => {
    const demo = readDemoSwitches(FIXTURE, AFTER);
    expect(demo?.flag.name).toBe('P_DEMO');
    expect(demo?.routines).toContain('APPLY_CASE');
    expect(demo?.cases.map((c) => [c.selector, c.arms])).toEqual([['P_CASE', 30]]);
    const set = deriveBusinessRules(FIXTURE, AFTER);
    expect(set.rules.map((r) => r.label).join(' | ')).not.toMatch(/p_case/i);
    expect(set.demoCases?.rules.length).toBe(31);
    // Before 3.0.20 nothing of this was read.
    expect(readDemoSwitches(FIXTURE, BEFORE)).toBeNull();
    expect(deriveBusinessRules(FIXTURE, BEFORE).rules.some((r) => /p_case < 0 OR p_case > 31/i.test(r.label))).toBe(true);
  });

  test('without a demo flag, a CASE whose integer arms only fill test data is a test data switch', () => {
    expect(NO_FLAG).not.toMatch(/p_demo/i);
    const demo = readDemoSwitches(NO_FLAG, AFTER);
    expect(demo?.flag.name).toBe('P_CASE');
    expect(demo?.routines).toEqual(['APPLY_CASE']);
    expect(deriveBusinessRules(NO_FLAG, AFTER).rules.map((r) => r.label).join(' | ')).not.toMatch(/p_case/i);
    expect(readDemoSwitches(NO_FLAG, BEFORE)).toBeNull();
  });

  test('a CASE that dispatches to routines is not test data, however many integer arms it has', () => {
    const arms = [1, 2, 3, 4, 5, 6].map((n) => `    WHEN ${n}.\n      PERFORM step_${n} USING 'A'.`).join('\n');
    const forms = [1, 2, 3, 4, 5, 6].map((n) => `FORM step_${n} USING iv TYPE c.\n  WRITE iv.\nENDFORM.`).join('\n');
    const source = `REPORT zdispatch.\nPARAMETERS p_mode TYPE i.\nSTART-OF-SELECTION.\n  PERFORM run.\nFORM run.\n  CASE p_mode.\n${arms}\n  ENDCASE.\nENDFORM.\n${forms}\n`;
    expect(readDemoSwitches(source, AFTER)).toBeNull();
  });

  // A switch whose arms put rows into tables, written five times over.
  const switchOf = (arm: (n: number) => string) => {
    const arms = [1, 2, 3, 4, 5].map((n) => `    WHEN ${n}.\n${arm(n)}`).join('\n');
    return `REPORT zcases.\nPARAMETERS p_case TYPE i.\nDATA: lt_rows TYPE TABLE OF zrow, ls_row TYPE zrow, ls_in TYPE zrow.\nSTART-OF-SELECTION.\n  SELECT SINGLE * FROM zrow INTO ls_in.\n  PERFORM apply_case.\nFORM apply_case.\n  CASE p_case.\n${arms}\n  ENDCASE.\nENDFORM.\n`;
  };

  test('rows of literals are test data: a VALUE of literals, or a work area the same arm fills from literals', () => {
    const literalValue = switchOf((n) => `      APPEND VALUE #( id = ${n} name = 'Case ${n}' ) TO lt_rows.`);
    expect(readDemoSwitches(literalValue, AFTER)?.flag.name).toBe('P_CASE');
    const filledArea = switchOf((n) => `      CLEAR ls_row.\n      ls_row-id = ${n}.\n      ls_row-name = 'Case ${n}'.\n      APPEND ls_row TO lt_rows.`);
    expect(readDemoSwitches(filledArea, AFTER)?.flag.name).toBe('P_CASE');
  });

  test('a row the program read, or a write to the database, is not test data however the arms are shaped', () => {
    // Appends what the program selected: business data, not a test case.
    expect(readDemoSwitches(switchOf(() => `      APPEND ls_in TO lt_rows.`), AFTER)).toBeNull();
    // A database write in every arm.
    expect(readDemoSwitches(switchOf((n) => `      ls_row-id = ${n}.\n      INSERT zrow FROM ls_row.`), AFTER)).toBeNull();
    expect(readDemoSwitches(switchOf((n) => `      ls_row-id = ${n}.\n      INSERT INTO zrow VALUES ls_row.`), AFTER)).toBeNull();
    // A VALUE that carries a field of what was read.
    expect(readDemoSwitches(switchOf((n) => `      APPEND VALUE #( id = ${n} name = ls_in-name ) TO lt_rows.`), AFTER)).toBeNull();
  });

  test('literals handed to a routine are test data only when the routine keeps them in memory', () => {
    const withForm = (body: string) =>
      `${switchOf((n) => `      PERFORM add_row USING '${n}' 'Case ${n}' 'A'.`)}FORM add_row USING iv_id TYPE c iv_name TYPE c iv_kind TYPE c.\n${body}ENDFORM.\n`;
    // Builds a row and appends it: test data.
    expect(readDemoSwitches(withForm('  CLEAR ls_row.\n  ls_row-id = iv_id.\n  APPEND ls_row TO lt_rows.\n'), AFTER)?.flag.name).toBe('P_CASE');
    // Creates a record, commits, or calls out: a business branch, however literal its arguments.
    expect(readDemoSwitches(withForm('  ls_row-id = iv_id.\n  INSERT zrow FROM ls_row.\n'), AFTER)).toBeNull();
    expect(readDemoSwitches(withForm('  ls_row-id = iv_id.\n  APPEND ls_row TO lt_rows.\n  COMMIT WORK.\n'), AFTER)).toBeNull();
    expect(readDemoSwitches(withForm("  CALL FUNCTION 'Z_CREATE_ORDER' EXPORTING iv_id = iv_id.\n"), AFTER)).toBeNull();
    // A method on the right of an assignment can do anything: not a value.
    expect(readDemoSwitches(withForm("  ls_row-id = zcl_orders=>create( iv_id ).\n  APPEND ls_row TO lt_rows.\n"), AFTER)).toBeNull();
    // Written on one line, the routine's statements are still read.
    const oneLine = `${switchOf((n) => `      PERFORM add_row USING '${n}' 'Case ${n}' 'A'.`)}FORM add_row USING iv_id TYPE c iv_name TYPE c iv_kind TYPE c. INSERT zrow FROM ls_row. ENDFORM.\n`;
    expect(readDemoSwitches(oneLine, AFTER)).toBeNull();
    // Decides and reports in memory: logic, not a row of data.
    expect(readDemoSwitches(withForm("  READ TABLE lt_rows INTO ls_row WITH KEY id = iv_id.\n  IF sy-subrc <> 0.\n    MESSAGE 'missing' TYPE 'I'.\n  ENDIF.\n"), AFTER)).toBeNull();
    // A routine this upload does not contain is not known to keep anything in memory.
    expect(readDemoSwitches(switchOf((n) => `      PERFORM add_row IN PROGRAM zother USING '${n}' 'Case ${n}' 'A'.`), AFTER)).toBeNull();
  });

  test('the process documentation reads the demo switch as the run\'s engine reads it', () => {
    const build = fs.readFileSync(path.join(process.cwd(), 'lib/process-document-build.ts'), 'utf8');
    expect(build).toMatch(/readDemoSwitches\(source, input\.engineVersion\)/);
    const page = fs.readFileSync(path.join(process.cwd(), 'app/(app)/project/[projectId]/documentation/page.tsx'), 'utf8');
    expect(page).toMatch(/useProcessDocument\([\s\S]{0,400}?engineVersionOfProject\(project\),\s*\)/);
  });
});

test.describe('the purpose from the program\'s names (lib/abap/program-domain.ts)', () => {
  test('a verb in the program\'s name and objects in its code give one sentence with its lines', () => {
    const domain = readProgramDomain(FIXTURE);
    expect(domain?.text).toBe('Checks supplier invoices against purchase orders and goods receipts, within a tolerance.');
    expect(domain?.lines[0]).toBe(8);
  });

  test('"against" only when the program\'s name names what is checked; an invoice is a supplier invoice only by its own names', () => {
    expect(readProgramDomain(readExample('Z_SD_FREIGHT_RATE_CHECK.abap'))?.text).toBe('Checks freight costs, deliveries and materials, within a tolerance.');
    const sd = 'REPORT zsd_invoice_check.\nDATA gv_invoice TYPE vbeln.\nSELECT SINGLE vbeln FROM vbrk INTO gv_invoice WHERE vbeln = gv_invoice.\nSELECT SINGLE vbeln FROM vbak INTO gv_invoice.\nSELECT SINGLE vbeln FROM vbak INTO gv_invoice.\n';
    expect(readProgramDomain(sd)?.text).toBe('Checks invoices against sales orders.');
  });

  test('a tolerance is said only when the program uses the tolerance it declares', () => {
    const declared = 'REPORT zmm_invoice_check.\nPARAMETERS p_tol TYPE p DECIMALS 2 DEFAULT 5.\nDATA gv_invoice TYPE belnr_d.\nSELECT SINGLE belnr FROM rbkp INTO gv_invoice.\n';
    expect(readProgramDomain(declared)?.text ?? '').not.toMatch(/tolerance/);
    const used = `${declared}IF gv_invoice > p_tol.\n  WRITE / gv_invoice.\nENDIF.\n`;
    expect(readProgramDomain(used)?.text ?? '').toMatch(/, within a tolerance\.$/);
    // Asked for as a required entry only: it is never applied.
    const required = `${declared}IF p_tol IS INITIAL.\n  MESSAGE 'Enter a tolerance' TYPE 'E'.\nENDIF.\n`;
    expect(readProgramDomain(required)?.text ?? '').not.toMatch(/tolerance/);
    // Shown in the list or a message only: it decides nothing.
    const shown = `${declared}WRITE: / 'Tolerance', p_tol.\nMESSAGE s001(zmm) WITH p_tol.\n`;
    expect(readProgramDomain(shown)?.text ?? '').not.toMatch(/tolerance/);
    // Taken into a calculation that the check then reads.
    const calculated = `${declared}DATA gv_limit TYPE p DECIMALS 2.\ngv_limit = gv_invoice * p_tol / 100.\n`;
    expect(readProgramDomain(calculated)?.text ?? '').toMatch(/, within a tolerance\.$/);
  });

  test('no verb in the program\'s name: not determined, never guessed', () => {
    expect(readProgramDomain(readExample('Z_MM_PO_APPROVAL.abap'))).toBeNull();
    expect(readProgramDomain('REPORT zfoo_bar.\nWRITE / \'invoice\'.\n')).toBeNull();
  });

  test('a program whose purpose line already says what it changes gets no second purpose', () => {
    for (const file of ['Z_MM_PO_APPROVAL.abap', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap']) {
      const source = readExample(file).replace(/\r\n/g, '\n');
      expect(panelOf(source, AFTER).inShort).toEqual(panelOf(source, BEFORE).inShort);
    }
  });
});

test.describe('the examples keep their story, technical checks folded', () => {
  test('PO demo: the permission and "not found" stops stay; no step is lost', () => {
    const source = readExample('Z_MM_PO_APPROVAL.abap').replace(/\r\n/g, '\n');
    const before = panelOf(source, BEFORE);
    const after = panelOf(source, AFTER);
    expect(after.story.steps.map((s) => s.text)).toEqual(before.story.steps.map((s) => s.text));
    expect(after.story.steps[0].stops).toEqual(['no purchase requisition found (E001)', 'not authorized (E002)']);
    expect(after.story.steps[0].checks).toEqual(['Not authorized']);
    expect(after.story.testData).toBeNull();
    expect(after.decides[0].text).toBe('Keeps cases where deviation percent above 5 from going further');
  });

  test('1,000-line example: the authority check keeps its stop; technical checks are counted', () => {
    const source = readExample('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap').replace(/\r\n/g, '\n');
    const after = panelOf(source, AFTER);
    expect(after.story.steps[0]).toMatchObject({ text: 'Authority check', checks: ['Not authorized'], stops: ['not authorized (E001)'] });
    expect(after.story.steps.reduce((n, s) => n + (s.technical ?? 0), 0)).toBeGreaterThan(5);
    expect(after.technicalRules).toBe(2);
  });
});

test.describe('the model may reword the panel — scope "firstlook", the 3.0.18 guard', () => {
  const after = panelOf(FIXTURE, AFTER);
  const proc = readProcess(FIXTURE);
  const summary = programSummary(programSummaryFactsOf(FIXTURE, { skeleton: proc.skeleton, engineVersion: AFTER }));
  const sentences = firstLookPlainSentences({
    inShort: businessInShort(summary, { codes: false }),
    steps: after.story.steps,
    decides: after.decides,
    changes: after.changes,
  });
  const items = plainItemsOf(sentences);

  test('the scope is known and every offered sentence carries its lines', () => {
    expect(isPlainScope('firstlook')).toBe(true);
    expect(items.length).toBeGreaterThan(6);
    expect(items.every((i) => i.anchor.lineStart > 0)).toBe(true);
  });

  test('a faithful rewording holds; one that adds a number or loses its anchor is dropped', () => {
    const purpose = items.find((i) => i.text.startsWith('Checks supplier invoices'))!;
    const marks = items.find((i) => i.text.startsWith('Marks each document line'))!;
    const answer = JSON.stringify({
      sentences: items.map((i, k) => {
        const anchor = i.anchor.lineEnd > i.anchor.lineStart ? `L${i.anchor.lineStart}-${i.anchor.lineEnd}` : `L${i.anchor.lineStart}`;
        if (i === purpose) return { id: `S${k + 1}`, text: 'It compares supplier invoices with their purchase orders and goods receipts, within a tolerance.', anchor };
        if (i === marks) return { id: `S${k + 1}`, text: 'Each document line gets a status (input rejected, blocked for payment or matched) and a code (Q001, T001, T002, T003).', anchor };
        return { id: `S${k + 1}`, text: i.text, anchor: 'L1' };
      }),
    });
    const v = validatePlainWording(items, answer);
    expect(v.wording[purpose.key]).toBe('It compares supplier invoices with their purchase orders and goods receipts, within a tolerance.');
    expect(v.wording[marks.key]).toBeUndefined();
    const record: PlainWordingRecord = {
      formatVersion: 1, scope: 'firstlook', digest: plainDigestOf('firstlook', FIXTURE, items), wording: v.wording, offered: items.length,
      discarded: v.discarded, origin: { source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'm', byok: false, issuedAt: 1, textSha256: 'x' },
      proposedAt: '2026-10-21T12:00:00.000Z',
    };
    const say = plainLookup(record, 'firstlook', plainDigestOf('firstlook', FIXTURE, items));
    expect(say(purpose.text, purpose.anchor)).toMatchObject({ worded: true, engine: purpose.text });
    expect(say(marks.text, marks.anchor)).toMatchObject({ worded: false, text: marks.text });
  });
});

test.describe('rendered (BusinessOpening, static markup)', () => {
  async function loadOpening(): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
    const out = path.join(ROOT, 'tmp', 'first-look-plain', String(process.pid), 'BusinessOpening.cjs');
    await build({
      entryPoints: [path.join(ROOT, 'components', 'workspace', 'BusinessOpening.tsx')],
      outfile: out,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    return require(out).default;
  }

  function propsOf(panel: Panel, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: 'ZMM_RECEIPT_INVOICE_CHECK', nameIsProposed: false, programName: 'ZMM_RECEIPT_INVOICE_CHECK', nameReason: null,
      story: panel.story, rules: panel.decides.map((d, i) => ({ id: `R${i}`, ...d })), rulesMore: panel.decidesMore,
      technicalRules: panel.technicalRules, changes: panel.changes, changesMore: 0, changesNone: '', questions: null, details: null,
      ...extra,
    };
  }

  test('the test data switch stands apart, technical checks and settings are counted', async () => {
    const Opening = await loadOpening();
    const html = renderToStaticMarkup(React.createElement(Opening, propsOf(panelOf(FIXTURE, AFTER))));
    expect(html).toContain('data-process-story-test-data=""');
    expect(html).toContain('Test data switch — not part of the business process');
    expect(html).toContain('runs on 30 test cases of its own');
    expect(html).toContain('data-process-story-technical="17"');
    expect(html).toContain('Plus 17 technical checks');
    expect(html).toContain('data-story-technical-rules="3"');
    expect(html).not.toContain('Apply case');
    expect(html).toContain('data-steps="3"');
  });

  test('before 3.0.20 the panel renders as it did — no test data row, no counts', async () => {
    const Opening = await loadOpening();
    const html = renderToStaticMarkup(React.createElement(Opening, propsOf(panelOf(FIXTURE, BEFORE))));
    expect(html).not.toContain('data-process-story-test-data');
    expect(html).not.toContain('data-process-story-technical');
    expect(html).toContain('Apply case');
  });

  test('a reworded sentence stands in place with the chip; the engine sentence one fold down', async () => {
    const Opening = await loadOpening();
    const panel = panelOf(FIXTURE, AFTER);
    const say = (text: string) =>
      text === 'Download CSV' ? { text: 'Save the result as a file', engine: text, worded: true } : { text, engine: text, worded: false };
    const html = renderToStaticMarkup(React.createElement(Opening, propsOf(panel, { say })));
    expect(html).toContain('Save the result as a file');
    expect(html).toContain('data-worded-chip=""');
    expect(html).toContain('data-worded-engine-sentence=""');
  });
});
