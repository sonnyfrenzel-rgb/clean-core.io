import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readSource } from '../lib/first-look';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { deriveCounterCheckScenarios } from '../lib/abap/counter-check';
import { applyStateChoices, type StateChoiceInput, type StateEntry } from '../lib/process-states';
import { questionFlow } from '../lib/rule-questions';
import { ruleRegisterFromSource } from '../lib/rule-register';
import { ruleTally } from '../lib/transformation-chain';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocument } from '../lib/process-document-build';
import { documentOutline } from '../lib/process-document-outline';
import { materialRules, ruleCoverage, ruleCoverageSentence } from '../lib/testing-rule-trace';
import {
  counterChecksLine,
  decideOpenRules,
  documentRuleCounts,
  documentRulesLine,
  openRulesLine,
  questionRuleCountsOf,
  questionsCoverRules,
  ruleDecisionCounts,
  ruleDecisionsLine,
  tracedRulesLine,
} from '../lib/rule-counts';

/**
 * Hotfix 3.0.22, HF-e — "the counts agree". Owner example A showed one project
 * with Design "5 questions" beside "25 open rules", Transformation "41 rules —
 * 16 decided by you", Documentation "43 rules": every figure was right about
 * something, and none said what. `lib/rule-counts.ts` is the one count source;
 * this spec builds the four tools' figures for one project and checks they
 * name the same number of business rules, and that where two tools count
 * different things (questions, entries, reachable rules), the words say so.
 *
 * Server-free: the engine, the register and the document are built from the
 * source; the answers are recorded in memory the way Design records them.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const FIXTURES = [
  ['ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 'public/starter-examples/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'],
  ['Z_MM_PO_APPROVAL.abap', 'public/starter-examples/Z_MM_PO_APPROVAL.abap'],
  ['Z_SD_FREIGHT_RATE_CHECK.abap', 'public/starter-examples/Z_SD_FREIGHT_RATE_CHECK.abap'],
  ['zmm_gr_invoice_check.abap', 'tests/fixtures/rule-baskets/zmm_gr_invoice_check.abap'],
] as const;
const ACCOUNT = { uid: 'u1', name: 'Buyer A' };

function mapOf(source: string, file: string) {
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
  return buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null, 'no-key'), fileName: file });
}

/** The project after its owner answered every Design question with "Yes, that's right". */
function projectOf(file: string, rel: string) {
  const source = read(rel);
  const reading = readSource(source);
  const ex = explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source));
  const asked = [...new Set(ex.questions.flatMap((q) => q.ruleIds))];
  const choices: StateChoiceInput[] = asked.map((id) => ({ subject: id, kind: 'rule', state: 'keep', note: null, valueSource: null, appliesTo: [] }));
  const list = applyStateChoices([], choices, { account: ACCOUNT, confirmedAt: '2026-11-12T10:00:00.000Z', revision: 2 });
  const entries: Record<string, StateEntry> = Object.fromEntries(list.map((e) => [e.subject, e]));
  // The register as Transformation reads it, with the answers on record.
  const register = ruleRegisterFromSource(source);
  if (register.state !== 'read') throw new Error(`${file}: no register`);
  const rows = register.rows.map((r) => ({ ...r, answer: entries[r.id]?.state ?? null, revision: entries[r.id] ? 2 : null }));
  const doc = buildProcessDocument({ source, map: mapOf(source, file) });
  return { source, reading, ex, entries, rows, doc };
}

