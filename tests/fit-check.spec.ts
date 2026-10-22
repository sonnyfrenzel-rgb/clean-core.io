import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { findingsOf } from '../lib/it-findings-build';
import { standardTouch, STANDARD_TOUCH_LIMITS } from '../lib/standard-touch';
import {
  FIT_CHECK_ANSWERS,
  fitCheck,
  fitCheckAnswerOf,
  fitCheckChoice,
  standardConditions,
  workshopAgendaBlocks,
  workshopFileName,
} from '../lib/fit-check';
import { applyStateChoices, checkStateChoices, type ProcessStateView } from '../lib/process-states';
import { decisionKindOf } from '../lib/rule-decision-flow';
import { blocksMarkdown, blocksDocxParts } from '../lib/requirements-export';

/**
 * Stage 2 of the fit-to-standard approach — the guided check and the workshop
 * package (owner decision 22.10.2026). Server-free, over a shipped example.
 */
const ROOT = path.resolve(__dirname, '..');
const FILE = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const SOURCE = fs.readFileSync(path.join(ROOT, 'public/starter-examples', FILE), 'utf8');
const findings = findingsOf(SOURCE, FILE, 'public');
const touch = standardTouch(findings);
const ruleIds = [...new Set(findings.rows.flatMap((r) => [...r.rulesCoveringLine, ...r.rulesInRoutine]))];

/** A process-states view with every rule the findings name, and the given entries. */
function viewWith(entries: ProcessStateView['entries'] = [], revision = 0): ProcessStateView {
  const rules = [...new Set([...ruleIds, 'BR-999'])];
  return {
    formatVersion: 1,
    revision,
    baselineRevision: 1,
    subjects: rules.map((id) => ({ subject: id, kind: 'rule', label: `Rule ${id}`, detail: 'What the code checks.', anchor: 'line 10' })),
    entries,
    links: [],
  };
}

test('every answer is a choice the process-states route accepts, and reads back as itself', () => {
  expect(ruleIds.length).toBeGreaterThan(0);
  const view = viewWith();
  const subjects = { elements: [], rules: view.subjects.map((s) => s.subject) };
  for (const answer of FIT_CHECK_ANSWERS) {
    const choice = fitCheckChoice(ruleIds[0], answer);
    expect(checkStateChoices([choice], subjects).ok, answer).toBe(true);
    const [entry] = applyStateChoices([], [choice], { account: { uid: 'u', name: 'Owner' }, confirmedAt: '2026-10-22T10:00:00.000Z', revision: 1 });
    expect(fitCheckAnswerOf(entry), answer).toBe(answer);
  }
  // The mapping onto the need revision, as the owner decided: keep / change / drop / clarify.
  expect(fitCheckChoice('BR-001', 'not-needed').state).toBe('drop');
  expect(fitCheckChoice('BR-001', 'organisational').state).toBe('drop');
  expect(fitCheckChoice('BR-001', 'configuration')).toMatchObject({ state: 'keep', valueSource: { kind: 'customizing' } });
  expect(fitCheckChoice('BR-001', 'key-user').state).toBe('keep');
  expect(fitCheckChoice('BR-001', 'open').state).toBe('clarify');
});

test('the rules beside a departure come first, and an answer from Design is shown as such', () => {
  const entries = applyStateChoices([], [{ subject: 'BR-999', kind: 'rule', state: 'keep', note: null, valueSource: null, appliesTo: [] }], {
    account: { uid: 'u', name: 'Owner' },
    confirmedAt: '2026-10-22T10:00:00.000Z',
    revision: 1,
  });
  const check = fitCheck(touch, findings.rows, viewWith(entries, 1));
  expect(check.revision).toBe(1);
  const firstPlain = check.questions.findIndex((q) => q.departures.length === 0);
  const lastBeside = check.questions.map((q) => q.departures.length > 0).lastIndexOf(true);
  if (firstPlain >= 0 && lastBeside >= 0) expect(lastBeside).toBeLessThan(firstPlain);
  const other = check.questions.find((q) => q.ruleId === 'BR-999')!;
  expect(other.answer).toBeNull();
  expect(other.answeredElsewhere).toBe('Keep');
  expect(other.open).toBe(false);
});

