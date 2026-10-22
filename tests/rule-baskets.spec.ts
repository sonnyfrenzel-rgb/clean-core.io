import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource } from '../lib/first-look';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { deriveBusinessRulesFrom } from '../lib/abap/business-rule-set';
import { buildProcessSkeletonFrom } from '../lib/abap/process-skeleton';
import { basketTopics, explainBusinessRules, type RuleSetExplanation } from '../lib/abap/business-rule-set-explain';
import { applyStateChoices, checkStateChoices, type StateChoiceInput, type StateEntry } from '../lib/process-states';
import { choiceOf } from '../lib/rule-decision-flow';
import {
  ACCEPTED_AS_CODED_NOTE,
  QUESTION_ANSWERS,
  QUESTION_BATCH,
  TECHNICAL_KEEP_NOTE,
  acceptAllChoices,
  answerProblem,
  architectureChoice,
  architectureOptions,
  basketSummary,
  isTechnicalKeep,
  questionAnswerOf,
  questionChoices,
  questionFlow,
  targetQuestionGroups,
  technicalKeepChoices,
} from '../lib/rule-questions';
import { rulePlainSentences } from '../lib/plain-wording';
import { ruleRegisterFromSource, ruleRegisterMarkdown } from '../lib/rule-register';
import { ruleFlow } from '../lib/rule-decision-flow';
import { editorRules } from '../lib/rules-editor';
import { plainWordingFor } from '../lib/business-card';
import { machineStringsIn } from './helpers/machine-strings';