for (const [file, rel] of FIXTURES) {
  test.describe(`${file}: one count of business rules in Design, Transformation, Documentation and Testing`, () => {
    test('every tool names the same number of business rules', () => {
      const p = projectOf(file, rel);
      const total = p.reading.ruleSet.rules.length;
      expect(total, 'the fixture has rules').toBeGreaterThan(0);

      // Design: the questions, and the rules they cover.
      const flow = questionFlow(p.ex, p.entries);
      const design = questionRuleCountsOf(p.ex, flow.answered);
      expect(design.total).toBe(total);
      expect(design.questions).toBe(flow.total);
      expect(design.answered).toBe(flow.total);
      expect(design.rulesAsked + design.notAsked).toBe(total);
      expect(design.technical + design.undetermined).toBe(design.notAsked);

      // Transformation: the register's rows.
      const tf = ruleTally(p.rows);
      expect(tf.total).toBe(total);
      expect({ ...tf }).toMatchObject({ ...ruleDecisionCounts(p.rows.map((r) => r.answer)) });
      // The rules the Design answers cover are the ones Transformation counts as decided; the rest are open.
      expect(tf.decided).toBe(design.rulesAsked);
      expect(tf.open).toBe(design.notAsked);

      // Documentation: the key figure and the chapter's business rules.
      const outline = documentOutline(p.doc);
      const docCounts = documentRuleCounts(p.doc.rules);
      expect(docCounts.businessRules).toBe(total);
      expect(outline.glance.figures.find((f) => f.label === 'Business rules')!.value).toBe(total);
      expect(outline.chapters.find((c) => c.key === 'rules')!.count).toBe(String(total));
      expect(docCounts.entries).toBe(p.doc.rules.length);

      // Testing: the counter-checks and the coverage name the full count.
      const cc = deriveCounterCheckScenarios(p.source);
      expect(cc.counts.rules).toBe(total);
      const coverage = ruleCoverage(materialRules(p.reading.ruleSet), [], null, total);
      expect(coverage.all).toBe(total);
      expect(coverage.total).toBeLessThanOrEqual(total);
    });

    test('every label says what it counts, and the numbers in the words are the same', () => {
      const p = projectOf(file, rel);
      const total = p.reading.ruleSet.rules.length;
      const word = `${total} business rule${total === 1 ? '' : 's'}`;
      const flow = questionFlow(p.ex, p.entries);
      const design = questionRuleCountsOf(p.ex, flow.answered);
      const tf = ruleTally(p.rows);
      const outline = documentOutline(p.doc);
      const cc = deriveCounterCheckScenarios(p.source);
      const coverage = ruleCoverage(materialRules(p.reading.ruleSet), [], null, total);

      const texts = {
        design: questionsCoverRules(design),
        transformation: ruleDecisionsLine(tf),
        documentationLead: outline.leads.rules,
        documentationChapter: outline.chapters.find((c) => c.key === 'rules')!.question,
        testingCounterChecks: counterChecksLine(cc.counts.scenarios, cc.counts.rules, cc.counts.withoutScenario),
        testingCoverage: ruleCoverageSentence(coverage),
      };
      for (const [tool, text] of Object.entries(texts)) {
        expect(text, tool).toContain(word);
        // A bare "N rules" that does not say which rules is what HF-e removes.
        expect(text, tool).not.toMatch(/\b\d+ rules?\b(?! (?:past|was|were))/);
      }
      // Design counts questions and says so — a question is never called a rule.
      expect(texts.design).toMatch(new RegExp(`^${design.questions} questions? covers? ${design.rulesAsked} of the ${word}\\.`));
      if (design.notAsked > 0) expect(texts.design).toContain('decided in the rule register');
      // Transformation: decided and open add up to the same total.
      expect(texts.transformation).toContain(`${tf.decided} decided`);
      if (tf.open > 0) {
        expect(openRulesLine(tf.open)).toMatch(new RegExp(`^${tf.open} business rules? open`));
        expect(decideOpenRules(tf.open)).toContain(`${tf.open} open business rule`);
      }
      // Documentation: the row count is "entries", never "rules".
      const dc = documentRuleCounts(p.doc.rules);
      expect(texts.documentationLead.startsWith(documentRulesLine(dc))).toBe(true);
      expect(dc.businessRules + dc.decisionPoints + dc.fixedValues).toBe(dc.entries);
      // Testing: the reachable rules are named as such beside the full count.
      if (coverage.total < total) expect(texts.testingCoverage).toContain(`the ${coverage.total} business rules a case can reach`);
    });
  });
}

test.describe('the words, one by one', () => {
  test('owner example A, as numbers: 5 questions over 16 of 41 rules, 43 entries in Documentation', () => {
    const design = { questions: 5, answered: 5, rulesAsked: 16, total: 41, notAsked: 25, technical: 22, undetermined: 3 };
    expect(questionsCoverRules(design)).toBe('5 questions cover 16 of the 41 business rules. The other 25 — 22 technical, 3 not determined — are decided in the rule register.');
    const tf = ruleDecisionCounts([...Array(10).fill('keep'), ...Array(4).fill('change'), ...Array(2).fill('drop'), ...Array(24).fill(null), 'clarify']);
    expect(ruleDecisionsLine(tf)).toBe('41 business rules — 16 decided: 10 keep, 4 change, 2 drop');
    expect(openRulesLine(tf.open)).toBe('25 business rules open — implemented as the original and marked open');
    expect(decideOpenRules(25)).toBe('Decide the 25 open business rules');
    const rows = [...Array.from({ length: 41 }, (_, i) => ({ ref: `BR-${String(i + 1).padStart(3, '0')}` })), { ref: 'Decision point' }, { ref: 'Fixed values' }];
    expect(documentRulesLine(documentRuleCounts(rows))).toBe('43 entries: 41 business rules, 1 decision point, 1 fixed value');
    expect(tracedRulesLine(10, 30, 41)).toBe('10 of the 30 business rules a case can reach have a traced case (41 business rules in all; 11 are declared only, never reached or technical helpers)');
    expect(tracedRulesLine(1, 2, null)).toBe('1 of 2 business rules of the original have a traced case');
    expect(counterChecksLine(24, 14, 2)).toBe('24 scenarios for 12 of the 14 business rules (2 are only declared, with no condition to check) — each once where it applies and once where it must not.');
  });

  test('a business rule worded as a fixed value is still a business rule: the id decides', () => {
    expect(documentRuleCounts([{ ref: 'BR-001' }, { ref: 'BR-001' }, { ref: 'BR-002' }, { ref: 'Fixed values' }, { ref: 'Decision point' }])).toEqual({
      entries: 5,
      businessRules: 2,
      decisionPoints: 1,
      fixedValues: 1,
    });
  });

  test('each tool reads its figures from the one count source', () => {
    const src = (rel: string) => read(rel);
    expect(src('lib/transformation-chain.ts')).toMatch(/from '@\/lib\/rule-counts'/);
    expect(src('components/design/RuleQuestions.tsx')).toMatch(/questionsCoverRules\(cover\)/);
    expect(src('lib/process-document-outline.ts')).toMatch(/documentRuleCounts\(doc\.rules\)/);
    expect(src('components/testing/CounterChecks.tsx')).toMatch(/counterChecksLine\(/);
    expect(src('lib/testing-rule-trace.ts')).toMatch(/tracedRulesLine\(/);
    // No tool writes its own "N rules" count of the register any more.
    expect(src('lib/transformation-chain.ts')).not.toMatch(/plural\(t\.total, 'rule'\)/);
    expect(src('lib/process-document-outline.ts')).not.toMatch(/plural\(doc\.rules\.length, 'rule'\)/);
  });
});
