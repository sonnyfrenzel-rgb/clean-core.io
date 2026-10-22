import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource } from '../lib/first-look';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { applyStateChoices, type StateChoiceInput, type StateEntry } from '../lib/process-states';
import { acceptAllChoices, questionChoices, recommendedAnswerOf, type QuestionAnswer } from '../lib/rule-questions';
import {
  ANSWERS_READING,
  BUSINESS_ANSWERS_PROMPT_RULE,
  NO_ANSWERS_DIGEST,
  NO_BUSINESS_QUESTIONS,
  businessAnswersDigest,
  businessAnswersMoved,
  businessAnswersOf,
  businessAnswersPromptRule,
  businessAnswersSection,
  designWriteEnabled,
  designWriteGate,
  storedBusinessAnswersBasis,
  withBusinessAnswersBasis,
} from '../lib/design-business-answers';
import { designOpenQuestions, itProposals, wt } from '../lib/workspace-messages';
import { checkDesignResponse, cleanAndParseJSON } from '../lib/design-response';
import { editorRules } from '../lib/rules-editor';
import { plainWordingFor } from '../lib/business-card';
import { DESIGN_WRITE_COST } from '../lib/model-stages';
import { PHASE_PURPOSE } from '../lib/workflow-steps';
import { machineStringsIn } from './helpers/machine-strings';

/**
 * Owner decisions of 22.10.2026 for the Design stage:
 *
 *   1. the business questions first, the design on a click — never written on
 *      opening; "Generate the design" waits until every question has an answer,
 *      with the reason under it and "Write it without the open answers" beside;
 *   2. the answers flow into the design prompt as given requirements, and a
 *      digest of them, stored inside the design, marks a design written before
 *      an answer changed as needing regeneration;
 *   3. every question row frames the recommended answer, with its reason, and
 *      nothing is pre-selected;
 *   4. the architecture options for IT live in the rule register of the IT view;
 *      Design says in one line how many there are;
 *   5. "Every question has an answer." is said once.
 *
 * Server-free: pure functions, server-side renders and source guards.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const PO = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');
const ACCOUNT = { uid: 'u1', name: 'Buyer A' };
const PAGE = 'app/(app)/project/[projectId]/design/page.tsx';

function explain(source: string) {
  const reading = readSource(source);
  return { ex: explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source)), reading };
}

const entriesOf = (choices: StateChoiceInput[], held: StateEntry[] = [], revision = 2) => {
  const list = applyStateChoices(held, choices, { account: ACCOUNT, confirmedAt: '2026-10-22T10:00:00.000Z', revision });
  return { list, byId: Object.fromEntries(list.map((e) => [e.subject, e])) as Record<string, StateEntry> };
};

/** Every question of PO answered: the first Change, the second Drop, the third someone else, the rest Yes. */
function answeredPo() {
  const { ex, reading } = explain(PO);
  expect(ex.questions.length, 'the PO demo asks the business at least three questions').toBeGreaterThanOrEqual(3);
  const plan: Array<[QuestionAnswer, string]> = [
    ['change', '500 EUR'],
    ['drop', ''],
    ['unsure', 'purchasing'],
  ];
  const choices = ex.questions.flatMap((q, i) => (plan[i] ? questionChoices(q, plan[i][0], plan[i][1]) : questionChoices(q, 'yes', '')));
  return { ex, reading, ...entriesOf(choices) };
}

