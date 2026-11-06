import { expect, test } from './helpers/test';
import { buildNamingPrompt, namingContextOf, validateNamingAnswer } from '../lib/process-naming';
import { formChanged, uncoveredWords } from '../lib/naming-facts';

/**
 * The naming stage with the engine's facts and the checker (concept "Business-Lesbarkeit" H7/H6, owner decision of
 * 06.11.2026; `lib/naming-facts.ts`). Server-free: the prompt and the validation are pure. The model is not called.
 */

const SRC = [
  'REPORT zt_naming.',
  'DATA: gt_mel TYPE STANDARD TABLE OF qmel.',
  'PARAMETERS p_werks TYPE werks_d.',
  'START-OF-SELECTION.',
  "  AUTHORITY-CHECK OBJECT 'I_SWERK' ID 'SWERK' FIELD p_werks ID 'ACTVT' FIELD '03'.",
  '  IF sy-subrc <> 0.',
  "    MESSAGE e001(zpm) WITH 'No authorization for plant' p_werks.",
  '  ENDIF.',
  '  SELECT * FROM qmel INTO TABLE gt_mel UP TO 10 ROWS.',
  '  IF gt_mel IS INITIAL.',
  '    RETURN.',
  '  ENDIF.',
].join('\n');

test('before 3.5.0 the context carries no facts and the prompt is the one of 3.0.21', () => {
  const old = namingContextOf(SRC, { engineVersion: '3.0.21', facts: true });
  expect(old.facts).toBeUndefined();
  expect(buildNamingPrompt(old)).not.toMatch(/facts/);
});

test('from 3.5.0 every node gets the engine\'s facts with ids, and the prompt hands them over', () => {
  const ctx = namingContextOf(SRC, { engineVersion: '3.5.0', facts: true });
  expect(ctx.facts).toBeDefined();
  const all = [...ctx.facts!.values()].flat();
  expect(all.some((f) => f.kind === 'engine' && f.text === 'Authorized?')).toBe(true);
  expect(all.some((f) => f.kind === 'engine' && f.text === 'Any notifications?')).toBe(true);
  expect(all.some((f) => f.kind === 'table' && f.text === 'QMEL = Notification')).toBe(true);
  expect(all.some((f) => f.kind === 'message' && f.text === '“No authorization for plant”')).toBe(true);
  expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
  const prompt = buildNamingPrompt(ctx);
  expect(prompt).toMatch(/"facts":\["<fact id>"\]/);
  expect(prompt).toMatch(/\| facts: \[f\d+\] engine: Authorized\?/);
  // The digest does not change: a naming still applies to the reading it was made for.
  expect(ctx.digest).toBe(namingContextOf(SRC, { engineVersion: '3.0.21', facts: true }).digest);
});

test('H6: a name with a word no fact covers is dropped and counted; a covered one stands', () => {
  const ctx = namingContextOf(SRC, { engineVersion: '3.5.0', facts: true });
  const gateway = ctx.skeleton.nodes.find((n) => [...(ctx.facts!.get(n.id) ?? [])].some((f) => f.text === 'Any notifications?'))!;
  const fact = ctx.facts!.get(gateway.id)![0].id;
  const answer = (name: string, facts: string[] = [fact]) => JSON.stringify({ names: [{ id: gateway.id, name, facts }], lanes: [] });
  expect(validateNamingAnswer(ctx, answer('Are there any notifications?')).names).toHaveLength(1);
  const invented = validateNamingAnswer(ctx, answer('Are there open maintenance notifications?'));
  expect(invented.names).toHaveLength(0);
  expect(invented.discarded.byRule['not-in-facts']).toBe(1);
  const uncited = validateNamingAnswer(ctx, answer('Are there any notifications?', []));
  expect(uncited.discarded.byRule['facts-not-cited']).toBe(1);
  const foreign = validateNamingAnswer(ctx, answer('Are there any notifications?', ['f999']));
  expect(foreign.discarded.byRule['facts-not-cited']).toBe(1);
});

test('the checker: verbs and function words are free, a business noun is not', () => {
  expect(uncoveredWords('Check whether the user is authorized', ['Authorized?'])).toEqual(['user']);
  expect(uncoveredWords('Read the purchase requisitions', ['EBAN = Purchase requisition'])).toEqual([]);
  expect(uncoveredWords('Notify the cost center owner', ['Send mail'])).toEqual(['cost', 'center', 'owner']);
});

test('H6: a name that changes the kind of statement is dropped — a lost question, a "not" turned, a normal end as a stop', () => {
  const ctx = namingContextOf(SRC, { engineVersion: '3.5.0', facts: true });
  const say = (id: string, name: string) => {
    const facts = ctx.facts!.get(id)!.map((f) => f.id);
    return validateNamingAnswer(ctx, JSON.stringify({ names: [{ id, name, facts }], lanes: [] }));
  };
  const gateway = ctx.skeleton.nodes.find((n) => (ctx.facts!.get(n.id) ?? []).some((f) => f.kind === 'engine' && f.text === 'Authorized?'))!;
  expect(say(gateway.id, 'Is this authorized?').names).toHaveLength(1);
  expect(say(gateway.id, 'Is this not authorized?').discarded.byRule['form-changed']).toBe(1);
  expect(say(gateway.id, 'This is authorized').discarded.byRule['form-changed']).toBe(1);
  expect(formChanged('Stops: done', 'end', 'Done')).toBe(true);
  expect(formChanged('Stops: no batch found', 'end-error', 'Stop: no batch found (E024)')).toBe(false);
  expect(formChanged('Is the country not DE and no route?', 'gateway', 'Country DE or route given?')).toBe(true);
});

test('the switch: from 3.5.0 the product hands the facts to the naming stage', () => {
  expect(namingContextOf(SRC, { engineVersion: '3.5.0' }).facts).toBeDefined();
  expect(namingContextOf(SRC, { engineVersion: '3.0.21' }).facts).toBeUndefined();
});
