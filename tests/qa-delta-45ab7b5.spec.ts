import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { walkOrder } from '../lib/process-walk';
import { buildWalkGuide } from '../lib/process-walk-guide';
import { buildProcessTour } from '../lib/process-tour';
import { plainSentenceProblem, takeFirstAsk } from '../lib/plain-wording';
import { applyStateChoices, checkStateChoices, isStateEntry } from '../lib/process-states';
import { choiceOf, decisionKindOf } from '../lib/rule-decision-flow';
import { readExample } from './helpers/starter-example-files';

/**
 * QA review of 45ab7b5f6a4c — the confirmed findings on the 3.0.20 walk and
 * rules work, each with a check that fails without its fix. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('0ba57e364e4f — technical steps are no longer said one by one: the tour names them in one engine sentence, never reworded', () => {
  const file = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
  const source = readExample(file).replace(/\r\n/g, '\n');
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
  const model = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: file });
  const guide = buildWalkGuide(source, model, walkOrder(model, null));
  const tour = buildProcessTour(guide, model, null);
  expect(guide.technical.length).toBeGreaterThan(0);
  for (const station of tour.stations) expect(guide.byId[station.id].technical).toBeNull();
  const technicalTexts = new Set(guide.technical.flatMap((g) => g.stepIds).map((id) => guide.byId[id].happens.text));
  for (const station of tour.stations) {
    expect(technicalTexts.has(station.happens.text)).toBe(false);
    if (station.aside) expect(station.aside).toMatch(/^In this part the program also /);
  }
  // The card shows the aside as written: it is not one of the sentences sent for rewording.
  expect(read('components/workspace/ProcessTour.tsx')).toMatch(/\{station\.aside\}/);
});
test('f516bcfb96b5 — the one call is per project, scope and digest, and every digest seen is remembered', () => {
  const asked = new Set<string>();
  expect(takeFirstAsk(asked, 'A', 'walk', 'd1')).toBe(true);
  expect(takeFirstAsk(asked, 'A', 'walk', 'd1')).toBe(false);
  // Another project with the same source and sentences gets its own call.
  expect(takeFirstAsk(asked, 'B', 'walk', 'd1')).toBe(true);
  // A → d2 → back to d1: d1 is not asked again.
  expect(takeFirstAsk(asked, 'A', 'walk', 'd2')).toBe(true);
  expect(takeFirstAsk(asked, 'A', 'walk', 'd1')).toBe(false);
  expect(takeFirstAsk(asked, 'A', 'rules', 'd1')).toBe(true);
});

test('66e67ae1298e — a rewording that keeps the "only" and drops the "not" is refused', () => {
  const engine = 'Only approved suppliers are released, and rejected suppliers are not paid.';
  expect(plainSentenceProblem(engine, 'Only approved suppliers are released, and rejected suppliers are paid.')).toBe('negation-lost');
  expect(plainSentenceProblem(engine, 'Only approved suppliers are released; rejected ones are not paid.')).toBeNull();
  expect(plainSentenceProblem(engine, 'Approved suppliers are released, and rejected suppliers are not paid.')).toBe('negation-lost');
});

test('e42558a925d7 — "Move to SAP standard" with a value source is refused, so it cannot be read as configuration', () => {
  const subjects = { elements: [], rules: ['BR-001'] };
  const conflicting = { subject: 'BR-001', kind: 'rule' as const, state: 'keep' as const, note: null, answer: 'standard' as const, valueSource: { kind: 'customizing' as const, note: null } };
  const checked = checkStateChoices([conflicting], subjects);
  expect(checked.ok).toBe(false);
  if (!checked.ok) expect(checked.code).toBe('source-invalid');
  // The canonical shape stands, and a stored entry of the conflicting shape is not read as an entry.
  expect(checkStateChoices([choiceOf('BR-001', 'standard', '')], subjects).ok).toBe(true);
  const [entry] = applyStateChoices([], [choiceOf('BR-001', 'standard', '')], { account: { uid: 'u', name: 'A' }, confirmedAt: '2026-10-21T10:00:00.000Z', revision: 2 });
  expect(isStateEntry({ ...entry, valueSource: { kind: 'customizing', note: null } })).toBe(false);
  expect(decisionKindOf(entry)).toBe('standard');
});
