import { expect, test } from './helpers/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { deriveBusinessRulesFrom } from '../lib/abap/business-rule-set';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { processStory } from '../lib/process-story';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { businessInShort, programSummary } from '../lib/program-summary-text';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';
import { CUSTOMER_TEXT_LABEL, readCustomerTexts } from '../lib/abap/customer-texts';

/**
 * One synthetic abapGit package changes every surface that phrases business text (owner decision 06.11.2026, H5b):
 * the map (`customer-texts-310.spec.ts`), and here the story, "In short", the rules and the questions for the business,
 * and the documentation build — each sentence that says a customer text carrying "Customer text: CODE “text”". A
 * 3.0.22 hotfix reads as before. Written for this spec; no benchmark case comes with abapGit XML files.
 */

const NEW = ENGINE_READS_310_FROM;
const HOTFIX = '3.0.22';

const PROGRAM = [
  'REPORT zsd_check_minimum.',
  'PARAMETERS p_kdgrp TYPE c LENGTH 2.',
  'DATA: lt_min TYPE STANDARD TABLE OF zsd_minmenge, ls_min TYPE zsd_minmenge.',
  'START-OF-SELECTION.',
  '  SELECT * FROM zsd_minmenge INTO TABLE lt_min WHERE kdgrp = p_kdgrp.',
  '  LOOP AT lt_min INTO ls_min.',
  '    IF ls_min-zzmeng > 500.',
  "      ls_min-zzqx = 'X'.",
  '      MODIFY zsd_minmenge FROM ls_min.',
  '    ENDIF.',
  '  ENDLOOP.',
].join('\n');

const xml = (body: string) => `<?xml version="1.0" encoding="utf-8"?><abapGit version="v1.0.0"><asx:abap version="1.0"><asx:values>${body}</asx:values></asx:abap></abapGit>`;
const TEXTS = readCustomerTexts([
  { name: 'src/zsd_minmenge.tabl.xml', text: xml('<DD02V><TABNAME>ZSD_MINMENGE</TABNAME><DDTEXT>Minimum quantities per customer group</DDTEXT></DD02V><DD03P_TABLE><DD03P><FIELDNAME>ZZMENG</FIELDNAME><ROLLNAME>ZMIN_MENG</ROLLNAME></DD03P></DD03P_TABLE>') },
  { name: 'src/zmin_meng.dtel.xml', text: xml('<DD04V><ROLLNAME>ZMIN_MENG</ROLLNAME><SCRTEXT_L>Agreed minimum quantity</SCRTEXT_L></DD04V>') },
  { name: 'src/zsd_check_minimum.prog.xml', text: xml('<TPOOL><item><ID>S</ID><KEY>P_KDGRP</KEY><ENTRY>        Customer group</ENTRY></item></TPOOL>') },
]);

function surfaces(engine: string, texts = TEXTS) {
  const skeleton = buildProcessSkeleton(PROGRAM, { engineVersion: engine });
  const facts = buildProcessFacts(PROGRAM);
  const ruleSet = deriveBusinessRulesFrom(PROGRAM, facts, skeleton, engine);
  const explained = explainBusinessRules(PROGRAM, ruleSet, facts, engine, texts);
  const { bpmn, technical } = buildReadingExports(PROGRAM, { processName: 't', sourceFileName: 't.abap', exporterVersion: engine, customerTexts: texts });
  const map = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(PROGRAM, { engineVersion: engine }), null), fileName: 't.abap' });
  return {
    story: processStory(skeleton, PROGRAM, null, engine, texts).steps,
    inShort: businessInShort(programSummary(programSummaryFactsOf(PROGRAM, { engineVersion: engine, customerTexts: texts })), { codes: false }),
    rules: explained.rules,
    questions: explained.questions,
    documentation: buildProcessDocumentation({ source: PROGRAM, map, engineVersion: engine, customerTexts: texts }),
  };
}

test('the story, "In short", a rule, a question and the documentation say the customer\'s words, each marked as theirs', () => {
  const s = surfaces(NEW);
  const marked = (t: string | undefined) => !!t && t.startsWith(`${CUSTOMER_TEXT_LABEL}: `);

  const step = s.story.find((x) => /minimum quantities per customer group/i.test(x.text));
  expect(step, s.story.map((x) => x.text).join(' | ')).toBeTruthy();
  expect(marked(step!.customerText)).toBe(true);
  expect(step!.customerText).toContain('ZSD_MINMENGE “Minimum quantities per customer group”');

  const line = s.inShort.find((l) => /minimum quantities per customer group/i.test(l.text));
  expect(line, s.inShort.map((l) => l.text).join(' | ')).toBeTruthy();
  expect(line!.customerText).toContain('ZSD_MINMENGE “Minimum quantities per customer group”');

  const rule = s.rules.find((r) => /agreed minimum quantity/i.test(r.protects.text));
  expect(rule, s.rules.map((r) => r.protects.text).join(' | ')).toBeTruthy();
  expect(rule!.customerText).toContain('ZZMENG “Agreed minimum quantity”');

  const question = s.questions.find((q) => /agreed minimum quantity/i.test(q.statement.text));
  expect(question, s.questions.map((q) => q.statement.text).join(' | ')).toBeTruthy();
  expect(question!.customerText).toContain('ZZMENG “Agreed minimum quantity”');

  const docStep = s.documentation.steps.find((x) => marked(x.customerText));
  expect(docStep, s.documentation.steps.map((x) => x.plainName).join(' | ')).toBeTruthy();
  expect(s.documentation.summary && JSON.stringify(s.documentation.summary)).toContain('Minimum quantities per customer group');
});

test('without the package, and for a 3.0.22 hotfix, no surface says a customer word or carries the mark', () => {
  for (const s of [surfaces(NEW, null), surfaces(HOTFIX)]) {
    const all = JSON.stringify(s);
    expect(all).not.toContain('Agreed minimum quantity');
    expect(all).not.toContain('Minimum quantities per customer group');
    expect(all).not.toContain(CUSTOMER_TEXT_LABEL);
  }
});
