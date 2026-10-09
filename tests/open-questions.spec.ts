import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  basisOf,
  checkOpenAnswerBody,
  groupConstructs,
  openQuestions,
  openQuestionBases,
  openQuestionsLine,
  readStoredAnswers,
  OPEN_QUESTION_ACTIONS,
} from '../lib/open-questions';
import { validateProjectCommand, SERVER_ONLY_PROJECT_FIELDS, fieldsWrittenByCommands } from '../lib/project-commands';
import type { NotDetermined, NotDeterminedItem } from '../lib/workspace-model';

/**
 * ADR-081 — "Not determined" becomes open questions you can close, with less,
 * not more (owner decision 06.10.2026). Pure: the grouping by the action that
 * resolves each question, the three end states, the one line, the command that
 * stores an answer — and source guards for what went in exchange.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

const item = (gap: NotDeterminedItem['gap'], line: number, label = String(gap)): NotDeterminedItem => ({
  label,
  why: `The engine's reason for ${label}.`,
  anchor: `L${line}`,
  gap,
});
const nd = (items: NotDeterminedItem[]): NotDetermined => ({ items, count: items.length, noSource: false });

const ALL = nd([
  item('local-function-call', 10, 'Local function-module call'),
  item('include-not-read', 20, 'Include whose source was not uploaded'),
  item('dynamic-invocation', 30, 'Dynamic call or field access'),
  item('classic-list-output', 40, 'Classic list output'),
  item('macro', 50, 'Macro definition'),
  item('local-function-call', 60, 'Local function-module call'),
  item('file-io', 70, 'Application-server file access'),
]);

test.describe('grouped by the action that resolves each question', () => {
  test('every engine kind lands in its action, and list output and macros are the limits sentence', () => {
    const q = openQuestions({ open: ALL, project: { s4Deployment: '' }, rules: { total: 3, open: ['BR-001', 'BR-002'] } });
    const by = Object.fromEntries(q.groups.map((g) => [g.action, g]));
    expect(by['add-includes'].count).toBe(1);
    expect(by['name-call-target'].count).toBe(1);
    expect(by['add-atc'].count).toBe(3);
    expect(by['choose-target'].end).toBe('open');
    expect(by['add-usage'].end).toBe('open');
    expect(by['confirm-rules'].count).toBe(2);
    // Not questions: nobody can answer them.
    const lines = q.groups.flatMap((g) => g.lines.map((l) => l.anchor));
    expect(lines).not.toContain('L40');
    expect(lines).not.toContain('L50');
    expect(q.limits).toMatch(/classic list output \(1 place\) or macro definition \(1 place\)/);
    // Only actions of the closed list, each group with an owner.
    for (const g of q.groups) {
      expect(OPEN_QUESTION_ACTIONS).toContain(g.action);
      expect(['IT', 'Business', 'Management']).toContain(g.owner);
    }
  });

  test('blocking groups first; the line counts questions, the blocking ones and names the top', () => {
    const q = openQuestions({ open: ALL, project: {}, rules: { total: 3, open: ['BR-001', 'BR-002'] } });
    expect(q.groups[0].blocksDecision).toBe(true);
    // includes 1 + call 1 + atc 3 + target 1 + usage 1 + rules 2
    expect(q.open).toBe(9);
    // includes 1 + target 1 + rules 2
    expect(q.blocking).toBe(4);
    expect(openQuestionsLine(q)).toBe(`9 open questions · 4 block the decision · top: ${q.groups[0].title}`);
  });

  test('no source is said as such, never as "no open questions"', () => {
    const q = openQuestions({ open: { items: [], count: 0, noSource: true }, project: { s4Deployment: 'public' }, rules: null });
    expect(q.noSource).toBe(true);
    expect(q.groups.map((g) => g.action)).toEqual(['add-usage', 'choose-target']);
    expect(openQuestionsLine(openQuestions({ open: { items: [], count: 0, noSource: true }, project: { s4Deployment: 'public', usageReport: { records: [{}] } }, rules: null }))).toMatch(/No source staged/);
  });

  test('unknown rule answers leave the rules group out instead of guessing', () => {
    const q = openQuestions({ open: nd([]), project: {}, rules: null });
    expect(q.groups.find((g) => g.action === 'confirm-rules')).toBeUndefined();
  });
});

test.describe('three end states — and the value stays Not determined', () => {
  test('resolved by evidence is computed: usage imported, target declared, ATC imported, every rule answered', () => {
    const q = openQuestions({
      open: nd([item('file-io', 7)]),
      project: { s4Deployment: 'private', usageReport: { records: [{}, {}] }, atcReport: { findings: [] } },
      rules: { total: 2, open: [] },
    });
    for (const g of q.groups) expect(g.end, g.action).toBe('resolved');
    expect(q.open).toBe(0);
    expect(openQuestionsLine(q)).toBe('No open questions');
    // The engine's lines stay with the group: nothing is dropped, nothing re-graded.
    expect(q.groups.find((g) => g.action === 'add-atc')!.lines).toHaveLength(1);
  });

  test('answered and accepted hold only for the questions they answered', () => {
    const open = nd([item('dynamic-invocation', 30)]);
    const basis = basisOf('name-call-target', ['L30:dynamic-invocation']);
    const answered = openQuestions({
      open,
      project: { openQuestions: { 'name-call-target': { state: 'answered', text: 'Calls ZFM_X', account: 'a@b.c', at: '2026-10-09T00:00:00Z', basis } } },
      rules: null,
    });
    const g = answered.groups.find((x) => x.action === 'name-call-target')!;
    expect(g.end).toBe('answered');
    expect(g.answer?.text).toBe('Calls ZFM_X');
    // Another source, another question: open again, the old answer shown as outdated.
    const moved = openQuestions({
      open: nd([item('dynamic-invocation', 31)]),
      project: { openQuestions: { 'name-call-target': { state: 'accepted', text: 'Known', account: 'a@b.c', at: 'x', basis } } },
      rules: null,
    }).groups.find((x) => x.action === 'name-call-target')!;
    expect(moved.end).toBe('open');
    expect(moved.outdated?.text).toBe('Known');
  });

  test('a stored record that is not one is ignored', () => {
    expect(readStoredAnswers({ 'add-usage': { state: 'proven', text: 'x', account: 'a', at: 'b', basis: 'add-usage-1-x' } })).toEqual({});
    expect(readStoredAnswers({ nope: { state: 'answered', text: 'x', account: 'a', at: 'b', basis: 'b' } })).toEqual({});
  });
});

test.describe("SAP's catalog answers local function-module calls (roadmap 3.0.6)", () => {
  const calls = nd([
    item('local-function-call', 10, 'Local function-module call'),
    item('local-function-call', 60, 'Local function-module call'),
    item('file-io', 70, 'Application-server file access'),
  ]);
  const answer = (line: number, name: string) => ({
    name,
    state: 'classicAPI',
    answer: `SAP's classification file lists function module ${name} as a classic API (classicAPI): classic ABAP may call it. This is SAP's published classification of the function module, not a check of what this call does at runtime.`,
    line,
  });
  const atcOf = (catalog: Parameters<typeof openQuestions>[0]['catalog']) =>
    openQuestions({ open: calls, project: {}, rules: null, catalog }).groups.find((g) => g.action === 'add-atc')!;

  test('an answered call is no question; its line keeps SAP’s sentence, never a level', () => {
    const g = atcOf({ status: 'ready', answered: [answer(10, 'BAPI_PO_GETDETAIL')] });
    expect(g.end).toBe('open');
    expect(g.count).toBe(2);
    const line = g.lines.find((l) => l.anchor === 'L10')!;
    expect(line.catalog).toMatchObject({ name: 'BAPI_PO_GETDETAIL', state: 'classicAPI' });
    expect(line.catalog!.answer).toContain('not a check of what this call does at runtime');
    expect(JSON.stringify(g)).not.toMatch(/"grade"|"level"/);
    // A file access is never answered by the catalog.
    expect(g.lines.find((l) => l.anchor === 'L70')!.catalog).toBeUndefined();
  });

  test('every call answered and no file access left: resolved by evidence, from SAP’s catalog', () => {
    const onlyCalls = nd(calls.items.slice(0, 2));
    const g = openQuestions({
      open: onlyCalls,
      project: {},
      rules: null,
      catalog: { status: 'ready', answered: [answer(10, 'A'), answer(60, 'B')] },
    }).groups.find((x) => x.action === 'add-atc')!;
    expect(g.end).toBe('resolved');
    expect(g.evidence).toMatch(/SAP's catalog answers all 2 function-module calls/);
    expect(g.evidence).toContain('not a check of what the call does at runtime');
  });

  test('while the lookup loads or after it failed, the calls stay questions — and the basis never moves', () => {
    const loading = atcOf({ status: 'loading', answered: [] });
    const failed = atcOf({ status: 'failed', answered: [] });
    const none = atcOf(null);
    const ready = atcOf({ status: 'ready', answered: [answer(10, 'A')] });
    expect([loading.count, failed.count, none.count]).toEqual([3, 3, 3]);
    expect(loading.catalogPending).toBe(true);
    expect(failed.catalogPending).toBe(false);
    expect(new Set([loading.basis, failed.basis, none.basis, ready.basis]).size).toBe(1);
    // An answer from the matching line only: a stale "ready" for another line answers nothing.
    expect(atcOf({ status: 'ready', answered: [answer(11, 'A')] }).count).toBe(3);
  });

  test('the one line does not print a count that is about to fall', () => {
    const q = openQuestions({ open: calls, project: {}, rules: null, catalog: { status: 'loading', answered: [] } });
    expect(q.catalogPending).toBe(true);
    expect(openQuestionsLine(q)).toMatch(/Reading SAP.s catalog/);
    const done = openQuestions({ open: calls, project: {}, rules: null, catalog: { status: 'failed', answered: [] } });
    expect(done.catalogPending).toBe(false);
    expect(openQuestionsLine(done)).toMatch(/open questions/);
  });

  test('the browser asks the server: the hook goes through /api/abcd-classify and never imports the catalog', () => {
    const hook = read('hooks/useFunctionModuleAnswers.ts');
    expect(hook).toContain("fetch('/api/abcd-classify'");
    expect(hook).toContain('functionModules: names');
    expect(hook).not.toMatch(/catalog-service|abcd-classification/);
    for (const rel of ['lib/open-questions.ts', 'hooks/useOpenQuestions.ts', 'components/workspace/OpenQuestions.tsx']) {
      expect(read(rel), rel).not.toContain('catalog-service');
    }
    const route = read('app/api/abcd-classify/route.ts');
    expect(route).toMatch(/functionModuleCatalogAnswer\(name, readKey\)/);
    expect(route).toMatch(/modules\.length > MAX_OBJECTS/);
    expect(route).toMatch(/verifyRequestAuth\(req\)/);
  });
});

test.describe('the command that stores an answer', () => {
  const actor = { email: 'owner@example.com', now: '2026-10-09T10:00:00.000Z' };

  test('answered: account and time are the server\'s, other answers are kept', () => {
    const kept = { 'add-usage': { state: 'accepted', text: 'No SCMON on this system', account: 'x@y.z', at: 't', basis: 'add-usage-1-abc' } };
    const result = validateProjectCommand(
      { command: 'record-open-question', action: 'add-includes', end: 'answered', text: 'ZINC_A only declares data', basis: 'add-includes-1-xyz', account: 'smuggled@example.com' },
      { openQuestions: kept, openQuestionBases: { 'add-includes': 'add-includes-1-xyz' } },
      actor,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = result.fields.openQuestions as Record<string, { account: string; at: string; state: string; text: string }>;
    expect(Object.keys(result.fields)).toEqual(['openQuestions']);
    expect(stored['add-includes']).toMatchObject({ state: 'answered', account: actor.email, at: actor.now });
    expect(stored['add-usage'].text).toBe('No SCMON on this system');
  });

  test('accepted needs a reason; reopen removes; unknown actions and states are refused', () => {
    expect(checkOpenAnswerBody({ action: 'add-usage', end: 'accepted', text: ' ', basis: 'add-usage-1-x' })).toMatchObject({ ok: false });
    expect(checkOpenAnswerBody({ action: 'grade-it', end: 'answered', text: 'x', basis: 'b' })).toMatchObject({ ok: false });
    expect(checkOpenAnswerBody({ action: 'add-usage', end: 'proven', text: 'x', basis: 'b' })).toMatchObject({ ok: false });
    const reopened = validateProjectCommand(
      { command: 'record-open-question', action: 'add-usage', end: 'reopen' },
      { openQuestions: { 'add-usage': { state: 'accepted', text: 'x', account: 'a', at: 't', basis: 'add-usage-1-x' } } },
      actor,
    );
    expect(reopened.ok && reopened.fields.openQuestions).toEqual({});
  });

  test('a server-only field, written by the command route alone', () => {
    expect(SERVER_ONLY_PROJECT_FIELDS).toContain('openQuestions');
    expect(fieldsWrittenByCommands()).toContain('openQuestions');
    expect(read('firestore.rules')).not.toMatch(/'openQuestions'/);
  });
});

test.describe('what went in exchange (source guards)', () => {
  test('the unused worklist and matrix, the per-view card and fold, and the separate groupers are gone', () => {
    for (const rel of [
      'components/analyze/GapsWorklist.tsx',
      'components/analyze/GapsPrioritization.tsx',
      'components/workspace/NotDeterminedCard.tsx',
      'components/workspace/NotDeterminedFold.tsx',
      'lib/not-determined-plain.ts',
    ]) {
      expect(exists(rel), rel).toBe(false);
    }
    expect(read('lib/business-card.ts')).not.toMatch(/export function groupOpen\b/);
    expect(read('lib/business-card.ts')).toContain('groupConstructs(');
    expect(read('lib/transformation-view.ts')).toContain('groupConstructs(');
  });

  test('the duplicate Analyze facet and the Management "stepped over" figure are gone', () => {
    expect(read('components/analyze/AnalysisAnswer.tsx')).not.toContain('<Facet label="Not assessed">');
    expect(read('lib/management-answers.ts')).not.toContain("label: 'constructs the engine stepped over'");
  });

  test('no grading reads the answers: nothing in the engine, the score or the decision imports this module', () => {
    for (const rel of ['lib/abap/coverage.ts', 'lib/clean-core-score.ts', 'lib/abap/extensibility-router.ts', 'lib/project-decision.ts', 'lib/audit-pack.ts']) {
      if (exists(rel)) expect(read(rel), rel).not.toContain('open-questions');
    }
  });

  test('one grouper: groups by kind, every anchor once, counts add up', () => {
    const kinds = groupConstructs(ALL.items);
    expect(kinds.reduce((n, k) => n + k.count, 0)).toBe(ALL.items.length);
    expect(kinds.find((k) => k.key === 'local-function-call')).toMatchObject({ count: 2, anchors: ['L10', 'L60'] });
  });

  test('the workspace shows one list, and the line everywhere else', () => {
    const shell = read('components/workspace/WorkspaceShell.tsx');
    expect(shell.match(/<OpenQuestions\b/g) ?? []).toHaveLength(1);
    for (const rel of ['components/workspace/FirstLook.tsx', 'components/workspace/BusinessOpening.tsx', 'components/workspace/StandardFitTable.tsx']) {
      expect(read(rel), rel).toContain('<OpenQuestionsLine');
    }
    expect(read('components/workspace/ItAnswers.tsx')).toContain('openQuestionsLine(');
  });
});

test.describe('QA review of dd8e99691c8d', () => {
  const calls = nd([
    item('local-function-call', 10, 'Local function-module call'),
    item('local-function-call', 60, 'Local function-module call'),
    item('file-io', 70, 'Application-server file access'),
  ]);
  const answer = (line: number, name: string) => ({ name, state: 'classicAPI', answer: `SAP lists ${name}.`, line });
  const READING = 'Reading SAP’s catalog for the function-module calls…';

  test('while the catalog loads, the line still counts the other open questions and names the blocking top', () => {
    const q = openQuestions({ open: calls, project: {}, rules: null, catalog: { status: 'loading', answered: [] } });
    expect(openQuestionsLine(q)).toBe(`2 open questions · 1 blocks the decision · top: Choose the target · ${READING}`);
    // Nothing else open: only the reading is said.
    const onlyCalls = openQuestions({
      open: calls,
      project: { s4Deployment: 'public', usageReport: { records: [{}] } },
      rules: null,
      catalog: { status: 'loading', answered: [] },
    });
    expect(openQuestionsLine(onlyCalls)).toBe(READING);
  });

  test('the catalog-adjusted split: answered calls leave the count, the lines stay, the totals follow', () => {
    const one = openQuestions({ open: calls, project: {}, rules: null, catalog: { status: 'ready', answered: [answer(10, 'A')] } });
    const atc = one.groups.find((g) => g.action === 'add-atc')!;
    expect(atc.lines).toHaveLength(3);
    expect(atc.lines.filter((l) => l.catalog)).toHaveLength(1);
    expect(atc.count).toBe(2);
    // atc 2 + target 1 + usage 1; only the target blocks.
    expect([one.open, one.blocking, one.catalogPending]).toEqual([4, 1, false]);
    expect(openQuestionsLine(one)).toBe('4 open questions · 1 blocks the decision · top: Choose the target');
    // Both calls answered, the file access still open: one question left.
    const both = openQuestions({ open: calls, project: {}, rules: null, catalog: { status: 'ready', answered: [answer(10, 'A'), answer(60, 'B')] } });
    expect(both.groups.find((g) => g.action === 'add-atc')!.count).toBe(1);
    expect(both.open).toBe(3);
    // Only calls, all answered: resolved, and out of the open count altogether.
    const resolved = openQuestions({
      open: nd(calls.items.slice(0, 2)),
      project: {},
      rules: null,
      catalog: { status: 'ready', answered: [answer(10, 'A'), answer(60, 'B')] },
    });
    expect(resolved.groups.find((g) => g.action === 'add-atc')!.end).toBe('resolved');
    expect(resolved.open).toBe(2);
  });

  test('code generated at runtime is a limit of the reading, never a "name the call target" question', () => {
    const q = openQuestions({ open: nd([item('generated-code', 12, 'Code generated at runtime')]), project: {}, rules: null });
    expect(q.groups.find((g) => g.action === 'name-call-target')).toBeUndefined();
    expect(q.groups.flatMap((g) => g.lines.map((l) => l.anchor))).not.toContain('L12');
    expect(q.limits).toMatch(/code generated at runtime \(1 place\)/);
    expect(read('docs/design/decisions.md')).toContain('*Name the call target* (dynamic call, runtime table)');
  });

  test('a fully answered rules group counts its rules, not one', () => {
    const g = openQuestions({ open: nd([]), project: {}, rules: { total: 5, open: [] } }).groups.find((x) => x.action === 'confirm-rules')!;
    expect(g.end).toBe('resolved');
    expect(g.count).toBe(5);
    const open = openQuestions({ open: nd([]), project: {}, rules: { total: 5, open: ['BR-001', 'BR-002'] } }).groups.find((x) => x.action === 'confirm-rules')!;
    expect(open.count).toBe(2);
  });

  test('the server derives the same basis the list shows, whatever is imported, answered or looked up', () => {
    const rules = { total: 3, open: ['BR-002'] };
    const bases = openQuestionBases(calls, rules);
    const list = openQuestions({
      open: calls,
      project: { s4Deployment: 'public', usageReport: { records: [{}] }, atcReport: { findings: [] } },
      rules,
      catalog: { status: 'ready', answered: [answer(10, 'A')] },
    });
    expect(bases).toEqual(Object.fromEntries(list.groups.map((g) => [g.action, g.basis])));
    // A group the project does not have has no basis.
    expect(openQuestionBases(nd([item('include-not-read', 20)]), null)).not.toHaveProperty('confirm-rules');
    expect(openQuestionBases(nd([item('include-not-read', 20)]), null)).not.toHaveProperty('add-atc');
  });

  test('an answer is stored only against the basis the server derives for its group', () => {
    const actor = { email: 'owner@example.com', now: '2026-10-09T10:00:00.000Z' };
    const open = nd([item('include-not-read', 20)]);
    const bases = openQuestionBases(open, null);
    const body = (action: string, basis: string) => ({ command: 'record-open-question', action, end: 'answered', text: 'ZINC_A only declares data', basis });
    expect(validateProjectCommand(body('add-includes', bases['add-includes']!), { openQuestionBases: bases }, actor).ok).toBe(true);
    // A basis made up in the browser, for a set this project does not have now.
    const future = basisOf('add-includes', ['L99:include-not-read']);
    expect(validateProjectCommand(body('add-includes', future), { openQuestionBases: bases }, actor)).toMatchObject({ ok: false, status: 409, code: 'open-question-moved' });
    // A group the project does not have now.
    expect(validateProjectCommand(body('name-call-target', basisOf('name-call-target', ['L1:dynamic-invocation'])), { openQuestionBases: bases }, actor)).toMatchObject({ ok: false, status: 409, code: 'open-question-not-open' });
    // A caller that could not derive the questions writes nothing.
    expect(validateProjectCommand(body('add-includes', bases['add-includes']!), {}, actor)).toMatchObject({ ok: false, status: 409, code: 'open-questions-unknown' });
    // The route derives them in its transaction, from the source and the rule answers.
    const route = read('app/api/projects/[projectId]/commands/route.ts');
    expect(route).toContain('openQuestionBases(notDetermined(project as Project), rules)');
    expect(route).toContain('openQuestionBases: questionBases');
    expect(route).toMatch(/rulesStatus\(\{ ok: true, view \}, null\)/);
  });

  test('the function-module lookup fails cleanly on a token error and asks in batches the route accepts', () => {
    const hook = read('hooks/useFunctionModuleAnswers.ts');
    const attempt = hook.slice(hook.indexOf('const attempt = async'));
    expect(attempt.indexOf('try {')).toBeGreaterThan(-1);
    expect(attempt.indexOf('getIdToken()')).toBeGreaterThan(attempt.indexOf('try {'));
    expect(hook).toContain('names.slice(i, i + FUNCTION_MODULE_BATCH)');
    const batch = Number(/FUNCTION_MODULE_BATCH = (\d+)/.exec(hook)?.[1]);
    const max = Number(/const MAX_OBJECTS = (\d+)/.exec(read('app/api/abcd-classify/route.ts'))?.[1]);
    expect(batch).toBeGreaterThan(0);
    expect(batch).toBeLessThanOrEqual(max);
  });
});