/**
 * Owner decision 21.10.2026 — a new set-up for the business rules ("alles sehr
 * komplex … in einem sehr frühen Stadium überfordert es den Anwender"; "wir
 * sind im first insights und das soll ein business user gleich entscheiden?").
 *
 * The engine sorts every rule into three baskets — questions for the business,
 * technical rules that stay as coded, not determined with why — and asks the
 * business rules as a few questions in Design, at most five at a time. The
 * Business view's opening says one sentence; the full register is in IT.
 *
 * Measured on the 1,000-line example, the PO demo and a synthetic goods
 * receipt / invoice program with its own demo data and a demo-case switch
 * (`tests/fixtures/rule-baskets/zmm_gr_invoice_check.abap`). Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const BIG = read('public/starter-examples/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
const PO = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');
const GR = read('tests/fixtures/rule-baskets/zmm_gr_invoice_check.abap');
const ACCOUNT = { uid: 'u1', name: 'Buyer A' };

function explain(source: string) {
  const reading = readSource(source);
  return { ex: explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source)), reading };
}

const ruleId = (reading: ReturnType<typeof readSource>, label: RegExp): string => {
  const rule = reading.ruleSet.rules.find((r) => label.test(r.label));
  expect(rule, `no rule labelled ${label}`).toBeTruthy();
  return rule!.id;
};

const entriesOf = (choices: StateChoiceInput[], held: StateEntry[] = [], revision = 2): { list: StateEntry[]; byId: Record<string, StateEntry> } => {
  const list = applyStateChoices(held, choices, { account: ACCOUNT, confirmedAt: '2026-10-21T10:00:00.000Z', revision });
  return { list, byId: Object.fromEntries(list.map((e) => [e.subject, e])) };
};

const subjectsOf = (ex: RuleSetExplanation) => ({ elements: [], rules: ex.rules.map((r) => r.id) });

test.describe('three baskets, read off the code (owner decision 21.10.2026)', () => {
  test('every rule is in exactly one basket, every business rule in exactly one question, the weightiest question first', () => {
    for (const source of [BIG, PO, GR]) {
      const { ex } = explain(source);
      const all = [...ex.baskets.business, ...ex.baskets.technical, ...ex.baskets.undetermined];
      expect(all.sort()).toEqual(ex.rules.map((r) => r.id).sort());
      const asked = ex.questions.flatMap((q) => q.ruleIds);
      expect(asked.sort()).toEqual([...ex.baskets.business].sort());
      expect(new Set(asked).size).toBe(asked.length);
      for (let i = 1; i < ex.questions.length; i += 1) expect(ex.questions[i - 1].weight).toBeGreaterThanOrEqual(ex.questions[i].weight);
      for (const r of ex.rules) expect(r.basket.reason.anchors.length, r.id).toBeGreaterThan(0);
    }
  });

  test('the measured counts: fewer questions than rule rows, at most five shown on first open', () => {
    const counts = [BIG, PO, GR].map((s) => {
      const { ex } = explain(s);
      return { rows: ex.rules.length, ...Object.fromEntries(Object.entries(ex.baskets).map(([k, v]) => [k, v.length])), questions: ex.questions.length, shown: questionFlow(ex, {}).shown.length };
    });
    // The 1,000-line example: 30 rule rows before; 15 questions, 5 technical, 2 not determined. It has no demo
    // cases of its own, so its TEST*/DUMMY* customer reference is asked (owner decision 22.10.2026).
    expect(counts[0]).toEqual({ rows: 30, business: 23, technical: 5, undetermined: 2, questions: 15, shown: 5 });
    // The PO demo: 12 rows; 7 questions, 4 not determined (three constants nobody reads, one subject the code does not name).
    expect(counts[1]).toEqual({ rows: 12, business: 8, technical: 0, undetermined: 4, questions: 7, shown: 5 });
    // The goods receipt / invoice program: 9 rows (its 4 demo cases are apart already); 6 questions, 3 technical.
    expect(counts[2]).toEqual({ rows: 9, business: 6, technical: 3, undetermined: 0, questions: 6, shown: 5 });
    for (const c of counts) expect(c.shown).toBeLessThanOrEqual(QUESTION_BATCH);
  });

  test('what stays as coded: a row cap, a log level, test data, a marker the program sets and reads itself', () => {
    const { ex, reading } = explain(BIG);
    const basket = (label: RegExp) => ex.rules.find((r) => r.id === ruleId(reading, label))!.basket;
    expect(basket(/p_lim IS INITIAL/).kind).toBe('technical');
    expect(basket(/iv_level = 'WARN'/).kind).toBe('technical');
    // A TEST*/DUMMY* value is test data only in a program with demo cases of its own (owner decision 22.10.2026);
    // this one has none, so the business is asked.
    expect(basket(/bstnk CP 'TEST\*'/).kind).toBe('business');
    // The program sets the action itself (line 431) and dispatches on it — a marker of its own.
    const action = basket(/CASE <fs_order>-action: 'SET_DELIVERY_BLOCK'/);
    expect(action.kind).toBe('technical');
    expect(action.reason.text).toMatch(/sets the action to SET_DELIVERY_BLOCK itself \(line \d+\)/);
    // A constant nobody reads, and a subject the code does not name: not determined, with why.
    expect(basket(/c_default_werks VALUE/).kind).toBe('undetermined');
    expect(basket(/c_default_werks VALUE/).reason.text).toMatch(/No condition in this program reads/);
    expect(basket(/lv_ustyp/).kind).toBe('undetermined');
    // What a business sets stays a question: order types, risk scores, amounts.
    expect(basket(/CASE is_order-auart: 'ZOR'/).kind).toBe('business');
    expect(basket(/risk_score GE c_critical_score/).kind).toBe('business');
    expect(basket(/lv_amount GT 500000/).kind).toBe('business');
  });

  test('a marker is the field the program writes, not another one whose name ends alike', () => {
    const source = [
      'REPORT zsd_release_check.',
      'DATA: lv_status TYPE c LENGTH 1,',
      '      ls_document TYPE vbak,',
      '      ls_job TYPE vbrk.',
      'START-OF-SELECTION.',
      '  SELECT SINGLE * FROM vbak INTO ls_document.',
      "  lv_status = 'A'.",
      "  ls_job-status = 'B'.",
      "  ls_document-status = 'C'.",
      "  IF ls_document-status = 'A'.",
      "    WRITE / 'released'.",
      '  ENDIF.',
      "  IF ls_document-status = 'B'.",
      "    WRITE / 'held'.",
      '  ENDIF.',
      "  IF ls_document-status = 'C'.",
      "    WRITE / 'checked'.",
      '  ENDIF.',
      '',
    ].join('\n');
    const { ex, reading } = explain(source);
    const kindOf = (label: RegExp) => ex.rules.find((r) => r.id === ruleId(reading, label))!.basket;
    // A variable of the same final name is not the document's field: no marker.
    expect(kindOf(/status = 'A'/).reason.text).not.toMatch(/marker of its own/);
    // Nor is the same component of a structure of another type.
    expect(kindOf(/status = 'B'/).reason.text).not.toMatch(/marker of its own/);
    // The field the program sets itself and reads back is.
    expect(kindOf(/status = 'C'/).reason.text).toMatch(/marker of its own/);
  });

  test('a value assigned only after the check is no marker the program set', () => {
    const source = [
      'REPORT zsd_status_check.',
      'DATA ls_document TYPE vbak.',
      'START-OF-SELECTION.',
      '  SELECT SINGLE * FROM vbak INTO ls_document.',
      "  IF ls_document-status = 'A'.",
      "    WRITE / 'released'.",
      '  ENDIF.',
      "  ls_document-status = 'A'.",
      '',
    ].join('\n');
    const { ex, reading } = explain(source);
    const reason = ex.rules.find((r) => r.id === ruleId(reading, /status = 'A'/))!.basket.reason.text;
    expect(reason).not.toMatch(/marker of its own/);
  });

  test('a rule that picks out test documents and a live one is not test data', () => {
    const source = [
      'REPORT zsd_order_check.',
      'PARAMETERS p_demo AS CHECKBOX DEFAULT space.',
      'DATA ls_order TYPE vbak.',
      'START-OF-SELECTION.',
      '  SELECT SINGLE * FROM vbak INTO ls_order.',
      "  IF ls_order-bstnk CP 'TEST*'.",
      "    WRITE / 'test'.",
      '  ENDIF.',
      "  IF ls_order-bstnk IN ('TEST-1', 'LIVE').",
      "    WRITE / 'mixed'.",
      '  ENDIF.',
      '',
    ].join('\n');
    const { ex, reading } = explain(source);
    const reasonOf = (label: RegExp) => ex.rules.find((r) => r.id === ruleId(reading, label))!.basket.reason.text;
    expect(reasonOf(/CP 'TEST\*'/)).toContain('test data');
    expect(reasonOf(/'LIVE'/)).not.toContain('test data');
    // Without demo cases of its own a TEST* prefix proves nothing: DEMO-ORDER can be a live order type.
    const noDemo = explain(source.replace('PARAMETERS p_demo AS CHECKBOX DEFAULT space.\n', ''));
    const noDemoReason = noDemo.ex.rules.find((r) => r.id === ruleId(noDemo.reading, /CP 'TEST\*'/))!.basket.reason.text;
    expect(noDemoReason).not.toContain('test data');
  });

  test('the program’s own demo data is no marker: a company code the demo routine fills stays a question', () => {
    const { ex, reading } = explain(GR);
    expect(reading.ruleSet.demoCases?.rules.length).toBe(4);
    const bukrs = ex.rules.find((r) => r.id === ruleId(reading, /bukrs <> '1000'/))!;
    expect(bukrs.basket.kind).toBe('business');
    const status = ex.rules.find((r) => r.id === ruleId(reading, /status = 'VENDOR'/))!;
    expect(status.basket.kind).toBe('technical');
    expect(ex.rules.find((r) => r.id === ruleId(reading, /c_max_rows/))!.basket.kind).toBe('technical');
    expect(ex.rules.find((r) => r.id === ruleId(reading, /gv_loglevel/))!.basket.kind).toBe('technical');
  });

  test('the first insights’ receipt and invoice program, read as 3.0.20 reads it: its 31 demo cases apart, 2 questions', () => {
    const FL = read('tests/fixtures/first-look/zmm-receipt-invoice-check.abap');
    const facts = buildProcessFacts(FL);
    const set = deriveBusinessRulesFrom(FL, facts, buildProcessSkeletonFrom(facts), 'v3.0.20');
    const ex = explainBusinessRules(FL, set, facts, 'v3.0.20');
    expect(set.demoCases?.rules.length).toBe(31);
    expect({ rows: ex.rules.length, technical: ex.baskets.technical.length, undetermined: ex.baskets.undetermined.length, questions: ex.questions.length })
      .toEqual({ rows: 7, technical: 3, undetermined: 2, questions: 2 });
    // A cap of 1,000,000,000,000 on a scaled value is "no limit" written as a number, whatever the field is called.
    const scaled = ex.rules.find((r) => set.rules.find((x) => x.id === r.id)?.label.includes('gc_max_scaled'))!;
    expect(scaled.basket.kind).toBe('technical');
    expect(scaled.basket.reason.text).toMatch(/no limit/);
    expect(questionFlow(ex, {}).shown.length).toBeLessThanOrEqual(QUESTION_BATCH);
  });

  test('the register lists every rule by basket — business topics, then the technical rules, then the undetermined, each with why', () => {
    const { ex } = explain(BIG);
    const topics = basketTopics(ex);
    expect(topics.flatMap((t) => t.ruleIds).sort()).toEqual(ex.rules.map((r) => r.id).sort());
    expect(topics.slice(-2).map((t) => t.topic)).toEqual(['technical', 'undetermined']);
    const register = ruleRegisterFromSource(BIG);
    expect(register.state).toBe('read');
    const md = ruleRegisterMarkdown(register).join('\n');
    expect(md).toContain('Grouped by basket: 23 rules for the business · 5 technical rules (stay as coded) · 2 not determined.');
    expect(md).toContain('### Technical rules — stay as coded');
    expect(md).toContain('### Not determined');
    expect(md).toMatch(/Why here: The program sets the action to SET_DELIVERY_BLOCK itself/);
    // The flow of the register groups the same way, and its one click answers the technical basket.
    const flow = ruleFlow(ex, {});
    expect(flow.topics.slice(-2).map((t) => t.topic)).toEqual(['technical', 'undetermined']);
    expect([...flow.openTechnical].sort()).toEqual([...ex.baskets.technical].sort());
  });
});