test('open points become conditions of Move to SAP standard; answered ones do not', () => {
  const open = standardConditions(fitCheck(touch, findings.rows, viewWith()));
  const beside = fitCheck(touch, findings.rows, viewWith()).questions.filter((q) => q.departures.length > 0);
  expect(open.length).toBeGreaterThanOrEqual(beside.length);
  if (beside.length > 0) {
    const answered = applyStateChoices([], beside.map((q) => fitCheckChoice(q.ruleId, 'not-needed')), {
      account: { uid: 'u', name: 'Owner' },
      confirmedAt: '2026-10-22T10:00:00.000Z',
      revision: 1,
    });
    const after = standardConditions(fitCheck(touch, findings.rows, viewWith(answered, 1)));
    expect(after.length).toBe(open.length - beside.length);
    // "Open" stays a condition.
    const markedOpen = applyStateChoices([], [fitCheckChoice(beside[0].ruleId, 'open')], {
      account: { uid: 'u', name: 'Owner' },
      confirmedAt: '2026-10-22T10:00:00.000Z',
      revision: 1,
    });
    expect(standardConditions(fitCheck(touch, findings.rows, viewWith(markedOpen, 1))).length).toBe(open.length);
    expect(decisionKindOf(markedOpen[0])).toBe('clarify');
  }
});

test('the workshop agenda carries the limits, the departures with lines and the open questions — in Markdown and Word', () => {
  const blocks = workshopAgendaBlocks({ projectName: 'Order audit', fileName: FILE, date: '2026-10-22', touch, check: fitCheck(touch, findings.rows, viewWith()) });
  const md = blocksMarkdown(blocks);
  expect(md).toContain(STANDARD_TOUCH_LIMITS);
  expect(md).toContain('How it departs from SAP standard');
  expect(md).toMatch(/L\d+/);
  expect(md).toContain('Questions for the workshop');
  expect(md).toContain('BPMN 2.0');
  expect(md).not.toMatch(/\bcovered by\b|\bfits SAP standard\b/i);
  const docx = blocksDocxParts(blocks)['word/document.xml'];
  expect(docx).toContain('Questions for the workshop');
  expect(workshopFileName('Order audit', 'docx')).toBe('Order_audit_fit_to_standard_workshop.docx');
  expect(workshopFileName('Order audit', 'bpmn')).toBe('Order_audit_fit_to_standard_process.bpmn');
});

test('stage 1 and 2 call no model and touch no SAP website', () => {
  for (const rel of ['lib/standard-touch.ts', 'lib/fit-check.ts', 'components/workspace/StandardTouchCard.tsx', 'components/workspace/FitCheckPanel.tsx']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    expect(src, rel).not.toMatch(/gemini|callModel|generateContent|\/api\/gemini/i);
    expect(src, rel).not.toMatch(/https?:\/\/(help|api|me)\.sap\.com|signavio\.com/i);
  }
  // Every stage-1/2 surface shows the limits sentence, visibly.
  expect(fs.readFileSync(path.join(ROOT, 'components/workspace/StandardTouchCard.tsx'), 'utf8')).toContain('{STANDARD_TOUCH_LIMITS}');
  expect(fs.readFileSync(path.join(ROOT, 'components/workspace/FitCheckPanel.tsx'), 'utf8')).toContain('{STANDARD_TOUCH_LIMITS}');
  expect(fs.readFileSync(path.join(ROOT, 'components/workspace/ManagementExecutive.tsx'), 'utf8')).toContain('{STANDARD_TOUCH_LIMITS}');
});
