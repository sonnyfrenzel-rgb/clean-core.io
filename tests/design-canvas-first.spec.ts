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
import { changesTarget, questionChoices, targetQuestionGroups } from '../lib/rule-questions';
import { designProposalShown } from '../lib/design-business-answers';
import { editorRules } from '../lib/rules-editor';
import { plainWordingFor } from '../lib/business-card';
import { questionsChangeTarget, questionsWithoutImpact, wt } from '../lib/workspace-messages';

/**
 * Owner decision 22.10.2026 (roadmap 3.0.21, ADR-106 amending ADR-102's page
 * order): the Design page reads canvas first.
 *
 *   1. the canvas is the page's picture; the questions for the business stand
 *      beside it (below it on a phone) — the ones that change the target on
 *      top ("N questions change the target"), the others folded ("+ M without
 *      impact on the target"), by a deterministic rule (`changesTarget`);
 *   2. the proposal — the target on the canvas, the decision, the document
 *      with the option comparison — shows only once the questions are
 *      answered, skipped, or a design is already on record; until then a calm
 *      placeholder stands on the canvas;
 *   3. the design is still written only on the owner's click (ADR-102).
 *
 * Server-free: pure functions, server-side renders and source guards.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const PO = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');
const PAGE = 'app/(app)/project/[projectId]/design/page.tsx';
const ACCOUNT = { uid: 'u1', name: 'Buyer A' };

function explain(source: string) {
  const reading = readSource(source);
  return { ex: explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source)), reading };
}

const entriesOf = (choices: StateChoiceInput[]) =>
  Object.fromEntries(
    applyStateChoices([], choices, { account: ACCOUNT, confirmedAt: '2026-10-22T10:00:00.000Z', revision: 2 }).map((e) => [e.subject, e]),
  ) as Record<string, StateEntry>;

async function load(rel: string): Promise<Record<string, unknown>> {
  const out = path.join(ROOT, 'tmp', 'design-canvas-first', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': ROOT },
    loader: { '.css': 'empty' },
    logLevel: 'silent',
  });
  return require(out);
}

const SAY = (text: string) => ({ text, engine: text, worded: false });

test.describe('1. which questions change the target', () => {
  test('the rule: an engine proposal other than Keep, or an answer that changes or drops the rule', () => {
    const { ex } = explain(PO);
    expect(ex.questions.length).toBeGreaterThanOrEqual(3);
    const lead = (q: (typeof ex.questions)[number]) => ex.rules.find((r) => r.id === q.ruleIds[0])!;
    const kept = ex.questions.filter((q) => q.ruleIds.every((id) => ex.rules.find((r) => r.id === id)?.proposal.kind === 'keep'));
    const moved = ex.questions.filter((q) => lead(q).proposal.kind !== 'keep');
    expect(moved.length, 'the PO demo has questions whose engine proposal changes the target').toBeGreaterThan(0);
    expect(kept.length, 'and questions the engine proposes to keep as coded').toBeGreaterThan(0);
    for (const q of moved) expect(changesTarget(q, ex, null)).toBe(true);
    for (const q of kept) {
      expect(changesTarget(q, ex, null)).toBe(false);
      expect(changesTarget(q, ex, 'yes')).toBe(false);
      expect(changesTarget(q, ex, 'unsure')).toBe(false);
      // What the business says changes it, whatever the engine proposed.
      expect(changesTarget(q, ex, 'change')).toBe(true);
      expect(changesTarget(q, ex, 'drop')).toBe(true);
    }
  });

  test('the groups: open questions only, the ones that change the target first, weightiest first, five at a time', () => {
    const { ex } = explain(PO);
    const groups = targetQuestionGroups(ex, {});
    expect(groups.changing.every((s) => changesTarget(s.question, ex, s.answer))).toBe(true);
    expect(groups.quiet.every((s) => !changesTarget(s.question, ex, s.answer))).toBe(true);
    expect(groups.changingOpen + groups.quietOpen).toBe(ex.questions.length);
    expect(groups.changing.length).toBeLessThanOrEqual(5);
    // The engine's order is kept inside each group.
    const order = ex.questions.map((q) => q.id);
    const idx = groups.changing.map((s) => order.indexOf(s.question.id));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    // Answered questions leave both groups.
    const first = groups.changing[0].question;
    const after = targetQuestionGroups(ex, entriesOf(questionChoices(first, 'yes', '')));
    expect([...after.changing, ...after.quiet].some((s) => s.question.id === first.id)).toBe(false);
    expect(after.changingOpen + after.quietOpen).toBe(ex.questions.length - 1);
  });

  test('rendered: "N questions change the target" on top, "+ M without impact on the target" folded', async () => {
    const mod = await load('components/design/RuleQuestions.tsx');
    const { ex, reading } = explain(PO);
    const rules = editorRules(reading.ruleSet, plainWordingFor(PO, reading.skeleton));
    const groups = targetQuestionGroups(ex, {});
    const html = renderToStaticMarkup(
      React.createElement(mod.RuleQuestionsView as React.FC<Record<string, unknown>>, {
        explanation: ex, entries: {}, rules, owner: true, busy: false, error: null, recorded: false, onRecord: () => {}, say: SAY, registerHref: null,
      }),
    );
    expect(html).toContain(`data-questions-changing="${groups.changingOpen}"`);
    expect(html).toContain(`>${questionsChangeTarget(groups.changingOpen)}<`);
    expect(html).toContain(wt('questions.changingNote'));
    const quiet = html.slice(html.indexOf('data-questions-quiet='));
    expect(quiet).toContain(questionsWithoutImpact(groups.quietOpen));
    expect(quiet.slice(0, quiet.indexOf('data-question="'))).toContain('data-cc-disclosure="closed"');
    // The changing ones stand before the fold.
    expect(html.indexOf('data-questions-changing=')).toBeLessThan(html.indexOf('data-questions-quiet='));
  });

  test('the words', () => {
    expect(questionsChangeTarget(1)).toBe('1 question changes the target');
    expect(questionsChangeTarget(3)).toBe('3 questions change the target');
    expect(questionsWithoutImpact(4)).toBe('+ 4 without impact on the target');
    expect(wt('design.targetAfterQuestions')).toBe('The target appears after the questions — or skip them.');
    expect(wt('design.skipQuestions')).toBe('Skip questions');
  });
});

test.describe('2. the proposal waits for the questions', () => {
  test('shown once every question has an answer (or none is asked), on Skip, or with a design on record', () => {
    expect(designProposalShown({ gate: { kind: 'reading' }, skipped: false, hasDesign: false })).toBe(false);
    expect(designProposalShown({ gate: { kind: 'open', open: 3 }, skipped: false, hasDesign: false })).toBe(false);
    expect(designProposalShown({ gate: { kind: 'ready' }, skipped: false, hasDesign: false })).toBe(true);
    expect(designProposalShown({ gate: { kind: 'open', open: 3 }, skipped: true, hasDesign: false })).toBe(true);
    expect(designProposalShown({ gate: { kind: 'reading' }, skipped: true, hasDesign: false })).toBe(true);
    expect(designProposalShown({ gate: { kind: 'open', open: 3 }, skipped: false, hasDesign: true })).toBe(true);
  });

  const BASE = {
    evidence: { state: 'loading' },
    model: null,
    targetLine: 'Edition not determined',
    targetKpi: { value: 'Not determined', sub: null },
    confidence: null,
    storedRoute: null,
    confirmed: null,
    stale: false,
    hasDocument: false,
    canSignOff: false,
    signOffPanel: null,
    locked: false,
    onRegenerate: () => {},
    regenerateDisabled: false,
    regenerating: false,
    legacyCode: '',
    sections: [],
    documentFallback: React.createElement('p', { 'data-test-fallback': '' }, 'Generate the design'),
    documentNotice: null,
    routingRationale: null,
    view: 'canvas',
  };

  test('rendered, before: the placeholder on the canvas, the questions beside it, no proposal anywhere', async () => {
    const mod = await load('components/design/DesignCanvasStage.tsx');
    const Stage = mod.default as React.FC<Record<string, unknown>>;
    const html = renderToStaticMarkup(
      React.createElement(Stage, {
        ...BASE,
        proposalShown: false,
        pending: React.createElement('p', { 'data-test-pending': '' }, 'The target appears after the questions — or skip them.'),
        questions: React.createElement('div', { 'data-test-questions': '' }, 'Questions for the business'),
      }),
    );
    expect(html).toContain('data-design-pending=""');
    expect(html).toContain('data-test-pending=""');
    expect(html).toContain('data-design-panel="questions"');
    expect(html).toContain('data-design-questions="open"');
    expect(html).toContain('data-test-questions=""');
    expect(html).not.toContain('data-design-questions-toggle');
    // No proposal: no route KPI, no decision, no alternatives, no drawer with the document and its comparison.
    expect(html).not.toContain('data-design-kpi=');
    expect(html).not.toContain('data-design-answer=');
    expect(html).not.toContain('data-design-drawer');
    expect(html).not.toContain('data-test-fallback');
    expect(html).not.toContain('data-design-confirm=');
    // The canvas comes first, the questions after it — beside it from L, below it on a phone.
    expect(html.indexOf('aria-label="Target architecture canvas"')).toBeLessThan(html.indexOf('data-test-questions'));
  });

  test('rendered, after: the decision and the drawer, the questions folded to their line while none is open', async () => {
    const mod = await load('components/design/DesignCanvasStage.tsx');
    const Stage = mod.default as React.FC<Record<string, unknown>>;
    const html = renderToStaticMarkup(
      React.createElement(Stage, {
        ...BASE,
        proposalShown: true,
        questionsSummary: 'Business questions · 7 of 7 answered',
        questionsOpenFirst: false,
        questions: React.createElement('div', { 'data-test-questions': '' }, 'Questions for the business'),
      }),
    );
    expect(html).toContain('data-design-panel="decision"');
    expect(html).toContain('data-design-answer=');
    expect(html).toContain('data-design-drawer=""');
    expect(html).toContain('data-test-fallback=""');
    expect(html).toContain('data-design-questions="folded"');
    expect(html).toContain('Business questions · 7 of 7 answered');
    // Folded, still in the page: the panel keeps telling the page what is answered.
    expect(html).toContain('data-test-questions=""');
    expect(html).not.toContain('data-design-pending=""');
  });

  test('rendered, after a skip: the questions stay open beside the decision', async () => {
    const mod = await load('components/design/DesignCanvasStage.tsx');
    const Stage = mod.default as React.FC<Record<string, unknown>>;
    const html = renderToStaticMarkup(
      React.createElement(Stage, {
        ...BASE,
        proposalShown: true,
        questionsSummary: 'Business questions · 2 of 7 answered',
        questionsOpenFirst: true,
        questions: React.createElement('div', { 'data-test-questions': '' }, 'Questions for the business'),
      }),
    );
    expect(html).toContain('data-design-questions="open"');
    expect(html).toContain('aria-expanded="true"');
  });

  test('the demo keeps its page: without questions the proposal always shows', async () => {
    const demo = read('components/demo/DemoDesign.tsx');
    expect(demo).not.toContain('proposalShown');
    const mod = await load('components/design/DesignCanvasStage.tsx');
    const html = renderToStaticMarkup(React.createElement(mod.default as React.FC<Record<string, unknown>>, BASE));
    expect(html).toContain('data-design-drawer=""');
    expect(html).not.toContain('data-design-questions');
  });
});

test.describe('3. the page', () => {
  test('canvas first, the questions handed to it, the proposal gated, Skip on the placeholder; still written only on a click', () => {
    const page = read(PAGE);
    const ret = page.slice(page.lastIndexOf('  return (\n    <StageFrame'));
    // No questions above the canvas any more.
    expect(ret.indexOf('<RuleQuestions')).toBe(-1);
    expect(page).toContain('const questionsPanel = <RuleQuestions project={project} projectId={projectId as string} onAnswers={setBusinessAnswers} />;');
    const canvas = ret.slice(ret.indexOf('<DesignCanvasStage'));
    for (const prop of ['questions={questionsPanel}', 'proposalShown={proposalShown}', 'pending={proposalPending}', 'questionsSummary={questionsSummary}', 'questionsOpenFirst={questionsOpenFirst}']) {
      expect(canvas, prop).toContain(prop);
    }
    expect(page).toContain("const proposalShown = designProposalShown({ gate: writeGate, skipped, hasDesign: Boolean(design) });");
    expect(page).toMatch(/onClick=\{skipQuestions\} data-design-skip-questions=""/);
    // Skipping is a view of this tab: nothing reaches the project.
    const skip = page.slice(page.indexOf('const skipQuestions'), page.indexOf('}, [skipKey]);'));
    expect(skip).not.toMatch(/updateDoc|runTransaction|runProjectCommand|fetch\(/);
    // ADR-102 stands: nothing starts a generation by itself.
    expect(page).not.toMatch(/generateDesign(?:Ref\.current)?\([^)]*'open'\)/);
  });
});