test.describe('the questions, in plain business words with the values from the code', () => {
  test('one per subject, no ABAP name, anchored inside the source; the owner’s example shape', () => {
    for (const source of [BIG, PO, GR]) {
      const { ex } = explain(source);
      const lines = source.split('\n').length;
      for (const q of ex.questions) {
        expect(q.statement.text).not.toMatch(/\b(?:lv|gv|ls|gs|lt|gt|iv|is|cs)_\w+|<fs_|sy-\w+|\bBR-\d+/i);
        expect(machineStringsIn(q.statement.text), q.statement.text).toEqual([]);
        expect(q.statement.anchors.length).toBeGreaterThan(0);
        for (const a of q.statement.anchors) expect(a.lineEnd).toBeLessThanOrEqual(lines);
        expect(q.ask).toMatch(/\?$/);
      }
    }
    const { ex } = explain(GR);
    const texts = ex.questions.map((q) => q.statement.text);
    // "Invoices above 250 EUR are held for approval. Is the amount still right?"
    expect(texts).toContain('When the amount in document currency is above 250.00 EUR, the program goes on to “Request approval”.');
    expect(texts.some((t) => /price deviation is above 5\.00/.test(t))).toBe(true);
    expect(texts).toContain('When the company code is not 1000, the program skips this entry and takes the next.');
    // The CASE arms of one field are one question.
    const big = explain(BIG).ex;
    const orderTypes = big.questions.find((q) => /order type ZOR, ZEXP and RE/.test(q.statement.text));
    expect(orderTypes?.ruleIds.length).toBe(3);
    expect(orderTypes?.ask).toBe('Are these still the right values?');
    const limits = big.questions.find((q) => /2 limits on the amount: above 500,000 and above 100,000/.test(q.statement.text));
    expect(limits?.ask).toBe('Are these limits still right?');
  });

  test('the automatic rewording reads the questions too — after the rule sentences, so their places do not move', () => {
    const { ex } = explain(PO);
    const said = rulePlainSentences(ex);
    const tail = said.slice(-ex.questions.length).map((s) => s.text);
    expect(tail).toEqual(ex.questions.map((q) => q.statement.text));
  });
});