async function load(rel: string): Promise<Record<string, (props: Record<string, unknown>) => React.ReactElement | null>> {
  const out = path.join(ROOT, 'tmp', 'design-questions-first', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
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
  return require(out);
}

const SAY = (text: string) => ({ text, engine: text, worded: false });

async function renderQuestions(entries: Record<string, StateEntry>, recorded = false): Promise<string> {
  const mod = await load('components/design/RuleQuestions.tsx');
  const { ex, reading } = explain(PO);
  const rules = editorRules(reading.ruleSet, plainWordingFor(PO, reading.skeleton));
  return renderToStaticMarkup(
    React.createElement(mod.RuleQuestionsView, { explanation: ex, entries, rules, owner: true, busy: false, error: null, recorded, onRecord: () => {}, say: SAY, registerHref: '/project/p1?view=it#business-rules' }),
  );
}

test.describe('1. questions first, the design on a click', () => {
  test('the gate: reading waits, open questions wait with their count, all answered or none asked is enabled', () => {
    expect(designWriteGate(ANSWERS_READING)).toEqual({ kind: 'reading' });
    expect(designWriteEnabled(designWriteGate(ANSWERS_READING))).toBe(false);
    expect(designWriteEnabled(designWriteGate(NO_BUSINESS_QUESTIONS))).toBe(true);

    const { ex } = explain(PO);
    const none = businessAnswersOf(ex, {});
    expect(designWriteGate(none)).toEqual({ kind: 'open', open: ex.questions.length });
    expect(designWriteEnabled(designWriteGate(none))).toBe(false);

    // "Someone else decides" is still open, as the progress line counts it.
    const all = answeredPo();
    const reading = businessAnswersOf(all.ex, all.byId);
    expect(reading.open).toBe(1);
    expect(designWriteGate(reading)).toEqual({ kind: 'open', open: 1 });

    // Accept all proposals answers every one of them.
    const accepted = entriesOf(acceptAllChoices(ex, {}));
    expect(designWriteEnabled(designWriteGate(businessAnswersOf(ex, accepted.byId)))).toBe(true);
  });

  test('the words: the reason under the action and the secondary action', () => {
    expect(designOpenQuestions(3)).toBe('Answer the 3 open business questions first');
    expect(designOpenQuestions(1)).toBe('Answer the 1 open business question first');
    expect(wt('design.writeWithoutOpen')).toBe('Write it without the open answers');
    expect(wt('design.generate')).toBe('Generate the design');
    expect(machineStringsIn([designOpenQuestions(3), wt('design.writeWithoutOpen'), wt('design.readingQuestions'), wt('design.answersMoved')].join(' '))).toEqual([]);
    // Nothing says any more that opening Design writes the design.
    expect(PHASE_PURPOSE.design).not.toMatch(/Opening it writes/);
    expect(PHASE_PURPOSE.design).toMatch(/business questions come first/);
    expect(DESIGN_WRITE_COST).toMatch(/on your click/);
    expect(DESIGN_WRITE_COST).toMatch(/not counted against your analysis runs/);
  });

  test('the page starts no generation by itself and gates its action; every guard of the generation stays', () => {
    const page = read(PAGE);
    expect(page).not.toMatch(/autoStart/);
    expect(page).not.toMatch(/generateDesign(?:Ref\.current)?\([^)]*'open'\)/);
    expect(page).toContain('onAnswers={setBusinessAnswers}');
    expect(page).toContain('const writeGate = designWriteGate(businessAnswers);');
    expect(page).toMatch(/disabled=\{!designWriteEnabled\(writeGate\)\}[\s\S]{0,200}data-design-generate=""/);
    expect(page).toMatch(/writeGate\.kind === 'open' \? designOpenQuestions\(writeGate\.open\)/);
    expect(page).toContain('data-design-generate-without=""');
    // The guards: the lease, the ceiling, the run that moved, the size check.
    expect(page).toContain('claimDesignLease(id, DESIGN_TAB)');
    expect(page).toContain('Promise.race([callGemini(prompt, PRODUCT_GEMINI_MODEL, true, \'design\'), ceiling])');
    expect(page).toContain("if ((snap.data()?.activeRunId ?? null) !== writtenFromRun)");
    expect(page).toMatch(/checkProjectWrite\(\s*snap\.data\(\),\s*\{ solutionDesign: responseText/);
  });
});

test.describe('2. the answers flow into the design', () => {
  test('the section: answers as given requirements, the dropped left out, someone else and the unanswered open', () => {
    const { ex, byId } = answeredPo();
    const reading = businessAnswersOf(ex, byId);
    const section = businessAnswersSection(reading);
    const [changed, dropped, other, kept] = ex.questions;
    expect(section).toMatch(/^BUSINESS ANSWERS \(recorded in Design by the owner of the project/);
    expect(section).toContain(`${changed.ruleIds.join(', ')}: ${changed.statement.text.trim()} — Answer: change it; it should be: 500 EUR.`);
    expect(section).toContain(`${dropped.ruleIds.join(', ')}: ${dropped.statement.text.trim()} — Answer: not needed any more; leave it out of the design.`);
    expect(section).toContain(`${other.ruleIds.join(', ')}: ${other.statement.text.trim()} — Open: someone else decides (purchasing).`);
    if (kept) expect(section).toContain(`${kept.ruleIds.join(', ')}: ${kept.statement.text.trim()} — Answer: keep it as coded.`);
    expect(section).toContain(`OPEN BUSINESS QUESTIONS (1 of ${ex.questions.length} open when this design was written`);
    // The default reason of a Drop is not repeated as if it were the reader's words.
    expect(section).not.toContain('Reason given: Not needed any more.');
  });

  test('written without the open answers: each unanswered question is named as open', () => {
    const { ex } = explain(PO);
    const section = businessAnswersSection(businessAnswersOf(ex, {}));
    expect(section).toContain('- None answered yet.');
    expect((section.match(/Open: not answered when this design was written\./g) ?? []).length).toBe(ex.questions.length);
  });

  test('the rule beside the other prompt rules: design in, leave out, keep open, mark as set by the business', () => {
    expect(BUSINESS_ANSWERS_PROMPT_RULE).toMatch(/Design every changed value in/);
    expect(BUSINESS_ANSWERS_PROMPT_RULE).toMatch(/Leave every rule the business no longer needs out of the design/);
    expect(BUSINESS_ANSWERS_PROMPT_RULE).toMatch(/stays open: do not decide it/);
    expect(BUSINESS_ANSWERS_PROMPT_RULE).toContain('(set by the business)');
    // Nothing is added for a program that asks the business nothing, or before the answers are read.
    expect(businessAnswersPromptRule(NO_BUSINESS_QUESTIONS)).toBe('');
    expect(businessAnswersPromptRule(ANSWERS_READING)).toBe('');
    expect(businessAnswersSection(NO_BUSINESS_QUESTIONS)).toBe('');
    expect(businessAnswersSection(ANSWERS_READING)).toBe('');
    const page = read(PAGE);
    expect(page).toContain('const answersPart = businessAnswersSection(answers);');
    expect((page.match(/\$\{answersRule \? `/g) ?? []).length, 'the rule is in the RAP and the CAP prompt').toBe(2);
    expect(page).toMatch(/designContextFor\(\s*analysis,\s*engineEvidenceRef\.current,[\s\S]{0,300}answersAtStart,\s*\)/);
  });

  test('the basis: stored inside the design, the design still reads as one; an answer changed afterwards makes it stale', () => {
    const { ex, byId, list } = answeredPo();
    const reading = businessAnswersOf(ex, byId);
    const digest = businessAnswersDigest(reading);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    const model = JSON.stringify({ projectName: 'P', architectureOverview: { approachDescription: 'A' }, nodeAppBlueprint: { projectStructure: [], apiEndpoints: [] }, cloudServices: [], dataSync: { patternName: 'x', description: 'y' }, securityHardening: [], roadmap: [{ phase: '0', title: 't', deliverables: [] }] });
    const stored = withBusinessAnswersBasis('```json\n' + model + '\n```', digest);
    expect(storedBusinessAnswersBasis(stored)).toBe(digest);
    expect(checkDesignResponse(stored).ok).toBe(true);
    expect((cleanAndParseJSON(stored) as { projectName: string }).projectName).toBe('P');
    expect(businessAnswersMoved(stored, reading)).toBe(false);

    // One answer changed after the design: it needs regeneration.
    const changed = entriesOf(questionChoices(ex.questions[1], 'change', '20 days'), list, 3);
    expect(businessAnswersMoved(stored, businessAnswersOf(ex, changed.byId))).toBe(true);
    // Order-free and stable.
    expect(businessAnswersDigest(businessAnswersOf(ex, byId))).toBe(digest);
    // Nothing moves while the answers are read.
    expect(businessAnswersMoved(stored, ANSWERS_READING)).toBe(false);
  });

  test('a design written before the basis existed reads as written with no answer', () => {
    const old = '{"projectName":"P"}';
    expect(storedBusinessAnswersBasis(old)).toBeNull();
    expect(businessAnswersDigest(NO_BUSINESS_QUESTIONS)).toBe(NO_ANSWERS_DIGEST);
    const { ex, byId } = answeredPo();
    expect(businessAnswersMoved(old, businessAnswersOf(ex, {}))).toBe(false);
    expect(businessAnswersMoved(old, businessAnswersOf(ex, byId))).toBe(true);
  });

  test('the page stores the basis with the design and counts the moved answers as stale', () => {
    const page = read(PAGE);
    expect(page).toContain("if (answersAtStart.state === 'ready') responseText = withBusinessAnswersBasis(responseText, businessAnswersDigest(answersAtStart));");
    // After the shape check and the NFR call, before the one write.
    expect(page.indexOf('responseText = withBusinessAnswersBasis(')).toBeGreaterThan(page.indexOf('callGemini(nfrPrompt'));
    expect(page.indexOf('responseText = withBusinessAnswersBasis(')).toBeLessThan(page.indexOf('tx.update(projectDoc'));
    expect(page).toMatch(/tx\.update\(projectDoc, \{\s*solutionDesign: responseText,/);
    expect(page).toContain('const answersMoved = businessAnswersMoved(design, businessAnswers);');
    expect(page).toContain('const designStale = Boolean(design) && (stale.design || answersMoved);');
    expect(page).toContain("...(answersMoved && !stale.sourceChanged ? [wt('design.answersMoved')] : []),");
  });
});

test.describe('3. the recommended answer in every row', () => {
  test('read from the weightiest rule’s proposal: configuration and SAP standard are a Yes', () => {
    const { ex } = explain(PO);
    for (const q of ex.questions) {
      const r = recommendedAnswerOf(q, ex)!;
      const kind = ex.rules.find((e) => e.id === q.ruleIds[0])!.proposal.kind;
      expect(r.answer).toBe(kind === 'change-value' ? 'change' : kind === 'drop' ? 'drop' : 'yes');
      expect(r.reason.text.length).toBeGreaterThan(10);
    }
    expect(recommendedAnswerOf({ ruleIds: ['BR-999'] }, ex)).toBeNull();
  });

  test('rendered: one framed answer with a “Recommended” label, its reason under the row by aria-describedby, nothing pre-selected', async () => {
    const html = await renderQuestions({});
    const { ex } = explain(PO);
    const cards = html.split('data-question="').slice(1);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards.map((c) => c.slice(0, c.indexOf('</li>')))) {
      expect((card.match(/data-question-recommended=""/g) ?? []).length).toBe(1);
      expect((card.match(/data-question-recommended-label=""/g) ?? []).length).toBe(1);
      expect(card).toContain('>Recommended<');
      const at = card.indexOf('data-question-recommended=""');
      const button = card.slice(card.lastIndexOf('<button', at), card.indexOf('>', at));
      expect(button).toContain('ring-cc-brand-strong');
      const described = /aria-describedby="([^"]+)"/.exec(button)?.[1];
      expect(described).toBeTruthy();
      expect(card).toContain(`id="${described}"`);
      expect(card).toMatch(/data-question-recommended-reason="(yes|change|drop)"/);
      expect(card).toContain('Why recommended:');
      expect(card).not.toContain('aria-checked="true"');
    }
    expect(cards.length).toBe(Math.min(ex.questions.length, 5));
  });
});

test.describe('4. the architecture options for IT live in the IT view', () => {
  test('Design says one line with the count and the link to the register; no option and no take button', async () => {
    const { ex, reading } = explain(PO);
    const tolerance = ex.questions.find((q) => q.ruleIds.some((id) => /lv_dev_pct > 5/.test(reading.ruleSet.rules.find((r) => r.id === id)?.label ?? '')))!;
    const { byId } = entriesOf(questionChoices(tolerance, 'yes', ''));
    const html = await renderQuestions(byId);
    expect(html).not.toContain('data-architecture-option=');
    expect(html).not.toContain('data-architecture-take=');
    expect(html).not.toContain('Architecture options for IT');
    expect(html).toContain('data-architecture-pointer=""');
    expect(html).toContain('IT checks where these values live:');
    const pointer = html.slice(html.indexOf('data-architecture-pointer=""'), html.indexOf('</p>', html.indexOf('data-architecture-pointer=""')));
    const link = pointer.slice(pointer.lastIndexOf('<a', pointer.indexOf('data-architecture-pointer-link=""')));
    expect(link).toContain('href="/project/p1?view=it#business-rules"');
    expect(link).toContain('1 proposal in the IT view');
    expect(itProposals(3)).toBe('3 proposals in the IT view');
  });

  test('the IT register renders them with “Take the proposal”, recording the same choice', async () => {
    const mod = await load('components/workspace/RuleDecisionFlow.tsx');
    const { ex, reading } = explain(PO);
    const tolerance = ex.questions.find((q) => q.ruleIds.some((id) => /lv_dev_pct > 5/.test(reading.ruleSet.rules.find((r) => r.id === id)?.label ?? '')))!;
    const { list } = entriesOf(questionChoices(tolerance, 'yes', ''), [], 2);
    const rules = editorRules(reading.ruleSet, plainWordingFor(PO, reading.skeleton));
    const view = { formatVersion: 1, revision: 2, baselineRevision: 1, subjects: ex.rules.map((r) => ({ subject: r.id, kind: 'rule', label: r.id, detail: '', anchor: null })), entries: list, links: [] };
    const props = { projectId: 'p1', source: PO, reading, rules, outcome: { ok: true, view }, view, owner: true, reload: () => {} };
    const it = renderToStaticMarkup(React.createElement(mod.default, { ...props, withArchitectureOptions: true }));
    expect(it).toContain('id="architecture-options"');
    expect(it).toContain('Architecture options for IT');
    expect(it).toContain('data-architecture-option="configure"');
    expect(it).toContain('Keep the value in configuration');
    expect(it).toContain('data-architecture-take=');
    // Elsewhere the register carries no options.
    expect(renderToStaticMarkup(React.createElement(mod.default, props))).not.toContain('data-architecture-option=');
    // The same stored record: architectureChoice on top of the answer on record.
    const flow = read('components/workspace/RuleDecisionFlow.tsx');
    expect(flow).toContain('record([architectureChoice(o, entries[o.ruleId])])');
    expect(read('components/workspace/ItRuleRegister.tsx')).toContain('withArchitectureOptions={true}');
    expect(read('components/design/RuleQuestions.tsx')).not.toContain('architectureChoice');
  });
});

test.describe('5. “Every question has an answer.” is said once', () => {
  test('right after the last answer, and on a later visit', async () => {
    const { ex } = explain(PO);
    const all = entriesOf(acceptAllChoices(ex, {}));
    for (const recorded of [true, false]) {
      const html = await renderQuestions(all.byId, recorded);
      expect((html.match(/Every question has an answer\./g) ?? []).length, `recorded: ${recorded}`).toBe(1);
    }
  });
});

test('Regenerate and Try again wait for the business answers like the first write (owner decision 22.10.2026)', () => {
  const page = read('app/(app)/project/[projectId]/design/page.tsx');
  const regen = page.slice(page.indexOf('data-design-regenerate=""') - 600, page.indexOf('data-design-regenerate=""'));
  expect(regen).toContain('!designWriteEnabled(writeGate)');
  expect(page).toContain('data-design-regenerate-reason=""');
  expect(page).toContain("wt('design.regenerateWithoutOpen')");
  const retry = page.slice(page.indexOf('const designErrorStrip'), page.indexOf('</CcMessageStrip>', page.indexOf('const designErrorStrip')));
  expect(retry).toContain('disabled={!designWriteEnabled(writeGate)}');
  expect(wt('design.regenerateWithoutOpen')).toBe('Regenerate without the open answers');
});