test.describe('four answers, stored as before (owner decision 21.10.2026 (4), (7))', () => {
  test('each answer is a choice the process-states route accepts, one per rule of the question', () => {
    const { ex } = explain(BIG);
    const q = ex.questions.find((x) => x.ruleIds.length === 3)!;
    for (const answer of QUESTION_ANSWERS) {
      const text = answer === 'change' ? 'ZOR and ZEX only' : answer === 'unsure' ? 'sales operations' : '';
      const choices = questionChoices(q, answer, text);
      expect(choices.map((c) => c.subject)).toEqual(q.ruleIds);
      const check = checkStateChoices(choices, subjectsOf(ex));
      expect(check.ok, `${answer}: ${JSON.stringify(check)}`).toBe(true);
      const { byId } = entriesOf(choices);
      expect(questionAnswerOf(q, byId)).toBe(answer);
    }
    expect(answerProblem('change', '')).toBe('text-missing');
    expect(answerProblem('unsure', ' ')).toBe('text-missing');
    expect(answerProblem('drop', '')).toBeNull();
    expect(questionChoices(q, 'drop', '')[0].note).toBe('Not needed any more.');
    expect(questionChoices(q, 'change', '300 EUR')[0]).toMatchObject({ state: 'change', note: 'Should be: 300 EUR', valueSource: { kind: 'business-requirement' } });
  });

  test('an older Move to configuration or Move to SAP standard reads as “Yes, that’s right”, its option taken', () => {
    const { ex, reading } = explain(PO);
    const knttp = ex.questions.find((q) => q.ruleIds.includes(ruleId(reading, /CASE gs_eban-knttp: 'F'/)))!;
    const { byId } = entriesOf(knttp.ruleIds.map((id, i) => choiceOf(id, i === 0 ? 'configure' : 'standard', '')));
    expect(questionAnswerOf(knttp, byId)).toBe('yes');
    const flow = questionFlow(ex, byId);
    expect(flow.answered).toBe(1);
    expect(flow.done.map((d) => d.question.id)).toEqual([knttp.id]);
  });

  test('at most five open questions at a time; answering one brings the next', () => {
    const { ex } = explain(BIG);
    const first = questionFlow(ex, {});
    expect(first.shown.map((s) => s.question.id)).toEqual(ex.questions.slice(0, 5).map((q) => q.id));
    expect(first.later).toBe(ex.questions.length - 5);
    const { byId } = entriesOf(questionChoices(ex.questions[0], 'yes', ''));
    const next = questionFlow(ex, byId);
    expect(next.answered).toBe(1);
    expect(next.shown.map((s) => s.question.id)).toEqual(ex.questions.slice(1, 6).map((q) => q.id));
    // "I don't know" stays open, with who to ask.
    const { byId: asked } = entriesOf(questionChoices(ex.questions[0], 'unsure', 'credit management'));
    const still = questionFlow(ex, asked);
    expect(still.answered).toBe(0);
    expect(still.shown[0]).toMatchObject({ answer: 'unsure', text: 'credit management' });
  });

  test('“Accept all proposals” keeps every open business rule with the note that it is a self-declaration, not a check', () => {
    const { ex } = explain(GR);
    const { byId: one } = entriesOf(questionChoices(ex.questions[0], 'change', '300 EUR'));
    const accept = acceptAllChoices(ex, one);
    expect(accept.map((c) => c.subject).sort()).toEqual(ex.baskets.business.filter((id) => !ex.questions[0].ruleIds.includes(id)).sort());
    expect(accept.every((c) => c.state === 'keep' && c.note === ACCEPTED_AS_CODED_NOTE)).toBe(true);
    expect(checkStateChoices(accept, subjectsOf(ex)).ok).toBe(true);
    const { byId: all } = entriesOf(accept, Object.values(one));
    expect(questionFlow(ex, all).answered).toBe(ex.questions.length);
  });

  test('the technical rules are confirmed once, together — recorded like an answer, never counted as business-confirmed', () => {
    const { ex } = explain(BIG);
    const choices = technicalKeepChoices(ex, {});
    expect(choices.map((c) => c.subject).sort()).toEqual([...ex.baskets.technical].sort());
    expect(checkStateChoices(choices, subjectsOf(ex)).ok).toBe(true);
    const { byId } = entriesOf(choices);
    expect(Object.values(byId).every(isTechnicalKeep)).toBe(true);
    const summary = basketSummary(ex, byId);
    expect(summary).toMatchObject({ technical: 5, technicalConfirmed: 5, businessDecided: 0, questionsAnswered: 0 });
    expect(TECHNICAL_KEEP_NOTE).toMatch(/stays as coded/);
  });

  test('architecture options for IT come afterwards, from the engine’s proposal — configuration or SAP standard', () => {
    const { ex, reading } = explain(PO);
    expect(architectureOptions(ex, {})).toEqual([]);
    const tolerance = ex.questions.find((q) => q.ruleIds.includes(ruleId(reading, /lv_dev_pct > 5/)))!;
    const { byId } = entriesOf(questionChoices(tolerance, 'yes', ''));
    const options = architectureOptions(ex, byId);
    expect(options).toEqual([expect.objectContaining({ ruleId: tolerance.ruleIds[0], kind: 'configure', taken: false })]);
    const take = architectureChoice(options[0], byId[tolerance.ruleIds[0]]);
    expect(checkStateChoices([take], subjectsOf(ex)).ok).toBe(true);
    const { byId: after } = entriesOf([take], Object.values(byId), 3);
    expect(architectureOptions(ex, after)[0].taken).toBe(true);
    expect(questionAnswerOf(tolerance, after)).toBe('yes');
    // A changed value keeps its change; the option moves its source into configuration.
    const { byId: changed } = entriesOf(questionChoices(tolerance, 'change', '3 percent'));
    const c = architectureChoice(architectureOptions(ex, changed)[0], changed[tolerance.ruleIds[0]]);
    expect(c).toMatchObject({ state: 'change', note: 'Should be: 3 percent', valueSource: { kind: 'customizing' } });
  });
});

/* ---------------------------------------------------------------- render */

async function load(rel: string, name?: string): Promise<Record<string, (props: Record<string, unknown>) => React.ReactElement | null>> {
  const out = path.join(ROOT, 'tmp', 'rule-baskets', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  void name;
  return require(out);
}

const SAY = (text: string) => ({ text, engine: text, worded: false });

async function renderQuestions(source: string, owner: boolean, entries: Record<string, StateEntry> = {}): Promise<string> {
  const mod = await load('components/design/RuleQuestions.tsx');
  const { ex, reading } = explain(source);
  const rules = editorRules(reading.ruleSet, plainWordingFor(source, reading.skeleton));
  return renderToStaticMarkup(
    React.createElement(mod.RuleQuestionsView, { explanation: ex, entries, rules, owner, busy: false, error: null, recorded: false, onRecord: () => {}, say: SAY, registerHref: '/project/p1?view=it#business-rules' }),
  );
}

test.describe('the questions in Design, rendered', () => {
  test('the owner sees the questions that change the target first and the others folded, each in plain words with four answers; the rule id and the code only one fold down', async () => {
    const html = await renderQuestions(BIG, true);
    const { ex } = explain(BIG);
    expect(html).toContain('data-rule-questions=""');
    // Owner decision 22.10.2026 (3.0.21): up to five that change the target, up to five without impact folded.
    const groups = targetQuestionGroups(ex, {});
    expect(groups.changing.length).toBe(5);
    expect((html.match(/data-question="/g) ?? []).length).toBe(groups.changing.length + groups.quiet.length);
    expect(html).toContain(`0 of ${ex.questions.length} questions answered`);
    expect(html).toContain(`${groups.later} more questions after these`);
    for (const answer of QUESTION_ANSWERS) expect(html).toContain(`data-question-pick="${answer}"`);
    for (const label of ['Yes, that’s right', 'No, it should be …', 'We don’t need it any more', 'I don’t know / someone else']) expect(html).toContain(label);
    expect(html).toContain('Accept all proposals');
    expect(html).toContain('a self-declaration of your account, not a check');
    // Simple on top: the card's head carries no rule id and no code; "More about it" is closed and holds them.
    const card = html.slice(html.indexOf('data-question="'), html.indexOf('</li>', html.indexOf('data-question="')));
    const head = card.slice(0, card.indexOf('data-question-more'));
    const headText = head.slice(head.indexOf('>') + 1).replace(/<[^>]*>/g, ' ');
    expect(headText).not.toMatch(/BR-\d{3}/);
    expect(head).not.toContain('font-cc-mono');
    expect(headText).not.toMatch(/High impact|Medium impact|Low impact/);
    const more = card.slice(card.indexOf('data-question-more'));
    expect(more).toContain('data-cc-disclosure="closed"');
    expect(more).toMatch(/BR-\d{3}/);
    // No move-to-configuration or SAP standard among the business answers.
    expect(headText).not.toMatch(/Move to configuration|Move to SAP standard/);
    expect(html).toContain('href="/project/p1?view=it#business-rules"');
  });

  test('a reader sees the questions and no answer button', async () => {
    const html = await renderQuestions(PO, false);
    expect(html).toContain('Only the owner of the project answers');
    expect(html).not.toContain('data-question-pick=');
    expect(html).not.toContain('data-questions-accept=');
  });

  test('answered questions fold away with their answer; the architecture options for IT are named in one line, taken in the IT view', async () => {
    const { ex, reading } = explain(PO);
    const tolerance = ex.questions.find((q) => q.ruleIds.includes(ruleId(reading, /lv_dev_pct > 5/)))!;
    const { byId } = entriesOf(questionChoices(tolerance, 'yes', ''));
    const html = await renderQuestions(PO, true, byId);
    expect(html).toContain(`1 of ${ex.questions.length} questions answered`);
    expect(html).toContain(`data-question-done="${tolerance.id}"`);
    expect(html).not.toContain(`data-question="${tolerance.id}"`);
    // Owner decision 22.10.2026: the options left Design for the rule register of the IT view.
    expect(html).not.toContain('data-architecture-option="configure"');
    expect(html).toContain('IT checks where these values live:');
    expect(html).toContain('1 proposal in the IT view');
  });

  test('the Business view’s opening says one sentence and leads into Design — no rule decision', async () => {
    const mod = await load('components/workspace/RuleBasketLine.tsx');
    const html = renderToStaticMarkup(React.createElement(mod.RuleBasketLineView, { questions: 7, technical: 6, undetermined: 2, designHref: '/project/p1/design#rule-questions' }));
    expect(html).toContain('7 questions for the business · 6 technical rules stay as coded');
    expect(html).toContain('2 not determined');
    expect(html).toContain('href="/project/p1/design#rule-questions"');
    expect(html).not.toContain('data-rule-decide');
  });
});

test.describe('the register in IT, rendered', () => {
  test('grouped by basket; the technical rules have one click “Technical rules stay as coded”; an undetermined rule says why', async () => {
    const mod = await load('components/workspace/RuleDecisionFlow.tsx');
    const { ex, reading } = explain(BIG);
    const rules = editorRules(reading.ruleSet, plainWordingFor(BIG, reading.skeleton));
    const view = { formatVersion: 1, revision: 1, baselineRevision: 1, subjects: ex.rules.map((r) => ({ subject: r.id, kind: 'rule', label: r.id, detail: '', anchor: null })), entries: [], links: [] };
    const html = renderToStaticMarkup(React.createElement(mod.default, { projectId: 'p1', source: BIG, reading, rules, outcome: { ok: true, view }, view, owner: true, reload: () => {} }));
    expect(html).toContain('data-rule-topic="technical"');
    expect(html).toContain('data-rule-topic="undetermined"');
    expect(html).toContain('data-rule-keep-technical=""');
    expect(html).toContain('Technical rules stay as coded (5)');
    expect(html).toContain('not counted as confirmed by the business');
    expect(html).toContain('data-rule-said="basket"');
    // "Not business decisions" is said over the technical rules only — an undetermined rule may be one.
    expect((html.match(/Set apart — not business decisions/g) ?? []).length).toBe(1);
  });
});

test.describe('the places (source guards)', () => {
  const shell = read('components/workspace/WorkspaceShell.tsx');
  test('no rule card in the Business view; the first insights say the one sentence and offer no rule decision; the next step leads with no rule', () => {
    const block = shell.slice(shell.indexOf('    rules:'), shell.indexOf('    statusTools:'));
    expect(block).toContain('rules: null');
    expect(shell).not.toContain('<BusinessRulesEditor');
    const firstLook = read('components/workspace/FirstLook.tsx');
    // 3.0.21 (owner decisions 22.10.2026): the Business opening offers no rule action at all, the demo's
    // included; the one quiet basket line stands everywhere, and in the demo it names no Design.
    expect(firstLook).not.toContain('onDecideRules=');
    expect(firstLook).toMatch(/<RuleBasketLine [^>]*designHref=\{onReviewRules \? null : undefined\}/);
    expect(firstLook).not.toMatch(/const decideRules\b/);
    expect(shell).toContain('businessNextStep({ point: nextStep, rules: null, owner })');
    const order = shell.slice(shell.indexOf('const BUSINESS_ORDER'), shell.indexOf('];', shell.indexOf('const BUSINESS_ORDER')));
    // Where the rules card stood: under the map, which stays right under the answer (ADR-072).
    expect(order.indexOf("'process'")).toBeLessThan(order.indexOf("'rules'"));
  });

  test('the full register is in IT; the questions stand in Design beside its canvas; open questions lead there', () => {
    expect(shell).toContain('rules={<ItRuleRegister');
    const design = read('app/(app)/project/[projectId]/design/page.tsx');
    expect(design.indexOf('<RuleQuestions')).toBeGreaterThan(-1);
    // Owner decision 22.10.2026 (3.0.21, ADR-106): no longer above the canvas — handed to it as its side panel.
    expect(design).toContain('const questionsPanel = <RuleQuestions ');
    const canvas = design.slice(design.indexOf('<DesignCanvasStage'));
    expect(canvas).toContain('questions={questionsPanel}');
    const oq = read('components/workspace/OpenQuestions.tsx');
    expect(oq).toMatch(/case 'confirm-rules':[\s\S]{0,200}path: 'design'[\s\S]{0,80}RULE_QUESTIONS_ID/);
  });
});
